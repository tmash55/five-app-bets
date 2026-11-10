// Shapes shared by the slate generator (Edge Function), the review screen and
// the tests. This folder has no runtime imports so it runs unchanged in Deno,
// Node and React Native.

export type Sport = 'nba' | 'nfl';

/** Numbers can come back from Postgres numeric columns as strings. */
export type Numeric = number | string | null | undefined;

/** One row of Unjuiced `nba_hit_rate_profiles_v2` (only the columns we read). */
export type NbaPropRow = {
  player_id: number;
  player_name: string | null;
  team_abbr: string | null;
  opponent_team_abbr: string | null;
  home_away: string | null;
  game_id: number;
  game_date: string;
  /** "7:30 pm ET" before tip-off, then "Q3 3:10", "Final", ... */
  game_status: string | null;
  market: string;
  line: Numeric;
  over_price: string | number | null;
  under_price: string | number | null;
  book_count: number | null;
  /** Percent, 0 to 100. */
  last_10_pct: Numeric;
  last_10_avg: Numeric;
  season_avg: Numeric;
  injury_status: string | null;
  has_live_odds: boolean | null;
  /** Newest first. Each entry has `market_stat`, the stat for this market. */
  game_logs?: { date?: string; market_stat?: Numeric }[] | null;
};

/** One row of Unjuiced `nfl_hit_rate_profiles` (only the columns we read). */
export type NflPropRow = {
  player_id: string;
  player_name: string | null;
  position: string | null;
  team_abbr: string | null;
  opponent_team_abbr: string | null;
  game_id: string;
  game_date: string;
  market: string;
  line: Numeric;
  over_price: string | number | null;
  under_price: string | number | null;
  book_count: number | null;
  /** Fraction, 0 to 1. */
  last_10_pct: Numeric;
  last_10_avg: Numeric;
  sample_size_l10: number | null;
  season_avg: Numeric;
  has_live_odds: boolean | null;
};

/** One row of Unjuiced `nfl_games` (only the columns we read). */
export type NflGameRow = {
  game_id: string;
  scheduled_at: string | null;
  home_team_abbr: string | null;
  away_team_abbr: string | null;
  status: string | null;
  completed: boolean | null;
};

/** How a question is graded once the game is final (see UNJ-1423). */
export type GradingRule = {
  version: 1;
  kind: 'player_stat_at_least';
  sport: Sport;
  /** Unjuiced table that holds the final stat line. */
  source_table: 'nba_player_box_scores' | 'nfl_player_game_logs';
  game_id: string;
  player_id: string;
  player_name: string;
  market: string;
  /** Columns in `source_table` summed to get the player's number. */
  stats: string[];
  /** "Yes" wins when the summed stats are at least this. */
  threshold: number;
  /** The sportsbook line the threshold came from. */
  line: number;
  /** Void, not "No", when the player does not play. */
  void_if_player_inactive: true;
};

/** A prop that could become a question, normalized across sports. */
export type Candidate = {
  sport: Sport;
  gameId: string;
  gameLabel: string;
  startsAt: string;
  playerId: string;
  playerName: string;
  market: string;
  line: number;
  threshold: number;
  /** No-vig chance of "Yes" from the over and under prices, 0 to 1. */
  yesChance: number;
  bookCount: number;
  /** Bigger means a better-known player. Compared within a sport only. */
  starPower: number;
  l10Hits: number;
  l10Games: number;
  l10Avg: number | null;
};

export type GeneratedQuestion = {
  position: number;
  sport: Sport;
  game_id: string;
  game_label: string;
  starts_at: string;
  lock_at: string;
  prompt: string;
  stat_line: string;
  grading_rule: GradingRule;
  source: {
    line: number;
    yes_chance: number;
    book_count: number;
  };
};

export type GeneratedSlate = {
  slate_date: string;
  questions: GeneratedQuestion[];
  /** Plain-language notes for the reviewer, such as "only 4 questions found". */
  notes: string[];
};
