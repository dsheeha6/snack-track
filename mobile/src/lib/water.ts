import { requireUserId, supabase } from '@/lib/supabase';

// Hydration, deliberately kept apart from entries.ts. Water never touches the
// calorie or macro totals and never appears as a row in a meal section — it's
// a consistency feature, not a calorie one (QUESTIONS.md, drinks answer).
// Calorie-bearing drinks, alcohol included, go through entries.ts like food.

export type WaterEntry = {
  id: string;
  logged_on: string;
  ounces: number;
  created_at: string;
};

const WATER_COLUMNS = 'id, logged_on, ounces, created_at';

/** One tap. A custom amount goes through the same addWater(). */
export const TAP_OUNCES = 8;

/** Used when a profile predates the target_water_oz column. */
export const DEFAULT_TARGET_OUNCES = 64;

export async function fetchWater(loggedOn: string): Promise<WaterEntry[]> {
  const { data, error } = await supabase
    .from('water_log')
    .select(WATER_COLUMNS)
    .eq('logged_on', loggedOn)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

// user_id is stamped here rather than trusted from the call site — water_log.user_id
// is not null and RLS requires auth.uid() = user_id, the same trap addEntry() hit.
export async function addWater(loggedOn: string, ounces: number): Promise<WaterEntry> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('water_log')
    .insert({ user_id: userId, logged_on: loggedOn, ounces })
    .select(WATER_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

export async function deleteWater(id: string): Promise<void> {
  const { error } = await supabase.from('water_log').delete().eq('id', id);
  if (error) throw error;
}

export function sumOunces(entries: WaterEntry[]): number {
  return entries.reduce((total, e) => total + Number(e.ounces), 0);
}

// `.select()` on the update is load-bearing, not decoration. Without it
// PostgREST answers an update that matched nothing with 204 and no error, so a
// row that RLS hid or an id that didn't match would look exactly like success —
// the widget would show the new goal and quietly revert on the next reload.
// Asking for the row back turns that silence into an error the caller rolls
// back on.
export async function updateWaterTarget(ounces: number): Promise<void> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('profiles')
    .update({ target_water_oz: ounces })
    .eq('id', userId)
    .select('target_water_oz');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('Could not save your water goal.');
}
