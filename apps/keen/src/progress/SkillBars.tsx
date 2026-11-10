import { Text, useTheme } from '@five/shell';
import { View } from 'react-native';

import { MAX_SKILL_SCORE, SKILLS, type SkillId, type SkillScores } from '@/skills/skills';

export function formatChange(change: number | null | undefined): string {
  if (change === null || change === undefined) return 'New';
  if (change > 0) return `+${change}`;
  return change < 0 ? `−${Math.abs(change)}` : '0';
}

/** One row per skill: name, a bar out of 1000, the score and its change against last week. */
export function SkillBars({
  scores,
  changes,
}: {
  scores: SkillScores;
  changes: Partial<Record<SkillId, number | null>>;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm }}>
      {SKILLS.map(({ id, label }) => {
        const score = scores[id];
        const change = changes[id];
        const changeColor =
          score === undefined || change === null || change === undefined || change === 0
            ? 'textSecondary'
            : change > 0
              ? 'success'
              : 'danger';
        const share = score === undefined ? 0 : Math.min(1, score / MAX_SKILL_SCORE);
        return (
          <View
            key={id}
            accessible
            accessibilityLabel={
              score === undefined
                ? `${label}: not scored yet`
                : `${label}: ${score}, ${change === null || change === undefined ? 'new this week' : `${formatChange(change)} since last week`}`
            }
            style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Text variant="label" style={{ flex: 2 }}>
              {label}
            </Text>
            <View
              style={{
                flex: 5,
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
            <Text variant="label" style={{ flex: 1, textAlign: 'right' }}>
              {score === undefined ? '–' : score}
            </Text>
            <Text variant="caption" color={changeColor} style={{ flex: 1, textAlign: 'right' }}>
              {score === undefined ? '' : formatChange(change)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}
