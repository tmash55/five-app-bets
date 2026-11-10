import type { Sport } from './types.ts';

/**
 * The prop markets Called It turns into questions. Anything not listed here is
 * ignored. `ask(n)` finishes "Will <player> ..." for a threshold of n.
 * `stats` are the columns of the sport's final stat table that grading sums.
 */
export type MarketSpec = {
  sport: Sport;
  market: string;
  /** Short name for the stat line, such as "points". */
  noun: string;
  ask: (n: number) => string;
  stats: string[];
  /** Lines below this make dull questions ("1 or more blocks"). */
  minLine: number;
  /** 1 for the stats fans follow most (points, yards, touchdowns), less for the rest. */
  appeal: number;
  /** Start of the stat line, such as "27+ points". Defaults to `${n}+ ${noun}`. */
  hitLabel?: (n: number) => string;
};

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const MARKETS: MarketSpec[] = [
  {
    sport: 'nba',
    market: 'player_points',
    noun: 'points',
    ask: (n) => `score ${n} or more points`,
    stats: ['pts'],
    minLine: 9.5,
    appeal: 1,
  },
  {
    sport: 'nba',
    market: 'player_rebounds',
    noun: 'rebounds',
    ask: (n) => `grab ${n} or more rebounds`,
    stats: ['reb'],
    minLine: 4.5,
    appeal: 0.6,
  },
  {
    sport: 'nba',
    market: 'player_assists',
    noun: 'assists',
    ask: (n) => `dish out ${n} or more assists`,
    stats: ['ast'],
    minLine: 3.5,
    appeal: 0.6,
  },
  {
    sport: 'nba',
    market: 'player_threes_made',
    noun: 'threes',
    ask: (n) => (n === 1 ? 'make a three' : `make ${n} or more threes`),
    stats: ['fg3m'],
    minLine: 1.5,
    appeal: 0.7,
    hitLabel: (n) => (n === 1 ? 'A three' : `${n}+ threes`),
  },
  {
    sport: 'nba',
    market: 'player_points_rebounds_assists',
    noun: 'points + rebounds + assists',
    ask: (n) => `put up ${n} or more points, rebounds and assists combined`,
    stats: ['pts', 'reb', 'ast'],
    minLine: 19.5,
    appeal: 0.7,
  },
  {
    sport: 'nfl',
    market: 'player_passing_yards',
    noun: 'passing yards',
    ask: (n) => `throw for ${n} or more yards`,
    stats: ['passing_yards'],
    minLine: 149.5,
    appeal: 1,
  },
  {
    sport: 'nfl',
    market: 'player_passing_tds',
    noun: 'passing TDs',
    ask: (n) => `throw ${n} or more touchdown ${plural(n, 'pass', 'passes')}`,
    stats: ['passing_touchdowns'],
    minLine: 1.5,
    appeal: 0.8,
  },
  {
    sport: 'nfl',
    market: 'player_rushing_yards',
    noun: 'rushing yards',
    ask: (n) => `run for ${n} or more yards`,
    stats: ['rushing_yards'],
    minLine: 39.5,
    appeal: 1,
  },
  {
    sport: 'nfl',
    market: 'player_receiving_yards',
    noun: 'receiving yards',
    ask: (n) => `have ${n} or more receiving yards`,
    stats: ['receiving_yards'],
    minLine: 39.5,
    appeal: 1,
  },
  {
    sport: 'nfl',
    market: 'player_receptions',
    noun: 'catches',
    ask: (n) => `catch ${n} or more passes`,
    stats: ['receptions'],
    minLine: 3.5,
    appeal: 0.6,
  },
  {
    sport: 'nfl',
    market: 'player_touchdowns',
    noun: 'touchdowns',
    ask: (n) => (n === 1 ? 'score a touchdown' : `score ${n} or more touchdowns`),
    stats: ['rushing_touchdowns', 'receiving_touchdowns'],
    minLine: 0.5,
    appeal: 1,
    hitLabel: (n) => (n === 1 ? 'A touchdown' : `${n}+ touchdowns`),
  },
];

export function marketSpec(sport: Sport, market: string): MarketSpec | undefined {
  return MARKETS.find((m) => m.sport === sport && m.market === market);
}

export function marketKeys(sport: Sport): string[] {
  return MARKETS.filter((m) => m.sport === sport).map((m) => m.market);
}
