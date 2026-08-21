import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Brand, Spacing } from '@/constants/theme';

type MacroBarProps = {
  label: string;
  current: number;
  target: number;
  unit: string;
  /** Fixed bar color. Omit for the calories bar, which shades by how close to target. */
  color?: string;
};

// "Over" is shown as a plain color and number, never a warning — PRODUCT.md:
// no red states for going over, no scold. Coral here just means "over", same
// as the prototype's bottle fill, not an alert.
function calorieColor(pct: number): string {
  if (pct > 1.05) return Brand.coral;
  if (pct > 0.85) return Brand.green;
  return Brand.lime;
}

export function MacroBar({ label, current, target, unit, color }: MacroBarProps) {
  const pct = target > 0 ? current / target : 0;
  const barColor = color ?? calorieColor(pct);
  const widthPct = Math.max(0, Math.min(1, pct)) * 100;
  const remaining = target - current;

  return (
    <View style={styles.row}>
      <View style={styles.labelRow}>
        <ThemedText type="smallBold">{label}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {Math.round(current)} / {Math.round(target)}
          {unit}
        </ThemedText>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${widthPct}%`, backgroundColor: barColor }]} />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {remaining >= 0
          ? `${Math.round(remaining)}${unit} left`
          : `${Math.round(-remaining)}${unit} over`}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.one,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  track: {
    height: 10,
    borderRadius: Spacing.one,
    backgroundColor: '#1E1B1614',
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Spacing.one,
  },
});
