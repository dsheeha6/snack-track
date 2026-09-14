// The onboarding draft and everything it writes. The math lives in
// `targets.ts`; this file is the shape of the answers, the validation that
// PRODUCT.md's safety floor requires, and the one save that commits it all.

import { requireUserId, supabase } from '@/lib/supabase';
import {
  ageYearsFromBirthDate,
  calcTargets,
  type Goal,
  type LifestyleFallback,
  type Sex,
  type TargetResult,
} from '@/lib/targets';
import { localDateString } from '@/lib/meals';

// Numeric answers are held as strings so a half-typed "17" doesn't get parsed
// into a target and shown back to the person mid-keystroke.
export type OnboardingDraft = {
  displayName: string;
  sex: Sex | null;
  birthMonth: string;
  birthDay: string;
  birthYear: string;
  heightUnit: 'ftin' | 'cm';
  heightFeet: string;
  heightInches: string;
  heightCm: string;
  weightLb: string;
  stepsKnown: boolean;
  dailySteps: string;
  lifestyle: LifestyleFallback;
  liftingDaysPerWeek: number;
  cardioMinutesPerWeek: number;
  goal: Goal | null;
  goalWeightLb: string;
};

export const EMPTY_DRAFT: OnboardingDraft = {
  displayName: '',
  sex: null,
  birthMonth: '',
  birthDay: '',
  birthYear: '',
  heightUnit: 'ftin',
  heightFeet: '',
  heightInches: '',
  heightCm: '',
  weightLb: '',
  stepsKnown: true,
  dailySteps: '',
  lifestyle: 'desk',
  liftingDaysPerWeek: 0,
  cardioMinutesPerWeek: 0,
  goal: null,
  goalWeightLb: '',
};

const CM_PER_INCH = 2.54;
const KG_PER_LB = 0.453592;

// The lower edge of the healthy BMI range. PRODUCT.md: "Don't accept a goal
// weight below a healthy BMI. This isn't legal cover, it's the product working
// correctly."
export const MIN_HEALTHY_BMI = 18.5;

/** Only 'cut' and 'bulk' are aiming at a number on a scale — the other two aren't asked. */
export function goalWantsGoalWeight(goal: Goal | null): boolean {
  return goal === 'cut' || goal === 'bulk';
}

export function heightCmFromDraft(draft: OnboardingDraft): number | null {
  if (draft.heightUnit === 'cm') {
    const cm = Number(draft.heightCm);
    return Number.isFinite(cm) && cm > 0 ? cm : null;
  }
  const feet = Number(draft.heightFeet);
  if (!Number.isFinite(feet) || feet <= 0) return null;
  // Inches are optional: "6 ft" on its own is a complete answer.
  const inches = draft.heightInches.trim() === '' ? 0 : Number(draft.heightInches);
  if (!Number.isFinite(inches) || inches < 0 || inches >= 12) return null;
  return (feet * 12 + inches) * CM_PER_INCH;
}

export function birthDateFromDraft(draft: OnboardingDraft): string | null {
  const m = Number(draft.birthMonth);
  const d = Number(draft.birthDay);
  const y = Number(draft.birthYear);
  if (!Number.isInteger(m) || m < 1 || m > 12) return null;
  if (!Number.isInteger(d) || d < 1 || d > 31) return null;
  if (!Number.isInteger(y) || y < 1900) return null;
  // Reject a date the calendar doesn't have (31 February) by round-tripping it.
  const asDate = new Date(y, m - 1, d);
  if (asDate.getFullYear() !== y || asDate.getMonth() !== m - 1 || asDate.getDate() !== d) return null;
  const age = ageYearsFromBirthDate(`${y}-${m}-${d}`);
  if (age < 13 || age > 120) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function weightLbFromDraft(draft: OnboardingDraft): number | null {
  const lb = Number(draft.weightLb);
  return Number.isFinite(lb) && lb >= 50 && lb <= 1000 ? lb : null;
}

/** The lightest weight that still sits inside the healthy BMI range, in pounds. */
export function minHealthyWeightLb(heightCm: number): number {
  const meters = heightCm / 100;
  const kg = MIN_HEALTHY_BMI * meters * meters;
  return Math.ceil(kg / KG_PER_LB);
}

/**
 * Plain-language reason a goal weight can't be used, or null when it's fine.
 * Worded as information, not a scold — see PRODUCT.md.
 */
export function goalWeightProblem(draft: OnboardingDraft): string | null {
  if (!goalWantsGoalWeight(draft.goal)) return null;
  if (draft.goalWeightLb.trim() === '') return null; // optional; skipping is allowed
  const goalLb = Number(draft.goalWeightLb);
  if (!Number.isFinite(goalLb) || goalLb <= 0) return 'That doesn’t look like a weight.';
  const heightCm = heightCmFromDraft(draft);
  if (heightCm === null) return null; // can't judge it without a height; the height step catches that
  const floor = minHealthyWeightLb(heightCm);
  if (goalLb < floor) {
    return `For your height, ${floor} lb is the low end of the healthy range, so we can’t set a goal below it. You can still track without a goal weight.`;
  }
  return null;
}

/** True when every answer the math needs is present and usable. */
export function draftIsComplete(draft: OnboardingDraft): boolean {
  return (
    draft.sex !== null &&
    draft.goal !== null &&
    birthDateFromDraft(draft) !== null &&
    heightCmFromDraft(draft) !== null &&
    weightLbFromDraft(draft) !== null &&
    goalWeightProblem(draft) === null
  );
}

/** Runs the draft through `calcTargets`. Returns null while anything's missing. */
export function draftToTargets(draft: OnboardingDraft): TargetResult | null {
  const birthDate = birthDateFromDraft(draft);
  const heightCm = heightCmFromDraft(draft);
  const weightLb = weightLbFromDraft(draft);
  if (!draft.sex || !draft.goal || birthDate === null || heightCm === null || weightLb === null) return null;

  const steps = draft.stepsKnown ? Number(draft.dailySteps) : NaN;
  return calcTargets(
    { sex: draft.sex, ageYears: ageYearsFromBirthDate(birthDate), heightCm, weightLb },
    {
      dailySteps: Number.isFinite(steps) && steps >= 0 ? steps : null,
      lifestyleFallback: draft.lifestyle,
      liftingDaysPerWeek: draft.liftingDaysPerWeek,
      cardioMinutesPerWeek: draft.cardioMinutesPerWeek,
    },
    draft.goal
  );
}

export type FinalTargets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

/**
 * Commits onboarding: the profile, today's weight, and the first row of
 * target history. `targets` is passed in rather than recomputed because the
 * review screen lets people adjust the numbers before they land here.
 */
export async function saveOnboarding(draft: OnboardingDraft, targets: FinalTargets, edited: boolean): Promise<void> {
  const userId = await requireUserId();

  const birthDate = birthDateFromDraft(draft);
  const heightCm = heightCmFromDraft(draft);
  const weightLb = weightLbFromDraft(draft);
  if (birthDate === null || heightCm === null || weightLb === null || !draft.sex || !draft.goal) {
    throw new Error('Some answers are still missing.');
  }

  const goalWeight = goalWantsGoalWeight(draft.goal) && draft.goalWeightLb.trim() !== '' ? Number(draft.goalWeightLb) : null;

  const { error: profileError } = await supabase
    .from('profiles')
    .update({
      display_name: draft.displayName.trim() || null,
      sex: draft.sex,
      birth_date: birthDate,
      height_cm: Math.round(heightCm * 10) / 10,
      // When someone picks a lifestyle instead of a step count we store the
      // tier's stand-in number, since there's no column for "estimated". The
      // distinction is recorded in the target_history reason below.
      daily_steps: draft.stepsKnown && draft.dailySteps.trim() !== '' ? Math.round(Number(draft.dailySteps)) : null,
      lifting_days_per_week: draft.liftingDaysPerWeek,
      cardio_minutes_per_week: draft.cardioMinutesPerWeek,
      goal: draft.goal,
      goal_weight_lb: goalWeight,
      target_calories: targets.calories,
      target_protein: targets.protein,
      target_carbs: targets.carbs,
      target_fat: targets.fat,
      onboarded_at: new Date().toISOString(),
    })
    .eq('id', userId);
  if (profileError) throw profileError;

  const measuredOn = localDateString();
  const { error: weightError } = await supabase
    .from('weights')
    .upsert({ user_id: userId, measured_on: measuredOn, weight_lb: weightLb }, { onConflict: 'user_id,measured_on' });
  if (weightError) throw weightError;

  const reason = [
    'onboarding',
    edited ? 'adjusted by hand' : 'calculated',
    draft.stepsKnown ? null : `steps estimated from "${draft.lifestyle}" lifestyle`,
  ]
    .filter(Boolean)
    .join(' — ');

  const { error: historyError } = await supabase.from('target_history').insert({
    user_id: userId,
    effective_on: measuredOn,
    calories: targets.calories,
    protein: targets.protein,
    carbs: targets.carbs,
    fat: targets.fat,
    reason,
  });
  if (historyError) throw historyError;
}

/** Whether this account has finished onboarding. Drives the redirect on launch. */
export async function fetchHasOnboarded(): Promise<boolean> {
  const { data, error } = await supabase.from('profiles').select('onboarded_at').single();
  if (error) throw error;
  return data?.onboarded_at != null;
}
