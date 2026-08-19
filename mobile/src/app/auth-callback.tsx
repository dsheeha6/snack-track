import { Redirect } from 'expo-router';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth-context';

// Landing page for the Supabase magic-link redirect. AuthProvider (mounted at
// the root layout) picks up the token from the URL and calls setSession; once
// that resolves, session flips and this redirects into the app.
export default function AuthCallbackRoute() {
  const { session, loading } = useAuth();

  if (!loading && session) {
    return <Redirect href="/" />;
  }

  return (
    <ThemedView style={styles.container}>
      <ThemedText>Signing you in…</ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
