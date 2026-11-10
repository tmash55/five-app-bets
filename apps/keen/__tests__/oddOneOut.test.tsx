import { createRng, GameRunner } from '@five/game';
import { fireEvent, screen } from '@testing-library/react-native';

import { withAnswerFeedback } from '@/feedback/withAnswerFeedback';
import { createOddOneOutQuestion, GLYPH_NAMES, ODD_LEVELS, oddOneOut } from '@/games/oddOneOut';

import { advance, renderThemed } from '../test/helpers';

jest.mock('react-native-purchases', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/feedback/feedback', () => ({ giveFeedback: jest.fn() }));

const feedback = jest.fn();
const game = withAnswerFeedback(oddOneOut, feedback);

/** Tile buttons as [index, description]. */
function tiles(): [number, string][] {
  return screen
    .getAllByRole('button')
    .map((node) => node.props.accessibilityLabel as string)
    .filter((label) => label?.startsWith('Tile '))
    .map((label) => {
      const [name, description] = label.split(', ');
      return [Number(name.replace('Tile ', '')) - 1, description];
    });
}

/** The tile whose description only appears once. */
function oddTile(): number {
  const all = tiles();
  const counts = new Map<string, number>();
  all.forEach(([, d]) => counts.set(d, (counts.get(d) ?? 0) + 1));
  return all.find(([, d]) => counts.get(d) === 1)![0];
}

const tile = (index: number) => screen.getByRole('button', { name: new RegExp(`^Tile ${index + 1},`) });

async function startRound(onFinish = jest.fn()) {
  await renderThemed(<GameRunner game={game} seed={3} onFinish={onFinish} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Start' }));
  await advance(3000);
  return onFinish;
}

beforeEach(() => {
  jest.useFakeTimers({ now: 0 });
  feedback.mockClear();
});
afterEach(() => jest.useRealTimers());

describe('Odd One Out questions', () => {
  it('always has exactly one tile that differs, in the way the level allows', () => {
    const rng = createRng(11);
    for (let level = 1; level <= oddOneOut.levels; level += 1) {
      const { rows, cols, kinds } = ODD_LEVELS[level - 1];
      for (let i = 0; i < 300; i += 1) {
        const q = createOddOneOutQuestion(level, rng);
        expect(kinds).toContain(q.kind);
        expect([q.rows, q.cols]).toEqual([rows, cols]);
        expect(q.oddIndex).toBeGreaterThanOrEqual(0);
        expect(q.oddIndex).toBeLessThan(rows * cols);
        expect(q.odd).not.toEqual(q.base);
        expect(GLYPH_NAMES[q.base.glyph]).toBeDefined();
        expect(GLYPH_NAMES[q.odd.glyph]).toBeDefined();
        if (q.kind === 'color') {
          expect(q.odd.glyph).toBe(q.base.glyph);
        } else {
          expect(q.odd.color).toBe(q.base.color);
        }
      }
    }
  });

  it('grows the grid as levels go up', () => {
    for (let level = 2; level <= oddOneOut.levels; level += 1) {
      const now = ODD_LEVELS[level - 1];
      const before = ODD_LEVELS[level - 2];
      expect(now.rows * now.cols).toBeGreaterThanOrEqual(before.rows * before.cols);
    }
    expect(oddOneOut.targetResponseMs(6)).toBeGreaterThan(oddOneOut.targetResponseMs(1));
  });
});

describe('Odd One Out on the game framework', () => {
  it('takes the odd tile as right, and levels up on four quick right answers', async () => {
    await startRound();
    expect(screen.getByText('Tap the odd one out')).toBeOnTheScreen();
    for (let i = 0; i < 4; i += 1) {
      expect(tiles()).toHaveLength(9);
      await fireEvent.press(tile(oddTile()));
      expect(feedback).toHaveBeenLastCalledWith('right');
    }
    expect(screen.getByLabelText('Level 2 of 6')).toBeOnTheScreen();
  });

  it('takes any other tile as wrong, and running out of time as wrong', async () => {
    await startRound();
    const odd = oddTile();
    await fireEvent.press(tile(odd === 0 ? 1 : 0));
    expect(feedback).toHaveBeenLastCalledWith('wrong');

    feedback.mockClear();
    const limit = oddOneOut.round.questionTimeLimitMs as (level: number) => number;
    // A wrong answer can drop the level, but level 1 is the floor here.
    await advance(limit(1) + 1000);
    expect(feedback).toHaveBeenCalledWith('wrong');
  });

  it('ignores a second tap on the same question', async () => {
    await startRound();
    const odd = tile(oddTile());
    await fireEvent.press(odd);
    await fireEvent.press(odd);
    expect(feedback).toHaveBeenCalledTimes(1);
  });

  it('reports a score after 60 seconds', async () => {
    const onFinish = await startRound();
    await fireEvent.press(tile(oddTile()));
    await advance(60_000);
    expect(screen.getByText("Time's up")).toBeOnTheScreen();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].correct).toBe(1);
    expect(onFinish.mock.calls[0][0].score).toBeGreaterThan(0);
  });
});
