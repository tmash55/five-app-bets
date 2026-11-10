import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GameModule, RoundSummary } from '@five/game';

import { KEEN_GAMES, type KeenGame } from '@/games';
import { dateKey, type DateKey } from '@/skills/dates';
import { currentScores, readSkillHistory, withScoresOn, writeSkillHistory } from '@/skills/history';
import { rateRound, type SkillId, type SkillScores } from '@/skills/skills';

/**
 * The 60-second baseline test at the end of onboarding: the first two Keen
 * games (Pairs, then Quick Sum), 30 seconds each. It sets the player's
 * starting skill scores, which the plan screen and share card show.
 */
export const BASELINE_SECONDS = 60;
export const BASELINE_GAME_COUNT = 2;
const PER_GAME_MS = (BASELINE_SECONDS * 1000) / BASELINE_GAME_COUNT;

/** A Keen game with its round cut to its share of the 60 seconds. */
function forBaseline(game: KeenGame): KeenGame {
  const module: GameModule<any, any> = {
    ...game.module,
    round: { ...game.module.round, durationMs: PER_GAME_MS },
  };
  return { ...game, module };
}

export const BASELINE_GAMES: KeenGame[] = KEEN_GAMES.slice(0, BASELINE_GAME_COUNT).map(forBaseline);

export type BaselineRound = { gameId: string; summary: RoundSummary };

export type BaselineResult = {
  date: DateKey;
  /** Scores 0 to 1000 for the skills the test measured (memory, math, speed). */
  scores: SkillScores;
  /** One number for the share card: the average of the measured skills. */
  keenScore: number;
  rounds: BaselineRound[];
};

/**
 * Turns the two finished rounds into starting scores. Each game rates its own
 * skill; speed is the average of the speed ratings of both games, so neither
 * game outweighs the other. A round with no answers leaves its skill unscored.
 */
export function scoreBaseline(rounds: readonly BaselineRound[], date: DateKey = dateKey()): BaselineResult {
  const scores: SkillScores = {};
  const speeds: number[] = [];
  for (const { gameId, summary } of rounds) {
    const game = BASELINE_GAMES.find((g) => g.module.id === gameId);
    if (!game) continue;
    const rating = rateRound(game.module, summary);
    if (rating.skill !== null) scores[game.skill] = rating.skill;
    if (rating.speed !== null) speeds.push(rating.speed);
  }
  if (speeds.length > 0) scores.speed = Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length);
  const measured = Object.values(scores) as number[];
  const keenScore =
    measured.length > 0 ? Math.round(measured.reduce((a, b) => a + b, 0) / measured.length) : 0;
  return { date, scores, keenScore, rounds: [...rounds] };
}

/** The measured skill with the lowest score, which the plan starts on. */
export function weakestSkill(scores: SkillScores): SkillId | null {
  let weakest: SkillId | null = null;
  for (const [id, score] of Object.entries(scores) as [SkillId, number][]) {
    if (weakest === null || score < (scores[weakest] as number)) weakest = id;
  }
  return weakest;
}

const KEY = 'keen.baseline';

export async function readBaseline(): Promise<BaselineResult | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as BaselineResult) : null;
  } catch {
    return null;
  }
}

/**
 * Saves the baseline and makes its scores the player's starting skill scores
 * (today's snapshot in the skill history). Scores the test did not measure
 * are left as they were. Retaking the test replaces the starting scores.
 */
export async function saveBaseline(result: BaselineResult): Promise<void> {
  const history = await readSkillHistory();
  const scores = { ...currentScores(history), ...result.scores };
  await Promise.all([
    AsyncStorage.setItem(KEY, JSON.stringify(result)),
    writeSkillHistory(withScoresOn(history, result.date, scores)),
  ]);
}
