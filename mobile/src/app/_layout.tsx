import { DarkTheme, DefaultTheme, Stack, ThemeProvider, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';

import { LockScreen } from '@/components/lock-screen';
import { AuthProvider, useAuth } from '@/lib/auth-context';

// The lock is applied here rather than on the index route so it covers every
// route. Gating only `/` would let a deep link or a restored navigation state
// land straight on /(tabs)/today with the lock never shown.
function LockGate({ children }: { children: React.ReactNode }) {
  const { session, locked } = useAuth();
  if (session && locked) return <LockScreen />;
  return <>{children}</>;
}

// Same reasoning as LockGate: gating only `/` would let a deep link or a
// restored navigation state land on /(tabs)/today with onboarding never shown.
// This one redirects from an effect rather than rendering <Redirect>, because
// the navigator has to exist before anything can navigate.
function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { session, onboarded } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (session && onboarded === false && pathname !== '/onboarding') {
      router.replace('/onboarding');
    }
  }, [session, onboarded, pathname, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <LockGate>
          <OnboardingGate>
            <Stack screenOptions={{ headerShown: false }} />
          </OnboardingGate>
        </LockGate>
      </AuthProvider>
    </ThemeProvider>
  );
}
