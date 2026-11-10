import type { BoardProps, GameModule, Rng } from '@five/game';
import { Text, useTheme } from '@five/shell';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

/**
 * Quick Sum (math). Numbers flash one at a time; keep a running total in your
 * head, then pick it from four choices. Higher levels flash more numbers,
 * faster, with bigger values and subtraction.
 */
export type QuickSumQuestion = {
  /** Signed steps. The first is the starting number and is never negative. */
  steps: number[];
  flashMs: number;
  /** Four choices, one of them the total. */
  choices: number[];
};
export type QuickSumAnswer = number;

export const QUICK_SUM_LEVELS = [
  { count: 3, min: 1, max: 9, subtract: false, flashMs: 1000 },
  { count: 4, min: 1, max: 9, subtract: false, flashMs: 900 },
  { count: 4, min: 2, max: 15, subtract: false, flashMs: 800 },
  { count: 5, min: 1, max: 9, subtract: true, flashMs: 750 },
  { count: 5, min: 2, max: 20, subtract: true, flashMs: 650 },
  { count: 6, min: 2, max: 20, subtract: true, flashMs: 550 },
] as const;

/** Blank between two numbers so a repeated number still reads as two. */
export const FLASH_GAP_MS = 150;
/** Time a quick player needs to pick the total once the numbers are gone. */
const PICK_MS = 2000;

export function total(question: Pick<QuickSumQuestion, 'steps'>): number {
  return question.steps.reduce((sum, step) => sum + step, 0);
}

/** How long the numbers take to show at a level. */
export function flashTimeMs(level: number): number {
  const { count, flashMs } = QUICK_SUM_LEVELS[level - 1];
  return count * (flashMs + FLASH_GAP_MS);
}

export function createQuickSumQuestion(level: number, rng: Rng): QuickSumQuestion {
  const { count, min, max, subtract, flashMs } = QUICK_SUM_LEVELS[level - 1];
  const steps = [rng.int(min, max)];
  let running = steps[0];
  for (let i = 1; i < count; i += 1) {
    const n = rng.int(min, max);
    // Subtract about a third of the time, and never below zero.
    const step = subtract && running - n >= 0 && rng.next() < 0.35 ? -n : n;
    steps.push(step);
    running += step;
  }
  const offsets = rng.shuffle([-10, -2, -1, 1, 2, 10]).filter((offset) => running + offset >= 0);
  const choices = rng.shuffle([running, ...offsets.slice(0, 3).map((offset) => running + offset)]);
  return { steps, flashMs, choices };
}

/** "7" for the first number, then "+ 4" or "− 3". */
export function stepLabel(step: number, index: number): string {
  if (index === 0) return String(step);
  return step < 0 ? `− ${-step}` : `+ ${step}`;
}

/** Where the flashing got to, so a pause does not replay the numbers. */
const shown = new WeakMap<QuickSumQuestion, number>();

function QuickSumBoard({ question, onAnswer }: BoardProps<QuickSumQuestion, QuickSumAnswer>) {
  const theme = useTheme();
  // index of the number on screen; steps.length means the choices are up.
  const [index, setIndex] = useState(() => shown.get(question) ?? 0);
  const [gap, setGap] = useState(false);
  const answered = useRef(false);
  const flashing = index < question.steps.length;

  useEffect(() => {
    if (!flashing) return;
    const id = setTimeout(
      () => {
        if (gap) {
          shown.set(question, index + 1);
          setGap(false);
          setIndex(index + 1);
        } else {
          setGap(true);
        }
      },
      gap ? FLASH_GAP_MS : question.flashMs,
    );
    return () => clearTimeout(id);
  }, [flashing, gap, index, question]);

  return (
    <View style={{ flex: 1, gap: theme.spacing.lg }}>
      <Text variant="heading" style={{ textAlign: 'center' }}>
        {flashing ? 'Keep the running total' : "What's the total?"}
      </Text>
      {flashing ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Text
            variant="title"
            accessibilityLiveRegion="assertive"
            accessibilityLabel={gap ? undefined : `Number ${index + 1}: ${stepLabel(question.steps[index], index)}`}>
            {gap ? ' ' : stepLabel(question.steps[index], index)}
          </Text>
        </View>
      ) : (
        <View style={{ flex: 1, gap: theme.spacing.md }}>
          {[question.choices.slice(0, 2), question.choices.slice(2, 4)].map((row, r) => (
            <View key={r} style={{ flex: 1, flexDirection: 'row', gap: theme.spacing.md }}>
              {row.map((choice) => (
                <Pressable
                  key={choice}
                  accessibilityRole="button"
                  accessibilityLabel={String(choice)}
                  onPress={() => {
                    if (answered.current) return;
                    answered.current = true;
                    onAnswer(choice);
                  }}
                  style={({ pressed }) => ({
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: theme.radius.lg,
                    backgroundColor: pressed ? theme.colors.surfaceSelected : theme.colors.surface,
                  })}>
                  <Text variant="title">{choice}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export const quickSum: GameModule<QuickSumQuestion, QuickSumAnswer> = {
  id: 'quick-sum',
  title: 'Quick Sum',
  instructions: 'Numbers flash by one at a time. Keep a running total in your head, then tap it.',
  levels: QUICK_SUM_LEVELS.length,
  round: {
    durationMs: 60_000,
    questionTimeLimitMs: (level) => flashTimeMs(level) + 6000,
  },
  targetResponseMs: (level) => flashTimeMs(level) + PICK_MS,
  createQuestion: createQuickSumQuestion,
  isCorrect: (question, answer) => answer === total(question),
  Board: QuickSumBoard,
};
