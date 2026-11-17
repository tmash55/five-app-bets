import { Text, useTheme } from '@five/shell';
import { View } from 'react-native';

/** "2 of 5 picked" with a bar, as in the Today mockup. */
export function SlateProgress({ picked, total }: { picked: number; total: number }) {
  const theme = useTheme();
  const share = total > 0 ? picked / total : 0;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: total, now: picked }}
        style={{
          flex: 1,
          height: theme.spacing.sm,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.surfaceSelected,
          overflow: 'hidden',
        }}>
        <View
          style={{
            width: `${Math.round(share * 100)}%`,
            height: '100%',
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.primary,
          }}
        />
      </View>
      <Text variant="caption" color="textSecondary">
        {picked} of {total} picked
      </Text>
    </View>
  );
}
