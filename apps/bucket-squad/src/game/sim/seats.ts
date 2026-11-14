/**
 * Who plays which team. A team is played by a person or by the computer. Each human team has a seat: its controlled
 * player and its pad. The first person's seat is the match state itself (`m.control`, `m.padA`, ...); a second
 * human team, in a two-player game, sits in `m.second`. With one person this is exactly the old single-user match.
 */

import type { MatchState, PlayerSim, Seat, TeamId } from './types';

/** A person plays this team. */
export function isHuman(m: MatchState, team: TeamId): boolean {
  const h = m.cfg.humans;
  return h ? h[team] : m.cfg.userTeam === team;
}

/** Any person plays in this match. */
export function anyHuman(m: MatchState): boolean {
  return isHuman(m, 0) || isHuman(m, 1);
}

/** Both teams are played by people. */
export function twoHumans(m: MatchState): boolean {
  return isHuman(m, 0) && isHuman(m, 1);
}

/** The seat of the person playing `team`, or null when the computer plays it. */
export function seatOf(m: MatchState, team: TeamId): Seat | null {
  if (!isHuman(m, team)) return null;
  return team === m.cfg.userTeam ? m : m.second;
}

/** The player a person controls on `team`, -1 when none. */
export function controlOf(m: MatchState, team: TeamId): number {
  const s = seatOf(m, team);
  return s ? s.control : -1;
}

/** This player is under a person's thumb right now. */
export function isControlled(m: MatchState, p: PlayerSim | number): boolean {
  const i = typeof p === 'number' ? p : p.idx;
  return i >= 0 && (i === m.control || i === m.second.control);
}

/** The shot timing window for a person on `team` (1 = standard). */
export function assistOf(m: MatchState, team: TeamId): number {
  const a = m.cfg.teamAssist;
  return a ? a[team] : m.cfg.timingAssist;
}

/**
 * How hard the rubber band pulls on a play by `team` when it leads by `diff` (a share of the most that counts; the
 * caller multiplies it in). Ahead, the other side's catch-up number holds it back; behind, its own helps it.
 */
export function bandOf(m: MatchState, team: TeamId, diff: number): number {
  const c = m.cfg.catchUp;
  if (!c) return m.cfg.rubberBand;
  return diff > 0 ? c[1 - team] : c[team];
}
