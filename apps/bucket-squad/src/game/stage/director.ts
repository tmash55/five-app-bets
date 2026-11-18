/**
 * The warm-up stage's choreographer: which act each figure is in at any
 * moment. Pure and deterministic, so a frame can be worked out from
 * (seed, actor, role, time) alone, the same on every device and in tests.
 *
 * Every figure lands on the base first, then plays its role's acts in a
 * shuffled order, round after round, never the same act twice in a row.
 * Roles have different act lengths, so the three never move in step.
 */

export type StageRole = 'captain' | 'stretcher' | 'handler';

export type StageAct =
  /** dropping onto the base when the screen opens */
  | 'enter'
  /** a tap: a hop and a wave or a flex toward the camera */
  | 'hey'
  // captain, with a ball
  | 'spin'
  | 'pound'
  | 'toss'
  | 'hip'
  // stretcher, no ball
  | 'armCross'
  | 'reach'
  | 'toeTouch'
  | 'quad'
  | 'twist'
  | 'hops'
  // handler, with a ball
  | 'dribble'
  | 'overhead'
  | 'shootUp';

/** seconds each act lasts; every ball act starts and ends with the ball held in both hands at the belly */
export const ACT_LENGTH: Readonly<Record<StageAct, number>> = {
  enter: 1.15,
  hey: 1.6,
  spin: 6.6,
  pound: 5.9,
  toss: 3.4,
  hip: 3.4,
  armCross: 6.4,
  reach: 5.6,
  toeTouch: 4.6,
  quad: 6.6,
  twist: 4.4,
  hops: 2.6,
  dribble: 5.8,
  overhead: 4.8,
  shootUp: 3.6,
};

export const ROLE_ACTS: Readonly<Record<StageRole, readonly StageAct[]>> = {
  captain: ['spin', 'pound', 'toss', 'hip'],
  stretcher: ['armCross', 'reach', 'toeTouch', 'quad', 'twist', 'hops'],
  handler: ['dribble', 'overhead', 'shootUp', 'hip'],
};

/** the act each role opens with, so the first seconds on screen show its signature move */
const OPENER: Readonly<Record<StageRole, StageAct>> = {
  captain: 'spin',
  stretcher: 'armCross',
  handler: 'dribble',
};

export const ROLE_HAS_BALL: Readonly<Record<StageRole, boolean>> = {
  captain: true,
  stretcher: false,
  handler: true,
};

/** how far apart the figures land at the start */
export const ENTER_STAGGER = 0.2;

/** Roles for a group, in stage order: the captain first, then the two others. */
export function rolesFor(count: number): StageRole[] {
  const order: StageRole[] = ['captain', 'stretcher', 'handler'];
  const out: StageRole[] = [];
  for (let i = 0; i < count; i++) out.push(order[i % order.length]);
  return out;
}

export interface ActSlot {
  act: StageAct;
  /** seconds into the act */
  t: number;
  /** length of the act */
  dur: number;
  /** stage time the act started */
  start: number;
  /** 0 for the entrance, then 1, 2, 3 ... */
  index: number;
}

export function newActSlot(): ActSlot {
  return { act: 'enter', t: 0, dur: ACT_LENGTH.enter, start: 0, index: 0 };
}

function roundLength(role: StageRole): number {
  let s = 0;
  for (const a of ROLE_ACTS[role]) s += ACT_LENGTH[a];
  return s;
}

const ROUND_LEN: Readonly<Record<StageRole, number>> = {
  captain: roundLength('captain'),
  stretcher: roundLength('stretcher'),
  handler: roundLength('handler'),
};

/** length of the entrance for one actor: its own landing waits for the ones before it */
export function enterLength(actor: number): number {
  return ACT_LENGTH.enter + actor * ENTER_STAGGER;
}

function hash(a: number, b: number, c: number): number {
  let h = (Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b + 0x632be5ab, 0x85ebca6b) ^ Math.imul(c + 0x1b873593, 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

const MAX_ACTS = 8;
const permA = new Int8Array(MAX_ACTS);
const permB = new Int8Array(MAX_ACTS);

/** The order of a role's acts in one round (written into `out`). No act follows itself across rounds. */
function roundOrder(seed: number, actor: number, role: StageRole, round: number, out: Int8Array, depth = 0): void {
  const n = ROLE_ACTS[role].length;
  for (let i = 0; i < n; i++) out[i] = i;
  let s = hash(seed, actor * 131 + 7, round);
  for (let i = n - 1; i > 0; i--) {
    s = Math.imul(s ^ (s >>> 13), 0x5bd1e995) >>> 0;
    s = (s + 0x6d2b79f5) >>> 0;
    const j = s % (i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  const acts = ROLE_ACTS[role];
  if (round === 0) {
    // the opener goes first
    const k = acts.indexOf(OPENER[role]);
    for (let i = 0; i < n; i++) {
      if (out[i] === k) {
        out[i] = out[0];
        out[0] = k;
        break;
      }
    }
    return;
  }
  if (depth > 0 || n < 2) return;
  // never the same act twice in a row across the seam between rounds
  const prev = out === permA ? permB : permA;
  roundOrder(seed, actor, role, round - 1, prev, 1);
  if (out[0] === prev[n - 1]) {
    const tmp = out[0];
    out[0] = out[1];
    out[1] = tmp;
  }
}

/**
 * Which act `actor` (playing `role`) is in at stage time `time`, written into `out`.
 * Time before 0 counts as the start of the entrance.
 */
export function actAt(seed: number, actor: number, role: StageRole, time: number, out: ActSlot = newActSlot()): ActSlot {
  const enter = enterLength(actor);
  if (time < enter) {
    out.act = 'enter';
    out.t = Math.max(0, time);
    out.dur = enter;
    out.start = 0;
    out.index = 0;
    return out;
  }
  const acts = ROLE_ACTS[role];
  const n = acts.length;
  const len = ROUND_LEN[role];
  const since = time - enter;
  const round = Math.floor(since / len);
  let t = since - round * len;
  roundOrder(seed, actor, role, round, permA);
  let start = enter + round * len;
  for (let i = 0; i < n; i++) {
    const act = acts[permA[i]];
    const d = ACT_LENGTH[act];
    if (t < d || i === n - 1) {
      out.act = act;
      out.t = Math.min(t, d);
      out.dur = d;
      out.start = start;
      out.index = 1 + round * n + i;
      return out;
    }
    t -= d;
    start += d;
  }
  return out;
}

/** Stage time at which the act after the one running at `time` begins. */
export function nextActStart(seed: number, actor: number, role: StageRole, time: number): number {
  const slot = actAt(seed, actor, role, time);
  return slot.start + slot.dur;
}
