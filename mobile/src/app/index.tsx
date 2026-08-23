import { Redirect } from 'expo-router';
import { StyleSheet } from 'react-native';

import { useAuth } from '@/lib/auth-context';
import { SignInScreen } from '@/components/sign-in-screen';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';

export default function IndexRoute() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Loading…</ThemedText>
      </ThemedView>
    );
  }

  return session ? <Redirect href="/(tabs)/today" /> : <SignInScreen />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
