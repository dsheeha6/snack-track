import { useState } from 'react';
import { Modal, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Brand, Spacing } from '@/constants/theme';
import { TAP_OUNCES } from '@/lib/water';

type WaterCardProps = {
  /** Total ounces logged for the day. */
  ounces: number;
  target: number;
  onAdd: (ounces: number) => void;
  /** Removes the most recent tap. Omitted when there's nothing to undo. */
  onUndo?: () => void;
  onChangeTarget: (ounces: number) => void;
};

// Hydration widget. Blue so it reads as its own thing next to the macro card,
// and never a warning color: being under your water goal is information, not a
// failure — same no-scold rule as the calorie bar (PRODUCT.md).
export function WaterCard({ ounces, target, onAdd, onUndo, onChangeTarget }: WaterCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  // Bumped on the way open so the sheet below remounts with empty fields and
  // the current goal. It deliberately doesn't change on close, so the sheet
  // that slides away is still the one the user was looking at.
  const [sheetKey, setSheetKey] = useState(0);
  const openSheet = () => {
    setSheetKey((k) => k + 1);
    setSheetOpen(true);
  };
  const pct = target > 0 ? ounces / target : 0;
  const widthPct = Math.max(0, Math.min(1, pct)) * 100;
  const remaining = target - ounces;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={styles.dot} />
          <ThemedText type="smallBold">water</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {round(ounces)} / {round(target)} oz
        </ThemedText>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${widthPct}%` }]} />
      </View>

      <ThemedText type="small" themeColor="textSecondary">
        {remaining > 0 ? `${round(remaining)} oz to go` : 'Goal reached — nice.'}
      </ThemedText>

      <View style={styles.actions}>
        <Pressable onPress={() => onAdd(TAP_OUNCES)} style={styles.addButton}>
          <ThemedText style={styles.addButtonText}>+ {TAP_OUNCES} oz</ThemedText>
        </Pressable>
        <Pressable onPress={openSheet} hitSlop={8} style={styles.secondary}>
          <ThemedText type="linkPrimary">custom</ThemedText>
        </Pressable>
        {onUndo && (
          <Pressable onPress={onUndo} hitSlop={8} style={styles.secondary}>
            <ThemedText type="linkPrimary">undo</ThemedText>
          </Pressable>
        )}
      </View>

      <WaterSheet
        key={sheetKey}
        visible={sheetOpen}
        target={target}
        onClose={() => setSheetOpen(false)}
        onAdd={(oz) => {
          onAdd(oz);
          setSheetOpen(false);
        }}
        onChangeTarget={(oz) => {
          onChangeTarget(oz);
          setSheetOpen(false);
        }}
      />
    </ThemedView>
  );
}

// Custom amount and the editable daily goal live together. The goal has no
// settings screen to live on yet (that's Phase 3) and putting it here keeps
// "editable" true today without inventing one.
//
// Mounted fresh on every open (see `sheetKey`), so both fields simply start
// from their initial values -- no effect re-seeding them after the fact.
function WaterSheet({
  visible,
  target,
  onClose,
  onAdd,
  onChangeTarget,
}: {
  visible: boolean;
  target: number;
  onClose: () => void;
  onAdd: (ounces: number) => void;
  onChangeTarget: (ounces: number) => void;
}) {
  const [amount, setAmount] = useState('');
  const [goal, setGoal] = useState(String(round(target)));

  const amountValue = Number(amount);
  const amountValid = Number.isFinite(amountValue) && amountValue > 0;
  const goalValue = Number(goal);
  // Any sensible number can be saved, including the one already set. Greying
  // Save out when the value matches the current goal was defensible as "nothing
  // to do", but it reads as a broken button: the field opens pre-filled, so the
  // very first thing someone sees is a disabled Save next to their own number.
  // Re-saving the same value costs one request and nothing else.
  const goalValid = Number.isFinite(goalValue) && goalValue > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Swallows taps so pressing inside the sheet doesn't dismiss it. */}
        <Pressable style={styles.sheetWrap} onPress={() => {}}>
          <ThemedView type="backgroundElement" style={styles.sheet}>
            <View style={styles.headerRow}>
              <ThemedText type="subtitle">Water</ThemedText>
              <Pressable onPress={onClose} hitSlop={10}>
                <ThemedText type="linkPrimary">Close</ThemedText>
              </Pressable>
            </View>

            <ThemedText type="small" themeColor="textSecondary">
              Add a custom amount
            </ThemedText>
            <View style={styles.inputRow}>
              <TextInput
                value={amount}
                onChangeText={setAmount}
                placeholder="12"
                placeholderTextColor="#9098a3"
                keyboardType="numeric"
                style={styles.input}
              />
              <ThemedText themeColor="textSecondary">oz</ThemedText>
              <Pressable
                onPress={() => amountValid && onAdd(amountValue)}
                disabled={!amountValid}
                style={[styles.sheetButton, !amountValid && styles.disabled]}
              >
                <ThemedText style={styles.sheetButtonText}>Add</ThemedText>
              </Pressable>
            </View>

            <View style={styles.divider} />

            <ThemedText type="small" themeColor="textSecondary">
              Daily goal
            </ThemedText>
            <View style={styles.inputRow}>
              <TextInput
                value={goal}
                onChangeText={setGoal}
                placeholder="64"
                placeholderTextColor="#9098a3"
                keyboardType="numeric"
                style={styles.input}
              />
              <ThemedText themeColor="textSecondary">oz</ThemedText>
              <Pressable
                onPress={() => goalValid && onChangeTarget(goalValue)}
                disabled={!goalValid}
                style={[styles.sheetButton, !goalValid && styles.disabled]}
              >
                <ThemedText style={styles.sheetButtonText}>Save</ThemedText>
              </Pressable>
            </View>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function round(n: number): number {
  return Math.round(n);
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Brand.blue,
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
    backgroundColor: Brand.blue,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.one,
  },
  addButton: {
    backgroundColor: Brand.blue,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.four,
  },
  addButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  secondary: {
    paddingVertical: Spacing.two,
  },
  backdrop: {
    flex: 1,
    backgroundColor: '#1E1B1655',
    justifyContent: 'flex-end',
  },
  sheetWrap: {
    width: '100%',
  },
  sheet: {
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.two,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#1E1B1622',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + 2,
    fontSize: 16,
    color: Brand.ink,
    backgroundColor: Brand.paper,
  },
  sheetButton: {
    backgroundColor: Brand.blue,
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two + 2,
    paddingHorizontal: Spacing.four,
  },
  sheetButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.5,
  },
  divider: {
    height: 1,
    backgroundColor: '#1E1B1614',
    marginVertical: Spacing.two,
  },
});
