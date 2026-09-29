// Which nutrients the Today card shows, and what each one's target is.
//
// Danny's call 2026-09-28: each goal gets a preset that surfaces what matters
// for that goal, and anyone can add or drop from there. It lives in
// profiles.food_preferences.nutrients (jsonb) so it needed no migration; an
// absent key means "use the preset for my goal", which is what every profile
// created before this existed gets.
//
// Only nutrients we actually hold per food are offered: the four macros plus
// sugar and fiber (added to all 407k foods 2026-09-25). PRODUCT.md still rules
// out micronutrients, so this list is not meant to grow into a vitamin panel.

import { requireUserId, supabase } from '@/lib/supabase';
import type { Goal } from '@/lib/targets';

export type NutrientKey = 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber' | 'sugar';
export type PresetKey = 'cut' | 'recomp' | 'maintain' | 'bulk';

/** Display order on the Today card, whatever order they were switched on in. */
export const NUTRIENT_ORDER: NutrientKey[] = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sugar'];

export const NUTRIENT_INFO: Record<NutrientKey, { label: string; unit: string; blurb: string }> = {
  calories: { label: 'calories', unit: '', blurb: 'Always on — it’s the number everything else hangs off.' },
  protein: { label: 'protein', unit: 'g', blurb: 'Builds and keeps muscle, keeps you full.' },
  carbs: { label: 'carbs', unit: 'g', blurb: 'Your main fuel, especially for training.' },
  fat: { label: 'fat', unit: 'g', blurb: 'Hormones, and the flavour in most food.' },
  fiber: { label: 'fiber', unit: 'g', blurb: 'Keeps you full for longer and your gut happy.' },
  sugar: { label: 'sugar', unit: 'g', blurb: 'Total sugar, fruit included. Handy if you’re keeping an eye on it.' },
};

export const PRESETS: Record<PresetKey, { label: string; why: string; shown: NutrientKey[] }> = {
  cut: {
    label: 'Cut',
    why: 'Calories set the pace, protein holds on to muscle, and fiber keeps you full on less.',
    shown: ['calories', 'protein', 'fiber'],
  },
  recomp: {
    label: 'Recomp',
    why: 'A small deficit with plenty of protein, and carbs to fuel the training that does the work.',
    shown: ['calories', 'protein', 'carbs', 'fat'],
  },
  maintain: {
    label: 'Maintain',
    why: 'The balanced view: all four macros, plus fiber.',
    shown: ['calories', 'protein', 'carbs', 'fat', 'fiber'],
  },
  bulk: {
    label: 'Bulk',
    why: 'Enough calories to grow, protein to build with, and carbs to train hard.',
    shown: ['calories', 'protein', 'carbs'],
  },
};

export const PRESET_ORDER: PresetKey[] = ['cut', 'recomp', 'maintain', 'bulk'];

// 'track' is onboarding's "Just curious" (no calorie adjustment), which is a
// maintenance intake in everything but name.
export function presetForGoal(goal: Goal | null | undefined): PresetKey {
  if (goal === 'cut') return 'cut';
  if (goal === 'bulk') return 'bulk';
  if (goal === 'recomp') return 'recomp';
  return 'maintain';
}

export type NutrientPrefs = {
  /** Always contains 'calories'. */
  shown: NutrientKey[];
  /** Grams. Null means "work it out from my calorie target". */
  fiberTarget: number | null;
  sugarTarget: number | null;
};

/** What's saved in food_preferences.nutrients. Everything optional so old/partial rows still read. */
type StoredPrefs = { shown?: string[]; fiber_target?: number | null; sugar_target?: number | null };

function isNutrient(k: string): k is NutrientKey {
  return (NUTRIENT_ORDER as string[]).includes(k);
}

export function readNutrientPrefs(foodPreferences: unknown, goal: Goal | null | undefined): NutrientPrefs {
  const stored = (foodPreferences as { nutrients?: StoredPrefs } | null)?.nutrients;
  const shown = stored?.shown?.filter(isNutrient) ?? PRESETS[presetForGoal(goal)].shown;
  return {
    shown: sortNutrients(shown.includes('calories') ? shown : ['calories', ...shown]),
    fiberTarget: positiveOrNull(stored?.fiber_target),
    sugarTarget: positiveOrNull(stored?.sugar_target),
  };
}

function positiveOrNull(n: unknown): number | null {
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

export function sortNutrients(keys: NutrientKey[]): NutrientKey[] {
  return NUTRIENT_ORDER.filter((k) => keys.includes(k));
}

/** The preset whose list matches exactly, or null when the user has customised it. */
export function matchingPreset(shown: NutrientKey[]): PresetKey | null {
  const key = sortNutrients(shown).join(',');
  return PRESET_ORDER.find((p) => sortNutrients(PRESETS[p].shown).join(',') === key) ?? null;
}

function round5(n: number): number {
  return Math.max(5, Math.round(n / 5) * 5);
}

// 14 g per 1,000 calories is the Dietary Guidelines for Americans' fiber
// figure; at Danny's 2,900 that's 40 g.
export function defaultFiberTarget(calories: number): number {
  return round5((calories / 1000) * 14);
}

// There's no official ceiling for *total* sugar (the 10%-of-calories advice is
// for added sugar, which the USDA data doesn't separate out). Using 10% of
// calories on total sugar is deliberately roomy: a couple of pieces of fruit
// shouldn't read as "over". It's a starting point the user can change.
export function defaultSugarTarget(calories: number): number {
  return round5((calories * 0.1) / 4);
}

export function fiberTargetFor(prefs: NutrientPrefs, calories: number): number {
  return prefs.fiberTarget ?? defaultFiberTarget(calories);
}

export function sugarTargetFor(prefs: NutrientPrefs, calories: number): number {
  return prefs.sugarTarget ?? defaultSugarTarget(calories);
}

// Merges into food_preferences rather than overwriting it — the column is
// shared with whatever else ends up in there. `.select()` for the same reason
// as updateWaterTarget: an update RLS silently matched to zero rows must fail.
export async function saveNutrientPrefs(prefs: NutrientPrefs, currentFoodPreferences: unknown): Promise<unknown> {
  const userId = await requireUserId();
  const base =
    currentFoodPreferences && typeof currentFoodPreferences === 'object'
      ? (currentFoodPreferences as Record<string, unknown>)
      : {};
  const next = {
    ...base,
    nutrients: {
      shown: sortNutrients(prefs.shown),
      fiber_target: prefs.fiberTarget,
      sugar_target: prefs.sugarTarget,
    },
  };
  const { data, error } = await supabase
    .from('profiles')
    .update({ food_preferences: next })
    .eq('id', userId)
    .select('food_preferences');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Could not save what you track.');
  return data[0].food_preferences;
}
