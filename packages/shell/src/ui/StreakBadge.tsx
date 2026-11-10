import { View } from 'react-native';

import { useStreak } from '../habits/StreakProvider';
import { useTheme } from '../theme/ThemeProvider';
import { Text } from './Text';

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/** The current streak, today's status and any freezes held. */
export function StreakBadge() {
  const theme = useTheme();
  const streak = useStreak();
  if (!streak.ready) return null;

  const status =
    streak.status === 'done-today'
      ? 'Done for today'
      : streak.status === 'at-risk'
        ? streak.freezesNeededToday > 0
          ? `Play today to keep it. ${plural(streak.freezesNeededToday, 'freeze')} will be used.`
          : 'Play today to keep it going'
        : 'Play today to start a streak';

  return (
    <View
      accessibilityLabel={`${plural(streak.current, 'day')} streak. ${status}.`}
      style={{
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        padding: theme.spacing.md,
        gap: theme.spacing.xs,
      }}>
      <Text variant="title" color={streak.status === 'done-today' ? 'primary' : 'text'}>
        {plural(streak.current, 'day')}
      </Text>
      <Text color="textSecondary">{status}</Text>
      {streak.rules.maxFreezes > 0 ? (
        <Text variant="caption" color="textSecondary">
          {plural(streak.freezes, 'streak freeze')} available · Best {plural(streak.longest, 'day')}
        </Text>
      ) : (
        <Text variant="caption" color="textSecondary">
          Best {plural(streak.longest, 'day')}
        </Text>
      )}
    </View>
  );
}
