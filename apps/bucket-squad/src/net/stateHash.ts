/**
 * A fingerprint of the match as it stands: the random numbers, the clocks, the score, the ball and every player,
 * to the last bit. Two devices stepping the same match with the same frames get the same number; if they ever
 * differ, the games have drifted apart.
 */

import type { MatchState } from '@/game/sim/types';

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

function mix(h: number, v: number): number {
  return Math.imul(h ^ v, 16777619) >>> 0;
}

function num(h: number, v: number): number {
  f64[0] = v;
  return mix(mix(h, u32[0]), u32[1]);
}

function text(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) h = mix(h, s.charCodeAt(i));
  return mix(h, s.length);
}

export function stateHash(m: MatchState): number {
  let h = 2166136261;
  h = mix(h, m.rng >>> 0);
  h = mix(h, m.tick);
  h = text(h, m.phase);
  for (const v of [m.phaseT, m.clock, m.shotClock, m.score[0], m.score[1], m.hype[0], m.hype[1], m.hypeT[0], m.hypeT[1], m.quarter]) h = num(h, v);
  h = mix(h, m.possession + 5);
  const b = m.ball;
  for (const v of [b.x, b.y, b.z, b.vx, b.vy, b.vz]) h = num(h, v);
  h = mix(h, b.holder + 7);
  h = text(h, b.state);
  for (const p of m.players) {
    for (const v of [p.x, p.z, p.y, p.vx, p.vz, p.vy, p.facing, p.turbo, p.heat, p.fireT]) h = num(h, v);
    h = text(h, p.state);
  }
  h = mix(h, m.control + 3);
  h = mix(h, m.second.control + 11);
  return h | 0;
}
