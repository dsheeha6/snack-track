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
  const handledUrls = useRef(new Set<string>());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    const handleUrl = async (url: string) => {
      if (handledUrls.current.has(url)) return;
      handledUrls.current.add(url);
      const params = sessionParamsFromUrl(url);
      if (params) {
        await supabase.auth.setSession(params);
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
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: 'email',
    });
    return { error: error?.message ?? null };
  };

  const signInWithPassword = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error: error?.message ?? null };
  };

  const signUpWithPassword = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    // With email confirmation on, signUp returns a user but no session -- the
    // caller has to say "check your email" rather than assume it worked.
    return {
      error: error?.message ?? null,
      needsConfirmation: !error && !data.session,
    };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
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
