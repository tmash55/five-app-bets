import { createRng, GameRunner } from '@five/game';
import { fireEvent, screen } from '@testing-library/react-native';

import { withAnswerFeedback } from '@/feedback/withAnswerFeedback';
import {
  createSequenceQuestion,
  isRightSequence,
  LIGHTS,
  patternLength,
  SEQUENCE_GAP_MS,
  sequence,
  showMsFor,
} from '@/games/sequence';

import { advance, renderThemed } from '../test/helpers';

jest.mock('react-native-purchases', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/feedback/feedback', () => ({ giveFeedback: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const feedback = require('@/feedback/feedback').giveFeedback as jest.Mock;
const game = withAnswerFeedback(sequence, feedback);

function litLight(): string | undefined {
  const label = screen
    .getAllByRole('button')
    .map((node) => node.props.accessibilityLabel as string)
    .find((l) => l?.endsWith(', lit'));
  return label?.replace(' light, lit', '');
}

/** Watches the pattern play at a level and returns the light names in order. */
async function watch(level: number, flashes = patternLength(level)): Promise<string[]> {
  const seen: string[] = [];
  for (let i = 0; i < flashes; i += 1) {
    seen.push(litLight()!);
    await advance(showMsFor(level));
    expect(litLight()).toBeUndefined();
    await advance(SEQUENCE_GAP_MS);
  }
  return seen;
}

const light = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name} light`) });

async function repeat(names: string[]) {
  for (const name of names) await fireEvent.press(light(name));
}

async function startRound(onFinish = jest.fn()) {
  await renderThemed(<GameRunner game={game} seed={14} onFinish={onFinish} />);
  await fireEvent.press(screen.getByRole('button', { name: 'Start' }));
  await advance(3000);
  return onFinish;
}

beforeEach(() => {
  jest.useFakeTimers({ now: 0 });
  feedback.mockClear();
});
afterEach(() => jest.useRealTimers());

describe('Sequence questions', () => {
  it('is one light longer at each level, using the four lights', () => {
    const rng = createRng(2);
    for (let level = 1; level <= sequence.levels; level += 1) {
      const q = createSequenceQuestion(level, rng);
      expect(q.pattern).toHaveLength(level + 2);
      q.pattern.forEach((l) => expect(l).toBeGreaterThanOrEqual(0));
      q.pattern.forEach((l) => expect(l).toBeLessThan(LIGHTS.length));
      if (level > 1) expect(showMsFor(level)).toBeLessThanOrEqual(showMsFor(level - 1));
    }
  });

  it('is only right when every light is repeated in order', () => {
    const q = { pattern: [0, 2, 2, 1], showMs: 500 };
    expect(isRightSequence(q, [0, 2, 2, 1])).toBe(true);
    expect(isRightSequence(q, [0, 2, 2])).toBe(false);
    expect(isRightSequence(q, [0, 2, 1, 1])).toBe(false);
  });
});

describe('Sequence on the game framework', () => {
  it('plays the pattern, takes it back, and grows by one light for each right pattern', async () => {
    await startRound();
    expect(screen.getByText('Watch the lights')).toBeOnTheScreen();
    for (let level = 1; level <= 3; level += 1) {
      expect(screen.getByLabelText(`Level ${level} of 10`)).toBeOnTheScreen();
      const pattern = await watch(level);
      expect(pattern).toHaveLength(level + 2);
      expect(screen.getByText('Your turn')).toBeOnTheScreen();
      await repeat(pattern);
      expect(feedback).toHaveBeenLastCalledWith('right');
    }
    expect(screen.getByLabelText('Level 4 of 10')).toBeOnTheScreen();
  });

  it('ignores taps while the pattern plays', async () => {
    await startRound();
    await fireEvent.press(light('blue'));
    expect(feedback).not.toHaveBeenCalled();
    expect(screen.getByText('Watch the lights')).toBeOnTheScreen();
  });

  it('ends the pattern at the first wrong tap and drops a light', async () => {
    await startRound();
    const first = await watch(1);
    await repeat(first);
    expect(screen.getByLabelText('Level 2 of 10')).toBeOnTheScreen();

    const pattern = await watch(2);
    const wrong = LIGHTS.map((l) => l.name).find((n) => n !== pattern[0])!;
    feedback.mockClear();
    await fireEvent.press(light(wrong));
    expect(feedback).toHaveBeenCalledTimes(1);
    expect(feedback).toHaveBeenLastCalledWith('wrong');
    expect(screen.getByLabelText('Level 1 of 10')).toBeOnTheScreen();
  });

  it('plays the tap sound for each light before the last', async () => {
    await startRound();
    const pattern = await watch(1);
    await fireEvent.press(light(pattern[0]));
    expect(feedback).toHaveBeenLastCalledWith('tap');
    expect(screen.getByText('1 of 3')).toBeOnTheScreen();
  });

  it('does not replay the pattern or lose taps after a pause', async () => {
    await startRound();
    const pattern = await watch(1);
    await fireEvent.press(light(pattern[0]));
    await fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByText('Your turn')).toBeOnTheScreen();
    expect(screen.getByText('1 of 3')).toBeOnTheScreen();
    feedback.mockClear();
    await repeat(pattern.slice(1));
    expect(feedback).toHaveBeenLastCalledWith('right');
  });

  it('reports a score after 60 seconds', async () => {
    const onFinish = await startRound();
    await repeat(await watch(1));
    await advance(60_000);
    expect(screen.getByText("Time's up")).toBeOnTheScreen();
    expect(onFinish.mock.calls[0][0].correct).toBe(1);
    expect(onFinish.mock.calls[0][0].score).toBeGreaterThan(0);
  });
});
