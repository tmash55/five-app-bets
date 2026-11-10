import AsyncStorage from '@react-native-async-storage/async-storage';

import { KEEN_GAMES, type KeenGame } from '@/games';
import { dateKey, dayNumber, type DateKey } from '@/skills/dates';
import { GAME_SKILLS } from '@/skills/focusSkills';
import type { GameSkillId } from '@/skills/skills';

/** Three 60-second games plus their start screens and countdowns: about five minutes. */
export const WORKOUT_SIZE = 3;

export type Workout = {
  date: DateKey;
  /** Game ids in the order they are played. */
  games: string[];
  /** Game ids finished today as part of the workout. */
  done: string[];
};

const rotate = <T,>(items: readonly T[], by: number): T[] =>
  items.length === 0 ? [] : items.map((_, i) => items[(i + by) % items.length]);

/**
 * Picks today's games for the player's skills. Each focus skill gets one game
 * before any skill gets a second, and both the skill order and the game used
 * for each skill rotate day by day, so the workout changes daily but is the
 * same all day. With fewer focus skills than games, it fills up with other
 * games for those skills, then with any game.
 */
export function pickWorkoutGames(
  date: DateKey,
  focusSkills: readonly GameSkillId[],
  games: readonly KeenGame[] = KEEN_GAMES,
  size = WORKOUT_SIZE,
): string[] {
  const day = dayNumber(date);
  const skills = rotate(focusSkills.length > 0 ? focusSkills : GAME_SKILLS, day);
  const bySkill = skills.map((skill) =>
    rotate(
      games.filter((game) => game.skill === skill),
      day,
    ),
  );
  const picked: string[] = [];
  for (let round = 0; picked.length < size && bySkill.some((list) => list.length > round); round++) {
    for (const list of bySkill) {
      const game = list[round];
      if (game && picked.length < size) picked.push(game.module.id);
    }
  }
  for (const game of rotate(games, day)) {
    if (picked.length >= size) break;
    if (!picked.includes(game.module.id)) picked.push(game.module.id);
  }
  return picked;
}

const key = (date: DateKey) => `keen.workout.${date}`;

/**
 * Today's workout. The games are picked once and saved, so changing focus
 * skills mid-day does not reshuffle a workout already under way.
 */
export async function readWorkout(
  focusSkills: readonly GameSkillId[],
  date: DateKey = dateKey(),
): Promise<Workout> {
  try {
    const raw = await AsyncStorage.getItem(key(date));
    if (raw) {
      const saved = JSON.parse(raw) as Workout;
      if (Array.isArray(saved.games) && Array.isArray(saved.done)) return saved;
    }
  } catch {
    // Fall through and pick again.
  }
  const workout: Workout = { date, games: pickWorkoutGames(date, focusSkills), done: [] };
  await AsyncStorage.setItem(key(date), JSON.stringify(workout)).catch(() => undefined);
  return workout;
}

/** Marks a game of today's workout finished. Games outside the workout are ignored. */
export async function markWorkoutGameDone(gameId: string, date: DateKey = dateKey()): Promise<Workout | null> {
  const raw = await AsyncStorage.getItem(key(date));
  if (!raw) return null;
  const workout = JSON.parse(raw) as Workout;
  if (!workout.games.includes(gameId) || workout.done.includes(gameId)) return workout;
  const next = { ...workout, done: [...workout.done, gameId] };
  await AsyncStorage.setItem(key(date), JSON.stringify(next));
  return next;
}

export function nextWorkoutGame(workout: Workout): string | null {
  return workout.games.find((id) => !workout.done.includes(id)) ?? null;
}

export function isWorkoutComplete(workout: Workout): boolean {
  return workout.games.every((id) => workout.done.includes(id));
}

/**
 * Free players get one game a day: the first game of today's workout. Premium
 * players can play everything.
 */
export function freeGameOfTheDay(workout: Workout): string | null {
  return workout.games[0] ?? null;
}

export function canPlay(gameId: string, workout: Workout | null, premium: boolean): boolean {
  if (premium) return true;
  return workout !== null && freeGameOfTheDay(workout) === gameId;
}
