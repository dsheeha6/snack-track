import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import {
  getBiometricKind,
  isBiometricLockEnabled,
  promptBiometric,
  setBiometricLockEnabled,
  type BiometricKind,
} from '@/lib/biometrics';
import { fetchHasOnboarded } from '@/lib/onboarding';
import { supabase } from '@/lib/supabase';

type Result = { error: string | null };

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  /** Sends a 6-digit code to the address. No redirect involved. */
  sendCode: (email: string) => Promise<Result>;
  /** Exchanges that code for a session. */
  verifyCode: (email: string, token: string) => Promise<Result>;
  signInWithPassword: (email: string, password: string) => Promise<Result>;
  signUpWithPassword: (email: string, password: string) => Promise<Result & { needsConfirmation: boolean }>;
  signOut: () => Promise<void>;
  /** Whether onboarding is finished. null while it's still being checked, or signed out. */
  onboarded: boolean | null;
  /** Called by the onboarding flow once it has saved, so the gate stops redirecting. */
  markOnboarded: () => void;
  // Biometric lock
  biometricKind: BiometricKind;
  biometricEnabled: boolean;
  locked: boolean;
  setBiometricEnabled: (enabled: boolean) => Promise<void>;
  unlock: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Pulls access_token/refresh_token out of a Supabase magic-link redirect and
// establishes the session. Supabase puts them in the URL fragment, which
// Linking's query parser doesn't split out, so this is done by hand.
//
// Kept even though the code flow is now the default: existing magic links and
// the OAuth providers still come back this way.
function sessionParamsFromUrl(url: string): { access_token: string; refresh_token: string } | null {
  const fragment = url.split('#')[1];
  if (!fragment) return null;
  const params = new URLSearchParams(fragment);
  const access_token = params.get('access_token');
  const refresh_token = params.get('refresh_token');
  if (!access_token || !refresh_token) return null;
  return { access_token, refresh_token };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [biometricKind, setBiometricKind] = useState<BiometricKind>('none');
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [locked, setLocked] = useState(false);
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const handledUrls = useRef(new Set<string>());
  // Mirrors `session` for synchronous reads inside the auth-state-change
  // listener below, which closes over state from its first render only.
  const hasSessionRef = useRef(false);
  // True only while *this tab* has just asked Supabase for a session (code
  // verified, password submitted, or a magic-link/OAuth redirect handled).
  // supabase-js also syncs sessions across tabs (refreshed tokens get
  // rewritten to the shared localStorage/BroadcastChannel), so a session can
  // arrive here that this tab never asked for -- e.g. a stale signed-in
  // preview tab left open elsewhere refreshing its token after this tab
  // signed out. The sign-in screen is authoritative: while this tab believes
  // it's signed out, a session it didn't request is treated as stale litter,
  // not a login.
  const expectingSessionRef = useRef(false);

  const applySession = (s: Session | null) => {
    hasSessionRef.current = !!s;
    setSession(s);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      applySession(data.session);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
      // INITIAL_SESSION fires the moment this listener is registered, with
      // whatever session was already in storage -- that's a normal cold-start
      // restore, not a login, and must never be second-guessed here or every
      // app reopen would sign the user straight back out.
      if (event !== 'INITIAL_SESSION' && newSession && !hasSessionRef.current && !expectingSessionRef.current) {
        supabase.auth.signOut({ scope: 'global' });
        return;
      }
      applySession(newSession);
    });

    const handleUrl = async (url: string) => {
      if (handledUrls.current.has(url)) return;
      handledUrls.current.add(url);
      const params = sessionParamsFromUrl(url);
      if (params) {
        expectingSessionRef.current = true;
        await supabase.auth.setSession(params);
        expectingSessionRef.current = false;
      }
    };

    // On web, expo-router's client-side routing can consume the URL before
    // Linking.getInitialURL() sees the fragment, so read window.location
    // directly rather than relying on the native-oriented Linking API.
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.location.hash) {
        handleUrl(window.location.href);
      }
    } else {
      Linking.getInitialURL().then((url) => {
        if (url) handleUrl(url);
      });
    }
    const linkSubscription = Linking.addEventListener('url', ({ url }) => handleUrl(url));

    return () => {
      authListener.subscription.unsubscribe();
      linkSubscription.remove();
    };
  }, []);

  // Read the device's capability and the saved preference once at startup. If
  // the lock is on and a session already exists, the app opens locked.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getBiometricKind(), isBiometricLockEnabled()]).then(([kind, enabled]) => {
      if (cancelled) return;
      setBiometricKind(kind);
      const usable = enabled && kind !== 'none';
      setBiometricEnabledState(usable);
      if (usable) setLocked(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-lock when the app goes to the background, which is the only thing that
  // makes the lock worth having -- otherwise it only ever runs on cold start.
  useEffect(() => {
    if (!biometricEnabled) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') setLocked(true);
    });
    return () => sub.remove();
  }, [biometricEnabled]);

  const sendCode = async (email: string) => {
    // No emailRedirectTo: the code flow never leaves the app, which is what
    // makes it immune to the redirect-allowlist problem the link flow hits.
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    return { error: error?.message ?? null };
  };

  const verifyCode = async (email: string, token: string) => {
    expectingSessionRef.current = true;
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'email',
    });
    expectingSessionRef.current = false;
    return { error: error?.message ?? null };
  };

  const signInWithPassword = async (email: string, password: string) => {
    expectingSessionRef.current = true;
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    expectingSessionRef.current = false;
    return { error: error?.message ?? null };
  };

  const signUpWithPassword = async (email: string, password: string) => {
    expectingSessionRef.current = true;
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    expectingSessionRef.current = false;
    // With email confirmation on, signUp returns a user but no session -- the
    // caller has to say "check your email" rather than assume it worked.
    return {
      error: error?.message ?? null,
      needsConfirmation: !error && !data.session,
    };
  };

  // Keyed on the user id rather than the session object so a routine token
  // refresh doesn't re-query this on a timer.
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId) {
      setOnboarded(null);
      return;
    }
    let cancelled = false;
    fetchHasOnboarded()
      .then((ok) => {
        if (!cancelled) setOnboarded(ok);
      })
      .catch(() => {
        // A failed check must not lock someone out of their own app. Assume
        // onboarded; the Today screen surfaces the real error.
        if (!cancelled) setOnboarded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const markOnboarded = useCallback(() => setOnboarded(true), []);

  const signOut = async () => {
    // Global scope: revokes every session for this user, not just the local
    // one -- otherwise a stale tab holding the same session keeps working
    // (and can even resurrect it into this tab on its next token refresh).
    await supabase.auth.signOut({ scope: 'global' });
    setLocked(false);
  };

  const unlock = useCallback(async () => {
    const ok = await promptBiometric(biometricKind);
    if (ok) setLocked(false);
    return ok;
  }, [biometricKind]);

  const setBiometricEnabled = useCallback(
    async (enabled: boolean) => {
      // Turning it on requires passing the check once, so nobody can enable a
      // lock they can't themselves open.
      if (enabled && !(await promptBiometric(biometricKind))) return;
      await setBiometricLockEnabled(enabled);
      setBiometricEnabledState(enabled);
      if (!enabled) setLocked(false);
    },
    [biometricKind]
  );

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        sendCode,
        verifyCode,
        signInWithPassword,
        signUpWithPassword,
        signOut,
        onboarded,
        markOnboarded,
        biometricKind,
        biometricEnabled,
        locked,
        setBiometricEnabled,
        unlock,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
