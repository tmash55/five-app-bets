/**
 * Building blocks for simulation tests: a scripted thumb on the pad, and a fingerprint of a whole game that changes
 * if any number in the match comes out differently, so a test can prove a change left a game exactly as it was.
 */

import { createMatch, stepMatch } from '@/game/sim/sim';
import type { Attrs, MatchConfig, MatchState, PadInput } from '@/game/sim/types';

function attrs(v: Partial<Attrs> = {}): Attrs {
  return { speed: 0.6, shot: 0.6, dunk: 0.6, handle: 0.6, steal: 0.5, block: 0.5, ...v };
}

/** Two evenly matched sides of `perTeam`, each with a shooter, a dunker and a ball handler. */
export function traceConfig(seed: number, over: Partial<MatchConfig> = {}, perTeam: 2 | 3 = 3): MatchConfig {
  const team = () => ({
    players: [
      { id: 'a', attrs: attrs({ shot: 0.85, dunk: 0.35 }) },
      { id: 'b', attrs: attrs({ dunk: 0.9, shot: 0.4 }) },
      { id: 'c', attrs: attrs({ speed: 0.85, handle: 0.85 }) },
    ].slice(0, perTeam),
  });
  return {
    seed,
    teams: [team(), team()],
    userTeam: 0,
    quarters: 4,
    quarterSeconds: 24,
    difficulty: 0.5,
    mateSkill: 0.55,
    timingAssist: 1.15,
    rubberBand: 0.4,
    autoSwitch: true,
    ...over,
  };
}

/**
 * A made-up player on the pad: the stick swings to a new direction every so often, with taps and holds of every
 * button. Its own little random numbers, so it never touches the match's.
 */
export class ScriptedThumb {
  private s: number;
  private hold = 0;
  readonly pad: PadInput = { mx: 0, mz: 0, turbo: false, a: false, b: false, sw: false };

  constructor(seed: number) {
    this.s = seed >>> 0 || 1;
  }

  private next(): number {
    // xorshift32
    let x = this.s;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    this.s = x;
    return x / 4294967296;
  }

  /** The pad for the next tick. */
  step(): PadInput {
    const p = this.pad;
    if (this.hold > 0) {
      this.hold--;
      if (this.hold === 0) p.a = false;
    }
    const r = this.next();
    if (r < 0.05) {
      const ang = this.next() * Math.PI * 2;
      const len = this.next() < 0.15 ? 0 : 0.4 + this.next() * 0.6;
      p.mx = Math.cos(ang) * len;
      p.mz = Math.sin(ang) * len;
    }
    if (!p.a && this.next() < 0.02) {
      p.a = true;
      // a quick tap or a held jump shot
      this.hold = this.next() < 0.4 ? 3 : 20 + Math.floor(this.next() * 30);
    }
    p.b = this.next() < 0.015 ? true : p.b && this.next() < 0.6;
    if (this.next() < 0.02) p.turbo = !p.turbo;
    p.sw = this.next() < 0.008;
    return p;
  }
}

function mix(h: number, v: number): number {
  return Math.imul(h ^ v, 16777619) >>> 0;
}

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

function mixNum(h: number, v: number): number {
  f64[0] = v;
  return mix(mix(h, u32[0]), u32[1]);
}

/** Fold every number that moves into the running fingerprint. */
export function foldState(h: number, m: MatchState): number {
  h = mix(h, m.rng >>> 0);
  h = mix(h, m.tick);
  const b = m.ball;
  for (const v of [b.x, b.y, b.z, b.vx, b.vy, b.vz]) h = mixNum(h, v);
  h = mix(h, b.holder + 7);
  for (const p of m.players) {
    for (const v of [p.x, p.z, p.y, p.vx, p.vz, p.facing, p.turbo, p.heat]) h = mixNum(h, v);
    h = mix(h, p.state.length * 31 + p.state.charCodeAt(0));
  }
  h = mix(h, m.control + 3);
  return h;
}

export interface Trace {
  ticks: number;
  score: [number, number];
  winner: number;
  hash: number;
  events: number;
  stats: number[];
}

/**
 * Play a whole game (up to `maxTicks`). `thumb` drives the person's pad every tick; left out the pad stays still.
 */
export function traceGame(cfg: MatchConfig, input?: { thumb?: ScriptedThumb }, maxTicks = 60 * 60 * 8): Trace {
  const m = createMatch(cfg);
  const still: PadInput = { mx: 0, mz: 0, turbo: false, a: false, b: false, sw: false };
  let h = 2166136261;
  let events = 0;
  while (m.phase !== 'final' && m.tick < maxTicks) {
    stepMatch(m, input?.thumb ? input.thumb.step() : still);
    events += m.events.length;
    for (const e of m.events) h = mix(h, e.type.length * 131 + e.type.charCodeAt(0) + e.type.charCodeAt(e.type.length - 1));
    h = foldState(h, m);
  }
  const stats: number[] = [];
  for (const s of m.stats) stats.push(s.points, s.fga, s.fgm, s.tpa, s.assists, s.rebounds, s.steals, s.blocks, s.dunks, s.perfects);
  return { ticks: m.tick, score: [m.score[0], m.score[1]], winner: m.winner, hash: h, events, stats };
}
