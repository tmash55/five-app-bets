import { nbaGameKey } from './games.ts';
import {
  GRADING_CONFIG,
  type GameData,
  type Grade,
  type GradingConfig,
  type OpenQuestion,
} from './types.ts';

const HOUR = 3600_000;

function statValue(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return 0;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** The key a question's game has in the map built by nbaGames / nflGames. */
export function gameKey(q: Pick<OpenQuestion, 'sport' | 'grading_rule' | 'game_id'>): string {
  const id = q.grading_rule?.game_id ?? q.game_id;
  return q.sport === 'nba' ? nbaGameKey(id) : String(id);
}

/**
 * Grades one question from final game data, using its stored grading rule.
 *
 * - Postponed, cancelled or suspended game: void.
 * - Game not final yet: pending, until `voidIfUnfinishedAfterHours`, then void.
 * - Final, player played: sum the rule's stat columns; "yes" when the sum is at least the threshold.
 * - Final, player did not play: void, but only once `inactiveAfterHours` have passed and the
 *   game has stats loaded, so a box score still being written is not mistaken for a DNP.
 */
export function gradeQuestion(
  q: OpenQuestion,
  game: GameData | undefined,
  now: Date,
  config: GradingConfig = GRADING_CONFIG,
): Grade {
  const rule = q.grading_rule;
  if (!rule || rule.version !== 1 || rule.kind !== 'player_stat_at_least') {
    return { kind: 'error', why: `Unknown grading rule ${JSON.stringify(rule?.kind ?? rule)}` };
  }
  if (!Array.isArray(rule.stats) || rule.stats.length === 0 || !Number.isFinite(rule.threshold)) {
    return { kind: 'error', why: 'Grading rule has no stats or threshold' };
  }

  const sinceStart = now.getTime() - Date.parse(q.starts_at);
  const state = game?.state ?? { kind: 'not_final' as const };

  if (state.kind === 'called_off') {
    return { kind: 'settled', result: 'void', value: null, voidReason: state.reason };
  }
  if (state.kind === 'not_final') {
    if (sinceStart >= config.voidIfUnfinishedAfterHours * HOUR) {
      return {
        kind: 'settled',
        result: 'void',
        value: null,
        voidReason: `No final result ${config.voidIfUnfinishedAfterHours} hours after the start`,
      };
    }
    return { kind: 'pending', why: 'Game not final' };
  }

  const line = game?.players.get(String(rule.player_id));
  if (line?.kind === 'played') {
    let total = 0;
    for (const column of rule.stats) {
      const v = statValue(line.stats[column]);
      if (v === null) return { kind: 'error', why: `Stat ${column} is not a number` };
      total += v;
    }
    return { kind: 'settled', result: total >= rule.threshold ? 'yes' : 'no', value: total, voidReason: null };
  }

  const graceOver = sinceStart >= config.inactiveAfterHours * HOUR;
  if (line?.kind === 'inactive' && graceOver) {
    return { kind: 'settled', result: 'void', value: null, voidReason: `${rule.player_name} did not play` };
  }
  if (!line && game?.statsLoaded && graceOver) {
    return { kind: 'settled', result: 'void', value: null, voidReason: `${rule.player_name} did not play` };
  }
  if (!game?.statsLoaded && sinceStart >= config.voidIfUnfinishedAfterHours * HOUR) {
    return {
      kind: 'settled',
      result: 'void',
      value: null,
      voidReason: `No stats ${config.voidIfUnfinishedAfterHours} hours after the start`,
    };
  }
  return { kind: 'pending', why: game?.statsLoaded ? 'Waiting for the player line' : 'Waiting for stats' };
}

export type Settlement = {
  question_id: string;
  result: 'yes' | 'no' | 'void';
  value: number | null;
  void_reason: string | null;
};

/** Grades every open question. Returns what to save, and notes on what was left open or failed. */
export function planGrading(
  questions: OpenQuestion[],
  games: { nba: Map<string, GameData>; nfl: Map<string, GameData> },
  now: Date,
  config: GradingConfig = GRADING_CONFIG,
): { settle: Settlement[]; pending: { id: string; why: string }[]; errors: { id: string; why: string }[] } {
  const settle: Settlement[] = [];
  const pending: { id: string; why: string }[] = [];
  const errors: { id: string; why: string }[] = [];
  for (const q of questions) {
    const game = games[q.sport]?.get(gameKey(q));
    const grade = gradeQuestion(q, game, now, config);
    if (grade.kind === 'settled') {
      settle.push({ question_id: q.id, result: grade.result, value: grade.value, void_reason: grade.voidReason });
    } else if (grade.kind === 'pending') {
      pending.push({ id: q.id, why: grade.why });
    } else {
      errors.push({ id: q.id, why: grade.why });
    }
  }
  return { settle, pending, errors };
}
