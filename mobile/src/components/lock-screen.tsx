import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { biometricLabel } from '@/lib/biometrics';

// Shown over a signed-in session when the biometric lock is on. It prompts
// once automatically -- the whole point is that reopening the app is one glance,
// not a tap then a glance -- and leaves a manual button if that's dismissed.
export function LockScreen() {
  const { unlock, biometricKind, signOut } = useAuth();
  const [failed, setFailed] = useState(false);
  const prompted = useRef(false);

  useEffect(() => {
    // Guard against StrictMode/remount firing two overlapping native prompts,
    // which on iOS makes the second one fail immediately.
    if (prompted.current) return;
    prompted.current = true;
    unlock().then((ok) => setFailed(!ok));
  }, [unlock]);

  const label = biometricLabel(biometricKind);

  const retry = async () => {
    setFailed(false);
    const ok = await unlock();
    setFailed(!ok);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          SNACK TRACK
        </ThemedText>
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="subtitle">Locked</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {failed ? `Unlock with ${label} to pick up where you left off.` : `Waiting for ${label}…`}
          </ThemedText>
          <Pressable onPress={retry} style={styles.button}>
            <ThemedText style={styles.buttonText}>Unlock</ThemedText>
          </Pressable>
          <Pressable onPress={signOut} hitSlop={8} style={styles.signOut}>
            <ThemedText type="linkPrimary">Sign out instead</ThemedText>
          </Pressable>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  title: { textAlign: 'center' },
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  button: {
    backgroundColor: Brand.green,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  signOut: {
    alignItems: 'center',
  },
});
