import { ThemeProvider } from '@five/shell';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { biggerNumber, type BiggerNumberQuestion } from '../example/biggerNumber';
import { createRng } from '../core/rng';
import { GameRunner } from '../ui/GameRunner';

// The shell index pulls in RevenueCat, which the game never uses.
jest.mock('react-native-purchases', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/** Reads the two numbers on the board and taps the bigger (or smaller) one. */
async function tap(pick: 'bigger' | 'smaller') {
  const tiles = screen
    .getAllByRole('button')
    .map((node) => node.props.accessibilityLabel as string)
    .filter((label) => /^\d+$/.test(label))
    .map(Number);
  expect(tiles).toHaveLength(2);
  const target = pick === 'bigger' ? Math.max(...tiles) : Math.min(...tiles);
  await fireEvent.press(screen.getByRole('button', { name: String(target) }));
}

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

async function renderGame(onFinish = jest.fn(), onExit = jest.fn()) {
  await render(
    <ThemeProvider>
      <GameRunner game={biggerNumber} seed={3} onFinish={onFinish} onExit={onExit} />
    </ThemeProvider>,
  );
  return { onFinish, onExit };
}

beforeEach(() => jest.useFakeTimers({ now: 0 }));
afterEach(() => jest.useRealTimers());

describe('Bigger Number on the game framework', () => {
  it('runs start, countdown, timed play with adaptive difficulty, and results', async () => {
    const { onFinish } = await renderGame();

    expect(screen.getByText('Bigger Number')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getByLabelText('Starting in 3')).toBeOnTheScreen();

    await advance(3000);
    expect(screen.getByLabelText('Level 1 of 5')).toBeOnTheScreen();
    expect(screen.getByText('0:45')).toBeOnTheScreen();

    // Four quick right answers move the player up a level.
    for (let i = 0; i < 4; i += 1) {
      await advance(300);
      await tap('bigger');
    }
    expect(screen.getByLabelText('Level 2 of 5')).toBeOnTheScreen();
    expect(screen.getByText(/level up/)).toBeOnTheScreen();

    // Two misses in a row drop it back down.
    await tap('smaller');
    await tap('smaller');
    expect(screen.getByLabelText('Level 1 of 5')).toBeOnTheScreen();

    await advance(45_000);
    expect(screen.getByText("Time's up")).toBeOnTheScreen();
    expect(onFinish).toHaveBeenCalledTimes(1);
    const summary = onFinish.mock.calls[0][0];
    expect(summary).toMatchObject({ correct: 4, highestLevel: 2, finalLevel: 1 });
    // 4 right, 2 wrong, then the last question timed out.
    expect(summary.answered).toBeGreaterThanOrEqual(7);
    expect(screen.getByLabelText(`Final score ${summary.score}`)).toBeOnTheScreen();
    expect(summary.score).toBeGreaterThan(400);

    await fireEvent.press(screen.getByRole('button', { name: 'Play again' }));
    expect(screen.getByLabelText('Starting in 3')).toBeOnTheScreen();
  });

  it('pauses the clock and hides the board while paused', async () => {
    await renderGame();
    await fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    await advance(3000);
    await advance(5000); // 5 s in; the first question times out at 4 s
    await fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByText('Paused')).toBeOnTheScreen();
    expect(screen.queryByText('Which is bigger?')).toBeNull();
    expect(screen.getByText('0:40 left in this round')).toBeOnTheScreen();

    await advance(60_000);
    expect(screen.getByText('0:40 left in this round')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Resume' }));
    expect(screen.getByText('Which is bigger?')).toBeOnTheScreen();
  });

  it('pauses by itself when the app goes to the background', async () => {
    const listeners: ((status: AppStateStatus) => void)[] = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
      listeners.push(listener);
      return { remove: jest.fn() };
    });
    await renderGame();
    await fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    await advance(3000);
    await act(async () => listeners.at(-1)?.('background'));
    expect(screen.getByText('Paused')).toBeOnTheScreen();
  });

  it('offers quit while paused', async () => {
    const { onExit } = await renderGame();
    await fireEvent.press(screen.getByRole('button', { name: 'Start' }));
    await advance(3000);
    await fireEvent.press(screen.getByRole('button', { name: 'Pause' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Quit' }));
    expect(onExit).toHaveBeenCalled();
  });
});

describe('Bigger Number questions', () => {
  it('always has one bigger number inside the level range', () => {
    const rng = createRng(11);
    for (let level = 1; level <= biggerNumber.levels; level += 1) {
      for (let i = 0; i < 200; i += 1) {
        const q: BiggerNumberQuestion = biggerNumber.createQuestion(level, rng);
        expect(q.left).not.toBe(q.right);
        expect(Math.min(q.left, q.right)).toBeGreaterThanOrEqual(1);
        expect(biggerNumber.isCorrect(q, q.left > q.right ? 'left' : 'right')).toBe(true);
      }
    }
  });
});
