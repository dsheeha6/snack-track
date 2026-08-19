import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

export function SignInScreen() {
  const { signInWithEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isValidEmail = /\S+@\S+\.\S+/.test(email);

  const handleSend = async () => {
    if (!isValidEmail || status === 'sending') return;
    setStatus('sending');
    setErrorMessage(null);
    const { error } = await signInWithEmail(email.trim());
    if (error) {
      setStatus('error');
      setErrorMessage(error);
    } else {
      setStatus('sent');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          SNACK TRACK
        </ThemedText>

        {status === 'sent' ? (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="subtitle">Check your email</ThemedText>
            <ThemedText themeColor="textSecondary">
              We sent a sign-in link to {email.trim()}. Open it on this device to continue.
            </ThemedText>
            <Pressable onPress={() => setStatus('idle')}>
              <ThemedText type="linkPrimary">Use a different email</ThemedText>
            </Pressable>
          </ThemedView>
        ) : (
          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText themeColor="textSecondary">Sign in with your email — no password needed.</ThemedText>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#9098a3"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              textContentType="emailAddress"
              style={styles.input}
            />
            {status === 'error' && errorMessage && (
              <ThemedText themeColor="text" style={styles.error}>
                {errorMessage}
              </ThemedText>
            )}
            <Pressable
              onPress={handleSend}
              disabled={!isValidEmail || status === 'sending'}
              style={[styles.button, (!isValidEmail || status === 'sending') && styles.buttonDisabled]}
            >
              {status === 'sending' ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <ThemedText style={styles.buttonText}>Send sign-in link</ThemedText>
              )}
            </Pressable>
          </ThemedView>
        )}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  title: {
    textAlign: 'center',
  },
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  input: {
    borderWidth: 1,
    borderColor: '#1E1B1622',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
    color: Brand.ink,
    backgroundColor: Brand.paper,
  },
  button: {
    backgroundColor: Brand.green,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  error: {
    color: Brand.coral,
  },
});
