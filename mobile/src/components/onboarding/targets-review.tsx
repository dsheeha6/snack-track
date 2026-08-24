// The "here's where that number came from" step. PRODUCT.md's whole pitch is
// that this app doesn't hand over a figure nobody can audit, so every line of
// the calculation is on screen — and every number is editable, because a
// formula is a starting point, not a verdict.

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { NumberField, StepShell } from '@/components/onboarding/onboarding-ui';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import {
  CALORIE_FLOOR,
  type ActivityTier,
  type Goal,
  type TargetResult,
} from '@/lib/targets';
import type { FinalTargets, OnboardingDraft } from '@/lib/onboarding';

const TIER_LABELS: Record<ActivityTier, string> = {
  sedentary: 'not very active',
  light: 'lightly active',
  moderate: 'moderately active',
  very: 'very active',
  extra: 'extremely active',
};

const GOAL_LINES: Record<Goal, string> = {
  cut: 'losing weight',
  recomp: 'staying about the same weight',
  bulk: 'gaining weight',
  track: 'just tracking',
};

type Props = {
  step: number;
  total: number;
  draft: OnboardingDraft;
  targets: TargetResult;
  saving: boolean;
  error: string | null;
  onBack: () => void;
  onDone: (final: FinalTargets, edited: boolean) => void;
};

export function TargetsReview({ step, total, draft, targets, saving, error, onBack, onDone }: Props) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    calories: String(targets.calories),
    protein: String(targets.protein),
    carbs: String(targets.carbs),
    fat: String(targets.fat),
  });

  const parsed = {
    calories: Number(form.calories),
    protein: Number(form.protein),
    carbs: Number(form.carbs),
    fat: Number(form.fat),
  };
  const editsValid = Object.values(parsed).every((n) => Number.isFinite(n) && n >= 0 && n <= 20000);

  const final: FinalTargets = editing
    ? {
        calories: Math.round(parsed.calories),
        protein: Math.round(parsed.protein),
        carbs: Math.round(parsed.carbs),
        fat: Math.round(parsed.fat),
      }
    : {
        calories: targets.calories,
        protein: targets.protein,
        carbs: targets.carbs,
        fat: targets.fat,
      };

  // The floor applies to whatever number is actually about to be saved, not
  // just the calculated one — otherwise editing would walk straight past it.
  const belowFloor = editsValid && final.calories < CALORIE_FLOOR;
  const floorWarning = belowFloor
    ? `That's under ${CALORIE_FLOOR} calories a day — low enough that it's worth talking to a doctor or dietitian before starting. You can still continue.`
    : null;

  const sign = targets.goalAdjustment >= 0 ? '+' : '−';
  const adjustment = Math.abs(targets.goalAdjustment);

  return (
    <StepShell
      step={step}
      total={total}
      title="Here are your numbers"
      subtitle="And exactly where they came from. Change anything that doesn't look right."
      onBack={onBack}
      onNext={() => onDone(final, editing)}
      nextLabel={saving ? 'Saving…' : 'Looks good'}
      nextDisabled={saving || (editing && !editsValid)}
      hint={error ?? floorWarning}
    >
      <ThemedView type="backgroundElement" style={styles.headline}>
        <ThemedText style={styles.bigNumber}>{final.calories}</ThemedText>
        <ThemedText themeColor="textSecondary">calories a day</ThemedText>
        <View style={styles.macroRow}>
          <Macro label="protein" grams={final.protein} color={Brand.coral} />
          <Macro label="carbs" grams={final.carbs} color={Brand.yellow} />
          <Macro label="fat" grams={final.fat} color={Brand.teal} />
        </View>
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">The maths</ThemedText>
        <Line
          label="What your body burns at rest"
          detail="Mifflin-St Jeor, from your height, weight, age and sex"
          value={`${targets.bmr} cal`}
        />
        <Line
          label={`Because you're ${TIER_LABELS[targets.activityTier]}`}
          detail={`× ${targets.activityMultiplier}`}
          value={`${targets.tdee} cal`}
        />
        <Line
          label={`Because you're aiming at ${GOAL_LINES[draft.goal ?? 'track']}`}
          detail={targets.goalAdjustment === 0 ? 'no change' : `${sign} ${adjustment} cal`}
          value={`${targets.calories} cal`}
          emphasis
        />
        <View style={styles.divider} />
        <Line label="Protein" detail="about 1 g per pound of bodyweight" value={`${targets.protein} g`} />
        <Line label="Fat" detail="about 0.45 g per pound" value={`${targets.fat} g`} />
        <Line label="Carbs" detail="whatever calories are left over" value={`${targets.carbs} g`} />
      </ThemedView>

      {editing ? (
        <ThemedView type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">Your numbers</ThemedText>
          <View style={styles.editRow}>
            <NumberField
              label="calories"
              value={form.calories}
              onChange={(v) => setForm((f) => ({ ...f, calories: v }))}
            />
            <NumberField
              label="protein"
              suffix="g"
              value={form.protein}
              onChange={(v) => setForm((f) => ({ ...f, protein: v }))}
            />
          </View>
          <View style={styles.editRow}>
            <NumberField
              label="carbs"
              suffix="g"
              value={form.carbs}
              onChange={(v) => setForm((f) => ({ ...f, carbs: v }))}
            />
            <NumberField
              label="fat"
              suffix="g"
              value={form.fat}
              onChange={(v) => setForm((f) => ({ ...f, fat: v }))}
            />
          </View>
          {!editsValid ? (
            <ThemedText type="small" style={styles.problem}>
              Those need to be plain numbers.
            </ThemedText>
          ) : null}
        </ThemedView>
      ) : (
        <Pressable onPress={() => setEditing(true)} hitSlop={8} style={styles.editToggle}>
          <ThemedText type="linkPrimary">Set my own numbers instead</ThemedText>
        </Pressable>
      )}

      {targets.floorWarning && !belowFloor ? (
        <ThemedText type="small" themeColor="textSecondary">
          {targets.floorWarning}
        </ThemedText>
      ) : null}

      <ThemedText type="small" themeColor="textSecondary">
        You can change all of this later, as often as you like.
      </ThemedText>
    </StepShell>
  );
}

function Macro({ label, grams, color }: { label: string; grams: number; color: string }) {
  return (
    <View style={styles.macro}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <ThemedText type="smallBold">{grams}g</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function Line({
  label,
  detail,
  value,
  emphasis,
}: {
  label: string;
  detail: string;
  value: string;
  emphasis?: boolean;
}) {
  return (
    <View style={styles.line}>
      <View style={styles.lineLeft}>
        <ThemedText type="small">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      </View>
      <ThemedText type={emphasis ? 'smallBold' : 'small'}>{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  headline: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.one,
  },
  bigNumber: {
    fontSize: 56,
    lineHeight: 64,
    fontWeight: '700',
    color: Brand.ink,
  },
  macroRow: {
    flexDirection: 'row',
    gap: Spacing.four,
    marginTop: Spacing.two,
  },
  macro: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  macroDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  lineLeft: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#1E1B1614',
    marginVertical: Spacing.two,
  },
  editRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  editToggle: {
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  problem: {
    color: Brand.coral,
  },
});
