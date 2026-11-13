/**
 * Everything that moves in a drawn match frame, without any GL: where each figure is drawn between simulation ticks,
 * its pose, where the ball is drawn, the slow motion and the camera. The renderer draws what this works out, and the
 * snap audit (render/__tests__/snap.test.ts) drives the very same code headlessly, frame by frame.
 */

import { COURT, DT } from '../sim/constants';
import { attackSign, heldBallPos, hoopXOf } from '../sim/core';
import { clamp, clamp01, lerp } from '../sim/math';
import type { MatchState, PlayerSim } from '../sim/types';
import { DrawnBall, FigureAnimator, type AnimFrame, type Mood } from './animator';
import type { FigureBuild } from './figure';

export const CAM_FOV = 22;
const PITCH = (15 * Math.PI) / 180;
/** a change of a player's speed across the floor bigger than this in one tick (m/s) is carried by the drawn figure, which catches up at this rate (1/s) */
const SLIDE_DV = 3;
const SLIDE_W = 14;
/** a move bigger than this in one tick (m) is a cut to a new spot, not a move */
const CUT = 2;
const VIEW_H = 7.4;
const MIN_VIEW_W = 13.6;

/** The mood the match gives a player: what the figure does between plays. */
export function matchMood(m: MatchState, p: PlayerSim): Mood {
  switch (m.phase) {
    case 'final':
      return m.winner === p.team ? 'win' : 'lose';
    case 'scored': {
      const s = m.lastScoreBy;
      if (s < 0) return 'play';
      if (p.idx === s) return 'celebrate';
      return m.players[s].team === p.team ? 'cheer' : 'sad';
    }
    case 'periodEnd':
      return m.score[p.team] > m.score[1 - p.team] ? 'cheer' : m.score[p.team] < m.score[1 - p.team] ? 'sad' : 'ready';
    case 'countdown':
    case 'inbound':
      return 'ready';
    default:
      return 'play';
  }
}

/**
 * One step of a critically damped spring toward `target` (natural frequency `w`), worked out exactly so that the result does not
 * depend on how the time is cut into frames; the new position and velocity go into `out`.
 */
export function springTo(x: number, v: number, target: number, w: number, dt: number, out: Float64Array): void {
  const y = x - target;
  const j = v + w * y;
  const e = Math.exp(-w * dt);
  out[0] = target + (y + j * dt) * e;
  out[1] = (v - w * j * dt) * e;
}

const sp = new Float64Array(2);

/** The follow camera: off the side line, level with the play, closing in on dunks. */
export class MatchCamera {
  /** where the camera is and what it looks at, shake included */
  readonly eye = new Float64Array(3);
  readonly target = new Float64Array(3);
  /** the same without the shake (what the audit measures: the shake is meant to jolt) */
  readonly calmEye = new Float64Array(3);
  shake = 0;
  private fx = 0;
  private fxV = 0;
  private fy = 1;
  private fyV = 0;
  private fz = 0;
  private fzV = 0;
  private zoom = 1.5;
  private zoomV = 0;
  private intro = 1;

  update(m: MatchState, bx: number, by: number, bz: number, dt: number, aspect: number, time: number): void {
    const ball = m.ball;
    const s = attackSign(m.possession);
    let dunker: PlayerSim | null = null;
    for (const p of m.players) {
      if (p.state === 'dunk' || p.state === 'oop' || p.state === 'hang') dunker = p;
    }
    let tx = bx + s * 1.5;
    let ty = 1.0 + clamp((by - 3.4) * 0.28, 0, 1.3);
    let tz = bz * 0.06;
    let tZoom = 1 + clamp((by - 4.2) * 0.03, 0, 0.1);
    if (ball.state === 'shot') tx = lerp(bx, hoopXOf(ball.shotTeam), 0.55);
    if (m.phase === 'countdown' || m.phase === 'inbound') tx = bx + s * 2.6;
    if (dunker) {
      tx = hoopXOf(dunker.team) - attackSign(dunker.team) * 1.4;
      ty = 1.55;
      tZoom = 0.84;
    }
    if (m.phase === 'final' && m.winner >= 0) {
      let cx = 0;
      let cz = 0;
      let n = 0;
      for (const p of m.players) {
        if (p.team === m.winner) {
          cx += p.x;
          cz += p.z;
          n++;
        }
      }
      tx = cx / n;
      tz = (cz / n) * 0.3;
      tZoom = 0.86;
    }
    const viewH = Math.max(VIEW_H, MIN_VIEW_W / aspect);
    const limit = Math.max(0, COURT.halfL + 2.1 - (viewH * this.zoom * aspect) / 2);
    tx = clamp(tx, -limit, limit);
    // critically damped follow on every axis and the zoom, so a new target (a shot, a dunk, the next play) never jerks the view
    springTo(this.fx, this.fxV, tx, 4.4, dt, sp);
    this.fx = sp[0];
    this.fxV = sp[1];
    springTo(this.fy, this.fyV, ty, 6, dt, sp);
    this.fy = sp[0];
    this.fyV = sp[1];
    springTo(this.fz, this.fzV, tz, 5, dt, sp);
    this.fz = sp[0];
    this.fzV = sp[1];
    this.intro = Math.max(0, this.intro - dt / 2.6);
    const io = this.intro * this.intro * (3 - 2 * this.intro);
    springTo(this.zoom, this.zoomV, tZoom + 0.5 * io, dunker ? 8 : 5, dt, sp);
    this.zoom = sp[0];
    this.zoomV = sp[1];
    const dist = (viewH * this.zoom) / 2 / Math.tan((CAM_FOV * Math.PI) / 360);
    const pitch = PITCH + 0.2 * io;
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * this.shake;
    const sxo = Math.sin(time * 71) * sh * 0.5;
    const syo = Math.cos(time * 83) * sh * 0.5;
    const ce = this.calmEye;
    ce[0] = this.fx * 0.94;
    ce[1] = this.fy + dist * Math.sin(pitch);
    ce[2] = this.fz + dist * Math.cos(pitch);
    this.eye[0] = ce[0] + sxo;
    this.eye[1] = ce[1] + syo;
    this.eye[2] = ce[2];
    this.target[0] = this.fx + sxo * 0.5;
    this.target[1] = this.fy + syo * 0.5;
    this.target[2] = this.fz;
  }
}

/**
 * The moving parts of a drawn match. The owner calls `beforeStep` and `afterStep` round every simulation tick and
 * `frame` once per drawn frame; the figures' bones, the drawn ball, the camera and the drawn positions are then ready.
 */
export class MatchMotion {
  readonly anims: FigureAnimator[];
  readonly drawn = new DrawnBall();
  readonly cam = new MatchCamera();
  /** per player: where it is drawn this frame (between ticks) and which way it faces */
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  readonly facing: Float32Array;
  /** the simulation's ball between ticks (before the holder's push) */
  readonly ballLerp = new Float64Array(3);
  /** how fast the match should run right now (slow motion on big moments) */
  timeScale = 1;
  /** animation seconds this frame (the frame's time, slowed) */
  animDt = 0;
  time = 0;
  /** a fixed camera (photos, replays): the figures look at it instead of the follow camera */
  lookEye: readonly number[] | null = null;
  private slowT = 0;
  private synced = false;
  private readonly prev: Float32Array;
  /** per player: how far the drawn figure is off the simulation's across the floor (x, z), how fast that changes, and the simulation's last speed */
  private readonly slide: Float64Array;
  private readonly slideV: Float64Array;
  private readonly simV: Float64Array;
  private readonly lastL: Float64Array;
  private slideInit = false;
  private readonly prevBall = new Float64Array(3);
  /** who held the ball at the previous tick, and whether it was where they hold it (the tick of a catch it is not yet) */
  private prevHolder = -1;
  private prevAtHold = true;
  private readonly hold = { x: 0, y: 0, z: 0 };
  private readonly f: AnimFrame;

  constructor(builds: FigureBuild[], hair: ([number, number, number] | null)[][] = []) {
    this.anims = builds.map((b, i) => new FigureAnimator(b, hair[i]?.[0] ?? null, hair[i]?.[1] ?? null, i * 3 + 1));
    const n = builds.length;
    this.prev = new Float32Array(n * 4);
    this.slide = new Float64Array(n * 2);
    this.slideV = new Float64Array(n * 2);
    this.simV = new Float64Array(n * 2);
    this.lastL = new Float64Array(n * 2);
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.z = new Float32Array(n);
    this.facing = new Float32Array(n);
    this.f = {
      m: null as unknown as MatchState,
      p: null as unknown as PlayerSim,
      x: 0,
      y: 0,
      z: 0,
      facing: 0,
      bx: 0,
      by: 0,
      bz: 0,
      camX: 0,
      camY: 6,
      camZ: 20,
      dt: 0,
      lag: 0,
      time: 0,
      mood: 'play',
    };
  }

  /** Remember where everything was, so the next frame can draw between ticks. */
  beforeStep(m: MatchState): void {
    this.synced = true;
    const pv = this.prev;
    for (const p of m.players) {
      const o = p.idx * 4;
      pv[o] = p.x;
      pv[o + 1] = p.y;
      pv[o + 2] = p.z;
      pv[o + 3] = p.facing;
    }
    const b = m.ball;
    this.prevBall[0] = b.x;
    this.prevBall[1] = b.y;
    this.prevBall[2] = b.z;
    this.prevHolder = b.state === 'held' ? b.holder : -1;
    this.prevAtHold = true;
    if (this.prevHolder >= 0) {
      heldBallPos(m, m.players[this.prevHolder], this.hold);
      this.prevAtHold = Math.abs(this.hold.x - b.x) + Math.abs(this.hold.y - b.y) + Math.abs(this.hold.z - b.z) < 1e-4;
    }
  }

  /** What the tick's events do to the motion: squash and stretch, slow motion, the camera's shake, cuts. */
  afterStep(m: MatchState): void {
    for (const e of m.events) {
      switch (e.type) {
        case 'jump':
          this.anims[e.by].impulse(1.5);
          break;
        case 'land':
          this.anims[e.by].impulse(e.hard ? -2.6 : -1.5);
          break;
        case 'dunkStart':
          this.anims[e.by].impulse(2);
          break;
        case 'score':
          if (e.kind === 'dunk' || e.kind === 'oop') {
            this.cam.shake = Math.max(this.cam.shake, e.kind === 'oop' ? 0.5 : 0.36);
            this.slowT = 0.16;
          }
          break;
        case 'block':
          this.cam.shake = Math.max(this.cam.shake, e.stuffed ? 0.4 : 0.22);
          break;
        case 'fire':
          if (e.on) this.cam.shake = Math.max(this.cam.shake, 0.18);
          break;
        case 'inbound':
          for (const a of this.anims) a.reset();
          this.slideInit = false;
          break;
        case 'period':
          if (e.start) for (const a of this.anims) a.reset();
          this.slideInit = false;
          break;
        default:
          break;
      }
    }
  }

  /**
   * One drawn frame: `alpha` is how far between the previous tick (0) and the latest (1) it sits, `dt` the real seconds
   * since the last frame and `aspect` the view's. Poses every figure into `bones` (one array per player).
   */
  frame(m: MatchState, alpha: number, dt: number, aspect: number, bones: Float32Array[]): void {
    if (!this.synced) this.beforeStep(m);
    dt = Math.min(0.1, Math.max(0, dt));
    this.time += dt;
    const a = clamp01(alpha);
    const ball = m.ball;
    const pb = this.prevBall;
    let bx = lerp(pb[0], ball.x, a);
    let by = lerp(pb[1], ball.y, a);
    let bz = lerp(pb[2], ball.z, a);
    if (Math.abs(ball.x - pb[0]) + Math.abs(ball.z - pb[2]) > 3) {
      bx = ball.x;
      by = ball.y;
      bz = ball.z;
    }
    // the tick after a catch the simulation moves the ball from where it was caught into the hands: drawn between those two
    // ticks it would fly back out to the catch (the animator already drew it in the hands on the catch tick), so it rides
    // with its holder instead
    // the simulation sometimes moves a player in a way no body moves: shoved a step sideways by another player, thrown into
    // a lunge or stopped dead. The drawn figure keeps the speed it had and the difference eases away.
    for (const p of m.players) {
      const i = p.idx;
      const o = i * 4;
      const sl = this.slide;
      const slV = this.slideV;
      const sv = this.simV;
      let lx = lerp(this.prev[o], p.x, a);
      let lz = lerp(this.prev[o + 2], p.z, a);
      if (Math.abs(p.x - this.prev[o]) + Math.abs(p.z - this.prev[o + 2]) > CUT || !this.slideInit) {
        // a cut: drawn where the simulation has it, from a standstill
        lx = p.x;
        lz = p.z;
        sl[i * 2] = 0;
        sl[i * 2 + 1] = 0;
        slV[i * 2] = 0;
        slV[i * 2 + 1] = 0;
        sv[i * 2] = 0;
        sv[i * 2 + 1] = 0;
      } else if (dt > 0) {
        const vx = (lx - this.lastL[i * 2]) / dt;
        const vz = (lz - this.lastL[i * 2 + 1]) / dt;
        const dx = vx - sv[i * 2];
        const dz = vz - sv[i * 2 + 1];
        if (Math.hypot(dx, dz) > SLIDE_DV) {
          slV[i * 2] -= dx;
          slV[i * 2 + 1] -= dz;
        }
        sv[i * 2] = vx;
        sv[i * 2 + 1] = vz;
      }
      this.lastL[i * 2] = lx;
      this.lastL[i * 2 + 1] = lz;
      for (let k = 0; k < 2; k++) {
        springTo(sl[i * 2 + k], slV[i * 2 + k], 0, SLIDE_W, dt, sp);
        sl[i * 2 + k] = clamp(sp[0], -0.6, 0.6);
        slV[i * 2 + k] = sp[1];
      }
    }
    this.slideInit = true;
    const holder = ball.state === 'held' ? ball.holder : -1;
    if (holder >= 0) {
      // a held ball goes where its holder is drawn
      bx += this.slide[holder * 2];
      bz += this.slide[holder * 2 + 1];
    }
    if (holder >= 0 && holder === this.prevHolder && !this.prevAtHold) {
      const p = m.players[holder];
      const o = holder * 4;
      bx = ball.x - (1 - a) * (p.x - this.prev[o]) + this.slide[holder * 2];
      by = ball.y - (1 - a) * (p.y - this.prev[o + 1]);
      bz = ball.z - (1 - a) * (p.z - this.prev[o + 2]) + this.slide[holder * 2 + 1];
    }
    this.ballLerp[0] = bx;
    this.ballLerp[1] = by;
    this.ballLerp[2] = bz;
    this.cam.update(m, bx, by, bz, dt, aspect, this.time);

    // slow motion for the big moments
    this.slowT = Math.max(0, this.slowT - dt);
    let scale = this.slowT > 0 ? 0.4 : 1;
    for (const p of m.players) {
      if ((p.state === 'dunk' || p.state === 'oop') && p.t / Math.max(0.01, p.dur) > 0.72) scale = Math.min(scale, 0.5);
    }
    this.timeScale = scale;
    this.animDt = dt * scale;

    const f = this.f;
    f.m = m;
    f.bx = bx;
    f.by = by;
    f.bz = bz;
    const eye = this.lookEye ?? this.cam.eye;
    f.camX = eye[0];
    f.camY = eye[1];
    f.camZ = eye[2];
    f.dt = dt * scale;
    f.lag = (1 - a) * DT;
    f.time = this.time;
    const pv = this.prev;
    for (const p of m.players) {
      const i = p.idx;
      const o = i * 4;
      let x = lerp(pv[o], p.x, a);
      let y = lerp(pv[o + 1], p.y, a);
      let z = lerp(pv[o + 2], p.z, a);
      let d = p.facing - pv[o + 3];
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      let facing = pv[o + 3] + d * a;
      if (Math.abs(p.x - pv[o]) + Math.abs(p.z - pv[o + 2]) > CUT) {
        x = p.x;
        y = p.y;
        z = p.z;
        facing = p.facing;
      }
      x += this.slide[i * 2];
      z += this.slide[i * 2 + 1];
      this.x[i] = x;
      this.y[i] = y;
      this.z[i] = z;
      this.facing[i] = facing;
      f.p = p;
      f.x = x;
      f.y = y;
      f.z = z;
      f.facing = facing;
      f.mood = matchMood(m, p);
      this.anims[i].update(f, bones[i]);
    }

    // a held ball is drawn where the holder's pose keeps it out of the head and the body
    const hb = ball.state === 'held' ? ball.holder : -1;
    this.drawn.update(f.bx, f.by, f.bz, hb, hb >= 0 ? this.anims[hb].ballPush : null, dt * scale);
  }
}
