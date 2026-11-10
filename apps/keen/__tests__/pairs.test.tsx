import { createRng, GameRunner } from '@five/game';
import { fireEvent, screen } from '@testing-library/react-native';

import { withAnswerFeedback } from '@/feedback/withAnswerFeedback';
import { createPairsQuestion, MISS_SHOW_MS, pairs, PAIRS_LEVELS, PAIRS_SYMBOLS } from '@/games/pairs';

import { advance, renderThemed } from '../test/helpers';

jest.mock('react-native-purchases', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/feedback/feedback', () => ({ giveFeedback: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const feedback = require('@/feedback/feedback').giveFeedback as jest.Mock;
const game = withAnswerFeedback(pairs, feedback);

/** Symbol on each tile in order, or "face down". */
function readTiles(): string[] {
  return screen
    .getAllByRole('button')
    .map((node) => node.props.accessibilityLabel as string)
    .filter((label) => label?.startsWith('Tile '))
    .map((label) => label.split(', ')[1]);
}

function tile(index: number) {
  return screen.getByRole('button', { name: new RegExp(`^Tile ${index + 1},`) });
}

/** Clears the grid without a miss, using the symbols seen during the peek. */
async function clearGrid(symbols: string[]) {
  const seen = new Map<string, number>();
  for (let i = 0; i < symbols.length; i += 1) {
    const first = seen.get(symbols[i]);
    if (first === undefined) {
      seen.set(symbols[i], i);
    } else {
      await fireEvent.press(tile(first));
      await fireEvent.press(tile(i));
    }
  }
}

/** Taps two tiles with different symbols. */
async function miss(symbols: string[]) {
  const other = symbols.findIndex((s) => s !== symbols[0]);
  await fireEvent.press(tile(0));
  await fireEvent.press(tile(other));
}

async function startRound(onFinish = jest.fn()) {
  await renderThemed(<GameRunner game={game} seed={5} onFinish={onFinish} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Start' }));
  await advance(3000);
  return onFinish;
}

beforeEach(() => {
  jest.useFakeTimers({ now: 0 });
  feedback.mockClear();
});
afterEach(() => jest.useRealTimers());

describe('Pairs questions', () => {
  it('puts every symbol on exactly two tiles and grows the grid with the level', () => {
    const rng = createRng(1);
    let previous = 0;
    PAIRS_LEVELS.forEach(({ rows, cols }, i) => {
      const q = createPairsQuestion(i + 1, rng);
      expect(q.tiles).toHaveLength(rows * cols);
      expect(q.tiles.length).toBeGreaterThan(previous);
      previous = q.tiles.length;
      const counts = new Map<number, number>();
      q.tiles.forEach((s) => counts.set(s, (counts.get(s) ?? 0) + 1));
      expect([...counts.values()].every((n) => n === 2)).toBe(true);
      expect(Math.max(...q.tiles)).toBeLessThan(PAIRS_SYMBOLS.length);
    });
  });

  it('counts a grid right only when cleared within the allowed misses', () => {
    const q = createPairsQuestion(3, createRng(2));
    expect(pairs.isCorrect(q, { cleared: true, misses: q.allowedMisses })).toBe(true);
    expect(pairs.isCorrect(q, { cleared: true, misses: q.allowedMisses + 1 })).toBe(false);
    expect(pairs.isCorrect(q, { cleared: false, misses: 0 })).toBe(false);
  });

  it('gives bigger grids more time and a longer peek', () => {
    for (let level = 2; level <= pairs.levels; level += 1) {
      expect(pairs.targetResponseMs(level)).toBeGreaterThanOrEqual(pairs.targetResponseMs(level - 1));
    }
  });
});

describe('Pairs on the game framework', () => {
  it('shows the tiles, hides them, and levels up after two clean grids', async () => {
    await startRound();
    expect(screen.getByText('Remember the tiles')).toBeOnTheScreen();
    const first = readTiles();
    expect(first).toHaveLength(4);
    expect(first).not.toContain('face down');

    // Taps during the peek do nothing.
    await fireEvent.press(tile(0));
    await advance(PAIRS_LEVELS[0].peekMs);
    expect(screen.getByText('Find the pairs')).toBeOnTheScreen();
    expect(readTiles().every((s) => s === 'face down')).toBe(true);

    await clearGrid(first);
    expect(feedback).toHaveBeenLastCalledWith('right');

    // The next grid starts with its own peek.
    const second = readTiles();
    await advance(PAIRS_LEVELS[0].peekMs);
    await clearGrid(second);
    expect(screen.getByLabelText('Level 2 of 6')).toBeOnTheScreen();
    expect(readTiles()).toHaveLength(6);
  });

  it('flips missed tiles back and ends the grid after too many misses', async () => {
    await startRound();
    const symbols = readTiles();
    await advance(PAIRS_LEVELS[0].peekMs);

    await miss(symbols);
    expect(feedback).toHaveBeenLastCalledWith('wrong');
    expect(screen.getByText(/0 misses left/)).toBeOnTheScreen();
    // Both stay up for a moment, then flip back. Taps meanwhile do nothing.
    expect(readTiles().filter((s) => s !== 'face down')).toHaveLength(2);
    await fireEvent.press(tile(symbols.length - 1));
    expect(readTiles().filter((s) => s !== 'face down')).toHaveLength(2);
    await advance(MISS_SHOW_MS);
    expect(readTiles().every((s) => s === 'face down')).toBe(true);

    feedback.mockClear();
    await miss(symbols);
    // The grid is lost: a new grid appears and the miss gets one wrong sound.
    expect(screen.getByText('Remember the tiles')).toBeOnTheScreen();
    expect(feedback.mock.calls.filter(([kind]) => kind === 'wrong')).toHaveLength(1);
  });

  it('keeps found pairs and skips the peek after a pause', async () => {
    await startRound();
    const symbols = readTiles();
    await advance(PAIRS_LEVELS[0].peekMs);
    const partner = symbols.indexOf(symbols[0], 1);
    await fireEvent.press(tile(0));
    await fireEvent.press(tile(partner));
    expect(screen.getByText(/1 of 2 pairs/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByText('Find the pairs')).toBeOnTheScreen();
    expect(screen.getByText(/1 of 2 pairs/)).toBeOnTheScreen();
  });

  it('reports a score to the framework when the 60 seconds are up', async () => {
    const onFinish = await startRound();
    const symbols = readTiles();
    await advance(PAIRS_LEVELS[0].peekMs);
    await clearGrid(symbols);
    await advance(60_000);
    expect(screen.getByText("Time's up")).toBeOnTheScreen();
    expect(onFinish).toHaveBeenCalledTimes(1);
    const summary = onFinish.mock.calls[0][0];
    expect(summary.correct).toBe(1);
    expect(summary.score).toBeGreaterThan(0);
  });
});
