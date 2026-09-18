import type { MealSlot } from '@/lib/meals';
import { fetchPersonalFoods, phraseKey, servingsOf } from '@/lib/personal-foods';
import { supabase } from '@/lib/supabase';

export type ParsedItem = {
  name: string;
  qty: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** `personal` — these are the user's own corrected numbers, not an estimate. */
  source: 'estimate' | 'database' | 'personal';
  confidence: 'high' | 'medium' | 'low';
  food_id: string | null;
  matched_name: string | null;
  note: string;
  /** Key this item is remembered under, so a correction lands on the right row. */
  phrase: string;
};

export type ParsedMeal = {
  items: ParsedItem[];
  totals: { calories: number; protein: number; carbs: number; fat: number };
  meal: MealSlot;
  model: string;
};

// `estimate`: Claude's numbers stand, and a database match only attaches
// provenance — it never changes a calorie or a macro. Both of the reasons this
// was 'none' are now gone (2026-09-14): `entries` has a `food_id` column, and
// resolution goes through `resolve_food`, which prefers whole foods and returns
// nothing rather than a bad guess. Not `db` — that mode was measured on
// 2026-09-13 and lost badly (protein error 16.3% -> 32.4%).
const RESOLVE_MODE = 'estimate';

/**
 * Send a sentence to the parse-meal edge function.
 *
 * The Anthropic key lives on the function, never here — this call carries only
 * the user's Supabase session, which functions.invoke attaches automatically.
 */
export async function parseMeal(text: string, meal: MealSlot): Promise<ParsedMeal> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Tell me what you ate first.');

  const { data, error } = await supabase.functions.invoke<ParsedMeal>('parse-meal', {
    body: { text: trimmed, meal, resolve: RESOLVE_MODE },
  });

  if (error) {
    // A non-2xx puts the real message in the Response on error.context, while
    // error.message is a generic "Edge Function returned a non-2xx status
    // code". The function writes plain-English errors on purpose — surface
    // those instead of the wrapper.
    let detail = '';
    try {
      const body = await (error as { context?: Response }).context?.json();
      if (body && typeof body.error === 'string') detail = body.error;
    } catch {
      // Body wasn't JSON, or was already consumed. Fall through to the generic.
    }
    throw new Error(detail || 'Could not reach the food parser. Try again in a moment.');
  }

  if (!data || !Array.isArray(data.items) || data.items.length === 0) {
    throw new Error("Couldn't pick any food out of that one. Try naming it plainly, or add it below.");
  }

  return applyCorrections(data);
}

/**
 * Replace the parser's numbers with the user's own, for any food they've
 * already corrected.
 *
 * Deliberately client-side rather than inside the edge function. The function
 * holds the API key and answers "what is this food, roughly"; whose numbers win
 * afterwards is the app's business, it needs no extra round trip inside a call
 * the user is waiting on, and a correction that fails to load leaves a working
 * parse rather than a failed one.
 */
async function applyCorrections(meal: ParsedMeal): Promise<ParsedMeal> {
  const items = meal.items.map((item) => ({ ...item, phrase: phraseKey(item.name) }));
  const stored = await fetchPersonalFoods(items.map((i) => i.phrase));
  if (stored.size === 0) return { ...meal, items };

  const corrected = items.map((item) => {
    const mine = stored.get(item.phrase);
    if (!mine) return item;

    const servings = servingsOf(mine.qty, item.qty);
    if (servings === null) return item;

    return {
      ...item,
      name: mine.name,
      calories: round1(Number(mine.calories) * servings),
      protein: round1(Number(mine.protein) * servings),
      carbs: round1(Number(mine.carbs) * servings),
      fat: round1(Number(mine.fat) * servings),
      source: 'personal' as const,
      // It's their own number. Nothing about it is an estimate any more, so the
      // "estimated portion" note would be both wrong and faintly insulting.
      confidence: 'high' as const,
      note: '',
    };
  });

  return {
    ...meal,
    items: corrected,
    totals: {
      calories: round1(corrected.reduce((s, i) => s + i.calories, 0)),
      protein: round1(corrected.reduce((s, i) => s + i.protein, 0)),
      carbs: round1(corrected.reduce((s, i) => s + i.carbs, 0)),
      fat: round1(corrected.reduce((s, i) => s + i.fat, 0)),
    },
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Wording for how sure the parser is about an item.
 *
 * Deliberately about the *guess*, never about the person: "estimated portion"
 * not "you didn't say how much". PRODUCT.md's no-judgement rule applies to
 * every string in the app, and the practical test is whether it would feel bad
 * to read on a day someone already feels bad.
 */
export function confidenceNote(item: ParsedItem): string | null {
  if (item.source === 'personal') return 'your numbers';
  if (item.confidence === 'high') return null;
  if (item.confidence === 'medium') return 'estimated portion';
  return 'rough estimate';
}
