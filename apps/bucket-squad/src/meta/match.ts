/**
 * Turns "these players against those players on that court" into everything
 * the simulation and the renderer need, and boils a finished match down to a
 * summary the rest of the game can use.
 */

import { boosted, kitAgainst, levelBonus, lookInKit, mustPlayer, teamById } from '@/data/roster';
import type { PlayerDef } from '@/data/types';
import { teamWear, uniformById, wearOf, type Wear } from '@/data/uniforms';
import type { KitColors, Look } from '@/game/kit/look';
import type { CourtId } from '@/game/render/court';
import type { MatchVisuals } from '@/game/render/renderer';
import { shotLevelFor } from '@/game/sim/core';
import { toAttrs } from '@/game/sim/ratings';
import type { MatchConfig, MatchState, PlayerStats } from '@/game/sim/types';
import { hexToRgb } from '@/game/kit/look';
import { DEFAULT_SHORT, isWheelName, schemeById, shortOf } from './teamName';

/**
 * `duo`: two people on one screen, the device's squad (P1, home) against a team the second person picks (P2).
 * `online`: two people on two devices, the host's squad (P1, home) against the guest's (P2).
 */
export type Mode = 'quick' | 'tour' | 'ladder' | 'duo' | 'online';

/** What a two-player game sets per person, home (P1) first. */
export interface DuoRules {
  /** each person's shot timing window */
  teamAssist: [number, number];
  /** each person's help while behind (a handicap); [0, 0] keeps the game straight */
  catchUp: [number, number];
  /** who gets a helping hand: nobody, P1 or P2 */
  help: 0 | 1 | 2;
}

export interface SidePlayer {
  id: string;
  level: number;
}

export interface Side {
  /** shown on the scoreboard and the results screen */
  name: string;
  short: string;
  /** the team whose uniform this side wears, unless `uniform` says otherwise */
  kitTeam: string;
  /** a uniform the squad picked (see data/uniforms); left out, or one this build does not have, it wears `kitTeam`'s */
  uniform?: string;
  /** the colour scheme the squad picked for its badge and its name (meta/teamName `COLOR_SCHEMES`); left out, the colours it wears */
  colors?: string;
  players: SidePlayer[];
}

export interface MatchSetup {
  mode: Mode;
  perTeam: 2 | 3;
  /** the person's side: always team 0, attacking the right-hand hoop */
  home: Side;
  away: Side;
  court: CourtId;
  /** the court was picked at random (the versus card says so) */
  randomCourt?: boolean;
  /** 0..1 */
  difficulty: number;
  quarters: number;
  quarterSeconds: number;
  seed: number;
  /** wider shot timing windows for younger players */
  timingAssist: number;
  /** how much the rubber band helps the person while behind (see `bandFor`; a person in the lead is held back less, or not at all, on the easy levels) */
  rubberBand: number;
  /**
   * The hidden nudge from how the person has been doing lately (state/form.ts), worked out before the game: added to
   * the computer's skill for this one game, never more than a little. Left out, none. The level the game is shown
   * and rewarded at, and its long-shot rules, stay `difficulty`'s.
   */
  ease?: number;
  tour?: { tourId: string; stage: number; game: number };
  /** watch two computer teams play (attract mode) */
  spectate?: boolean;
  /** your squad plays itself with the full HUD on, for trailers and screenshots */
  demo?: boolean;
  /** two people: the away side is played by the second person, on this screen (mode `duo`) or another device (`online`) */
  duo?: DuoRules;
}

/** Rating points a squad gains when its players are real teammates. */
export function chemistry(playerIds: readonly string[]): number {
  const count = new Map<string, number>();
  for (const id of playerIds) {
    const team = mustPlayer(id).team;
    count.set(team, (count.get(team) ?? 0) + 1);
  }
  const best = Math.max(0, ...count.values());
  return best >= 3 ? 3 : best === 2 ? 1 : 0;
}

function gap(a: string, b: string): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
}

/** What a side wears: the uniform it picked when this build has it, otherwise its kit team's own. */
export function sideWear(side: Side): Wear {
  const picked = uniformById(side.uniform);
  return picked ? wearOf(picked) : teamWear(teamById(side.kitTeam));
}

/** A side's own colours, for its badge, its name and its half of the versus card: the scheme it picked, or else what it wears. */
export function sideColors(side: Side): { color: string; color2: string } {
  const scheme = schemeById(side.colors);
  if (scheme) return scheme;
  const wear = sideWear(side);
  return { color: wear.color, color2: wear.color2 };
}

/** The three letters on a side's badge: its own when it has three (the scoreboard's), a team's when it plays as one, or else ones from its name. */
export function badgeLetters(side: Side): string {
  if (side.short.length === 3) return side.short;
  const team = teamById(side.kitTeam);
  if (team.name === side.name) return team.short;
  return /^Player \d$/.test(side.name) ? DEFAULT_SHORT : shortOf(isWheelName(side.name) ? { words: side.name.split(' ') as [string, string] } : { typed: side.name });
}

/** How a player looks on the person's side: the uniform's colours, with their own touches when it is their own team's uniform. */
export function homeLook(def: PlayerDef, wear: Wear): Look {
  return lookInKit(def, { ...wear.kit, ...(def.team === wear.team ? (def.look.kit ?? {}) : {}) });
}

export interface BuiltMatch {
  config: MatchConfig;
  visuals: MatchVisuals;
  /** main colour of each side for the HUD */
  colors: [string, string];
  /** players in simulation order */
  lineup: { def: PlayerDef; level: number; team: 0 | 1 }[];
}

/** a person's own computer teammates never play worse than this, whatever the level (see `buildMatch`) */
export const MATES_FLOOR = 0.62;

/**
 * How much the rubber band holds back a person who leads the computer, as a share of its help to one who trails:
 * none up to Rookie, so a child in the lead is never dragged back, rising to all of it from All-Star.
 */
export function dragFor(difficulty: number): number {
  return Math.max(0, Math.min(1, (difficulty - 0.22) / (0.82 - 0.22)));
}

export function buildMatch(setup: MatchSetup): BuiltMatch {
  const home = sideWear(setup.home);
  const awayTeam = teamById(setup.away.kitTeam);
  const kits: [KitColors, KitColors] = [home.kit, kitAgainst(home, awayTeam)];
  const sides = [setup.home, setup.away] as const;
  const n = setup.perTeam;
  const lineup: BuiltMatch['lineup'] = [];
  const teams = sides.map((side, t) => {
    const picked = side.players.slice(0, n);
    const chem = chemistry(picked.map((p) => p.id));
    return {
      players: picked.map((sp) => {
        const def = mustPlayer(sp.id);
        lineup.push({ def, level: sp.level, team: t as 0 | 1 });
        return { id: def.id, attrs: toAttrs(boosted(def.ratings, levelBonus(sp.level) + chem)) };
      }),
    };
  }) as MatchConfig['teams'];

  const looks = lineup.map((l) => (l.team === 0 ? homeLook(l.def, home) : lookInKit(l.def, kits[1])));

  // HUD and floor-ring colours: each side's jersey colour reads best, with the team (or uniform) colour as a fallback
  const colorOf = (main: string, kit: KitColors) => (gap(kit.jersey, '#FFFFFF') < 0.25 ? main : kit.jersey);
  let colors: [string, string] = [colorOf(home.color, kits[0]), colorOf(awayTeam.color, kits[1])];
  if (gap(colors[0], colors[1]) < 0.35) colors = [colors[0], gap(colors[0], awayTeam.color2) > 0.35 ? awayTeam.color2 : '#FFFFFF'];

  const config: MatchConfig = {
    seed: setup.seed,
    teams,
    userTeam: setup.spectate ? -1 : 0,
    ...(setup.duo && !setup.spectate ? { humans: [true, true] as [boolean, boolean], teamAssist: setup.duo.teamAssist, catchUp: setup.duo.catchUp } : {}),
    // against the computer the rubber band helps the person while behind, and holds them back in the lead only from Pro up
    ...(!setup.duo && !setup.spectate && !setup.demo ? { leadDrag: setup.rubberBand * dragFor(setup.difficulty) } : {}),
    quarters: setup.quarters,
    quarterSeconds: setup.quarterSeconds,
    // the hidden nudge moves the computer's play a little for this game only (see `ease`)
    difficulty: setup.ease && !setup.duo ? Math.max(0, Math.min(1, setup.difficulty + setup.ease)) : setup.difficulty,
    // long shots: two people (one screen or two devices) pick no level and play by Pro's rules; anyone else by the computer's level
    shotLevel: setup.duo ? 1 : shotLevelFor(setup.difficulty),
    mateSkill: Math.max(setup.duo ? 0.55 : MATES_FLOOR, setup.difficulty),
    timingAssist: setup.timingAssist,
    rubberBand: setup.rubberBand,
    autoSwitch: true,
    demo: setup.demo === true,
  };
  return { config, visuals: { court: setup.court, looks, teamColors: colors }, colors, lineup };
}

// ---------------------------------------------------------------------------
// After the final buzzer
// ---------------------------------------------------------------------------

export interface PlayerLine extends PlayerStats {
  id: string;
  team: 0 | 1;
}

export interface TeamTotals {
  points: number;
  dunks: number;
  threes: number;
  steals: number;
  blocks: number;
  perfects: number;
  assists: number;
  rebounds: number;
}

export interface MatchSummary {
  mode: Mode;
  perTeam: 2 | 3;
  won: boolean;
  /** the person's score first */
  score: [number, number];
  overtime: boolean;
  totals: [TeamTotals, TeamTotals];
  players: PlayerLine[];
  /** player id of the game's best performer */
  mvp: string;
  buzzerBeater: boolean;
  difficulty: number;
  names: [string, string];
  tour?: MatchSetup['tour'];
  /** set when the person played the away side (an online game's guest): the summary is turned round for them */
  seat?: 1;
}

function impact(s: PlayerStats): number {
  return s.points + s.rebounds * 0.7 + s.assists * 0.9 + s.steals * 1.5 + s.blocks * 1.5 + s.dunks * 0.5 + s.perfects * 0.3;
}

export function summarize(m: MatchState, setup: MatchSetup, buzzerBeater: boolean): MatchSummary {
  const totals: [TeamTotals, TeamTotals] = [
    { points: 0, dunks: 0, threes: 0, steals: 0, blocks: 0, perfects: 0, assists: 0, rebounds: 0 },
    { points: 0, dunks: 0, threes: 0, steals: 0, blocks: 0, perfects: 0, assists: 0, rebounds: 0 },
  ];
  const players: PlayerLine[] = [];
  let mvp = m.players[0].id;
  let best = -1;
  const winner = m.score[0] >= m.score[1] ? 0 : 1;
  for (const p of m.players) {
    const s = m.stats[p.idx];
    const t = totals[p.team];
    t.points += s.points;
    t.dunks += s.dunks;
    t.threes += s.tpm;
    t.steals += s.steals;
    t.blocks += s.blocks;
    t.perfects += s.perfects;
    t.assists += s.assists;
    t.rebounds += s.rebounds;
    players.push({ ...s, id: p.id, team: p.team });
    const v = impact(s) + (p.team === winner ? 0.01 : 0);
    if (p.team === winner && v > best) {
      best = v;
      mvp = p.id;
    }
  }
  return {
    mode: setup.mode,
    perTeam: setup.perTeam,
    won: m.score[0] > m.score[1],
    score: [m.score[0], m.score[1]],
    overtime: m.overtime,
    totals,
    players,
    mvp,
    buzzerBeater,
    difficulty: setup.difficulty,
    names: [setup.home.name, setup.away.name],
    tour: setup.tour,
  };
}

/**
 * The summary as the person playing `team` sees it: their side first. An online game's guest plays the away side,
 * and everything after the match (the headline, the coins) reads the person's side as the first.
 */
export function seenBy(s: MatchSummary, team: 0 | 1): MatchSummary {
  if (team === 0) return s;
  return {
    ...s,
    won: s.score[1] > s.score[0],
    score: [s.score[1], s.score[0]],
    totals: [s.totals[1], s.totals[0]],
    players: s.players.map((p) => ({ ...p, team: p.team === 0 ? 1 : 0 })),
    names: [s.names[1], s.names[0]],
    seat: 1,
  };
}
