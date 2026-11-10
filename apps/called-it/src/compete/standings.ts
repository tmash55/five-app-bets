/** A row on a leaderboard or a league table, as `leaderboard` and `league_table` return it (UNJ-1424). */
export type StandingRow = {
  rank: number;
  user_id: string;
  display_name: string;
  points: number;
  correct: number;
  graded: number;
  is_me: boolean;
  is_owner?: boolean;
};

export type LeaderboardScope = 'global' | 'friends';
export type LeaderboardPeriod = 'week' | 'all';

/** A league on the Leagues tab, with the player's place in it. */
export type LeagueSummary = {
  id: string;
  name: string;
  invite_code: string;
  season_start: string;
  member_count: number;
  is_owner: boolean;
  my_rank: number | null;
  my_points: number | null;
};

export type LeaguePreview = { id: string; name: string; member_count: number; is_member: boolean };

/** Null max means no limit (Pro, or a limit switched off in league_settings). */
export type LeagueAllowance = {
  is_pro: boolean;
  owned: number;
  max_owned: number | null;
  joined: number;
  max_joined: number | null;
};

/** Postgres bigint and numeric come back as strings from PostgREST. */
export function toStandingRow(row: Record<string, unknown>): StandingRow {
  return {
    rank: Number(row.rank),
    user_id: String(row.user_id),
    display_name: String(row.display_name),
    points: Number(row.points),
    correct: Number(row.correct),
    graded: Number(row.graded),
    is_me: Boolean(row.is_me),
    ...(row.is_owner === undefined ? {} : { is_owner: Boolean(row.is_owner) }),
  };
}

/** "7-3" style record: correct and missed picks. Void picks count for neither. */
export function recordLabel(correct: number, graded: number): string {
  return `${correct}-${Math.max(graded - correct, 0)}`;
}

/** Whole-number percentage, or null with nothing graded. */
export function accuracy(correct: number, graded: number): number | null {
  return graded > 0 ? Math.round((correct / graded) * 100) : null;
}

/** "1st", "2nd", "3rd", "11th", "22nd". Ties share a rank, so "T-2nd" when shared. */
export function ordinal(n: number): string {
  const mod100 = n % 100;
  const suffix = mod100 >= 11 && mod100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  return `${n}${suffix}`;
}

export function rankLabel(row: StandingRow, rows: StandingRow[]): string {
  const tied = rows.some((r) => r.rank === row.rank && r.user_id !== row.user_id);
  return tied ? `T-${ordinal(row.rank)}` : ordinal(row.rank);
}

/** Can the player create another league right now? */
export function canCreateLeague(a: LeagueAllowance): boolean {
  return (a.max_owned === null || a.owned < a.max_owned) && (a.max_joined === null || a.joined < a.max_joined);
}

/** The line under "Create a league": what the free limit is, or that Pro has none. */
export function allowanceLine(a: LeagueAllowance): string {
  if (a.is_pro) return 'Pro: create as many leagues as you like.';
  if (a.max_owned === null) return 'Create as many leagues as you like.';
  const plural = a.max_owned === 1 ? 'league' : 'leagues';
  return `Free players can create ${a.max_owned} ${plural}. Pro removes the limit.`;
}

/** The text shared with an invite link. */
export function inviteMessage(leagueName: string, url: string): string {
  return `Join my Called It league "${leagueName}" and see who calls tonight's games best: ${url}`;
}

/** "Season since Nov 10" for a league's season start (a calendar date, so formatted in UTC). */
export function seasonLabel(seasonStart: string): string {
  const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${seasonStart}T12:00:00Z`),
  );
  return `Season since ${day}`;
}

/** Invite codes as the database stores them: upper case letters and digits only. */
export function normalizeInviteCode(input: string): string {
  return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function looksLikeInviteCode(input: string): boolean {
  return /^[A-HJKMNP-Z2-9]{8}$/.test(normalizeInviteCode(input));
}
