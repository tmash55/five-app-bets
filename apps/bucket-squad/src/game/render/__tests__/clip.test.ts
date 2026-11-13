/**
 * Body parts passing through each other on the warm-up stage.
 *
 * After every frame the bone matrices are read back and simple shapes are laid
 * over the parts: capsules for the limbs (the far half of the upper arm and the
 * thigh, so the shoulder and hip joints, which always overlap, are left out),
 * a stack of rounded slices for the chest and the hips, an ellipsoid for the
 * head and a sphere for the ball. Every size comes from the kit's own meshes
 * and pivots and is carried through the bone matrices and the figure's build,
 * so a bulky figure has a bigger chest and a smaller head than its height alone
 * would give. Depths are in figure units of a figure 1 tall (world / height):
 * the rest figure is 1.57 of them from the soles to the top of the head.
 *
 * `CLIP_REPORT=<file> npx jest clip` also writes the full table to a file (`CLIP_ONLY=<rows,...>` narrows it),
 * and `CLIP_MATCH=<file>` the same table for the match's poses.
 */

import fs from 'fs';

import { getPart, KIT_BONE_INDEX, KIT_METRICS } from '../../kit/kit';
import { BALL_R, COURT, DT as SIM_DT } from '../../sim/constants';
import { createMatch, stepMatch } from '../../sim/sim';
import type { Attrs, MatchConfig, MatchState, PlayerSim } from '../../sim/types';
import { ACT_LENGTH, ROLE_ACTS, ROLE_HAS_BALL, actAt, newActSlot, type StageAct, type StageRole } from '../../stage/director';
import { DRAWN_BALL_BLEND, DrawnBall, FigureAnimator, GUARD_SHAPES, type AnimFrame, type Mood, type ShowFrame } from '../animator';

const DT = 1 / 60;
const BONES = 64 * 16;
/** figure units of a figure 1 tall to centimetres on a figure 1.2 m tall */
const CM = 120 / KIT_METRICS.height;

// --- shapes from the kit -------------------------------------------------------------

function verts(name: string): Float32Array {
  const p = getPart(name);
  if (!p) throw new Error(`no kit part ${name}`);
  return p.positions;
}

function pct(v: number[], q: number): number {
  const s = v.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))];
}

interface Cap {
  name: string;
  /** 'arm' or 'leg', and the side: 1 the figure's left */
  kind: 'arm' | 'leg';
  side: number;
  member: 'up' | 'fore' | 'hand' | 'thigh' | 'shin' | 'foot';
  bone: number;
  /** ends in the bone's own space, and the radius there */
  a: number[];
  b: number[];
  r: number;
  /** two directions across the capsule, in the bone's space (to carry the radius through the bone's scale) */
  u: number;
  v: number;
}

/**
 * A capsule along local axis `ax` (1 = Y, 2 = Z) over the band [lo, hi] of that axis:
 * its radius keeps the area of the band's cross-section (the band's half widths across both ways, without the odd stray vertex).
 * With `seg` the centre line runs between those two values; without, it fills the band less the radius at both ends.
 */
function fitCap(name: string, part: string, bone: string, kind: 'arm' | 'leg', side: number, member: Cap['member'], ax: 1 | 2, lo: number, hi: number, seg: [number, number] | null): Cap {
  const p = verts(part);
  const o1 = ax === 1 ? 0 : 0;
  const o2 = ax === 1 ? 2 : 1;
  let c1 = 0;
  let c2 = 0;
  let n = 0;
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    const t = p[i + ax];
    if (t < lo || t > hi) continue;
    c1 += p[i + o1];
    c2 += p[i + o2];
    n++;
    mn = Math.min(mn, t);
    mx = Math.max(mx, t);
  }
  c1 /= n;
  c2 /= n;
  // the cross-section is flattened for the hand, the foot and the shorts: a circle of the same area
  const d1: number[] = [];
  const d2: number[] = [];
  for (let i = 0; i < p.length; i += 3) {
    const t = p[i + ax];
    if (t < lo || t > hi) continue;
    d1.push(Math.abs(p[i + o1] - c1));
    d2.push(Math.abs(p[i + o2] - c2));
  }
  const r = Math.sqrt(pct(d1, 0.95) * pct(d2, 0.95));
  const s0 = seg ? seg[0] : Math.max(mx - r, (mn + mx) / 2);
  const s1 = seg ? seg[1] : Math.min(mn + r, (mn + mx) / 2);
  const at = (t: number) => (ax === 1 ? [c1, t, c2] : [c1, c2, t]);
  return { name, kind, side, member, bone: KIT_BONE_INDEX[bone], a: at(s0), b: at(s1), r, u: 0, v: ax === 1 ? 2 : 1 };
}

const UP = KIT_METRICS.upperArm;
const FORE = KIT_METRICS.forearm;
const THIGH = KIT_METRICS.thigh;
const SHIN = KIT_METRICS.shin;

const CAPS: Cap[] = [];
for (const side of [1, -1]) {
  const S = side > 0 ? 'L' : 'R';
  CAPS.push(fitCap(`up${S}`, `armUp.${S}`, `arm${S}_up`, 'arm', side, 'up', 1, -UP, -UP / 2, [-UP / 2, -UP]));
  CAPS.push(fitCap(`fore${S}`, `armLo.${S}`, `arm${S}_lo`, 'arm', side, 'fore', 1, -FORE, 0, [0, -FORE]));
  CAPS.push(fitCap(`hand${S}`, `hand.${S}`, `hand${S}`, 'arm', side, 'hand', 1, -1, 1, null));
  CAPS.push(fitCap(`thigh${S}`, `thigh.long.${S}`, `leg${S}_up`, 'leg', side, 'thigh', 1, -THIGH, -THIGH / 2, [-THIGH / 2, -THIGH]));
  CAPS.push(fitCap(`shin${S}`, `shin.${S}`, `leg${S}_lo`, 'leg', side, 'shin', 1, -SHIN, 0, [0, -SHIN]));
  CAPS.push(fitCap(`foot${S}`, `shoe.${S}`, `foot${S}`, 'leg', side, 'foot', 2, -1, 1, null));
}

/** A body made of horizontal rounded slices (a superellipse each), read off a kit part. */
interface Loft {
  name: string;
  bone: number;
  y: Float64Array;
  a: Float64Array;
  b: Float64Array;
  cz: Float64Array;
  bot: number;
  top: number;
  n: number;
}

function fitLoft(name: string, part: string, bone: string, slices: number): Loft {
  const p = verts(part);
  let bot = Infinity;
  let top = -Infinity;
  for (let i = 1; i < p.length; i += 3) {
    bot = Math.min(bot, p[i]);
    top = Math.max(top, p[i]);
  }
  const y = new Float64Array(slices);
  const a = new Float64Array(slices);
  const b = new Float64Array(slices);
  const cz = new Float64Array(slices);
  const h = (top - bot) / slices;
  // the mesh is made of sparse rings: each slice takes the outline of the rings within a short window of it
  const win = 0.025;
  for (let s = 0; s < slices; s++) {
    const yc = bot + (s + 0.5) * h;
    let zmin = Infinity;
    let zmax = -Infinity;
    let xm = 0;
    for (let i = 0; i < p.length; i += 3) {
      if (Math.abs(p[i + 1] - yc) > Math.max(win, h / 2)) continue;
      xm = Math.max(xm, Math.abs(p[i]));
      zmin = Math.min(zmin, p[i + 2]);
      zmax = Math.max(zmax, p[i + 2]);
    }
    y[s] = yc;
    a[s] = xm;
    b[s] = (zmax - zmin) / 2;
    cz[s] = (zmax + zmin) / 2;
  }
  // the cross-sections' squareness, fitted over the middle slices
  let best = 2;
  let bestE = Infinity;
  for (let n = 1.6; n <= 4.01; n += 0.05) {
    let e = 0;
    let c = 0;
    for (let i = 0; i < p.length; i += 3) {
      const s = Math.min(slices - 1, Math.max(0, Math.floor((p[i + 1] - bot) / h)));
      if (s < 1 || s > slices - 2) continue;
      const k = Math.pow(Math.pow(Math.abs(p[i]) / a[s], n) + Math.pow(Math.abs(p[i + 2] - cz[s]) / b[s], n), 1 / n);
      e += Math.abs(k - 1);
      c++;
    }
    if (e / c < bestE) {
      bestE = e / c;
      best = n;
    }
  }
  return { name, bone: KIT_BONE_INDEX[bone], y, a, b, cz, bot, top, n: best };
}

/** Axis-aligned ellipsoid through a part's vertices (least squares), leaving out the ears. */
interface Ell {
  name: string;
  bone: number;
  c: number[];
  r: number[];
}

function fitEll(name: string, part: string, bone: string): Ell {
  const p = verts(part);
  const M = Array.from({ length: 6 }, () => new Float64Array(7));
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i];
    const y = p[i + 1];
    const z = p[i + 2];
    // the ears stick out of the sides of the head
    if (Math.abs(x) > 0.4 && Math.abs(z) < 0.14) continue;
    const row = [x * x, y * y, z * z, x, y, z];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) M[r][c] += row[r] * row[c];
      M[r][6] += row[r];
    }
  }
  for (let c = 0; c < 6; c++) {
    let piv = c;
    for (let r = c + 1; r < 6; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < 6; r++) {
      if (r === c) continue;
      const k = M[r][c] / M[c][c];
      for (let q = c; q < 7; q++) M[r][q] -= k * M[c][q];
    }
  }
  const s = M.map((row, i) => row[6] / row[i]);
  const c = [-s[3] / (2 * s[0]), -s[4] / (2 * s[1]), -s[5] / (2 * s[2])];
  const g = 1 + s[0] * c[0] * c[0] + s[1] * c[1] * c[1] + s[2] * c[2] * c[2];
  return { name, bone: KIT_BONE_INDEX[bone], c, r: [Math.sqrt(g / s[0]), Math.sqrt(g / s[1]), Math.sqrt(g / s[2])] };
}

const CHEST = fitLoft('chest', 'torso', 'torso', 18);
const HIPS = fitLoft('hips', 'pelvis', 'root', 8);
const HEADV = fitEll('head', 'head', 'head');
/** the ball as drawn: the mean radius of its mesh */
const BALL = (() => {
  const p = verts('ball');
  let s = 0;
  for (let i = 0; i < p.length; i += 3) s += Math.hypot(p[i], p[i + 1], p[i + 2]);
  return s / (p.length / 3);
})();

// --- signed distances in a body's own space ------------------------------------------

function loftSd(L: Loft, x: number, y: number, z: number, g: Float64Array): number {
  const n = L.n;
  const h = (L.top - L.bot) / L.y.length;
  let f = (y - L.y[0]) / h;
  f = Math.max(0, Math.min(L.y.length - 1.0001, f));
  const i = Math.floor(f);
  const w = f - i;
  const a = L.a[i] + (L.a[i + 1] - L.a[i]) * w;
  const b = L.b[i] + (L.b[i + 1] - L.b[i]) * w;
  const cz = L.cz[i] + (L.cz[i + 1] - L.cz[i]) * w;
  const ax = Math.abs(x) / a;
  const az = Math.abs(z - cz) / b;
  const k = Math.pow(Math.pow(ax, n) + Math.pow(az, n), 1 / n);
  // k is 1 on the surface and grows linearly outward: divide by its slope for a distance
  let hd: number;
  let gx = 0;
  let gz = 0;
  if (k < 1e-9) {
    hd = -Math.min(a, b);
    gx = a < b ? 1 : 0;
    gz = a < b ? 0 : 1;
  } else {
    const kn = Math.pow(k, 1 - n);
    gx = (kn * Math.pow(ax, n - 1) * Math.sign(x)) / a;
    gz = (kn * Math.pow(az, n - 1) * Math.sign(z - cz)) / b;
    const gl = Math.hypot(gx, gz) || 1;
    hd = (k - 1) / gl;
    gx /= gl;
    gz /= gl;
  }
  const vd = Math.max(y - L.top, L.bot - y);
  if (hd < 0 && vd < 0) {
    if (hd > vd) {
      g[0] = gx;
      g[1] = 0;
      g[2] = gz;
      return hd;
    }
    g[0] = 0;
    g[1] = y - L.top > L.bot - y ? 1 : -1;
    g[2] = 0;
    return vd;
  }
  const ox = Math.max(hd, 0);
  const oy = Math.max(vd, 0);
  const l = Math.hypot(ox, oy) || 1;
  g[0] = (gx * ox) / l;
  g[1] = ((y - L.top > L.bot - y ? 1 : -1) * oy) / l;
  g[2] = (gz * ox) / l;
  return Math.max(hd, vd) <= 0 ? Math.max(hd, vd) : Math.hypot(ox, oy);
}

function ellSd(E: Ell, x: number, y: number, z: number, g: Float64Array): number {
  const px = x - E.c[0];
  const py = y - E.c[1];
  const pz = z - E.c[2];
  const k0 = Math.hypot(px / E.r[0], py / E.r[1], pz / E.r[2]);
  const k1 = Math.hypot(px / (E.r[0] * E.r[0]), py / (E.r[1] * E.r[1]), pz / (E.r[2] * E.r[2]));
  if (k1 < 1e-9) {
    g[0] = 0;
    g[1] = 1;
    g[2] = 0;
    return -Math.min(E.r[0], E.r[1], E.r[2]);
  }
  g[0] = px / (E.r[0] * E.r[0]) / k1;
  g[1] = py / (E.r[1] * E.r[1]) / k1;
  g[2] = pz / (E.r[2] * E.r[2]) / k1;
  return (k0 * (k0 - 1)) / k1;
}

// --- one frame, measured ---------------------------------------------------------------

/** world positions of the capsule ends and their radius, divided by the figure's height */
const capA = new Float64Array(CAPS.length * 3);
const capB = new Float64Array(CAPS.length * 3);
const capR = new Float64Array(CAPS.length);
/** figure -> world, linear part, and its inverse (per frame) */
const P = new Float64Array(9);
const Pi = new Float64Array(9);
const P0 = new Float64Array(3);
const tmp = new Float64Array(3);
const g3 = new Float64Array(3);

function inv3(m: Float64Array | number[], out: Float64Array): void {
  const [a, b, c, d, e, f, g, h, i] = [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  // out is column-major like m
  out[0] = A / det;
  out[1] = B / det;
  out[2] = C / det;
  out[3] = -(b * i - c * h) / det;
  out[4] = (a * i - c * g) / det;
  out[5] = -(a * h - b * g) / det;
  out[6] = (b * f - c * e) / det;
  out[7] = -(a * f - c * d) / det;
  out[8] = (a * e - b * d) / det;
}

/** apply a column-major 3x3 */
function mul3(m: Float64Array | number[], x: number, y: number, z: number, out: Float64Array): void {
  out[0] = m[0] * x + m[3] * y + m[6] * z;
  out[1] = m[1] * x + m[4] * y + m[7] * z;
  out[2] = m[2] * x + m[5] * y + m[8] * z;
}

interface Vol {
  name: string;
  bone: number;
  sd: (x: number, y: number, z: number, g: Float64Array) => number;
  /** centre and radius of a sphere round it, in its bone's space */
  bound: number[];
}

function loftBound(L: Loft): number[] {
  let r = 0;
  for (let i = 0; i < L.y.length; i++) r = Math.max(r, Math.hypot(L.a[i], L.b[i] + Math.abs(L.cz[i])));
  return [0, (L.bot + L.top) / 2, 0, Math.hypot(r, (L.top - L.bot) / 2) + 0.02];
}

const VOLS: Vol[] = [
  { name: 'chest', bone: CHEST.bone, sd: (x, y, z, g) => loftSd(CHEST, x, y, z, g), bound: loftBound(CHEST) },
  { name: 'hips', bone: HIPS.bone, sd: (x, y, z, g) => loftSd(HIPS, x, y, z, g), bound: loftBound(HIPS) },
  { name: 'head', bone: HEADV.bone, sd: (x, y, z, g) => ellSd(HEADV, x, y, z, g), bound: [...HEADV.c, Math.max(...HEADV.r) + 0.02] },
];
const volC = VOLS.map(() => new Float64Array(3));
const volR = new Float64Array(VOLS.length);
const fTmp = new Float64Array(3);
const cuTmp = new Float64Array(3);
const cvTmp = new Float64Array(3);
const volM = VOLS.map(() => new Float64Array(9));
const volMi = VOLS.map(() => new Float64Array(9));
const volT = VOLS.map(() => new Float64Array(3));

class Measure {
  an: FigureAnimator;
  bones: Float32Array;
  height: number;
  constructor(an: FigureAnimator, bones: Float32Array, height: number) {
    this.an = an;
    this.bones = bones;
    this.height = height;
  }

  /** world, relative to the figure's origin, over its height */
  private world(fx: number, fy: number, fz: number, out: Float64Array, o: number): void {
    mul3(P, fx, fy, fz, tmp);
    const h = this.height;
    out[o] = tmp[0] / h;
    out[o + 1] = tmp[1] / h;
    out[o + 2] = tmp[2] / h;
  }

  prepare(): void {
    const an = this.an;
    const bn = this.bones;
    an.toWorld(0, 0, 0, P0);
    for (let k = 0; k < 3; k++) {
      an.toWorld(k === 0 ? 1 : 0, k === 1 ? 1 : 0, k === 2 ? 1 : 0, tmp);
      P[k * 3] = tmp[0] - P0[0];
      P[k * 3 + 1] = tmp[1] - P0[1];
      P[k * 3 + 2] = tmp[2] - P0[2];
    }
    inv3(P, Pi);
    const f = fTmp;
    for (let i = 0; i < CAPS.length; i++) {
      const c = CAPS[i];
      const o = c.bone * 16;
      for (let e = 0; e < 2; e++) {
        const q = e === 0 ? c.a : c.b;
        f[0] = bn[o] * q[0] + bn[o + 4] * q[1] + bn[o + 8] * q[2] + bn[o + 12];
        f[1] = bn[o + 1] * q[0] + bn[o + 5] * q[1] + bn[o + 9] * q[2] + bn[o + 13];
        f[2] = bn[o + 2] * q[0] + bn[o + 6] * q[1] + bn[o + 10] * q[2] + bn[o + 14];
        this.world(f[0], f[1], f[2], e === 0 ? capA : capB, i * 3);
      }
      // the radius goes through the bone's scale and the build: keep the area of the cross-section
      const cu = cuTmp;
      const cv = cvTmp;
      this.world(bn[o + c.u * 4], bn[o + c.u * 4 + 1], bn[o + c.u * 4 + 2], cu, 0);
      this.world(bn[o + c.v * 4], bn[o + c.v * 4 + 1], bn[o + c.v * 4 + 2], cv, 0);
      const ar = Math.hypot(cu[1] * cv[2] - cu[2] * cv[1], cu[2] * cv[0] - cu[0] * cv[2], cu[0] * cv[1] - cu[1] * cv[0]);
      capR[i] = c.r * Math.sqrt(ar);
    }
    for (let v = 0; v < VOLS.length; v++) {
      const o = VOLS[v].bone * 16;
      const M = volM[v];
      let sc = 0;
      for (let k = 0; k < 3; k++) {
        // bone columns into world over height
        this.world(bn[o + k * 4], bn[o + k * 4 + 1], bn[o + k * 4 + 2], tmp, 0);
        M[k * 3] = tmp[0];
        M[k * 3 + 1] = tmp[1];
        M[k * 3 + 2] = tmp[2];
        sc = Math.max(sc, Math.hypot(tmp[0], tmp[1], tmp[2]));
      }
      inv3(M, volMi[v]);
      this.world(bn[o + 12], bn[o + 13], bn[o + 14], volT[v], 0);
      // a sphere round the whole body, to skip parts nowhere near it
      const b = VOLS[v].bound;
      mul3(M, b[0], b[1], b[2], tmp);
      const bc = volC[v];
      bc[0] = volT[v][0] + tmp[0];
      bc[1] = volT[v][1] + tmp[1];
      bc[2] = volT[v][2] + tmp[2];
      volR[v] = b[3] * sc;
    }
  }

  /** signed distance from a point (world over height, from the origin) to body `v`, in the same units */
  sd(v: number, x: number, y: number, z: number): number {
    const t = volT[v];
    mul3(volMi[v], x - t[0], y - t[1], z - t[2], tmp);
    const d = VOLS[v].sd(tmp[0], tmp[1], tmp[2], g3);
    mul3(volM[v], g3[0], g3[1], g3[2], tmp);
    return d * Math.hypot(tmp[0], tmp[1], tmp[2]);
  }

  /** how deep capsule `i` goes into body `v` (negative: the gap) */
  capInVol(i: number, v: number): number {
    const ax = capA[i * 3];
    const ay = capA[i * 3 + 1];
    const az = capA[i * 3 + 2];
    const dx = capB[i * 3] - ax;
    const dy = capB[i * 3 + 1] - ay;
    const dz = capB[i * 3 + 2] - az;
    const r = capR[i];
    const bc = volC[v];
    const far = segPt(capA, capB, i, bc[0], bc[1], bc[2]) - volR[v] - r;
    if (far > 0) return -far;
    const at = (s: number) => r - this.sd(v, ax + dx * s, ay + dy * s, az + dz * s);
    let best = -Infinity;
    let bs = 0;
    const n = 6;
    for (let k = 0; k <= n; k++) {
      const p = at(k / n);
      if (p > best) {
        best = p;
        bs = k / n;
      }
    }
    let lo = Math.max(0, bs - 1 / n);
    let hi = Math.min(1, bs + 1 / n);
    for (let it = 0; it < 8; it++) {
      const m1 = lo + (hi - lo) * 0.382;
      const m2 = lo + (hi - lo) * 0.618;
      if (at(m1) > at(m2)) hi = m2;
      else lo = m1;
    }
    return Math.max(best, at((lo + hi) / 2));
  }

  /** how deep the ball (world centre) goes into body `v` */
  ballInVol(b: Float64Array, v: number): number {
    const bc = volC[v];
    const far = Math.hypot(b[0] - bc[0], b[1] - bc[1], b[2] - bc[2]) - volR[v] - BALL / this.height;
    if (far > 0) return -far;
    return BALL / this.height - this.sd(v, b[0], b[1], b[2]);
  }

  capCap(i: number, j: number): number {
    return capR[i] + capR[j] - segSeg(capA, capB, i, capA, capB, j);
  }

  ballCap(b: Float64Array, i: number): number {
    return BALL / this.height + capR[i] - segPt(capA, capB, i, b[0], b[1], b[2]);
  }
}

function segPt(A: Float64Array, B: Float64Array, i: number, x: number, y: number, z: number): number {
  const ax = A[i * 3];
  const ay = A[i * 3 + 1];
  const az = A[i * 3 + 2];
  const dx = B[i * 3] - ax;
  const dy = B[i * 3 + 1] - ay;
  const dz = B[i * 3 + 2] - az;
  const l2 = dx * dx + dy * dy + dz * dz;
  const s = l2 > 1e-12 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / l2)) : 0;
  return Math.hypot(ax + dx * s - x, ay + dy * s - y, az + dz * s - z);
}

/** closest distance between two segments */
function segSeg(A1: Float64Array, B1: Float64Array, i: number, A2: Float64Array, B2: Float64Array, j: number): number {
  const px = A1[i * 3];
  const py = A1[i * 3 + 1];
  const pz = A1[i * 3 + 2];
  const ux = B1[i * 3] - px;
  const uy = B1[i * 3 + 1] - py;
  const uz = B1[i * 3 + 2] - pz;
  const qx = A2[j * 3];
  const qy = A2[j * 3 + 1];
  const qz = A2[j * 3 + 2];
  const vx = B2[j * 3] - qx;
  const vy = B2[j * 3 + 1] - qy;
  const vz = B2[j * 3 + 2] - qz;
  const wx = px - qx;
  const wy = py - qy;
  const wz = pz - qz;
  const a = ux * ux + uy * uy + uz * uz;
  const b = ux * vx + uy * vy + uz * vz;
  const c = vx * vx + vy * vy + vz * vz;
  const d = ux * wx + uy * wy + uz * wz;
  const e = vx * wx + vy * wy + vz * wz;
  const D = a * c - b * b;
  let s = D > 1e-12 ? (b * e - c * d) / D : 0;
  s = Math.max(0, Math.min(1, s));
  let t = c > 1e-12 ? (b * s + e) / c : 0;
  if (t < 0) {
    t = 0;
    s = a > 1e-12 ? Math.max(0, Math.min(1, -d / a)) : 0;
  } else if (t > 1) {
    t = 1;
    s = a > 1e-12 ? Math.max(0, Math.min(1, (b - d) / a)) : 0;
  }
  return Math.hypot(wx + ux * s - vx * t, wy + uy * s - vy * t, wz + uz * s - vz * t);
}

// --- what is measured -------------------------------------------------------------------

/** `ball-hand` is a hand the act does not say is on the ball; a hand gripping it measures about 0.09 to 0.11 on the same scale */
export const PAIRS = ['limb-torso', 'limb-head', 'arm-arm', 'arm-leg', 'leg-leg', 'ball-torso', 'ball-head', 'ball-hand', 'ball-limb'] as const;
type Pair = (typeof PAIRS)[number];

interface Worst {
  d: number;
  t: number;
  act: string;
  what: string;
  build: string;
  time: number;
}

type Table = Map<string, Record<Pair, Worst>>;

function emptyRow(): Record<Pair, Worst> {
  const r = {} as Record<Pair, Worst>;
  for (const p of PAIRS) r[p] = { d: -Infinity, t: 0, act: '', what: '', build: '', time: 0 };
  return r;
}

const ball = new Float64Array(3);
let rowCur: Record<Pair, Worst> = emptyRow();
let frameAct = '';
let frameT = 0;
let frameTime = 0;
let buildLabel = '';

/**
 * How deep each pair may go before a person would call it a clip. A hand or a forearm resting on the body sinks a little
 * into these smooth stand-ins (the meshes are lumpier); one buried in the belly is a forearm's thickness in and fails.
 */
export function allowed(p: Pair, what: string): number {
  switch (p) {
    case 'limb-torso':
      // the upper arm meets the chest at the shoulder: measured from halfway down it, it touches whenever the arm comes across the front
      if (what.startsWith('up')) return 0.09;
      // the leg of the shorts runs up under the shirt's hem, so a deep fold forward creases them into each other
      if (what.startsWith('thigh')) return 0.14;
      return 0.05;
    case 'limb-head':
      return 0.06;
    case 'arm-arm':
    case 'arm-leg':
      // a forearm pressing on the other arm, a hand holding a foot
      return 0.07;
    case 'leg-leg':
      return 0.03;
    case 'ball-torso':
      return 0.03;
    case 'ball-head':
      return 0.05;
    case 'ball-hand':
      // a hand on the ball sinks as deep as a gripping hand does
      return 0.12;
    case 'ball-limb':
      return 0.1;
  }
}

/** the worst depth past what is allowed, over everything measured since the last reset */
let excess: Worst = { d: -Infinity, t: 0, act: '', what: '', build: '', time: 0 };

function resetExcess(): void {
  excess = { d: -Infinity, t: 0, act: '', what: '', build: '', time: 0 };
}

/** the worst part of the frame being measured, past its limit: the ball, an arm against its own body or head, anything else */
const frameWorst = [0, 1, 2].map(() => ({ x: -Infinity, d: 0, what: '' }));

function note(p: Pair, d: number, what: string): void {
  const x = d - allowed(p, what);
  const fw = frameWorst[what.startsWith('ball') ? 0 : /^(up|fore|hand)[LR]>/.test(what) ? 1 : 2];
  if (x > fw.x) {
    fw.x = x;
    fw.d = d;
    fw.what = what;
  }
  if (x > excess.d) excess = { d: x, t: frameT, act: frameAct, what: `${p} ${what} ${d.toFixed(3)}`, build: buildLabel, time: frameTime };
  const w = rowCur[p];
  if (d > w.d) {
    w.d = d;
    w.t = frameT;
    w.act = frameAct;
    w.what = what;
    w.build = buildLabel;
    w.time = frameTime;
  }
}

function measureFrame(m: Measure, hasBall: boolean, lead: number): void {
  const an = m.an;
  if (an.hidden) return;
  m.prepare();
  for (let i = 0; i < CAPS.length; i++) {
    const c = CAPS[i];
    for (let v = 0; v < 3; v++) {
      // the thigh hangs from the hips: their shared joint always overlaps
      if (v === 1 && c.member === 'thigh') continue;
      note(v === 2 ? 'limb-head' : 'limb-torso', m.capInVol(i, v), `${c.name}>${VOLS[v].name}`);
    }
    for (let j = i + 1; j < CAPS.length; j++) {
      const e = CAPS[j];
      if (c.side === e.side && c.kind === e.kind) continue;
      const p: Pair = c.kind === 'arm' && e.kind === 'arm' ? 'arm-arm' : c.kind === 'leg' && e.kind === 'leg' ? 'leg-leg' : 'arm-leg';
      note(p, m.capCap(i, j), `${c.name}~${e.name}`);
    }
  }
  if (!hasBall) return;
  const h = m.height;
  an.toWorld(0, 0, 0, P0);
  ball[0] = (an.ball[0] - P0[0]) / h;
  ball[1] = (an.ball[1] - P0[1]) / h;
  ball[2] = (an.ball[2] - P0[2]) / h;
  note('ball-torso', Math.max(m.ballInVol(ball, 0), m.ballInVol(ball, 1)), m.ballInVol(ball, 0) > m.ballInVol(ball, 1) ? 'ball>chest' : 'ball>hips');
  note('ball-head', m.ballInVol(ball, 2), 'ball>head');
  for (let i = 0; i < CAPS.length; i++) {
    const c = CAPS[i];
    // a hand the act says is on the ball (or the fingertip it spins on) is meant to touch it
    if (c.member === 'hand' && (an.contact & (c.side > 0 ? 1 : 2) || (an.contact & 4 && c.side === lead))) continue;
    note(c.member === 'hand' ? 'ball-hand' : 'ball-limb', m.ballCap(ball, i), `ball~${c.name}`);
  }
}

// --- the runs -----------------------------------------------------------------------------

const ROLES: StageRole[] = ['captain', 'stretcher', 'handler'];
const VARIANT: Record<StageRole, number> = { captain: 1, stretcher: 4, handler: 7 };

function frame(role: StageRole): ShowFrame {
  const side = role === 'captain' ? 0 : role === 'stretcher' ? -1 : 1;
  return {
    act: 'enter',
    t: 0,
    dur: 1,
    index: 0,
    x: side * 0.8,
    z: side === 0 ? 0.36 : -0.4,
    facing: Math.PI / 2 - side * -0.32,
    hasBall: ROLE_HAS_BALL[role],
    hand: side === 0 ? -1 : side,
    side,
    variety: 0,
    camX: 0,
    camY: 1.9,
    camZ: 12,
    palX: 0,
    palY: 1.2,
    palZ: 0.36,
    dt: DT,
    time: 0,
  };
}

interface Build {
  height: number;
  bulk: number;
  head: number;
}

/** the builds the roster really uses: the tests' two heights, and the slimmest and bulkiest bodies (every player's head is 1) */
export const BUILDS: Build[] = [
  { height: 0.92, bulk: 1, head: 1 },
  { height: 0.92, bulk: 1.22, head: 1 },
  { height: 1.08, bulk: 1, head: 1 },
  { height: 1.08, bulk: 1.22, head: 1 },
];

function label(b: Build): string {
  return `h${b.height} b${b.bulk}`;
}

/** Runs `next(f, time)` for `seconds` at 60 Hz and keeps the worst of every pair in `row`. */
function run(role: StageRole, seconds: number, next: (f: ShowFrame, time: number) => void, b: Build, row: Record<Pair, Worst>): void {
  const an = new FigureAnimator(b, null, null, VARIANT[role]);
  const bones = new Float32Array(BONES);
  const m = new Measure(an, bones, b.height);
  const f = frame(role);
  rowCur = row;
  buildLabel = label(b);
  const n = Math.round(seconds * 60);
  for (let k = 0; k < n; k++) {
    const time = k * DT;
    f.time = time;
    next(f, time);
    an.updateShow(f, bones);
    frameAct = f.act;
    frameT = f.t;
    frameTime = time;
    measureFrame(m, f.hasBall, f.hand);
  }
}

function repeat(act: StageAct): (f: ShowFrame, time: number) => void {
  const dur = ACT_LENGTH[act];
  return (f, time) => {
    const k = Math.floor(time / dur);
    f.act = act;
    f.t = time - k * dur;
    f.dur = dur;
    f.index = k;
    f.variety = k;
  };
}

function playlist(role: StageRole, seed: number): (f: ShowFrame, time: number) => void {
  const actor = ROLES.indexOf(role);
  const slot = newActSlot();
  return (f, time) => {
    actAt(seed, actor, role, time, slot);
    f.act = slot.act;
    f.t = slot.t;
    f.dur = slot.dur;
    f.index = slot.index;
  };
}

/** The playlist with taps: the same bookkeeping as the stage renderer's `poke`. */
function tapped(role: StageRole, seed: number, every: number): (f: ShowFrame, time: number) => void {
  const actor = ROLES.indexOf(role);
  const slot = newActSlot();
  let shift = 0;
  let over = false;
  let overStart = 0;
  let overEnd = 0;
  let count = 0;
  let nextTap = 2.1;
  return (f, time) => {
    if (over && time >= overEnd) over = false;
    if (!over) actAt(seed, actor, role, time - shift, slot);
    if (time >= nextTap) {
      // taps land at uneven moments, so they cut into every part of every act
      nextTap = time + every * (0.55 + 0.9 * (((count * 7919 + 13) % 97) / 97));
      const can = !(!over && slot.act === 'enter');
      if (can) {
        const at = time - shift;
        const resumeAt = over ? at : slot.start + slot.dur;
        over = true;
        overStart = time;
        overEnd = time + ACT_LENGTH.hey;
        count++;
        shift = overEnd - resumeAt;
      }
    }
    if (over) {
      f.act = 'hey';
      f.t = time - overStart;
      f.dur = overEnd - overStart;
      f.index = -count;
    } else {
      f.act = slot.act;
      f.t = slot.t;
      f.dur = slot.dur;
      f.index = slot.index;
    }
    f.variety = count;
  };
}

/** The rest pose: everything the kit's own figure overlaps standing still. */
function restRow(): Record<Pair, Worst> {
  const row = emptyRow();
  for (const b of BUILDS) {
    run(
      'stretcher',
      1,
      (f) => {
        f.act = 'twist';
        f.t = 0;
        f.dur = ACT_LENGTH.twist;
        f.index = 1;
      },
      b,
      row,
    );
  }
  return row;
}

export function audit(full: boolean, only = ''): Table {
  const table: Table = new Map();
  const want = (k: string) => !only || only.split(',').some((w) => k.includes(w));
  if (want('rest')) table.set('rest: standing still', restRow());
  for (const role of ROLES) {
    for (const act of ['enter', 'hey', ...ROLE_ACTS[role]] as StageAct[]) {
      if (!want(`${role}: ${act}`)) continue;
      const row = emptyRow();
      for (const b of BUILDS) run(role, 12, repeat(act), b, row);
      table.set(`${role}: ${act}`, row);
    }
    if (!want(`${role}: playlist`)) continue;
    const row = emptyRow();
    for (const b of full ? BUILDS : BUILDS.slice(0, 1)) for (const seed of full ? [99, 4242] : [99]) run(role, 120, playlist(role, seed), b, row);
    table.set(`${role}: playlist 2 min`, row);
    const tap = emptyRow();
    for (const b of full ? BUILDS : BUILDS.slice(3)) run(role, 120, tapped(role, 99, 2.4), b, tap);
    table.set(`${role}: taps cut in`, tap);
  }
  return table;
}

function fmt(w: Worst): string {
  if (w.d === -Infinity) return '-';
  if (w.d <= 0) return 'clear';
  return `${w.d.toFixed(3)} (${(w.d * CM).toFixed(1)}cm) ${w.what} ${w.act}@${w.t.toFixed(2)}s ${w.build}`;
}

export function printTable(t: Table): string {
  const lines: string[] = [];
  lines.push(`Penetration audit: worst depth per pair, in figure units of a figure 1 tall (cm on a figure 1.2 m tall), the parts, the act and seconds into it, the build.`);
  lines.push(`Proxies from the kit: ${CAPS.map((c) => `${c.name} r${c.r.toFixed(3)}`).join(', ')}; chest loft n${CHEST.n.toFixed(2)} ${CHEST.bot.toFixed(3)}..${CHEST.top.toFixed(3)}; hips loft n${HIPS.n.toFixed(2)}; head ellipsoid c[${HEADV.c.map((v) => v.toFixed(3))}] r[${HEADV.r.map((v) => v.toFixed(3))}]; ball r${BALL.toFixed(3)}.`);
  for (const [k, row] of t) {
    lines.push(`\n== ${k}`);
    for (const p of PAIRS) lines.push(`  ${p.padEnd(11)} ${fmt(row[p])}`);
  }
  return lines.join('\n');
}

// --- the match ---------------------------------------------------------------------------

function attrs(v: Partial<Attrs> = {}): Attrs {
  return { speed: 0.6, shot: 0.6, dunk: 0.6, handle: 0.6, steal: 0.5, block: 0.5, ...v };
}

/** the same moods the match renderer gives its players */
function moodOf(m: MatchState, p: PlayerSim): Mood {
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

/** A computer-only match between two made-up teams: one shooter, one dunker and one ball handler a side. */
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

/** A computer-only match, every player posed each tick through the match path and measured: one row per player state. */
export function matchAudit(seed: number, seconds: number, b: Build = { height: 1, bulk: 1, head: 1 }): Table {
  const table: Table = new Map();
  const meas = new Map<FigureAnimator, Measure>();
  buildLabel = label(b);
  playMatch(testMatch(seed), [b], seconds, (m, k, p, an, bones) => {
    let me = meas.get(an);
    if (!me) {
      me = new Measure(an, bones, b.height);
      meas.set(an, me);
    }
    const key = `match: ${p.state}${p.hasBall ? ' +ball' : ''}`;
    let row = table.get(key);
    if (!row) {
      row = emptyRow();
      table.set(key, row);
    }
    rowCur = row;
    frameAct = `${p.state}/${moodOf(m, p)}`;
    frameT = p.t;
    frameTime = k * SIM_DT;
    measureMatch(me, p.hasBall, m);
  });
  return table;
}

/** In the match the ball belongs to the simulation: the holder's hands are on it, everyone else's are measured against it. */
function measureMatch(me: Measure, holder: boolean, m: MatchState): void {
  const an = me.an;
  me.prepare();
  for (let i = 0; i < CAPS.length; i++) {
    const c = CAPS[i];
    for (let v = 0; v < 3; v++) {
      if (v === 1 && c.member === 'thigh') continue;
      note(v === 2 ? 'limb-head' : 'limb-torso', me.capInVol(i, v), `${c.name}>${VOLS[v].name}`);
    }
    for (let j = i + 1; j < CAPS.length; j++) {
      const e = CAPS[j];
      if (c.side === e.side && c.kind === e.kind) continue;
      const p: Pair = c.kind === 'arm' && e.kind === 'arm' ? 'arm-arm' : c.kind === 'leg' && e.kind === 'leg' ? 'leg-leg' : 'arm-leg';
      note(p, me.capCap(i, j), `${c.name}~${e.name}`);
    }
  }
  const h = me.height;
  an.toWorld(0, 0, 0, P0);
  ball[0] = (drawn.x - P0[0]) / h;
  ball[1] = (drawn.y - P0[1]) / h;
  ball[2] = (drawn.z - P0[2]) / h;
  // only a ball near this player can touch it
  if (Math.hypot(ball[0], ball[1] - 0.8, ball[2]) > 1.6) return;
  const t0 = me.ballInVol(ball, 0);
  const t1 = me.ballInVol(ball, 1);
  note('ball-torso', Math.max(t0, t1), t0 > t1 ? 'ball>chest' : 'ball>hips');
  note('ball-head', me.ballInVol(ball, 2), 'ball>head');
  for (let i = 0; i < CAPS.length; i++) {
    if (holder && CAPS[i].member === 'hand') continue;
    note(CAPS[i].member === 'hand' ? 'ball-hand' : 'ball-limb', me.ballCap(ball, i), `ball~${CAPS[i].name}`);
  }
}

/** where the match draws the ball (the renderer's own rule), and the animation time of the frame */
let drawn = new DrawnBall();
let frameDt = 0;
/** milliseconds spent in the animators' update, over the last match played */
let poseMs = 0;

/**
 * A match posed the way the renderer poses it: one tick, then one frame at the tick (as the runner's `advance` does), with the
 * renderer's kicks on take-offs and landings and its slow motion at the end of a dunk. `each` sees every player after its pose.
 */
function playMatch(cfg: MatchConfig, builds: Build[], seconds: number, each: (m: MatchState, k: number, p: PlayerSim, an: FigureAnimator, bones: Float32Array) => void): void {
  const m = createMatch(cfg);
  const anims = m.players.map((p, i) => new FigureAnimator(builds[i % builds.length], null, null, i * 3 + 1));
  const bones = m.players.map(() => new Float32Array(BONES));
  const f: AnimFrame = { m, p: m.players[0], x: 0, y: 0, z: 0, facing: 0, bx: 0, by: 0, bz: 0, camX: 0, camY: 6, camZ: 20, dt: SIM_DT, lag: 0, time: 0, mood: 'play' };
  const pad = { mx: 0, mz: 0, turbo: false, a: false, b: false, sw: false };
  let slowT = 0;
  drawn = new DrawnBall();
  poseMs = 0;
  const ticks = Math.round(seconds / SIM_DT);
  for (let k = 1; k <= ticks && m.phase !== 'final'; k++) {
    stepMatch(m, pad);
    for (const e of m.events) {
      if (e.type === 'jump') anims[e.by].impulse(1.5);
      else if (e.type === 'land') anims[e.by].impulse(e.hard ? -2.6 : -1.5);
      else if (e.type === 'dunkStart') anims[e.by].impulse(2);
      else if (e.type === 'score' && (e.kind === 'dunk' || e.kind === 'oop')) slowT = 0.16;
    }
    slowT = Math.max(0, slowT - SIM_DT);
    let scale = slowT > 0 ? 0.4 : 1;
    for (const p of m.players) if ((p.state === 'dunk' || p.state === 'oop') && p.t / Math.max(0.01, p.dur) > 0.72) scale = Math.min(scale, 0.5);
    f.time = k * SIM_DT;
    f.dt = SIM_DT * scale;
    f.bx = m.ball.x;
    f.by = m.ball.y;
    f.bz = m.ball.z;
    // the camera sits off the side line, level with the ball
    f.camX = m.ball.x;
    f.camZ = 20;
    for (const p of m.players) {
      f.p = p;
      f.x = p.x;
      f.y = p.y;
      f.z = p.z;
      f.facing = p.facing;
      f.mood = moodOf(m, p);
      const t0 = performance.now();
      anims[p.idx].update(f, bones[p.idx]);
      poseMs += performance.now() - t0;
    }
    const hb = m.ball.state === 'held' ? m.ball.holder : -1;
    drawn.update(m.ball.x, m.ball.y, m.ball.z, hb, hb >= 0 ? anims[hb].ballPush : null, f.dt);
    frameDt = f.dt;
    for (const p of m.players) each(m, k, p, anims[p.idx], bones[p.idx]);
  }
}

/** Every player of a match measured each frame: the worst moments of each state, apart in time, to film. */
function scanMatch(cfg: MatchConfig, builds: Build[], seconds: number): string {
  const meas = new Map<FigureAnimator, Measure>();
  const moments = new Map<string, { x: number; d: number; what: string; k: number; who: number; t: number }[]>();
  const out: string[] = [];
  playMatch(cfg, builds, seconds, (m, k, p, an, bones) => {
    let me = meas.get(an);
    if (!me) {
      me = new Measure(an, bones, builds[p.idx % builds.length].height);
      meas.set(an, me);
    }
    for (const fw of frameWorst) fw.x = -Infinity;
    rowCur = emptyRow();
    measureMatch(me, p.hasBall, m);
    for (let c = 0; c < 3; c++) {
      const fw = frameWorst[c];
      if (fw.x <= 0) continue;
      const kind = c === 0 ? (p.hasBall ? 'held ball' : 'loose ball') : c === 1 ? 'arms' : 'other';
      const key = `[${kind}] ${p.state}${p.hasBall ? ' +ball' : ''}${p.state === 'free' || p.state === 'celebrate' ? ` ${moodOf(m, p)}` : ''}`;
      let list = moments.get(key);
      if (!list) {
        list = [];
        moments.set(key, list);
      }
      // one moment per player per second: keep its worst frame
      const near = list.find((e) => e.who === p.idx && Math.abs(e.k - k) < 60);
      if (near) {
        if (fw.x > near.x) Object.assign(near, { x: fw.x, d: fw.d, what: fw.what, k, t: p.t });
      } else list.push({ x: fw.x, d: fw.d, what: fw.what, k, who: p.idx, t: p.t });
    }
  });
  for (const [key, list] of [...moments].sort((a, b) => Math.max(...b[1].map((e) => e.x)) - Math.max(...a[1].map((e) => e.x)))) {
    list.sort((a, b) => b.x - a.x);
    out.push(`${key}: ${list.length} moments`);
    for (const e of list.slice(0, 6)) out.push(`  tick ${e.k} (${(e.k * SIM_DT).toFixed(2)}s) p${e.who} t=${e.t.toFixed(2)} ${e.what} ${(e.d * CM).toFixed(1)}cm (+${(e.x * CM).toFixed(1)})`);
  }
  return out.join('\n');
}

interface MatchWorst {
  /** depth (figure units of a figure 1 tall) and what */
  d: number;
  what: string;
  time: number;
  state: string;
}

interface MatchCheck {
  /** the held ball in its holder's head or body */
  heldBall: MatchWorst;
  /** the holder's forearms and hands in its own head or body */
  holderArms: MatchWorst;
  /** anyone's upper arms, forearms and hands in their own head or body, past what the warm-up allows */
  arms: MatchWorst;
  /** the widest gap between a hand posed on the held ball and the ball, once the hold has settled (95th percentile, and the worst) */
  handGap95: number;
  handGap: MatchWorst;
  /** the drawn ball against the simulation's: the most it moved off in one frame after a release (world), and how far off it still was so long after one */
  releaseStep: number;
  releaseAt: string;
  lateOff: number;
  /** the dunks: how far (world, across) the drawn ball is from the middle of the rim as the simulation drops it through */
  rim: number[];
  /** a dribble low by the floor: how far the drawn ball is from the simulation's */
  dribbleLow: number;
  /** the same three, frame by frame: what 1 player-frame in 200 goes past */
  heldBall995: number;
  holderArms995: number;
  arms995: number;
  /** the elbows and wrists frame to frame (figure space): the biggest change of step between frames, and the 1-in-1000 one (kit units) */
  jerk: MatchWorst;
  jerk999: number;
  jerk99: number;
  /** seconds spent posing (all six players), and frames */
  poseMs: number;
  frames: number;
}

/** The match checks: arms and the held ball against their own body, and the drawn ball against the simulation's. */
function matchCheck(cfg: MatchConfig, builds: Build[], seconds: number, every = 1, late = DRAWN_BALL_BLEND): MatchCheck {
  const w = (): MatchWorst => ({ d: -Infinity, what: '', time: 0, state: '' });
  const r: MatchCheck = { heldBall: w(), holderArms: w(), arms: w(), heldBall995: 0, holderArms995: 0, arms995: 0, handGap95: 0, handGap: w(), jerk: w(), jerk999: 0, jerk99: 0, releaseStep: 0, releaseAt: '', lateOff: 0, rim: [], dribbleLow: 0, poseMs: 0, frames: 0 };
  const meas = new Map<FigureAnimator, Measure>();
  const gaps: number[] = [];
  const armsAll: number[] = [];
  const holderAll: number[] = [];
  const ballAll: number[] = [];
  let since = Infinity;
  let lastOff = 0;
  let prevHolder = -1;
  let lastK = -1;
  const jerks: number[] = [];
  // the ends of the forearms: elbows and wrists
  const joints = CAPS.filter((c) => c.member === 'fore').flatMap((c) => [{ bone: c.bone, q: c.a }, { bone: c.bone, q: c.b }]);
  const hist = new Map<number, Float64Array>();
  const jd = new Float64Array(3);
  const put = (o: MatchWorst, d: number, what: string, k: number, p: PlayerSim) => {
    if (d > o.d) Object.assign(o, { d, what, time: k * SIM_DT, state: `${p.state}${p.hasBall ? ' +ball' : ''} p${p.idx} t=${p.t.toFixed(2)}` });
  };
  playMatch(cfg, builds, seconds, (m, k, p, an, bones) => {
    let me = meas.get(an);
    if (!me) {
      me = new Measure(an, bones, builds[p.idx % builds.length].height);
      meas.set(an, me);
    }
    if (k !== lastK) {
      // once a frame: the drawn ball against the simulation's
      lastK = k;
      const b = m.ball;
      const holder = b.state === 'held' ? b.holder : -1;
      const off = Math.hypot(drawn.x - b.x, drawn.y - b.y, drawn.z - b.z);
      if (holder < 0) {
        since = prevHolder >= 0 ? frameDt : since + frameDt;
        if (since >= late) r.lateOff = Math.max(r.lateOff, off);
        else if (Math.abs(off - lastOff) > r.releaseStep) {
          r.releaseStep = Math.abs(off - lastOff);
          r.releaseAt = `${(k * SIM_DT).toFixed(2)}s ${b.state} by p${prevHolder >= 0 ? prevHolder : b.lastHolder}`;
        }
      } else if (b.y < BALL_R + 0.03 && m.players[holder].state === 'free') r.dribbleLow = Math.max(r.dribbleLow, off);
      // the simulation drops a dunk through the middle of the rim
      if (prevHolder >= 0 && holder < 0 && b.z === 0 && Math.abs(Math.abs(b.x) - COURT.hoopX) < 1e-9 && b.y > COURT.rimY - 0.2) r.rim.push(Math.hypot(drawn.x - b.x, drawn.z - b.z));
      prevHolder = holder;
      lastOff = off;
      r.frames++;
    }
    // elbows and wrists: the change of their step from one frame to the next (kit units)
    let hs = hist.get(p.idx);
    if (!hs) {
      hs = new Float64Array(joints.length * 6).fill(NaN);
      hist.set(p.idx, hs);
    }
    let fj = 0;
    const to = KIT_BONE_INDEX.torso * 16;
    for (let j = 0; j < joints.length; j++) {
      const o = joints[j].bone * 16;
      const jq = joints[j].q;
      // in the chest's own frame, so that the whole figure moving, turning or landing does not count
      for (let c = 0; c < 3; c++) jd[c] = bones[o + c] * jq[0] + bones[o + 4 + c] * jq[1] + bones[o + 8 + c] * jq[2] + bones[o + 12 + c] - (bones[to + 4 + c] * 0.525 + bones[to + 12 + c]);
      let q = 0;
      for (let c = 0; c < 3; c++) {
        const cx = bones[to + c * 4];
        const cy = bones[to + c * 4 + 1];
        const cz = bones[to + c * 4 + 2];
        const x = (cx * jd[0] + cy * jd[1] + cz * jd[2]) / (cx * cx + cy * cy + cz * cz);
        const a = hs[j * 6 + c];
        const b = hs[j * 6 + 3 + c];
        q += (x - 2 * a + b) ** 2;
        hs[j * 6 + 3 + c] = a;
        hs[j * 6 + c] = x;
      }
      if (q === q) fj = Math.max(fj, Math.sqrt(q));
    }
    jerks.push(fj);
    put(r.jerk, fj, 'elbow/wrist', k, p);
    if (k % every !== 0) return;
    me.prepare();
    let fa = -Infinity;
    let fh = -Infinity;
    for (let i = 0; i < CAPS.length; i++) {
      const c = CAPS[i];
      if (c.kind !== 'arm') continue;
      for (let v = 0; v < 3; v++) {
        const what = `${c.name}>${VOLS[v].name}`;
        const x = me.capInVol(i, v) - allowed(v === 2 ? 'limb-head' : 'limb-torso', what);
        put(r.arms, x, what, k, p);
        fa = Math.max(fa, x);
        if (p.hasBall && c.member !== 'up') {
          put(r.holderArms, x, what, k, p);
          fh = Math.max(fh, x);
        }
      }
    }
    armsAll.push(fa);
    if (!p.hasBall) return;
    holderAll.push(fh);
    const h = me.height;
    an.toWorld(0, 0, 0, P0);
    ball[0] = (drawn.x - P0[0]) / h;
    ball[1] = (drawn.y - P0[1]) / h;
    ball[2] = (drawn.z - P0[2]) / h;
    let fb = -Infinity;
    for (let v = 0; v < 3; v++) {
      const x = me.ballInVol(ball, v) - allowed(v === 2 ? 'ball-head' : 'ball-torso', '');
      put(r.heldBall, x, `ball>${VOLS[v].name}`, k, p);
      fb = Math.max(fb, x);
    }
    ballAll.push(fb);
    // hands on the ball, once the hold has settled (a hand blends onto the ball over a few frames when the pose changes)
    const off = (an as unknown as { off: Float32Array }).off;
    for (let i = 0; i < CAPS.length; i++) {
      const c = CAPS[i];
      if (c.member !== 'hand' || !(an.contact & (c.side > 0 ? 1 : 2))) continue;
      const o = c.side > 0 ? 12 : 15;
      if (Math.hypot(off[o], off[o + 1], off[o + 2]) > 0.01) continue;
      const gap = -me.ballCap(ball, i);
      gaps.push(gap);
      put(r.handGap, gap, `${c.name} off the ball`, k, p);
    }
  });
  r.handGap95 = gaps.length ? pct(gaps, 0.95) : 0;
  r.jerk999 = pct(jerks, 0.999);
  r.jerk99 = pct(jerks, 0.99);
  r.arms995 = pct(armsAll, 0.995);
  r.holderArms995 = pct(holderAll, 0.995);
  r.heldBall995 = pct(ballAll, 0.995);
  r.poseMs = poseMs;
  return r;
}

// --- the checks ---------------------------------------------------------------------------

const report = process.env.CLIP_REPORT;
const matchReport = process.env.CLIP_MATCH;

function verdict(): string {
  if (excess.d <= 0) return 'within limits';
  return `${excess.what} is ${excess.d.toFixed(3)} past its limit at ${excess.act}@${excess.t.toFixed(2)}s (${excess.build}, ${excess.time.toFixed(2)}s in)`;
}

/** a short, broad build and a tall, slim one: the two ends of the roster */
const LOCK: Build[] = [BUILDS[1], BUILDS[2]];

const CASES: [StageRole, StageAct][] = [];
for (const role of ROLES) for (const act of ['enter', 'hey', ...ROLE_ACTS[role]] as StageAct[]) CASES.push([role, act]);

describe('warm-up figures keep their parts out of each other', () => {
  it('standing still, the stand-ins for the body, the head and the limbs do not overlap', () => {
    const row = restRow();
    for (const p of PAIRS) expect([p, row[p].d <= 0.01 ? 'clear' : fmt(row[p])]).toEqual([p, 'clear']);
  });

  it.each(CASES)('%s: %s over and over keeps hands, arms, legs and the ball out of the body, the head and each other', (role, act) => {
    resetExcess();
    const row = emptyRow();
    for (const b of LOCK) run(role, 12, repeat(act), b, row);
    expect(verdict()).toBe('within limits');
  });

  it.each(ROLES)('%s: a minute of the real playlist, blends from act to act included, stays within the limits', (role) => {
    resetExcess();
    run(role, 60, playlist(role, 99), LOCK[0], emptyRow());
    expect(verdict()).toBe('within limits');
  }, 30000);

  it.each(ROLES)('%s: taps cutting into any act at any moment do not drive a hand or the ball through the body', (role) => {
    resetExcess();
    run(role, 60, tapped(role, 99, 2.4), LOCK[1], emptyRow());
    expect(verdict()).toBe('within limits');
  }, 30000);

  it("the animator's guard keeps parts out of shapes that match the kit's chest, shorts and head", () => {
    const at = (L: Loft, arr: Float64Array, y: number) => {
      if (y <= L.y[0]) return arr[0];
      for (let k = 1; k < L.y.length; k++) if (y <= L.y[k]) return arr[k - 1] + ((arr[k] - arr[k - 1]) * (y - L.y[k - 1])) / (L.y[k] - L.y[k - 1]);
      return arr[L.y.length - 1];
    };
    for (const [g, L] of [
      [GUARD_SHAPES.chest, CHEST],
      [GUARD_SHAPES.hips, HIPS],
    ] as const) {
      expect(Math.abs(g.n - L.n)).toBeLessThan(0.1);
      expect(Math.abs(g.y[0] - L.bot)).toBeLessThan(0.02);
      expect(Math.abs(g.y[g.y.length - 1] - L.top)).toBeLessThan(0.02);
      // the end slices are where the mesh rounds off, so only the inner ones are held to the slices of the mesh
      for (let i = 1; i < g.y.length - 1; i++) {
        expect([L.name, g.y[i], Math.abs(g.a[i] - at(L, L.a, g.y[i])) < 0.02]).toEqual([L.name, g.y[i], true]);
        expect([L.name, g.y[i], Math.abs(g.b[i] - at(L, L.b, g.y[i])) < 0.02]).toEqual([L.name, g.y[i], true]);
      }
    }
    for (let k = 0; k < 3; k++) {
      expect(Math.abs(GUARD_SHAPES.head.c[k] - HEADV.c[k])).toBeLessThan(0.01);
      expect(Math.abs(GUARD_SHAPES.head.r[k] - HEADV.r[k])).toBeLessThan(0.01);
    }
  });

  it('a forearm sunk into the belly would fail, and a hand resting on the chest would not', () => {
    // the limits themselves: a forearm's thickness in fails, a light touch passes
    const fore = CAPS.find((c) => c.name === 'foreL');
    expect(allowed('limb-torso', 'foreL>chest')).toBeLessThan(fore ? fore.r : 0);
    expect(allowed('limb-torso', 'handL>chest')).toBeGreaterThan(0.02);
  });
});

describe('match figures keep their arms and the held ball out of their own head and body', () => {
  // 45 s of two computer-only matches (seed 7 has a dunk in it), both builds of the warm-up's checks taking turns down the roster, measured every third frame
  // (centimetres of a figure 120 cm tall: before the fix, over a minute of these matches, the held ball went 21-27 cm past its limit, the holder's hands 14 cm and the arms 22-24 cm)
  const SEEDS = [7, 12];
  const runs = new Map<number, MatchCheck>();
  const get = (seed: number) => {
    let r = runs.get(seed);
    if (!r) {
      r = matchCheck(testMatch(seed), LOCK, 45, 3);
      runs.set(seed, r);
    }
    return r;
  };
  const cm = (x: number) => Math.round(x * CM * 10) / 10;
  const at = (o: MatchWorst) => `${o.what} @${o.time.toFixed(2)}s ${o.state}`;

  it.each(SEEDS)('seed %i: the held ball stays out of its holder, and the holder keeps hands and forearms out of its own head and body', (seed) => {
    const r = get(seed);
    expect([cm(r.heldBall.d) <= 2, at(r.heldBall)]).toEqual([true, at(r.heldBall)]);
    expect(cm(r.heldBall995)).toBeLessThanOrEqual(0);
    expect([cm(r.holderArms.d) <= 10, at(r.holderArms)]).toEqual([true, at(r.holderArms)]);
    expect(cm(r.holderArms995)).toBeLessThanOrEqual(5);
  }, 30000);

  it.each(SEEDS)("seed %i: nobody's arms go into their own head or body past the warm-up's limits", (seed) => {
    const r = get(seed);
    // an arm raised high still brushes the underside of the head, which overhangs the shoulders
    expect([cm(r.arms.d) <= 12, at(r.arms)]).toEqual([true, at(r.arms)]);
    expect(cm(r.arms995)).toBeLessThanOrEqual(4);
  }, 30000);

  it.each(SEEDS)('seed %i: hands posed on the held ball stay on it, and a dribble still reaches the floor', (seed) => {
    const r = get(seed);
    expect(cm(r.handGap95)).toBeLessThanOrEqual(2);
    expect([cm(r.handGap.d) <= 7, at(r.handGap)]).toEqual([true, at(r.handGap)]);
    expect(r.dribbleLow).toBeLessThan(0.02);
  }, 30000);

  it.each(SEEDS)(`seed %i: the drawn ball is on the simulation's once nobody has held it for ${DRAWN_BALL_BLEND} s, and gets there smoothly`, (seed) => {
    const r = get(seed);
    expect(r.lateOff).toBe(0);
    expect([r.releaseStep < 0.1, r.releaseAt]).toEqual([true, r.releaseAt]);
  }, 30000);

  it('a dunk drops the drawn ball through the middle of the rim', () => {
    const rim = SEEDS.flatMap((s) => get(s).rim);
    expect(rim.length).toBeGreaterThan(0);
    for (const d of rim) expect(d).toBeLessThan(0.05);
  }, 30000);

  it("the drawn ball: exactly the simulation's when nobody holds it, pushed with its holder, and back on the simulation's path after a release", () => {
    const db = new DrawnBall();
    const push = new Float64Array([0.1, -0.05, 0.2]);
    const dt = 1 / 60;
    db.update(1, 2, 3, -1, null, dt);
    expect([db.x, db.y, db.z]).toEqual([1, 2, 3]);
    // a catch: pushed at once, with no tail from the loose ball
    db.update(1, 2, 3, 2, push, dt);
    expect([db.x, db.y, db.z]).toEqual([1 + 0.1, 2 - 0.05, 3 + 0.2]);
    // a release: the push dies away over DRAWN_BALL_BLEND, never jumping, then the ball is exactly the simulation's
    let last = Math.hypot(0.1, 0.05, 0.2);
    let t = 0;
    for (let k = 0; k < 30; k++) {
      db.update(1 + k * 0.2, 2, 3, -1, null, dt);
      t += dt;
      const off = Math.hypot(db.x - (1 + k * 0.2), db.y - 2, db.z - 3);
      expect(off).toBeLessThanOrEqual(last + 1e-12);
      if (t >= DRAWN_BALL_BLEND) expect([db.x, db.y, db.z]).toEqual([1 + k * 0.2, 2, 3]);
      last = off;
    }
    // a pass from one holder straight to another eases from one push to the other
    db.update(0, 0, 0, 1, push, dt);
    db.update(0, 0, 0, 4, new Float64Array(3), dt);
    expect(Math.hypot(db.x, db.y, db.z)).toBeGreaterThan(0.1);
    for (let k = 0; k < 10; k++) db.update(0, 0, 0, 4, new Float64Array(3), dt);
    expect([db.x, db.y, db.z]).toEqual([0, 0, 0]);
  });
});

describe('penetration audit', () => {
  const check = process.env.CLIP_CHECK;
  if (check) {
    it('writes the match checks', () => {
      const out: string[] = [];
      const [seeds, secs] = (process.env.CLIP_CHECK_ARGS || '7,12:90').split(':');
      for (const seed of seeds.split(',').map(Number)) {
        const t0 = Date.now();
        const r = matchCheck(testMatch(seed), LOCK, Number(secs), Number(process.env.CLIP_CHECK_EVERY || 1));
        const cm = (o: MatchWorst) => `${(o.d * CM).toFixed(1)}cm ${o.what} @${o.time.toFixed(2)}s ${o.state}`;
        out.push(`seed ${seed} (${Date.now() - t0} ms, ${r.frames} frames, posing ${r.poseMs.toFixed(0)} ms)`);
        out.push(`  held ball past limit: ${cm(r.heldBall)}`, `  holder forearms/hands past limit: ${cm(r.holderArms)}`, `  arms past limit: ${cm(r.arms)}`);
        out.push(`  1 in 200 past: held ball ${(r.heldBall995 * CM).toFixed(1)}cm, holder forearms/hands ${(r.holderArms995 * CM).toFixed(1)}cm, arms ${(r.arms995 * CM).toFixed(1)}cm`);
        out.push(`  elbows/wrists, change of step between frames: 1 in 100 ${(r.jerk99 * CM).toFixed(2)}cm, 1 in 1000 ${(r.jerk999 * CM).toFixed(2)}cm, worst ${cm(r.jerk)}`);
        out.push(`  hand gap p95 ${(r.handGap95 * CM).toFixed(1)}cm, worst ${cm(r.handGap)}`);
        out.push(`  release: worst step ${(r.releaseStep * 100).toFixed(1)}cm at ${r.releaseAt}, still off after ${DRAWN_BALL_BLEND}s ${(r.lateOff * 100).toFixed(2)}cm; dribble low off ${(r.dribbleLow * 100).toFixed(2)}cm`);
        out.push(`  dunks: drawn ball from the rim's middle ${r.rim.map((x) => (x * 100).toFixed(1) + 'cm').join(', ')}`);
      }
      fs.writeFileSync(check, out.join('\n') + '\n');
    }, 900000);
  }
  const scan = process.env.CLIP_SCAN;
  if (scan) {
    it('writes the worst moments of a match', () => {
      const src = process.env.CLIP_SCAN_CFG as string;
      const r = src.startsWith('test:') ? { cfg: testMatch(Number(src.slice(5))), builds: LOCK } : (JSON.parse(fs.readFileSync(src, 'utf8')) as { cfg: MatchConfig; builds: Build[] });
      fs.writeFileSync(scan, scanMatch(r.cfg, r.builds, Number(process.env.CLIP_SCAN_S || 600)) + '\n');
    }, 900000);
  }
  if (matchReport) {
    it('writes the match table', () => {
      const out: string[] = [];
      for (const seed of [7, 12]) for (const b of [BUILDS[0], BUILDS[3]]) out.push(`### seed ${seed} ${label(b)}`, printTable(matchAudit(seed, 240, b)));
      fs.writeFileSync(matchReport, out.join('\n') + '\n');
    }, 900000);
  }
  if (report) {
    it('writes the full table', () => {
      const t0 = Date.now();
      const t = audit(true, process.env.CLIP_ONLY);
      console.log(`audit took ${Date.now() - t0} ms`);
      fs.writeFileSync(report, printTable(t) + '\n');
    }, 600000);
  }
});
