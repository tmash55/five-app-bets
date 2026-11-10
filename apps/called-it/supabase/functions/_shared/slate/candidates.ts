import { marketSpec } from './markets.ts';
import { easternTipoff } from './time.ts';
import type { Candidate, NbaPropRow, NflGameRow, NflPropRow, Numeric } from './types.ts';

export function num(value: Numeric | string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Chance implied by an American price such as -110 or +150, with the vig in. */
export function impliedChance(price: string | number | null | undefined): number | null {
  const p = num(price as Numeric);
  if (p === null || (p > -100 && p < 100)) return null;
  return p < 0 ? -p / (-p + 100) : 100 / (p + 100);
}

/** No-vig chance of the over, or null when either side has no price. */
export function noVigOver(over: string | number | null, under: string | number | null): number | null {
  const o = impliedChance(over);
  const u = impliedChance(under);
  if (o === null || u === null) return null;
  return o / (o + u);
}

/**
 * "Yes" means reaching the next whole number above a half-point line (26.5
 * becomes 27 or more). Whole-number lines can push, so they are skipped.
 */
export function thresholdFor(line: number): number | null {
  if (!(line > 0) || Number.isInteger(line)) return null;
  return Math.ceil(line);
}

const UNAVAILABLE = new Set(['out', 'doubtful', 'questionable', 'inactive', 'suspended']);

type Base = Omit<Candidate, 'starPower'>;

function baseFields(
  row: {
    market: string;
    line: Numeric;
    over_price: string | number | null;
    under_price: string | number | null;
    book_count: number | null;
    has_live_odds: boolean | null;
    player_name: string | null;
    last_10_avg: Numeric;
  },
  sport: 'nba' | 'nfl',
): Pick<Base, 'market' | 'line' | 'threshold' | 'yesChance' | 'bookCount' | 'playerName' | 'l10Avg'> | null {
  const spec = marketSpec(sport, row.market);
  const line = num(row.line);
  if (!spec || line === null || line < spec.minLine || !row.has_live_odds) return null;
  const threshold = thresholdFor(line);
  const yesChance = noVigOver(row.over_price, row.under_price);
  const playerName = row.player_name?.trim();
  if (threshold === null || yesChance === null || !playerName) return null;
  return {
    market: row.market,
    line,
    threshold,
    yesChance,
    bookCount: row.book_count ?? 0,
    playerName,
    l10Avg: num(row.last_10_avg),
  };
}

/** NBA rows to candidates. Drops started games, injured players and thin props. */
export function nbaCandidates(rows: NbaPropRow[], now: Date): Candidate[] {
  // Star power: the player's points line, the market every fan knows.
  const pointsLine = new Map<number, number>();
  for (const row of rows) {
    const line = num(row.line);
    if (row.market === 'player_points' && line !== null) {
      pointsLine.set(row.player_id, Math.max(line, pointsLine.get(row.player_id) ?? 0));
    }
  }

  const out: Candidate[] = [];
  for (const row of rows) {
    if (UNAVAILABLE.has((row.injury_status ?? '').toLowerCase())) continue;
    const base = baseFields(row, 'nba');
    if (!base) continue;
    const startsAt = easternTipoff(row.game_date, row.game_status);
    if (!startsAt || Date.parse(startsAt) <= now.getTime()) continue;

    const home = row.home_away === 'H';
    const team = row.team_abbr ?? '?';
    const opp = row.opponent_team_abbr ?? '?';

    // Count hits over the last 10 logs directly when we have them.
    const logs = [...(row.game_logs ?? [])]
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .slice(0, 10);
    const stats = logs.map((l) => num(l.market_stat)).filter((s): s is number => s !== null);
    let l10Games = stats.length;
    let l10Hits = stats.filter((s) => s >= base.threshold).length;
    if (l10Games === 0) {
      const pct = num(row.last_10_pct);
      l10Games = pct === null ? 0 : 10;
      l10Hits = pct === null ? 0 : Math.round(pct / 10);
    }

    out.push({
      ...base,
      sport: 'nba',
      gameId: String(row.game_id),
      gameLabel: home ? `${opp} @ ${team}` : `${team} @ ${opp}`,
      startsAt,
      playerId: String(row.player_id),
      starPower: pointsLine.get(row.player_id) ?? 0,
      l10Hits,
      l10Games,
    });
  }
  return out;
}

// Rough scale so a 250-yard passer and an 80-yard receiver rank alike.
const NFL_STAR_SCALE: Record<string, number> = {
  player_passing_yards: 1 / 3,
  player_rushing_yards: 1,
  player_receiving_yards: 1,
};

/** NFL rows to candidates, using `nfl_games` for kickoff times. */
export function nflCandidates(rows: NflPropRow[], games: NflGameRow[], now: Date): Candidate[] {
  const gameById = new Map(games.map((g) => [g.game_id, g]));

  const star = new Map<string, number>();
  for (const row of rows) {
    const scale = NFL_STAR_SCALE[row.market];
    const line = num(row.line);
    if (scale && line !== null) {
      star.set(row.player_id, Math.max(line * scale, star.get(row.player_id) ?? 0));
    }
  }

  const out: Candidate[] = [];
  for (const row of rows) {
    const game = gameById.get(row.game_id);
    if (!game?.scheduled_at || game.completed) continue;
    if ((game.status ?? 'scheduled').toLowerCase() !== 'scheduled') continue;
    if (Date.parse(game.scheduled_at) <= now.getTime()) continue;
    const base = baseFields(row, 'nfl');
    if (!base) continue;

    const pct = num(row.last_10_pct);
    const l10Games = pct === null ? 0 : (row.sample_size_l10 ?? 0);
    out.push({
      ...base,
      sport: 'nfl',
      gameId: row.game_id,
      gameLabel: `${game.away_team_abbr ?? '?'} @ ${game.home_team_abbr ?? '?'}`,
      startsAt: new Date(game.scheduled_at).toISOString(),
      playerId: row.player_id,
      starPower: star.get(row.player_id) ?? 0,
      l10Hits: pct === null ? 0 : Math.round(pct * l10Games),
      l10Games,
    });
  }
  return out;
}
