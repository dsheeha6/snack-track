import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DateStepper } from '@/components/date-stepper';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import type { NewEntry } from '@/lib/entries';
import { searchFoods, type Food } from '@/lib/foods';
import { MEAL_COLORS, MEAL_LABELS, MEAL_SLOTS, type MealSlot } from '@/lib/meals';
import { confidenceNote, parseMeal, type ParsedItem } from '@/lib/parse-meal';
import { rememberFood, touchPersonalFood } from '@/lib/personal-foods';

type AddEntryModalProps = {
  visible: boolean;
  defaultMeal: MealSlot;
  eatenOn: string;
  onClose: () => void;
  onSave: (entry: NewEntry) => Promise<void>;
  onSaveMany: (entries: NewEntry[]) => Promise<void>;
};

type Field = 'name' | 'qty' | 'calories' | 'protein' | 'carbs' | 'fat';

const EMPTY_FORM = { name: '', qty: '', calories: '', protein: '', carbs: '', fat: '' };

/**
 * A parsed item plus whether the user has fixed it in this review.
 *
 * `edited` is what turns a row into a remembered correction when the meal is
 * logged, so it has to survive the row being re-rendered and cannot be inferred
 * by comparing numbers — someone re-typing 210 over 210 has still told us that
 * 210 is right.
 */
type ReviewItem = ParsedItem & { edited: boolean };

export function AddEntryModal({ visible, ...formProps }: AddEntryModalProps) {
  // Every open starts from a blank form, and that reset is a remount rather
  // than an effect full of setters. The form holds a dozen pieces of state;
  // clearing them from an effect meant each open rendered the previous
  // session's form once and then threw it away on a second pass.
  //
  // The key advances on the way open and never on the way closed, so the sheet
  // animating away still shows what the user was looking at.
  const [openKey, setOpenKey] = useState(0);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setOpenKey((k) => k + 1);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={formProps.onClose}
      presentationStyle="pageSheet"
    >
      <AddEntryForm key={openKey} {...formProps} />
    </Modal>
  );
}

function AddEntryForm({
  defaultMeal,
  eatenOn,
  onClose,
  onSave,
  onSaveMany,
}: Omit<AddEntryModalProps, 'visible'>) {
  const [meal, setMeal] = useState<MealSlot>(defaultMeal);
  // Starts on the day the screen behind is showing, and is the day the food
  // gets logged to. The form remounts on every open, so this never carries
  // over from a previous sheet.
  const [date, setDate] = useState(eatenOn);
  const [sentence, setSentence] = useState('');
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ReviewItem[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState(EMPTY_FORM);
  const [query, setQuery] = useState('');
  // Results are kept next to the query they came back for. Everything else --
  // whether the list on screen is still current, whether a search is
  // outstanding -- is read off that pair during render, so the effect below
  // never has to write state synchronously just to clear a stale list.
  const [search, setSearch] = useState<{ query: string; foods: Food[] }>({ query: '', foods: [] });
  const [source, setSource] = useState<NewEntry['source']>('manual');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmedQuery = query.trim();
  const results = search.query === trimmedQuery ? search.foods : [];
  // Covers the debounce window as well as the request itself: from the first
  // keystroke until results for exactly this query land.
  const searching = trimmedQuery.length > 0 && search.query !== trimmedQuery;

  useEffect(() => {
    if (!trimmedQuery) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchFoods(trimmedQuery)
        .then((foods) => {
          if (!cancelled) setSearch({ query: trimmedQuery, foods });
        })
        .catch(() => {
          if (!cancelled) setSearch({ query: trimmedQuery, foods: [] });
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [trimmedQuery]);

  const handleParse = async () => {
    if (!sentence.trim() || parsing) return;
    setParsing(true);
    setParseError(null);
    try {
      const result = await parseMeal(sentence, meal);
      setParsed(result.items.map((item) => ({ ...item, edited: false })));
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Could not read that one.');
    } finally {
      setParsing(false);
    }
  };

  const startEdit = (index: number) => {
    const item = parsed?.[index];
    if (!item) return;
    setEditingIndex(index);
    setDraft({
      name: item.name,
      qty: item.qty,
      calories: String(item.calories),
      protein: String(item.protein),
      carbs: String(item.carbs),
      fat: String(item.fat),
    });
  };

  const commitEdit = () => {
    if (editingIndex === null || !parsed) return;
    const name = draft.name.trim();
    if (!name) return;
    setParsed(
      parsed.map((item, i) =>
        i === editingIndex
          ? {
              ...item,
              name,
              qty: draft.qty.trim(),
              calories: toNumber(draft.calories),
              protein: toNumber(draft.protein),
              carbs: toNumber(draft.carbs),
              fat: toNumber(draft.fat),
              // Their numbers now. Not an estimate, so it stops being described
              // as one — see confidenceNote.
              source: 'personal' as const,
              confidence: 'high' as const,
              note: '',
              edited: true,
            }
          : item
      )
    );
    setEditingIndex(null);
  };

  const handleLogParsed = async () => {
    if (!parsed || parsed.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    const items = parsed;
    try {
      await onSaveMany(
        items.map((item) => ({
          eaten_on: date,
          meal,
          name: item.name,
          qty: item.qty || null,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          // Where the numbers on this row actually came from, which after a
          // correction is no longer the parser: a row the user just typed over
          // is `manual`, and one that arrived already carrying their stored
          // correction is `history`.
          source: item.edited ? 'manual' : item.source === 'personal' ? 'history' : 'ai',
          // Provenance only. resolve_food returns nothing unless it is confident,
          // so this is null more often than not, and the macros above are Claude's
          // either way.
          food_id: item.food_id,
        }))
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save those.');
      setSaving(false);
      return;
    }
    // Only after the food is safely logged, and never awaited: remembering a
    // correction is a nicety for next time, and the user is already watching
    // this sheet close. A failure here must not surface as an error on a meal
    // that saved fine.
    void rememberCorrections(items);
  };

  const pickFood = (food: Food) => {
    setSource('database');
    setForm({
      name: food.name,
      qty: food.serving_label ?? '',
      calories: String(food.calories),
      protein: String(food.protein),
      carbs: String(food.carbs),
      fat: String(food.fat),
    });
    setQuery('');
  };

  const setField = (field: Field, value: string) => {
    if (field !== 'name' && field !== 'qty') setSource('manual');
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const isValid = form.name.trim().length > 0 && form.calories.trim().length > 0;

  const handleSave = async () => {
    if (!isValid || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({
        eaten_on: date,
        meal,
        name: form.name.trim(),
        qty: form.qty.trim() || null,
        calories: toNumber(form.calories),
        protein: toNumber(form.protein),
        carbs: toNumber(form.carbs),
        fat: toNumber(form.fat),
        source,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that.');
      setSaving(false);
    }
  };

  const reviewing = parsed !== null && parsed.length > 0;
  const parsedTotals = (parsed ?? []).reduce(
    (acc, i) => ({
      calories: acc.calories + i.calories,
      protein: acc.protein + i.protein,
      carbs: acc.carbs + i.carbs,
      fat: acc.fat + i.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return (
    <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <ThemedText type="subtitle">Add food</ThemedText>
              <Pressable onPress={onClose} hitSlop={10}>
                <ThemedText type="linkPrimary">Close</ThemedText>
              </Pressable>
            </View>

            <DateStepper date={date} onChange={setDate} />

            <View style={styles.mealPicker}>
              {MEAL_SLOTS.map((slot) => (
                <Pressable
                  key={slot}
                  onPress={() => setMeal(slot)}
                  style={[
                    styles.mealChip,
                    { borderColor: MEAL_COLORS[slot] },
                    meal === slot && { backgroundColor: MEAL_COLORS[slot] },
                  ]}
                >
                  <ThemedText type="small">{MEAL_LABELS[slot]}</ThemedText>
                </Pressable>
              ))}
            </View>

            {reviewing ? (
              <>
                <ThemedView type="backgroundElement" style={styles.form}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Here&apos;s what I got — tap anything to fix it
                  </ThemedText>

                  {parsed.map((item, index) => {
                    const note = confidenceNote(item);

                    if (editingIndex === index) {
                      return (
                        <View key={`edit-${index}`} style={styles.editBox}>
                          <TextInput
                            value={draft.name}
                            onChangeText={(v) => setDraft((d) => ({ ...d, name: v }))}
                            placeholder="What is it?"
                            placeholderTextColor="#9098a3"
                            style={styles.input}
                          />
                          <TextInput
                            value={draft.qty}
                            onChangeText={(v) => setDraft((d) => ({ ...d, qty: v }))}
                            placeholder="How much? (e.g. 1 scoop)"
                            placeholderTextColor="#9098a3"
                            style={styles.input}
                          />
                          <View style={styles.macroRow}>
                            <NumberField
                              label="cal"
                              value={draft.calories}
                              onChangeText={(v) => setDraft((d) => ({ ...d, calories: v }))}
                            />
                            <NumberField
                              label="P"
                              value={draft.protein}
                              onChangeText={(v) => setDraft((d) => ({ ...d, protein: v }))}
                            />
                            <NumberField
                              label="C"
                              value={draft.carbs}
                              onChangeText={(v) => setDraft((d) => ({ ...d, carbs: v }))}
                            />
                            <NumberField
                              label="F"
                              value={draft.fat}
                              onChangeText={(v) => setDraft((d) => ({ ...d, fat: v }))}
                            />
                          </View>
                          {/* Said once, at the moment it's true, and never again:
                              the promise is that fixing this is worth the ten
                              seconds because it sticks. */}
                          <ThemedText type="small" themeColor="textSecondary">
                            I&apos;ll use these numbers next time too
                          </ThemedText>
                          <View style={styles.editActions}>
                            <Pressable onPress={() => setEditingIndex(null)} hitSlop={8}>
                              <ThemedText type="small" themeColor="textSecondary">
                                Cancel
                              </ThemedText>
                            </Pressable>
                            <Pressable onPress={commitEdit} hitSlop={8}>
                              <ThemedText type="linkPrimary">Done</ThemedText>
                            </Pressable>
                          </View>
                        </View>
                      );
                    }

                    return (
                      <View key={`${item.name}-${index}`} style={styles.parsedRow}>
                        <Pressable
                          style={styles.parsedMain}
                          onPress={() => startEdit(index)}
                          accessibilityLabel={`Edit ${item.name}`}
                        >
                          <ThemedText>{item.name}</ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {[item.qty, note].filter(Boolean).join(' · ')}
                          </ThemedText>
                        </Pressable>
                        <Pressable onPress={() => startEdit(index)} hitSlop={8}>
                          <ThemedText type="small" themeColor="textSecondary">
                            {Math.round(item.calories)} cal
                          </ThemedText>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            setEditingIndex(null);
                            setParsed(parsed.filter((_, i) => i !== index));
                          }}
                          hitSlop={10}
                          accessibilityLabel={`Remove ${item.name}`}
                        >
                          <ThemedText style={styles.remove}>×</ThemedText>
                        </Pressable>
                      </View>
                    );
                  })}

                  <View style={styles.totalsRow}>
                    <ThemedText type="smallBold" style={styles.totalsLabel}>
                      {Math.round(parsedTotals.calories)} cal
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {round1(parsedTotals.protein)}p · {round1(parsedTotals.carbs)}c ·{' '}
                      {round1(parsedTotals.fat)}f
                    </ThemedText>
                  </View>
                </ThemedView>

                {error && <ThemedText style={styles.error}>{error}</ThemedText>}

                <Pressable
                  onPress={handleLogParsed}
                  // Editing blocks the log button on purpose: a half-typed
                  // correction that vanished because the user reached for the
                  // green button instead of "Done" would lose the one number
                  // they cared enough to fix.
                  disabled={saving || editingIndex !== null}
                  style={[
                    styles.saveButton,
                    (saving || editingIndex !== null) && styles.saveButtonDisabled,
                  ]}
                >
                  {saving ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <ThemedText style={styles.saveButtonText}>
                      Add {parsed.length === 1 ? 'it' : `all ${parsed.length}`} to {MEAL_LABELS[meal]}
                    </ThemedText>
                  )}
                </Pressable>

                <Pressable
                  onPress={() => {
                    setEditingIndex(null);
                    setParsed(null);
                  }}
                  style={styles.startOver}
                  hitSlop={8}
                >
                  <ThemedText type="linkPrimary">Type it again</ThemedText>
                </Pressable>
              </>
            ) : (
              <>
                {/* The sentence box leads, per PRODUCT.md: "typing a sentence is
                    the fastest path and stays the primary one". Search and the
                    manual form stay below it as the fallbacks they are. */}
                <ThemedView type="backgroundElement" style={styles.form}>
                  <ThemedText type="small" themeColor="textSecondary">
                    What did you eat?
                  </ThemedText>
                  <TextInput
                    value={sentence}
                    onChangeText={setSentence}
                    placeholder="chicken burrito bowl and a latte"
                    placeholderTextColor="#9098a3"
                    style={[styles.input, styles.sentenceInput]}
                    multiline
                    autoCorrect
                    onSubmitEditing={handleParse}
                    editable={!parsing}
                  />
                  <Pressable
                    onPress={handleParse}
                    disabled={!sentence.trim() || parsing}
                    style={[
                      styles.parseButton,
                      (!sentence.trim() || parsing) && styles.saveButtonDisabled,
                    ]}
                  >
                    {parsing ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <ThemedText style={styles.saveButtonText}>Log it</ThemedText>
                    )}
                  </Pressable>
                  {parseError && <ThemedText style={styles.error}>{parseError}</ThemedText>}
                </ThemedView>

                <ThemedText type="small" themeColor="textSecondary" style={styles.orLabel}>
                  or look it up
                </ThemedText>

                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search foods…"
                  placeholderTextColor="#9098a3"
                  style={styles.input}
                  autoCorrect={false}
                />
                {searching && <ActivityIndicator style={styles.searchSpinner} />}
                {results.length > 0 && (
                  <View style={styles.resultsBox}>
                    {results.map((food) => (
                      <Pressable key={food.id} onPress={() => pickFood(food)} style={styles.resultRow}>
                        <ThemedText>{food.name}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {/* The brand is the whole point once branded products are in
                              the table: searching "quest bar" surfaces a row named only
                              "APPLE PIE", which is unidentifiable without it. */}
                          {food.brand ? `${food.brand} · ` : ''}
                          {Math.round(food.calories)} cal / {food.serving_label}
                        </ThemedText>
                      </Pressable>
                    ))}
                  </View>
                )}

                <ThemedView type="backgroundElement" style={styles.form}>
                  <ThemedText type="small" themeColor="textSecondary">
                    Or enter it directly
                  </ThemedText>
                  <TextInput
                    value={form.name}
                    onChangeText={(v) => setField('name', v)}
                    placeholder="What did you eat?"
                    placeholderTextColor="#9098a3"
                    style={styles.input}
                  />
                  <TextInput
                    value={form.qty}
                    onChangeText={(v) => setField('qty', v)}
                    placeholder="Quantity (optional, e.g. 1 cup)"
                    placeholderTextColor="#9098a3"
                    style={styles.input}
                  />
                  <View style={styles.macroRow}>
                    <NumberField label="cal" value={form.calories} onChangeText={(v) => setField('calories', v)} />
                    <NumberField label="P" value={form.protein} onChangeText={(v) => setField('protein', v)} />
                    <NumberField label="C" value={form.carbs} onChangeText={(v) => setField('carbs', v)} />
                    <NumberField label="F" value={form.fat} onChangeText={(v) => setField('fat', v)} />
                  </View>
                </ThemedView>

                {error && <ThemedText style={styles.error}>{error}</ThemedText>}

                <Pressable
                  onPress={handleSave}
                  disabled={!isValid || saving}
                  style={[styles.saveButton, (!isValid || saving) && styles.saveButtonDisabled]}
                >
                  {saving ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <ThemedText style={styles.saveButtonText}>Add to {MEAL_LABELS[meal]}</ThemedText>
                  )}
                </Pressable>
              </>
            )}
          </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

function NumberField({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
}) {
  return (
    <View style={styles.numberField}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="0"
        placeholderTextColor="#9098a3"
        keyboardType="numeric"
        style={styles.numberInput}
      />
    </View>
  );
}

/**
 * Store what the user fixed, and count what they reused.
 *
 * Both halves matter. The edits are the corrections themselves; the untouched
 * rows that arrived as `personal` are a stored correction being used again,
 * which is what `times_used` will rank on when favourites and "same as
 * yesterday" get built.
 *
 * Note `item.phrase` is the name the *parser* produced, captured before any
 * edit, while `item.name` is whatever the user renamed it to. That is the point:
 * the rule being stored is "when the parser says this, use my numbers", so
 * renaming "Protein bar" to "My bar" must not file the correction under a phrase
 * the parser will never say again.
 */
async function rememberCorrections(items: ReviewItem[]): Promise<void> {
  for (const item of items) {
    try {
      if (item.edited) {
        await rememberFood(item.phrase, {
          name: item.name,
          qty: item.qty || null,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
        });
      } else if (item.source === 'personal') {
        await touchPersonalFood(item.phrase);
      }
    } catch {
      // Nothing to tell the user: their food is logged either way.
    }
  }
}

function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mealPicker: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  mealChip: {
    borderWidth: 2,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
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
  sentenceInput: {
    minHeight: 72,
    textAlignVertical: 'top',
  },
  parseButton: {
    backgroundColor: Brand.blue,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  orLabel: {
    textAlign: 'center',
  },
  parsedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1B1614',
  },
  parsedMain: {
    flex: 1,
    gap: 2,
  },
  editBox: {
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1B1614',
  },
  editActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.four,
  },
  remove: {
    fontSize: 22,
    lineHeight: 24,
    color: Brand.coral,
    paddingHorizontal: Spacing.one,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.one,
  },
  totalsLabel: {
    flex: 1,
  },
  startOver: {
    alignItems: 'center',
  },
  searchSpinner: {
    marginTop: -Spacing.two,
  },
  resultsBox: {
    borderWidth: 1,
    borderColor: '#1E1B1622',
    borderRadius: Spacing.two,
    overflow: 'hidden',
  },
  resultRow: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: '#1E1B1614',
    gap: 2,
  },
  form: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  macroRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  numberField: {
    flex: 1,
    gap: 2,
  },
  numberInput: {
    borderWidth: 1,
    borderColor: '#1E1B1622',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 16,
    color: Brand.ink,
    backgroundColor: Brand.paper,
  },
  error: {
    color: Brand.coral,
  },
  saveButton: {
    backgroundColor: Brand.green,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
});
