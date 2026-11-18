/**
 * Props for the courts: trees, houses, fences, bleachers full of bouncing
 * kids, clouds. All built from the primitives in geo.ts so a court is a single
 * mesh with colour per vertex.
 */

import { COURT } from '../sim/constants';
import { MeshBuilder, blend, hash1, rgb, tint, type Rgb } from './geo';

/** A soft dark patch baked into the ground under a prop. */
export interface GroundShadow {
  x: number;
  z: number;
  rx: number;
  rz: number;
  strength: number;
}

export interface SceneCtx {
  b: MeshBuilder;
  shadows: GroundShadow[];
  /** direction the sun shines toward, flattened onto the ground (for shadow offsets) */
  sunX: number;
  sunZ: number;
  seed: number;
}

export function rnd(ctx: SceneCtx): number {
  ctx.seed += 1;
  return hash1(ctx.seed * 1.618);
}

function shadow(ctx: SceneCtx, x: number, z: number, r: number, h: number, strength = 0.42): void {
  // pushed away from the sun and stretched along that direction for tall things
  const k = Math.min(2.2, h * 0.28);
  ctx.shadows.push({ x: x + ctx.sunX * k, z: z + ctx.sunZ * k, rx: r + Math.abs(ctx.sunX) * k, rz: r + Math.abs(ctx.sunZ) * k, strength });
}

const SKINS = ['#F6D2B4', '#EDBF94', '#D9A06B', '#B97848', '#8D5632', '#6B3F26'].map(rgb);
const HAIRS = ['#1C1310', '#3A2416', '#6B4423', '#B5722D', '#E0B052', '#D8552E', '#2B2B33'].map(rgb);
const SHIRTS = ['#F25C54', '#F7B32B', '#2D9CDB', '#27AE60', '#9B51E0', '#FF8A5B', '#00B8A9', '#F78FB3', '#FFFFFF', '#3D5A80'].map(rgb);

/** A simple spectator: body, head, hair. Bounces with the crowd. */
export function pegKid(ctx: SceneCtx, x: number, y: number, z: number, scale = 1): void {
  const b = ctx.b;
  const shirt = SHIRTS[Math.floor(rnd(ctx) * SHIRTS.length)];
  const skin = SKINS[Math.floor(rnd(ctx) * SKINS.length)];
  const hair = HAIRS[Math.floor(rnd(ctx) * HAIRS.length)];
  const style = rnd(ctx);
  b.anim(rnd(ctx) * 6.28, 0.16 * scale, 0);
  b.push(x, y, z, 0, scale);
  b.cyl(0, 0, 0, 0.2, 0.15, 0.44, 10, tint(shirt, 0.86), shirt);
  b.ball(0, 0.66, 0, 0.25, 0.23, 0.23, 12, 8, tint(skin, 0.92), skin);
  if (style < 0.8) {
    // hair: a cap sitting on the top and back of the head
    b.ball(0, 0.71, -0.035, 0.262, 0.215, 0.245, 12, 6, hair, tint(hair, 1.15));
    if (style < 0.25) {
      b.ball(0.2, 0.86, -0.06, 0.09, 0.09, 0.09, 8, 5, hair);
      b.ball(-0.2, 0.86, -0.06, 0.09, 0.09, 0.09, 8, 5, hair);
    } else if (style < 0.4) {
      b.ball(0, 0.72, -0.27, 0.07, 0.16, 0.07, 8, 5, hair);
    }
  } else {
    // cap
    const cap = SHIRTS[Math.floor(rnd(ctx) * SHIRTS.length)];
    b.ball(0, 0.74, -0.01, 0.262, 0.19, 0.255, 12, 6, cap, tint(cap, 1.1));
    b.box(0, 0.74, 0.25, 0.3, 0.035, 0.2, tint(cap, 0.85));
  }
  // eyes, so they read as faces from the camera
  const ink = rgb('#1D1A1F');
  b.ball(0.085, 0.66, 0.215, 0.028, 0.04, 0.02, 6, 4, ink);
  b.ball(-0.085, 0.66, 0.215, 0.028, 0.04, 0.02, 6, 4, ink);
  // arms up
  b.cyl(0.24, 0.3, 0, 0.055, 0.05, 0.36, 6, skin, skin);
  b.cyl(-0.24, 0.3, 0, 0.055, 0.05, 0.36, 6, skin, skin);
  b.pop();
  b.anim();
}

export function bleachers(ctx: SceneCtx, x: number, z: number, length: number, rows: number, fill: number): void {
  const b = ctx.b;
  const metal = rgb('#C9CED6');
  const frame = rgb('#8C93A1');
  for (let r = 0; r < rows; r++) {
    const y = 0.38 + r * 0.42;
    const zz = z - r * 0.62;
    b.box(x, y, zz, length, 0.07, 0.42, tint(metal, 0.92), metal);
    b.box(x, y - 0.3, zz + 0.3, length, 0.05, 0.3, tint(frame, 0.9), frame);
    const seats = Math.floor(length / 0.62);
    for (let i = 0; i < seats; i++) {
      if (rnd(ctx) > fill) continue;
      const sx = x - length / 2 + 0.31 + i * 0.62 + (rnd(ctx) - 0.5) * 0.1;
      pegKid(ctx, sx, y + 0.07, zz, 0.92 + rnd(ctx) * 0.2);
    }
  }
  for (let i = 0; i <= Math.floor(length / 2.4); i++) {
    const px = x - length / 2 + 0.2 + i * ((length - 0.4) / Math.max(1, Math.floor(length / 2.4)));
    b.box(px, 0, z - (rows - 1) * 0.31, 0.08, 0.38 + (rows - 1) * 0.42, rows * 0.62, tint(frame, 0.8), frame);
  }
  ctx.shadows.push({ x: x + ctx.sunX * 0.5, z: z - rows * 0.3 + ctx.sunZ * 0.5, rx: length / 2 + 0.5, rz: rows * 0.5 + 0.6, strength: 0.4 });
}

export function tree(ctx: SceneCtx, x: number, z: number, h: number, leaf: Rgb, leaf2: Rgb): void {
  const b = ctx.b;
  const bark = rgb('#8A5A3C');
  const s = rnd(ctx) * 100;
  b.cyl(x, 0, z, 0.22 * (h / 5), 0.14 * (h / 5), h * 0.5, 8, tint(bark, 0.8), bark);
  b.anim(s, 0, 0.05);
  const r = h * 0.3;
  b.ball(x, h * 0.62, z, r * 1.05, r * 0.9, r * 1.05, 10, 7, leaf, leaf2, 0.13, s);
  b.ball(x - r * 0.62, h * 0.52, z + r * 0.15, r * 0.7, r * 0.6, r * 0.7, 9, 6, leaf, leaf2, 0.13, s + 1);
  b.ball(x + r * 0.6, h * 0.55, z - r * 0.1, r * 0.72, r * 0.62, r * 0.72, 9, 6, leaf, leaf2, 0.13, s + 2);
  b.ball(x + r * 0.1, h * 0.82, z, r * 0.7, r * 0.6, r * 0.7, 9, 6, blend(leaf, leaf2, 0.5), tint(leaf2, 1.06), 0.13, s + 3);
  b.anim();
  shadow(ctx, x, z, r * 1.2, h);
}

export function pine(ctx: SceneCtx, x: number, z: number, h: number, leaf: Rgb, snow = false): void {
  const b = ctx.b;
  const bark = rgb('#7A4E36');
  b.cyl(x, 0, z, 0.18 * (h / 5), 0.12 * (h / 5), h * 0.3, 7, tint(bark, 0.8), bark);
  const white = rgb('#FFFFFF');
  for (let i = 0; i < 3; i++) {
    const y0 = h * (0.2 + i * 0.24);
    const r = h * (0.3 - i * 0.07);
    const hh = h * 0.36;
    b.cyl(x, y0, z, r, 0, hh, 10, tint(leaf, 0.8), tint(leaf, 1.08), false);
    b.disc(x, y0, z, r, 10, tint(leaf, 0.6));
    if (snow) b.cyl(x, y0 + hh * 0.42, z, r * 0.6, 0, hh * 0.6, 10, tint(white, 0.9), white, false);
  }
  shadow(ctx, x, z, h * 0.26, h);
}

export function palm(ctx: SceneCtx, x: number, z: number, h: number, lean: number): void {
  const b = ctx.b;
  const bark = rgb('#B58B5C');
  const leaf = rgb('#2FA860');
  const leaf2 = rgb('#7BD67A');
  let px = x;
  let py = 0;
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const r0 = 0.17 - 0.06 * t;
    const sh = h / segs;
    b.cyl(px, py, z, r0, r0 - 0.012, sh * 1.06, 7, tint(bark, 0.82 + 0.1 * (i % 2)), tint(bark, 0.95 + 0.1 * (i % 2)), false);
    px += lean * (0.1 + 0.5 * t) * (h / segs);
    py += sh;
  }
  b.anim(rnd(ctx) * 6, 0, 0.07);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const len = h * 0.36;
    b.push(px, py, z, a);
    // a drooping frond: three overlapping leaves stepping outward and down
    b.ball(len * 0.3, 0.02, 0, len * 0.34, 0.07, 0.24, 8, 4, leaf, leaf2);
    b.ball(len * 0.72, -0.14, 0, len * 0.3, 0.06, 0.2, 8, 4, leaf, leaf2);
    b.ball(len * 1.05, -0.42, 0, len * 0.22, 0.05, 0.14, 8, 4, tint(leaf, 0.9), leaf2);
    b.pop();
  }
  b.anim();
  const nut = rgb('#6B4423');
  b.ball(px + 0.12, py - 0.12, z + 0.05, 0.11, 0.11, 0.11, 7, 5, nut);
  b.ball(px - 0.1, py - 0.14, z - 0.06, 0.11, 0.11, 0.11, 7, 5, nut);
  shadow(ctx, px, z, h * 0.3, h * 0.7, 0.3);
}

export function bush(ctx: SceneCtx, x: number, z: number, s: number, leaf: Rgb, leaf2: Rgb): void {
  const b = ctx.b;
  const sd = rnd(ctx) * 50;
  b.anim(sd, 0, 0.015);
  b.ball(x, s * 0.42, z, s * 0.75, s * 0.52, s * 0.6, 9, 6, leaf, leaf2, 0.12, sd);
  b.ball(x + s * 0.55, s * 0.32, z + s * 0.1, s * 0.5, s * 0.4, s * 0.45, 8, 5, leaf, leaf2, 0.12, sd + 1);
  b.ball(x - s * 0.5, s * 0.3, z - s * 0.05, s * 0.48, s * 0.38, s * 0.45, 8, 5, leaf, leaf2, 0.12, sd + 2);
  b.anim();
  ctx.shadows.push({ x: x + ctx.sunX * 0.2, z: z + ctx.sunZ * 0.2, rx: s * 1.1, rz: s * 0.8, strength: 0.3 });
}

export function cloud(ctx: SceneCtx, x: number, y: number, z: number, s: number): void {
  const b = ctx.b;
  const lo = rgb('#DCE8F5');
  const hi = rgb('#FFFFFF');
  const sd = rnd(ctx) * 20;
  b.ball(x, y, z, s * 1.5, s * 0.7, s * 0.8, 10, 6, lo, hi, 0.06, sd);
  b.ball(x + s * 1.3, y - s * 0.12, z, s * 1.0, s * 0.5, s * 0.6, 9, 5, lo, hi, 0.06, sd + 1);
  b.ball(x - s * 1.25, y - s * 0.15, z, s * 0.95, s * 0.48, s * 0.6, 9, 5, lo, hi, 0.06, sd + 2);
  b.ball(x + s * 0.3, y + s * 0.42, z, s * 0.85, s * 0.55, s * 0.6, 9, 5, lo, hi, 0.06, sd + 3);
}

export function hill(ctx: SceneCtx, x: number, z: number, r: number, h: number, c: Rgb, c2: Rgb): void {
  ctx.b.ball(x, -h * 0.15, z, r, h, r * 0.6, 14, 8, c, c2);
}

export function fence(ctx: SceneCtx, x0: number, x1: number, z: number, h: number, c: Rgb, picket: boolean): void {
  const b = ctx.b;
  const len = x1 - x0;
  const posts = Math.max(2, Math.round(len / 2.2));
  for (let i = 0; i <= posts; i++) {
    const x = x0 + (len * i) / posts;
    b.box(x, 0, z, 0.14, h + 0.1, 0.14, tint(c, 0.82), c);
  }
  b.box((x0 + x1) / 2, h * 0.3, z, len, 0.09, 0.06, tint(c, 0.9), c);
  b.box((x0 + x1) / 2, h * 0.72, z, len, 0.09, 0.06, tint(c, 0.9), c);
  if (picket) {
    const n = Math.round(len / 0.3);
    for (let i = 0; i < n; i++) {
      const x = x0 + (len * (i + 0.5)) / n;
      b.box(x, 0.06, z + 0.04, 0.2, h, 0.03, tint(c, 0.9), tint(c, 1.04));
    }
  }
  ctx.shadows.push({ x: (x0 + x1) / 2 + ctx.sunX * 0.3, z: z + ctx.sunZ * 0.4, rx: len / 2, rz: 0.7, strength: 0.28 });
}

export function house(ctx: SceneCtx, x: number, z: number, w: number, d: number, h: number, wall: Rgb, roof: Rgb, door: Rgb): void {
  const b = ctx.b;
  const trim = rgb('#FFFFFF');
  const glass = rgb('#9AD4F5');
  b.box(x, 0, z, w, h, d, tint(wall, 0.86), wall);
  b.roof(x, h, z, w + 0.7, h * 0.55, d + 0.7, roof, tint(wall, 0.95));
  const fz = z + d / 2;
  // door and step
  b.box(x - w * 0.18, 0, fz + 0.03, 0.95, 1.9, 0.08, tint(door, 0.85), door);
  b.box(x - w * 0.18, 0, fz + 0.35, 1.5, 0.16, 0.7, rgb('#D8D2C8'));
  // windows
  for (const wx of [w * 0.22, -w * 0.38]) {
    if (wx < 0 && w < 6) continue;
    b.box(x + wx, 1.0, fz + 0.02, 1.25, 1.15, 0.06, trim);
    b.box(x + wx, 1.08, fz + 0.05, 1.07, 0.99, 0.04, tint(glass, 0.85), glass);
    b.box(x + wx, 1.08, fz + 0.075, 0.06, 0.99, 0.02, trim);
  }
  // chimney
  b.box(x + w * 0.3, h + h * 0.12, z - d * 0.1, 0.6, h * 0.5, 0.6, rgb('#B5654A'), rgb('#C97A5C'));
  shadow(ctx, x, z, Math.max(w, d) * 0.62, h * 1.2, 0.38);
}

/** A flat-roofed block with rows of windows, for skylines. */
export function tower(ctx: SceneCtx, x: number, z: number, w: number, d: number, h: number, wall: Rgb, lit: Rgb, dark: Rgb): void {
  const b = ctx.b;
  b.box(x, 0, z, w, h, d, tint(wall, 0.8), wall);
  b.box(x, h, z, w * 0.9, 0.3, d * 0.9, tint(wall, 0.7));
  const cols = Math.max(2, Math.floor(w / 1.3));
  const rows = Math.max(2, Math.floor(h / 1.7));
  const fz = z + d / 2 + 0.02;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = x - w / 2 + (w * (c + 0.5)) / cols;
      const wy = 1.0 + (r * (h - 1.6)) / rows;
      const on = rnd(ctx) < 0.45;
      b.quad(wx - 0.36, wy, fz, wx + 0.36, wy, fz, wx + 0.36, wy + 0.8, fz, wx - 0.36, wy + 0.8, fz, on ? lit : dark);
    }
  }
}

export function lamp(ctx: SceneCtx, x: number, z: number, h: number): void {
  const b = ctx.b;
  const metal = rgb('#4B5563');
  b.cyl(x, 0, z, 0.09, 0.06, h, 8, tint(metal, 0.8), metal);
  b.box(x, h, z + 0.25, 0.22, 0.1, 0.7, metal);
  b.ball(x, h - 0.06, z + 0.5, 0.16, 0.1, 0.16, 8, 5, rgb('#FFF3B0'));
  shadow(ctx, x, z, 0.3, 1, 0.25);
}

export function bench(ctx: SceneCtx, x: number, z: number, c: Rgb): void {
  const b = ctx.b;
  b.box(x, 0.4, z, 2.4, 0.08, 0.5, tint(c, 0.88), c);
  b.box(x, 0.48, z - 0.24, 2.4, 0.5, 0.07, tint(c, 0.82), c);
  b.box(x - 1.0, 0, z, 0.1, 0.4, 0.44, rgb('#555B66'));
  b.box(x + 1.0, 0, z, 0.1, 0.4, 0.44, rgb('#555B66'));
  ctx.shadows.push({ x: x + ctx.sunX * 0.15, z: z + ctx.sunZ * 0.15, rx: 1.5, rz: 0.6, strength: 0.32 });
}

export function umbrella(ctx: SceneCtx, x: number, z: number, c: Rgb, c2: Rgb): void {
  const b = ctx.b;
  b.cyl(x, 0, z, 0.04, 0.04, 2.3, 6, rgb('#F2F2F2'));
  // striped canopy: alternating wedges
  const segs = 10;
  const top = b.vert(x, 2.75, z, 0, 1, 0, c);
  const first = b.vertexCount;
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const col = i % 2 === 0 ? c : c2;
    b.vert(x + Math.cos(a) * 1.35, 2.2, z + Math.sin(a) * 1.35, Math.cos(a) * 0.4, 0.9, Math.sin(a) * 0.4, col);
    b.vert(x + Math.cos(a) * 1.35, 2.2, z + Math.sin(a) * 1.35, Math.cos(a) * 0.4, 0.9, Math.sin(a) * 0.4, i % 2 === 0 ? c2 : c);
  }
  for (let i = 0; i < segs; i++) b.tri(top, first + i * 2 + 3, first + i * 2);
  ctx.shadows.push({ x: x + ctx.sunX * 0.6, z: z + ctx.sunZ * 0.6, rx: 1.5, rz: 1.3, strength: 0.34 });
  // towel
  b.box(x + 0.9, 0.02, z + 0.8, 0.8, 0.03, 1.7, c2, c2);
}

export function rock(ctx: SceneCtx, x: number, z: number, s: number, c: Rgb): void {
  ctx.b.ball(x, s * 0.3, z, s, s * 0.6, s * 0.8, 8, 5, tint(c, 0.8), tint(c, 1.1), 0.2, rnd(ctx) * 30);
  ctx.shadows.push({ x: x + ctx.sunX * 0.2, z: z + ctx.sunZ * 0.2, rx: s * 1.2, rz: s, strength: 0.3 });
}

export function cactus(ctx: SceneCtx, x: number, z: number, h: number): void {
  const b = ctx.b;
  const g = rgb('#3E9B5F');
  const g2 = rgb('#6CC47E');
  b.cyl(x, 0, z, 0.26, 0.24, h, 9, tint(g, 0.85), g2, false);
  b.ball(x, h, z, 0.24, 0.2, 0.24, 9, 5, g2);
  for (const s of [1, -1]) {
    const ay = h * (s > 0 ? 0.45 : 0.3);
    b.ball(x + s * 0.42, ay, z, 0.26, 0.13, 0.13, 8, 5, g, g2);
    b.cyl(x + s * 0.6, ay, z, 0.13, 0.12, h * 0.34, 8, g, g2, false);
    b.ball(x + s * 0.6, ay + h * 0.34, z, 0.12, 0.1, 0.12, 8, 4, g2);
  }
  shadow(ctx, x, z, 0.5, h, 0.34);
}

export function mesa(ctx: SceneCtx, x: number, z: number, w: number, h: number, c: Rgb, c2: Rgb): void {
  const b = ctx.b;
  b.cyl(x, 0, z, w, w * 0.78, h * 0.6, 9, tint(c, 0.85), c);
  b.cyl(x, h * 0.6, z, w * 0.72, w * 0.62, h * 0.4, 9, c, c2);
}

export function snowman(ctx: SceneCtx, x: number, z: number): void {
  const b = ctx.b;
  const w = rgb('#FFFFFF');
  const sh = rgb('#D5E4F2');
  b.ball(x, 0.45, z, 0.55, 0.5, 0.55, 10, 7, sh, w);
  b.ball(x, 1.15, z, 0.4, 0.38, 0.4, 10, 7, sh, w);
  b.ball(x, 1.72, z, 0.3, 0.29, 0.3, 10, 7, sh, w);
  b.ball(x, 1.72, z + 0.32, 0.06, 0.06, 0.16, 6, 4, rgb('#FF8A3D'));
  const ink = rgb('#22252B');
  b.ball(x + 0.1, 1.8, z + 0.26, 0.035, 0.035, 0.03, 5, 3, ink);
  b.ball(x - 0.1, 1.8, z + 0.26, 0.035, 0.035, 0.03, 5, 3, ink);
  b.cyl(x, 1.95, z, 0.3, 0.3, 0.05, 10, ink);
  b.cyl(x, 2.0, z, 0.2, 0.2, 0.26, 10, ink);
  b.box(x, 1.44, z, 0.7, 0.1, 0.7, rgb('#E8483A'));
  shadow(ctx, x, z, 0.7, 1.5, 0.3);
}

export function car(ctx: SceneCtx, x: number, z: number, ry: number, c: Rgb): void {
  const b = ctx.b;
  const glass = rgb('#A9DCF7');
  const tire = rgb('#2A2D33');
  b.push(x, 0, z, ry);
  b.box(0, 0.3, 0, 3.6, 0.62, 1.6, tint(c, 0.82), c);
  b.box(-0.15, 0.92, 0, 2.0, 0.55, 1.44, tint(c, 0.9), tint(c, 1.05));
  b.box(-0.15, 0.98, 0.73, 1.7, 0.4, 0.02, glass);
  b.box(-0.15, 0.98, -0.73, 1.7, 0.4, 0.02, glass);
  b.box(0.86, 0.98, 0, 0.02, 0.4, 1.3, glass);
  b.box(-1.16, 0.98, 0, 0.02, 0.4, 1.3, glass);
  for (const wx of [1.1, -1.1]) {
    for (const wz of [0.8, -0.8]) b.ball(wx, 0.3, wz, 0.3, 0.3, 0.13, 10, 6, tire);
  }
  b.box(1.8, 0.5, 0.5, 0.04, 0.14, 0.3, rgb('#FFF3B0'));
  b.box(1.8, 0.5, -0.5, 0.04, 0.14, 0.3, rgb('#FFF3B0'));
  b.pop();
  ctx.shadows.push({ x: x + ctx.sunX * 0.3, z: z + ctx.sunZ * 0.3, rx: 2.3, rz: 1.5, strength: 0.42 });
}

/** The fixed parts of a hoop: base, padded pole and the arm reaching out over the baseline. */
export function hoopStand(ctx: SceneCtx, side: 1 | -1, pole: Rgb, pad: Rgb): void {
  const b = ctx.b;
  const px = side * (COURT.halfL + 0.85);
  b.box(px + side * 0.25, 0, 0, 1.3, 0.16, 1.1, tint(pole, 0.7), tint(pole, 0.85));
  b.box(px, 0.16, 0, 0.26, 3.0, 0.26, tint(pole, 0.85), pole);
  b.box(px - side * 0.02, 0.2, 0, 0.42, 1.7, 0.46, tint(pad, 0.84), pad);
  // arm
  const ax0 = side * (COURT.boardX + 0.06);
  b.box((px + ax0) / 2, 2.86, 0, Math.abs(px - ax0) + 0.1, 0.2, 0.2, tint(pole, 0.9), pole);
  b.box((px + ax0) / 2, 2.5, 0, Math.abs(px - ax0) * 0.6, 0.1, 0.1, tint(pole, 0.8), pole);
  ctx.shadows.push({ x: px + ctx.sunX * 0.4, z: ctx.sunZ * 0.4, rx: 1.1, rz: 0.9, strength: 0.4 });
  // the backboard's own shadow on the floor
  ctx.shadows.push({ x: side * (COURT.boardX - 0.1) + ctx.sunX * 1.6, z: ctx.sunZ * 1.6, rx: 0.9, rz: 1.25, strength: 0.26 });
}

/** Backboard, built around the origin at the middle of its face (facing -side along X). */
export function buildBackboard(side: 1 | -1, board: Rgb, trim: Rgb): MeshBuilder {
  const b = new MeshBuilder();
  const w = COURT.boardHalfW * 2;
  const h = COURT.boardY1 - COURT.boardY0;
  const t = 0.07;
  // x runs away from the court
  const x = side * t * 0.5;
  b.box(x, -h / 2, 0, t, h, w, tint(board, 0.93), board);
  const f = -side * 0.006;
  const edge = 0.075;
  // border
  b.box(f, h / 2 - edge, 0, 0.012, edge, w, trim);
  b.box(f, -h / 2, 0, 0.012, edge, w, trim);
  b.box(f, -h / 2, w / 2 - edge / 2, 0.012, h, edge, trim);
  b.box(f, -h / 2, -w / 2 + edge / 2, 0.012, h, edge, trim);
  // shooter's square, just above the rim
  const sq = 0.62;
  const sy0 = COURT.rimY - (COURT.boardY0 + h / 2) + 0.02;
  const sh = 0.47;
  const lw = 0.05;
  b.box(f, sy0 + sh - lw, 0, 0.012, lw, sq, trim);
  b.box(f, sy0, 0, 0.012, lw, sq, trim);
  b.box(f, sy0, sq / 2 - lw / 2, 0.012, sh, lw, trim);
  b.box(f, sy0, -sq / 2 + lw / 2, 0.012, sh, lw, trim);
  return b;
}

/** Rim and its bracket, built around the point where the bracket meets the board. */
export function buildRim(side: 1 | -1, rim: Rgb): MeshBuilder {
  const b = new MeshBuilder();
  const reach = COURT.boardX - COURT.hoopX;
  b.torus(-side * reach, 0, 0, COURT.rimR, 0.032, 28, 8, rim);
  b.box(-side * (reach - COURT.rimR) * 0.5, -0.03, 0, reach - COURT.rimR + 0.04, 0.05, 0.16, tint(rim, 0.85), rim);
  b.box(-side * 0.02, -0.14, 0, 0.04, 0.2, 0.2, tint(rim, 0.8), rim);
  return b;
}
