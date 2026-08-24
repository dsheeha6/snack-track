import { Redirect } from 'expo-router';
import { StyleSheet } from 'react-native';

import { useAuth } from '@/lib/auth-context';
import { SignInScreen } from '@/components/sign-in-screen';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';

export default function IndexRoute() {
  const { session, loading, onboarded } = useAuth();

  // `onboarded === null` while signed in means the check is still in flight.
  // Waiting for it here is what keeps a new account from seeing Today's
  // schema-default targets for a frame before onboarding takes over.
  if (loading || (session && onboarded === null)) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Loading…</ThemedText>
      </ThemedView>
    );
  }

  if (!session) return <SignInScreen />;

  return <Redirect href={onboarded ? '/(tabs)/today' : '/onboarding'} />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
