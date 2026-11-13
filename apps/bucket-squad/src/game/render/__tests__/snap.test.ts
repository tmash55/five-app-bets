/**
 * Snaps in a drawn match: a part of a figure, the ball or the camera changing speed all at once from one drawn frame to the next.
 *
 * Computer-only matches are played the way the app plays them: the runner's fixed 60 Hz ticks under a display clock, and per drawn
 * frame the same `MatchMotion` the renderer uses (positions between ticks, the poses, the drawn ball, slow motion and the camera).
 * Each frame records every figure's hips, head, hands and feet in the world and its yaw, the drawn ball and the camera. The snap of
 * a point at a frame is how much its velocity changed since the frame before (m/s; rad/s for the yaw). A motion that is smooth has
 * small snaps that shrink as the frames get shorter; a jump in speed is as big at 120 Hz as at 60.
 *
 * Each snap is put down to what happened in the frames round it: a change of state, an event, a turn or nothing in particular.
 * `SNAP_REPORT=<file> npx jest snap` writes the biggest ones for every clock, `SNAP_ARGS=seeds:seconds` picks the matches.
 */

import fs from 'fs';

import { KIT_BONE_INDEX } from '../../kit/kit';
import { DT } from '../../sim/constants';
import { createMatch, stepMatch } from '../../sim/sim';
import type { Attrs, MatchConfig, PadInput } from '../../sim/types';
import type { FigureBuild } from '../figure';
import { MatchMotion } from '../motion';

const BONES = 64 * 16;
const B_ROOT = KIT_BONE_INDEX.root * 16;
const B_HEAD = KIT_BONE_INDEX.head * 16;

function attrs(v: Partial<Attrs> = {}): Attrs {
  return { speed: 0.6, shot: 0.6, dunk: 0.6, handle: 0.6, steal: 0.5, block: 0.5, ...v };
}

/** The clip audit's match: two made-up teams, a shooter, a dunker and a ball handler a side, all played by the computer. */
function testMatch(seed: number): MatchConfig {
  const team = () => ({
    players: [
      { id: 'a', attrs: attrs({ shot: 0.85, dunk: 0.35 }) },
      { id: 'b', attrs: attrs({ dunk: 0.9, shot: 0.4 }) },
      { id: 'c', attrs: attrs({ speed: 0.85, handle: 0.85 }) },
    ],
  });
  return { seed, teams: [team(), team()], userTeam: -1, quarters: 4, quarterSeconds: 60, difficulty: 0.6, mateSkill: 0.6, timingAssist: 1, rubberBand: 0, autoSwitch: true };
}

/** the clip audit's two ends of the roster: short and broad, tall and slim */
const LOCK: FigureBuild[] = [
  { height: 0.92, bulk: 1.22, head: 1 },
  { height: 1.08, bulk: 1, head: 1 },
];

/** display clocks: milliseconds between frames, repeating */
export const CLOCKS: Record<string, number[]> = {
  '60 Hz': [1000 / 60],
  '16/33 ms': [16, 33],
  '120 Hz': [1000 / 120],
};

/** the points followed on every figure */
export const PARTS = ['hips', 'head', 'handL', 'handR', 'footL', 'footR'] as const;
type Part = (typeof PARTS)[number] | 'yaw' | 'ball' | 'camera' | 'aim';

export interface Snap {
  /** velocity change, m/s (rad/s for the yaw) */
  dv: number;
  part: Part;
  /** player index, -1 for the ball and the camera */
  who: number;
  time: number;
  state: string;
  cause: string;
}

export interface SnapRun {
  snaps: Snap[];
  /** every snap of each kind, for percentiles */
  all: Map<string, number[]>;
  frames: number;
}

/** what kind of thing a part is, for the limits */
export function kindOf(part: Part): string {
  if (part === 'handL' || part === 'handR') return 'hands';
  if (part === 'footL' || part === 'footR') return 'feet';
  return part;
}

const W = new Float64Array(3);
/** seconds after a cut to the next play that are not measured: the wipe still covers the court */
const CUT_S = 0.1;

/** Plays `seconds` of match `seed` under the display clock `clock` and returns every snap. */
export function snapRun(seed: number, seconds: number, clock: number[], aspect = 2): SnapRun {
  const m = createMatch(testMatch(seed));
  const n = m.players.length;
  const builds = m.players.map((_, i) => LOCK[i % LOCK.length]);
  const mo = new MatchMotion(builds);
  const bones = m.players.map(() => new Float32Array(BONES));
  const pad: PadInput = { mx: 0, mz: 0, turbo: false, a: false, b: false, sw: false };
  // series: per player 6 points and the yaw, then the ball, the camera's eye and its aim
  const nS = n * 7 + 3;
  const pos = new Float64Array(nS * 3);
  const vel = new Float64Array(nS * 3);
  const have = new Uint8Array(nS);
  const haveV = new Uint8Array(nS);
  const snaps: Snap[] = [];
  const all = new Map<string, number[]>();
  // what happened per player (and to the ball and camera at the end) over this frame's ticks and the last frame's
  const causeNow: string[][] = Array.from({ length: n + 1 }, () => []);
  // the causes of the last two frames: a snap at a frame shows in the velocities of the two frames before it
  let causeLast: string[][] = Array.from({ length: n + 1 }, () => []);
  let causeLast2: string[][] = Array.from({ length: n + 1 }, () => []);
  const prevState = m.players.map((p) => p.state as string);
  const prevHand = m.players.map((p) => Math.sign(p.hand));
  const prevReleased = m.players.map((p) => p.released);
  const prevHas = m.players.map((p) => p.hasBall);
  let prevBallState: string = m.ball.state;
  let prevDunker = false;
  let prevPhase: string = m.phase;
  let cut = 0;
  let acc = 0;
  let k = 0;
  let frames = 0;
  const tick = () => {
    mo.beforeStep(m);
    stepMatch(m, pad);
    mo.afterStep(m);
    for (const e of m.events) {
      const ev = e as { type: string; by?: number; victim?: number; from?: number; on?: number; to?: number };
      if (e.type === 'inbound' || (e.type === 'period' && e.start)) cut = CUT_S;
      for (const who of [ev.by, ev.victim, ev.from, e.type === 'block' ? ev.on : undefined]) {
        if (who !== undefined && who >= 0 && who < n && e.type !== 'dribble' && e.type !== 'tick') causeNow[who].push(e.type === 'block' && who === ev.on ? 'blocked' : e.type);
      }
      if (e.type === 'score' || e.type === 'rim' || e.type === 'block' || e.type === 'steal' || e.type === 'catch' || e.type === 'pass' || e.type === 'rebound' || e.type === 'shot') causeNow[n].push(e.type);
    }
    for (const p of m.players) {
      const i = p.idx;
      if (p.state !== prevState[i]) causeNow[i].push(`${prevState[i]}>${p.state}`);
      if (p.released !== prevReleased[i] && p.released) causeNow[i].push('release');
      if (p.hasBall !== prevHas[i]) causeNow[i].push(p.hasBall ? 'gets ball' : 'loses ball');
      const hs = Math.sign(p.hand);
      if (p.hasBall && hs !== prevHand[i] && hs !== 0) causeNow[i].push('hand switch');
      prevState[i] = p.state;
      prevReleased[i] = p.released;
      prevHas[i] = p.hasBall;
      if (hs !== 0) prevHand[i] = hs;
    }
    if (m.ball.state !== prevBallState) causeNow[n].push(`ball ${prevBallState}>${m.ball.state}`);
    prevBallState = m.ball.state;
    const dunker = m.players.some((p) => p.state === 'dunk' || p.state === 'oop' || p.state === 'hang');
    if (dunker !== prevDunker) causeNow[n].push(dunker ? 'dunk starts' : 'dunk ends');
    prevDunker = dunker;
    if (m.phase !== prevPhase) causeNow[n].push(`phase ${prevPhase}>${m.phase}`);
    prevPhase = m.phase;
  };
  const note = (s: number, x: number, y: number, z: number, dt: number, part: Part, who: number, state: string, causes: string, live: boolean) => {
    const o = s * 3;
    if (have[s] && dt > 0) {
      const vx = (x - pos[o]) / dt;
      const vy = (y - pos[o + 1]) / dt;
      const vz = (z - pos[o + 2]) / dt;
      if (haveV[s] && live) {
        const dv = Math.hypot(vx - vel[o], vy - vel[o + 1], vz - vel[o + 2]);
        const kind = kindOf(part);
        let list = all.get(kind);
        if (!list) all.set(kind, (list = []));
        list.push(dv);
        if (dv > 0.5) snaps.push({ dv, part, who, time: m.time, state, cause: causes });
      }
      vel[o] = vx;
      vel[o + 1] = vy;
      vel[o + 2] = vz;
      haveV[s] = live ? 1 : 0;
    }
    pos[o] = x;
    pos[o + 1] = y;
    pos[o + 2] = z;
    have[s] = 1;
  };
  const yawLast = new Float64Array(n);
  while (m.time < seconds && m.phase !== 'final') {
    const dt = clock[k++ % clock.length] / 1000;
    acc += dt * mo.timeScale;
    let steps = 0;
    while (acc >= DT && steps < 6) {
      tick();
      acc -= DT;
      steps++;
    }
    if (acc >= DT) acc = 0;
    mo.frame(m, acc / DT, dt, aspect, bones);
    frames++;
    // a cut (everyone moved for the next play, behind the wipe) is not a snap
    const live = cut <= 0;
    cut -= dt;
    for (const p of m.players) {
      const i = p.idx;
      const an = mo.anims[i];
      const bn = bones[i];
      const causes = [...new Set([...causeLast2[i], ...causeLast[i], ...causeNow[i]])].join(' ');
      const state = `${p.state}${p.hasBall ? '+ball' : ''}`;
      for (let q = 0; q < 6; q++) {
        if (q === 0) an.toWorld(bn[B_ROOT + 12], bn[B_ROOT + 13], bn[B_ROOT + 14], W);
        else if (q === 1) an.toWorld(bn[B_HEAD + 12] + 0.32 * bn[B_HEAD + 4], bn[B_HEAD + 13] + 0.32 * bn[B_HEAD + 5], bn[B_HEAD + 14] + 0.32 * bn[B_HEAD + 6], W);
        else if (q < 4) an.toWorld(an.hands[(q - 2) * 7], an.hands[(q - 2) * 7 + 1], an.hands[(q - 2) * 7 + 2], W);
        else an.toWorld(an.ankles[(q - 4) * 3], an.ankles[(q - 4) * 3 + 1], an.ankles[(q - 4) * 3 + 2], W);
        note(i * 7 + q, W[0], W[1], W[2], dt, PARTS[q], i, state, causes, live);
      }
      // the yaw, unwound
      let y = an.yaw;
      if (have[i * 7 + 6]) {
        let d = y - yawLast[i];
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        y = pos[(i * 7 + 6) * 3] + d;
      }
      yawLast[i] = an.yaw;
      note(i * 7 + 6, y, 0, 0, dt, 'yaw', i, state, causes, live);
    }
    const bc = [...new Set([...causeLast2[n], ...causeLast[n], ...causeNow[n]])].join(' ');
    const holder = m.ball.state === 'held' ? m.ball.holder : -1;
    const bcause = holder >= 0 ? `${bc} held by p${holder} (${m.players[holder].state})`.trim() : bc;
    note(n * 7, mo.drawn.x, mo.drawn.y, mo.drawn.z, dt, 'ball', -1, m.ball.state, bcause, live);
    const ce = mo.cam.calmEye;
    note(n * 7 + 1, ce[0], ce[1], ce[2], dt, 'camera', -1, m.phase, bc, live);
    const ct = mo.cam.target;
    note(n * 7 + 2, ct[0] - (mo.cam.eye[0] - ce[0]) * 0.5, ct[1] - (mo.cam.eye[1] - ce[1]) * 0.5, ct[2], dt, 'aim', -1, m.phase, bc, live);
    causeLast2 = causeLast;
    causeLast = causeNow.map((c) => c.slice());
    for (const c of causeNow) c.length = 0;
  }
  return { snaps, all, frames };
}

export function pct(v: number[], q: number): number {
  if (!v.length) return 0;
  const s = v.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
}

/** The biggest snaps, one per figure part (hands and feet together) per third of a second. */
export function topSnaps(snaps: Snap[], count: number): Snap[] {
  const out: Snap[] = [];
  for (const s of snaps.slice().sort((a, b) => b.dv - a.dv)) {
    const k = kindOf(s.part);
    if (out.some((o) => o.who === s.who && kindOf(o.part) === k && Math.abs(o.time - s.time) < 0.33)) continue;
    out.push(s);
    if (out.length >= count) break;
  }
  return out;
}

function fmt(s: Snap): string {
  const who = s.who >= 0 ? `p${s.who}` : '--';
  return `${s.dv.toFixed(2).padStart(6)} ${s.part === 'yaw' ? 'rad/s' : 'm/s  '} ${s.part.padEnd(6)} ${who} @${s.time.toFixed(2)}s ${s.state.padEnd(16)} ${s.cause || '(no event: motion)'}`;
}

const KINDS = ['hips', 'head', 'hands', 'feet', 'yaw', 'ball', 'camera', 'aim'];

export function snapReport(seeds: number[], seconds: number): string {
  const out: string[] = [];
  for (const [name, clock] of Object.entries(CLOCKS)) {
    const snaps: Snap[] = [];
    const all = new Map<string, number[]>();
    let frames = 0;
    for (const seed of seeds) {
      const r = snapRun(seed, seconds, clock);
      frames += r.frames;
      for (const s of r.snaps) snaps.push({ ...s, state: `${s.state} s${seed}` });
      for (const [k, v] of r.all) {
        const list = all.get(k) ?? [];
        for (const x of v) list.push(x);
        all.set(k, list);
      }
    }
    out.push(`== ${name}: seeds ${seeds.join(',')}, ${seconds}s each, ${frames} frames`);
    out.push(`   per kind: p99 / p99.9 / worst`);
    for (const k of KINDS) {
      const v = all.get(k) ?? [];
      out.push(`   ${k.padEnd(7)} ${pct(v, 0.99).toFixed(2)} / ${pct(v, 0.999).toFixed(2)} / ${v.reduce((a, b) => Math.max(a, b), 0).toFixed(2)}`);
    }
    out.push('   top 20:');
    for (const s of topSnaps(snaps, 20)) out.push('   ' + fmt(s));
    // what causes the most snaps over 3 m/s
    const by = new Map<string, number>();
    for (const s of snaps) {
      if (s.part === 'yaw' ? s.dv < 8 : s.dv < 3) continue;
      const c = `${kindOf(s.part)}: ${s.cause ? s.cause.split(' ').filter((w) => !/^p\d/.test(w) && w !== 'held' && w !== 'by').slice(0, 3).join(' ') : `motion in ${s.state.split(' ')[0]}`}`;
      by.set(c, (by.get(c) ?? 0) + 1);
    }
    out.push('   most frequent causes of snaps over 3 m/s (8 rad/s for the yaw):');
    for (const [c, k] of [...by].sort((a, b) => b[1] - a[1]).slice(0, 15)) out.push(`   ${String(k).padStart(5)}  ${c}`);
    out.push('');
  }
  return out.join('\n');
}

describe('snap audit', () => {
  const report = process.env.SNAP_REPORT;
  if (report) {
    it('writes the report', () => {
      const [seeds, secs] = (process.env.SNAP_ARGS || '7,12,5,9,21:45').split(':');
      fs.writeFileSync(report, snapReport(seeds.split(',').map(Number), Number(secs)) + '\n');
    }, 900000);
  } else {
    it('runs', () => {
      const r = snapRun(7, 5, CLOCKS['60 Hz']);
      expect(r.frames).toBeGreaterThan(200);
    });
  }
});
