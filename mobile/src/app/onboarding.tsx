import { Redirect } from 'expo-router';
import { StyleSheet } from 'react-native';

import { OnboardingFlow } from '@/components/onboarding/onboarding-flow';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAuth } from '@/lib/auth-context';

export default function OnboardingRoute() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Loading…</ThemedText>
      </ThemedView>
    );
  }

  // Nothing here can be answered without a user to save it against.
  if (!session) return <Redirect href="/" />;

  return <OnboardingFlow />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
