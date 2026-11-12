/**
 * Procedural animation for one figure.
 *
 * Nothing here is keyframed. Each frame a target pose is worked out from what
 * the simulation says the player is doing, then blended with a short inertial
 * tail so changes of state never pop. Arms and legs are solved with IK and are
 * allowed to stretch a little, cartoon style: the kit figures have short
 * limbs and huge heads, and hands still have to reach a ball held overhead.
 */

import { KIT_BONE_INDEX, KIT_BONES, KIT_METRICS } from '../kit/kit';
import { BALL_R, COURT, PASS, SHOT, STEAL } from '../sim/constants';
import { hoopXOf } from '../sim/core';
import { clamp, clamp01, lerp, smooth } from '../sim/math';
import type { MatchState, PlayerSim } from '../sim/types';
import type { FigureBuild } from './figure';
import {
  frameApply,
  frameEuler,
  frameMul,
  framePitchLocal,
  framePos,
  frameToM4,
  newFrame,
  newLimbResult,
  segmentFrame,
  solveLimb,
} from './rigmath';

export type Mood = 'play' | 'ready' | 'celebrate' | 'cheer' | 'sad' | 'win' | 'lose';

export interface AnimFrame {
  m: MatchState;
  p: PlayerSim;
  /** where to draw the player (interpolated between simulation ticks) */
  x: number;
  y: number;
  z: number;
  facing: number;
  /** ball position, interpolated the same way */
  bx: number;
  by: number;
  bz: number;
  camX: number;
  camY: number;
  camZ: number;
  dt: number;
  /** seconds the drawn moment sits behind the latest simulation tick */
  lag: number;
  time: number;
  mood: Mood;
}

// --- rig ---------------------------------------------------------------------

const BI = KIT_BONE_INDEX;
const pivotOf = (name: string) => KIT_BONES[BI[name]].pivot;
const ROOT = pivotOf('root');
const TORSO = pivotOf('torso');
const HEAD = pivotOf('head');
const EYE_L = pivotOf('eyeL');
const EYE_R = pivotOf('eyeR');
const SHOULDER = pivotOf('armL_up');
const HIP = pivotOf('legL_up');
const HEAD_C = KIT_METRICS.headCenter;
const UPPER = KIT_METRICS.upperArm;
const FORE = KIT_METRICS.forearm;
const THIGH = KIT_METRICS.thigh;
const SHIN = KIT_METRICS.shin;
const ANKLE = KIT_METRICS.ankle;
/** wrist to the middle of the palm */
const PALM = 0.06;
/** arms are drawn a touch longer in play than on the card */
const ARM_BASE = 1.12;
const ARM_MAX_STRETCH = 2.5;
const LEG_MAX_STRETCH = 1.45;
const STANCE = HIP[0] + 0.012;

const B_ROOT = BI.root * 16;
const B_TORSO = BI.torso * 16;
const B_HEAD = BI.head * 16;
const B_EYE_L = BI.eyeL * 16;
const B_EYE_R = BI.eyeR * 16;
const B_ARM_L = [BI.armL_up * 16, BI.armL_lo * 16, BI.handL * 16];
const B_ARM_R = [BI.armR_up * 16, BI.armR_lo * 16, BI.handR * 16];
const B_LEG_L = [BI.legL_up * 16, BI.legL_lo * 16, BI.footL * 16];
const B_LEG_R = [BI.legR_up * 16, BI.legR_lo * 16, BI.footR * 16];
const B_HAIR_A = BI.hairA * 16;
const B_HAIR_B = BI.hairB * 16;

// --- pose channels -------------------------------------------------------------

const RX = 0;
const RY = 1;
const RZ = 2;
const RYAW = 3;
const RPITCH = 4;
const RROLL = 5;
const TYAW = 6;
const TPITCH = 7;
const TROLL = 8;
const HYAW = 9;
const HPITCH = 10;
const HROLL = 11;
/** hands: palm centre in figure space (left = +X) */
const HL = 12;
const HR = 15;
/** elbow pole directions */
const PL = 18;
const PR = 21;
/** wrist: >0 curls the hand forward and down, <0 cocks it back */
const WL = 24;
const WR = 25;
/** feet: ankle position in figure space */
const FL = 26;
const FR = 29;
const FPL = 32;
const FPR = 33;
const FYL = 34;
const FYR = 35;
/** knees: how far they splay outward */
const KL = 36;
const KR = 37;
const SQ = 38;
const LOOK = 39;
const EYE = 40;
const EYEB = 41;
const N = 42;

const fRoot = newFrame();
const fTorso = newFrame();
const fHead = newFrame();
const fLocal = newFrame();
const fSeg = newFrame();
const limb = newLimbResult();
const v3 = new Float64Array(3);
const v3b = new Float64Array(3);

function frac(x: number): number {
  return x - Math.floor(x);
}

function damp(cur: number, target: number, rate: number, dt: number): number {
  return target + (cur - target) * Math.exp(-rate * dt);
}

const STATE_KEY: Record<PlayerSim['state'], number> = {
  free: 1,
  shoot: 2,
  layup: 3,
  dunk: 4,
  oop: 5,
  hang: 6,
  pass: 7,
  steal: 8,
  jump: 9,
  stumble: 10,
  recover: 11,
  celebrate: 12,
};

const MOOD_KEY: Record<Mood, number> = { play: 0, ready: 1, celebrate: 2, cheer: 3, sad: 4, win: 5, lose: 6 };

export class FigureAnimator {
  // placement for the mesh
  px = 0;
  py = 0;
  pz = 0;
  yaw = 0;
  sx = 1;
  sy = 1;
  /** footprint for the floor shadow */
  shadow = 1;

  private readonly build: FigureBuild;
  private readonly hairA: [number, number, number] | null;
  private readonly hairB: [number, number, number] | null;
  private readonly variant: number;
  private readonly tgt = new Float32Array(N);
  private readonly cur = new Float32Array(N);
  private readonly off = new Float32Array(N);
  private key = -1;
  private started = false;
  private phase = 0;
  private moveW = 0;
  private dirX = 0;
  private dirZ = 1;
  private speed = 0;
  private vn = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private hairP = 0;
  private hairR = 0;
  private hairPV = 0;
  private hairRV = 0;
  private sq = 0;
  private sqV = 0;
  private blinkT = 0;
  private nextBlink = 2;
  private sinceRelease = 0;
  private turn = 0;
  private lastFacing = 0;
  private readonly ballF = new Float64Array(3);
  // world -> figure helpers for the current frame
  private cs = 1;
  private sn = 0;
  private ox = 0;
  private oy = 0;
  private oz = 0;
  private lookX = 0;
  private lookY = 0;
  private lookZ = 0;

  constructor(
    build: FigureBuild,
    hairA: [number, number, number] | null,
    hairB: [number, number, number] | null,
    variant: number,
  ) {
    this.build = build;
    this.hairA = hairA;
    this.hairB = hairB;
    this.variant = variant;
    this.blinkT = (variant % 7) * 0.4;
    this.phase = (variant % 5) * 0.2;
  }

  /** Forget the blend tail, for cuts where everyone is moved at once. */
  reset(): void {
    this.started = false;
    this.off.fill(0);
    this.sq = 0;
    this.sqV = 0;
  }

  /** A squash (negative) or stretch (positive) kick, for take-offs and landings. */
  impulse(v: number): void {
    this.sqV += v;
  }

  private toFigure(wx: number, wy: number, wz: number, out: Float64Array): void {
    const dx = wx - this.ox;
    const dy = wy - this.oy;
    const dz = wz - this.oz;
    out[0] = (dx * this.sn - dz * this.cs) / this.sx;
    out[1] = dy / this.sy;
    out[2] = (dx * this.cs + dz * this.sn) / this.sx;
  }

  // --- pose building blocks ----------------------------------------------------

  private hand(side: number, x: number, y: number, z: number): void {
    const o = side > 0 ? HL : HR;
    this.tgt[o] = x;
    this.tgt[o + 1] = y;
    this.tgt[o + 2] = z;
  }

  private pole(side: number, x: number, y: number, z: number): void {
    const o = side > 0 ? PL : PR;
    this.tgt[o] = x;
    this.tgt[o + 1] = y;
    this.tgt[o + 2] = z;
  }

  private wrist(side: number, v: number): void {
    this.tgt[side > 0 ? WL : WR] = v;
  }

  private foot(side: number, x: number, y: number, z: number, pitch: number, yaw: number): void {
    const o = side > 0 ? FL : FR;
    const c = this.tgt;
    c[o] = x;
    c[o + 1] = y;
    c[o + 2] = z;
    c[side > 0 ? FPL : FPR] = pitch;
    c[side > 0 ? FYL : FYR] = yaw;
  }

  private stand(): void {
    const c = this.tgt;
    c.fill(0);
    c[RY] = -0.012;
    this.hand(1, 0.315, 0.47, 0.04);
    this.hand(-1, -0.315, 0.47, 0.04);
    this.pole(1, 0.45, 0, -1);
    this.pole(-1, -0.45, 0, -1);
    this.foot(1, STANCE, ANKLE, 0, 0, 0.14);
    this.foot(-1, -STANCE, ANKLE, 0, 0, -0.14);
    c[SQ] = 1;
    c[LOOK] = 0.7;
    c[EYE] = 1;
    c[EYEB] = 1;
  }

  /** Walk / run / shuffle driven by the player's velocity. */
  private locomotion(armSwing: number, widen: number, crouch: number): void {
    const c = this.tgt;
    const w = this.moveW;
    const vn = this.vn;
    const dx = this.dirX;
    const dz = this.dirZ;
    const stride = Math.min(0.24, 0.05 + this.speed * 0.026) * w;
    const lift = (0.05 + 0.1 * vn) * w;
    const duty = lerp(0.6, 0.4, vn);
    const wide = STANCE + widen + 0.07 * Math.abs(dx) * w;
    const fwd = 0.35 + 0.65 * Math.max(0, dz);
    for (let side = 1; side >= -1; side -= 2) {
      const u = frac(this.phase + (side > 0 ? 0 : 0.5));
      let a: number;
      let h: number;
      let pitch: number;
      if (u < duty) {
        const s = u / duty;
        a = stride * (1 - 2 * s);
        h = 0;
        pitch = s > 0.72 ? ((s - 0.72) / 0.28) * 0.55 : -0.14 * Math.max(0, 1 - s / 0.18);
      } else {
        const s = (u - duty) / (1 - duty);
        a = stride * (-1 + 2 * smooth(s));
        h = lift * Math.sin(Math.PI * s) + 0.03 * w * Math.sin(Math.PI * Math.min(1, s * 1.7));
        pitch = lerp(0.6, -0.16, smooth(s));
      }
      this.foot(side, side * wide + dx * a * 0.7, ANKLE + h, dz * a, pitch * w * fwd, side * 0.14 * (1 - 0.6 * w));
    }
    const ph = this.phase * Math.PI * 2;
    const cph = Math.cos(ph);
    const sph = Math.sin(ph);
    const bob = -(0.008 + 0.026 * vn) * Math.cos(2 * (ph - Math.PI * duty)) * w;
    c[RY] += -0.016 * w - 0.03 * vn * w + bob - crouch;
    const lean = (0.07 + 0.2 * vn + (this.sprint ? 0.07 : 0)) * w;
    c[RPITCH] += lean * dz;
    c[RROLL] += -lean * dx * 0.8 - 0.035 * sph * w + clamp(this.turn * 0.022, -0.2, 0.2) * w;
    c[RX] += 0.012 * sph * w;
    c[RYAW] += -0.13 * cph * w * Math.abs(dz);
    c[TYAW] += 0.24 * cph * w * Math.abs(dz) * armSwing;
    const k = w * armSwing;
    for (let side = 1; side >= -1; side -= 2) {
      const front = side > 0 ? -cph : cph;
      const fp = Math.max(0, front);
      const bk = Math.max(0, -front);
      this.hand(
        side,
        side * (0.315 - 0.04 * fp * k),
        lerp(0.47, 0.57 + 0.13 * fp + 0.03 * bk, k),
        lerp(0.04, 0.05 + 0.23 * front, k),
      );
      this.pole(side, side * 0.45, -0.15 * k, -1);
    }
  }

  private sprint = false;

  /** Both hands on the ball. */
  private holdTwo(): void {
    const b = this.ballF;
    this.hand(1, b[0] + 0.15, b[1] - 0.02, b[2] - 0.06);
    this.hand(-1, b[0] - 0.15, b[1] - 0.02, b[2] - 0.06);
    this.pole(1, 1, -0.55, -0.35);
    this.pole(-1, -1, -0.55, -0.35);
    this.wrist(1, 0.25);
    this.wrist(-1, 0.25);
  }

  private dribble(p: PlayerSim): void {
    const c = this.tgt;
    const b = this.ballF;
    const side = p.hand >= 0 ? -1 : 1;
    // the palm rides the top of the ball, but cannot follow it all the way to the floor
    const top = b[1] + BALL_R * 0.88;
    this.hand(side, b[0], Math.max(top, 0.5), b[2] - 0.02);
    this.pole(side, side * 0.9, 0.15, -0.6);
    this.wrist(side, 0.75);
    const o = -side;
    const k = this.moveW;
    this.hand(o, o * 0.37, 0.69 + 0.03 * Math.sin(this.phase * Math.PI * 2) * k, 0.15);
    this.pole(o, o * 0.8, -0.5, -0.5);
    c[TPITCH] += 0.1;
    c[TROLL] += side * -0.05;
    c[RY] -= 0.02;
    c[LOOK] = 0.22;
  }

  private defend(close: number): void {
    const c = this.tgt;
    const b = this.ballF;
    const s = b[0] >= 0 ? 1 : -1;
    const t = this.time * 5 + this.variant;
    // active hands: one mirrors the ball, one sits in the passing lane
    this.hand(s, s * lerp(0.5, 0.36, close), lerp(0.74, 1.1, close) + 0.03 * Math.sin(t), lerp(0.2, 0.3, close));
    this.hand(-s, -s * 0.5, 0.66 + 0.03 * Math.cos(t), 0.2);
    this.pole(1, 1, -0.6, -0.3);
    this.pole(-1, -1, -0.6, -0.3);
    c[TPITCH] += 0.14;
    c[KL] = 0.25;
    c[KR] = 0.25;
    c[LOOK] = 0.9;
  }

  private time = 0;
  /** seconds in the player's current state at the drawn moment */
  private t = 0;

  // --- the big switch ------------------------------------------------------------

  private buildPose(f: AnimFrame): number {
    const c = this.tgt;
    const p = f.p;
    const m = f.m;
    const b = this.ballF;
    const ball = m.ball;
    this.stand();
    let key = STATE_KEY[p.state] * 100;
    // by default everyone watches the ball
    this.lookX = f.bx;
    this.lookY = f.by;
    this.lookZ = f.bz;
    const hoopX = hoopXOf(p.team);

    switch (p.state) {
      case 'free':
      case 'recover':
      case 'pass':
      case 'celebrate': {
        const defending = m.possession !== p.team && (ball.state === 'held' || ball.state === 'pass') && m.phase === 'live';
        const emoting = f.mood !== 'play' && f.mood !== 'ready' && this.speed < 1.2 && !p.hasBall;
        if (emoting) {
          this.locomotion(0.3, 0, 0);
          this.emote(f);
          key += 50 + MOOD_KEY[f.mood];
          break;
        }
        if (p.hasBall) {
          this.locomotion(0.5, 0.01, 0.01);
          if (p.catchT < 0.22 || m.phase !== 'live') {
            this.holdTwo();
            c[LOOK] = 0.3;
            key += 1;
          } else {
            this.dribble(p);
            key += p.hand >= 0 ? 2 : 3;
          }
        } else if (defending) {
          const bd = Math.hypot(b[0], b[2]);
          const close = clamp01(1 - (bd - 0.9) / 1.6);
          const low = 0.035 + 0.045 * close;
          this.locomotion(0.25, 0.05 + 0.04 * close, low);
          this.defend(close);
          key += 4;
        } else {
          this.locomotion(1, 0, 0);
          // a pass on its way: show the hands
          if (ball.state === 'pass' && ball.to === p.idx) {
            const d = Math.hypot(b[0], b[1] - 0.86, b[2]);
            if (d < 3.2) {
              const k = clamp01(1 - (d - 0.5) / 2.7);
              const ang = Math.atan2(b[0], b[2]);
              const reach = 0.3 + 0.16 * k;
              const cx = Math.sin(ang) * reach;
              const cz = Math.cos(ang) * reach;
              const y = lerp(0.84, clamp(b[1], 0.6, 1.5), k * 0.8);
              this.hand(1, cx + Math.cos(ang) * 0.14, y, cz - Math.sin(ang) * 0.14);
              this.hand(-1, cx - Math.cos(ang) * 0.14, y, cz + Math.sin(ang) * 0.14);
              this.pole(1, 1, -0.5, -0.4);
              this.pole(-1, -1, -0.5, -0.4);
              c[TYAW] += clamp(ang, -0.9, 0.9) * 0.5;
              c[LOOK] = 1;
              key += 5;
            }
          } else if (f.mood === 'ready') {
            // loose and bouncy before the whistle
            const t = this.time * 6.5 + this.variant * 1.7;
            c[RY] += 0.012 * Math.sin(t) - 0.02;
            this.hand(1, 0.33, 0.56 + 0.02 * Math.sin(t + 1), 0.12);
            this.hand(-1, -0.33, 0.56 + 0.02 * Math.sin(t + 2), 0.12);
            key += 6;
          }
        }
        if (p.state === 'recover') {
          const k = 1 - clamp01(this.t / Math.max(0.01, p.dur));
          c[RY] -= 0.07 * k;
          c[RPITCH] += 0.1 * k;
          c[KL] += 0.2 * k;
          c[KR] += 0.2 * k;
        } else if (p.state === 'pass') {
          key = 700 + (p.released ? 1 : 0);
          const r = m.players[p.passTo];
          let ang = 0;
          if (r) {
            this.toFigure(r.x, 0, r.z, v3);
            ang = clamp(Math.atan2(v3[0], v3[2]), -1.7, 1.7);
            this.lookX = r.x;
            this.lookY = 1.1;
            this.lookZ = r.z;
          }
          const push = p.released ? smooth((this.t - PASS.windup) / 0.06) : 0;
          c[TYAW] += ang * 0.55;
          c[RYAW] += ang * 0.15;
          c[TPITCH] += 0.1 + 0.12 * push;
          c[RY] -= 0.03;
          c[LOOK] = 1;
          if (!p.released && p.hasBall) {
            this.holdTwo();
          } else {
            const a = ang * 0.85;
            const ca = Math.cos(a);
            const sa = Math.sin(a);
            const ext = 0.4 + 0.2 * push;
            this.hand(1, 0.11 * ca + ext * sa, 0.85, -0.11 * sa + ext * ca);
            this.hand(-1, -0.11 * ca + ext * sa, 0.85, 0.11 * sa + ext * ca);
            this.pole(1, 1, -0.5, -0.3);
            this.pole(-1, -1, -0.5, -0.3);
            this.wrist(1, 0.6);
            this.wrist(-1, 0.6);
          }
        }
        break;
      }

      case 'shoot': {
        const t = this.t;
        const cr = t < SHOT.crouch ? Math.sin((t / SHOT.crouch) * Math.PI * 0.5) : Math.max(0, 1 - (t - SHOT.crouch) / 0.09);
        const up = smooth((t - SHOT.crouch) / 0.12);
        c[RY] -= 0.09 * cr;
        c[RPITCH] += 0.1 * cr - 0.07 * up;
        c[TPITCH] += 0.06 * cr - 0.05 * up;
        c[KL] = 0.12 * cr;
        c[KR] = 0.12 * cr;
        for (let side = 1; side >= -1; side -= 2) {
          this.foot(side, side * (STANCE + 0.005), ANKLE + 0.025 * up, -0.03 * up, 0.55 * up, side * 0.1);
        }
        const s = p.hand >= 0 ? -1 : 1;
        if (!p.released && p.hasBall) {
          this.hand(s, b[0] + s * 0.035, b[1] - 0.14, b[2] - 0.085);
          this.pole(s, s * 0.35, -1, 0.3);
          this.wrist(s, -0.8);
          this.hand(-s, b[0] - s * 0.155, b[1] - 0.02, b[2]);
          this.pole(-s, -s, -0.45, 0);
          this.wrist(-s, -0.2);
        } else {
          key += 1;
          const rt = this.sinceRelease;
          this.hand(s, s * 0.12, 1.74, 0.5);
          this.pole(s, s * 0.3, -0.6, -0.6);
          this.wrist(s, 1);
          this.hand(-s, -s * 0.3, 1.26 - 0.45 * smooth(rt / 0.32), 0.3);
          this.pole(-s, -s, -0.6, -0.2);
        }
        c[LOOK] = 1;
        this.lookX = hoopX;
        this.lookY = COURT.rimY;
        this.lookZ = 0;
        break;
      }

      case 'layup': {
        const u = clamp01(this.t / Math.max(0.01, p.dur));
        const s = p.hand >= 0 ? -1 : 1;
        const lift = Math.sin(Math.PI * Math.min(1, u * 1.15));
        this.foot(s, s * 0.12, ANKLE + 0.26 * lift, 0.2 * lift, 0.3 * lift, 0);
        this.foot(-s, -s * 0.11, ANKLE, -0.12 * lift, 0.75 * lift, 0);
        c[RPITCH] += 0.14 - 0.2 * u;
        c[RROLL] += s * 0.07 * lift;
        c[TPITCH] -= 0.08 * lift;
        if (!p.released && p.hasBall) {
          this.hand(s, b[0] + s * 0.02, b[1] - 0.145, b[2] - 0.05);
          this.pole(s, s * 0.5, -1, -0.1);
          this.wrist(s, -0.6);
        } else {
          key += 1;
          this.hand(s, s * 0.14, 1.72, 0.4);
          this.pole(s, s * 0.4, -0.6, -0.6);
          this.wrist(s, 0.9);
        }
        this.hand(-s, -s * 0.34, 0.8, 0.2);
        this.pole(-s, -s * 0.9, -0.4, -0.3);
        c[LOOK] = 1;
        this.lookX = hoopX;
        this.lookY = COURT.rimY;
        this.lookZ = 0;
        break;
      }

      case 'dunk':
      case 'oop': {
        const u = clamp01(this.t / Math.max(0.01, p.dur));
        const s = p.hand >= 0 ? -1 : 1;
        const tuck = Math.sin(Math.PI * clamp01(u / 0.85));
        const slam = smooth((u - 0.8) / 0.2);
        const two = p.style === 'twoHand' || p.style === 'spin';
        c[RPITCH] += -0.28 * Math.sin(Math.PI * clamp01((u - 0.1) / 0.75)) + 0.42 * slam;
        c[TPITCH] += 0.25 * slam - 0.1 * tuck;
        c[SQ] = 1 + 0.05 * tuck;
        if (two) {
          for (let side = 1; side >= -1; side -= 2) {
            this.foot(side, side * 0.14, ANKLE + 0.2 * tuck * (1 - 0.6 * slam), -0.1 * tuck + 0.12 * slam, 0.5, side * 0.1);
          }
          c[KL] = 0.3 * tuck;
          c[KR] = 0.3 * tuck;
        } else if (p.style === 'tomahawk') {
          this.foot(s, s * 0.12, ANKLE + 0.27 * tuck, 0.16 * tuck, 0.3, 0);
          this.foot(-s, -s * 0.12, ANKLE + 0.08 * tuck, -0.2 * tuck, 0.8, 0);
        } else {
          this.foot(s, s * 0.13, ANKLE + 0.16 * tuck, 0.26 * tuck, 0.2, 0);
          this.foot(-s, -s * 0.13, ANKLE + 0.14 * tuck, -0.26 * tuck, 0.8, 0);
        }
        key += (two ? 0 : 10) + (p.hasBall ? 1 : 0);
        if (p.hasBall) {
          if (two) {
            this.hand(1, b[0] + 0.145, b[1] + 0.02, b[2] - 0.07);
            this.hand(-1, b[0] - 0.145, b[1] + 0.02, b[2] - 0.07);
            this.pole(1, 1, -0.3, -0.5);
            this.pole(-1, -1, -0.3, -0.5);
            this.wrist(1, lerp(-0.3, 0.6, slam));
            this.wrist(-1, lerp(-0.3, 0.6, slam));
          } else {
            this.hand(s, b[0] + s * 0.03, b[1] + 0.02, b[2] - 0.15);
            this.pole(s, s * 0.8, -0.5, -0.4);
            this.wrist(s, lerp(-0.5, 0.8, slam));
            this.hand(-s, -s * 0.46, 0.92 - 0.2 * slam, 0.02);
            this.pole(-s, -s, -0.2, -0.6);
          }
        } else {
          // rising for a lob: reach for it once it is close
          const d = Math.hypot(b[0], b[1] - 1.3, b[2]);
          const k = clamp01(1 - (d - 0.4) / 2);
          const tx = lerp(0, b[0], k);
          const ty = lerp(1.72, b[1], k);
          const tz = lerp(0.3, b[2], k);
          this.hand(1, tx + 0.15, ty, tz - 0.05);
          this.hand(-1, tx - 0.15, ty, tz - 0.05);
          this.pole(1, 1, -0.3, -0.5);
          this.pole(-1, -1, -0.3, -0.5);
        }
        c[LOOK] = 1;
        if (p.hasBall || p.state === 'dunk') {
          this.lookX = hoopX;
          this.lookY = COURT.rimY;
          this.lookZ = 0;
        }
        break;
      }

      case 'hang': {
        // hands on the near edge of the rim
        let ux = f.x - hoopX;
        let uz = f.z;
        const ul = Math.hypot(ux, uz) || 1;
        ux /= ul;
        uz /= ul;
        this.toFigure(hoopX + ux * COURT.rimR, COURT.rimY + 0.03, uz * COURT.rimR, v3);
        const two = p.style === 'twoHand' || p.style === 'spin';
        const s = p.hand >= 0 ? -1 : 1;
        const sw = Math.cos((this.t / Math.max(0.1, p.dur)) * Math.PI * 1.15);
        if (two) {
          this.hand(1, v3[0] + 0.13, v3[1], v3[2]);
          this.hand(-1, v3[0] - 0.13, v3[1], v3[2]);
          this.wrist(1, 0.7);
          this.wrist(-1, 0.7);
        } else {
          this.hand(s, v3[0] + s * 0.04, v3[1], v3[2]);
          this.wrist(s, 0.7);
          this.hand(-s, -s * 0.5, 0.62, 0.02 - 0.12 * sw);
          this.pole(-s, -s, -0.2, -0.7);
        }
        this.pole(1, 0.8, -0.2, -0.6);
        this.pole(-1, -0.8, -0.2, -0.6);
        c[RPITCH] += -0.42 * sw;
        c[RZ] += 0.1 * sw;
        for (let side = 1; side >= -1; side -= 2) {
          this.foot(side, side * 0.12, ANKLE + 0.12, 0.1 + 0.22 * sw, 0.5, side * 0.1);
        }
        c[LOOK] = 0.6;
        this.lookX = f.camX;
        this.lookY = f.camY * 0.3;
        this.lookZ = f.camZ;
        c[EYEB] = 1.08;
        break;
      }

      case 'steal': {
        const u = clamp01(this.t / STEAL.dur);
        const lunge = Math.sin(Math.PI * Math.min(1, u * 1.25));
        const s = b[0] >= 0 ? 1 : -1;
        key += s > 0 ? 1 : 2;
        const sw = smooth((this.t - 0.02) / 0.2);
        c[RY] -= 0.1 * lunge;
        c[RZ] += 0.1 * lunge;
        c[RPITCH] += 0.42 * lunge;
        c[TYAW] += -s * 0.5 * lunge;
        this.hand(s, s * lerp(0.46, -0.12, sw), lerp(0.66, 0.52, sw), lerp(0.3, 0.62, Math.sin(sw * Math.PI * 0.5)));
        this.pole(s, s, -0.2, -0.5);
        this.wrist(s, 0.5);
        this.hand(-s, -s * 0.36, 0.72, -0.18);
        this.pole(-s, -s * 0.6, 0.2, -1);
        this.foot(s, s * 0.14, ANKLE, 0.26 * lunge, 0, s * 0.1);
        this.foot(-s, -s * 0.13, ANKLE + 0.01, -0.2 * lunge, 0.5 * lunge, -s * 0.1);
        c[LOOK] = 1;
        break;
      }

      case 'jump': {
        const rising = p.vy > 0;
        const tuck = rising ? 1 : 0.25;
        c[RPITCH] -= 0.05;
        c[TPITCH] -= 0.06;
        c[SQ] = 1 + (rising ? 0.04 : 0);
        for (let side = 1; side >= -1; side -= 2) {
          this.foot(side, side * 0.125, ANKLE + 0.05 * tuck, -0.05 * tuck + 0.02, lerp(0.25, 0.6, tuck), side * 0.1);
        }
        if (p.hasBall) {
          key += 1;
          this.holdTwo();
          c[LOOK] = 0.4;
        } else {
          let s = 0;
          const d = Math.hypot(b[0], b[1] - 1.3, b[2]);
          if (ball.state !== 'held' && d < 1.5) s = b[0] >= 0 ? 1 : -1;
          for (let side = 1; side >= -1; side -= 2) {
            if (side === s) {
              // swat at it
              const sx = side * SHOULDER[0];
              const dx = b[0] - sx;
              const dy = b[1] - 0.85;
              const dz = b[2];
              const dl = Math.hypot(dx, dy, dz) || 1;
              const r = Math.min(dl, 1.02) / dl;
              this.hand(side, sx + dx * r, 0.85 + dy * r, dz * r);
              this.wrist(side, 0.5);
            } else {
              this.hand(side, side * 0.19, 1.8, 0.14);
              this.wrist(side, -0.15);
            }
            this.pole(side, side * 0.7, -0.2, -0.7);
          }
          c[LOOK] = 1;
        }
        break;
      }

      case 'stumble': {
        const t = this.t;
        const dur = Math.max(0.2, p.dur);
        const w = smooth(t / 0.2) * (1 - smooth((t - (dur - 0.26)) / 0.24));
        const wob = Math.sin(t * 21 + this.variant);
        key += p.stumbleKind === 'ankle' ? 1 : p.stumbleKind === 'poster' ? 2 : p.stumbleKind === 'stuffed' ? 3 : 4;
        if (p.stumbleKind === 'ankle') {
          // feet go out from under: down on the seat of the shorts, legs out
          c[RY] -= 0.3 * w;
          c[RZ] -= 0.08 * w;
          c[RPITCH] -= 0.46 * w;
          c[TPITCH] += 0.3 * w;
          c[HROLL] += 0.16 * wob * w;
          this.foot(1, 0.2, ANKLE + 0.02 * w, 0.36 * w, -0.5 * w, 0.4 * w);
          this.foot(-1, -0.2, ANKLE + 0.02 * w, 0.3 * w, -0.5 * w, -0.4 * w);
          this.hand(1, lerp(0.315, 0.4, w), lerp(0.47, 0.14, w), lerp(0.04, -0.3, w));
          this.hand(-1, -lerp(0.315, 0.4, w), lerp(0.47, 0.14, w), lerp(0.04, -0.3, w));
          this.pole(1, 1, 0.2, -0.6);
          this.pole(-1, -1, 0.2, -0.6);
          c[EYE] = lerp(1, 0.22, w);
        } else if (p.stumbleKind === 'poster' || p.stumbleKind === 'stuffed') {
          // knocked flat on the back, feet in the air
          c[RY] -= 0.27 * w;
          c[RZ] -= 0.16 * w;
          c[RPITCH] -= 1.05 * w;
          c[TPITCH] += 0.25 * w;
          this.foot(1, 0.17, ANKLE + 0.2 * w, 0.24 * w + 0.05 * wob * w, -0.3 * w, 0.2);
          this.foot(-1, -0.17, ANKLE + 0.26 * w, 0.2 * w - 0.05 * wob * w, -0.3 * w, -0.2);
          this.hand(1, lerp(0.315, 0.56, w), lerp(0.47, 0.86, w), lerp(0.04, 0.1 + 0.06 * wob, w));
          this.hand(-1, -lerp(0.315, 0.56, w), lerp(0.47, 0.86, w), lerp(0.04, 0.1 - 0.06 * wob, w));
          this.pole(1, 1, -0.4, -0.4);
          this.pole(-1, -1, -0.4, -0.4);
          c[EYEB] = lerp(1, 1.22, w);
        } else {
          c[RROLL] += 0.2 * wob * w;
          c[RY] -= 0.05 * w;
          this.hand(1, 0.5, 0.8 + 0.1 * wob, 0.1);
          this.hand(-1, -0.5, 0.8 - 0.1 * wob, 0.1);
        }
        c[LOOK] = 0.2;
        break;
      }
    }
    return key;
  }

  /** Little performances between plays. */
  private emote(f: AnimFrame): void {
    const c = this.tgt;
    const t = this.time;
    const v = this.variant;
    const beat = t * 9 + v;
    const hop = Math.abs(Math.sin(beat * 0.5));
    switch (f.mood) {
      case 'celebrate':
      case 'win': {
        const kind = v % 4;
        this.lookX = f.camX;
        this.lookY = f.camY * 0.4;
        this.lookZ = f.camZ;
        c[LOOK] = 0.8;
        if (kind === 0) {
          // fist pump
          c[RY] += 0.05 * hop;
          this.hand(-1, -0.3, 1.3 + 0.3 * hop, 0.12);
          this.pole(-1, -1, -0.4, -0.3);
          this.hand(1, 0.33, 0.52, 0.06);
          c[TROLL] += 0.08;
        } else if (kind === 1) {
          // both arms up, bouncing
          c[RY] += 0.07 * hop;
          this.hand(1, 0.36, 1.6 + 0.06 * hop, 0.05);
          this.hand(-1, -0.36, 1.6 + 0.06 * hop, 0.05);
          this.pole(1, 1, -0.3, -0.4);
          this.pole(-1, -1, -0.3, -0.4);
          c[TPITCH] -= 0.1;
        } else if (kind === 2) {
          // flex
          const s = Math.sin(t * 5 + v);
          this.hand(1, 0.44, 1.0 + 0.03 * s, 0.02);
          this.hand(-1, -0.44, 1.0 - 0.03 * s, 0.02);
          this.pole(1, 1, -1, 0);
          this.pole(-1, -1, -1, 0);
          c[TROLL] += 0.1 * s;
          c[RY] -= 0.03;
          c[KL] = 0.2;
          c[KR] = 0.2;
        } else {
          // dance
          const s = Math.sin(t * 7 + v);
          c[RX] += 0.05 * s;
          c[RYAW] += 0.3 * s;
          c[RY] += 0.03 * Math.abs(s) - 0.03;
          this.hand(1, 0.4, 0.95 + 0.4 * s, 0.14);
          this.hand(-1, -0.4, 0.95 - 0.4 * s, 0.14);
          this.pole(1, 1, -0.5, -0.3);
          this.pole(-1, -1, -0.5, -0.3);
          c[HROLL] += 0.12 * s;
        }
        c[EYE] = 0.75;
        break;
      }
      case 'cheer': {
        // clap along
        const clap = Math.abs(Math.sin(beat * 0.55));
        c[RY] += 0.03 * hop;
        this.hand(1, 0.04 + 0.13 * clap, 0.93, 0.36);
        this.hand(-1, -0.04 - 0.13 * clap, 0.93, 0.36);
        this.pole(1, 1, -0.6, -0.2);
        this.pole(-1, -1, -0.6, -0.2);
        c[LOOK] = 0.9;
        break;
      }
      case 'sad':
      case 'lose': {
        // shoulders down, head down, a slow shake of the head
        const s = Math.sin(t * 2.2 + v);
        c[TPITCH] += 0.22;
        c[HPITCH] += 0.3;
        c[HYAW] += 0.2 * s;
        c[RY] -= 0.03;
        if (v % 3 === 0) {
          // hands on the head
          this.hand(1, 0.36, 1.5, 0.12);
          this.hand(-1, -0.36, 1.5, 0.12);
          this.pole(1, 1, -0.1, -0.3);
          this.pole(-1, -1, -0.1, -0.3);
          c[HPITCH] -= 0.2;
        } else {
          this.hand(1, 0.27, 0.42, 0.1);
          this.hand(-1, -0.27, 0.42, 0.1);
        }
        c[LOOK] = 0;
        c[EYE] = 0.6;
        break;
      }
      default:
        break;
    }
  }

  // --- per frame -------------------------------------------------------------------

  update(f: AnimFrame, bones: Float32Array): void {
    const p = f.p;
    const dt = Math.min(0.05, Math.max(0, f.dt));
    this.time = f.time + this.variant * 0.37;
    this.t = Math.max(0, p.t - f.lag);

    // squash and stretch spring
    this.sqV += (-this.sq * 320 - this.sqV * 22) * dt;
    this.sq = clamp(this.sq + this.sqV * dt, -0.2, 0.2);

    // movement in figure space
    this.cs = Math.cos(f.facing);
    this.sn = Math.sin(f.facing);
    const speed = Math.hypot(p.vx, p.vz);
    const grounded = p.state === 'free' || p.state === 'recover' || p.state === 'pass' || p.state === 'celebrate';
    this.speed = speed;
    this.vn = clamp01(speed / 9.5);
    this.sprint = p.sprinting;
    this.moveW = damp(this.moveW, grounded ? smooth((speed - 0.3) / 1.3) : 0, 14, dt);
    if (speed > 0.2) {
      const vF = (p.vx * this.cs + p.vz * this.sn) / speed;
      const vL = (p.vx * this.sn - p.vz * this.cs) / speed;
      this.dirX = damp(this.dirX, vL, 16, dt);
      this.dirZ = damp(this.dirZ, vF, 16, dt);
      const dl = Math.hypot(this.dirX, this.dirZ) || 1;
      this.dirX /= dl;
      this.dirZ /= dl;
      this.phase += dt * lerp(1.9, 3.5, this.vn);
    }
    let dFacing = f.facing - this.lastFacing;
    while (dFacing > Math.PI) dFacing -= Math.PI * 2;
    while (dFacing < -Math.PI) dFacing += Math.PI * 2;
    this.lastFacing = f.facing;
    // turning toward +facing is a turn to the figure's right
    this.turn = damp(this.turn, dt > 0 ? clamp(dFacing / dt, -14, 14) : 0, 10, dt);
    if (p.released) this.sinceRelease += dt;
    else this.sinceRelease = 0;

    // placement
    const b = this.build;
    const sqv = 1 + this.sq;
    this.sx = (b.height * b.bulk) / Math.sqrt(sqv);
    this.sy = b.height * sqv;
    this.ox = f.x;
    this.oy = f.y;
    this.oz = f.z;
    this.px = f.x;
    this.py = f.y;
    this.pz = f.z;
    this.yaw = Math.PI / 2 - f.facing;
    this.toFigure(f.bx, f.by, f.bz, this.ballF);

    const key = this.buildPose(f);

    // inertial blend: keep whatever offset the last pose had and let it die away
    const c = this.cur;
    const tgt = this.tgt;
    const off = this.off;
    if (!this.started) {
      this.started = true;
      off.fill(0);
    } else if (key !== this.key) {
      for (let i = 0; i < N; i++) off[i] = c[i] - tgt[i];
    }
    this.key = key;
    const decay = Math.exp(-dt * 13);
    for (let i = 0; i < N; i++) {
      off[i] *= decay;
      c[i] = tgt[i] + off[i];
    }

    // head: look at something
    const hx = c[RX];
    const hy = HEAD_C[1] + c[RY];
    this.toFigure(this.lookX, this.lookY, this.lookZ, v3);
    const lx = v3[0] - hx;
    const ly = v3[1] - hy;
    const lz = v3[2] - c[RZ];
    const flat = Math.hypot(lx, lz);
    let wantYaw = 0;
    let wantPitch = 0;
    if (flat > 0.15) {
      const yawT = Math.atan2(lx, lz);
      const behind = clamp01((2.6 - Math.abs(yawT)) / 0.6);
      wantYaw = clamp(yawT - c[RYAW] - c[TYAW], -1.1, 1.1) * c[LOOK] * behind;
      wantPitch = clamp(-Math.atan2(ly, flat) - c[RPITCH] - c[TPITCH], -0.5, 0.42) * c[LOOK] * behind;
    }
    this.lookYaw = damp(this.lookYaw, wantYaw, 11, dt);
    this.lookPitch = damp(this.lookPitch, wantPitch, 11, dt);

    // blink
    this.blinkT += dt;
    let lid = 1;
    if (this.blinkT > this.nextBlink) {
      const k = (this.blinkT - this.nextBlink) / 0.13;
      if (k >= 1) {
        this.blinkT = 0;
        this.nextBlink = 1.8 + ((this.variant * 7919 + Math.floor(f.time * 3)) % 23) * 0.13;
      } else {
        lid = Math.abs(1 - 2 * k);
      }
    }

    // hair swings behind the motion
    const vF = p.vx * this.cs + p.vz * this.sn;
    const vL = p.vx * this.sn - p.vz * this.cs;
    const hpT = clamp(vF * 0.07 - p.vy * 0.05 + c[RPITCH] * 0.5, -0.2, 0.95);
    const hrT = clamp(-vL * 0.07, -0.7, 0.7);
    this.hairPV += ((hpT - this.hairP) * 140 - this.hairPV * 10) * dt;
    this.hairRV += ((hrT - this.hairR) * 140 - this.hairRV * 10) * dt;
    this.hairP += this.hairPV * dt;
    this.hairR += this.hairRV * dt;

    this.shadow = 1 + 0.25 * Math.abs(c[RPITCH]) + (c[RY] < -0.2 ? 0.3 : 0);
    this.writeBones(bones, lid, -f.y / this.sy);
  }

  private writeBones(bones: Float32Array, lid: number, floorY: number): void {
    const c = this.cur;
    const b = this.build;
    const hs = b.head / Math.pow(b.height, 0.6);
    const hsx = hs / b.bulk;

    frameEuler(fRoot, c[RYAW], c[RPITCH], c[RROLL]);
    framePos(fRoot, ROOT[0] + c[RX], ROOT[1] + c[RY], ROOT[2] + c[RZ]);
    frameToM4(fRoot, bones, B_ROOT);

    frameEuler(fLocal, c[TYAW], c[TPITCH], c[TROLL]);
    framePos(fLocal, TORSO[0] - ROOT[0], TORSO[1] - ROOT[1], TORSO[2] - ROOT[2]);
    frameMul(fTorso, fRoot, fLocal);
    frameToM4(fTorso, bones, B_TORSO);

    frameEuler(fLocal, c[HYAW] + this.lookYaw, c[HPITCH] + this.lookPitch, c[HROLL]);
    framePos(fLocal, HEAD[0] - TORSO[0], HEAD[1] - TORSO[1], HEAD[2] - TORSO[2]);
    frameMul(fHead, fTorso, fLocal);
    frameToM4(fHead, bones, B_HEAD, hsx, hs, hsx);

    // eyes ride the head, and squash shut to blink
    const eb = c[EYEB];
    const open = Math.max(0.08, c[EYE] * lid);
    for (let i = 0; i < 2; i++) {
      const e = i === 0 ? EYE_L : EYE_R;
      frameApply(fHead, (e[0] - HEAD[0]) * hsx, (e[1] - HEAD[1]) * hs, (e[2] - HEAD[2]) * hsx, v3);
      fSeg.set(fHead);
      framePos(fSeg, v3[0], v3[1], v3[2]);
      frameToM4(fSeg, bones, i === 0 ? B_EYE_L : B_EYE_R, hsx * eb, hs * eb * open, hsx * eb);
    }

    // loose hair
    for (let i = 0; i < 2; i++) {
      const piv = i === 0 ? this.hairA : this.hairB;
      const o = i === 0 ? B_HAIR_A : B_HAIR_B;
      if (!piv) {
        frameToM4(fHead, bones, o, hsx, hs, hsx);
        continue;
      }
      frameEuler(fLocal, 0, this.hairP, this.hairR);
      framePos(fLocal, (piv[0] - HEAD[0]) * hsx, (piv[1] - HEAD[1]) * hs, (piv[2] - HEAD[2]) * hsx);
      frameMul(fSeg, fHead, fLocal);
      frameToM4(fSeg, bones, o, hsx, hs, hsx);
    }

    // arms
    for (let side = 1; side >= -1; side -= 2) {
      const ho = side > 0 ? HL : HR;
      const po = side > 0 ? PL : PR;
      const bo = side > 0 ? B_ARM_L : B_ARM_R;
      const tx = c[ho];
      const ty = c[ho + 1];
      const tz = c[ho + 2];
      // the shoulder shrugs up and out a little for a high reach
      const raise = clamp01((ty - SHOULDER[1]) / 0.7);
      frameApply(
        fTorso,
        side * (SHOULDER[0] + 0.015 * raise) - TORSO[0],
        SHOULDER[1] + 0.06 * raise - TORSO[1],
        SHOULDER[2] - TORSO[2],
        v3,
      );
      const sx = v3[0];
      const sy = v3[1];
      const sz = v3[2];
      const l1 = UPPER * ARM_BASE;
      const l2 = FORE * ARM_BASE + PALM;
      solveLimb(sx, sy, sz, tx, ty, tz, l1, l2, c[po], c[po + 1], c[po + 2], 1, ARM_MAX_STRETCH, limb);
      const st = limb.stretch;
      segmentFrame(fSeg, sx, sy, sz, limb.mx, limb.my, limb.mz, limb.nx, limb.ny, limb.nz);
      frameToM4(fSeg, bones, bo[0], 1, (l1 * st) / UPPER, 1);
      // the forearm stops at the wrist; the palm carries on from there
      const foreLen = l2 * st - PALM;
      const k = foreLen / (l2 * st);
      const wx = limb.mx + (limb.ex - limb.mx) * k;
      const wy = limb.my + (limb.ey - limb.my) * k;
      const wz = limb.mz + (limb.ez - limb.mz) * k;
      segmentFrame(fSeg, limb.mx, limb.my, limb.mz, wx, wy, wz, limb.nx, limb.ny, limb.nz);
      frameToM4(fSeg, bones, bo[1], 1, foreLen / FORE, 1);
      // hand: along the forearm, bent toward where the wrist channel points it
      let ax = limb.ex - limb.mx;
      let ay = limb.ey - limb.my;
      let az = limb.ez - limb.mz;
      const al = Math.hypot(ax, ay, az) || 1;
      ax /= al;
      ay /= al;
      az /= al;
      const wv = c[side > 0 ? WL : WR];
      if (wv > 0.001) {
        const q = Math.min(1, wv);
        ax = ax * (1 - q);
        ay = ay * (1 - q) - 0.75 * q;
        az = az * (1 - q) + 0.66 * q;
      } else if (wv < -0.001) {
        const q = Math.min(1, -wv);
        ax = ax * (1 - q);
        ay = ay * (1 - q) + 0.3 * q;
        az = az * (1 - q) - 0.95 * q;
      }
      segmentFrame(fSeg, wx, wy, wz, wx + ax, wy + ay, wz + az, limb.nx, limb.ny, limb.nz);
      frameToM4(fSeg, bones, bo[2]);
    }

    // legs
    for (let side = 1; side >= -1; side -= 2) {
      const fo = side > 0 ? FL : FR;
      const bo = side > 0 ? B_LEG_L : B_LEG_R;
      frameApply(fRoot, side * HIP[0] - ROOT[0], HIP[1] - ROOT[1], HIP[2] - ROOT[2], v3b);
      const fy = c[side > 0 ? FYL : FYR];
      const fp = c[side > 0 ? FPL : FPR];
      const splay = c[side > 0 ? KL : KR];
      const ay = Math.max(c[fo + 1], floorY + ANKLE);
      solveLimb(
        v3b[0],
        v3b[1],
        v3b[2],
        c[fo],
        ay,
        c[fo + 2],
        THIGH,
        SHIN,
        Math.sin(fy) + side * splay,
        0.08,
        Math.cos(fy),
        -1,
        LEG_MAX_STRETCH,
        limb,
      );
      const st = limb.stretch;
      segmentFrame(fSeg, v3b[0], v3b[1], v3b[2], limb.mx, limb.my, limb.mz, limb.nx, limb.ny, limb.nz);
      frameToM4(fSeg, bones, bo[0], 1, st, 1);
      segmentFrame(fSeg, limb.mx, limb.my, limb.mz, limb.ex, limb.ey, limb.ez, limb.nx, limb.ny, limb.nz);
      frameToM4(fSeg, bones, bo[1], 1, st, 1);
      frameEuler(fSeg, fy, 0, 0);
      framePitchLocal(fSeg, fp);
      framePos(fSeg, limb.ex, limb.ey, limb.ez);
      frameToM4(fSeg, bones, bo[2]);
    }
  }
}
