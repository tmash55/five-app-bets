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
 * `CLIP_REPORT=<file> npx jest clip` also writes the full table to a file.
 */

import fs from 'fs';

import { getPart, KIT_BONE_INDEX, KIT_METRICS } from '../../kit/kit';
import { DT as SIM_DT } from '../../sim/constants';
import { createMatch, stepMatch } from '../../sim/sim';
import type { Attrs, MatchState, PlayerSim } from '../../sim/types';
import { ACT_LENGTH, ROLE_ACTS, ROLE_HAS_BALL, actAt, newActSlot, type StageAct, type StageRole } from '../../stage/director';
import { FigureAnimator, type AnimFrame, type Mood, type ShowFrame } from '../animator';

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

function note(p: Pair, d: number, what: string): void {
  const x = d - allowed(p, what);
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

/** A computer-only match, every player posed each tick through the match path and measured: one row per player state. */
export function matchAudit(seed: number, seconds: number, b: Build = { height: 1, bulk: 1, head: 1 }): Table {
  const team = () => ({
    players: [
      { id: 'a', attrs: attrs({ shot: 0.85, dunk: 0.35 }) },
      { id: 'b', attrs: attrs({ dunk: 0.9, shot: 0.4 }) },
      { id: 'c', attrs: attrs({ speed: 0.85, handle: 0.85 }) },
    ],
  });
  const m = createMatch({ seed, teams: [team(), team()], userTeam: -1, quarters: 4, quarterSeconds: 60, difficulty: 0.6, mateSkill: 0.6, timingAssist: 1, rubberBand: 0, autoSwitch: true });
  const anims = m.players.map((p, i) => new FigureAnimator(b, null, null, 1 + i * 3));
  const bones = m.players.map(() => new Float32Array(BONES));
  const meas = anims.map((an, i) => new Measure(an, bones[i], b.height));
  const table: Table = new Map();
  const f: AnimFrame = { m, p: m.players[0], x: 0, y: 0, z: 0, facing: 0, bx: 0, by: 0, bz: 0, camX: 0, camY: 6, camZ: 20, dt: SIM_DT, lag: 0, time: 0, mood: 'play' };
  buildLabel = label(b);
  const ticks = Math.round(seconds / SIM_DT);
  for (let k = 0; k < ticks && m.phase !== 'final'; k++) {
    stepMatch(m, { mx: 0, mz: 0, turbo: false, a: false, b: false, sw: false });
    f.time = k * SIM_DT;
    f.bx = m.ball.x;
    f.by = m.ball.y;
    f.bz = m.ball.z;
    for (const p of m.players) {
      f.p = p;
      f.x = p.x;
      f.y = p.y;
      f.z = p.z;
      f.facing = p.facing;
      f.mood = moodOf(m, p);
      const an = anims[p.idx];
      an.update(f, bones[p.idx]);
      const key = `match: ${p.state}${p.hasBall ? ' +ball' : ''}`;
      let row = table.get(key);
      if (!row) {
        row = emptyRow();
        table.set(key, row);
      }
      rowCur = row;
      frameAct = `${p.state}/${f.mood}`;
      frameT = p.t;
      frameTime = f.time;
      measureMatch(meas[p.idx], p.hasBall, m);
    }
  }
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
  ball[0] = (m.ball.x - P0[0]) / h;
  ball[1] = (m.ball.y - P0[1]) / h;
  ball[2] = (m.ball.z - P0[2]) / h;
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

  it('a forearm sunk into the belly would fail, and a hand resting on the chest would not', () => {
    // the limits themselves: a forearm's thickness in fails, a light touch passes
    const fore = CAPS.find((c) => c.name === 'foreL');
    expect(allowed('limb-torso', 'foreL>chest')).toBeLessThan(fore ? fore.r : 0);
    expect(allowed('limb-torso', 'handL>chest')).toBeGreaterThan(0.02);
  });
});

describe('penetration audit', () => {
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

const dbg = process.env.CLIP_DEBUG;
if (dbg) {
  it('debug one frame', () => {
    const [role, act, ts, hs, bs] = dbg.split(':');
    const b = { height: Number(hs || 1), bulk: Number(bs || 1), head: 1 };
    const an = new FigureAnimator(b, null, null, VARIANT[role as StageRole]);
    const bones = new Float32Array(BONES);
    const m = new Measure(an, bones, b.height);
    const f = frame(role as StageRole);
    const T = Number(ts);
    const n = Math.round(T * 60);
    for (let k = 0; k <= n; k++) {
      f.time = k * DT;
      repeat(act as StageAct)(f, f.time);
      an.updateShow(f, bones);
    }
    m.prepare();
    const out: string[] = [];
    for (let i = 0; i < CAPS.length; i++) {
      const v = [0, 1, 2].map((q) => m.capInVol(i, q).toFixed(3)).join(' ');
      out.push(`${CAPS[i].name} A ${Array.from(capA.slice(i * 3, i * 3 + 3), (x) => x.toFixed(3))} B ${Array.from(capB.slice(i * 3, i * 3 + 3), (x) => x.toFixed(3))} r ${capR[i].toFixed(3)} chest/hips/head ${v}`);
      if (m.capInVol(i, 0) > 0.02) out.push(`   along chest: ${[0, 0.2, 0.4, 0.6, 0.8, 1].map((s) => (capR[i] - m.sd(0, capA[i * 3] + (capB[i * 3] - capA[i * 3]) * s, capA[i * 3 + 1] + (capB[i * 3 + 1] - capA[i * 3 + 1]) * s, capA[i * 3 + 2] + (capB[i * 3 + 2] - capA[i * 3 + 2]) * s)).toFixed(3)).join(' ')}`);
    }
    const tab = (L: Loft) => Array.from(L.y, (y, k) => `${y.toFixed(3)}:${L.a[k].toFixed(3)}/${L.b[k].toFixed(3)}/${L.cz[k].toFixed(3)}`).join(' ');
    out.push(`chest ${tab(CHEST)}`);
    out.push(`hips ${tab(HIPS)}`);
    if (f.hasBall) {
      an.toWorld(0, 0, 0, P0);
      const bw = new Float64Array([(an.ball[0] - P0[0]) / b.height, (an.ball[1] - P0[1]) / b.height, (an.ball[2] - P0[2]) / b.height]);
      out.push(`contact ${an.contact} ball~hands ${CAPS.filter((c) => c.member === 'hand').map((c) => m.ballCap(bw, CAPS.indexOf(c)).toFixed(3))}`);
    }
    out.push(`chest origin ${Array.from(volT[0], (x) => x.toFixed(3))}`);
    for (const nm of ['upL', 'upR']) {
      const i = CAPS.findIndex((c) => c.name === nm);
      for (const e of [capA, capB]) {
        mul3(Pi, e[i * 3] * b.height, e[i * 3 + 1] * b.height, e[i * 3 + 2] * b.height, tmp);
        const hs = 1 / Math.pow(b.height, 0.6);
        const push = (an as unknown as { bodyPush: (x: number, y: number, z: number, r: number, hs: number, hsx: number) => number }).bodyPush(tmp[0], tmp[1], tmp[2], 0.07, hs, hs / b.bulk);
        out.push(`guard ${nm} fig ${Array.from(tmp, (x) => x.toFixed(3))} push ${push.toFixed(3)}`);
      }
    }
    console.log(out.join('\n'));
  });
}

const dbg2 = process.env.CLIP_DEBUG2;
if (dbg2) {
  it('debug taps', () => {
    const [role, hs, bs] = dbg2.split(':');
    const b = { height: Number(hs), bulk: Number(bs), head: 1 };
    const row = emptyRow();
    run(role as StageRole, 120, tapped(role as StageRole, 99, 2.4), b, row);
    const w = row['limb-torso'];
    const out = [`worst ${w.d} ${w.what} at stage ${w.time} ${w.act}@${w.t}`];
    // replay and print a few frames round it
    const an = new FigureAnimator(b, null, null, VARIANT[role as StageRole]);
    const bones = new Float32Array(BONES);
    const m = new Measure(an, bones, b.height);
    const f = frame(role as StageRole);
    const next = tapped(role as StageRole, 99, 2.4);
    const n = Math.round(w.time * 60) + 3;
    for (let k = 0; k <= n; k++) {
      f.time = k * DT;
      next(f, f.time);
      an.updateShow(f, bones);
      if (k >= n - 6) {
        m.prepare();
        const ci = CAPS.findIndex((c) => w.what.startsWith(c.name + '>'));
        const cu = (an as unknown as { cur: Float32Array }).cur;
        out.push(`   cur ${Array.from(cu.slice(0, 26), (x) => x.toFixed(2)).join(' ')}`);
        out.push(`k${k} ${f.act}@${f.t.toFixed(3)} idx ${f.index} pen ${m.capInVol(ci, 0).toFixed(3)} A ${Array.from(capA.slice(ci * 3, ci * 3 + 3), (x) => x.toFixed(3))} B ${Array.from(capB.slice(ci * 3, ci * 3 + 3), (x) => x.toFixed(3))}`);
      }
    }
    console.log(out.join('\n'));
  }, 120000);
}

const sweep = process.env.CLIP_SWEEP;
if (sweep) {
  it('sweep', () => {
    const out: string[] = [];
    for (const combo of JSON.parse(sweep) as number[][]) {
      (globalThis as any).__P = combo;
      const t = audit(false, process.env.CLIP_ONLY);
      for (const [k, row] of t) out.push(`${combo.join(',')} ${k} ${PAIRS.map((p) => `${p} ${row[p].d > 0 ? row[p].d.toFixed(3) : '-'}`).join(' ')}`);
    }
    console.log(out.join('\n'));
  }, 900000);
}
