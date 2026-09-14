import { supabase } from '@/lib/supabase';
import type { MealSlot } from '@/lib/meals';

export type Entry = {
  id: string;
  eaten_on: string;
  meal: MealSlot;
  name: string;
  qty: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: 'manual' | 'ai' | 'database' | 'history' | 'suggestion';
  created_at: string;
};

const ENTRY_COLUMNS = 'id, eaten_on, meal, name, qty, calories, protein, carbs, fat, source, created_at';

export async function fetchEntries(eatenOn: string): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('entries')
    .select(ENTRY_COLUMNS)
    .eq('eaten_on', eatenOn)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchEntriesRange(fromDate: string, toDate: string): Promise<Entry[]> {
  const { data, error } = await supabase
    .from('entries')
    .select(ENTRY_COLUMNS)
    .gte('eaten_on', fromDate)
    .lte('eaten_on', toDate)
    .order('eaten_on', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export type NewEntry = {
  eaten_on: string;
  meal: MealSlot;
  name: string;
  qty?: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  source: Entry['source'];
};

export async function addEntry(entry: NewEntry): Promise<Entry> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');
  const { data, error } = await supabase
    .from('entries')
    .insert({ ...entry, user_id: user.id })
    .select(ENTRY_COLUMNS)
    .single();
  if (error) throw error;
  return data;
}

/**
 * Insert several entries at once.
 *
 * One sentence usually becomes three or four rows, and inserting them
 * separately would mean a partially-logged meal whenever one call failed —
 * the user would see some of their food and have to work out which half to
 * re-enter. A single insert either takes the whole meal or none of it.
 */
export async function addEntries(entries: NewEntry[]): Promise<Entry[]> {
  if (entries.length === 0) return [];
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');
  const { data, error } = await supabase
    .from('entries')
    .insert(entries.map((e) => ({ ...e, user_id: user.id })))
    .select(ENTRY_COLUMNS);
  if (error) throw error;
  return data;
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await supabase.from('entries').delete().eq('id', id);
  if (error) throw error;
}
