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

// `foods.name` has a trigram GIN index, so a plain ilike '%query%' can use it
// instead of a full table scan. Empty/blank query returns nothing rather than
// the whole ~800-row table.
export async function searchFoods(query: string, limit = 20): Promise<Food[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const { data, error } = await supabase
    .from('foods')
    .select(FOOD_COLUMNS)
    .ilike('name', `%${trimmed}%`)
    .order('name', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return data;
}
