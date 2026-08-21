import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddEntryModal } from '@/components/add-entry-modal';
import { EntryRow } from '@/components/entry-row';
import { MacroBar } from '@/components/macro-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { addEntry, deleteEntry, fetchEntries, type Entry, type NewEntry } from '@/lib/entries';
import { guessMealSlot, localDateString, MEAL_COLORS, MEAL_LABELS, MEAL_SLOTS, type MealSlot } from '@/lib/meals';
import { supabase } from '@/lib/supabase';

type Profile = {
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
};

type Totals = { calories: number; protein: number; carbs: number; fat: number };

const EMPTY_TOTALS: Totals = { calories: 0, protein: 0, carbs: 0, fat: 0 };

function sumEntries(entries: Entry[]): Totals {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + Number(e.calories),
      protein: acc.protein + Number(e.protein),
      carbs: acc.carbs + Number(e.carbs),
      fat: acc.fat + Number(e.fat),
    }),
    EMPTY_TOTALS
  );
}

export function TodayScreen() {
  const { session, signOut } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalMeal, setModalMeal] = useState<MealSlot | null>(null);

  const eatenOn = localDateString();

  const loadEntries = useCallback(() => {
    fetchEntries(eatenOn)
      .then(setEntries)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load today.'));
  }, [eatenOn]);

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

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const totals = sumEntries(entries);

  const handleSave = async (entry: NewEntry) => {
    const saved = await addEntry(entry);
    setEntries((prev) => [...prev, saved]);
    setModalMeal(null);
  };

  const handleDelete = async (id: string) => {
    const previous = entries;
    setEntries((prev) => prev.filter((e) => e.id !== id));
    try {
      await deleteEntry(id);
    } catch (e) {
      setEntries(previous);
      setLoadError(e instanceof Error ? e.message : 'Could not delete that entry.');
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="small" themeColor="textSecondary">
            Signed in as {session?.user.email}
          </ThemedText>
          <ThemedText type="title" style={styles.title}>
            Today
          </ThemedText>

          {loadError && <ThemedText style={styles.error}>{loadError}</ThemedText>}

          {profile ? (
            <>
              <ThemedView type="backgroundElement" style={styles.card}>
                <MacroBar label="calories" current={totals.calories} target={profile.target_calories} unit="" />
                <MacroBar
                  label="protein"
                  current={totals.protein}
                  target={profile.target_protein}
                  unit="g"
                  color={Brand.coral}
                />
                <MacroBar
                  label="carbs"
                  current={totals.carbs}
                  target={profile.target_carbs}
                  unit="g"
                  color={Brand.yellow}
                />
                <MacroBar label="fat" current={totals.fat} target={profile.target_fat} unit="g" color={Brand.teal} />
              </ThemedView>

              {MEAL_SLOTS.map((slot) => {
                const mealEntries = entries.filter((e) => e.meal === slot);
                return (
                  <ThemedView key={slot} type="backgroundElement" style={styles.card}>
                    <ThemedView style={styles.mealHeader}>
                      <ThemedView style={[styles.mealDot, { backgroundColor: MEAL_COLORS[slot] }]} />
                      <ThemedText type="smallBold" style={styles.mealTitle}>
                        {MEAL_LABELS[slot]}
                      </ThemedText>
                      <Pressable onPress={() => setModalMeal(slot)} hitSlop={8}>
                        <ThemedText type="linkPrimary">+ add</ThemedText>
                      </Pressable>
                    </ThemedView>
                    {mealEntries.length === 0 ? (
                      <ThemedText type="small" themeColor="textSecondary">
                        Nothing here yet.
                      </ThemedText>
                    ) : (
                      mealEntries.map((entry) => <EntryRow key={entry.id} entry={entry} onDelete={handleDelete} />)
                    )}
                  </ThemedView>
                );
              })}
            </>
          ) : (
            <ThemedText themeColor="textSecondary">Loading your targets…</ThemedText>
          )}

          <Pressable onPress={signOut} style={styles.signOut}>
            <ThemedText type="linkPrimary">Sign out</ThemedText>
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      <AddEntryModal
        visible={modalMeal !== null}
        defaultMeal={modalMeal ?? guessMealSlot()}
        eatenOn={eatenOn}
        onClose={() => setModalMeal(null)}
        onSave={handleSave}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
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
  mealHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: 'transparent',
  },
  mealDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  mealTitle: {
    flex: 1,
  },
  error: {
    color: Brand.coral,
  },
  signOut: {
    alignItems: 'center',
    marginTop: Spacing.three,
    marginBottom: Spacing.four,
  },
});
