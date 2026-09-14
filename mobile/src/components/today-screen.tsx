import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddEntryModal } from '@/components/add-entry-modal';
import { EntryRow } from '@/components/entry-row';
import { MacroBar } from '@/components/macro-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WaterCard } from '@/components/water-card';
import { Brand, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { biometricLabel } from '@/lib/biometrics';
import { addEntries, addEntry, deleteEntry, fetchEntries, type Entry, type NewEntry } from '@/lib/entries';
import { guessMealSlot, localDateString, MEAL_COLORS, MEAL_LABELS, MEAL_SLOTS, type MealSlot } from '@/lib/meals';
import { supabase } from '@/lib/supabase';
import {
  addWater,
  deleteWater,
  DEFAULT_TARGET_OUNCES,
  fetchWater,
  sumOunces,
  updateWaterTarget,
  type WaterEntry,
} from '@/lib/water';

type Profile = {
  target_calories: number;
  target_protein: number;
  target_carbs: number;
  target_fat: number;
  target_water_oz: number;
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
  const { session, signOut, biometricKind, biometricEnabled, setBiometricEnabled } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [water, setWater] = useState<WaterEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalMeal, setModalMeal] = useState<MealSlot | null>(null);

  const eatenOn = localDateString();

  const loadEntries = useCallback(() => {
    fetchEntries(eatenOn)
      .then(setEntries)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load today.'));
  }, [eatenOn]);

  const loadWater = useCallback(() => {
    fetchWater(eatenOn)
      .then(setWater)
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load your water.'));
  }, [eatenOn]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('profiles')
      .select('target_calories, target_protein, target_carbs, target_fat, target_water_oz')
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
    loadWater();
  }, [loadEntries, loadWater]);

  const totals = sumEntries(entries);
  const waterOunces = sumOunces(water);
  const waterTarget = Number(profile?.target_water_oz ?? DEFAULT_TARGET_OUNCES);

  const handleSave = async (entry: NewEntry) => {
    const saved = await addEntry(entry);
    setEntries((prev) => [...prev, saved]);
    setModalMeal(null);
  };

  // One sentence usually becomes several rows. Not optimistic like water: these
  // rows carry real numbers the user is about to act on, and showing a meal as
  // logged before the insert lands would mean silently dropping food from the
  // day's totals if it failed.
  const handleSaveMany = async (newEntries: NewEntry[]) => {
    const saved = await addEntries(newEntries);
    setEntries((prev) => [...prev, ...saved]);
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

  // Optimistic, like handleDelete: a water tap should feel instant, and the
  // row it writes is trivial to roll back if the insert fails.
  const handleAddWater = async (ounces: number) => {
    const pending: WaterEntry = {
      id: `pending-${Date.now()}`,
      logged_on: eatenOn,
      ounces,
      created_at: new Date().toISOString(),
    };
    setWater((prev) => [...prev, pending]);
    try {
      const saved = await addWater(eatenOn, ounces);
      setWater((prev) => prev.map((w) => (w.id === pending.id ? saved : w)));
    } catch (e) {
      setWater((prev) => prev.filter((w) => w.id !== pending.id));
      setLoadError(e instanceof Error ? e.message : 'Could not save that water.');
    }
  };

  const handleUndoWater = async () => {
    const last = water[water.length - 1];
    // Nothing to undo, or the last tap hasn't come back from the insert yet —
    // deleting by a pending id would 404 and roll back a tap that did save.
    if (!last || last.id.startsWith('pending-')) return;
    const previous = water;
    setWater((prev) => prev.filter((w) => w.id !== last.id));
    try {
      await deleteWater(last.id);
    } catch (e) {
      setWater(previous);
      setLoadError(e instanceof Error ? e.message : 'Could not undo that.');
    }
  };

  const handleWaterTarget = async (ounces: number) => {
    const previous = profile;
    setProfile((p) => (p ? { ...p, target_water_oz: ounces } : p));
    try {
      await updateWaterTarget(ounces);
    } catch (e) {
      setProfile(previous);
      setLoadError(e instanceof Error ? e.message : 'Could not save your water goal.');
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

              <WaterCard
                ounces={waterOunces}
                target={waterTarget}
                onAdd={handleAddWater}
                onUndo={water.length > 0 ? handleUndoWater : undefined}
                onChangeTarget={handleWaterTarget}
              />

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

          {biometricKind !== 'none' && (
            <Pressable
              onPress={() => setBiometricEnabled(!biometricEnabled)}
              style={styles.signOut}
              hitSlop={8}
            >
              <ThemedText type="linkPrimary">
                {biometricEnabled
                  ? `Turn off ${biometricLabel(biometricKind)} lock`
                  : `Lock with ${biometricLabel(biometricKind)}`}
              </ThemedText>
            </Pressable>
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
        onSaveMany={handleSaveMany}
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
