/**
 * Where a ball is on the warm-up stage, as plain functions of time. The
 * animator works out the ball first and then puts the hands on it, so hand
 * and ball always meet.
 *
 * Positions are in figure space (Y up, the figure faces +Z, its left is +X),
 * with the floor at 0.
 */

import { BALL_R } from '../sim/constants';
import { clamp01 } from '../sim/math';

/** both hands on the ball, against the belly: every ball act starts and ends here */
export const HOLD_X = 0;
export const HOLD_Y = 0.64;
export const HOLD_Z = 0.36;

/** One bounce: from a hand (1 = the figure's left, -1 = its right, 0 = both at the hold) to a hand. */
export interface Bounce {
  from: number;
  to: number;
  /** seconds from leaving the first hand to settling in the second */
  dur: number;
}

export interface DribbleStyle {
  /** height of the ball's centre where the hand meets it */
  top: number;
  /** how far out to the side the ball is bounced */
  side: number;
  /** how far in front, at the hand and at the floor */
  fwd: number;
  floorFwd: number;
  /** 0 drops the ball from rest, 1 throws it down at a steady speed */
  push: number;
  /** share of a bounce spent going down */
  down: number;
  /** the lowest the dribbling hand goes while it waits for the ball */
  handLow: number;
  /** seconds held at the start before the first bounce */
  lead: number;
}

/** A hard, low pound dribble with crossovers. */
export const POUND: DribbleStyle = { top: 0.6, side: 0.3, fwd: 0.3, floorFwd: 0.36, push: 0.45, down: 0.4, handLow: 0.58, lead: 0.3 };
/** An easy, higher dribble. */
export const EASY: DribbleStyle = { top: 0.66, side: 0.32, fwd: 0.27, floorFwd: 0.34, push: 0.25, down: 0.44, handLow: 0.62, lead: 0.35 };

/** `hand` is the lead hand (1 or -1); patterns are written for a right-hander and mirrored. */
export function poundPattern(hand: number): Bounce[] {
  const r = hand;
  const l = -hand;
  return [
    { from: 0, to: r, dur: 0.52 },
    { from: r, to: r, dur: 0.44 },
    { from: r, to: r, dur: 0.44 },
    { from: r, to: l, dur: 0.5 },
    { from: l, to: l, dur: 0.44 },
    { from: l, to: l, dur: 0.44 },
    { from: l, to: r, dur: 0.5 },
    { from: r, to: r, dur: 0.44 },
    { from: r, to: l, dur: 0.5 },
    { from: l, to: r, dur: 0.5 },
    { from: r, to: 0, dur: 0.58 },
  ];
}

export function easyPattern(hand: number): Bounce[] {
  const r = hand;
  const l = -hand;
  return [
    { from: 0, to: r, dur: 0.66 },
    { from: r, to: r, dur: 0.6 },
    { from: r, to: r, dur: 0.6 },
    { from: r, to: r, dur: 0.6 },
    { from: r, to: l, dur: 0.66 },
    { from: l, to: l, dur: 0.6 },
    { from: l, to: l, dur: 0.6 },
    { from: l, to: 0, dur: 0.7 },
  ];
}

export function patternLength(p: readonly Bounce[], style: DribbleStyle): number {
  let s = style.lead;
  for (const b of p) s += b.dur;
  return s;
}

export interface DribbleInfo {
  /** bounce index, -1 before the first, p.length after the last */
  i: number;
  from: number;
  to: number;
  /** 0 on the way down, 1 on the way up */
  leg: number;
  /** 0..1 through the leg */
  s: number;
  /** speed of the ball along Y */
  vy: number;
}

export function newDribbleInfo(): DribbleInfo {
  return { i: -1, from: 0, to: 0, leg: 0, s: 0, vy: 0 };
}

function topX(side: number, st: DribbleStyle): number {
  return side === 0 ? HOLD_X : side * st.side;
}
function topY(side: number, st: DribbleStyle): number {
  return side === 0 ? HOLD_Y : st.top;
}
function topZ(side: number, st: DribbleStyle): number {
  return side === 0 ? HOLD_Z : st.fwd;
}

/** Ball centre at time `t` (seconds from the start of the pattern, lead included) into `out`. */
export function dribbleAt(p: readonly Bounce[], st: DribbleStyle, t: number, out: Float64Array, info: DribbleInfo): void {
  let u = t - st.lead;
  info.vy = 0;
  if (u < 0 || p.length === 0) {
    out[0] = HOLD_X;
    out[1] = HOLD_Y;
    out[2] = HOLD_Z;
    info.i = -1;
    info.from = 0;
    info.to = 0;
    info.leg = 0;
    info.s = 0;
    return;
  }
  let i = 0;
  while (i < p.length && u >= p[i].dur) {
    u -= p[i].dur;
    i++;
  }
  if (i >= p.length) {
    const last = p[p.length - 1].to;
    out[0] = topX(last, st);
    out[1] = topY(last, st);
    out[2] = topZ(last, st);
    info.i = p.length;
    info.from = last;
    info.to = last;
    info.leg = 1;
    info.s = 1;
    return;
  }
  const b = p[i];
  info.i = i;
  info.from = b.from;
  info.to = b.to;
  // where it meets the floor: under the hand for a plain bounce, in the middle for a crossover
  const lean = b.from !== 0 && b.to !== 0 && b.from !== b.to ? 0 : b.from !== 0 ? b.from : b.to;
  const fx = lean * (st.side + 0.03);
  const fz = b.from !== b.to ? st.floorFwd + 0.05 : st.floorFwd;
  const d1 = b.dur * st.down;
  const d2 = b.dur - d1;
  if (u < d1) {
    const s = u / d1;
    const x0 = topX(b.from, st);
    const y0 = topY(b.from, st);
    const z0 = topZ(b.from, st);
    const h = y0 - BALL_R;
    const a = st.push;
    out[0] = x0 + (fx - x0) * s;
    out[1] = y0 - h * (a * s + (1 - a) * s * s);
    out[2] = z0 + (fz - z0) * s;
    info.leg = 0;
    info.s = s;
    info.vy = (-h * (a + 2 * (1 - a) * s)) / d1;
  } else {
    const s = (u - d1) / d2;
    const x1 = topX(b.to, st);
    const y1 = topY(b.to, st);
    const z1 = topZ(b.to, st);
    const h = y1 - BALL_R;
    const q = 1 - s;
    out[0] = fx + (x1 - fx) * s;
    out[1] = BALL_R + h * (1 - q * q);
    out[2] = fz + (z1 - fz) * s;
    info.leg = 1;
    info.s = s;
    info.vy = (2 * h * q) / d2;
  }
}

/** A smooth maximum: like Math.max, without the corner (k sets how round). */
export function softMax(a: number, b: number, k: number): number {
  const d = a - b;
  return (a + b + Math.sqrt(d * d + k * k)) * 0.5;
}

/** Height of a ball thrown straight up from `y0` at time 0 with speed `v0` under gravity `g`. */
export function flightY(y0: number, v0: number, g: number, t: number): number {
  return y0 + v0 * t - 0.5 * g * t * t;
}

/** Time a ball thrown up from `y0` at `v0` comes back down through height `y`. */
export function flightTimeDown(y0: number, v0: number, g: number, y: number): number {
  const disc = v0 * v0 - 2 * g * (y - y0);
  return (v0 + Math.sqrt(Math.max(0, disc))) / g;
}

/** A launch: the hands push the ball from `y0` to `y1` in `dur` seconds, speeding up all the way (cubic). Returns the speed it leaves at. */
export function launchSpeed(y0: number, y1: number, dur: number): number {
  return (3 * (y1 - y0)) / dur;
}

export function launchY(y0: number, y1: number, dur: number, t: number): number {
  const s = clamp01(t / dur);
  return y0 + (y1 - y0) * s * s * s;
}

/** Quadratic Bezier, one axis. */
export function bez(a: number, c: number, b: number, s: number): number {
  const q = 1 - s;
  return q * q * a + 2 * q * s * c + s * s * b;
}
