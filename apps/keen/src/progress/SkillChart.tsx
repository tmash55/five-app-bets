import { Text, useTheme } from '@five/shell';
import { View } from 'react-native';

import { MAX_SKILL_SCORE } from '@/skills/skills';

/** Short date for chart labels, from YYYY-MM-DD: "Nov 10". */
function shortDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * A skill's score over time: one column per day played, scaled to 1000.
 * Drawn with plain views so every size and color comes from the theme.
 */
export function SkillChart({ label, points }: { label: string; points: { date: string; score: number }[] }) {
  const theme = useTheme();
  const latest = points.at(-1);
  const chartHeight = theme.spacing.xxl * 2;

  return (
    <View
      style={{
        padding: theme.spacing.md,
        gap: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.surface,
      }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Text variant="heading">{label}</Text>
        <Text variant="label" color={latest ? 'text' : 'textSecondary'}>
          {latest ? latest.score : 'No score yet'}
        </Text>
      </View>
      {points.length === 0 ? (
        <Text color="textSecondary">Play a {label.toLowerCase()} game to start this chart.</Text>
      ) : (
        <>
          <View
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${label} chart: ${points.length} ${points.length === 1 ? 'day' : 'days'}, from ${points[0].score} to ${latest?.score}`}
            style={{
              height: chartHeight,
              flexDirection: 'row',
              alignItems: 'flex-end',
              gap: theme.spacing.xxs,
              borderBottomWidth: theme.spacing.xxs / 2,
              borderColor: theme.colors.border,
            }}>
            {points.map((point) => (
              <View
                key={point.date}
                testID={`chart-bar-${point.date}`}
                style={{
                  flex: 1,
                  height: `${Math.max(2, Math.round((point.score / MAX_SKILL_SCORE) * 100))}%`,
                  borderTopLeftRadius: theme.radius.sm,
                  borderTopRightRadius: theme.radius.sm,
                  backgroundColor: point === latest ? theme.colors.primary : theme.colors.surfaceSelected,
                }}
              />
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text variant="caption" color="textSecondary">
              {shortDate(points[0].date)}
            </Text>
            {points.length > 1 && latest ? (
              <Text variant="caption" color="textSecondary">
                {shortDate(latest.date)}
              </Text>
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}
