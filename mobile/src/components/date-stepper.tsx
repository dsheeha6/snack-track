import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';
import { dayLabel, localDateString, shiftDate } from '@/lib/meals';

type DateStepperProps = {
  date: string;
  onChange: (date: string) => void;
  /** Latest day you can step to. Defaults to today: you log what you ate, not what you will. */
  max?: string;
};

/**
 * ‹ Yesterday › — one tap back a day, one tap forward.
 *
 * Stepping rather than a calendar because the case this exists for is "I forgot
 * Thursday, it's Friday": one tap. A calendar is a modal to open and a date to
 * hunt for, for the same answer.
 */
export function DateStepper({ date, onChange, max = localDateString() }: DateStepperProps) {
  const atMax = date >= max;
  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => onChange(shiftDate(date, -1))}
        hitSlop={10}
        style={styles.arrow}
        accessibilityLabel="Previous day"
      >
        <ThemedText style={styles.arrowText}>‹</ThemedText>
      </Pressable>
      <Pressable
        onPress={() => onChange(max)}
        disabled={atMax}
        hitSlop={6}
        accessibilityLabel={atMax ? dayLabel(date) : `${dayLabel(date)}, tap to jump to today`}
      >
        <ThemedText type="smallBold" style={styles.label}>
          {dayLabel(date)}
        </ThemedText>
      </Pressable>
      <Pressable
        onPress={() => onChange(shiftDate(date, 1))}
        disabled={atMax}
        hitSlop={10}
        style={[styles.arrow, atMax && styles.arrowDisabled]}
        accessibilityLabel="Next day"
      >
        <ThemedText style={styles.arrowText}>›</ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
  },
  arrow: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisabled: {
    opacity: 0.25,
  },
  arrowText: {
    fontSize: 28,
    lineHeight: 32,
    color: Brand.blue,
  },
  label: {
    minWidth: 110,
    textAlign: 'center',
  },
});
