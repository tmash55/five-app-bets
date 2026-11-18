/**
 * A tiny mesh builder for scenery: boxes, cylinders, blobs and friends with
 * colour per vertex. Everything a court needs is assembled into one or two
 * meshes so a whole neighbourhood costs a couple of draw calls.
 */

import * as THREE from 'three';

import { hexToRgb } from '../kit/look';

export type Rgb = readonly [number, number, number];

const rgbCache = new Map<string, Rgb>();

export function rgb(hex: string): Rgb {
  let c = rgbCache.get(hex);
  if (!c) {
    c = hexToRgb(hex);
    rgbCache.set(hex, c);
  }
  return c;
}

export function tint(c: Rgb, k: number): Rgb {
  return [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
}

export function blend(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Cheap repeatable noise for lumpy shapes and prop scatter. */
export function hash1(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export class MeshBuilder {
  private pos: number[] = [];
  private nrm: number[] = [];
  private col: number[] = [];
  private ani: number[] = [];
  private idx: number[] = [];
  private count = 0;
  /** current transform: 3x3 (column major) + translation */
  private m: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
  /** matching matrix for normals (inverse transpose, not normalised) */
  private nm: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private stack: number[][] = [];
  private aPhase = 0;
  private aBounce = 0;
  private aSway = 0;

  get vertexCount(): number {
    return this.count;
  }

  /** Enter a local frame: translate, turn about Y, then scale. */
  push(x: number, y: number, z: number, ry = 0, sx = 1, sy = sx, sz = sx): this {
    this.stack.push(this.m.slice(), this.nm.slice());
    const c = Math.cos(ry);
    const s = Math.sin(ry);
    // local = T * Ry * S
    const l = [c * sx, 0, -s * sx, 0, sy, 0, s * sz, 0, c * sz, x, y, z];
    const a = this.m;
    const out = new Array<number>(12);
    for (let k = 0; k < 3; k++) {
      const bx = l[k * 3];
      const by = l[k * 3 + 1];
      const bz = l[k * 3 + 2];
      out[k * 3] = a[0] * bx + a[3] * by + a[6] * bz;
      out[k * 3 + 1] = a[1] * bx + a[4] * by + a[7] * bz;
      out[k * 3 + 2] = a[2] * bx + a[5] * by + a[8] * bz;
    }
    out[9] = a[0] * x + a[3] * y + a[6] * z + a[9];
    out[10] = a[1] * x + a[4] * y + a[7] * z + a[10];
    out[11] = a[2] * x + a[5] * y + a[8] * z + a[11];
    this.m = out;
    // cofactor matrix = inverse transpose up to scale
    const o = out;
    this.nm = [
      o[4] * o[8] - o[5] * o[7],
      o[5] * o[6] - o[3] * o[8],
      o[3] * o[7] - o[4] * o[6],
      o[7] * o[2] - o[8] * o[1],
      o[8] * o[0] - o[6] * o[2],
      o[6] * o[1] - o[7] * o[0],
      o[1] * o[5] - o[2] * o[4],
      o[2] * o[3] - o[0] * o[5],
      o[0] * o[4] - o[1] * o[3],
    ];
    return this;
  }

  pop(): this {
    const nm = this.stack.pop();
    const m = this.stack.pop();
    if (m && nm) {
      this.m = m;
      this.nm = nm;
    }
    return this;
  }

  /** Vertex animation for what follows: phase, bounce height (crowd), sway (leaves). */
  anim(phase = 0, bounce = 0, sway = 0): this {
    this.aPhase = phase;
    this.aBounce = bounce;
    this.aSway = sway;
    return this;
  }

  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, c: Rgb): number {
    const m = this.m;
    const n = this.nm;
    this.pos.push(m[0] * x + m[3] * y + m[6] * z + m[9], m[1] * x + m[4] * y + m[7] * z + m[10], m[2] * x + m[5] * y + m[8] * z + m[11]);
    let ax = n[0] * nx + n[3] * ny + n[6] * nz;
    let ay = n[1] * nx + n[4] * ny + n[7] * nz;
    let az = n[2] * nx + n[5] * ny + n[8] * nz;
    const l = Math.hypot(ax, ay, az) || 1;
    ax /= l;
    ay /= l;
    az /= l;
    this.nrm.push(ax, ay, az);
    this.col.push(c[0], c[1], c[2]);
    this.ani.push(this.aPhase, this.aBounce, this.aSway);
    return this.count++;
  }

  tri(a: number, b: number, c: number): void {
    this.idx.push(a, b, c);
  }

  /** A flat four-sided face; corners counter-clockwise seen from outside. */
  quad(
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    cx: number,
    cy: number,
    cz: number,
    dx: number,
    dy: number,
    dz: number,
    c: Rgb,
    c2: Rgb = c,
  ): void {
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = dx - ax;
    const vy = dy - ay;
    const vz = dz - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const i = this.vert(ax, ay, az, nx, ny, nz, c);
    this.vert(bx, by, bz, nx, ny, nz, c);
    this.vert(cx, cy, cz, nx, ny, nz, c2);
    this.vert(dx, dy, dz, nx, ny, nz, c2);
    this.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }

  /** Box standing on y0, centred on (cx, cz). `top` tints the upper corners for a soft gradient. */
  box(cx: number, y0: number, cz: number, w: number, h: number, d: number, c: Rgb, top: Rgb = c): void {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    const y1 = y0 + h;
    this.quad(x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, c, top); // front (+z)
    this.quad(x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, c, top); // back
    this.quad(x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1, c, top); // right (+x)
    this.quad(x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0, c, top); // left
    this.quad(x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0, top, top); // top
    this.quad(x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1, c, c); // bottom
  }

  /** Upright cylinder or cone: radius r0 at the bottom, r1 at the top. */
  cyl(cx: number, y0: number, cz: number, r0: number, r1: number, h: number, segs: number, c: Rgb, top: Rgb = c, caps = true): void {
    const slope = (r0 - r1) / h;
    const base = this.count;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      this.vert(cx + ca * r0, y0, cz + sa * r0, ca, slope, sa, c);
      this.vert(cx + ca * r1, y0 + h, cz + sa * r1, ca, slope, sa, top);
    }
    for (let i = 0; i < segs; i++) {
      const a = base + i * 2;
      this.idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    if (!caps) return;
    if (r1 > 1e-4) {
      const ct = this.vert(cx, y0 + h, cz, 0, 1, 0, top);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        this.vert(cx + Math.cos(a) * r1, y0 + h, cz + Math.sin(a) * r1, 0, 1, 0, top);
      }
      for (let i = 0; i < segs; i++) this.idx.push(ct, ct + 2 + i, ct + 1 + i);
    }
    if (r0 > 1e-4) {
      const cb = this.vert(cx, y0, cz, 0, -1, 0, c);
      for (let i = 0; i <= segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        this.vert(cx + Math.cos(a) * r0, y0, cz + Math.sin(a) * r0, 0, -1, 0, c);
      }
      for (let i = 0; i < segs; i++) this.idx.push(cb, cb + 1 + i, cb + 2 + i);
    }
  }

  /** Ellipsoid. `lump` > 0 makes it knobbly (foliage, clouds, rocks); `top` gives a vertical gradient. */
  ball(
    cx: number,
    cy: number,
    cz: number,
    rx: number,
    ry: number,
    rz: number,
    segs: number,
    rings: number,
    c: Rgb,
    top: Rgb = c,
    lump = 0,
    seed = 0,
  ): void {
    const base = this.count;
    for (let j = 0; j <= rings; j++) {
      const v = j / rings;
      const th = v * Math.PI;
      const sy = Math.cos(th);
      const sr = Math.sin(th);
      const cc = blend(c, top, clamp01(0.5 + sy * 0.6));
      for (let i = 0; i <= segs; i++) {
        const a = ((i % segs) / segs) * Math.PI * 2;
        const dx = Math.cos(a) * sr;
        const dz = Math.sin(a) * sr;
        let k = 1;
        if (lump > 0 && j > 0 && j < rings) {
          k += lump * (hash1(seed * 13.1 + (i % segs) * 3.7 + j * 9.3) - 0.5) * 2;
        }
        this.vert(cx + dx * rx * k, cy + sy * ry * k, cz + dz * rz * k, dx / rx, sy / ry, dz / rz, cc);
      }
    }
    const row = segs + 1;
    for (let j = 0; j < rings; j++) {
      for (let i = 0; i < segs; i++) {
        const a = base + j * row + i;
        const b = a + row;
        if (j > 0) this.idx.push(a, a + 1, b + 1);
        if (j < rings - 1) this.idx.push(a, b + 1, b);
      }
    }
  }

  /** Ring lying flat (axis up): the rim. */
  torus(cx: number, cy: number, cz: number, R: number, r: number, segs: number, tube: number, c: Rgb): void {
    const base = this.count;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      for (let j = 0; j <= tube; j++) {
        const t = (j / tube) * Math.PI * 2;
        const ct = Math.cos(t);
        const st = Math.sin(t);
        this.vert(cx + ca * (R + r * ct), cy + r * st, cz + sa * (R + r * ct), ca * ct, st, sa * ct, c);
      }
    }
    const row = tube + 1;
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < tube; j++) {
        const a = base + i * row + j;
        const b = a + row;
        this.idx.push(a, a + 1, b + 1, a, b + 1, b);
      }
    }
  }

  /** Gable roof: ridge along X. */
  roof(cx: number, y0: number, cz: number, w: number, h: number, d: number, c: Rgb, end: Rgb = c): void {
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    const y1 = y0 + h;
    this.quad(x0, y0, z1, x1, y0, z1, x1, y1, cz, x0, y1, cz, tint(c, 0.94), c);
    this.quad(x1, y0, z0, x0, y0, z0, x0, y1, cz, x1, y1, cz, tint(c, 0.86), tint(c, 0.92));
    // gable ends
    let i = this.vert(x1, y0, z1, 1, 0, 0, end);
    this.vert(x1, y0, z0, 1, 0, 0, end);
    this.vert(x1, y1, cz, 1, 0, 0, end);
    this.idx.push(i, i + 1, i + 2);
    i = this.vert(x0, y0, z0, -1, 0, 0, end);
    this.vert(x0, y0, z1, -1, 0, 0, end);
    this.vert(x0, y1, cz, -1, 0, 0, end);
    this.idx.push(i, i + 1, i + 2);
  }

  /** Flat disc facing up. */
  disc(cx: number, y: number, cz: number, r: number, segs: number, c: Rgb): void {
    const ct = this.vert(cx, y, cz, 0, 1, 0, c);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      this.vert(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r, 0, 1, 0, c);
    }
    for (let i = 0; i < segs; i++) this.idx.push(ct, ct + 2 + i, ct + 1 + i);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nrm), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    g.setAttribute('anim', new THREE.BufferAttribute(new Float32Array(this.ani), 3));
    g.setIndex(new THREE.BufferAttribute(this.count > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx), 1));
    g.computeBoundingSphere();
    return g;
  }
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}
