/**
 * Turns "these players against those players on that court" into everything
 * the simulation and the renderer need, and boils a finished match down to a
 * summary the rest of the game can use.
 */

import { awayKit, boosted, kitsClash, levelBonus, lookInKit, mustPlayer, teamById } from '@/data/roster';
import type { PlayerDef, TeamDef } from '@/data/types';
import type { KitColors } from '@/game/kit/look';
import type { CourtId } from '@/game/render/court';
import type { MatchVisuals } from '@/game/render/renderer';
import { toAttrs } from '@/game/sim/ratings';
import type { MatchConfig, MatchState, PlayerStats } from '@/game/sim/types';
import { hexToRgb } from '@/game/kit/look';

export type Mode = 'quick' | 'tour' | 'ladder';

export interface SidePlayer {
  id: string;
  level: number;
}

export interface Side {
  /** shown on the scoreboard and the results screen */
  name: string;
  short: string;
  /** the team whose uniform this side wears */
  kitTeam: string;
  players: SidePlayer[];
}

export interface MatchSetup {
  mode: Mode;
  perTeam: 2 | 3;
  /** the person's side: always team 0, attacking the right-hand hoop */
  home: Side;
  away: Side;
  court: CourtId;
  /** 0..1 */
  difficulty: number;
  quarters: number;
  quarterSeconds: number;
  seed: number;
  /** wider shot timing windows for younger players */
  timingAssist: number;
  rubberBand: number;
  tour?: { tourId: string; stage: number; game: number };
  /** watch two computer teams play (attract mode) */
  spectate?: boolean;
  /** your squad plays itself with the full HUD on, for trailers and screenshots */
  demo?: boolean;
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

export interface BuiltMatch {
  config: MatchConfig;
  visuals: MatchVisuals;
  /** main colour of each side for the HUD */
  colors: [string, string];
  /** players in simulation order */
  lineup: { def: PlayerDef; level: number; team: 0 | 1 }[];
}

export function buildMatch(setup: MatchSetup): BuiltMatch {
  const homeTeam = teamById(setup.home.kitTeam);
  const awayTeam = teamById(setup.away.kitTeam);
  const clash = homeTeam.id === awayTeam.id || kitsClash(homeTeam, awayTeam);
  const kits: [KitColors, KitColors] = [homeTeam.kit, clash ? awayKit(awayTeam.kit) : awayTeam.kit];
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

  const looks = lineup.map((l) => lookInKit(l.def, l.team === 0 ? { ...kits[0], ...(l.def.team === homeTeam.id ? (l.def.look.kit ?? {}) : {}) } : kits[1]));

  // HUD and floor-ring colours: each side's jersey colour reads best, with the team colour as a fallback
  const colorOf = (team: TeamDef, kit: KitColors) => (gap(kit.jersey, '#FFFFFF') < 0.25 ? team.color : kit.jersey);
  let colors: [string, string] = [colorOf(homeTeam, kits[0]), colorOf(awayTeam, kits[1])];
  if (gap(colors[0], colors[1]) < 0.35) colors = [colors[0], gap(colors[0], awayTeam.color2) > 0.35 ? awayTeam.color2 : '#FFFFFF'];

  const config: MatchConfig = {
    seed: setup.seed,
    teams,
    userTeam: setup.spectate ? -1 : 0,
    quarters: setup.quarters,
    quarterSeconds: setup.quarterSeconds,
    difficulty: setup.difficulty,
    mateSkill: Math.max(0.55, setup.difficulty),
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
