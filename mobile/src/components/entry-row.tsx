import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Entry } from '@/lib/entries';

type EntryRowProps = {
  entry: Entry;
  onDelete?: (id: string) => void;
};

export function EntryRow({ entry, onDelete }: EntryRowProps) {
  return (
    <View style={styles.row}>
      <View style={styles.info}>
        <ThemedText>{entry.name}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {entry.qty ? `${entry.qty} · ` : ''}
          P {round1(entry.protein)} · C {round1(entry.carbs)} · F {round1(entry.fat)}
        </ThemedText>
      </View>
      <ThemedText type="smallBold">{Math.round(entry.calories)}</ThemedText>
      {onDelete && (
        <Pressable
          onPress={() => onDelete(entry.id)}
          hitSlop={10}
          style={styles.deleteButton}
          accessibilityLabel={`Delete ${entry.name}`}
        >
          <ThemedText themeColor="textSecondary">×</ThemedText>
        </Pressable>
      )}
    </View>
  );
}

function round1(n: number): string {
  return (Math.round(n * 10) / 10).toString();
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  deleteButton: {
    paddingHorizontal: Spacing.one,
  },
});
