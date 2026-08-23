import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import type { NewEntry } from '@/lib/entries';
import { searchFoods, type Food } from '@/lib/foods';
import { MEAL_COLORS, MEAL_LABELS, MEAL_SLOTS, type MealSlot } from '@/lib/meals';

type AddEntryModalProps = {
  visible: boolean;
  defaultMeal: MealSlot;
  eatenOn: string;
  onClose: () => void;
  onSave: (entry: NewEntry) => Promise<void>;
};

type Field = 'name' | 'qty' | 'calories' | 'protein' | 'carbs' | 'fat';

const EMPTY_FORM = { name: '', qty: '', calories: '', protein: '', carbs: '', fat: '' };

export function AddEntryModal({ visible, defaultMeal, eatenOn, onClose, onSave }: AddEntryModalProps) {
  const [meal, setMeal] = useState<MealSlot>(defaultMeal);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Food[]>([]);
  const [searching, setSearching] = useState(false);
  const [source, setSource] = useState<NewEntry['source']>('manual');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setMeal(defaultMeal);
      setQuery('');
      setResults([]);
      setSource('manual');
      setForm(EMPTY_FORM);
      setError(null);
    }
  }, [visible, defaultMeal]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(() => {
      searchFoods(query)
        .then((foods) => {
          if (!cancelled) setResults(foods);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

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
    setResults([]);
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
        eaten_on: eatenOn,
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

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <ThemedView style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
            <View style={styles.header}>
              <ThemedText type="subtitle">Add food</ThemedText>
              <Pressable onPress={onClose} hitSlop={10}>
                <ThemedText type="linkPrimary">Close</ThemedText>
              </Pressable>
            </View>

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
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    </Modal>
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

function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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
