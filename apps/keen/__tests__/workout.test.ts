import AsyncStorage from '@react-native-async-storage/async-storage';

import { KEEN_GAMES, findGame } from '@/games';
import { addDays } from '@/skills/dates';
import { GAME_SKILLS } from '@/skills/focusSkills';
import {
  canPlay,
  freeGameOfTheDay,
  isWorkoutComplete,
  markWorkoutGameDone,
  nextWorkoutGame,
  pickWorkoutGames,
  readWorkout,
} from '@/workout/workout';

jest.mock('react-native-purchases', () => ({}));
jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@/feedback/feedback', () => ({ giveFeedback: jest.fn() }));

const skillsOf = (ids: string[]) => ids.map((id) => findGame(id)?.skill);

beforeEach(() => AsyncStorage.clear());

describe('pickWorkoutGames', () => {
  it('picks three different games for three different skills when all skills are on', () => {
    for (let i = 0; i < 14; i++) {
      const games = pickWorkoutGames(addDays('2026-11-10', i), GAME_SKILLS);
      expect(games).toHaveLength(3);
      expect(new Set(games).size).toBe(3);
      expect(new Set(skillsOf(games)).size).toBe(3);
    }
  });

  it('is the same all day and changes from day to day', () => {
    expect(pickWorkoutGames('2026-11-10', GAME_SKILLS)).toEqual(pickWorkoutGames('2026-11-10', GAME_SKILLS));
    const week = new Set(
      Array.from({ length: 7 }, (_, i) => pickWorkoutGames(addDays('2026-11-10', i), GAME_SKILLS).join()),
    );
    expect(week.size).toBeGreaterThan(1);
  });

  it('sticks to the chosen skills while they have games', () => {
    for (let i = 0; i < 7; i++) {
      const games = pickWorkoutGames(addDays('2026-11-10', i), ['memory', 'math']);
      expect(games).toHaveLength(3);
      expect(skillsOf(games).every((skill) => skill === 'memory' || skill === 'math')).toBe(true);
      // Both skills get a game before either gets a second.
      expect(new Set(skillsOf(games)).size).toBe(2);
    }
  });

  it('fills up with other games when the chosen skills have too few', () => {
    const games = pickWorkoutGames('2026-11-10', ['words']);
    expect(games).toHaveLength(3);
    expect(games).toContain('missing-letter');
    expect(new Set(games).size).toBe(3);
  });

  it('never asks for more games than exist', () => {
    expect(pickWorkoutGames('2026-11-10', GAME_SKILLS, KEEN_GAMES.slice(0, 2))).toHaveLength(2);
  });
});

describe('saved workout', () => {
  it('keeps the day’s picks even if the chosen skills change', async () => {
    const first = await readWorkout(['words'], '2026-11-10');
    const again = await readWorkout(['memory'], '2026-11-10');
    expect(again.games).toEqual(first.games);
    const tomorrow = await readWorkout(['memory'], '2026-11-11');
    expect(skillsOf(tomorrow.games)).toContain('memory');
  });

  it('ticks games off in any order and only workout games', async () => {
    const workout = await readWorkout(GAME_SKILLS, '2026-11-10');
    const [a, b, c] = workout.games;
    expect(nextWorkoutGame(workout)).toBe(a);
    const outside = KEEN_GAMES.map((game) => game.module.id).find((id) => !workout.games.includes(id))!;
    expect((await markWorkoutGameDone(outside, '2026-11-10'))?.done).toEqual([]);
    await markWorkoutGameDone(b, '2026-11-10');
    let saved = await readWorkout(GAME_SKILLS, '2026-11-10');
    expect(nextWorkoutGame(saved)).toBe(a);
    await markWorkoutGameDone(a, '2026-11-10');
    await markWorkoutGameDone(a, '2026-11-10');
    saved = await readWorkout(GAME_SKILLS, '2026-11-10');
    expect(saved.done).toEqual([b, a]);
    expect(isWorkoutComplete(saved)).toBe(false);
    await markWorkoutGameDone(c, '2026-11-10');
    saved = await readWorkout(GAME_SKILLS, '2026-11-10');
    expect(isWorkoutComplete(saved)).toBe(true);
    expect(nextWorkoutGame(saved)).toBeNull();
  });

  it('does nothing when there is no workout that day', async () => {
    expect(await markWorkoutGameDone('pairs', '2026-11-10')).toBeNull();
  });
});

describe('free tier', () => {
  it('gives free players the first workout game only, and premium players everything', async () => {
    const workout = await readWorkout(GAME_SKILLS, '2026-11-10');
    const free = freeGameOfTheDay(workout)!;
    expect(free).toBe(workout.games[0]);
    expect(canPlay(free, workout, false)).toBe(true);
    for (const id of KEEN_GAMES.map((game) => game.module.id).filter((id) => id !== free)) {
      expect(canPlay(id, workout, false)).toBe(false);
      expect(canPlay(id, workout, true)).toBe(true);
    }
    expect(canPlay(free, null, false)).toBe(false);
  });
});
