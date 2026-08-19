import { useAuth } from '@/lib/auth-context';
import { SignInScreen } from '@/components/sign-in-screen';
import { TodayScreen } from '@/components/today-screen';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { StyleSheet } from 'react-native';

export default function IndexRoute() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ThemedText>Loading…</ThemedText>
      </ThemedView>
    );
  }

  return session ? <TodayScreen /> : <SignInScreen />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
