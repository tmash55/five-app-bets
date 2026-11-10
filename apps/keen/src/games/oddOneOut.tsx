import type { BoardProps, GameModule, Rng } from '@five/game';
import { Text, useTheme, type ColorName } from '@five/shell';
import { useRef } from 'react';
import { Pressable, View } from 'react-native';

/**
 * Odd One Out (focus). A grid of shapes that all match except one. Tap the one
 * that breaks the pattern. Early levels change the whole shape; later levels
 * hide the difference in fill or direction on a bigger grid.
 */
export type OddItem = { glyph: string; color: ColorName };
export type OddOneOutQuestion = {
  rows: number;
  cols: number;
  base: OddItem;
  odd: OddItem;
  /** Tile that shows `odd`, row by row. */
  oddIndex: number;
  kind: OddKind;
};
/** Index of the tapped tile. */
export type OddOneOutAnswer = number;

/** How the odd tile differs from the rest. */
export type OddKind = 'shape' | 'color' | 'fill' | 'turn';

export const ODD_LEVELS: { rows: number; cols: number; kinds: OddKind[] }[] = [
  { rows: 3, cols: 3, kinds: ['shape'] },
  { rows: 3, cols: 3, kinds: ['shape', 'color'] },
  { rows: 4, cols: 4, kinds: ['color', 'fill'] },
  { rows: 4, cols: 4, kinds: ['fill', 'turn'] },
  { rows: 5, cols: 5, kinds: ['color', 'fill', 'turn'] },
  { rows: 6, cols: 6, kinds: ['fill', 'turn'] },
];

/** Shapes every system font draws, with names for screen readers. */
export const GLYPH_NAMES: Record<string, string> = {
  '●': 'circle',
  '○': 'hollow circle',
  '■': 'square',
  '□': 'hollow square',
  '◆': 'diamond',
  '◇': 'hollow diamond',
  '★': 'star',
  '☆': 'hollow star',
  '▲': 'up triangle',
  '▼': 'down triangle',
  '◀': 'left triangle',
  '▶': 'right triangle',
  '♥': 'heart',
};
const SHAPES = ['●', '■', '▲', '◆', '★', '♥'];
const FILL_PAIRS = [
  ['●', '○'],
  ['■', '□'],
  ['◆', '◇'],
  ['★', '☆'],
];
const TURN_PAIRS = [
  ['▲', '▼'],
  ['◀', '▶'],
];
export const ODD_COLORS: ColorName[] = ['primary', 'success', 'danger', 'text'];
const COLOR_NAMES: Record<string, string> = { primary: 'blue', success: 'green', danger: 'red', text: 'plain' };

function cells(level: number) {
  const { rows, cols } = ODD_LEVELS[level - 1];
  return rows * cols;
}

function two<T>(rng: Rng, items: readonly T[]): [T, T] {
  const [a, b] = rng.shuffle(items);
  return [a, b];
}

export function createOddOneOutQuestion(level: number, rng: Rng): OddOneOutQuestion {
  const { rows, cols, kinds } = ODD_LEVELS[level - 1];
  const kind = rng.pick(kinds);
  const color = rng.pick(ODD_COLORS);
  let base: OddItem;
  let odd: OddItem;
  if (kind === 'shape') {
    const [a, b] = two(rng, SHAPES);
    base = { glyph: a, color };
    odd = { glyph: b, color };
  } else if (kind === 'color') {
    const glyph = rng.pick(SHAPES);
    const [a, b] = two(rng, ODD_COLORS);
    base = { glyph, color: a };
    odd = { glyph, color: b };
  } else {
    const [a, b] = rng.shuffle(rng.pick(kind === 'fill' ? FILL_PAIRS : TURN_PAIRS));
    base = { glyph: a, color };
    odd = { glyph: b, color };
  }
  return { rows, cols, base, odd, kind, oddIndex: rng.int(0, rows * cols - 1) };
}

export function describeItem(item: OddItem): string {
  return `${COLOR_NAMES[item.color]} ${GLYPH_NAMES[item.glyph]}`;
}

function OddOneOutBoard({ question, onAnswer }: BoardProps<OddOneOutQuestion, OddOneOutAnswer>) {
  const theme = useTheme();
  const answered = useRef(false);
  const rows = Array.from({ length: question.rows }, (_, r) =>
    Array.from({ length: question.cols }, (_, c) => r * question.cols + c),
  );
  // Smaller glyphs on the big grids so they fit a phone.
  const variant = question.cols >= 5 ? 'heading' : 'title';

  return (
    <View style={{ flex: 1, gap: theme.spacing.md }}>
      <Text variant="heading" style={{ textAlign: 'center' }}>
        Tap the odd one out
      </Text>
      <View style={{ flex: 1, gap: theme.spacing.sm }}>
        {rows.map((row, r) => (
          <View key={r} style={{ flex: 1, flexDirection: 'row', gap: theme.spacing.sm }}>
            {row.map((index) => {
              const item = index === question.oddIndex ? question.odd : question.base;
              return (
                <Pressable
                  key={index}
                  accessibilityRole="button"
                  accessibilityLabel={`Tile ${index + 1}, ${describeItem(item)}`}
                  onPress={() => {
                    if (answered.current) return;
                    answered.current = true;
                    onAnswer(index);
                  }}
                  style={({ pressed }) => ({
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: theme.radius.md,
                    backgroundColor: pressed ? theme.colors.surfaceSelected : theme.colors.surface,
                  })}>
                  <Text variant={variant} color={item.color}>
                    {item.glyph}
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

export const oddOneOut: GameModule<OddOneOutQuestion, OddOneOutAnswer> = {
  id: 'odd-one-out',
  title: 'Odd One Out',
  instructions: 'Every shape matches but one. Tap the one that breaks the pattern before time runs out.',
  levels: ODD_LEVELS.length,
  round: {
    durationMs: 60_000,
    questionTimeLimitMs: (level) => 3000 + cells(level) * 120,
  },
  // Scanning time grows with the grid.
  targetResponseMs: (level) => 1000 + cells(level) * 50,
  createQuestion: createOddOneOutQuestion,
  isCorrect: (question, answer) => answer === question.oddIndex,
  Board: OddOneOutBoard,
};
