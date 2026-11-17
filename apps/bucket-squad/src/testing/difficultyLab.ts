/**
 * How hard is each level, really? Plays whole games of the real setups (a quick game's level, a tour stop, a ladder
 * tier) with a made-up person on the pad (see playerModel.ts) and counts what happened: who won and by how much,
 * how well the computer scored, and how often the person's defense stopped it.
 */

import { starterIds } from '@/state/logic';
import { buildMatch, type MatchSetup, type SidePlayer } from '@/meta/match';
import { seededRng } from '@/meta/rng';
import { ladderSetup, quickSetup, tourSetup, type Prefs } from '@/meta/setups';
import { TIERS } from '@/meta/ladder';
import { createMatch, stepMatch } from '@/game/sim/sim';
import { formAfter } from '@/meta/form';
import type { MatchConfig } from '@/game/sim/types';
import { PlayerModel, type PlayerSkill } from './playerModel';

/** What one game came to, from the person's side. */
export interface GameCount {
  won: boolean;
  /** the person's score less the computer's */
  margin: number;
  points: [number, number];
  /** the computer's turns with the ball, and how many of them ended in a basket */
  cpuPossessions: number;
  cpuScores: number;
  /** steals and blocks by the player in the person's hands */
  steals: number;
  blocks: number;
  /** steals and blocks by the person's whole team */
  teamSteals: number;
  teamBlocks: number;
  /** the computer lost the ball: stolen, picked off, or out of time on the shot clock */
  cpuTurnovers: number;
  /** the computer's shots, and how many it made */
  cpuShots: number;
  cpuMakes: number;
  /** the computer's rebounds of its own misses */
  cpuOffBoards: number;
  /** the person's team's turns with the ball, and the times the computer took it off them */
  possessions: number;
  turnovers: number;
}

/** Many games added up. */
export interface LabReport {
  games: number;
  winRate: number;
  margin: number;
  /** games won or lost by more than `BLOWOUT` */
  blowoutWins: number;
  blowoutLosses: number;
  /** the computer's points per turn with the ball */
  cpuPpp: number;
  /** share of the computer's turns that ended without a basket */
  stopRate: number;
  /** per game */
  steals: number;
  blocks: number;
  teamSteals: number;
  teamBlocks: number;
  cpuTurnovers: number;
  cpuFgPct: number;
  /** per game */
  cpuOffBoards: number;
  /** the person's team's points per turn with the ball, and its turnovers per game */
  ppp: number;
  turnovers: number;
  /** points per game, the person's and the computer's */
  scored: number;
  allowed: number;
}

/** a game won or lost by more than this is a blowout */
export const BLOWOUT = 15;

/** The comets' starters, every one at `level`: the squad a new career starts with, levelled up as cards come in. */
export function labSquad(level = 1, home = 'comets'): SidePlayer[] {
  return starterIds(home).map((id) => ({ id, level }));
}

export function labPrefs(level = 1, over: Partial<Prefs> = {}): Prefs {
  return { squad: labSquad(level), quarterSeconds: 60, easyShots: true, homeTeam: 'comets', ...over };
}

/** Play one game of `cfg` with `skill` on the pad of team 0. */
export function playGame(cfg: MatchConfig, skill: PlayerSkill, seed: number): GameCount {
  const m = createMatch(cfg);
  const person = new PlayerModel(skill, seed * 7919 + 13, 0);
  const c: GameCount = { won: false, margin: 0, points: [0, 0], cpuPossessions: 0, cpuScores: 0, steals: 0, blocks: 0, teamSteals: 0, teamBlocks: 0, cpuTurnovers: 0, cpuShots: 0, cpuMakes: 0, cpuOffBoards: 0, possessions: 0, turnovers: 0 };
  let had = m.possession;
  if (had === 1) c.cpuPossessions++;
  else c.possessions++;
  const cap = 60 * 60 * 30;
  while (m.phase !== 'final' && m.tick < cap) {
    stepMatch(m, person.step(m));
    for (const e of m.events) {
      if (e.type === 'inbound' && e.team === had) {
        if (had === 1) c.cpuPossessions++;
        else c.possessions++;
      } else if (e.type === 'score' && e.team === 1) c.cpuScores++;
      else if (e.type === 'rebound' && e.offensive && m.players[e.by].team === 1) c.cpuOffBoards++;
      else if (e.type === 'steal' && m.players[e.by].team === 1) c.turnovers++;
      else if (e.type === 'shotClock' && e.team === 0) c.turnovers++;
      else if (e.type === 'steal' && m.players[e.by].team === 0) {
        c.teamSteals++;
        c.cpuTurnovers++;
        if (e.by === m.control) c.steals++;
      } else if (e.type === 'block' && m.players[e.by].team === 0) {
        c.teamBlocks++;
        if (e.by === m.control) c.blocks++;
      } else if (e.type === 'shotClock' && e.team === 1) c.cpuTurnovers++;
    }
    if (m.possession !== had) {
      had = m.possession;
      if (had === 1) c.cpuPossessions++;
      else c.possessions++;
    }
  }
  for (const p of m.players) {
    if (p.team !== 1) continue;
    c.cpuMakes += m.stats[p.idx].fgm;
    c.cpuShots += m.stats[p.idx].fga;
  }
  c.points = [m.score[0], m.score[1]];
  c.margin = m.score[0] - m.score[1];
  c.won = m.score[0] > m.score[1];
  return c;
}

export function report(games: readonly GameCount[]): LabReport {
  const n = Math.max(1, games.length);
  const sum = (f: (g: GameCount) => number) => games.reduce((a, g) => a + f(g), 0);
  const poss = Math.max(1, sum((g) => g.cpuPossessions));
  const scores = sum((g) => g.cpuScores);
  return {
    games: games.length,
    winRate: sum((g) => (g.won ? 1 : 0)) / n,
    margin: sum((g) => g.margin) / n,
    blowoutWins: sum((g) => (g.margin > BLOWOUT ? 1 : 0)) / n,
    blowoutLosses: sum((g) => (g.margin < -BLOWOUT ? 1 : 0)) / n,
    cpuPpp: sum((g) => g.points[1]) / poss,
    stopRate: 1 - scores / poss,
    steals: sum((g) => g.steals) / n,
    blocks: sum((g) => g.blocks) / n,
    teamSteals: sum((g) => g.teamSteals) / n,
    teamBlocks: sum((g) => g.teamBlocks) / n,
    cpuTurnovers: sum((g) => g.cpuTurnovers) / n,
    cpuFgPct: sum((g) => g.cpuMakes) / Math.max(1, sum((g) => g.cpuShots)),
    cpuOffBoards: sum((g) => g.cpuOffBoards) / n,
    ppp: sum((g) => g.points[0]) / Math.max(1, sum((g) => g.possessions)),
    turnovers: sum((g) => g.turnovers) / n,
    scored: sum((g) => g.points[0]) / n,
    allowed: sum((g) => g.points[1]) / n,
  };
}

/** Where a game comes from: a quick game's level, a stop on the tour, a ladder tier. */
export type LabLevel =
  | { kind: 'quick'; difficulty: 0 | 1 | 2; perTeam?: 2 | 3 }
  | { kind: 'tour'; stage: number; game: number; tourId?: string }
  | { kind: 'ladder'; tier: number; perTeam?: 2 | 3 };

export function levelName(l: LabLevel): string {
  if (l.kind === 'quick') return `quick ${['Rookie', 'Pro', 'All-Star'][l.difficulty]}${l.perTeam === 3 ? ' 3v3' : ''}`;
  if (l.kind === 'tour') return `tour stop ${l.stage + 1} ${['Warm-Up', 'Rivalry', 'Showdown'][l.game] ?? l.game}`;
  return `ladder ${TIERS[l.tier].name}${l.perTeam === 3 ? ' 3v3' : ''}`;
}

/**
 * The card level the person's squad has when it gets to this game: the computer's own, so the games measure how well
 * the person plays and not how many cards they have.
 */
function setupFor(l: LabLevel, seed: number, prefs: (level: number) => Prefs): MatchSetup {
  const rng = seededRng(seed);
  if (l.kind === 'quick') {
    const level = [1, 2, 4][l.difficulty];
    return quickSetup(prefs(level), { perTeam: l.perTeam ?? 2, difficulty: l.difficulty, opponent: null, court: null }, rng);
  }
  if (l.kind === 'tour') {
    const probe = tourSetup(prefs(1), l.tourId ?? 'neighborhood', l.stage, l.game, rng);
    if (!probe) throw new Error(`no tour game ${l.stage}/${l.game}`);
    const level = probe.away.players[0].level;
    return tourSetup(prefs(level), l.tourId ?? 'neighborhood', l.stage, l.game, seededRng(seed)) as MatchSetup;
  }
  const tier = TIERS[l.tier];
  return ladderSetup(prefs(tier.level), tier.floor, l.perTeam ?? 2, rng);
}

export interface LabOptions {
  /** the person's form before the first game (meta/form); left out, even */
  form?: number;
  /** carry the form from game to game, the way the save does */
  adapt?: boolean;
  /** the squad and settings (by the squad's card level) */
  prefs?: (level: number) => Prefs;
  /** changes the setup before it is played (the adaptive nudge, a different rubber band...) */
  adjust?: (s: MatchSetup) => MatchSetup;
}

/** `games` games of one level with one kind of person, from seed `seed0` on. */
export function playLevel(l: LabLevel, skill: PlayerSkill, games: number, seed0 = 1, o: LabOptions = {}): LabReport {
  return report(playGames(l, skill, games, seed0, o).games);
}

/** The games one by one, and the form after each (with `adapt`, each game is set up with the form the one before left). */
export function playGames(l: LabLevel, skill: PlayerSkill, games: number, seed0 = 1, o: LabOptions = {}): { games: GameCount[]; form: number[]; ease: number[] } {
  const out: GameCount[] = [];
  const forms: number[] = [];
  const eases: number[] = [];
  let form = o.form ?? 0;
  const prefs = o.prefs ?? ((lv: number) => labPrefs(lv));
  for (let i = 0; i < games; i++) {
    const seed = seed0 + i * 101;
    let setup = setupFor(l, seed, (lv) => ({ ...prefs(lv), form }));
    if (o.adjust) setup = o.adjust(setup);
    eases.push(setup.ease ?? 0);
    const g = playGame(buildMatch(setup).config, skill, seed);
    out.push(g);
    if (o.adapt) form = formAfter(form, g.margin);
    forms.push(form);
  }
  return { games: out, form: forms, ease: eases };
}
