import { View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

export function ProgressBar({ progress, label }: { progress: number; label: string }) {
  const theme = useTheme();
  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}
      style={{
        height: theme.spacing.sm,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.surface,
        overflow: 'hidden',
      }}>
      <View
        style={{
          width: `${percent}%`,
          height: '100%',
          borderRadius: theme.radius.pill,
          backgroundColor: theme.colors.primary,
        }}
      />
    </View>
  );
}
