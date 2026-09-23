import { Redirect, Tabs } from 'expo-router';

import { Brand } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';

export default function TabsLayout() {
  const theme = useTheme();
  const { session, loading } = useAuth();

  // index.tsx is the only other gate, and it only runs on a cold start at "/".
  // Without this, landing on /today directly (a web reload, or the phone
  // resuming on the tab) after the session ended -- e.g. a global sign-out
  // from another device -- rendered Today with no user: every query went out
  // as anon, RLS returned no profile row, and .single() surfaced "Cannot
  // coerce the result to a single JSON object" (2026-09-22).
  if (loading) return null;
  if (!session) return <Redirect href="/" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Brand.green,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.backgroundElement },
        // With no icon supplied, React Navigation renders a placeholder that
        // shows as a "⏷" glyph on web and reads as a broken asset. Two text
        // labels are enough for two tabs, and installing a whole icon font for
        // two glyphs isn't worth it -- so suppress the icon slot explicitly.
        tabBarIcon: () => null,
        tabBarIconStyle: { display: 'none' },
      }}
    >
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="week" options={{ title: 'Week' }} />
    </Tabs>
  );
}
