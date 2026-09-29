import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import {
  defaultFiberTarget,
  defaultSugarTarget,
  matchingPreset,
  NUTRIENT_INFO,
  NUTRIENT_ORDER,
  PRESET_ORDER,
  PRESETS,
  presetForGoal,
  sortNutrients,
  type NutrientKey,
  type NutrientPrefs,
  type PresetKey,
} from '@/lib/nutrients';
import type { Goal } from '@/lib/targets';

type Props = {
  visible: boolean;
  prefs: NutrientPrefs;
  goal: Goal | null;
  calorieTarget: number;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (prefs: NutrientPrefs) => void;
};

// "What you track": pick a preset, then add or drop from it. Mounted fresh on
// each open (the caller bumps `key`), so local state starts from the saved prefs.
export function NutrientSheet({ visible, prefs, goal, calorieTarget, saving, error, onClose, onSave }: Props) {
  const [shown, setShown] = useState<NutrientKey[]>(prefs.shown);
  // Blank field = use the default worked out from calories.
  const [fiber, setFiber] = useState(prefs.fiberTarget ? String(prefs.fiberTarget) : '');
  const [sugar, setSugar] = useState(prefs.sugarTarget ? String(prefs.sugarTarget) : '');

  const active = matchingPreset(shown);
  const yours = presetForGoal(goal);

  const toggle = (k: NutrientKey) => {
    if (k === 'calories') return;
    setShown((prev) => sortNutrients(prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]));
  };

  const pickPreset = (p: PresetKey) => setShown(sortNutrients(PRESETS[p].shown));

  const fiberValue = parseTarget(fiber);
  const sugarValue = parseTarget(sugar);
  const valid = fiberValue !== undefined && sugarValue !== undefined;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheetWrap} onPress={() => {}}>
          <ThemedView type="backgroundElement" style={styles.sheet}>
            <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
              <View style={styles.headerRow}>
                <ThemedText type="subtitle">What you track</ThemedText>
                <Pressable onPress={onClose} hitSlop={10}>
                  <ThemedText type="linkPrimary">Close</ThemedText>
                </Pressable>
              </View>

              <ThemedText type="small" themeColor="textSecondary">
                Start from a goal
              </ThemedText>
              <View style={styles.chips}>
                {PRESET_ORDER.map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => pickPreset(p)}
                    style={[styles.chip, active === p && styles.chipOn]}
                  >
                    <ThemedText type="smallBold" style={active === p ? styles.chipTextOn : undefined}>
                      {PRESETS[p].label}
                      {p === yours ? ' · yours' : ''}
                    </ThemedText>
                  </Pressable>
                ))}
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {active ? PRESETS[active].why : 'Your own mix.'}
              </ThemedText>

              <View style={styles.divider} />

              {NUTRIENT_ORDER.map((k) => {
                const on = shown.includes(k);
                const locked = k === 'calories';
                return (
                  <View key={k} style={styles.nutrientBlock}>
                    <Pressable
                      onPress={() => toggle(k)}
                      disabled={locked}
                      style={styles.nutrientRow}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on, disabled: locked }}
                    >
                      <View style={[styles.box, on && styles.boxOn, locked && styles.boxLocked]}>
                        {on && <ThemedText style={styles.tick}>✓</ThemedText>}
                      </View>
                      <View style={styles.nutrientText}>
                        <ThemedText type="smallBold">{NUTRIENT_INFO[k].label}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {NUTRIENT_INFO[k].blurb}
                        </ThemedText>
                      </View>
                    </Pressable>
                    {on && k === 'fiber' && (
                      <TargetField
                        label="Daily target"
                        value={fiber}
                        onChange={setFiber}
                        placeholder={String(defaultFiberTarget(calorieTarget))}
                      />
                    )}
                    {on && k === 'sugar' && (
                      <TargetField
                        label="Daily target"
                        value={sugar}
                        onChange={setSugar}
                        placeholder={String(defaultSugarTarget(calorieTarget))}
                      />
                    )}
                  </View>
                );
              })}

              {error && <ThemedText style={styles.error}>{error}</ThemedText>}

              <Pressable
                onPress={() =>
                  valid && onSave({ shown, fiberTarget: fiberValue ?? null, sugarTarget: sugarValue ?? null })
                }
                disabled={!valid || saving}
                style={[styles.saveButton, (!valid || saving) && styles.disabled]}
              >
                <ThemedText style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</ThemedText>
              </Pressable>
            </ScrollView>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TargetField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.targetRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.targetLabel}>
        {label}
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#9098a3"
        keyboardType="numeric"
        style={styles.input}
      />
      <ThemedText themeColor="textSecondary">g</ThemedText>
    </View>
  );
}

/** '' -> null (use the default); a positive number -> that; anything else -> undefined (invalid). */
function parseTarget(s: string): number | null | undefined {
  if (s.trim() === '') return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: '#1E1B1655',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    width: '100%',
    maxHeight: '90%',
  },
  sheet: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
  },
  sheetContent: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    borderWidth: 1,
    borderColor: '#1E1B1633',
    borderRadius: 999,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
  },
  chipOn: {
    backgroundColor: Brand.ink,
    borderColor: Brand.ink,
  },
  chipTextOn: {
    color: Brand.paper,
  },
  divider: {
    height: 1,
    backgroundColor: '#1E1B1614',
    marginVertical: Spacing.two,
  },
  nutrientBlock: {
    gap: Spacing.one,
  },
  nutrientRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    paddingVertical: Spacing.one,
  },
  nutrientText: {
    flex: 1,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#1E1B1655',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  boxOn: {
    backgroundColor: Brand.green,
    borderColor: Brand.green,
  },
  boxLocked: {
    opacity: 0.55,
  },
  tick: {
    color: '#ffffff',
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '700',
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginLeft: 22 + Spacing.three,
  },
  targetLabel: {
    minWidth: 90,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1E1B1622',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
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
    marginTop: Spacing.two,
  },
  saveText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
});
