import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EntryRow } from '@/components/entry-row';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import { fetchEntriesRange, type Entry } from '@/lib/entries';
import { localDateString, shiftDate } from '@/lib/meals';
import { supabase } from '@/lib/supabase';

const HISTORY_DAYS = 30; // wide enough window to compute a real streak, not just the 7-day chart
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const BAR_MAX_HEIGHT = 110;

type DayTotal = { date: string; calories: number; protein: number };

function sumByDay(entries: Entry[], dates: string[]): DayTotal[] {
  return dates.map((date) => {
    const dayEntries = entries.filter((e) => e.eaten_on === date);
    return {
      date,
      calories: dayEntries.reduce((a, e) => a + Number(e.calories), 0),
      protein: dayEntries.reduce((a, e) => a + Number(e.protein), 0),
    };
  });
}

// A day counts if it's logged. Today doesn't break the streak just because
// it isn't over yet — same grace the prototype would need if it had this.
function computeStreak(days: DayTotal[]): number {
  let idx = days.length - 1;
  if (days[idx] && days[idx].calories === 0) idx--;
  let streak = 0;
  for (; idx >= 0; idx--) {
    if (days[idx].calories > 0) streak++;
    else break;
  }
  return streak;
}

function prettyDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export function WeekScreen() {
  const today = localDateString();
  const [goal, setGoal] = useState<number | null>(null);
  const [allDays, setAllDays] = useState<DayTotal[]>([]);
  const [entriesByDate, setEntriesByDate] = useState<Map<string, Entry[]>>(new Map());
  const [selected, setSelected] = useState(today);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(() => {
    const from = shiftDate(today, -(HISTORY_DAYS - 1));
    fetchEntriesRange(from, today)
      .then((entries) => {
        const dates = Array.from({ length: HISTORY_DAYS }, (_, i) => shiftDate(from, i));
        setAllDays(sumByDay(entries, dates));
        const byDate = new Map<string, Entry[]>();
        for (const e of entries) {
          const list = byDate.get(e.eaten_on) ?? [];
          list.push(e);
          byDate.set(e.eaten_on, list);
        }
        setEntriesByDate(byDate);
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : 'Could not load the week.'));
  }, [today]);

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('profiles')
      .select('target_calories')
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setLoadError(error.message);
        else setGoal(data.target_calories);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const week = allDays.slice(-7);
  const streak = computeStreak(allDays);
  const goalValue = goal ?? 2000;
  const maxCalories = Math.max(goalValue * 1.15, 1, ...week.map((d) => d.calories));

  const logged = week.filter((d) => d.calories > 0);
  const avgCalories = logged.length ? logged.reduce((a, d) => a + d.calories, 0) / logged.length : 0;
  const avgProtein = logged.length ? logged.reduce((a, d) => a + d.protein, 0) / logged.length : 0;
  const onTarget = logged.filter((d) => Math.abs(d.calories - goalValue) <= goalValue * 0.1).length;
  const weekTotal = week.reduce((a, d) => a + d.calories, 0);

  const selectedEntries = entriesByDate.get(selected) ?? [];

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <ThemedText type="title" style={styles.title}>
            Week
          </ThemedText>

          {loadError && <ThemedText style={styles.error}>{loadError}</ThemedText>}

          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.streakRow}>
              <ThemedText type="smallBold">
                {streak > 0 ? `${streak} day streak` : 'No active streak'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {streak > 0 ? 'days logged in a row' : 'log today to start one'}
              </ThemedText>
            </View>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">last 7 days</ThemedText>
            <View style={styles.chart}>
              <View style={[styles.goalLine, { bottom: (goalValue / maxCalories) * BAR_MAX_HEIGHT }]} />
              {week.map((day) => {
                const height = Math.max((day.calories / maxCalories) * BAR_MAX_HEIGHT, 2);
                const over = day.calories > goalValue;
                const isSelected = day.date === selected;
                const [, , d] = day.date.split('-');
                return (
                  <Pressable key={day.date} style={styles.barColumn} onPress={() => setSelected(day.date)}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {day.calories ? Math.round(day.calories) : ''}
                    </ThemedText>
                    <View
                      style={[
                        styles.bar,
                        {
                          height,
                          backgroundColor: over ? Brand.coral : isSelected ? Brand.green : Brand.lime,
                          opacity: day.date === today ? 1 : isSelected ? 1 : 0.85,
                        },
                      ]}
                    />
                    <ThemedText type="small" themeColor={isSelected ? 'text' : 'textSecondary'}>
                      {DOW[new Date(Number(day.date.slice(0, 4)), Number(day.date.slice(5, 7)) - 1, Number(d)).getDay()]}
                    </ThemedText>
                  </Pressable>
                );
              })}
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              goal {Math.round(goalValue)}
            </ThemedText>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <View style={styles.statsGrid}>
              <Stat label="avg cal/day" value={Math.round(avgCalories).toString()} />
              <Stat label="avg protein" value={`${Math.round(avgProtein)}g`} />
              <Stat label="week total" value={Math.round(weekTotal).toString()} />
              <Stat label="on target" value={`${onTarget}/${logged.length}`} />
            </View>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <ThemedText type="smallBold">{prettyDate(selected)}</ThemedText>
            {selectedEntries.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Nothing logged that day.
              </ThemedText>
            ) : (
              selectedEntries.map((entry) => <EntryRow key={entry.id} entry={entry} />)
            )}
          </ThemedView>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <ThemedText type="title" style={styles.statValue}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
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
    paddingBottom: Spacing.five,
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
  streakRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: BAR_MAX_HEIGHT + 40,
    position: 'relative',
    paddingTop: Spacing.two,
  },
  goalLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Brand.ink,
    opacity: 0.25,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
    justifyContent: 'flex-end',
  },
  bar: {
    width: 20,
    borderRadius: Spacing.one,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  stat: {
    minWidth: '40%',
  },
  statValue: {
    fontSize: 24,
    lineHeight: 28,
  },
});
