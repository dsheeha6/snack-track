import { Tabs } from 'expo-router';

import { Brand } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function TabsLayout() {
  const theme = useTheme();
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
