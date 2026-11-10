import type { SupabaseClient } from '@supabase/supabase-js';

import {
  toStandingRow,
  type LeaderboardPeriod,
  type LeaderboardScope,
  type LeagueAllowance,
  type LeaguePreview,
  type LeagueSummary,
  type StandingRow,
} from './standings';

/** SQLSTATE the league functions raise when a free player is at their limit (see the leagues migration). */
export const LEAGUE_LIMIT_CODE = 'CI424';
/** SQLSTATE for an invite code that matches no league. */
export const NOT_FOUND_CODE = 'P0002';

export class LeagueLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LeagueLimitError';
  }
}

export class InviteNotFoundError extends Error {
  constructor(message = 'That invite link is not valid any more.') {
    super(message);
    this.name = 'InviteNotFoundError';
  }
}

type PgError = { code?: string; message: string };

function toError(error: PgError): Error {
  if (error.code === LEAGUE_LIMIT_CODE) return new LeagueLimitError(error.message);
  if (error.code === NOT_FOUND_CODE) return new InviteNotFoundError(error.message);
  return new Error(error.message);
}

async function call<T>(client: SupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw toError(error);
  return data as T;
}

export async function fetchLeaderboard(
  client: SupabaseClient,
  scope: LeaderboardScope,
  period: LeaderboardPeriod,
  today: string,
): Promise<StandingRow[]> {
  const rows = await call<Record<string, unknown>[]>(client, 'leaderboard', {
    p_scope: scope,
    p_period: period,
    p_today: today,
    p_limit: 100,
  });
  return (rows ?? []).map(toStandingRow);
}

export async function fetchMyLeagues(client: SupabaseClient, today: string): Promise<LeagueSummary[]> {
  const rows = await call<Record<string, unknown>[]>(client, 'my_leagues', { p_today: today });
  return (rows ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    invite_code: String(r.invite_code),
    season_start: String(r.season_start),
    member_count: Number(r.member_count),
    is_owner: Boolean(r.is_owner),
    my_rank: r.my_rank === null || r.my_rank === undefined ? null : Number(r.my_rank),
    my_points: r.my_points === null || r.my_points === undefined ? null : Number(r.my_points),
  }));
}

export async function fetchAllowance(client: SupabaseClient): Promise<LeagueAllowance> {
  const rows = await call<LeagueAllowance[]>(client, 'my_league_allowance');
  const row = rows?.[0];
  if (!row) throw new Error('Could not read your league allowance.');
  return row;
}

export async function createLeague(client: SupabaseClient, name: string): Promise<{ id: string; invite_code: string }> {
  const rows = await call<{ id: string; invite_code: string }[]>(client, 'create_league', { p_name: name });
  const row = rows?.[0];
  if (!row) throw new Error('The league was not created.');
  return row;
}

export async function previewLeague(client: SupabaseClient, code: string): Promise<LeaguePreview> {
  const rows = await call<LeaguePreview[]>(client, 'league_preview', { p_code: code });
  const row = rows?.[0];
  if (!row) throw new InviteNotFoundError();
  return row;
}

/** Joins by invite code and returns the league id. Joining twice is fine. */
export function joinLeague(client: SupabaseClient, code: string): Promise<string> {
  return call<string>(client, 'join_league', { p_code: code });
}

export async function leaveLeague(client: SupabaseClient, leagueId: string): Promise<void> {
  await call<null>(client, 'leave_league', { p_league_id: leagueId });
}

export function renameLeague(client: SupabaseClient, leagueId: string, name: string): Promise<string> {
  return call<string>(client, 'rename_league', { p_league_id: leagueId, p_name: name });
}

export type LeagueDetail = { league: LeagueSummary | null; table: StandingRow[] };

/** A league's season table, plus its name and invite code from the player's league list. */
export async function fetchLeague(client: SupabaseClient, leagueId: string, today: string): Promise<LeagueDetail> {
  const [rows, leagues] = await Promise.all([
    call<Record<string, unknown>[]>(client, 'league_table', { p_league_id: leagueId, p_today: today }),
    fetchMyLeagues(client, today),
  ]);
  return { league: leagues.find((l) => l.id === leagueId) ?? null, table: (rows ?? []).map(toStandingRow) };
}

/** The player's own display name, or null when they have not set one. */
export async function fetchDisplayName(client: SupabaseClient): Promise<string | null> {
  const { data, error } = await client.from('profiles').select('display_name').maybeSingle<{ display_name: string }>();
  if (error) throw toError(error);
  return data?.display_name ?? null;
}

export function setDisplayName(client: SupabaseClient, name: string): Promise<string> {
  return call<string>(client, 'set_display_name', { p_name: name });
}
