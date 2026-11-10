import { Text, useTheme } from '@five/shell';
import { Pressable, View } from 'react-native';

import type { BoardProps, GameModule } from '../types';

/**
 * Throwaway test game that proves the framework end to end. Not a Keen game:
 * real games live in each app. Two numbers appear; tap the bigger one. Higher
 * levels use bigger numbers that sit closer together.
 */
export type BiggerNumberQuestion = { left: number; right: number };
export type BiggerNumberAnswer = 'left' | 'right';

const LEVELS = [
  { max: 9, minGap: 3 },
  { max: 20, minGap: 2 },
  { max: 50, minGap: 1 },
  { max: 200, minGap: 1 },
  { max: 999, minGap: 1 },
] as const;

function Board({ question, onAnswer, lastFeedback }: BoardProps<BiggerNumberQuestion, BiggerNumberAnswer>) {
  const theme = useTheme();
  const tile = (side: BiggerNumberAnswer) => (
    <Pressable
      key={side}
      accessibilityRole="button"
      accessibilityLabel={String(question[side])}
      onPress={() => onAnswer(side)}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.lg,
        backgroundColor: pressed ? theme.colors.surfaceSelected : theme.colors.surface,
      })}>
      <Text variant="title">{question[side]}</Text>
    </Pressable>
  );
  return (
    <View style={{ flex: 1, gap: theme.spacing.md }}>
      <Text variant="heading" style={{ textAlign: 'center' }}>
        Which is bigger?
      </Text>
      <View style={{ flex: 1, flexDirection: 'row', gap: theme.spacing.md }}>
        {tile('left')}
        {tile('right')}
      </View>
      <Text
        variant="label"
        color={lastFeedback === null ? 'textSecondary' : lastFeedback.correct ? 'success' : 'danger'}
        accessibilityLiveRegion="polite"
        style={{ textAlign: 'center' }}>
        {lastFeedback === null
          ? ' '
          : lastFeedback.correct
            ? `+${lastFeedback.points}${lastFeedback.levelChange === 'up' ? ', level up' : ''}`
            : `${lastFeedback.timedOut ? 'Too slow' : 'Miss'}${lastFeedback.levelChange === 'down' ? ', level down' : ''}`}
      </Text>
    </View>
  );
}

export const biggerNumber: GameModule<BiggerNumberQuestion, BiggerNumberAnswer> = {
  id: 'bigger-number',
  title: 'Bigger Number',
  instructions: 'Two numbers appear. Tap the bigger one as fast as you can.',
  levels: LEVELS.length,
  round: { durationMs: 45_000, questionTimeLimitMs: (level) => 4000 - (level - 1) * 500 },
  targetResponseMs: (level) => 1500 - (level - 1) * 150,
  createQuestion(level, rng) {
    const { max, minGap } = LEVELS[level - 1];
    const small = rng.int(1, max - minGap);
    const big = rng.int(small + minGap, Math.min(max, small + minGap + Math.ceil(max / 4)));
    return rng.next() < 0.5 ? { left: big, right: small } : { left: small, right: big };
  },
  isCorrect(question, answer) {
    const bigger: BiggerNumberAnswer = question.left > question.right ? 'left' : 'right';
    return answer === bigger;
  },
  Board,
};
