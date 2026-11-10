// Shapes for grading (UNJ-1423). Like ../slate, this folder has no runtime
// imports, so the grade-slates Edge Function (Deno) and Jest share it.

import type { GradingRule, Numeric, Sport } from '../slate/types.ts';

/** One row of Unjuiced `nba_games` (only the columns we read). */
export type NbaGameRow = {
  /** Text, sometimes zero-padded. Compared to the rule's game id as a number. */
  game_id: string;
  game_date: string;
  /** NBA convention: 1 scheduled, 2 live, 3 final. */
  game_status: number | null;
  game_status_text: string | null;
};

/** One row of Unjuiced `nba_player_box_scores` (only the columns we read). */
export type NbaBoxScoreRow = {
  game_id: number;
  player_id: number;
  minutes: Numeric;
} & Record<string, Numeric>;

/** One row of Unjuiced `nfl_player_game_logs` (only the columns we read). */
export type NflGameLogRow = {
  game_id: string;
  player_id: string;
  played: boolean | null;
} & Record<string, Numeric | boolean | string | null>;

/** Where a game stands, reduced to what grading needs. */
export type GameState =
  | { kind: 'not_final' }
  | { kind: 'final' }
  /** Postponed, cancelled or suspended: every question on it is void. */
  | { kind: 'called_off'; reason: string };

/** A player's final line in one game, or `inactive` when they did not play. */
export type PlayerLine = { kind: 'played'; stats: Record<string, Numeric> } | { kind: 'inactive' };

/** What we know about one game when grading. */
export type GameData = {
  state: GameState;
  /** True once the stats table has any rows for this game. */
  statsLoaded: boolean;
  /** By player id. */
  players: Map<string, PlayerLine>;
};

/** A question waiting for a result. */
export type OpenQuestion = {
  id: string;
  slate_id: string;
  sport: Sport;
  game_id: string;
  starts_at: string;
  grading_rule: GradingRule;
};

export type QuestionResult = 'yes' | 'no' | 'void';

export type Grade =
  /** Not decided yet; try again on the next run. */
  | { kind: 'pending'; why: string }
  | { kind: 'settled'; result: QuestionResult; value: number | null; voidReason: string | null }
  /** The rule cannot be graded by this code. Needs a person. */
  | { kind: 'error'; why: string };

/** Timing rules for grading. All in one place so they are easy to tune. */
export type GradingConfig = {
  /**
   * Only call a player inactive (and void the question) once this long after
   * the start, so a box score still being filled in is not read as "did not play".
   */
  inactiveAfterHours: number;
  /** Void a question whose game is still not final this long after the start. */
  voidIfUnfinishedAfterHours: number;
};

export const GRADING_CONFIG: GradingConfig = {
  inactiveAfterHours: 6,
  voidIfUnfinishedAfterHours: 36,
};
