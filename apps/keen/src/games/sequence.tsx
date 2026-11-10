import type { BoardProps, GameModule, Rng } from '@five/game';
import { Text, useTheme, type ColorName } from '@five/shell';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { giveFeedback } from '@/feedback/feedback';

/**
 * Sequence (memory). Four lights flash in a pattern; repeat it by tapping them
 * in the same order. Each pattern you get right makes the next one a light
 * longer, and a mistake makes it a light shorter.
 */
export type SequenceQuestion = {
  /** Light index (0-3) for each flash, in order. */
  pattern: number[];
  /** How long each light stays on while the pattern plays. */
  showMs: number;
};
/** The lights tapped, in order. Ends early at the first wrong tap. */
export type SequenceAnswer = number[];

export const SEQUENCE_LEVELS = 10;
/** Pattern length at a level: 3 lights at level 1, 12 at level 10. */
export const patternLength = (level: number) => level + 2;
export const showMsFor = (level: number) => Math.max(400, 750 - level * 35);
/** Dark time between two flashes, so a repeated light reads as two. */
export const SEQUENCE_GAP_MS = 250;
/** How long a light stays on after the player taps it. */
export const TAP_LIGHT_MS = 200;
/** Time a quick player needs per tap when repeating the pattern. */
const MS_PER_TAP = 900;

export const LIGHTS: { color: ColorName; name: string }[] = [
  { color: 'primary', name: 'blue' },
  { color: 'success', name: 'green' },
  { color: 'danger', name: 'red' },
  { color: 'text', name: 'plain' },
];

export function playTimeMs(level: number): number {
  return patternLength(level) * (showMsFor(level) + SEQUENCE_GAP_MS);
}

export function createSequenceQuestion(level: number, rng: Rng): SequenceQuestion {
  const pattern = Array.from({ length: patternLength(level) }, () => rng.int(0, LIGHTS.length - 1));
  return { pattern, showMs: showMsFor(level) };
}

export function isRightSequence(question: SequenceQuestion, answer: SequenceAnswer): boolean {
  return answer.length === question.pattern.length && answer.every((light, i) => light === question.pattern[i]);
}

type Progress = { played: number; taps: number[] };

/**
 * The framework remounts the board after a pause. Progress is kept per
 * question so resuming neither replays the pattern nor loses taps.
 */
const saved = new WeakMap<SequenceQuestion, Progress>();

function SequenceBoard({ question, onAnswer }: BoardProps<SequenceQuestion, SequenceAnswer>) {
  const theme = useTheme();
  const start = saved.get(question) ?? { played: 0, taps: [] };
  // Flash being played; pattern.length means it is the player's turn.
  const [played, setPlayed] = useState(start.played);
  const [dark, setDark] = useState(false);
  const [taps, setTaps] = useState<number[]>(start.taps);
  const [tapLit, setTapLit] = useState<number | null>(null);
  const done = useRef(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const playing = played < question.pattern.length;

  useEffect(() => () => clearTimeout(tapTimer.current), []);

  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(
      () => {
        if (dark) {
          saved.set(question, { played: played + 1, taps });
          setDark(false);
          setPlayed(played + 1);
        } else {
          setDark(true);
        }
      },
      dark ? SEQUENCE_GAP_MS : question.showMs,
    );
    return () => clearTimeout(id);
  }, [playing, dark, played, question, taps]);

  function tap(light: number) {
    if (playing || done.current) return;
    const now = [...taps, light];
    setTaps(now);
    saved.set(question, { played, taps: now });
    setTapLit(light);
    clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => setTapLit(null), TAP_LIGHT_MS);
    const wrong = question.pattern[now.length - 1] !== light;
    if (wrong || now.length === question.pattern.length) {
      done.current = true;
      onAnswer(now);
      return;
    }
    giveFeedback('tap');
  }

  const lit = playing ? (dark ? null : question.pattern[played]) : tapLit;

  return (
    <View style={{ flex: 1, gap: theme.spacing.md }}>
      <Text variant="heading" style={{ textAlign: 'center' }}>
        {playing ? 'Watch the lights' : 'Your turn'}
      </Text>
      <Text color="textSecondary" style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">
        {playing
          ? `${question.pattern.length} lights`
          : `${taps.length} of ${question.pattern.length}`}
      </Text>
      <View style={{ flex: 1, gap: theme.spacing.md }}>
        {[
          [0, 1],
          [2, 3],
        ].map((row, r) => (
          <View key={r} style={{ flex: 1, flexDirection: 'row', gap: theme.spacing.md }}>
            {row.map((light) => {
              const on = lit === light;
              const { color, name } = LIGHTS[light];
              return (
                <Pressable
                  key={light}
                  accessibilityRole="button"
                  accessibilityLabel={`${name} light${on ? ', lit' : ''}`}
                  accessibilityState={{ disabled: playing }}
                  onPress={() => tap(light)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: theme.radius.lg,
                    backgroundColor: on ? theme.colors[color] : theme.colors.surface,
                  }}>
                  <Text variant="title" color={on ? 'background' : color}>
                    ●
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

export const sequence: GameModule<SequenceQuestion, SequenceAnswer> = {
  id: 'sequence',
  title: 'Sequence',
  instructions: 'Watch the lights, then tap them in the same order. Every pattern you get right grows by one.',
  levels: SEQUENCE_LEVELS,
  round: {
    durationMs: 60_000,
    questionTimeLimitMs: (level) => playTimeMs(level) + patternLength(level) * 2500,
  },
  targetResponseMs: (level) => playTimeMs(level) + patternLength(level) * MS_PER_TAP,
  createQuestion: createSequenceQuestion,
  isCorrect: isRightSequence,
  Board: SequenceBoard,
  // One pattern at a time: right grows it by one light, wrong shrinks it by one.
  difficulty: { windowSize: 1, promoteAccuracy: 1, demoteAccuracy: 1, missesToDrop: 1 },
};
