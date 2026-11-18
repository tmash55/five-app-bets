/** Builds the match for each way of playing: a quick game, the next ladder game, a stop on the tour. */

import { MAX_LEVEL, TEAMS, mustPlayer, playerOverall, teamById, teamPlayers } from '@/data/roster';
import type { TeamDef } from '@/data/types';
import type { CourtId } from '@/game/render/court';
import { RANDOM_COURT, resolveCourt, type CourtChoice } from './courts';
import { TIERS, ladderOpponent, tierIndex } from './ladder';
import { easeFor } from './form';
import type { DuoRules, MatchSetup, Side, SidePlayer } from './match';
import { pick, type Rng } from './rng';
import { DEFAULT_SHORT, nameText, schemeById, shortOf, type TeamName } from './teamName';
import { tourById } from './tour';

export const DIFFICULTY_NAMES = ['Rookie', 'Pro', 'All-Star'] as const;

/**
 * Per difficulty: the computer's skill (how it plays: game/sim/levels.ts), its card level, and how much the rubber
 * band helps the person while behind (it holds a person in the lead back only from Pro up: meta/match `dragFor`).
 */
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
  /** the squad's own name; null or left out for "Your Squad" */
  teamName?: TeamName | null;
  /** the squad's colour scheme (meta/teamName); null or left out for the colours it wears */
  teamColors?: string | null;
  /** the court played on last, which a random court is never */
  lastCourt?: CourtId | null;
  /** how the person has been doing against the computer lately (meta/form), which nudges the computer a little */
  form?: number;
}

/** The hidden nudge for a game against the computer at `difficulty` (meta/form), as setup fields: none when there is none. */
function eased(prefs: Prefs, difficulty: number): { ease?: number } {
  const ease = easeFor(prefs.form, difficulty);
  return ease !== 0 ? { ease } : {};
}

function newSeed(rng: Rng): number {
  return Math.floor(rng() * 2147483646) + 1;
}

/**
 * The person's side. The whole squad wears one uniform so teammates are easy to tell apart: the one picked on the
 * uniforms page, or else the captain's team's.
 */
export function homeSide(squad: readonly SidePlayer[], uniform?: string | null, teamName?: TeamName | null, teamColors?: string | null): Side {
  const captain = mustPlayer(squad[0].id);
  return {
    name: nameText(teamName ?? null),
    short: shortOf(teamName ?? null),
    kitTeam: captain.team,
    players: [...squad],
    ...(typeof uniform === 'string' && uniform !== '' ? { uniform } : {}),
    ...(schemeById(teamColors) ? { colors: teamColors as string } : {}),
  };
}

/** The person's squad as it takes the court: its players, its uniform, its name and its colours. */
export function squadSide(prefs: Prefs): Side {
  return homeSide(prefs.squad, prefs.uniform, prefs.teamName, prefs.teamColors);
}

/**
 * Playing as a team instead of the squad: the team's strongest side, in its own uniform and under its own name, at the
 * card level of the squad's players on the court, on average (as the second person's team in a two-player game).
 */
export function asTeamSide(team: TeamDef, squad: Side, perTeam: 2 | 3): Side {
  return teamSide(team, perTeam, 2, duoLevel(squad, perTeam));
}

/** The team a side is playing as, or null for the person's own squad. */
function teamPicked(id: string | null | undefined, perTeam: number): TeamDef | null {
  if (!id) return null;
  return playableTeams(perTeam).find((t) => t.id === id) ?? null;
}

/** Two sides with the same three letters: the squad goes by YOU (a team keeps its own). */
function apart(home: Side, away: Side, squad: boolean): Side {
  return squad && home.short === away.short ? { ...home, short: DEFAULT_SHORT } : home;
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
  /** court, null for the opponent's home court, or `random` */
  court: CourtChoice;
  /** play as this team (its own players, colours and name) instead of the squad; null or left out for the squad */
  team?: string | null;
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
  const squad = squadSide(prefs);
  const playAs = teamPicked(o.team, o.perTeam);
  const home = playAs ? asTeamSide(playAs, squad, o.perTeam) : squad;
  const mine = new Set(home.players.map((p) => p.id));
  const sideOf = (t: TeamDef) => teamSide(t, o.perTeam, o.difficulty, lv.level);
  // a surprise opponent is a team that can field its usual players against you, and never the team you play as
  const everyone = playableTeams(o.perTeam).filter((t) => t.id !== playAs?.id);
  const inLeague = o.league ? everyone.filter((t) => t.league === o.league) : everyone;
  const all = inLeague.length > 0 ? inLeague : everyone;
  const clean = all.filter((t) => !sideOf(t).players.some((p) => mine.has(p.id)));
  const named = o.opponent && o.opponent !== playAs?.id ? teamById(o.opponent) : null;
  const team = named ?? pick(rng, fairSurprises(clean.length > 0 ? clean : all, home, o.perTeam, o.difficulty, sideOf));
  const away = withoutMirrors(sideOf(team), home);
  const seed = newSeed(rng);
  return {
    mode: 'quick',
    perTeam: o.perTeam,
    home: apart(home, away, playAs === null),
    away,
    court: resolveCourt(o.court, team.court, seed, prefs.lastCourt),
    ...(o.court === RANDOM_COURT ? { randomCourt: true } : {}),
    difficulty: lv.difficulty,
    ...eased(prefs, lv.difficulty),
    quarters: QUARTERS,
    quarterSeconds: prefs.quarterSeconds,
    seed,
    timingAssist: prefs.easyShots ? TIMING_EASY : TIMING_STANDARD,
    rubberBand: lv.rubberBand,
  };
}

export function ladderSetup(prefs: Prefs, points: number, perTeam: 2 | 3, rng: Rng = Math.random): MatchSetup {
  const tier = TIERS[tierIndex(points)];
  const squad = squadSide(prefs);
  const away = withoutMirrors(ladderOpponent(points, perTeam, rng, mustPlayer(prefs.squad[0].id).team), squad);
  return {
    mode: 'ladder',
    perTeam,
    home: apart(squad, away, true),
    away,
    court: teamById(away.kitTeam).court,
    difficulty: tier.difficulty,
    ...eased(prefs, tier.difficulty),
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
  const squad = squadSide(prefs);
  const away = withoutMirrors({ name: st.team.name, short: st.team.short, kitTeam: st.team.id, players: g.opponents }, squad);
  return {
    mode: 'tour',
    perTeam: g.perTeam,
    home: apart(squad, away, true),
    away,
    court: st.team.court,
    difficulty: g.difficulty,
    ...eased(prefs, g.difficulty),
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
  /** court, null for P2's team's home court, or `random` */
  court: CourtChoice;
  /** a helping hand (wider shot timing, help while behind): nobody, P1 or P2 */
  help: 0 | 1 | 2;
  /** P1 plays as this team instead of the device's squad; null or left out for the squad */
  team?: string | null;
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
export function fairRival(home: Side, perTeam: 2 | 3, rng: Rng = Math.random, notTeam?: string | null): Side {
  const mine = sideOverall(home, perTeam);
  let best = Infinity;
  let options: Side[] = [];
  for (const team of playableTeams(perTeam).filter((t) => t.id !== notTeam)) {
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
  const squad = squadSide(prefs);
  const playAs = teamPicked(o.team, o.perTeam);
  const home: Side = { ...(playAs ? asTeamSide(playAs, squad, o.perTeam) : squad), short: 'P1' };
  // the two people never play the same team
  const rival = o.rival && o.rival !== playAs?.id ? o.rival : null;
  const picked = rival ? rivalSide(teamById(rival), home, o.perTeam) : fairRival(home, o.perTeam, rng, playAs?.id);
  const away: Side = { ...picked, short: 'P2' };
  const rules = duoRules(prefs, o.help);
  const seed = newSeed(rng);
  return {
    mode: 'duo',
    perTeam: o.perTeam,
    home,
    away,
    court: resolveCourt(o.court, teamById(away.kitTeam).court, seed, prefs.lastCourt),
    ...(o.court === RANDOM_COURT ? { randomCourt: true } : {}),
    difficulty: DUO_DIFFICULTY,
    quarters: QUARTERS,
    quarterSeconds: prefs.quarterSeconds,
    seed,
    timingAssist: rules.teamAssist[0],
    rubberBand: 0,
    duo: rules,
  };
}

// ---------------------------------------------------------------------------
// Two players on two devices
// ---------------------------------------------------------------------------

/** What each device brings to an online game: its own squad, the uniform it wears, and its shot window. */
export interface OnlineSquad {
  squad: readonly SidePlayer[];
  uniform: string | null;
  easyShots: boolean;
  /** the squad's wheel name, if it has one (a typed name never comes here: it stays on its device) */
  words?: readonly [string, string] | null;
  /** the squad's colour scheme */
  colors?: string | null;
  /** play as this team instead of the squad */
  team?: string | null;
}

/** the names each side goes by on both screens (never a person's own name: it would travel to the other device) */
export const ONLINE_NAMES = ['Player 1', 'Player 2'] as const;

/**
 * Two people on two devices: the host's squad is P1 (home), the guest's is P2 (away), each played by its own person
 * with their own cards and levels. The host builds this once and sends it; the guest plays exactly what it is sent.
 * The court is P1's home court; each person keeps their own shot window; no rubber band between two people.
 */
export function onlineSetup(host: OnlineSquad, guest: OnlineSquad, perTeam: 2 | 3, quarterSeconds: number, rng: Rng = Math.random, court: CourtChoice = null, lastCourt?: CourtId | null): MatchSetup {
  if (host.squad.length < perTeam || guest.squad.length < perTeam) throw new Error('a squad is short of players');
  const hostTeam = teamPicked(host.team, perTeam);
  // both people picked the same team: the guest plays its own squad
  const guestTeam = teamPicked(guest.team, perTeam)?.id === hostTeam?.id ? null : teamPicked(guest.team, perTeam);
  const side = (s: OnlineSquad, i: 0 | 1, team: TeamDef | null): Side => {
    const players = s.squad.slice(0, 3).map((p) => ({ id: mustPlayer(p.id).id, level: Math.max(1, Math.min(MAX_LEVEL, Math.round(p.level))) }));
    const kitTeam = mustPlayer(players[0].id).team;
    const own: Side = { name: ONLINE_NAMES[i], short: i === 0 ? 'P1' : 'P2', kitTeam, players };
    if (team) return { ...asTeamSide(team, own, perTeam), short: own.short };
    // the away side always plays in its own colours against the home side's (see buildMatch), so only P1's uniform counts
    const uniform = i === 0 && typeof s.uniform === 'string' && s.uniform !== '' ? { uniform: s.uniform } : {};
    const words = s.words && s.words.length === 2 ? { name: nameText({ words: [s.words[0], s.words[1]] }) } : {};
    const colors = schemeById(s.colors) ? { colors: s.colors as string } : {};
    return { ...own, ...uniform, ...words, ...colors };
  };
  let home = side(host, 0, hostTeam);
  let away = side(guest, 1, guestTeam);
  // a team played by one person never shares a player with the other person's side
  if (hostTeam) home = withoutMirrors(home, away);
  if (guestTeam) away = withoutMirrors(away, home);
  const assist = (s: OnlineSquad) => (s.easyShots ? TIMING_EASY : TIMING_STANDARD);
  const rules: DuoRules = { teamAssist: [assist(host), assist(guest)], catchUp: [0, 0], help: 0 };
  const seed = newSeed(rng);
  return {
    mode: 'online',
    perTeam,
    home,
    away,
    court: resolveCourt(court, teamById(home.kitTeam).court, seed, lastCourt),
    ...(court === RANDOM_COURT ? { randomCourt: true } : {}),
    difficulty: DUO_DIFFICULTY,
    quarters: QUARTERS,
    quarterSeconds,
    seed,
    timingAssist: rules.teamAssist[0],
    rubberBand: 0,
    duo: rules,
  };
}
