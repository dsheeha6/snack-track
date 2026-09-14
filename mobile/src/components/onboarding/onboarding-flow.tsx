// The onboarding flow: eight steps, one screen each, all state held here so
// Back never loses an answer. The last screen before the finish shows the
// arithmetic (see targets-review.tsx); the one after it is the first log.
//
// Copy rule for every string in here, from PRODUCT.md: would it feel bad to
// read on a day someone already feels bad? Nothing asks why, nothing implies
// a right answer, and every optional question says so.

import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';

import { AddEntryModal } from '@/components/add-entry-modal';
import { ChoiceGroup, NumberField, StepShell } from '@/components/onboarding/onboarding-ui';
import { TargetsReview } from '@/components/onboarding/targets-review';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { addEntries, addEntry, type NewEntry } from '@/lib/entries';
import { guessMealSlot, localDateString } from '@/lib/meals';
import {
  EMPTY_DRAFT,
  birthDateFromDraft,
  goalWantsGoalWeight,
  goalWeightProblem,
  heightCmFromDraft,
  saveOnboarding,
  weightLbFromDraft,
  type FinalTargets,
  type OnboardingDraft,
  draftToTargets,
} from '@/lib/onboarding';
import type { Goal, LifestyleFallback, Sex } from '@/lib/targets';

const TOTAL_STEPS = 8;

const SEX_OPTIONS: { value: Sex; label: string; caption?: string }[] = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Something else', caption: 'We split the difference in the formula' },
];

const LIFESTYLE_OPTIONS: { value: LifestyleFallback; label: string; caption: string }[] = [
  { value: 'desk', label: 'Mostly sitting', caption: 'Desk job, driving, working from home' },
  { value: 'on_feet', label: 'On my feet a fair bit', caption: 'Teaching, retail, parenting, errands' },
  { value: 'physical', label: 'Moving all day', caption: 'Trades, nursing, warehouse, hospitality' },
];

const CARDIO_OPTIONS: { value: number; label: string; caption: string }[] = [
  { value: 0, label: 'None right now', caption: '' },
  { value: 30, label: 'A bit', caption: 'Under an hour a week' },
  { value: 120, label: 'A few hours', caption: '1–3 hours a week' },
  { value: 240, label: 'A lot', caption: '3+ hours a week' },
];

const GOAL_OPTIONS: { value: Goal; label: string; caption: string; color: string }[] = [
  { value: 'cut', label: 'Lose weight', caption: 'A steady deficit, nothing drastic', color: Brand.blue },
  { value: 'recomp', label: 'Stay about the same', caption: 'Recomp — a little under, plenty of protein', color: Brand.green },
  { value: 'bulk', label: 'Gain weight', caption: 'A small surplus', color: Brand.purple },
  { value: 'track', label: 'Just curious', caption: 'No target to hit, just the numbers', color: Brand.yellow },
];

export function OnboardingFlow() {
  const router = useRouter();
  const { markOnboarded } = useAuth();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<OnboardingDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logged, setLogged] = useState<string | null>(null);

  const set = <K extends keyof OnboardingDraft>(key: K, value: OnboardingDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  const targets = useMemo(() => draftToTargets(draft), [draft]);
  const goalWeightIssue = goalWeightProblem(draft);

  const finish = async (final: FinalTargets, edited: boolean) => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveOnboarding(draft, final, edited);
      // Tells the root gate this account is done, so the last step and the
      // Today screen aren't redirected straight back here.
      markOnboarded();
      next();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not save that. Try again?');
    } finally {
      setSaving(false);
    }
  };

  // `logged` holds a finished sentence rather than a bare name, because one
  // typed sentence can log four foods and "eggs and 3 more is on today's list"
  // does not read like English.
  const handleFirstLog = async (entry: NewEntry) => {
    const saved = await addEntry(entry);
    setLogged(`${saved.name} is on today's list.`);
    setLogOpen(false);
  };

  const handleFirstLogMany = async (entries: NewEntry[]) => {
    const saved = await addEntries(entries);
    setLogged(
      saved.length === 1
        ? `${saved[0].name} is on today's list.`
        : `All ${saved.length} are on today's list.`
    );
    setLogOpen(false);
  };

  switch (step) {
    case 0:
      return (
        <StepShell
          step={0}
          total={TOTAL_STEPS}
          title="Welcome to SNACK TRACK"
          subtitle="A few questions so the numbers mean something. Under a minute, and you can change any of it later."
          onNext={next}
          nextLabel="Let's go"
        >
          <NumberField
            label="What should we call you?"
            value={draft.displayName}
            onChange={(v) => set('displayName', v)}
            placeholder="Your name"
            keyboardType="default"
          />
          <ThemedText type="small" themeColor="textSecondary">
            Optional. It only shows up in the app, to you.
          </ThemedText>
        </StepShell>
      );

    case 1:
      return (
        <StepShell
          step={1}
          total={TOTAL_STEPS}
          title="A bit about you"
          subtitle="The calorie formula needs these two. That's the only reason we ask."
          onBack={back}
          onNext={next}
          nextDisabled={draft.sex === null || birthDateFromDraft(draft) === null}
        >
          <ChoiceGroup options={SEX_OPTIONS} value={draft.sex} onChange={(v) => set('sex', v)} />
          <View>
            <ThemedText type="small" themeColor="textSecondary">
              Date of birth
            </ThemedText>
            <View style={styles.row}>
              <NumberField
                value={draft.birthMonth}
                onChange={(v) => set('birthMonth', v)}
                placeholder="MM"
                maxLength={2}
              />
              <NumberField value={draft.birthDay} onChange={(v) => set('birthDay', v)} placeholder="DD" maxLength={2} />
              <NumberField
                value={draft.birthYear}
                onChange={(v) => set('birthYear', v)}
                placeholder="YYYY"
                maxLength={4}
                flex={1.4}
              />
            </View>
          </View>
        </StepShell>
      );

    case 2:
      return (
        <StepShell
          step={2}
          total={TOTAL_STEPS}
          title="Height and weight"
          subtitle="Weight goes in your history so you can see it move — or not. Either is fine."
          onBack={back}
          onNext={next}
          nextDisabled={heightCmFromDraft(draft) === null || weightLbFromDraft(draft) === null}
        >
          <View>
            <View style={styles.labelRow}>
              <ThemedText type="small" themeColor="textSecondary">
                Height
              </ThemedText>
              <Pressable
                onPress={() => set('heightUnit', draft.heightUnit === 'ftin' ? 'cm' : 'ftin')}
                hitSlop={8}
              >
                <ThemedText type="linkPrimary">
                  {draft.heightUnit === 'ftin' ? 'Use centimetres' : 'Use feet and inches'}
                </ThemedText>
              </Pressable>
            </View>
            {draft.heightUnit === 'ftin' ? (
              <View style={styles.row}>
                <NumberField
                  value={draft.heightFeet}
                  onChange={(v) => set('heightFeet', v)}
                  placeholder="5"
                  suffix="ft"
                  maxLength={1}
                />
                <NumberField
                  value={draft.heightInches}
                  onChange={(v) => set('heightInches', v)}
                  placeholder="10"
                  suffix="in"
                  maxLength={2}
                />
              </View>
            ) : (
              <NumberField
                value={draft.heightCm}
                onChange={(v) => set('heightCm', v)}
                placeholder="178"
                suffix="cm"
                maxLength={3}
              />
            )}
          </View>
          <NumberField
            label="Weight"
            value={draft.weightLb}
            onChange={(v) => set('weightLb', v)}
            placeholder="165"
            suffix="lb"
            maxLength={4}
          />
        </StepShell>
      );

    case 3:
      return (
        <StepShell
          step={3}
          total={TOTAL_STEPS}
          title="How much do you move?"
          subtitle="Rough is fine. This is the biggest lever on the number, and nobody knows it exactly."
          onBack={back}
          onNext={next}
          nextDisabled={draft.stepsKnown && draft.dailySteps.trim() === ''}
        >
          {draft.stepsKnown ? (
            <>
              <NumberField
                label="Steps on a typical day"
                value={draft.dailySteps}
                onChange={(v) => set('dailySteps', v)}
                placeholder="8000"
                maxLength={6}
              />
              <Pressable onPress={() => set('stepsKnown', false)} hitSlop={8}>
                <ThemedText type="linkPrimary">I don&apos;t track my steps</ThemedText>
              </Pressable>
            </>
          ) : (
            <>
              <ChoiceGroup
                options={LIFESTYLE_OPTIONS}
                value={draft.lifestyle}
                onChange={(v) => set('lifestyle', v)}
              />
              <Pressable onPress={() => set('stepsKnown', true)} hitSlop={8}>
                <ThemedText type="linkPrimary">Actually, I know my step count</ThemedText>
              </Pressable>
            </>
          )}
        </StepShell>
      );

    case 4:
      return (
        <StepShell
          step={4}
          total={TOTAL_STEPS}
          title="Any training?"
          subtitle="Zero is a perfectly normal answer."
          onBack={back}
          onNext={next}
        >
          <View>
            <ThemedText type="small" themeColor="textSecondary">
              Days a week you lift
            </ThemedText>
            <ChoiceGroup
              columns={4}
              options={[0, 1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: n, label: String(n) }))}
              value={draft.liftingDaysPerWeek}
              onChange={(v) => set('liftingDaysPerWeek', v)}
            />
          </View>
          <View>
            <ThemedText type="small" themeColor="textSecondary">
              Cardio — running, cycling, classes, anything
            </ThemedText>
            <ChoiceGroup
              options={CARDIO_OPTIONS}
              value={draft.cardioMinutesPerWeek}
              onChange={(v) => set('cardioMinutesPerWeek', v)}
            />
          </View>
        </StepShell>
      );

    case 5:
      return (
        <StepShell
          step={5}
          total={TOTAL_STEPS}
          title="What are you after?"
          subtitle="All four are equally valid, and you can switch whenever you like."
          onBack={back}
          onNext={next}
          nextDisabled={draft.goal === null || goalWeightIssue !== null}
          hint={goalWeightIssue}
        >
          <ChoiceGroup options={GOAL_OPTIONS} value={draft.goal} onChange={(v) => set('goal', v)} />
          {goalWantsGoalWeight(draft.goal) ? (
            <>
              <NumberField
                label="Goal weight, if you have one"
                value={draft.goalWeightLb}
                onChange={(v) => set('goalWeightLb', v)}
                placeholder="Optional"
                suffix="lb"
                maxLength={4}
              />
              <ThemedText type="small" themeColor="textSecondary">
                Leave it blank if you&apos;d rather not pick a number. Nothing here depends on it.
              </ThemedText>
            </>
          ) : null}
        </StepShell>
      );

    case 6:
      if (!targets) {
        // Only reachable if an earlier answer got cleared; send them back to it
        // rather than showing a broken sum.
        return (
          <StepShell
            step={6}
            total={TOTAL_STEPS}
            title="One thing's missing"
            subtitle="Go back a step or two and we'll have everything we need."
            onBack={back}
            onNext={back}
            nextLabel="Go back"
          >
            <View />
          </StepShell>
        );
      }
      return (
        <TargetsReview
          step={6}
          total={TOTAL_STEPS}
          draft={draft}
          targets={targets}
          saving={saving}
          error={saveError}
          onBack={back}
          onDone={finish}
        />
      );

    default:
      return (
        <>
          <StepShell
            step={7}
            total={TOTAL_STEPS}
            title={logged ? 'That’s it — you’re tracking' : 'Want to log something now?'}
            subtitle={
              logged
                ? `${logged} Everything else works the same way.`
                : 'Whatever you last ate. Or skip it — the app works just as well starting tomorrow.'
            }
            onNext={() => router.replace('/(tabs)/today')}
            nextLabel="Take me to today"
            onSkip={logged ? undefined : () => router.replace('/(tabs)/today')}
            skipLabel="Not right now"
          >
            {logged ? null : (
              <Pressable onPress={() => setLogOpen(true)} style={styles.secondaryButton}>
                <ThemedText style={styles.secondaryButtonText}>Log something</ThemedText>
              </Pressable>
            )}
            <ThemedView type="backgroundElement" style={styles.tipCard}>
              <ThemedText type="smallBold">Two things worth knowing</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Going over your target isn&apos;t a failure — it&apos;s just information, and the app will never
                treat it as anything else.
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Missing days is normal. Come back after a week off and you&apos;ll get a normal screen.
              </ThemedText>
            </ThemedView>
          </StepShell>

          <AddEntryModal
            visible={logOpen}
            defaultMeal={guessMealSlot()}
            eatenOn={localDateString()}
            onClose={() => setLogOpen(false)}
            onSave={handleFirstLog}
            onSaveMany={handleFirstLogMany}
          />
        </>
      );
  }
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'flex-end',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  secondaryButton: {
    borderWidth: 2,
    borderColor: Brand.green,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: Brand.green,
    fontSize: 16,
    fontWeight: '700',
  },
  tipCard: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
  },
});
