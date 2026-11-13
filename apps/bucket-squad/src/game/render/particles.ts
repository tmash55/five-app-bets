/**
 * One pooled particle system for everything that pops, puffs or sparkles:
 * shoe dust, sparkle bursts, confetti, flames and the ball's trail.
 */

import * as THREE from 'three';

import type { Rgb } from './geo';
import { PARTICLE_FRAG, PARTICLE_VERT } from './shaders';

export const SHAPE_SOFT = 0;
export const SHAPE_SQUARE = 1;
export const SHAPE_SPARKLE = 2;
/** a flame tongue: round at the bottom, drawn up to a point, with a pale hot heart; keep `spin` at 0 so it points up */
export const SHAPE_FLAME = 3;

export interface ParticleSpec {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size: number;
  /** size multiplier reached at the end of life */
  grow?: number;
  color: Rgb;
  alpha?: number;
  gravity?: number;
  drag?: number;
  spin?: number;
  spinV?: number;
  shape?: number;
}

const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1];

export class Particles {
  readonly mesh: THREE.Mesh;
  private readonly max: number;
  private n = 0;
  private readonly px: Float32Array;
  private readonly py: Float32Array;
  private readonly pz: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size: Float32Array;
  private readonly grow: Float32Array;
  private readonly cr: Float32Array;
  private readonly cg: Float32Array;
  private readonly cb: Float32Array;
  private readonly ca: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly rot: Float32Array;
  private readonly rotV: Float32Array;
  private readonly shape: Float32Array;
  private readonly aPos: THREE.BufferAttribute;
  private readonly aCol: THREE.BufferAttribute;
  private readonly aCorner: THREE.BufferAttribute;
  private readonly aSpin: THREE.BufferAttribute;
  private seed = 1;

  constructor(max = 320) {
    this.max = max;
    const f = () => new Float32Array(max);
    this.px = f();
    this.py = f();
    this.pz = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.age = f();
    this.life = f();
    this.size = f();
    this.grow = f();
    this.cr = f();
    this.cg = f();
    this.cb = f();
    this.ca = f();
    this.grav = f();
    this.drag = f();
    this.rot = f();
    this.rotV = f();
    this.shape = f();
    const g = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(new Float32Array(max * 12), 3);
    this.aCol = new THREE.BufferAttribute(new Float32Array(max * 16), 4);
    this.aCorner = new THREE.BufferAttribute(new Float32Array(max * 12), 3);
    this.aSpin = new THREE.BufferAttribute(new Float32Array(max * 8), 2);
    for (const a of [this.aPos, this.aCol, this.aCorner, this.aSpin]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.aPos);
    g.setAttribute('color', this.aCol);
    g.setAttribute('corner', this.aCorner);
    g.setAttribute('spin', this.aSpin);
    const idx = new Uint16Array(max * 6);
    for (let i = 0; i < max; i++) {
      idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    }
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.setDrawRange(0, 0);
    const mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
  }

  /** A cheap private random stream so effects never disturb the match's own. */
  rand(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  spawn(s: ParticleSpec): void {
    let i = this.n;
    if (i >= this.max) {
      // full: recycle the oldest
      let oldest = 0;
      let best = -1;
      for (let k = 0; k < this.max; k++) {
        const r = this.age[k] / this.life[k];
        if (r > best) {
          best = r;
          oldest = k;
        }
      }
      i = oldest;
    } else {
      this.n++;
    }
    this.px[i] = s.x;
    this.py[i] = s.y;
    this.pz[i] = s.z;
    this.vx[i] = s.vx ?? 0;
    this.vy[i] = s.vy ?? 0;
    this.vz[i] = s.vz ?? 0;
    this.age[i] = 0;
    this.life[i] = s.life;
    this.size[i] = s.size;
    this.grow[i] = s.grow ?? 1;
    this.cr[i] = s.color[0];
    this.cg[i] = s.color[1];
    this.cb[i] = s.color[2];
    this.ca[i] = s.alpha ?? 1;
    this.grav[i] = s.gravity ?? 0;
    this.drag[i] = s.drag ?? 0;
    this.rot[i] = s.spin ?? 0;
    this.rotV[i] = s.spinV ?? 0;
    this.shape[i] = s.shape ?? SHAPE_SOFT;
  }

  /** Puffs kicked up at floor level. */
  dust(x: number, z: number, count: number, color: Rgb, power = 1): void {
    for (let k = 0; k < count; k++) {
      const a = this.rand() * Math.PI * 2;
      const sp = (0.5 + this.rand() * 1.1) * power;
      this.spawn({
        x: x + Math.cos(a) * 0.12,
        y: 0.06 + this.rand() * 0.08,
        z: z + Math.sin(a) * 0.12,
        vx: Math.cos(a) * sp,
        vy: 0.3 + this.rand() * 0.5,
        vz: Math.sin(a) * sp,
        life: 0.32 + this.rand() * 0.22,
        size: 0.1 + this.rand() * 0.08,
        grow: 2.6,
        color,
        alpha: 0.5,
        drag: 3.5,
      });
    }
  }

  /** Sparkles flying out from a point. */
  burst(x: number, y: number, z: number, count: number, colors: Rgb[], speed: number, size = 0.16): void {
    for (let k = 0; k < count; k++) {
      const a = this.rand() * Math.PI * 2;
      const e = (this.rand() - 0.3) * 1.6;
      const sp = speed * (0.45 + this.rand() * 0.75);
      this.spawn({
        x,
        y,
        z,
        vx: Math.cos(a) * Math.cos(e) * sp,
        vy: Math.sin(e) * sp + speed * 0.35,
        vz: Math.sin(a) * Math.cos(e) * sp,
        life: 0.4 + this.rand() * 0.4,
        size: size * (0.7 + this.rand() * 0.7),
        grow: 0.3,
        color: colors[Math.floor(this.rand() * colors.length)],
        gravity: -7,
        drag: 1.6,
        spin: this.rand() * 3,
        spinV: (this.rand() - 0.5) * 8,
        shape: SHAPE_SPARKLE,
      });
    }
  }

  confetti(x: number, y: number, z: number, count: number, colors: Rgb[], spread = 2.4): void {
    for (let k = 0; k < count; k++) {
      const a = this.rand() * Math.PI * 2;
      const sp = spread * (0.3 + this.rand());
      this.spawn({
        x: x + (this.rand() - 0.5) * 0.4,
        y: y + (this.rand() - 0.5) * 0.3,
        z: z + (this.rand() - 0.5) * 0.4,
        vx: Math.cos(a) * sp,
        vy: 2.5 + this.rand() * 4,
        vz: Math.sin(a) * sp,
        life: 1.3 + this.rand() * 0.9,
        size: 0.06 + this.rand() * 0.05,
        color: colors[Math.floor(this.rand() * colors.length)],
        gravity: -5.5,
        drag: 1.8,
        spin: this.rand() * 6,
        spinV: (this.rand() - 0.5) * 16,
        shape: SHAPE_SQUARE,
      });
    }
  }

  update(dt: number): void {
    let n = this.n;
    for (let i = 0; i < n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        // swap the last live particle into this slot
        n--;
        if (i !== n) {
          this.px[i] = this.px[n];
          this.py[i] = this.py[n];
          this.pz[i] = this.pz[n];
          this.vx[i] = this.vx[n];
          this.vy[i] = this.vy[n];
          this.vz[i] = this.vz[n];
          this.age[i] = this.age[n];
          this.life[i] = this.life[n];
          this.size[i] = this.size[n];
          this.grow[i] = this.grow[n];
          this.cr[i] = this.cr[n];
          this.cg[i] = this.cg[n];
          this.cb[i] = this.cb[n];
          this.ca[i] = this.ca[n];
          this.grav[i] = this.grav[n];
          this.drag[i] = this.drag[n];
          this.rot[i] = this.rot[n];
          this.rotV[i] = this.rotV[n];
          this.shape[i] = this.shape[n];
        }
        i--;
        continue;
      }
      const k = Math.max(0, 1 - this.drag[i] * dt);
      this.vx[i] *= k;
      this.vy[i] = this.vy[i] * k + this.grav[i] * dt;
      this.vz[i] *= k;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0.02 && this.grav[i] < 0) {
        this.py[i] = 0.02;
        this.vy[i] = 0;
        this.vx[i] *= 0.6;
        this.vz[i] *= 0.6;
        this.rotV[i] = 0;
      }
      this.rot[i] += this.rotV[i] * dt;
    }
    this.n = n;
    const pos = this.aPos.array as Float32Array;
    const col = this.aCol.array as Float32Array;
    const cor = this.aCorner.array as Float32Array;
    const spn = this.aSpin.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const t = this.age[i] / this.life[i];
      const sz = this.size[i] * (1 + (this.grow[i] - 1) * t);
      const fade = this.shape[i] === SHAPE_SQUARE ? Math.min(1, (1 - t) * 4) : 1 - t * t;
      const a = this.ca[i] * fade;
      for (let c = 0; c < 4; c++) {
        const v = i * 4 + c;
        pos[v * 3] = this.px[i];
        pos[v * 3 + 1] = this.py[i];
        pos[v * 3 + 2] = this.pz[i];
        col[v * 4] = this.cr[i];
        col[v * 4 + 1] = this.cg[i];
        col[v * 4 + 2] = this.cb[i];
        col[v * 4 + 3] = a;
        cor[v * 3] = CORNERS[c * 2];
        cor[v * 3 + 1] = CORNERS[c * 2 + 1];
        cor[v * 3 + 2] = sz;
        spn[v * 2] = this.rot[i];
        spn[v * 2 + 1] = this.shape[i];
      }
    }
    this.aPos.needsUpdate = true;
    this.aCol.needsUpdate = true;
    this.aCorner.needsUpdate = true;
    this.aSpin.needsUpdate = true;
    this.mesh.geometry.setDrawRange(0, n * 6);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
