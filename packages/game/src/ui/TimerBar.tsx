import { useTheme } from '@five/shell';
import { View } from 'react-native';

/** A horizontal bar that empties as time runs out. Turns to the danger color near the end. */
export function TimerBar({
  fraction,
  label,
  warnBelow = 0.2,
}: {
  /** 1 when full, 0 when time is up. */
  fraction: number;
  label: string;
  warnBelow?: number;
}) {
  const theme = useTheme();
  const clamped = Math.min(1, Math.max(0, fraction));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={{
        height: theme.spacing.sm,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
      }}>
      <View
        style={{
          height: '100%',
          width: `${clamped * 100}%`,
          borderRadius: theme.radius.pill,
          backgroundColor: clamped < warnBelow ? theme.colors.danger : theme.colors.primary,
        }}
      />
    </View>
  );
}
