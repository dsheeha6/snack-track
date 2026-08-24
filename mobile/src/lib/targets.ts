// Calorie and macro target math for onboarding (Phase 3) and any future
// target recompute. Mifflin-St Jeor + an activity add-on, a goal-based
// adjustment, and a macro split anchored to bodyweight — built to be shown
// on screen, not just returned, per the plan's "showing your work" screen 6
// and PRODUCT.md's differentiator of not handing over a number nobody can
// audit.

export type Sex = 'male' | 'female' | 'other';
export type Goal = 'cut' | 'recomp' | 'bulk' | 'track';
export type LifestyleFallback = 'desk' | 'on_feet' | 'physical';
export type ActivityTier = 'sedentary' | 'light' | 'moderate' | 'very' | 'extra';

export interface Biometrics {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightLb: number;
}

export interface ActivityInputs {
  /** Typical daily steps. Pass null when the person picked "I don't know". */
  dailySteps: number | null;
  /** Required when dailySteps is null — onboarding screen 3's fallback question. */
  lifestyleFallback?: LifestyleFallback;
  liftingDaysPerWeek: number;
  cardioMinutesPerWeek: number;
}

export interface TargetResult {
  bmr: number;
  activityTier: ActivityTier;
  activityMultiplier: number;
  tdee: number;
  goalAdjustment: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Plain, non-alarming copy if the target lands under the safety floor. Null when clear. */
  floorWarning: string | null;
}

const LB_PER_KG = 2.20462;
export const CALORIE_FLOOR = 1200; // PRODUCT.md: "Warn under ~1,200 calories."

const ACTIVITY_MULTIPLIERS: Record<ActivityTier, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extra: 1.9,
};

// Rough steps-per-day stand-in for someone who doesn't track steps and picks
// a lifestyle bucket instead (onboarding screen 3's "I don't know" branch).
const LIFESTYLE_FALLBACK_STEPS: Record<LifestyleFallback, number> = {
  desk: 4000,
  on_feet: 8000,
  physical: 12000,
};

// Calorie delta applied to TDEE per goal. Standard sports-nutrition ranges,
// not tuned to any one person: ~1 lb/week for a cut, a conservative deficit
// for recomp (small enough that adequate protein still supports muscle), a
// lean-bulk surplus, and no change to just track.
const GOAL_ADJUSTMENT: Record<Goal, number> = {
  cut: -500,
  recomp: -250,
  bulk: 300,
  track: 0,
};

export function ageYearsFromBirthDate(birthDate: string, today: Date = new Date()): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  let age = today.getFullYear() - by;
  const hadBirthdayThisYear =
    today.getMonth() + 1 > bm || (today.getMonth() + 1 === bm && today.getDate() >= bd);
  if (!hadBirthdayThisYear) age -= 1;
  return age;
}

// Mifflin-St Jeor. 'other' splits the difference between the male (+5) and
// female (-161) constant rather than picking one — the formula only has two
// sex terms, and this is a defensible default until something better exists.
export function calcBMR({ sex, ageYears, heightCm, weightLb }: Biometrics): number {
  const kg = weightLb / LB_PER_KG;
  const base = 10 * kg + 6.25 * heightCm - 5 * ageYears;
  const sexTerm = sex === 'male' ? 5 : sex === 'female' ? -161 : -78;
  return base + sexTerm;
}

// Turns steps + training into one of the five standard PAL tiers (Mifflin-St
// Jeor's own paper doesn't specify one; 1.2-1.9 is the widely used companion
// scale). Points are additive: steps carry the most weight since they're
// daily, lifting and cardio are weighted by weekly volume.
function activityPoints({
  dailySteps,
  lifestyleFallback,
  liftingDaysPerWeek,
  cardioMinutesPerWeek,
}: ActivityInputs): number {
  const steps = dailySteps ?? LIFESTYLE_FALLBACK_STEPS[lifestyleFallback ?? 'desk'];
  let stepPoints = 0;
  if (steps >= 12500) stepPoints = 4;
  else if (steps >= 10000) stepPoints = 3;
  else if (steps >= 7500) stepPoints = 2;
  else if (steps >= 5000) stepPoints = 1;

  const liftingPoints = Math.min(liftingDaysPerWeek, 6) * 0.5;
  const cardioPoints = Math.min(cardioMinutesPerWeek / 60, 6) * 0.5;

  return stepPoints + liftingPoints + cardioPoints;
}

export function calcActivityTier(input: ActivityInputs): ActivityTier {
  const points = activityPoints(input);
  if (points >= 7) return 'extra';
  if (points >= 5) return 'very';
  if (points >= 3) return 'moderate';
  if (points >= 1) return 'light';
  return 'sedentary';
}

// Nearest 5g — a number a person can actually picture, and what the
// prototype's own targets (data/log.json: 180P/365C/80F) land on.
function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

// Protein and fat anchored to bodyweight (1 g/lb, 0.45 g/lb); carbs fill
// whatever calories are left. This is the prototype's own split, not a new
// formula — see data/log.json's 179 lb -> 180P/365C/80F.
export function calcTargets(bio: Biometrics, activity: ActivityInputs, goal: Goal): TargetResult {
  const bmr = calcBMR(bio);
  const activityTier = calcActivityTier(activity);
  const activityMultiplier = ACTIVITY_MULTIPLIERS[activityTier];
  const tdee = bmr * activityMultiplier;
  const goalAdjustment = GOAL_ADJUSTMENT[goal];
  const calories = Math.round(tdee + goalAdjustment);

  const protein = round5(bio.weightLb * 1.0);
  const fat = round5(bio.weightLb * 0.45);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));

  const floorWarning =
    calories < CALORIE_FLOOR
      ? `This works out to under ${CALORIE_FLOOR} calories a day — low enough that it's worth checking with a doctor or dietitian before starting.`
      : null;

  return {
    bmr: Math.round(bmr),
    activityTier,
    activityMultiplier,
    tdee: Math.round(tdee),
    goalAdjustment,
    calories,
    protein,
    carbs,
    fat,
    floorWarning,
  };
}
