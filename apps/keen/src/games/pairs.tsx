import type { BoardProps, GameModule, Rng } from '@five/game';
import { Text, useTheme, type ColorName } from '@five/shell';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { giveFeedback } from '@/feedback/feedback';

/**
 * Pairs (memory). All tiles show for a moment, then flip face down. Flip two
 * at a time to find every matching pair. One cleared grid is one answer: it is
 * right when the grid is cleared within the allowed number of misses, and the
 * grid grows as the player levels up.
 */
export type PairsQuestion = {
  rows: number;
  cols: number;
  /** Symbol index for each tile, row by row. Every symbol appears exactly twice. */
  tiles: number[];
  /** How long every tile shows face up before play starts. */
  peekMs: number;
  /** Misses the player can make and still clear the grid. One more ends it. */
  allowedMisses: number;
};
export type PairsAnswer = { cleared: boolean; misses: number };

export const PAIRS_LEVELS = [
  { rows: 2, cols: 2, peekMs: 1500, allowedMisses: 1 },
  { rows: 2, cols: 3, peekMs: 1800, allowedMisses: 1 },
  { rows: 3, cols: 4, peekMs: 2500, allowedMisses: 2 },
  { rows: 4, cols: 4, peekMs: 3000, allowedMisses: 3 },
  { rows: 4, cols: 5, peekMs: 3000, allowedMisses: 4 },
  { rows: 4, cols: 6, peekMs: 3000, allowedMisses: 4 },
] as const;

/** Simple shapes every system font draws. Their color repeats every four. */
export const PAIRS_SYMBOLS = ['★', '●', '▲', '■', '◆', '♥', '♣', '♠', '☀', '☂', '♫', '✚'] as const;
const SYMBOL_COLORS: ColorName[] = ['primary', 'success', 'danger', 'text'];

/** How long two wrong tiles stay face up before flipping back. */
export const MISS_SHOW_MS = 700;
/** Time per pair a quick player needs, on top of the peek. */
const MS_PER_PAIR = 1300;

function pairCount(level: number) {
  const { rows, cols } = PAIRS_LEVELS[level - 1];
  return (rows * cols) / 2;
}

export function createPairsQuestion(level: number, rng: Rng): PairsQuestion {
  const { rows, cols, peekMs, allowedMisses } = PAIRS_LEVELS[level - 1];
  const symbols = rng.shuffle(PAIRS_SYMBOLS.map((_, i) => i)).slice(0, (rows * cols) / 2);
  return { rows, cols, peekMs, allowedMisses, tiles: rng.shuffle([...symbols, ...symbols]) };
}

type Progress = { peeked: boolean; matched: number[]; misses: number };

/**
 * The framework remounts the board after a pause. Progress is kept per
 * question so resuming does not replay the peek or lose found pairs.
 */
const saved = new WeakMap<PairsQuestion, Progress>();

function PairsBoard({ question, onAnswer }: BoardProps<PairsQuestion, PairsAnswer>) {
  const theme = useTheme();
  const start = saved.get(question) ?? { peeked: false, matched: [], misses: 0 };
  const [peeking, setPeeking] = useState(!start.peeked);
  const [matched, setMatched] = useState<number[]>(start.matched);
  const [misses, setMisses] = useState(start.misses);
  const [open, setOpen] = useState<number[]>([]);
  const done = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (!peeking) return;
    const id = setTimeout(() => {
      setPeeking(false);
      saved.set(question, { peeked: true, matched, misses });
    }, question.peekMs);
    timers.current.push(id);
    // Only the first render of a question starts the peek.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pairs = question.tiles.length / 2;
  const missesLeft = question.allowedMisses - misses;

  function flip(index: number) {
    if (peeking || done.current || open.length === 2 || open.includes(index) || matched.includes(index)) return;
    if (open.length === 0) {
      giveFeedback('tap');
      setOpen([index]);
      return;
    }
    const first = open[0];
    if (question.tiles[first] === question.tiles[index]) {
      const nowMatched = [...matched, first, index];
      setMatched(nowMatched);
      setOpen([]);
      saved.set(question, { peeked: true, matched: nowMatched, misses });
      if (nowMatched.length === question.tiles.length) {
        done.current = true;
        onAnswer({ cleared: true, misses });
      } else {
        giveFeedback('right');
      }
      return;
    }
    const nowMisses = misses + 1;
    setMisses(nowMisses);
    setOpen([first, index]);
    saved.set(question, { peeked: true, matched, misses: nowMisses });
    if (nowMisses > question.allowedMisses) {
      done.current = true;
      onAnswer({ cleared: false, misses: nowMisses });
      return;
    }
    giveFeedback('wrong');
    timers.current.push(setTimeout(() => setOpen([]), MISS_SHOW_MS));
  }

  const rows = Array.from({ length: question.rows }, (_, r) =>
    Array.from({ length: question.cols }, (_, c) => r * question.cols + c),
  );

  return (
    <View style={{ flex: 1, gap: theme.spacing.md }}>
      <Text variant="heading" style={{ textAlign: 'center' }}>
        {peeking ? 'Remember the tiles' : 'Find the pairs'}
      </Text>
      <Text color="textSecondary" style={{ textAlign: 'center' }} accessibilityLiveRegion="polite">
        {`${matched.length / 2} of ${pairs} pairs · ${missesLeft} ${missesLeft === 1 ? 'miss' : 'misses'} left`}
      </Text>
      <View style={{ flex: 1, gap: theme.spacing.sm }}>
        {rows.map((row, r) => (
          <View key={r} style={{ flex: 1, flexDirection: 'row', gap: theme.spacing.sm }}>
            {row.map((index) => {
              const symbol = question.tiles[index];
              const isMatched = matched.includes(index);
              const faceUp = peeking || isMatched || open.includes(index);
              const label = faceUp
                ? `Tile ${index + 1}, ${PAIRS_SYMBOLS[symbol]}${isMatched ? ', matched' : ''}`
                : `Tile ${index + 1}, face down`;
              return (
                <Pressable
                  key={index}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  accessibilityState={{ disabled: faceUp }}
                  onPress={() => flip(index)}
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: theme.radius.md,
                    backgroundColor: faceUp
                      ? isMatched
                        ? theme.colors.surface
                        : theme.colors.surfaceSelected
                      : theme.colors.primary,
                  }}>
                  {faceUp ? (
                    <Text variant="title" color={SYMBOL_COLORS[symbol % SYMBOL_COLORS.length]}>
                      {PAIRS_SYMBOLS[symbol]}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

export const pairs: GameModule<PairsQuestion, PairsAnswer> = {
  id: 'pairs',
  title: 'Pairs',
  instructions: 'Remember where each shape is, then flip two tiles at a time to find every pair.',
  levels: PAIRS_LEVELS.length,
  round: {
    durationMs: 60_000,
    // A stuck player loses the grid instead of the whole round.
    questionTimeLimitMs: (level) => PAIRS_LEVELS[level - 1].peekMs + pairCount(level) * 3000,
  },
  targetResponseMs: (level) => PAIRS_LEVELS[level - 1].peekMs + pairCount(level) * MS_PER_PAIR,
  createQuestion: createPairsQuestion,
  isCorrect: (question, answer) => answer.cleared && answer.misses <= question.allowedMisses,
  Board: PairsBoard,
  // A grid takes several seconds, so judge the player on two grids, not four.
  difficulty: { windowSize: 2 },
};
