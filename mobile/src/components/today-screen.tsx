import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddEntryModal } from '@/components/add-entry-modal';
import { DateStepper } from '@/components/date-stepper';
import { EntryRow } from '@/components/entry-row';
import { MacroBar } from '@/components/macro-bar';
import { NutrientSheet } from '@/components/nutrient-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { WaterCard } from '@/components/water-card';
import { Brand, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { biometricLabel } from '@/lib/biometrics';
import { addEntries, addEntry, deleteEntry, fetchEntries, type Entry, type NewEntry } from '@/lib/entries';
import { dayLabel, guessMealSlot, localDateString, MEAL_COLORS, MEAL_LABELS, MEAL_SLOTS, type MealSlot } from '@/lib/meals';
import {
  fiberTargetFor,
  NUTRIENT_INFO,
  readNutrientPrefs,
  saveNutrientPrefs,
  sugarTargetFor,
  type NutrientKey,
  type NutrientPrefs,
} from '@/lib/nutrients';
import { supabase } from '@/lib/supabase';
import type { Goal } from '@/lib/targets';
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
  goal: Goal | null;
  food_preferences: unknown;
};

type Totals = Record<NutrientKey, number>;

const EMPTY_TOTALS: Totals = { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugar: 0 };

// Sugar/fiber are null on manual rows and on anything logged before
// 2026-09-25; they count as 0 here, and `missing` says how many rows that was
// so the card can say so rather than quietly under-reporting.
function sumEntries(entries: Entry[]): Totals & { missingFiber: number; missingSugar: number } {
  return entries.reduce(
    (acc, e) => ({
      calories: acc.calories + Number(e.calories),
      protein: acc.protein + Number(e.protein),
      carbs: acc.carbs + Number(e.carbs),
      fat: acc.fat + Number(e.fat),
      fiber: acc.fiber + Number(e.fiber ?? 0),
      sugar: acc.sugar + Number(e.sugar ?? 0),
      missingFiber: acc.missingFiber + (e.fiber == null ? 1 : 0),
      missingSugar: acc.missingSugar + (e.sugar == null ? 1 : 0),
    }),
    { ...EMPTY_TOTALS, missingFiber: 0, missingSugar: 0 }
  );
}

// Only mentioned when the nutrient is on screen and something was actually
// missing it — plain information, nothing for the user to fix.
function missingNote(shown: NutrientKey[], missingFiber: number, missingSugar: number): string | null {
  const names = [
    shown.includes('fiber') && missingFiber > 0 ? 'fiber' : null,
    shown.includes('sugar') && missingSugar > 0 ? 'sugar' : null,
  ].filter(Boolean);
  if (names.length === 0) return null;
  const n = Math.max(shown.includes('fiber') ? missingFiber : 0, shown.includes('sugar') ? missingSugar : 0);
  return `${n} ${n === 1 ? 'item has' : 'items have'} no ${names.join(' or ')} info, so ${names.length === 1 ? 'that total' : 'those totals'} may read a little low.`;
}

const BAR_COLORS: Partial<Record<NutrientKey, string>> = {
  protein: Brand.coral,
  carbs: Brand.yellow,
  fat: Brand.teal,
  fiber: Brand.green,
  sugar: Brand.pink,
};

export function TodayScreen() {
  const { session, signOut, biometricKind, biometricEnabled, setBiometricEnabled } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [water, setWater] = useState<WaterEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [modalMeal, setModalMeal] = useState<MealSlot | null>(null);
  const [nutrientSheetKey, setNutrientSheetKey] = useState(0);
  const [nutrientSheetOpen, setNutrientSheetOpen] = useState(false);
  const [nutrientSaving, setNutrientSaving] = useState(false);
  const [nutrientError, setNutrientError] = useState<string | null>(null);

  // null means "follow today", so leaving the app open past midnight still
  // rolls over to the new day. Only a day the user stepped back to is pinned.
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const today = localDateString();
  const eatenOn = pickedDate ?? today;
  const viewDate = (date: string) => setPickedDate(date === today ? null : date);

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
      .select('target_calories, target_protein, target_carbs, target_fat, target_water_oz, goal, food_preferences')
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

  const nutrientPrefs = profile ? readNutrientPrefs(profile.food_preferences, profile.goal) : null;

  const targetFor = (k: NutrientKey, p: Profile, prefs: NutrientPrefs): number => {
    switch (k) {
      case 'calories':
        return p.target_calories;
      case 'protein':
        return p.target_protein;
      case 'carbs':
        return p.target_carbs;
      case 'fat':
        return p.target_fat;
      case 'fiber':
        return fiberTargetFor(prefs, p.target_calories);
      case 'sugar':
        return sugarTargetFor(prefs, p.target_calories);
    }
  };

  const openNutrientSheet = () => {
    setNutrientSheetKey((k) => k + 1);
    setNutrientError(null);
    setNutrientSheetOpen(true);
  };

  // Not optimistic: the sheet stays open with its own error if the save fails,
  // so nothing the user just chose is lost.
  const handleSaveNutrients = async (prefs: NutrientPrefs) => {
    if (!profile) return;
    setNutrientSaving(true);
    setNutrientError(null);
    try {
      const saved = await saveNutrientPrefs(prefs, profile.food_preferences);
      setProfile((p) => (p ? { ...p, food_preferences: saved } : p));
      setNutrientSheetOpen(false);
    } catch (e) {
      setNutrientError(e instanceof Error ? e.message : 'Could not save what you track.');
    } finally {
      setNutrientSaving(false);
    }
  };

  const handleSave = async (entry: NewEntry) => {
    const saved = await addEntry(entry);
    showSaved([saved]);
    setModalMeal(null);
  };

  // The sheet lets you pick a different day than the one on screen. Follow the
  // food there, so what you just logged is what you're looking at; otherwise
  // it would save to Thursday while Friday stays open and looks unchanged.
  const showSaved = (saved: Entry[]) => {
    const day = saved[0]?.eaten_on;
    if (day && day !== eatenOn) {
      setEntries([]);
      viewDate(day);
    } else {
      setEntries((prev) => [...prev, ...saved]);
    }
  };

  // One sentence usually becomes several rows. Not optimistic like water: these
  // rows carry real numbers the user is about to act on, and showing a meal as
  // logged before the insert lands would mean silently dropping food from the
  // day's totals if it failed.
  const handleSaveMany = async (newEntries: NewEntry[]) => {
    const saved = await addEntries(newEntries);
    showSaved(saved);
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
            {dayLabel(eatenOn, today)}
          </ThemedText>
          <DateStepper date={eatenOn} onChange={viewDate} max={today} />

          {loadError && <ThemedText style={styles.error}>{loadError}</ThemedText>}

          {profile && nutrientPrefs ? (
            <>
              <ThemedView type="backgroundElement" style={styles.card}>
                {nutrientPrefs.shown.map((k) => (
                  <MacroBar
                    key={k}
                    label={NUTRIENT_INFO[k].label}
                    current={totals[k]}
                    target={targetFor(k, profile, nutrientPrefs)}
                    unit={NUTRIENT_INFO[k].unit}
                    color={BAR_COLORS[k]}
                  />
                ))}
                {missingNote(nutrientPrefs.shown, totals.missingFiber, totals.missingSugar) && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {missingNote(nutrientPrefs.shown, totals.missingFiber, totals.missingSugar)}
                  </ThemedText>
                )}
                <Pressable onPress={openNutrientSheet} hitSlop={8} style={styles.customize}>
                  <ThemedText type="linkPrimary">choose what you track</ThemedText>
                </Pressable>
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

      {profile && nutrientPrefs && (
        <NutrientSheet
          key={nutrientSheetKey}
          visible={nutrientSheetOpen}
          prefs={nutrientPrefs}
          goal={profile.goal}
          calorieTarget={profile.target_calories}
          saving={nutrientSaving}
          error={nutrientError}
          onClose={() => setNutrientSheetOpen(false)}
          onSave={handleSaveNutrients}
        />
      )}
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
  customize: {
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
  },
  signOut: {
    alignItems: 'center',
    marginTop: Spacing.three,
    marginBottom: Spacing.four,
  },
});
