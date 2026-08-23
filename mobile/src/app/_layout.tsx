import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
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

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AuthProvider>
        <LockGate>
          <Stack screenOptions={{ headerShown: false }} />
        </LockGate>
      </AuthProvider>
    </ThemeProvider>
  );
}
