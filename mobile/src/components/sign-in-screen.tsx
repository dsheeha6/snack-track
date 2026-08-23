import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';

// Two ways in, code first.
//
// The code flow is the default because it's the fastest and the most robust:
// a short code typed where you already are, no leaving for your inbox and no
// redirect back, which is the leg that breaks on a phone. Password is there
// for people who simply expect it -- PRODUCT.md says don't judge anyone, and
// that includes how they want to log in.
type Mode = 'code' | 'password';
type Step = 'email' | 'code-sent';

export function SignInScreen() {
  const { sendCode, verifyCode, signInWithPassword, signUpWithPassword } = useAuth();
  const [mode, setMode] = useState<Mode>('code');
  const [step, setStep] = useState<Step>('email');
  const [isSignUp, setIsSignUp] = useState(false);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const emailOk = /\S+@\S+\.\S+/.test(email);
  // Supabase's OTP length is configurable (this project is set to 8, not the
  // default 6). Accept the whole documented range rather than hardcoding a
  // number that silently truncates a valid code if the setting ever changes.
  const codeOk = /^\d{6,10}$/.test(code.trim());
  const passwordOk = password.length >= 8;

  const run = async (fn: () => Promise<{ error: string | null }>, onOk?: () => void) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: err } = await fn();
    if (err) setError(err);
    else onOk?.();
    setBusy(false);
  };

  const handleSendCode = () =>
    run(() => sendCode(email), () => {
      setCode('');
      setStep('code-sent');
    });

  const handleVerify = () => run(() => verifyCode(email, code));

  const handlePassword = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    if (isSignUp) {
      const { error: err, needsConfirmation } = await signUpWithPassword(email, password);
      if (err) setError(err);
      else if (needsConfirmation) setNotice(`Confirm your address — we sent a link to ${email.trim()}.`);
    } else {
      const { error: err } = await signInWithPassword(email, password);
      if (err) setError(err);
    }
    setBusy(false);
  };

  const reset = () => {
    setStep('email');
    setCode('');
    setError(null);
    setNotice(null);
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="title" style={styles.title}>
          SNACK TRACK
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          {step === 'code-sent' ? (
            <>
              <ThemedText type="subtitle">Enter your code</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                We sent a code to {email.trim()}. It expires in an hour.
              </ThemedText>
              <TextInput
                value={code}
                onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 10))}
                placeholder="12345678"
                placeholderTextColor="#9098a3"
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoFocus
                style={[styles.input, styles.codeInput]}
              />
              <Feedback error={error} notice={notice} />
              <Button label="Sign in" onPress={handleVerify} disabled={!codeOk} busy={busy} />
              <View style={styles.linkRow}>
                <Pressable onPress={() => run(() => sendCode(email), () => setNotice('Sent another code.'))} hitSlop={8}>
                  <ThemedText type="linkPrimary">Resend code</ThemedText>
                </Pressable>
                <Pressable onPress={reset} hitSlop={8}>
                  <ThemedText type="linkPrimary">Use a different email</ThemedText>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <ThemedText type="small" themeColor="textSecondary">
                {mode === 'code'
                  ? 'Enter your email and we’ll send a sign-in code. No password to remember.'
                  : isSignUp
                    ? 'Create an account with an email and password.'
                    : 'Sign in with your email and password.'}
              </ThemedText>

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

              {mode === 'password' && (
                <TextInput
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Password (8+ characters)"
                  placeholderTextColor="#9098a3"
                  secureTextEntry
                  autoCapitalize="none"
                  textContentType={isSignUp ? 'newPassword' : 'password'}
                  style={styles.input}
                />
              )}

              <Feedback error={error} notice={notice} />

              {mode === 'code' ? (
                <Button label="Send me a code" onPress={handleSendCode} disabled={!emailOk} busy={busy} />
              ) : (
                <Button
                  label={isSignUp ? 'Create account' : 'Sign in'}
                  onPress={handlePassword}
                  disabled={!emailOk || !passwordOk}
                  busy={busy}
                />
              )}

              <View style={styles.linkRow}>
                <Pressable
                  onPress={() => {
                    setMode(mode === 'code' ? 'password' : 'code');
                    setError(null);
                    setNotice(null);
                  }}
                  hitSlop={8}
                >
                  <ThemedText type="linkPrimary">
                    {mode === 'code' ? 'Use a password instead' : 'Email me a code instead'}
                  </ThemedText>
                </Pressable>
                {mode === 'password' && (
                  <Pressable onPress={() => { setIsSignUp(!isSignUp); setError(null); setNotice(null); }} hitSlop={8}>
                    <ThemedText type="linkPrimary">{isSignUp ? 'I have an account' : 'Create one'}</ThemedText>
                  </Pressable>
                )}
              </View>
            </>
          )}
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Feedback({ error, notice }: { error: string | null; notice: string | null }) {
  if (error) return <ThemedText style={styles.error}>{error}</ThemedText>;
  if (notice) return <ThemedText style={styles.notice}>{notice}</ThemedText>;
  return null;
}

function Button({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  busy: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={[styles.button, (disabled || busy) && styles.buttonDisabled]}
    >
      {busy ? <ActivityIndicator color="#ffffff" /> : <ThemedText style={styles.buttonText}>{label}</ThemedText>}
    </Pressable>
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
  codeInput: {
    fontSize: 28,
    letterSpacing: 6,
    textAlign: 'center',
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
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.three,
  },
  error: {
    color: Brand.coral,
  },
  notice: {
    color: Brand.green,
  },
});
