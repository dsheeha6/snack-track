import { supabase } from '@/lib/supabase';

export type Food = {
  id: string;
  name: string;
  brand: string | null;
  serving_label: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const FOOD_COLUMNS = 'id, name, brand, serving_label, calories, protein, carbs, fat';

// Ranking lives in the `search_foods` database function, not here — see the
// add_search_foods_ranking migration. Once ~399k branded products joined the
// 7,793 whole foods, the old `ilike + order by name` returned whichever brand
// sorted earliest rather than the food you asked for. The function ranks exact
// match, then prefix, then whole foods over packaged, then shortest name.
//
// Needs 2+ characters; the function itself returns nothing below that so a
// single keystroke can't sort the whole table.
export async function searchFoods(query: string, limit = 20): Promise<Food[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  const { data, error } = await supabase.rpc('search_foods', { q: trimmed, lim: limit });
  if (error) throw error;
  return (data ?? []) as Food[];
}
