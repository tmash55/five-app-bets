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
import {
  EASY,
  HOLD_X,
  HOLD_Y,
  HOLD_Z,
  POUND,
  bez,
  dribbleAt,
  easyPattern,
  flightTimeDown,
  flightY,
  launchSpeed,
  launchY,
  newDribbleInfo,
  poundPattern,
  softMax,
  type Bounce,
  type DribbleStyle,
} from '../stage/ballPath';
import type { StageAct } from '../stage/director';
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

/** One frame of a warm-up act on the stage: what the director says, and where the figure stands. */
export interface ShowFrame {
  act: StageAct;
  /** seconds into the act, and its length */
  t: number;
  dur: number;
  /** running number of the act: a new number starts a blend from the last pose */
  index: number;
  /** where the figure stands on the stage floor and which way it faces (the match's convention) */
  x: number;
  z: number;
  facing: number;
  hasBall: boolean;
  /** the figure's lead hand: 1 its left, -1 its right */
  hand: number;
  /** where the figure stands in its group: -1, 0 (the middle) or 1 */
  side: number;
  /** counts taps, so a second tap can get a different reaction */
  variety: number;
  /** the camera, and a teammate's head, to look at */
  camX: number;
  camY: number;
  camZ: number;
  palX: number;
  palY: number;
  palZ: number;
  dt: number;
  time: number;
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

// --- the warm-up stage's timings, in seconds into each act, and heights in figure units ---

/** from the wrist to the fingertip the ball spins on */
const HAND_TIP = 0.13;
const SPIN_LOAD = 0.5;
const SPIN_POP = SPIN_LOAD;
const SPIN_ON = 0.8;
const SPIN_BRUSH = [2.5, 4.2];
/** the ball's height on the palm in front of the chest */
const SPIN_PALM_Y = 0.75;
const ENTER_FALL = 0.42;
const ENTER_SETTLE = 0.73;
const ENTER_DROP = 2.6;
const TOSS_DIP = 0.42;
const TOSS_PUSH = 0.22;
const TOSS_REL = 0.98;
const TOSS_APEX = 1.0;
const TOSS_CATCH = 1.02;
const TOSS_GIVE = 0.11;
const SHOT_GATHER = 0.55;
const SHOT_DIP = 0.85;
const SHOT_PUSH = 0.18;
/** the set point, out by the ear on the shooting side (it cannot go over the head with these arms) */
const SHOT_SET = 1.1;
const SHOT_REL = 1.32;
const SHOT_APEX = 0.85;
const SHOT_CATCH = 0.9;
const HOP_START = 0.22;
const HOP_PERIOD = 0.34;
const HOP_COUNT = 5;
const HOP_H = 0.075;
const POUND_L = poundPattern(1);
const POUND_R = poundPattern(-1);
const EASY_L = easyPattern(1);
const EASY_R = easyPattern(-1);

const fRoot = newFrame();
const fTorso = newFrame();
const fHead = newFrame();
const fLocal = newFrame();
const fSeg = newFrame();
const limb = newLimbResult();
const v3 = new Float64Array(3);
const v3b = new Float64Array(3);
const fShowA = newFrame();
const fShowB = newFrame();
const fShowL = newFrame();
const fShowP = new Float64Array(3);

// --- keeping hands, elbows and the ball out of the body on the warm-up stage ---------------
//
// Acts put hands and the ball where they want them, and the blend between two acts moves
// them in straight lines: either can cut through the chest or the big head. After the
// blend and before the arms are solved, hands, elbows and the ball are pushed back out of
// simple shapes read off the kit's meshes (tests check them against the meshes). The push
// fades in over a thin band outside the surface, so nothing pops as a hand comes close.

/** the chest: heights above the torso pivot, with the half width across and the half depth front to back there */
const CHEST_Y = [-0.035, 0.03, 0.13, 0.18, 0.25, 0.32, 0.37, 0.415];
const CHEST_A = [0.19, 0.21, 0.214, 0.231, 0.218, 0.202, 0.16, 0.09];
const CHEST_B = [0.14, 0.156, 0.159, 0.158, 0.151, 0.13, 0.105, 0.08];
/** how square the slices are (2 is an ellipse; the chest and the shorts are boxier, which matters where an arm comes across the front) */
const CHEST_N = 2.65;
const HIPS_N = 2.8;
/** the hips (the shorts), above the root pivot */
const HIPS_Y = [-0.048, -0.02, 0, 0.085];
const HIPS_A = [0.16, 0.2, 0.213, 0.21];
const HIPS_B = [0.105, 0.145, 0.156, 0.155];
/** the head without its ears, from the head pivot: an ellipsoid */
const HEAD_EC = [0, 0.321, 0];
const HEAD_ER = [0.427, 0.367, 0.37];
/** how close the middle of a hand, an elbow or a forearm may come to a surface, and the band over which the push fades in */
const G_HAND = 0.05;
const G_ELBOW = 0.07;
const G_FORE = 0.055;
const G_SOFT = 0.025;
/** the corner between the sides of the chest and its top and bottom is rounded off over this */
const G_ROUND = 0.015;
/** scratch: a normal, a push, and the ball's push */
const gN = new Float64Array(3);
const gP = new Float64Array(3);
const gQ = new Float64Array(3);

/**
 * Signed distance from a point (in the body's own space) to a stack of rounded-square slices (|x/a|^n + |z/b|^n = 1), with
 * the way out in `gN`: across, or up through the top (rounded where the sides meet it, so it turns smoothly).
 */
function slabSd(Y: readonly number[], A: readonly number[], B: readonly number[], N: number, x: number, y: number, z: number): number {
  const n = Y.length;
  let i = 0;
  while (i < n - 2 && y > Y[i + 1]) i++;
  const w = clamp01((y - Y[i]) / (Y[i + 1] - Y[i]));
  const a = A[i] + (A[i + 1] - A[i]) * w;
  const b = B[i] + (B[i + 1] - B[i]) * w;
  const px = Math.pow(Math.abs(x / a), N);
  const pz = Math.pow(Math.abs(z / b), N);
  const q = Math.pow(px + pz, 1 / N);
  let hd: number;
  let hx = 0;
  let hz = 1;
  if (q < 1e-6) {
    hd = -Math.min(a, b);
  } else {
    // q - 1 over its slope: a distance near the surface (q grows in proportion to the distance from the middle)
    const qn = Math.pow(q, 1 - N);
    const gx = x !== 0 ? (px / x) * qn : 0;
    const gz = z !== 0 ? (pz / z) * qn : 0;
    const gl = Math.hypot(gx, gz);
    if (gl < 1e-9) {
      hd = -Math.min(a, b);
    } else {
      hd = (q - 1) / gl;
      hx = gx / gl;
      hz = gz / gl;
    }
  }
  const up = y - Y[n - 1];
  const down = Y[0] - y;
  const vd = Math.max(up, down);
  const vy = up > down ? 1 : -1;
  const m = Math.max(hd, vd);
  const eh = Math.exp((hd - m) / G_ROUND);
  const ev = Math.exp((vd - m) / G_ROUND);
  // out through the top, but never down out of the bottom: the hips and the legs are under it
  const nx = vy > 0 ? eh * hx : hx;
  const ny = vy > 0 ? ev : 0;
  const nz = vy > 0 ? eh * hz : hz;
  const nl = Math.hypot(nx, ny, nz) || 1;
  gN[0] = nx / nl;
  gN[1] = ny / nl;
  gN[2] = nz / nl;
  return m + G_ROUND * Math.log(eh + ev);
}

/** How far to push something whose centre is `sd` from a surface and that should stay `r` clear: nothing beyond the soft band, all of it deep inside. */
function softPush(sd: number, r: number): number {
  const d = sd - r;
  if (d >= G_SOFT) return 0;
  return G_SOFT * Math.exp((d - G_SOFT) / G_SOFT) - d;
}

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
          this.hand(s, s * 0.2, 1.52, 0.44);
          this.pole(s, s * 0.3, -0.6, -0.6);
          this.wrist(s, 1);
          this.hand(-s, -s * 0.32, 1.2 - 0.42 * smooth(rt / 0.32), 0.28);
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
          this.hand(s, s * 0.18, 1.52, 0.36);
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
          const ty = lerp(1.55, b[1], k);
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
              const r = Math.min(dl, 0.84) / dl;
              this.hand(side, sx + dx * r, 0.85 + dy * r, dz * r);
              this.wrist(side, 0.5);
            } else {
              // arms up in a V, clear of the big head
              this.hand(side, side * 0.42, 1.52, 0.12);
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
          this.hand(-1, -0.4, 1.22 + 0.28 * hop, 0.12);
          this.pole(-1, -1, -0.4, -0.3);
          this.hand(1, 0.33, 0.52, 0.06);
          c[TROLL] += 0.08;
        } else if (kind === 1) {
          // both arms up, bouncing
          c[RY] += 0.07 * hop;
          this.hand(1, 0.46, 1.48 + 0.06 * hop, 0.05);
          this.hand(-1, -0.46, 1.48 + 0.06 * hop, 0.05);
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
    this.guard = false;
    this.finish(bones, key, dt, f.time, p.vx * this.cs + p.vz * this.sn, p.vx * this.sn - p.vz * this.cs, p.vy, -f.y / this.sy);
  }

  /**
   * Everything after the target pose, shared by the match and the stage: the
   * inertial blend, the head's look, blinking, the hair spring and the bones.
   * `vF`, `vL` and `vy` are the body's speed forward, to its left and up, for the hair.
   */
  private finish(bones: Float32Array, key: number, dt: number, time: number, vF: number, vL: number, vy: number, floorY: number): void {
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
    // a hand on the ball goes exactly where the ball needs it
    for (let side = 0; side < 2; side++) {
      if ((this.grip & (1 << side)) === 0) continue;
      const o = side === 0 ? HL : HR;
      for (let k = 0; k < 3; k++) {
        c[o + k] = tgt[o + k];
        off[o + k] = 0;
      }
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
        this.nextBlink = 1.8 + ((this.variant * 7919 + Math.floor(time * 3)) % 23) * 0.13;
      } else {
        lid = Math.abs(1 - 2 * k);
      }
    }

    // hair swings behind the motion
    const hpT = clamp(vF * 0.07 - vy * 0.05 + c[RPITCH] * 0.5, -0.2, 0.95);
    const hrT = clamp(-vL * 0.07, -0.7, 0.7);
    this.hairPV += ((hpT - this.hairP) * 140 - this.hairPV * 10) * dt;
    this.hairRV += ((hrT - this.hairR) * 140 - this.hairRV * 10) * dt;
    this.hairP += this.hairPV * dt;
    this.hairR += this.hairRV * dt;

    this.shadow = 1 + 0.25 * Math.abs(c[RPITCH]) + (c[RY] < -0.2 ? 0.3 : 0);
    this.writeBones(bones, lid, floorY);
  }

  // --- the warm-up stage ------------------------------------------------------------
  //
  // The same pose blocks, blend and bones as the match, driven by a director's
  // act and the time inside it instead of a simulation. For ball acts the ball
  // is worked out first, as a function of time, and the hands are put on it.

  /** where this figure's ball is this frame (world) */
  readonly ball = new Float64Array(3);
  /** the ball's spin as an angular velocity in the world (radians a second about each axis) */
  readonly spin = new Float64Array(3);
  /** the ball flattens a touch against the floor (1 = round) */
  ballSquash = 1;
  /** this figure carries a ball on stage */
  hasBall = false;
  /** still waiting to drop onto the stage */
  hidden = false;
  /** which hands the act says are on the ball: 1 left, 2 right, 4 the lead hand's fingertip */
  contact = 0;
  /** which feet the act says are flat on the floor: 1 left, 2 right */
  planted = 0;
  /** hands as drawn, figure space: wrist xyz, pointing direction xyz, thickness; left then right */
  readonly hands = new Float64Array(14);
  /** ankles as drawn, figure space: left xyz, then right xyz */
  readonly ankles = new Float64Array(6);
  /** height the figure is lifted off the floor (hops, the entrance) */
  lift = 0;

  private grip = 0;
  /** push hands, elbows and the ball out of the body (the warm-up stage only) */
  private guard = false;
  private sf: ShowFrame | null = null;
  private showIndex = -1;
  private lands = 0;
  private ballSource = 0;
  private ballFresh = true;
  private ballInit = false;
  private onFinger = false;
  /** 0: the ball on the raised fingertip; 1: on the palm, held low */
  private palm = 0;
  /** how much the ball follows the hand rather than its own path (the end of the flick onto the finger) */
  private fingerMix = 1;
  private lookFig = false;
  private prevLift = 0;
  private prevRX = 0;
  private prevRZ = 0;
  private readonly ballOff = new Float64Array(3);
  private readonly ballLast = new Float64Array(3);
  private readonly spinF = new Float64Array(3);
  private readonly lookF = new Float64Array(3);
  private readonly dInfo = newDribbleInfo();

  /** Figure space to world, with the current placement. */
  toWorld(fx: number, fy: number, fz: number, out: Float64Array, o = 0): void {
    out[o] = this.ox + this.sx * (fx * this.sn + fz * this.cs);
    out[o + 1] = this.oy + this.sy * fy;
    out[o + 2] = this.oz + this.sx * (fz * this.sn - fx * this.cs);
  }

  /** A point given in the rest pose's torso space, where the target pose puts it (figure space). */
  private bodyPt(x: number, y: number, z: number, out: Float64Array): void {
    const c = this.tgt;
    frameEuler(fShowA, c[RYAW], c[RPITCH], c[RROLL]);
    framePos(fShowA, ROOT[0] + c[RX], ROOT[1] + c[RY], ROOT[2] + c[RZ]);
    frameEuler(fShowL, c[TYAW], c[TPITCH], c[TROLL]);
    framePos(fShowL, TORSO[0] - ROOT[0], TORSO[1] - ROOT[1], TORSO[2] - ROOT[2]);
    frameMul(fShowB, fShowA, fShowL);
    frameApply(fShowB, x - TORSO[0], y - TORSO[1], z - TORSO[2], out);
  }

  /** Same for a point that rides the hips. */
  private rootPt(x: number, y: number, z: number, out: Float64Array): void {
    const c = this.tgt;
    frameEuler(fShowA, c[RYAW], c[RPITCH], c[RROLL]);
    framePos(fShowA, ROOT[0] + c[RX], ROOT[1] + c[RY], ROOT[2] + c[RZ]);
    frameApply(fShowA, x - ROOT[0], y - ROOT[1], z - ROOT[2], out);
  }

  private lookCam(w: number): void {
    const f = this.sf as ShowFrame;
    this.lookFig = false;
    this.lookX = f.camX;
    this.lookY = f.camY;
    this.lookZ = f.camZ;
    this.tgt[LOOK] = w;
  }

  private lookPal(w: number): void {
    const f = this.sf as ShowFrame;
    this.lookFig = false;
    this.lookX = f.palX;
    this.lookY = f.palY;
    this.lookZ = f.palZ;
    this.tgt[LOOK] = w;
  }

  /** Look at a point in figure space (the ball, a hand). */
  private lookAtFig(x: number, y: number, z: number, w: number): void {
    this.lookFig = true;
    this.lookF[0] = x;
    this.lookF[1] = y;
    this.lookF[2] = z;
    this.tgt[LOOK] = w;
  }

  private lookBall(w: number): void {
    const b = this.onFinger ? this.ballLast : this.ballF;
    this.lookAtFig(b[0], b[1], b[2], w);
  }

  /** Small life in every pose: breathing and a soft sway. */
  private breathe(k = 1): void {
    const c = this.tgt;
    const t = this.time;
    c[RY] += 0.006 * Math.sin(t * 2.3) * k;
    c[TPITCH] -= 0.014 * Math.sin(t * 2.3 + 0.6) * k;
    c[RROLL] += 0.01 * Math.sin(t * 0.9) * k;
    c[HROLL] += 0.03 * Math.sin(t * 0.7 + 1) * k;
  }

  /** The ball's position for this frame has been worked out: carry over any jump from the last frame and let it fade. */
  private carry(source: number): void {
    const b = this.ballF;
    if (!this.ballInit) {
      this.ballInit = true;
      this.ballOff.fill(0);
    } else if (this.ballFresh || source !== this.ballSource) {
      for (let k = 0; k < 3; k++) this.ballOff[k] = this.ballLast[k] - b[k];
    }
    this.ballFresh = false;
    this.ballSource = source;
    for (let k = 0; k < 3; k++) b[k] += this.ballOff[k];
  }

  private setBall(x: number, y: number, z: number): void {
    const b = this.ballF;
    b[0] = x;
    b[1] = y;
    b[2] = z;
    this.carry(0);
  }

  private setSpin(x: number, y: number, z: number): void {
    this.spinF[0] = x;
    this.spinF[1] = y;
    this.spinF[2] = z;
  }

  /** Both hands on the ball, gripping. */
  private holdShow(): void {
    this.holdTwo();
    this.grip = 3;
    this.contact |= 3;
  }

  /** One hand at a point (figure space), gripping the ball there. */
  private gripHand(side: number, x: number, y: number, z: number): void {
    this.hand(side, x, y, z);
    this.grip |= side > 0 ? 1 : 2;
    this.contact |= side > 0 ? 1 : 2;
  }

  /** Where a relaxed hand hangs, moved with the body. */
  private restHand(side: number, out: Float64Array): void {
    this.bodyPt(side * 0.315, 0.47, 0.04, out);
  }

  /** A landing that has not been felt yet gives the body a squash. */
  private land(count: number, kick: number): void {
    if (count > this.lands) {
      this.lands = count;
      this.impulse(kick);
    }
  }

  /** A quick step that starts at `t0`: 0 before, 1 after. */
  private stepK(t: number, t0: number): number {
    return smooth((t - t0) / 0.16);
  }

  /** The act's lift off the floor: a hop of `h` between `t0` and `t1`. */
  private hop(t: number, t0: number, t1: number, h: number): number {
    if (t <= t0 || t >= t1) return 0;
    const u = (t - t0) / (t1 - t0);
    return 4 * h * u * (1 - u);
  }

  /**
   * Pose one frame of a warm-up act.
   * Fills `ball`, `spin`, `contact`, `planted`, `hidden`, `lift` and the placement fields as well as the bones.
   */
  updateShow(f: ShowFrame, bones: Float32Array): void {
    const dt = Math.min(0.05, Math.max(0, f.dt));
    this.sf = f;
    this.time = f.time + this.variant * 0.37;
    this.t = f.t;

    // squash and stretch spring
    this.sqV += (-this.sq * 320 - this.sqV * 22) * dt;
    this.sq = clamp(this.sq + this.sqV * dt, -0.2, 0.2);

    this.cs = Math.cos(f.facing);
    this.sn = Math.sin(f.facing);
    this.speed = 0;
    this.vn = 0;
    this.moveW = 0;
    this.sprint = false;
    this.turn = 0;
    this.lastFacing = f.facing;
    if (f.index !== this.showIndex) {
      this.showIndex = f.index;
      this.lands = 0;
      this.ballFresh = true;
    }
    this.hasBall = f.hasBall;
    this.grip = 0;
    this.contact = 0;
    this.planted = 3;
    this.lift = 0;
    this.hidden = false;
    this.onFinger = false;
    this.palm = 0;
    this.fingerMix = 1;
    this.ballSquash = 1;
    this.setSpin(0, 0, 0);
    const kd = Math.exp(-dt * 14);
    for (let k = 0; k < 3; k++) this.ballOff[k] *= kd;

    // placement (the act may lift the figure; the height is applied below)
    const b = this.build;
    const sqv = 1 + this.sq;
    this.sx = (b.height * b.bulk) / Math.sqrt(sqv);
    this.sy = b.height * sqv;
    this.ox = f.x;
    this.oz = f.z;
    this.px = f.x;
    this.pz = f.z;
    this.yaw = Math.PI / 2 - f.facing;

    this.stand();
    this.breathe();
    this.showPose(f);

    this.oy = this.lift;
    this.py = this.lift;
    if (this.lookFig) {
      this.toWorld(this.lookF[0], this.lookF[1], this.lookF[2], v3);
      this.lookX = v3[0];
      this.lookY = v3[1];
      this.lookZ = v3[2];
    }

    // the body's speed, for the hair
    const c = this.tgt;
    const idt = dt > 0 ? 1 / dt : 0;
    const vy = (this.lift - this.prevLift) * idt;
    const vF = (c[RZ] - this.prevRZ) * idt;
    const vL = (c[RX] - this.prevRX) * idt;
    this.prevLift = this.lift;
    this.prevRX = c[RX];
    this.prevRZ = c[RZ];

    this.guard = true;
    this.finish(bones, f.index, dt, f.time, clamp(vF, -6, 6), clamp(vL, -6, 6), clamp(vy, -8, 8), -this.lift / this.sy);

    if (!f.hasBall) return;
    if (this.onFinger) {
      // the ball sits on the lead hand's fingertip, wherever the hand ended up
      const ro = f.hand > 0 ? 0 : 7;
      const hd = this.hands;
      const reach = HAND_TIP * hd[ro + 6] + BALL_R * 0.96;
      const bf = this.ballF;
      const mix = this.fingerMix;
      const ex = bf[0];
      const ey = bf[1];
      const ez = bf[2];
      bf[0] = hd[ro] + hd[ro + 3] * reach;
      bf[1] = hd[ro + 1] + hd[ro + 4] * reach;
      bf[2] = hd[ro + 2] + hd[ro + 5] * reach;
      const p = this.palm;
      if (p > 0) {
        // low in front, it sits on the palm: over the hand, whichever way the fingers point
        bf[0] = lerp(bf[0], hd[ro] + hd[ro + 3] * 0.07, p);
        bf[1] = lerp(bf[1], hd[ro + 1] + hd[ro + 4] * 0.07 + BALL_R + 0.03, p);
        bf[2] = lerp(bf[2], hd[ro + 2] + hd[ro + 5] * 0.07, p);
        // rolling from the fingertip to the palm it would cut through the hand: keep it a ball's radius off the hand, all the way along
        const tip = HAND_TIP * hd[ro + 6];
        const ax = bf[0] - hd[ro];
        const ay = bf[1] - hd[ro + 1];
        const az = bf[2] - hd[ro + 2];
        const along = clamp(ax * hd[ro + 3] + ay * hd[ro + 4] + az * hd[ro + 5], 0, tip);
        const dx = ax - hd[ro + 3] * along;
        const dy = ay - hd[ro + 4] * along;
        const dz = az - hd[ro + 5] * along;
        const dl = Math.hypot(dx, dy, dz);
        const need = lerp(BALL_R * 0.96, BALL_R + 0.03, p);
        if (dl < need && dl > 1e-6) {
          const k = need / dl - 1;
          bf[0] += dx * k;
          bf[1] += dy * k;
          bf[2] += dz * k;
        }
      }
      if (mix < 1) {
        bf[0] = lerp(ex, bf[0], mix);
        bf[1] = lerp(ey, bf[1], mix);
        bf[2] = lerp(ez, bf[2], mix);
      }
      this.carry(mix < 1 ? 0 : 1);
    }
    const bf = this.ballF;
    // the floor in figure space: figures come in different heights, the ball and the floor do not
    const floor = (BALL_R - this.lift) / this.sy;
    if (bf[1] < floor) bf[1] = floor;
    this.ballLast[0] = bf[0];
    this.ballLast[1] = bf[1];
    this.ballLast[2] = bf[2];
    this.toWorld(bf[0], bf[1], bf[2], this.ball);
    // spin into the world: a direction, so no placement offset
    const s = this.spinF;
    this.spin[0] = s[0] * this.sn + s[2] * this.cs;
    this.spin[1] = s[1];
    this.spin[2] = s[2] * this.sn - s[0] * this.cs;
    this.ballSquash = 1 - 0.13 * clamp01(1 - (this.ball[1] - BALL_R) / 0.035);
  }

  private showPose(f: ShowFrame): void {
    switch (f.act) {
      case 'enter':
        this.actEnter(f);
        break;
      case 'hey':
        this.actHey(f);
        break;
      case 'spin':
        this.actSpin(f);
        break;
      case 'pound':
        this.actDribble(f, f.hand > 0 ? POUND_L : POUND_R, POUND, true);
        break;
      case 'dribble':
        this.actDribble(f, f.hand > 0 ? EASY_L : EASY_R, EASY, false);
        break;
      case 'toss':
        this.actToss();
        break;
      case 'hip':
        this.actHip(f);
        break;
      case 'overhead':
        this.actOverhead(f);
        break;
      case 'shootUp':
        this.actShootUp(f);
        break;
      case 'armCross':
        this.actArmCross();
        break;
      case 'reach':
        this.actReach();
        break;
      case 'toeTouch':
        this.actToeTouch();
        break;
      case 'quad':
        this.actQuad();
        break;
      case 'twist':
        this.actTwist();
        break;
      case 'hops':
        this.actHops();
        break;
    }
  }

  // --- acts ------------------------------------------------------------------------

  /** Drop in from above and land on the base. */
  private actEnter(f: ShowFrame): void {
    const c = this.tgt;
    const t = this.t;
    const t0 = f.dur - ENTER_FALL - ENTER_SETTLE;
    if (t < t0) {
      this.hidden = true;
      this.lift = 40;
      this.planted = 0;
      if (f.hasBall) {
        this.setBall(0, 0.86, 0.42);
        this.holdShow();
      }
      return;
    }
    const u = (t - t0) / ENTER_FALL;
    const air = u < 1 ? 1 : 0;
    if (u < 1) {
      this.lift = ENTER_DROP * (1 - u * u);
      this.planted = 0;
    } else {
      this.land(1, -3);
    }
    const after = Math.max(0, t - t0 - ENTER_FALL);
    // knees take the landing, then the body springs back up
    const give = air ? 0 : Math.exp(-after * 7) * Math.sin(Math.min(Math.PI, after * 9 + 0.6));
    c[RY] -= 0.11 * give + 0.02 * air;
    c[RPITCH] += 0.08 * give;
    c[KL] = 0.2 * give;
    c[KR] = 0.2 * give;
    const tuck = air * Math.sin(Math.PI * clamp01(u * 1.1));
    for (let side = 1; side >= -1; side -= 2) this.foot(side, side * (STANCE + 0.01), ANKLE + 0.07 * tuck, 0.03 * tuck, 0.5 * tuck, side * 0.14);
    if (f.hasBall) {
      const k = smooth(after / 0.45);
      this.setBall(0, lerp(0.86, HOLD_Y, k), lerp(0.42, HOLD_Z, k));
      this.holdShow();
      this.setSpin(0, 3 * air, 0);
    } else {
      // arms up on the way down, then swing back to the sides (wide of the big head: the arms are short)
      const up = air ? 1 : Math.max(0, 1 - after / 0.35);
      for (let side = 1; side >= -1; side -= 2) {
        this.hand(side, side * lerp(0.315, 0.58, up), lerp(0.47, 1.24, smooth(up)), lerp(0.04, 0.14, up));
        this.pole(side, side, -0.3, -0.5);
      }
    }
    c[EYE] = air ? 1.05 : 1;
    if (air) this.lookAtFig(0, -1, 1.2, 0.5);
    else this.lookCam(lerp(0.4, 0.8, smooth(after / 0.3)));
  }

  /** A tap: a hop toward the camera, then a wave (or a flex with both arms free). */
  private actHey(f: ShowFrame): void {
    const c = this.tgt;
    const t = this.t;
    this.lift = this.hop(t, 0.14, 0.5, 0.2);
    const air = this.lift > 0 ? 1 : 0;
    if (t >= 0.5) this.land(1, -2.2);
    if (air) this.planted = 0;
    const dip = Math.sin(Math.PI * clamp01(t / 0.16)) + 0.8 * Math.exp(-Math.max(0, t - 0.5) * 9) * (t > 0.5 ? 1 : 0);
    c[RY] -= 0.06 * dip;
    c[RPITCH] += 0.06 + 0.04 * dip;
    const tuck = Math.sin(Math.PI * clamp01((t - 0.14) / 0.36));
    for (let side = 1; side >= -1; side -= 2) this.foot(side, side * STANCE, ANKLE + 0.06 * tuck, 0.02 * tuck, 0.5 * tuck, side * 0.14);
    const on = smooth((t - 0.1) / 0.2) * (1 - smooth((t - 1.25) / 0.3));
    const s = f.hand;
    const flex = !f.hasBall && f.variety % 2 === 1;
    if (flex) {
      const pump = Math.sin(t * 15) * on;
      for (let side = 1; side >= -1; side -= 2) {
        this.hand(side, side * lerp(0.315, 0.45, on), lerp(0.47, 1.02 + 0.03 * pump * side, on), lerp(0.04, 0.08, on));
        this.pole(side, side, -1, 0.1);
        this.wrist(side, -0.3 * on);
      }
      c[TROLL] += 0.05 * pump;
    } else {
      // the free hand waves
      const w = f.hasBall ? -s : s;
      const wig = Math.sin((t - 0.3) * 17) * on;
      // out past the big head, elbow out, so the arm never crosses the face or the hair
      const wx = w * lerp(0.315, 0.6 + 0.06 * wig, on);
      const wy = lerp(0.47, 1.36, on);
      const wz = lerp(0.04, 0.2, on);
      this.pole(w, w, -0.4, -0.35);
      this.wrist(w, -0.35 * on);
      // leaning away from the raised arm, as anyone does, keeps the big head out of its way
      c[TROLL] += w * 0.05 * on;
      c[HROLL] += w * 0.04 * on;
      if (f.hasBall) {
        fShowP[0] = wx;
        fShowP[1] = wy;
        fShowP[2] = wz;
        this.tuckBall(s, smooth(t / 0.22) * (1 - smooth((t - 1.3) / 0.28)), fShowP);
      } else {
        this.hand(w, wx, wy, wz);
        this.hand(-w, -w * 0.33, 0.52, 0.08);
      }
    }
    c[EYE] = lerp(1, 0.72, on);
    c[EYEB] = 1 + 0.06 * on;
    this.lookCam(0.95);
  }

  /**
   * The ball on the hip on side `s`: `k` is 0 at the hold and 1 on the hip.
   * The other hand lets go once the ball is on its way and goes to `free`
   * (figure space; its own hip when null).
   */
  private tuckBall(s: number, k: number, free: Float64Array | null): void {
    const o = -s;
    this.rootPt(s * 0.4, 0.55, 0.07, v3b);
    const e = smooth(k);
    // a little lift and a swing out to the front on the way, so it goes round the side rather than through the belly
    const arc = Math.sin(Math.PI * e);
    this.setBall(lerp(HOLD_X, v3b[0], e), lerp(HOLD_Y, v3b[1], e) + 0.08 * arc, lerp(HOLD_Z, v3b[2], e) + 0.12 * arc);
    const bl = this.ballF;
    // the lead hand slides from the side of the ball over the top of it, pressing it to the hip
    this.gripHand(s, bl[0] + s * lerp(0.15, 0.08, e), bl[1] + lerp(-0.02, 0.14, e), bl[2] + lerp(-0.06, 0.03, e));
    this.pole(s, s, lerp(-0.55, 0.1, e), lerp(-0.35, -0.6, e));
    this.wrist(s, lerp(0.25, 0.7, e));
    // it lets go early and takes the ball back late, so it never reaches across the belly to the far hip
    const away = smooth((k - 0.2) / 0.4);
    const gx = bl[0] + o * 0.15;
    const gy = bl[1] - 0.02;
    const gz = bl[2] - 0.06;
    if (away < 0.002) {
      this.gripHand(o, gx, gy, gz);
      this.pole(o, o, -0.55, -0.35);
      this.wrist(o, 0.25);
      return;
    }
    // the free hand swings out and forward on its way, round the belly and the hip
    const bow = Math.sin(Math.PI * away);
    if (free) {
      this.hand(o, lerp(gx, free[0], away) + o * 0.1 * bow, lerp(gy, free[1], away), lerp(gz, free[2], away) + 0.08 * bow);
      return;
    }
    this.rootPt(o * 0.29, 0.57, -0.01, v3b);
    this.hand(o, lerp(gx, v3b[0], away) + o * 0.1 * bow, lerp(gy, v3b[1], away), lerp(gz, v3b[2], away) + 0.08 * bow);
    this.pole(o, o, lerp(-0.55, 0.05, away), lerp(-0.35, -0.5, away));
    this.wrist(o, lerp(0.25, 0.5, away));
  }

  /** Ball on the hip, weight on one leg, a look and a nod at the camera. */
  private actHip(f: ShowFrame): void {
    const c = this.tgt;
    const t = this.t;
    const s = f.hand;
    const o = -s;
    const k = t < 1.5 ? smooth(t / 0.6) : 1 - smooth((t - (f.dur - 0.62)) / 0.58);
    const pose = smooth((t - 0.25) / 0.5) * (1 - smooth((t - (f.dur - 0.75)) / 0.5));
    // hip pops out on the ball's side, the shoulders lean the other way
    c[RX] += s * 0.035 * pose;
    c[RROLL] += s * 0.05 * pose;
    c[TROLL] -= s * 0.035 * pose;
    c[RYAW] += -s * 0.08 * pose;
    // the other leg relaxes: knee in, heel up
    this.foot(o, o * (STANCE + 0.025 * pose), ANKLE + 0.012 * pose, 0.05 * pose, 0.32 * pose, o * 0.2);
    if (pose > 0.02) this.planted = s > 0 ? 1 : 2;
    c[s > 0 ? KR : KL] = -0.12 * pose;
    const nod = Math.sin(Math.PI * clamp01((t - 1.55) / 0.42));
    c[HPITCH] += 0.13 * nod;
    c[HROLL] += -s * 0.1 * pose;
    this.tuckBall(s, k, null);
    if (t > 0.9 && t < 1.4 && f.side !== 0) this.lookPal(0.8);
    else this.lookCam(0.95);
    c[EYE] = 1 - 0.18 * nod;
  }

  /**
   * The signature move: the ball spinning on a raised finger out by the side of
   * the head (the only place it clears the head with these arms). Twice the
   * hand brings it down in front of the chest, still spinning on the palm, for
   * the other hand to brush it faster.
   */
  private actSpin(f: ShowFrame): void {
    const c = this.tgt;
    const t = this.t;
    const s = f.hand;
    const o = -s;
    const end = f.dur;
    const tDown = end - 1.15;
    const tCatch = end - 0.6;
    // spin rate: a fast start, slowly dying away, topped up by each brush of the other hand
    let rate = 27 * Math.exp(-0.16 * Math.max(0, t - SPIN_ON));
    for (const tb of SPIN_BRUSH) if (t > tb + 0.05) rate += 11 * Math.exp(-0.16 * (t - tb - 0.05)) * smooth((t - tb - 0.05) / 0.1);
    rate *= smooth((t - SPIN_POP) / 0.2);
    if (t > tCatch) rate *= Math.exp(-(t - tCatch) * 5);

    // the raised hand by the side of the head, with a little balancing wobble
    const wob = smooth((t - SPIN_ON) / 0.4);
    // (hand targets are the tip of the hand: the upper arm out level, the forearm up and a little out, so the ball clears the head)
    const hx = s * (0.6 + 0.016 * Math.sin(t * 6.3) * wob);
    const hy = 1.0 + 0.012 * Math.sin(t * 4.7 + 1) * wob;
    const hz = 0.12 + 0.014 * Math.cos(t * 5.6) * wob;
    // the low hand in front of the chest, palm up under the ball
    const px = s * 0.15;
    const py = 0.55;
    const pz = 0.4;

    if (t < SPIN_LOAD) {
      // gather: both hands bring the ball up in front of the chest
      const u = smooth(t / SPIN_LOAD);
      this.setBall(lerp(HOLD_X, px, u), lerp(HOLD_Y, SPIN_PALM_Y, u) - 0.03 * Math.sin(Math.PI * u), lerp(HOLD_Z, pz + 0.06, u));
      this.holdShow();
      c[RY] -= 0.03 * Math.sin(Math.PI * u);
      c[TYAW] += s * 0.08 * u;
      this.lookBall(0.8);
      return this.spinAxis(s, rate, t);
    }
    if (t < SPIN_ON) {
      // the flick: the ball pops up and out round the side of the head and lands on the fingertip
      const u = (t - SPIN_LOAD) / (SPIN_ON - SPIN_LOAD);
      const e = smooth(u);
      this.setBall(bez(px, s * 0.8, s * 0.66, e), bez(SPIN_PALM_Y, 1.12, 1.07, e), bez(pz + 0.06, 0.48, 0.18, e));
      // it settles onto the fingertip wherever the hand really is
      this.onFinger = true;
      this.fingerMix = smooth((u - 0.5) / 0.5);
      const lead = smooth(u / 0.8);
      this.hand(s, bez(px, s * 0.62, hx, lead), bez(py, 0.7, hy, lead), bez(pz, 0.36, hz, lead));
      this.pole(s, s * lerp(0.5, 0.2, lead), -1, -0.25);
      this.wrist(s, 0);
      this.hand(o, lerp(px + o * 0.15, o * 0.33, lead), lerp(SPIN_PALM_Y - 0.02, 0.6, lead), lerp(pz, 0.2, lead));
      this.pole(o, o, -0.5, -0.5);
      c[TYAW] += s * 0.08;
      c[RY] += 0.012 * Math.sin(Math.PI * u);
      this.lookBall(0.6);
      return this.spinAxis(s, rate, t);
    }
    if (t < tCatch) {
      this.onFinger = true;
      // how far the hand has come down to the front: for each brush, and to finish
      let front = smooth((t - tDown) / (tCatch - tDown - 0.05));
      let bt = -9;
      for (const tb of SPIN_BRUSH) {
        const k = smooth((t - (tb - 0.55)) / 0.42) * (1 - smooth((t - (tb + 0.32)) / 0.42));
        if (k > front) front = k;
        if (t > tb - 0.6 && t < tb + 0.8) bt = t - tb;
      }
      this.palm = front;
      // on the fingertip up high, on the palm down low; in between it is rolling from one to the other
      if (front < 0.02) this.contact |= 4;
      else if (front > 0.98) this.contact |= s > 0 ? 1 : 2;
      // out and forward first, then in, so the ball swings wide of the face
      this.hand(s, bez(hx, s * 0.6, px, front), bez(hy, 0.68, py, front), bez(hz, 0.44, pz, front));
      this.pole(s, s * lerp(0.2, 0.5, front), -1, lerp(-0.25, -0.35, front));
      this.wrist(s, 0);
      c[TYAW] += s * 0.06 * (1 - front);
      // the other hand: relaxed, or brushing the side of the ball while it is low
      const brush = bt > -9 ? smooth((bt + 0.22) / 0.16) * (1 - smooth((bt - 0.2) / 0.22)) * front : 0;
      const bl = this.ballLast;
      const sweep = clamp01((bt + 0.1) / 0.3);
      const gx = o * 0.32 + 0.01 * Math.sin(t * 2);
      const gy = 0.6 + 0.015 * Math.sin(t * 3.1);
      const gz = 0.2;
      this.hand(o, lerp(gx, bl[0] + o * (BALL_R + 0.05), brush), lerp(gy, bl[1] - 0.03, brush), lerp(gz, bl[2] + lerp(-0.1, 0.12, sweep), brush));
      this.pole(o, o, -0.6, -0.4);
      this.wrist(o, lerp(0.1, -0.2, brush));
      c[TYAW] += s * 0.05 * brush;
      c[RY] += -0.012 + 0.008 * Math.sin(t * 5.2);
      c[RX] += o * 0.015 * (1 - front);
      c[RROLL] += o * 0.03 * (1 - front);
      // eyes on the ball, then a proud look at the camera between the brushes
      const camA = t > SPIN_ON + 0.9 && t < SPIN_BRUSH[0] - 0.7;
      const camB = t > SPIN_BRUSH[1] + 0.7 && t < tDown;
      if ((camA || camB) && front < 0.05) this.lookCam(0.9);
      else this.lookBall(lerp(0.45, 0.85, front));
      c[EYEB] = camA || camB ? 1.05 : 1;
      return this.spinAxis(s, rate, t);
    }
    // the other hand takes it, and both bring it down to the hold
    const u = smooth((t - tCatch) / (end - tCatch - 0.05));
    const take = smooth((t - tCatch) / 0.18);
    this.setBall(lerp(px, HOLD_X, u), lerp(SPIN_PALM_Y, HOLD_Y, u), lerp(pz + 0.06, HOLD_Z, u));
    const bl = this.ballF;
    this.gripHand(s, lerp(bl[0], bl[0] + s * 0.15, take), lerp(bl[1] - 0.2, bl[1] - 0.02, take), lerp(bl[2] - 0.06, bl[2] - 0.06, take));
    this.pole(s, s, -0.55, lerp(-0.45, -0.35, take));
    this.wrist(s, lerp(0.05, 0.25, take));
    this.hand(o, lerp(o * 0.32, bl[0] + o * 0.15, take), lerp(0.6, bl[1] - 0.02, take), lerp(0.2, bl[2] - 0.06, take));
    if (take > 0.98) this.gripHand(o, bl[0] + o * 0.15, bl[1] - 0.02, bl[2] - 0.06);
    this.pole(o, o, -0.55, -0.35);
    this.wrist(o, 0.25);
    this.lookCam(0.8);
    this.spinAxis(s, rate, t);
  }

  /** The spinning ball's axis leans and slowly circles, the way a ball on a finger does. */
  private spinAxis(s: number, rate: number, t: number): void {
    if (rate <= 0.01) return;
    const ph = t * 2.4;
    const ax = 0.13 * Math.cos(ph);
    const az = 0.13 * Math.sin(ph);
    const l = Math.hypot(ax, 1, az);
    this.setSpin((-s * rate * ax) / l, (-s * rate) / l, (-s * rate * az) / l);
  }

  /** A dribble in place: `pound` is the hard, low one with crossovers. */
  private actDribble(f: ShowFrame, pat: readonly Bounce[], st: DribbleStyle, pound: boolean): void {
    const c = this.tgt;
    const t = this.t;
    const info = this.dInfo;
    dribbleAt(pat, st, t, this.ballF, info);
    // the pattern bounces at the ball's radius; move the low part of the path so it meets the floor at any figure height
    const floor = BALL_R / this.sy;
    this.ballF[1] += (floor - BALL_R) * (1 - clamp01((this.ballF[1] - BALL_R) / (st.top - BALL_R)));
    this.carry(0);
    const bl = this.ballF;
    // the ball is the same size for every figure, so in figure space it is bigger on a small one
    const br = BALL_R / this.sy;
    if (info.i < 0 || info.i >= pat.length) {
      this.holdShow();
    } else {
      for (let h = 1; h >= -1; h -= 2) {
        const fromMe = info.from === h || info.from === 0;
        const toMe = info.to === h || info.to === 0;
        let w: number;
        if (info.from === h && info.to === h) w = 1;
        else if (info.leg === 0) w = fromMe ? 1 - smooth((info.s - 0.2) / 0.55) : 0;
        else w = toMe ? smooth((info.s - 0.05) / 0.5) : 0;
        const atHold = (info.leg === 0 && info.from === 0) || (info.leg === 1 && info.to === 0);
        let rx: number;
        let ry: number;
        let rz: number;
        if (atHold) {
          rx = bl[0] + h * 0.15;
          ry = bl[1] - 0.02;
          rz = bl[2] - 0.06;
        } else {
          rx = bl[0] + h * 0.02;
          // the palm rides on top of the ball, the fingers over it
          ry = softMax(bl[1] + br + 0.04, st.handLow, 0.05);
          rz = bl[2] - 0.03;
        }
        const gx = h * 0.34;
        const gy = 0.66 + 0.02 * Math.sin(this.time * 3 + h);
        const gz = 0.24;
        this.hand(h, lerp(gx, rx, w), lerp(gy, ry, w), lerp(gz, rz, w));
        this.pole(h, h * 0.9, lerp(-0.5, atHold ? -0.55 : 0.15, w), lerp(-0.5, -0.5, w));
        this.wrist(h, lerp(0.15, atHold ? 0.25 : 0.75, w));
        const touching = atHold || bl[1] + br + 0.04 >= st.handLow + 0.025;
        if (w > 0.999) {
          this.grip |= h > 0 ? 1 : 2;
          if (touching) this.contact |= h > 0 ? 1 : 2;
        }
      }
    }
    // the body rides the rhythm: down with each push, knees soft
    const low = clamp01(1 - (bl[1] - BALL_R) / (st.top - BALL_R));
    const inPlay = info.i >= 0 && info.i < pat.length ? 1 : 0;
    const settle = smooth(t / 0.3) * (1 - smooth((t - (f.dur - 0.35)) / 0.35));
    const crouch = (pound ? 0.045 : 0.025) * settle;
    c[RY] -= crouch + (pound ? 0.028 : 0.016) * low * inPlay;
    c[TPITCH] += (pound ? 0.13 : 0.07) * settle;
    c[RPITCH] += (pound ? 0.05 : 0.03) * settle;
    c[KL] = 0.1 * settle;
    c[KR] = 0.1 * settle;
    const lean = clamp(bl[0] / st.side, -1, 1) * inPlay;
    c[RX] += 0.022 * lean;
    c[TROLL] += -0.04 * lean;
    c[TYAW] += 0.1 * lean;
    // a little step out to a wider stance at the start, and back in at the end: a foot only moves while it is up
    for (let side = 1; side >= -1; side -= 2) {
      const first = side === f.hand ? 0 : 0.14;
      const out = this.stepK(t, 0.06 + first);
      const back = this.stepK(t, f.dur - 0.5 + first);
      const k = out * (1 - back);
      const moving = (out > 0 && out < 1) || (back > 0 && back < 1);
      const up = moving ? Math.sin(Math.PI * (out < 1 ? out : back)) : 0;
      this.foot(side, side * (STANCE + 0.03 * k), ANKLE + 0.035 * up, 0.02 * k * side * f.hand, 0.2 * up, side * 0.2);
      if (moving) this.planted &= side > 0 ? 2 : 1;
    }
    const crossing = inPlay && info.from !== info.to && info.from !== 0 && info.to !== 0;
    if (t < 0.9 || crossing || t > f.dur - 0.5) this.lookBall(0.75);
    else this.lookCam(0.85);
    this.setSpin(info.leg === 0 ? -5 : 4, 0, 0);
  }

  /** Toss it high, watch it, catch it. */
  private actToss(): void {
    const c = this.tgt;
    const t = this.t;
    const v0 = launchSpeed(0.56, TOSS_REL, TOSS_PUSH);
    const g = (v0 * v0) / (2 * TOSS_APEX);
    const tRel = TOSS_DIP + TOSS_PUSH;
    const tCatch = tRel + flightTimeDown(TOSS_REL, v0, g, TOSS_CATCH);
    if (t < TOSS_DIP) {
      const u = smooth(t / TOSS_DIP);
      this.setBall(0, lerp(HOLD_Y, 0.56, u), lerp(HOLD_Z, 0.44, u));
      this.holdShow();
      c[RY] -= 0.075 * u;
      c[RPITCH] += 0.06 * u;
      c[KL] = 0.12 * u;
      c[KR] = 0.12 * u;
      this.lookCam(lerp(0.85, 0.3, u));
    } else if (t < tRel) {
      const u = t - TOSS_DIP;
      this.setBall(0, launchY(0.56, TOSS_REL, TOSS_PUSH, u), 0.44 + 0.06 * (u / TOSS_PUSH));
      this.holdShow();
      const e = smooth(u / TOSS_PUSH);
      c[RY] -= 0.075 * (1 - e) - 0.02 * e;
      c[RPITCH] += 0.06 * (1 - e) - 0.04 * e;
      for (let side = 1; side >= -1; side -= 2) this.foot(side, side * STANCE, ANKLE + 0.025 * e, -0.02 * e, 0.45 * e, side * 0.14);
      this.planted = 0;
      this.lookBall(0.7);
    } else {
      const ft = t - tRel;
      let y: number;
      let z = 0.5;
      if (t < tCatch) {
        y = flightY(TOSS_REL, v0, g, ft);
        this.setSpin(-8, 0.6, 0);
      } else {
        // the catch: the hands give with the ball, then bring it in to the belly
        const ct = t - tCatch;
        const vc = g * (tCatch - tRel) - v0;
        const absorb = Math.min(ct, TOSS_GIVE);
        const s = absorb / TOSS_GIVE;
        const depth = (vc * TOSS_GIVE) / 2;
        y = TOSS_CATCH - depth * (1 - (1 - s) * (1 - s));
        const back = smooth((ct - TOSS_GIVE) / 0.45);
        y = lerp(y, HOLD_Y, back);
        z = lerp(0.5, HOLD_Z, back);
        this.land(1, -1.3);
      }
      this.setBall(0, y, z);
      const ready = smooth((t - (tCatch - 0.42)) / 0.3);
      if (t >= tCatch) {
        this.holdShow();
      } else {
        // follow-through up, then hands open, waiting under it
        const follow = 1 - smooth(ft / 0.35);
        for (let side = 1; side >= -1; side -= 2) {
          const fx = side * 0.2;
          const fy = 1.08 * follow + 0.9 * (1 - follow);
          const fz = 0.48;
          this.hand(side, lerp(fx, side * 0.15, ready), lerp(fy, TOSS_CATCH - 0.02, ready), lerp(fz, 0.5 - 0.06, ready));
          this.pole(side, side, -0.55, -0.35);
          this.wrist(side, lerp(-0.2, 0.25, ready));
        }
      }
      const give = t >= tCatch ? Math.sin(Math.PI * clamp01((t - tCatch) / 0.4)) : 0;
      const rise = (1 - smooth(ft / 0.2)) * 1;
      c[RY] += 0.02 * rise - 0.06 * give;
      c[RPITCH] -= 0.04 * rise;
      c[KL] = 0.1 * give;
      c[KR] = 0.1 * give;
      if (ft < 0.16) {
        for (let side = 1; side >= -1; side -= 2) this.foot(side, side * STANCE, ANKLE + 0.025 * rise, -0.02 * rise, 0.45 * rise, side * 0.14);
        this.planted = 0;
      }
      if (t < tCatch + 0.3) this.lookBall(1);
      else this.lookCam(0.95);
      c[EYEB] = t < tCatch ? 1.07 : 1;
    }
  }

  /**
   * Ball held up high on one palm, leaning over to the other side, then down
   * through both hands and up on the other side. Up high is out past the ear:
   * these arms cannot hold it over the top of the head without crossing the face.
   */
  private actOverhead(f: ShowFrame): void {
    const c = this.tgt;
    const t = this.t;
    const half = f.dur / 2;
    const a = t < half ? f.hand : -f.hand;
    const o = -a;
    const lt = t < half ? t : t - half;
    const up = smooth(lt / 0.6);
    const down = smooth((lt - (half - 0.55)) / 0.5);
    const e = lt < half - 0.55 ? up : 1 - down;
    const lean = smooth((lt - 0.4) / 0.5) * (1 - smooth((lt - (half - 1.0)) / 0.45));
    const wave = 1 + 0.12 * Math.sin((lt - 0.4) * 3.1) * lean;
    // over to the side away from the ball, the raised arm going over with the shoulders
    c[TROLL] += a * 0.25 * lean * wave;
    c[RROLL] += a * 0.11 * lean;
    c[RX] += a * 0.025 * lean;
    c[RY] -= 0.01 * lean;
    this.bodyPt(a * 0.68, 1.28, 0.1, v3b);
    this.setBall(bez(HOLD_X, a * 0.66, v3b[0], e), bez(HOLD_Y, 0.8, v3b[1], e), bez(HOLD_Z, 0.44, v3b[2], e));
    const bl = this.ballF;
    // the raised hand goes from the side of the ball to under it
    const under = smooth(e / 0.55);
    this.gripHand(a, bl[0] + a * lerp(0.15, 0.03, under), bl[1] - lerp(0.02, BALL_R + 0.05, under), bl[2] - lerp(0.06, 0.03, under));
    this.pole(a, a, lerp(-0.55, -0.6, under), lerp(-0.35, -0.2, under));
    this.wrist(a, lerp(0.25, 0, under));
    // the other hand lets go once the ball is on its way and goes to the hip
    const away = smooth((e - 0.08) / 0.3);
    const gx = bl[0] + o * 0.15;
    const gy = bl[1] - 0.02;
    const gz = bl[2] - 0.06;
    if (away < 0.002) {
      this.gripHand(o, gx, gy, gz);
      this.pole(o, o, -0.55, -0.35);
      this.wrist(o, 0.25);
    } else {
      this.rootPt(o * 0.29, 0.57, -0.01, v3);
      this.hand(o, lerp(gx, v3[0], away), lerp(gy, v3[1], away), lerp(gz, v3[2], away));
      this.pole(o, o, lerp(-0.55, 0.05, away), lerp(-0.35, -0.5, away));
      this.wrist(o, lerp(0.25, 0.5, away));
    }
    this.setSpin(0, 0, 0);
    if (lean > 0.5) this.lookCam(0.9);
    else this.lookBall(0.55);
    c[EYE] = 1 - 0.12 * lean;
  }

  /**
   * A shot straight up: the ball set on the shooting hand out by the ear, a dip,
   * the push with the legs, a goose-neck follow-through, and both hands catch it
   * in front of the chest as it comes down.
   */
  private actShootUp(f: ShowFrame): void {
    const c = this.tgt;
    const t = this.t;
    const s = f.hand;
    const o = -s;
    const v0 = launchSpeed(SHOT_SET - 0.06, SHOT_REL, SHOT_PUSH);
    const g = (v0 * v0) / (2 * SHOT_APEX);
    const tRel = SHOT_DIP + SHOT_PUSH;
    const tCatch = tRel + flightTimeDown(SHOT_REL, v0, g, SHOT_CATCH);
    const tTop = v0 / g;
    const x = s * 0.68;
    const z = 0.2;
    const cx = s * 0.08;
    const cz = 0.56;
    if (t < SHOT_GATHER) {
      // round the outside, never past the face
      const u = smooth(t / SHOT_GATHER);
      this.setBall(bez(HOLD_X, s * 0.6, x, u), bez(HOLD_Y, 0.74, SHOT_SET, u), bez(HOLD_Z, 0.5, z, u));
    } else if (t < SHOT_DIP) {
      const u = smooth((t - SHOT_GATHER) / (SHOT_DIP - SHOT_GATHER));
      this.setBall(x, SHOT_SET - 0.06 * u, z);
      c[RY] -= 0.07 * u;
      c[RPITCH] += 0.05 * u;
      c[KL] = 0.1 * u;
      c[KR] = 0.1 * u;
    } else if (t < tRel) {
      const u = t - SHOT_DIP;
      const e = smooth(u / SHOT_PUSH);
      this.setBall(x, launchY(SHOT_SET - 0.06, SHOT_REL, SHOT_PUSH, u), z);
      c[RY] -= 0.07 * (1 - e) - 0.025 * e;
      c[RPITCH] += 0.05 * (1 - e) - 0.04 * e;
      for (let side = 1; side >= -1; side -= 2) this.foot(side, side * STANCE, ANKLE + 0.03 * e, -0.02 * e, 0.5 * e, side * 0.14);
      this.planted = 0;
    } else if (t < tCatch) {
      const ft = t - tRel;
      // the little drift in over the top, done by the time it starts down, so it comes down in front of the face
      const drift = smooth(ft / tTop);
      this.setBall(lerp(x, cx, drift), flightY(SHOT_REL, v0, g, ft), lerp(z, cz, drift));
      // backspin off the fingertips
      this.setSpin(-15, 0, 0);
      const air = 1 - smooth(ft / 0.2);
      if (air > 0) {
        for (let side = 1; side >= -1; side -= 2) this.foot(side, side * STANCE, ANKLE + 0.03 * air, -0.02 * air, 0.5 * air, side * 0.14);
        this.planted = 0;
      }
    } else {
      const ct = t - tCatch;
      const vc = g * (tCatch - tRel) - v0;
      const absorb = Math.min(ct, 0.12);
      const sa = absorb / 0.12;
      const y = SHOT_CATCH - ((vc * 0.12) / 2) * (1 - (1 - sa) * (1 - sa));
      const back = smooth((ct - 0.12) / 0.55);
      this.setBall(lerp(cx, HOLD_X, back), lerp(y, HOLD_Y, back), lerp(cz, HOLD_Z, back));
      this.land(1, -1.1);
    }
    const bl = this.ballF;
    if (t < tRel) {
      // both hands take it out to the side, then the guide hand lets go and the shooting hand is under it
      const k = smooth((t - 0.08) / 0.32);
      const free = smooth((t - 0.12) / 0.25);
      // (on the back of the ball, toward the body, so the forearm comes from behind it and not through it)
      this.gripHand(s, bl[0] + s * lerp(0.11, 0.0, k), bl[1] - lerp(0.04, BALL_R + 0.03, k), bl[2] - lerp(0.11, 0.02, k));
      this.pole(s, s * lerp(1, 0.25, k), -1, -0.25);
      this.wrist(s, lerp(0.25, -0.15, k));
      if (free < 0.002) {
        this.gripHand(o, bl[0] + o * 0.15, bl[1] - 0.02, bl[2] - 0.06);
      } else {
        this.hand(o, lerp(bl[0] + o * 0.15, s * 0.05, free), lerp(bl[1] - 0.02, 0.74, free), lerp(bl[2] - 0.06, 0.3, free));
      }
      this.pole(o, o, -0.5, -0.4);
      this.wrist(o, lerp(0.25, 0.4, free));
    } else if (t < tCatch) {
      // follow-through: arm up, wrist snapped over, held; then both hands come up in front, open for the catch
      const ft = t - tRel;
      const snap = smooth(ft / 0.08);
      const ready = smooth((t - (tCatch - 0.42)) / 0.32);
      // (the hand stays where it let go, under where the ball was, and the ball leaves it)
      this.hand(s, lerp(s * 0.66, cx + s * 0.16, ready), lerp(SHOT_REL - BALL_R - 0.01, SHOT_CATCH - 0.02, ready), lerp(0.2, cz - 0.07, ready));
      this.pole(s, s * lerp(0.25, 1, ready), -1, lerp(-0.25, -0.35, ready));
      this.wrist(s, lerp(0.9 * snap, 0.25, ready));
      this.hand(o, lerp(s * 0.05, cx + o * 0.16, ready), lerp(0.74, SHOT_CATCH - 0.02, ready), lerp(0.3, cz - 0.07, ready));
      this.pole(o, o, -0.5, -0.4);
      this.wrist(o, 0.3);
    } else {
      this.holdShow();
    }
    const give = t >= tCatch ? Math.sin(Math.PI * clamp01((t - tCatch) / 0.4)) : 0;
    c[RY] -= 0.05 * give;
    c[KL] += 0.08 * give;
    c[KR] += 0.08 * give;
    c[TROLL] += -s * 0.05 * smooth(t / SHOT_GATHER) * (1 - smooth((t - tRel) / 0.4));
    if (t > 0.2 && t < tCatch + 0.25) this.lookBall(t < tRel ? 0.45 : 0.85);
    else this.lookCam(0.9);
  }

  /** Arm across the chest, held by the other arm, one side then the other. */
  private actArmCross(): void {
    const c = this.tgt;
    const t = this.t;
    for (let a = 1; a >= -1; a -= 2) {
      const w0 = a > 0 ? 0.25 : 3.35;
      const w1 = a > 0 ? 3.05 : 6.1;
      const k = smooth((t - w0) / 0.5) * (1 - smooth((t - (w1 - 0.45)) / 0.45));
      if (k <= 0) continue;
      const pulse = 0.02 * Math.sin((t - w0) * 4.2) * k;
      // the chest turns into it, bringing the stretched shoulder forward so the arm can lie across the front
      c[TYAW] -= a * 0.22 * k;
      c[TROLL] += a * 0.03 * k;
      // the stretched arm reaches straight across, in front of the chest
      this.bodyPt(-a * 0.2, 0.8, 0.45 + pulse, v3b);
      const ax = v3b[0];
      const ay = v3b[1];
      const az = v3b[2];
      this.restHand(a, v3);
      this.hand(a, lerp(v3[0], ax, k), lerp(v3[1], ay, k), lerp(v3[2], az, k));
      this.pole(a, a * 0.3, -1, -0.2);
      this.wrist(a, 0);
      // the other forearm cradles it from below near the elbow and pulls it in: it comes up once the arm is across and lets go first
      // (the whole arm stays under the stretched one, a forearm's and a hand's thickness down, so the two lie together instead of crossing through)
      const kh = smooth((t - w0 - 0.2) / 0.45) * (1 - smooth((t - (w1 - 0.8)) / 0.4));
      this.bodyPt(a * SHOULDER[0], SHOULDER[1], SHOULDER[2], v3);
      const hx = lerp(v3[0], ax, 0.45);
      const hy = lerp(v3[1], ay, 0.45) - 0.13;
      const hz = lerp(v3[2], az, 0.45) + 0.03 - pulse;
      this.restHand(-a, v3);
      this.hand(-a, lerp(v3[0], hx, kh), lerp(v3[1], hy, kh), lerp(v3[2], hz, kh));
      this.pole(-a, -a * 0.8, -1, -0.1);
      this.wrist(-a, 0.3 * kh);
      c[EYE] = 1 - 0.2 * k;
    }
    // shake out between sides
    const shake = Math.sin(Math.PI * clamp01((t - 2.95) / 0.5));
    if (shake > 0) {
      for (let side = 1; side >= -1; side -= 2) {
        const o = side > 0 ? HL : HR;
        c[o] += 0.03 * shake * Math.sin(t * 31 + side);
        c[o + 1] += 0.03 * shake * Math.sin(t * 27);
      }
      c[RY] += 0.01 * shake * Math.sin(t * 25);
    }
    if ((t > 1.2 && t < 2.3) || (t > 4.4 && t < 5.4)) this.lookPal(0.8);
    else this.lookCam(0.9);
  }

  /** Reach up tall on the toes, then bend over to each side. */
  private actReach(): void {
    const c = this.tgt;
    const t = this.t;
    const up = smooth((t - 0.1) / 0.65) * (1 - smooth((t - 4.95) / 0.6));
    const toes = Math.sin(Math.PI * clamp01((t - 0.55) / 1.1));
    const bendL = smooth((t - 1.55) / 0.55) * (1 - smooth((t - 2.95) / 0.5));
    const bendR = smooth((t - 3.3) / 0.55) * (1 - smooth((t - 4.65) / 0.5));
    // positive lean = over to the figure's left
    const lean = 0.36 * (bendL - bendR);
    c[RROLL] -= lean * 0.32;
    c[TROLL] -= lean * 0.68;
    c[RX] -= lean * 0.07;
    c[RY] += 0.022 * toes;
    for (let side = 1; side >= -1; side -= 2) this.foot(side, side * STANCE, ANKLE + 0.022 * toes, -0.015 * toes, 0.4 * toes, side * 0.14);
    if (toes > 0.05) this.planted = 0;
    for (let side = 1; side >= -1; side -= 2) {
      // which way this arm goes in the bend: over the top (away side), or down to the hip
      const over = side * lean < 0 ? Math.abs(lean) / 0.36 : 0;
      const hip = side * lean > 0 ? Math.abs(lean) / 0.36 : 0;
      // up and out wide, a big Y: these arms are short, so a hand pulled any higher straightens the arm
      // right through the big head. Over the top the hand goes a little higher; the lean takes it over
      let tx = side * 0.7;
      let ty = 1.16;
      let tz = 0.06;
      tx = lerp(tx, side * 0.66, over);
      ty = lerp(ty, 1.3, over);
      this.bodyPt(tx, ty, tz, v3);
      this.rootPt(side * 0.29, 0.57, -0.01, v3b);
      this.restHand(side, fShowP);
      const hx = lerp(v3[0], v3b[0], hip);
      const hy = lerp(v3[1], v3b[1], hip);
      tz = lerp(v3[2], v3b[2], hip);
      this.hand(side, lerp(fShowP[0], hx, up), lerp(fShowP[1], hy, up), lerp(fShowP[2], tz, up));
      this.pole(side, side, lerp(-0.6, 0.05, hip), lerp(-0.2, -0.5, hip));
      this.wrist(side, lerp(-0.25, 0.5, hip) * up);
    }
    c[EYE] = 1 - 0.25 * Math.max(bendL, bendR) - 0.1 * toes;
    this.lookCam(lerp(0.9, 0.6, Math.abs(lean) / 0.36));
  }

  /** Fold over and touch the toes, a few soft bounces, roll back up. */
  private actToeTouch(): void {
    const c = this.tgt;
    const t = this.t;
    const fold = smooth((t - 0.35) / 1.0) * (1 - smooth((t - 2.95) / 1.1));
    const bounce = t > 1.45 && t < 2.9 ? Math.abs(Math.sin(((t - 1.45) / 0.48) * Math.PI)) : 0;
    c[RPITCH] += 0.72 * fold + 0.06 * bounce * fold;
    c[TPITCH] += 0.48 * fold + 0.04 * bounce * fold;
    c[RZ] -= 0.15 * fold;
    c[RY] -= 0.035 * fold;
    const inhale = Math.sin(Math.PI * clamp01(t / 0.45));
    c[RY] += 0.012 * inhale;
    for (let side = 1; side >= -1; side -= 2) {
      this.restHand(side, v3);
      const k = smooth((fold - 0.25) / 0.75);
      // fingertips on the toes: the hand rests on top of the shoe, not in it
      // (going down and coming back up they pass in front of the legs, not through the thighs)
      const bow = 4 * k * (1 - k);
      this.hand(side, lerp(v3[0], side * 0.11, k) + side * 0.04 * bow, lerp(v3[1] + 0.06 * inhale, 0.17 - 0.02 * bounce, k), lerp(v3[2], 0.29, k) + 0.1 * bow);
      this.pole(side, side * 0.5, 0.3, -1);
      this.wrist(side, 0.3 * k);
    }
    c[EYE] = 1 - 0.3 * fold;
    if (fold > 0.6) this.lookCam(0.45);
    else this.lookCam(0.9);
  }

  /** Quad stretch: stand on one leg, heel pulled up behind, a wobble, then the other side. */
  private actQuad(): void {
    const c = this.tgt;
    const t = this.t;
    for (let a = 1; a >= -1; a -= 2) {
      const w0 = a > 0 ? 0.25 : 3.4;
      const w1 = a > 0 ? 3.15 : 6.3;
      const k = smooth((t - w0) / 0.55) * (1 - smooth((t - (w1 - 0.5)) / 0.5));
      if (k <= 0) continue;
      const lt = t - w0;
      const whoa = Math.exp(-Math.pow((lt - 1.35) / 0.32, 2));
      const wob = (0.03 * Math.sin(lt * 5.1 + a) + 0.018 * Math.sin(lt * 8.3)) * k + 0.07 * whoa * Math.sin(lt * 11);
      // weight over the standing leg
      c[RX] += -a * 0.055 * k;
      c[RROLL] += wob + a * 0.03 * k;
      c[TROLL] -= wob * 0.6;
      c[RY] -= 0.015 * k;
      // the lifted foot goes up behind, heel to the seat
      const fx = lerp(a * STANCE, a * 0.125, k);
      const fy = lerp(ANKLE, 0.37, k);
      const fz = lerp(0, -0.2, k);
      this.foot(a, fx, fy, fz, 1.6 * k, a * 0.05);
      this.planted = a > 0 ? 2 : 1;
      // the same-side hand holds the foot, round the back of it on the laces (a shoe's and a hand's thickness behind the ankle)
      this.restHand(a, v3);
      // (on the way there and back it swings round the outside of the foot)
      const round = 4 * k * (1 - k);
      this.hand(a, lerp(v3[0], fx + a * 0.01, k) + a * 0.15 * round, lerp(v3[1], fy + 0.05, k), lerp(v3[2], fz - 0.16, k));
      this.pole(a, a * 0.7, 0.2, -1);
      this.wrist(a, 0.4 * k);
      // the other arm out for balance, working harder in the wobble
      this.restHand(-a, v3);
      this.hand(-a, lerp(v3[0], -a * (0.6 + 0.08 * whoa), k), lerp(v3[1], 0.84 + 0.05 * Math.sin(lt * 4.4) + 0.2 * whoa, k), lerp(v3[2], 0.12, k));
      this.pole(-a, -a * 0.3, -1, -0.4);
      this.wrist(-a, -0.3 * k);
      c[EYEB] = 1 + 0.12 * whoa;
      if (lt > 1.9 && lt < 2.5) this.lookPal(0.8);
      else this.lookCam(0.9);
      return;
    }
    this.lookCam(0.9);
  }

  /** Torso twists, fists in front of the chest, the head keeping an eye on the camera. */
  private actTwist(): void {
    const c = this.tgt;
    const t = this.t;
    const k = smooth((t - 0.1) / 0.5) * (1 - smooth((t - 3.85) / 0.5));
    const tw = Math.sin(((t - 0.35) / 1.2) * Math.PI * 2) * k;
    c[TYAW] += 0.7 * tw;
    c[RYAW] += 0.14 * tw;
    c[RY] -= 0.03 * k;
    c[TROLL] -= 0.04 * tw;
    for (let side = 1; side >= -1; side -= 2) {
      this.bodyPt(side * 0.11, 0.8, 0.31, v3);
      this.restHand(side, v3b);
      this.hand(side, lerp(v3b[0], v3[0], k), lerp(v3b[1], v3[1], k), lerp(v3b[2], v3[2], k));
      this.pole(side, side, 0.15, -0.3);
      this.wrist(side, 0.5 * k);
    }
    c[KL] = 0.08 * k;
    c[KR] = 0.08 * k;
    this.lookCam(0.65);
  }

  /** Quick hops in place, arms shaking loose. */
  private actHops(): void {
    const c = this.tgt;
    const t = this.t;
    let lift = 0;
    let ground = 1;
    let count = 0;
    for (let i = 0; i < HOP_COUNT; i++) {
      const t0 = HOP_START + i * HOP_PERIOD;
      const big = i === HOP_COUNT - 1 ? 1.9 : 1;
      const air0 = t0 + 0.06;
      const air1 = t0 + HOP_PERIOD * (i === HOP_COUNT - 1 ? 1.25 : 0.8);
      if (t >= air1) count++;
      const h = this.hop(t, air0, air1, HOP_H * big);
      if (h > 0) {
        lift = h;
        ground = 0;
      }
    }
    this.land(count, -1.2);
    this.lift = lift;
    if (ground === 0) this.planted = 0;
    const dip = t < HOP_START ? Math.sin(Math.PI * clamp01(t / HOP_START)) : 0;
    const groundKnees = ground * (t > HOP_START && t < 2.2 ? 1 : 0);
    c[RY] -= 0.05 * dip + 0.03 * groundKnees;
    const tuck = 1 - ground;
    for (let side = 1; side >= -1; side -= 2) {
      this.foot(side, side * STANCE, ANKLE + 0.03 * tuck, 0.01 * tuck, 0.35 * tuck, side * 0.14);
      const flap = Math.sin(t * 19 + side * 1.3) * (t > 0.1 && t < 2.3 ? 1 : 0);
      this.hand(side, side * (0.37 + 0.03 * flap), 0.5 + 0.06 * flap + 0.05 * tuck, 0.08);
      this.pole(side, side, -0.2, -0.6);
      this.wrist(side, 0.4 + 0.3 * flap);
    }
    c[EYE] = 1 - 0.12 * tuck;
    this.lookCam(0.9);
  }

  /**
   * How far (figure space) to move a point out of the chest, the hips and the head so that it keeps `r` from
   * their surfaces; the move goes into `gP` and its length is returned. `hs`, `hsx`: the head's scale.
   */
  private bodyPush(x: number, y: number, z: number, r: number, hs: number, hsx: number): number {
    gP[0] = 0;
    gP[1] = 0;
    gP[2] = 0;
    for (let v = 0; v < 3; v++) {
      const f = v === 0 ? fTorso : v === 1 ? fRoot : fHead;
      // into the body's own space (the frames are rigid)
      const dx = x + gP[0] - f[9];
      const dy = y + gP[1] - f[10];
      const dz = z + gP[2] - f[11];
      const lx = f[0] * dx + f[1] * dy + f[2] * dz;
      const ly = f[3] * dx + f[4] * dy + f[5] * dz;
      const lz = f[6] * dx + f[7] * dy + f[8] * dz;
      let sd: number;
      if (v === 2) {
        // the head is scaled with the build
        const rx = HEAD_ER[0] * hsx;
        const ry = HEAD_ER[1] * hs;
        const rz = HEAD_ER[2] * hsx;
        const ex = lx - HEAD_EC[0] * hsx;
        const ey = ly - HEAD_EC[1] * hs;
        const ez = lz - HEAD_EC[2] * hsx;
        const k0 = Math.hypot(ex / rx, ey / ry, ez / rz);
        const k1 = Math.hypot(ex / (rx * rx), ey / (ry * ry), ez / (rz * rz));
        if (k1 < 1e-9) continue;
        sd = (k0 * (k0 - 1)) / k1;
        gN[0] = ex / (rx * rx) / k1;
        gN[1] = ey / (ry * ry) / k1;
        gN[2] = ez / (rz * rz) / k1;
      } else if (v === 0) {
        sd = slabSd(CHEST_Y, CHEST_A, CHEST_B, CHEST_N, lx, ly, lz);
      } else {
        sd = slabSd(HIPS_Y, HIPS_A, HIPS_B, HIPS_N, lx, ly, lz);
      }
      const p = softPush(sd, r);
      if (p <= 0) continue;
      // back into figure space
      gP[0] += p * (f[0] * gN[0] + f[3] * gN[1] + f[6] * gN[2]);
      gP[1] += p * (f[1] * gN[0] + f[4] * gN[1] + f[7] * gN[2]);
      gP[2] += p * (f[2] * gN[0] + f[5] * gN[1] + f[8] * gN[2]);
    }
    return Math.hypot(gP[0], gP[1], gP[2]);
  }

  /** The ball, and the hands gripping it, go out of the body together; a free hand on its own. */
  private guardBody(hs: number, hsx: number): void {
    const c = this.cur;
    gQ[0] = 0;
    gQ[1] = 0;
    gQ[2] = 0;
    const bf = this.ballF;
    const ball = this.hasBall && !this.onFinger && !this.hidden;
    if (ball) {
      const rb = BALL_R / Math.sqrt(this.sx * this.sy);
      if (this.bodyPush(bf[0], bf[1], bf[2], rb, hs, hsx) > 0) gQ.set(gP);
    }
    for (let side = 0; side < 2; side++) {
      const o = side === 0 ? HL : HR;
      const held = ball && (this.grip & (1 << side)) !== 0;
      const qx = held ? gQ[0] : 0;
      const qy = held ? gQ[1] : 0;
      const qz = held ? gQ[2] : 0;
      if (this.bodyPush(c[o] + qx, c[o + 1] + qy, c[o + 2] + qz, G_HAND, hs, hsx) <= 0) continue;
      if (held) {
        // a gripping hand cannot leave the ball: the ball and both hands go
        gQ[0] += gP[0];
        gQ[1] += gP[1];
        gQ[2] += gP[2];
      } else {
        c[o] += gP[0];
        c[o + 1] += gP[1];
        c[o + 2] += gP[2];
      }
    }
    if (!ball || gQ[0] * gQ[0] + gQ[1] * gQ[1] + gQ[2] * gQ[2] === 0) return;
    for (let k = 0; k < 3; k++) bf[k] += gQ[k];
    for (let side = 0; side < 2; side++) {
      if ((this.grip & (1 << side)) === 0) continue;
      const o = side === 0 ? HL : HR;
      for (let k = 0; k < 3; k++) c[o + k] += gQ[k];
    }
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
    if (this.guard) this.guardBody(hs, hsx);

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
      let tx = c[ho];
      let ty = c[ho + 1];
      let tz = c[ho + 2];
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
      let px = c[po];
      let py = c[po + 1];
      let pz = c[po + 2];
      if (this.guard) {
        // a pole that points along the arm leaves the elbow free to flip from up to down: lean it toward out, down and back
        const dl = Math.hypot(tx - sx, ty - sy, tz - sz) || 1;
        const pl = Math.hypot(px, py, pz) || 1;
        const k = (px * (tx - sx) + py * (ty - sy) + pz * (tz - sz)) / (dl * pl);
        const lean = smooth((0.5 - Math.sqrt(Math.max(0, 1 - k * k))) / 0.5) * pl;
        px += side * 0.6 * lean;
        py -= 0.75 * lean;
        pz -= 0.3 * lean;
      }
      solveLimb(sx, sy, sz, tx, ty, tz, l1, l2, px, py, pz, 1, ARM_MAX_STRETCH, limb);
      if (this.guard) {
        // the elbow, the middle of the upper arm and of the forearm stay out of the body: move the elbow out (and a free hand with the forearm), solve again
        const free = (this.grip & (side > 0 ? 1 : 2)) === 0;
        for (let it = 0; it < 2; it++) {
          let ex = 0;
          let ey = 0;
          let ez = 0;
          let el = 0;
          let hx = 0;
          let hy = 0;
          let hz = 0;
          for (let q = 0; q < 3; q++) {
            // q 0: the elbow; 1: most of the way down the upper arm; 2: the middle of the forearm
            const u = q === 1 ? 0.6 : 0.5;
            const qx = q === 0 ? limb.mx : q === 1 ? sx + (limb.mx - sx) * u : limb.mx + (limb.ex - limb.mx) * u;
            const qy = q === 0 ? limb.my : q === 1 ? sy + (limb.my - sy) * u : limb.my + (limb.ey - limb.my) * u;
            const qz = q === 0 ? limb.mz : q === 1 ? sz + (limb.mz - sz) * u : limb.mz + (limb.ez - limb.mz) * u;
            // a stretched arm is drawn thicker
            const d = this.bodyPush(qx, qy, qz, (q === 2 ? G_FORE : G_ELBOW) * Math.sqrt(limb.stretch), hs, hsx);
            if (d <= 0) continue;
            // the upper arm turns about the shoulder: its elbow has to go further
            const g = q === 1 ? 1 / u : q === 2 && !free ? 2 : 1;
            if (d * g > el) {
              el = d * g;
              ex = gP[0] * g;
              ey = gP[1] * g;
              ez = gP[2] * g;
            }
            // a free hand goes along: all of the forearm's push, and half the elbow's, since a nearly straight arm can only move its elbow by moving its hand
            if (free && (q === 2 || q === 0)) {
              const hk = q === 2 ? 1 : 0.5;
              hx += gP[0] * hk;
              hy += gP[1] * hk;
              hz += gP[2] * hk;
            }
          }
          if (el <= 1e-5) break;
          tx += hx;
          ty += hy;
          tz += hz;
          px = limb.mx + ex - sx;
          py = limb.my + ey - sy;
          pz = limb.mz + ez - sz;
          solveLimb(sx, sy, sz, tx, ty, tz, l1, l2, px, py, pz, 1, ARM_MAX_STRETCH, limb);
        }
      }
      const st = limb.stretch;
      // a stretched arm thickens too, so a long reach reads as a strong arm and not a noodle
      const thick = Math.sqrt(st);
      const palm = PALM * thick;
      segmentFrame(fSeg, sx, sy, sz, limb.mx, limb.my, limb.mz, limb.nx, limb.ny, limb.nz);
      frameToM4(fSeg, bones, bo[0], thick, (l1 * st) / UPPER, thick);
      // the forearm stops at the wrist; the palm carries on from there
      const foreLen = l2 * st - palm;
      const k = foreLen / (l2 * st);
      const wx = limb.mx + (limb.ex - limb.mx) * k;
      const wy = limb.my + (limb.ey - limb.my) * k;
      const wz = limb.mz + (limb.ez - limb.mz) * k;
      segmentFrame(fSeg, limb.mx, limb.my, limb.mz, wx, wy, wz, limb.nx, limb.ny, limb.nz);
      frameToM4(fSeg, bones, bo[1], thick, foreLen / FORE, thick);
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
      frameToM4(fSeg, bones, bo[2], thick, thick, thick);
      // where the hand ended up, for whoever has to put a ball in it
      const ro = side > 0 ? 0 : 7;
      const hd = this.hands;
      hd[ro] = wx;
      hd[ro + 1] = wy;
      hd[ro + 2] = wz;
      hd[ro + 3] = ax;
      hd[ro + 4] = ay;
      hd[ro + 5] = az;
      hd[ro + 6] = thick;
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
      const ao = side > 0 ? 0 : 3;
      this.ankles[ao] = limb.ex;
      this.ankles[ao + 1] = limb.ey;
      this.ankles[ao + 2] = limb.ez;
    }
  }
}
