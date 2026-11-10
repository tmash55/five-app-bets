import type { NflGameRow } from '../slate/types.ts';
import type { GameData, GameState, NbaBoxScoreRow, NbaGameRow, NflGameLogRow, PlayerLine } from './types.ts';

const CALLED_OFF = /postpon|\bppd\b|cancel|suspend|forfeit/i;

/** Game ids are compared as numbers for the NBA ("0022600123" and 22600123 are the same game). */
export function nbaGameKey(id: string | number): string {
  const n = Number(id);
  return Number.isFinite(n) ? String(n) : String(id);
}

export function nbaGameState(row: NbaGameRow | undefined): GameState {
  if (!row) return { kind: 'not_final' };
  const text = row.game_status_text ?? '';
  if (CALLED_OFF.test(text)) return { kind: 'called_off', reason: `Game ${text.trim().toLowerCase()}` };
  if (row.game_status === 3 || /^final/i.test(text.trim())) return { kind: 'final' };
  return { kind: 'not_final' };
}

export function nflGameState(row: NflGameRow | undefined): GameState {
  if (!row) return { kind: 'not_final' };
  const status = (row.status ?? '').trim();
  if (CALLED_OFF.test(status)) return { kind: 'called_off', reason: `Game ${status.toLowerCase()}` };
  if (row.completed || /^(final|closed|complete)/i.test(status)) return { kind: 'final' };
  return { kind: 'not_final' };
}

/** NBA: a player with no box score row, or one with no minutes, did not play. */
export function nbaPlayerLine(row: NbaBoxScoreRow): PlayerLine {
  const minutes = Number(row.minutes ?? 0);
  return Number.isFinite(minutes) && minutes > 0 ? { kind: 'played', stats: row } : { kind: 'inactive' };
}

/** NFL: the game log says whether the player played. */
export function nflPlayerLine(row: NflGameLogRow): PlayerLine {
  if (row.played === false) return { kind: 'inactive' };
  return { kind: 'played', stats: row as Record<string, number | string | null> };
}

/** Builds one GameData per NBA game id (keyed with nbaGameKey). */
export function nbaGames(games: NbaGameRow[], boxScores: NbaBoxScoreRow[]): Map<string, GameData> {
  const out = new Map<string, GameData>();
  const ensure = (key: string) => {
    let g = out.get(key);
    if (!g) {
      g = { state: { kind: 'not_final' }, statsLoaded: false, players: new Map() };
      out.set(key, g);
    }
    return g;
  };
  for (const row of games) ensure(nbaGameKey(row.game_id)).state = nbaGameState(row);
  for (const row of boxScores) {
    const g = ensure(nbaGameKey(row.game_id));
    g.statsLoaded = true;
    g.players.set(String(row.player_id), nbaPlayerLine(row));
  }
  return out;
}

/** Builds one GameData per NFL game id. */
export function nflGames(games: NflGameRow[], logs: NflGameLogRow[]): Map<string, GameData> {
  const out = new Map<string, GameData>();
  const ensure = (key: string) => {
    let g = out.get(key);
    if (!g) {
      g = { state: { kind: 'not_final' }, statsLoaded: false, players: new Map() };
      out.set(key, g);
    }
    return g;
  };
  for (const row of games) ensure(row.game_id).state = nflGameState(row);
  for (const row of logs) {
    const g = ensure(row.game_id);
    g.statsLoaded = true;
    g.players.set(String(row.player_id), nflPlayerLine(row));
  }
  return out;
}
