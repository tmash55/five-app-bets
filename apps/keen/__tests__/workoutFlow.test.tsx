import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RoundSummary } from '@five/game';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import Today from '@/app/(tabs)/index';
import Progress from '@/app/(tabs)/progress';
import PlayGame from '@/app/play/[game]';
import { findGame } from '@/games';
import { addDays, dateKey } from '@/skills/dates';
import { readSkillHistory } from '@/skills/history';
import { skillLabel } from '@/skills/skills';
import { readWorkout } from '@/workout/workout';
import { GAME_SKILLS } from '@/skills/focusSkills';

import { renderThemed } from '../test/helpers';

jest.mock('react-native-purchases', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/feedback/feedback', () => ({
  giveFeedback: jest.fn(),
  preloadFeedback: jest.fn(),
  releaseFeedback: jest.fn(),
}));
let mockPremium = true;
jest.mock('@/workout/premium', () => ({ usePremium: () => mockPremium }));

// The game itself is covered by its own tests; here a stand-in finishes the round.
const mockRound: RoundSummary = {
  score: 1200,
  accuracyPoints: 1000,
  speedPoints: 250,
  answered: 10,
  correct: 9,
  accuracy: 0.9,
  averageCorrectMs: 900,
  startLevel: 1,
  finalLevel: 4,
  highestLevel: 5,
  longestStreak: 6,
};
jest.mock('@five/game', () => {
  const actual = jest.requireActual('@five/game');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable, Text } = require('react-native');
  return {
    ...actual,
    GameRunner: ({ game, onFinish }: { game: { title: string }; onFinish: (s: RoundSummary) => void }) => (
      <Pressable accessibilityRole="button" accessibilityLabel={`Finish ${game.title}`} onPress={() => onFinish(mockRound)}>
        <Text>{game.title} round</Text>
      </Pressable>
    ),
  };
});

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  return {
    router: {
      push: (...args: unknown[]) => mockPush(...args),
      back: jest.fn(),
      canGoBack: () => true,
      replace: jest.fn(),
    },
    useLocalSearchParams: () => mockParams,
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
  };
});

beforeEach(async () => {
  mockPremium = true;
  mockPush.mockClear();
  await AsyncStorage.clear();
});

async function finishFromToday(gameId: string) {
  mockParams = { game: gameId, from: 'workout' };
  const view = await renderThemed(<PlayGame />);
  const title = findGame(gameId)!.module.title;
  await waitFor(() => expect(screen.queryByText(`${title} round`)).toBeOnTheScreen());
  await fireEvent.press(await screen.findByRole('button', { name: `Finish ${title}` }));
  // Saving happens after the round ends; give the storage writes a moment.
  for (let i = 0; i < 20 && !(await readWorkout(GAME_SKILLS)).done.includes(gameId); i++) {
    await act(() => new Promise((resolve) => setTimeout(resolve, 5)));
  }
  expect((await readWorkout(GAME_SKILLS)).done).toContain(gameId);
  await view.unmount();
}

it('finishing the workout updates the skill scores and the charts', async () => {
  const today = dateKey();
  // A score from last week to compare against.
  await AsyncStorage.setItem(
    'keen.skills.history',
    JSON.stringify([{ date: addDays(today, -8), scores: { memory: 500, math: 500, focus: 500, words: 500, speed: 400 } }]),
  );

  let view = await renderThemed(<Today />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start workout' })).toBeOnTheScreen());
  const { games } = await readWorkout(GAME_SKILLS);
  expect(games).toHaveLength(3);
  for (const id of games) expect(screen.getByText(findGame(id)!.module.title)).toBeOnTheScreen();
  expect(screen.getAllByText('0')).toHaveLength(5);

  await fireEvent.press(screen.getByRole('button', { name: 'Start workout' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/play/[game]', params: { game: games[0], from: 'workout' } });
  await view.unmount();

  for (const id of games) await finishFromToday(id);

  // Each round rates 0.7 * (4.5 - 1) / (levels - 1) + 0.3 * 0.9 for its skill and 500 for speed.
  const history = await readSkillHistory();
  expect(history.map((s) => s.date)).toEqual([addDays(today, -8), today]);
  const latest = history[1].scores;
  for (const id of games) expect(latest[findGame(id)!.skill]).not.toBe(500);
  expect(latest.speed).toBeGreaterThan(400);

  view = await renderThemed(<Today />);
  await waitFor(() => expect(screen.getByText('Workout done')).toBeOnTheScreen());
  expect(screen.getByRole('button', { name: 'Workout done' })).toBeDisabled();
  expect(screen.getAllByText('Done')).toHaveLength(3);
  expect(screen.getByLabelText(`Speed: ${latest.speed}, +${(latest.speed ?? 0) - 400} since last week`)).toBeOnTheScreen();
  await view.unmount();

  await renderThemed(<Progress />);
  const firstSkill = skillLabel(findGame(games[0])!.skill);
  await waitFor(() => expect(screen.getByLabelText(new RegExp(`^${firstSkill} chart: 2 days`))).toBeOnTheScreen());
  const chart = screen.getByLabelText(new RegExp(`^${firstSkill} chart`));
  expect(within(chart).getByTestId(`chart-bar-${today}`)).toBeOnTheScreen();
});

it('gives free players the first game and locks the rest of the workout', async () => {
  mockPremium = false;
  const { games } = await readWorkout(GAME_SKILLS);

  let view = await renderThemed(<Today />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Start workout' })).toBeEnabled());
  expect(screen.getAllByText('Premium')).toHaveLength(2);
  await view.unmount();

  await finishFromToday(games[0]);

  view = await renderThemed(<Today />);
  const next = findGame(games[1])!.module.title;
  await waitFor(() => expect(screen.getByRole('button', { name: `Next: ${next}` })).toBeDisabled());
  expect(screen.getByText("That's today's free game")).toBeOnTheScreen();
  await view.unmount();

  // Opening a locked game directly shows the lock instead of the game.
  mockParams = { game: games[1] };
  await renderThemed(<PlayGame />);
  await waitFor(() => expect(screen.getByText(`${next} is part of Keen Premium.`)).toBeOnTheScreen());
  expect(screen.queryByRole('button', { name: `Finish ${next}` })).toBeNull();
});

it('shows empty charts before any game is played', async () => {
  await renderThemed(<Progress />);
  await waitFor(() => expect(screen.getByText('Play a memory game to start this chart.')).toBeOnTheScreen());
  expect(screen.getAllByText('No score yet')).toHaveLength(5);
});
