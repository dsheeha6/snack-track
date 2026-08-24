// Shared furniture for the onboarding steps: the page frame with its progress
// dots and Back/Next, a choice grid, and a labelled number box. Kept in one
// place so every step looks identical and no step invents its own layout.

import { Pressable, ScrollView, StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, MaxContentWidth, Spacing } from '@/constants/theme';

export function ProgressDots({ step, total }: { step: number; total: number }) {
  return (
    <View style={styles.dots}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[styles.dot, i <= step && styles.dotFilled]} />
      ))}
    </View>
  );
}

type StepShellProps = {
  step: number;
  total: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  /** Shown under the button — a reason the person can act on, never a telling-off. */
  hint?: string | null;
  /** Optional third action, e.g. "Skip for now". */
  onSkip?: () => void;
  skipLabel?: string;
};

export function StepShell({
  step,
  total,
  title,
  subtitle,
  children,
  onBack,
  onNext,
  nextLabel = 'Next',
  nextDisabled = false,
  hint,
  onSkip,
  skipLabel = 'Skip for now',
}: StepShellProps) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>
            <ProgressDots step={step} total={total} />
            <ThemedText type="subtitle" style={styles.title}>
              {title}
            </ThemedText>
            {subtitle ? (
              <ThemedText themeColor="textSecondary" style={styles.subtitle}>
                {subtitle}
              </ThemedText>
            ) : null}

            <View style={styles.body}>{children}</View>

            {hint ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
                {hint}
              </ThemedText>
            ) : null}

            <Pressable
              onPress={onNext}
              disabled={nextDisabled}
              style={[styles.primary, nextDisabled && styles.disabled]}
            >
              <ThemedText style={styles.primaryText}>{nextLabel}</ThemedText>
            </Pressable>

            <View style={styles.footer}>
              {onBack ? (
                <Pressable onPress={onBack} hitSlop={8} style={styles.footerButton}>
                  <ThemedText type="linkPrimary">Back</ThemedText>
                </Pressable>
              ) : (
                <View style={styles.footerButton} />
              )}
              {onSkip ? (
                <Pressable onPress={onSkip} hitSlop={8} style={styles.footerButton}>
                  <ThemedText type="link" themeColor="textSecondary" style={styles.skip}>
                    {skipLabel}
                  </ThemedText>
                </Pressable>
              ) : (
                <View style={styles.footerButton} />
              )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

export type Choice<T> = { value: T; label: string; caption?: string; color?: string };

export function ChoiceGroup<T extends string | number>({
  options,
  value,
  onChange,
  columns = 1,
}: {
  options: Choice<T>[];
  value: T | null;
  onChange: (value: T) => void;
  columns?: number;
}) {
  return (
    <View style={[styles.choices, columns > 1 && styles.choicesGrid]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={String(option.value)}
            onPress={() => onChange(option.value)}
            style={[
              styles.choice,
              columns > 1 && { flexBasis: `${100 / columns}%`, flexGrow: 1 },
              selected && styles.choiceSelected,
              selected && option.color ? { borderColor: option.color, backgroundColor: `${option.color}22` } : null,
            ]}
          >
            <ThemedText type="smallBold">{option.label}</ThemedText>
            {option.caption ? (
              <ThemedText type="small" themeColor="textSecondary">
                {option.caption}
              </ThemedText>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function NumberField({
  value,
  onChange,
  placeholder,
  suffix,
  label,
  keyboardType = 'numeric',
  maxLength,
  flex = 1,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  suffix?: string;
  label?: string;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  flex?: number;
}) {
  return (
    <View style={[styles.fieldWrap, { flex }]}>
      {label ? (
        <ThemedText type="small" themeColor="textSecondary">
          {label}
        </ThemedText>
      ) : null}
      <View style={styles.fieldRow}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor="#9098a3"
          keyboardType={keyboardType}
          maxLength={maxLength}
          style={styles.input}
        />
        {suffix ? (
          <ThemedText themeColor="textSecondary" style={styles.suffix}>
            {suffix}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: Spacing.five,
  },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.three,
  },
  dots: {
    flexDirection: 'row',
    gap: Spacing.one + 2,
  },
  dot: {
    width: 22,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#1E1B1614',
  },
  dotFilled: {
    backgroundColor: Brand.green,
  },
  title: {
    fontSize: 28,
    lineHeight: 36,
  },
  subtitle: {
    marginTop: -Spacing.two,
  },
  body: {
    gap: Spacing.three,
    paddingTop: Spacing.one,
  },
  hint: {
    marginTop: -Spacing.one,
  },
  primary: {
    marginTop: 'auto',
    backgroundColor: Brand.green,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  primaryText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.4,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerButton: {
    minWidth: 80,
  },
  skip: {
    textAlign: 'right',
  },
  choices: {
    gap: Spacing.two,
  },
  choicesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  choice: {
    borderWidth: 2,
    borderColor: '#1E1B1622',
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    backgroundColor: Brand.paper,
    gap: 2,
  },
  choiceSelected: {
    borderColor: Brand.green,
    backgroundColor: '#12A15015',
  },
  fieldWrap: {
    gap: Spacing.one,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#1E1B1622',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 4,
    fontSize: 18,
    color: Brand.ink,
    backgroundColor: Brand.paper,
  },
  suffix: {
    minWidth: 28,
  },
});
