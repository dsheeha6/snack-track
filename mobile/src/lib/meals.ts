import { Brand } from '@/constants/theme';

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snacks';

export const MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snacks'];

export const MEAL_LABELS: Record<MealSlot, string> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snacks: 'snacks',
};

// Matches ../calorie-tracker/index.html's meal palette so the two apps read
// the same way while both exist.
export const MEAL_COLORS: Record<MealSlot, string> = {
  breakfast: Brand.yellow,
  lunch: Brand.lime,
  dinner: Brand.teal,
  snacks: Brand.pink,
};

// Same time-of-day cutoffs as the prototype's guessMeal().
export function guessMealSlot(date: Date = new Date()): MealSlot {
  const h = date.getHours();
  if (h < 11) return 'breakfast';
  if (h < 15) return 'lunch';
  if (h < 21) return 'dinner';
  return 'snacks';
}

// Local calendar date as YYYY-MM-DD. Computed client-side and passed
// explicitly on every read/write so "today" means the phone's today, not
// the database server's timezone (Postgres current_date defaults to UTC).
export function localDateString(date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
