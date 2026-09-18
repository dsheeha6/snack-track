import { supabase } from '@/lib/supabase';

/**
 * Foods this person has corrected, and the numbers they corrected them to.
 *
 * When someone fixes a row in the "here's what I got" list, that fix is better
 * data than anything we have: they know what their protein shake is and we are
 * guessing. So the next time the same food comes back from the parser, their
 * number replaces the guess — silently, with a small "your numbers" note, and
 * never as a prompt asking them to confirm something they already told us.
 */
export type PersonalFood = {
  phrase: string;
  name: string;
  qty: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

/**
 * The lookup key, derived from the *clean name Claude returned* rather than
 * from what the user typed.
 *
 * That choice is the whole design. "2 eggz", "some eggs" and "eggs on toast"
 * are three different sentences and one food, and Claude normalises all three
 * to "Eggs" before we ever see them. Keying on raw text would learn a
 * correction for one phrasing and forget it the moment someone typed the same
 * meal slightly differently.
 *
 * Matches `regexp_replace(btrim(lower(...)), '\s+', ' ', 'g')` in the
 * remember_food migration, so a phrase written by either side finds the other.
 */
export function phraseKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function fetchPersonalFoods(phrases: string[]): Promise<Map<string, PersonalFood>> {
  const keys = Array.from(new Set(phrases.map(phraseKey).filter(Boolean)));
  if (keys.length === 0) return new Map();

  const { data, error } = await supabase
    .from('personal_foods')
    .select('phrase, name, qty, calories, protein, carbs, fat')
    .in('phrase', keys);

  // A correction we fail to load is a worse meal, not a broken one: fall back
  // to the parser's numbers rather than failing a log the user is mid-way
  // through. Same reasoning as the resolve lookup inside the edge function.
  if (error) return new Map();
  return new Map((data ?? []).map((row) => [row.phrase, row as PersonalFood]));
}

type Qty = { n: number; unit: string; stated: boolean };

/**
 * "2 cups" -> { n: 2, unit: 'cup' }. Plurals are stripped so "1 cup" and
 * "2 cups" are the same unit, which is the entire point of parsing this at all.
 */
function parseQty(raw: string | null | undefined): Qty {
  const q = (raw ?? '').trim().toLowerCase();
  if (!q) return { n: 1, unit: '', stated: false };

  // Number first: whole, decimal, fraction, or mixed ("1 1/2 cups").
  const m = q.match(/^(\d+)\s+(\d+)\/(\d+)\s*(.*)$/) ?? q.match(/^(\d+)\/(\d+)\s*(.*)$/) ??
    q.match(/^(\d*\.?\d+)\s*(.*)$/);
  if (!m) return { n: 1, unit: singular(q), stated: true };

  let n: number;
  let rest: string;
  if (m.length === 5) {
    n = Number(m[1]) + Number(m[2]) / Number(m[3]);
    rest = m[4];
  } else if (m.length === 4) {
    n = Number(m[1]) / Number(m[2]);
    rest = m[3];
  } else {
    n = Number(m[1]);
    rest = m[2];
  }
  // "0 scoops" is a typo, not an instruction to log nothing — keep the unit and
  // read it as one serving, which is also what a bare "scoop" means.
  if (!Number.isFinite(n) || n <= 0) return { n: 1, unit: singular(rest), stated: true };
  return { n, unit: singular(rest), stated: true };
}

function singular(unit: string): string {
  return unit
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ');
}

/**
 * How many of the stored serving this item is — or null when we can't tell.
 *
 * Returning null matters as much as returning a number. A correction of
 * "1 scoop = 210 cal" says nothing reliable about "a cup of protein shake", and
 * inventing a conversion would put a wrong number on someone's day under the
 * label "your numbers", which is worse than the guess it replaced. Same
 * principle as resolve_food returning no match rather than a bad one.
 *
 * A bare number is read in *the other side's* unit, which is the rule that
 * makes this useful rather than pedantic. "2 protein shakes" comes back from the
 * parser as a qty of just `2`, and against a stored "1 scoop" the first version
 * of this function refused it as a unit mismatch — the correction was stored,
 * matched, and then silently declined, which was exactly the wrong answer and is
 * why this is checked in the running app rather than reasoned about. Only a
 * genuine disagreement between two named units gives up.
 */
export function servingsOf(stored: string | null, incoming: string): number | null {
  const a = parseQty(stored);
  const b = parseQty(incoming);

  // They recorded no amount: their numbers are one serving, and whatever count
  // the sentence gives scales it.
  if (!a.stated) return b.n;
  // They gave no amount this time: assume the serving they corrected.
  if (!b.stated) return 1;
  // Same unit, or one side is a bare count that the other side's unit explains.
  if (a.unit === b.unit || !a.unit || !b.unit) return b.n / a.n;
  return null;
}

/**
 * Store a correction. Upserts on (user_id, phrase) and counts the use — see the
 * add_personal_food_corrections migration for why that lives in SQL.
 */
export async function rememberFood(
  phrase: string,
  food: { name: string; qty: string | null; calories: number; protein: number; carbs: number; fat: number }
): Promise<void> {
  const { error } = await supabase.rpc('remember_food', {
    p_phrase: phraseKey(phrase),
    p_name: food.name,
    p_qty: food.qty,
    p_calories: food.calories,
    p_protein: food.protein,
    p_carbs: food.carbs,
    p_fat: food.fat,
  });
  if (error) throw error;
}

/** Count a use of a stored correction. Best effort — never worth failing a log over. */
export async function touchPersonalFood(phrase: string): Promise<void> {
  await supabase.rpc('touch_personal_food', { p_phrase: phraseKey(phrase) });
}
