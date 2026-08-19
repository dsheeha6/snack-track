import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { supabase } from '@/lib/supabase';

type Profile = {
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
};

export function TodayScreen() {
  const { session, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('profiles')
      .select('target_calories, target_protein, target_carbs, target_fat')
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setLoadError(error.message);
        else setProfile(data);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedText type="small" themeColor="textSecondary">
          Signed in as {session?.user.email}
        </ThemedText>
        <ThemedText type="title" style={styles.title}>
          Today
        </ThemedText>

        <ThemedView type="backgroundElement" style={styles.card}>
          {loadError ? (
            <ThemedText style={styles.error}>Couldn't load your targets: {loadError}</ThemedText>
          ) : profile ? (
            <>
              <ThemedText type="subtitle">0 / {profile.target_calories} cal</ThemedText>
              <ThemedText themeColor="textSecondary">
                P {profile.target_protein}g · C {profile.target_carbs}g · F {profile.target_fat}g
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Nothing logged yet today.
              </ThemedText>
            </>
          ) : (
            <ThemedText themeColor="textSecondary">Loading your targets…</ThemedText>
          )}
        </ThemedView>

        <Pressable onPress={signOut} style={styles.signOut}>
          <ThemedText type="linkPrimary">Sign out</ThemedText>
        </Pressable>
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
    gap: Spacing.three,
  },
  title: {
    fontSize: 32,
    lineHeight: 40,
  },
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  error: {
    color: Brand.coral,
  },
  signOut: {
    alignItems: 'center',
    marginTop: Spacing.three,
  },
});
