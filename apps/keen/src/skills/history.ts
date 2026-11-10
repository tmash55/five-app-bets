import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameModule, RoundSummary } from '@five/game';

import { addDays, dateKey, type DateKey } from './dates';
import { applyRound, rateRound, type GameSkillId, type SkillId, type SkillScores } from './skills';

/**
 * Skill scores and their history, kept on the device. One snapshot per day
 * holds the scores at the end of that day; the Progress charts draw these and
 * the Today screen compares against the one from a week ago.
 */
export type SkillSnapshot = { date: DateKey; scores: SkillScores };
export type SkillHistory = SkillSnapshot[];

const HISTORY_KEY = 'keen.skills.history';
/** About a year of days played. */
export const MAX_SNAPSHOTS = 400;

export async function readSkillHistory(): Promise<SkillHistory> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as SkillHistory) : [];
  } catch {
    return [];
  }
}

export async function writeSkillHistory(history: SkillHistory) {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-MAX_SNAPSHOTS)));
}

export function currentScores(history: SkillHistory): SkillScores {
  return history.at(-1)?.scores ?? {};
}

/** Puts `scores` in today's snapshot, replacing an earlier one from today. */
export function withScoresOn(history: SkillHistory, date: DateKey, scores: SkillScores): SkillHistory {
  const rest = history.filter((snapshot) => snapshot.date < date);
  return [...rest, { date, scores }];
}

/**
 * Updates the skill scores after a finished round. Every round counts, in or
 * out of the daily workout. Returns the new scores.
 */
export async function recordSkillRound(
  game: Pick<GameModule<unknown, unknown>, 'levels' | 'scoring'>,
  skill: GameSkillId,
  summary: RoundSummary,
  date: DateKey = dateKey(),
): Promise<SkillScores> {
  const history = await readSkillHistory();
  const scores = applyRound(currentScores(history), skill, rateRound(game, summary));
  await writeSkillHistory(withScoresOn(history, date, scores));
  return scores;
}

/**
 * Change in each skill since a week ago: the current score minus the score in
 * the latest snapshot at least seven days old. Null when there is no score
 * from a week ago to compare with.
 */
export function changeSinceLastWeek(
  history: SkillHistory,
  today: DateKey = dateKey(),
): Partial<Record<SkillId, number | null>> {
  const current = currentScores(history);
  const weekAgo = addDays(today, -7);
  const baseline = [...history].reverse().find((snapshot) => snapshot.date <= weekAgo)?.scores ?? {};
  const change: Partial<Record<SkillId, number | null>> = {};
  for (const id of Object.keys(current) as SkillId[]) {
    const before = baseline[id];
    change[id] = before === undefined ? null : (current[id] ?? 0) - before;
  }
  return change;
}

/** The points of one skill's chart: the last `limit` days that have a score. */
export function skillSeries(history: SkillHistory, skill: SkillId, limit = 30) {
  return history
    .filter((snapshot) => snapshot.scores[skill] !== undefined)
    .slice(-limit)
    .map((snapshot) => ({ date: snapshot.date, score: snapshot.scores[skill] as number }));
}
