import { Text, useTheme } from '@five/shell';
import type { ComponentRef, Ref } from 'react';
import { View } from 'react-native';

import { MAX_SKILL_SCORE, skillLabel, type SkillId } from '@/skills/skills';
import type { BaselineResult } from './baseline';

const CARD_SKILLS: SkillId[] = ['memory', 'math', 'speed'];

export type ShareCardRef = ComponentRef<typeof View>;

/**
 * The shareable baseline card: the Keen score and the three measured skills.
 * The plan screen draws it and captures it as an image to share
 * (see shareBaseline.ts), so it must look right on its own.
 */
export function ShareCard({
  result,
  appName,
  ref,
}: {
  result: BaselineResult;
  appName: string;
  ref?: Ref<ShareCardRef>;
}) {
  const theme = useTheme();
  return (
    <View
      ref={ref}
      collapsable={false}
      accessible
      accessibilityLabel={`My ${appName} baseline: ${result.keenScore} out of ${MAX_SKILL_SCORE}`}
      style={{
        padding: theme.spacing.lg,
        gap: theme.spacing.md,
        borderRadius: theme.radius.lg,
        backgroundColor: theme.colors.primary,
      }}>
      <Text variant="label" color="textOnPrimary">
        {`My ${appName} baseline`}
      </Text>
      <View style={{ gap: theme.spacing.xxs }}>
        <Text variant="title" color="textOnPrimary">
          {String(result.keenScore)}
        </Text>
        <Text variant="caption" color="textOnPrimary">
          {`${appName} score, out of ${MAX_SKILL_SCORE}`}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        {CARD_SKILLS.map((id) => (
          <View
            key={id}
            style={{
              flex: 1,
              padding: theme.spacing.sm,
              gap: theme.spacing.xxs,
              borderRadius: theme.radius.md,
              backgroundColor: theme.colors.surface,
            }}>
            <Text variant="caption" color="textSecondary">
              {skillLabel(id)}
            </Text>
            <Text variant="heading">{result.scores[id] === undefined ? '–' : String(result.scores[id])}</Text>
          </View>
        ))}
      </View>
      <Text variant="caption" color="textOnPrimary">
        60 seconds. Can you beat it?
      </Text>
    </View>
  );
}
