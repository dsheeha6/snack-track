import * as Linking from 'expo-linking';
import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

type AuthContextValue = {
  session: Session | null;
  loading: boolean;
  signInWithEmail: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

// Pulls access_token/refresh_token out of a Supabase magic-link redirect and
// establishes the session. Supabase puts them in the URL fragment, which
// Linking's query parser doesn't split out, so this is done by hand.
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

  const signInWithEmail = async (email: string) => {
    const redirectTo = Linking.createURL('auth-callback');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, loading, signInWithEmail, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
