/** Builds the match for each way of playing: a quick game, the next ladder game, a stop on the tour. */

import { MAX_LEVEL, TEAMS, mustPlayer, playerOverall, teamById, teamPlayers } from '@/data/roster';
import type { TeamDef } from '@/data/types';
import type { CourtId } from '@/game/render/court';
import { TIERS, ladderOpponent, tierIndex } from './ladder';
import type { DuoRules, MatchSetup, Side, SidePlayer } from './match';
import { pick, type Rng } from './rng';
import { tourById } from './tour';

export const DIFFICULTY_NAMES = ['Rookie', 'Pro', 'All-Star'] as const;

/** computer skill, opponent card level and how hard the game leans toward a close finish, per difficulty */
const QUICK_LEVELS = [
  { difficulty: 0.22, level: 1, rubberBand: 0.6 },
  { difficulty: 0.5, level: 2, rubberBand: 0.4 },
  { difficulty: 0.82, level: 4, rubberBand: 0.2 },
] as const;

/**
 * How much stronger than your side a surprise opponent may be, per difficulty: on Rookie a surprise is about your
 * match, on Pro a step up, on All-Star anyone. A team you pick yourself is never limited.
 */
export const SURPRISE_ROOM = [4, 12, Infinity] as const;

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

/**
 * The teams a surprise may come from: those within this difficulty's room above your side's overall, or, when none
 * is, the weakest of them (all teams that tie for weakest).
 */
export function fairSurprises(teams: readonly TeamDef[], home: Side, perTeam: 2 | 3, difficulty: 0 | 1 | 2, sideOf: (t: TeamDef) => Side): TeamDef[] {
  const mine = sideOverall(home, perTeam);
  const rated = teams.map((t) => ({ t, ovr: sideOverall(withoutMirrors(sideOf(t), home), perTeam) }));
  const fair = rated.filter((r) => r.ovr <= mine + SURPRISE_ROOM[difficulty]);
  if (fair.length > 0) return fair.map((r) => r.t);
  const least = Math.min(...rated.map((r) => r.ovr));
  return rated.filter((r) => r.ovr === least).map((r) => r.t);
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
  const team = o.opponent ? teamById(o.opponent) : pick(rng, fairSurprises(clean.length > 0 ? clean : all, home, o.perTeam, o.difficulty, sideOf));
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

// ---------------------------------------------------------------------------
// Two players on one screen
// ---------------------------------------------------------------------------

/** a two-player game's computer teammates play at this level (they are each person's own players, not opponents) */
export const DUO_DIFFICULTY = 0.5;
/** how much the person with the helping hand is helped while behind */
export const DUO_CATCH_UP = 0.5;

export interface DuoOptions {
  perTeam: 2 | 3;
  /** the team the second person plays, or null for a fair match: the side whose overall is closest to P1's */
  rival: string | null;
  /** court, or null for P2's team's home court */
  court: CourtId | null;
  /** a helping hand (wider shot timing, help while behind): nobody, P1 or P2 */
  help: 0 | 1 | 2;
}

/** The card level P2's team plays at: the level of P1's players on the court, on average, so a picked team is never left behind a squad that has levelled up. */
export function duoLevel(home: Side, perTeam: number): number {
  const on = home.players.slice(0, perTeam);
  if (on.length === 0) return 1;
  return Math.max(1, Math.min(MAX_LEVEL, Math.round(on.reduce((a, p) => a + p.level, 0) / on.length)));
}

/** A team's strongest side for the second person. */
export function rivalSide(team: TeamDef, home: Side, perTeam: 2 | 3): Side {
  return withoutMirrors(teamSide(team, perTeam, 2, duoLevel(home, perTeam)), home);
}

/**
 * A fair match for P1: of every team's sides (weakest to strongest, at every card level) the ones whose overall is
 * closest to P1's squad, one picked at random.
 */
export function fairRival(home: Side, perTeam: 2 | 3, rng: Rng = Math.random): Side {
  const mine = sideOverall(home, perTeam);
  let best = Infinity;
  let options: Side[] = [];
  for (const team of playableTeams(perTeam)) {
    for (const strength of [0, 1, 2] as const) {
      for (let level = 1; level <= MAX_LEVEL; level++) {
        const side = withoutMirrors(teamSide(team, perTeam, strength, level), home);
        if (side.players.length < perTeam) continue;
        const d = Math.abs(sideOverall(side, perTeam) - mine);
        if (d < best) {
          best = d;
          options = [side];
        } else if (d === best && !options.some((o) => o.kitTeam === side.kitTeam)) {
          options.push(side);
        }
      }
    }
  }
  return pick(rng, options);
}

export function duoRules(prefs: Prefs, help: DuoOptions['help']): DuoRules {
  return {
    // P1 plays on the device's own setting; P2 on the standard window; a helping hand widens it
    teamAssist: [help === 1 || prefs.easyShots ? TIMING_EASY : TIMING_STANDARD, help === 2 ? TIMING_EASY : TIMING_STANDARD],
    // no rubber band between two people, unless one of them takes a helping hand
    catchUp: [help === 1 ? DUO_CATCH_UP : 0, help === 2 ? DUO_CATCH_UP : 0],
    help,
  };
}

/** Two people on one screen: the device's squad is P1 (home), the second person plays the team they picked. */
export function duoSetup(prefs: Prefs, o: DuoOptions, rng: Rng = Math.random): MatchSetup {
  const home: Side = { ...homeSide(prefs.squad, prefs.uniform), short: 'P1' };
  const picked = o.rival ? rivalSide(teamById(o.rival), home, o.perTeam) : fairRival(home, o.perTeam, rng);
  const away: Side = { ...picked, short: 'P2' };
  const rules = duoRules(prefs, o.help);
  return {
    mode: 'duo',
    perTeam: o.perTeam,
    home,
    away,
    court: o.court ?? teamById(away.kitTeam).court,
    difficulty: DUO_DIFFICULTY,
    quarters: QUARTERS,
    quarterSeconds: prefs.quarterSeconds,
    seed: newSeed(rng),
    timingAssist: rules.teamAssist[0],
    rubberBand: 0,
    duo: rules,
  };
}
