import { createRng, GameRunner } from '@five/game';
import { fireEvent, screen } from '@testing-library/react-native';

import { withAnswerFeedback } from '@/feedback/withAnswerFeedback';
import {
  createQuickSumQuestion,
  FLASH_GAP_MS,
  flashTimeMs,
  QUICK_SUM_LEVELS,
  quickSum,
  stepLabel,
  total,
} from '@/games/quickSum';

import { advance, renderThemed } from '../test/helpers';

jest.mock('react-native-purchases', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/feedback/feedback', () => ({ giveFeedback: jest.fn() }));

const feedback = jest.fn();
const game = withAnswerFeedback(quickSum, feedback);

/** Watches the numbers flash by at the current level and returns the total. */
async function watchNumbers(level: number): Promise<number> {
  const { count, flashMs } = QUICK_SUM_LEVELS[level - 1];
  let sum = 0;
  for (let i = 0; i < count; i += 1) {
    const label = screen.getByLabelText(new RegExp(`^Number ${i + 1}: `)).props.accessibilityLabel as string;
    const shown = label.split(': ')[1];
    sum += shown.startsWith('−') ? -Number(shown.slice(2)) : Number(shown.replace('+ ', ''));
    await advance(flashMs);
    await advance(FLASH_GAP_MS);
  }
  expect(screen.getByText("What's the total?")).toBeOnTheScreen();
  return sum;
}

function choices(): number[] {
  return screen
    .getAllByRole('button')
    .map((node) => node.props.accessibilityLabel as string)
    .filter((label) => /^\d+$/.test(label))
    .map(Number);
}

async function startRound(onFinish = jest.fn()) {
  await renderThemed(<GameRunner game={game} seed={9} onFinish={onFinish} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Start' }));
  await advance(3000);
  return onFinish;
}

beforeEach(() => {
  jest.useFakeTimers({ now: 0 });
  feedback.mockClear();
});
afterEach(() => jest.useRealTimers());

describe('Quick Sum questions', () => {
  it('has four different choices, one of them the total, and never goes below zero', () => {
    const rng = createRng(4);
    for (let level = 1; level <= quickSum.levels; level += 1) {
      const { count, min, max } = QUICK_SUM_LEVELS[level - 1];
      for (let i = 0; i < 300; i += 1) {
        const q = createQuickSumQuestion(level, rng);
        expect(q.steps).toHaveLength(count);
        let running = 0;
        for (const step of q.steps) {
          expect(Math.abs(step)).toBeGreaterThanOrEqual(min);
          expect(Math.abs(step)).toBeLessThanOrEqual(max);
          running += step;
          expect(running).toBeGreaterThanOrEqual(0);
        }
        expect(new Set(q.choices).size).toBe(4);
        expect(q.choices).toContain(total(q));
        expect(Math.min(...q.choices)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('only subtracts from level 4 up', () => {
    const rng = createRng(8);
    const hasMinus = (level: number) =>
      Array.from({ length: 200 }, () => createQuickSumQuestion(level, rng)).some((q) => q.steps.some((s) => s < 0));
    expect(hasMinus(3)).toBe(false);
    expect(hasMinus(4)).toBe(true);
  });

  it('flashes more numbers or flashes them faster at every level', () => {
    for (let level = 2; level <= quickSum.levels; level += 1) {
      const now = QUICK_SUM_LEVELS[level - 1];
      const before = QUICK_SUM_LEVELS[level - 2];
      expect(now.count > before.count || now.flashMs < before.flashMs).toBe(true);
    }
  });

  it('labels steps as a running sum', () => {
    expect(stepLabel(7, 0)).toBe('7');
    expect(stepLabel(4, 1)).toBe('+ 4');
    expect(stepLabel(-3, 2)).toBe('− 3');
  });
});

describe('Quick Sum on the game framework', () => {
  it('flashes the numbers, then takes the total, and levels up on four quick right answers', async () => {
    await startRound();
    expect(screen.getByText('Keep the running total')).toBeOnTheScreen();
    // No choices while the numbers are flashing.
    expect(choices()).toEqual([]);

    for (let i = 0; i < 4; i += 1) {
      const sum = await watchNumbers(1);
      expect(choices()).toContain(sum);
      await fireEvent.press(screen.getByRole('button', { name: String(sum) }));
      expect(feedback).toHaveBeenLastCalledWith('right');
    }
    expect(screen.getByLabelText('Level 2 of 6')).toBeOnTheScreen();
  });

  it('plays the wrong feedback for a wrong total and for running out of time', async () => {
    await startRound();
    const sum = await watchNumbers(1);
    const wrong = choices().find((c) => c !== sum)!;
    await fireEvent.press(screen.getByRole('button', { name: String(wrong) }));
    expect(feedback).toHaveBeenLastCalledWith('wrong');

    feedback.mockClear();
    await watchNumbers(1);
    await advance(6000);
    expect(screen.getByText('Keep the running total')).toBeOnTheScreen();
    expect(feedback).toHaveBeenCalledWith('wrong');
  });

  it('ignores a second tap on the same question', async () => {
    await startRound();
    const sum = await watchNumbers(1);
    const button = screen.getByRole('button', { name: String(sum) });
    await fireEvent.press(button);
    await fireEvent.press(button);
    expect(feedback).toHaveBeenCalledTimes(1);
  });

  it('reports a score to the framework after 60 seconds', async () => {
    const onFinish = await startRound();
    const sum = await watchNumbers(1);
    await fireEvent.press(screen.getByRole('button', { name: String(sum) }));
    await advance(60_000);
    expect(screen.getByText("Time's up")).toBeOnTheScreen();
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(onFinish.mock.calls[0][0].correct).toBe(1);
    expect(onFinish.mock.calls[0][0].score).toBeGreaterThan(0);
  });

  it('does not replay the numbers after a pause', async () => {
    await startRound();
    await watchNumbers(1);
    await fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByText("What's the total?")).toBeOnTheScreen();
  });

  it('allows the flash time plus a few seconds per question', () => {
    expect(quickSum.targetResponseMs(1)).toBeGreaterThan(flashTimeMs(1));
  });
});
