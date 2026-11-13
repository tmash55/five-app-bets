/** Builds the match for each way of playing: a quick game, the next ladder game, a stop on the tour. */

import { TEAMS, mustPlayer, playerOverall, teamById, teamPlayers } from '@/data/roster';
import type { TeamDef } from '@/data/types';
import type { CourtId } from '@/game/render/court';
import { TIERS, ladderOpponent, tierIndex } from './ladder';
import type { MatchSetup, Side, SidePlayer } from './match';
import { pick, type Rng } from './rng';
import { tourById } from './tour';

export const DIFFICULTY_NAMES = ['Rookie', 'Pro', 'All-Star'] as const;

/** computer skill, opponent card level and how hard the game leans toward a close finish, per difficulty */
const QUICK_LEVELS = [
  { difficulty: 0.22, level: 1, rubberBand: 0.6 },
  { difficulty: 0.5, level: 2, rubberBand: 0.4 },
  { difficulty: 0.82, level: 4, rubberBand: 0.2 },
] as const;

export const QUARTERS = 4;

/** how much wider the "perfect" release window is than the simulation's own */
const TIMING_EASY = 1.7;
const TIMING_STANDARD = 1.15;

export interface Prefs {
  /** the person's three players, captain first, with their levels */
  squad: SidePlayer[];
  quarterSeconds: number;
  easyShots: boolean;
  /** decides where the home court comes on a tour */
  homeTeam?: string | null;
  /** the uniform the squad wears (data/uniforms); null or left out for the captain's team's */
  uniform?: string | null;
}

function newSeed(rng: Rng): number {
  return Math.floor(rng() * 2147483646) + 1;
}

/**
 * The person's side. The whole squad wears one uniform so teammates are easy to tell apart: the one picked on the
 * uniforms page, or else the captain's team's.
 */
export function homeSide(squad: readonly SidePlayer[], uniform?: string | null): Side {
  const captain = mustPlayer(squad[0].id);
  return { name: 'Your Squad', short: 'YOU', kitTeam: captain.team, players: [...squad], ...(typeof uniform === 'string' && uniform !== '' ? { uniform } : {}) };
}

export function sideOverall(side: Side, perTeam: number): number {
  const players = side.players.slice(0, perTeam);
  if (players.length === 0) return 0;
  return Math.round(players.reduce((a, p) => a + playerOverall(mustPlayer(p.id), p.level), 0) / players.length);
}

/** A computer side from one team: its weaker players on Rookie, its best on All-Star. */
export function teamSide(team: TeamDef, perTeam: 2 | 3, strength: 0 | 1 | 2, level: number): Side {
  const sorted = teamPlayers(team.id).sort((a, b) => playerOverall(a) - playerOverall(b));
  const span = Math.max(0, sorted.length - perTeam);
  const start = Math.round((span * strength) / 2);
  const players = sorted.slice(start, start + perTeam).reverse();
  return { name: team.name, short: team.short, kitTeam: team.id, players: players.map((p) => ({ id: p.id, level })) };
}

/**
 * You never face your own squad: anyone on both sides is swapped for the
 * teammate closest in skill, so every figure on the court is one of a kind.
 */
export function withoutMirrors(away: Side, home: Side): Side {
  const mine = new Set(home.players.map((p) => p.id));
  const used = new Set(away.players.map((p) => p.id));
  if (!away.players.some((p) => mine.has(p.id))) return away;
  const players = away.players.map((sp) => {
    if (!mine.has(sp.id)) return sp;
    const def = mustPlayer(sp.id);
    const want = playerOverall(def);
    const options = teamPlayers(def.team)
      .filter((p) => !mine.has(p.id) && !used.has(p.id))
      .sort((a, b) => Math.abs(playerOverall(a) - want) - Math.abs(playerOverall(b) - want));
    if (options.length === 0) return sp;
    used.add(options[0].id);
    return { id: options[0].id, level: sp.level };
  });
  return { ...away, players };
}

/** Teams deep enough to field a side. */
export function playableTeams(perTeam: number): TeamDef[] {
  return TEAMS.filter((t) => teamPlayers(t.id).length >= perTeam);
}

export interface QuickOptions {
  perTeam: 2 | 3;
  difficulty: 0 | 1 | 2;
  /** team id, or null for a surprise */
  opponent: string | null;
  /** a surprise opponent comes from this league (any league when left out) */
  league?: string | null;
  /** court, or null for the opponent's home court */
  court: CourtId | null;
}

export function quickSetup(prefs: Prefs, o: QuickOptions, rng: Rng = Math.random): MatchSetup {
  const lv = QUICK_LEVELS[o.difficulty];
  const home = homeSide(prefs.squad, prefs.uniform);
  const mine = new Set(home.players.map((p) => p.id));
  const sideOf = (t: TeamDef) => teamSide(t, o.perTeam, o.difficulty, lv.level);
  // a surprise opponent is a team that can field its usual players against you
  const everyone = playableTeams(o.perTeam);
  const inLeague = o.league ? everyone.filter((t) => t.league === o.league) : everyone;
  const all = inLeague.length > 0 ? inLeague : everyone;
  const clean = all.filter((t) => !sideOf(t).players.some((p) => mine.has(p.id)));
  const team = o.opponent ? teamById(o.opponent) : pick(rng, clean.length > 0 ? clean : all);
  return {
    mode: 'quick',
    perTeam: o.perTeam,
    home,
    away: withoutMirrors(sideOf(team), home),
    court: o.court ?? team.court,
    difficulty: lv.difficulty,
    quarters: QUARTERS,
    quarterSeconds: prefs.quarterSeconds,
    seed: newSeed(rng),
    timingAssist: prefs.easyShots ? TIMING_EASY : TIMING_STANDARD,
    rubberBand: lv.rubberBand,
  };
}

export function ladderSetup(prefs: Prefs, points: number, perTeam: 2 | 3, rng: Rng = Math.random): MatchSetup {
  const tier = TIERS[tierIndex(points)];
  const home = homeSide(prefs.squad, prefs.uniform);
  const away = withoutMirrors(ladderOpponent(points, perTeam, rng, mustPlayer(prefs.squad[0].id).team), home);
  return {
    mode: 'ladder',
    perTeam,
    home,
    away,
    court: teamById(away.kitTeam).court,
    difficulty: tier.difficulty,
    quarters: QUARTERS,
    quarterSeconds: prefs.quarterSeconds,
    seed: newSeed(rng),
    timingAssist: prefs.easyShots ? TIMING_EASY : TIMING_STANDARD,
    rubberBand: 0.25,
  };
}

export function tourSetup(prefs: Prefs, tourId: string, stage: number, game: number, rng: Rng = Math.random): MatchSetup | null {
  const tour = tourById(tourId, prefs.homeTeam ?? null);
  const st = tour.stages[stage];
  const g = st?.games[game];
  if (!st || !g) return null;
  const home = homeSide(prefs.squad, prefs.uniform);
  return {
    mode: 'tour',
    perTeam: g.perTeam,
    home,
    away: withoutMirrors({ name: st.team.name, short: st.team.short, kitTeam: st.team.id, players: g.opponents }, home),
    court: st.team.court,
    difficulty: g.difficulty,
    quarters: QUARTERS,
    quarterSeconds: prefs.quarterSeconds,
    seed: newSeed(rng),
    timingAssist: prefs.easyShots ? TIMING_EASY : TIMING_STANDARD,
    rubberBand: 0.4,
    tour: { tourId: tour.id, stage, game },
  };
}
