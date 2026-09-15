import type { MealSlot } from '@/lib/meals';
import { supabase } from '@/lib/supabase';

export type ParsedItem = {
  name: string;
  qty: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: 'estimate' | 'database';
  confidence: 'high' | 'medium' | 'low';
  food_id: string | null;
  matched_name: string | null;
  note: string;
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

  return data;
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
  if (item.confidence === 'high') return null;
  if (item.confidence === 'medium') return 'estimated portion';
  return 'rough estimate';
}
