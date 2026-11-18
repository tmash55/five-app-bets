/**
 * Courts. A theme is a palette plus a function that places props; `buildCourt`
 * turns one into the meshes the renderer draws.
 */

import * as THREE from 'three';

import { COURT } from '../sim/constants';
import { MeshBuilder, rgb, tint, type Rgb } from './geo';
import {
  bench,
  bleachers,
  buildBackboard,
  buildRim,
  bush,
  cactus,
  car,
  cloud,
  fence,
  hill,
  hoopStand,
  house,
  lamp,
  mesa,
  palm,
  pine,
  rnd,
  rock,
  snowman,
  tower,
  tree,
  umbrella,
  type GroundShadow,
  type SceneCtx,
} from './scenery';

export type CourtId = 'park' | 'street' | 'beach' | 'rooftop' | 'snow' | 'canyon';

export interface CourtTheme {
  id: CourtId;
  name: string;
  sky: { top: string; horizon: string; glow: string };
  light: {
    dir: [number, number, number];
    sun: [number, number, number];
    sky: [number, number, number];
    ground: [number, number, number];
    rim: [number, number, number];
  };
  fog: { color: string; near: number; far: number };
  floor: {
    court: string;
    court2: string;
    key: string;
    line: string;
    circle: string;
    apron: string;
    out: string;
    out2: string;
    stripes: number;
  };
  hoop: { pole: string; pad: string; board: string; trim: string; rim: string; net: string };
  /** dust kicked up by shoes */
  dust: string;
  props: (ctx: SceneCtx) => void;
}

const DAY_LIGHT: CourtTheme['light'] = {
  // from the upper left, a little behind the camera: faces stay bright, shadows fall to the right
  dir: [-0.5, 0.78, 0.38],
  sun: [0.62, 0.6, 0.55],
  sky: [0.5, 0.55, 0.66],
  ground: [0.42, 0.41, 0.37],
  rim: [0.3, 0.3, 0.28],
};

function scatterClouds(ctx: SceneCtx, n: number): void {
  for (let i = 0; i < n; i++) {
    cloud(ctx, -70 + (140 * (i + rnd(ctx) * 0.6)) / n, 17 + rnd(ctx) * 12, -62 - rnd(ctx) * 30, 3 + rnd(ctx) * 3);
  }
}

const park: CourtTheme = {
  id: 'park',
  name: 'Pinecone Park',
  sky: { top: '#3D8BF2', horizon: '#C4E8FF', glow: '#FFF6D8' },
  light: DAY_LIGHT,
  fog: { color: '#CDE9FF', near: 42, far: 170 },
  floor: {
    court: '#3C86D6',
    court2: '#4B97E6',
    key: '#F2765A',
    line: '#FFFFFF',
    circle: '#F2765A',
    apron: '#2D6CB6',
    out: '#6FC65A',
    out2: '#5DB84C',
    stripes: 1,
  },
  hoop: { pole: '#4B5563', pad: '#F2765A', board: '#FFFFFF', trim: '#F2765A', rim: '#FF6A2B', net: '#FFFFFF' },
  dust: '#E9E2CF',
  props: (ctx) => {
    const leaf = rgb('#2F9E4F');
    const leaf2 = rgb('#7FD96A');
    const wood = rgb('#C99B6B');
    bleachers(ctx, -5.6, -8.6, 7.4, 3, 0.86);
    bleachers(ctx, 5.6, -8.6, 7.4, 3, 0.86);
    // scorer's table with a cooler
    ctx.b.box(0, 0, -8.5, 2.2, 0.72, 0.8, rgb('#E7EBF0'), rgb('#FFFFFF'));
    ctx.b.box(0, 0.72, -8.5, 2.3, 0.05, 0.9, rgb('#F2765A'));
    ctx.b.cyl(0.6, 0.77, -8.5, 0.2, 0.2, 0.36, 10, rgb('#F7B32B'), rgb('#FFCB52'));
    ctx.shadows.push({ x: 0.2, z: -8.7, rx: 1.6, rz: 0.9, strength: 0.34 });
    fence(ctx, -34, 34, -12.4, 1.15, wood, false);
    for (let i = 0; i < 13; i++) {
      const x = -33 + i * 5.5 + (rnd(ctx) - 0.5) * 2.4;
      tree(ctx, x, -15.5 - rnd(ctx) * 4, 4.6 + rnd(ctx) * 2.6, leaf, leaf2);
    }
    for (let i = 0; i < 9; i++) {
      tree(ctx, -36 + i * 9 + rnd(ctx) * 3, -25 - rnd(ctx) * 5, 6 + rnd(ctx) * 3, tint(leaf, 0.92), tint(leaf2, 0.94));
    }
    for (const s of [1, -1]) {
      tree(ctx, s * 17.5, -6.5, 5.4, leaf, leaf2);
      tree(ctx, s * 20.5, 1.5, 6.2, leaf, leaf2);
      bush(ctx, s * 15.2, -9.6, 1.1, leaf, leaf2);
      bush(ctx, s * 15.8, 4.4, 0.9, leaf, leaf2);
      bench(ctx, s * 15.4, -3.2, rgb('#D9A56E'));
      lamp(ctx, s * 14.4, -10.6, 5.2);
    }
    for (let i = 0; i < 7; i++) bush(ctx, -30 + i * 10 + rnd(ctx) * 3, -11.4, 0.8 + rnd(ctx) * 0.5, leaf, leaf2);
    for (let i = 0; i < 6; i++) {
      hill(ctx, -90 + i * 36, -70 - rnd(ctx) * 14, 30 + rnd(ctx) * 10, 9 + rnd(ctx) * 6, rgb('#5FAE63'), rgb('#9BD98A'));
    }
    scatterClouds(ctx, 8);
  },
};

const street: CourtTheme = {
  id: 'street',
  name: 'Maple Street',
  sky: { top: '#4A98F5', horizon: '#D9F0FF', glow: '#FFF3CF' },
  light: DAY_LIGHT,
  fog: { color: '#D6ECFF', near: 44, far: 170 },
  floor: {
    court: '#6C7280',
    court2: '#767C8B',
    key: '#E0574B',
    line: '#FAF6EC',
    circle: '#F7B32B',
    apron: '#5F6572',
    out: '#565B66',
    out2: '#4F545F',
    stripes: 0,
  },
  hoop: { pole: '#2F3440', pad: '#F7B32B', board: '#FFFFFF', trim: '#E0574B', rim: '#FF6A2B', net: '#FFFFFF' },
  dust: '#D9D4C8',
  props: (ctx) => {
    const b = ctx.b;
    const leaf = rgb('#E0672F');
    const leaf2 = rgb('#F9B041');
    const green = rgb('#3FA552');
    const green2 = rgb('#84D872');
    const lawn = rgb('#6FC65A');
    const walk = rgb('#C9CDD3');
    // sidewalk and front lawns behind the far sideline
    b.box(0, 0, -11.2, 90, 0.14, 2.4, tint(walk, 0.9), walk);
    b.box(0, 0, -24, 90, 0.16, 23.2, tint(lawn, 0.9), lawn);
    const walls = ['#F4E3C1', '#BFD8EE', '#F6C6B2', '#D7E8C4', '#F3D58A'].map(rgb);
    const roofs = ['#B5503F', '#55606E', '#7A5136', '#3F6C8F', '#8E4A5B'].map(rgb);
    const doors = ['#D9534A', '#2D7DD2', '#27AE60', '#F7B32B', '#8E5BD0'].map(rgb);
    for (let i = 0; i < 5; i++) {
      const x = -32 + i * 16 + (rnd(ctx) - 0.5) * 2;
      const w = 7.5 + rnd(ctx) * 2;
      house(ctx, x, -20 - rnd(ctx) * 2, w, 6.5, 3.6 + rnd(ctx) * 0.5, walls[i], roofs[i], doors[i]);
      // path to the door, mailbox
      b.box(x - w * 0.18, 0.165, -14.2, 1.3, 0.02, 5, tint(walk, 0.95));
      b.box(x + 4.6, 0.14, -10.6, 0.08, 0.9, 0.08, rgb('#6B4E37'));
      b.box(x + 4.6, 1.02, -10.6, 0.24, 0.24, 0.46, doors[i]);
      tree(ctx, x + 7.6 + rnd(ctx), -15 - rnd(ctx) * 3, 4.8 + rnd(ctx) * 2, i % 2 ? leaf : green, i % 2 ? leaf2 : green2);
      bush(ctx, x - 2.6, -16.3, 0.8, green, green2);
      bush(ctx, x + 2.8, -16.3, 0.7, green, green2);
    }
    fence(ctx, -42, -18, -12.5, 0.95, rgb('#FFFFFF'), true);
    fence(ctx, 18, 42, -12.5, 0.95, rgb('#FFFFFF'), true);
    car(ctx, -17.5, -6.2, 0.15, rgb('#E0574B'));
    car(ctx, 18.5, 3.5, Math.PI + 0.1, rgb('#2D9CDB'));
    for (const s of [1, -1]) {
      lamp(ctx, s * 14.6, -10.4, 5.4);
      // trash can and a traffic cone or two
      b.cyl(s * 15.6, 0, -8.8, 0.32, 0.36, 0.9, 10, rgb('#3D8B5A'), rgb('#55A572'));
      b.cyl(s * 13.4, 0, 6.2, 0.2, 0.04, 0.5, 8, rgb('#FF7A2F'), rgb('#FF9A52'), false);
      ctx.shadows.push({ x: s * 15.7, z: -8.9, rx: 0.6, rz: 0.5, strength: 0.34 });
    }
    // lemonade stand
    b.box(-6, 0, -9.3, 1.9, 0.9, 0.8, rgb('#F7D154'), rgb('#FFE27A'));
    b.box(-6.85, 0.9, -9.3, 0.08, 1.1, 0.08, rgb('#FFFFFF'));
    b.box(-5.15, 0.9, -9.3, 0.08, 1.1, 0.08, rgb('#FFFFFF'));
    b.box(-6, 1.9, -9.3, 2.1, 0.42, 0.1, rgb('#F78FB3'), rgb('#FFA8C5'));
    b.cyl(-5.6, 0.9, -9.3, 0.13, 0.11, 0.3, 8, rgb('#FFF3A0'));
    ctx.shadows.push({ x: -5.8, z: -9.5, rx: 1.4, rz: 0.9, strength: 0.34 });
    bleachers(ctx, 4.5, -8.7, 6.2, 2, 0.8);
    for (let i = 0; i < 6; i++) {
      hill(ctx, -90 + i * 36, -80 - rnd(ctx) * 10, 30 + rnd(ctx) * 8, 8 + rnd(ctx) * 5, rgb('#7DB878'), rgb('#B3E0A0'));
    }
    scatterClouds(ctx, 8);
  },
};

const beach: CourtTheme = {
  id: 'beach',
  name: 'Sunset Beach',
  sky: { top: '#3A78E0', horizon: '#FFD2A6', glow: '#FFB870' },
  light: {
    dir: [-0.62, 0.55, 0.3],
    sun: [0.72, 0.6, 0.46],
    sky: [0.52, 0.5, 0.6],
    ground: [0.5, 0.43, 0.36],
    rim: [0.42, 0.32, 0.22],
  },
  fog: { color: '#FFD9B4', near: 46, far: 170 },
  floor: {
    court: '#1FB5A8',
    court2: '#2FC6B8',
    key: '#FF8A65',
    line: '#FFFFFF',
    circle: '#FFD166',
    apron: '#14998E',
    out: '#F4DDA8',
    out2: '#EBCE8E',
    stripes: 0,
  },
  hoop: { pole: '#FFFFFF', pad: '#FF8A65', board: '#FFFFFF', trim: '#1FB5A8', rim: '#FF6A2B', net: '#FFFFFF' },
  dust: '#F4E3B8',
  props: (ctx) => {
    const b = ctx.b;
    // the sea, lighter where it meets the sand
    b.quad(-400, 0.02, -19, 400, 0.02, -19, 400, 0.02, -27, -400, 0.02, -27, rgb('#8FE3E0'), rgb('#39B7D6'));
    b.quad(-400, 0.02, -27, 400, 0.02, -27, 400, 0.02, -400, -400, 0.02, -400, rgb('#39B7D6'), rgb('#2A7FC9'));
    b.quad(-400, 0.03, -18.2, 400, 0.03, -18.2, 400, 0.03, -19.1, -400, 0.03, -19.1, rgb('#FFFFFF'), rgb('#DFF7F7'));
    for (let i = 0; i < 9; i++) {
      const x = -34 + i * 8.5 + (rnd(ctx) - 0.5) * 3;
      palm(ctx, x, -13 - rnd(ctx) * 3.5, 5.2 + rnd(ctx) * 2.2, (rnd(ctx) - 0.5) * 1.4);
    }
    for (const s of [1, -1]) {
      palm(ctx, s * 16.5, -5, 6, -s * 0.6);
      palm(ctx, s * 19, 3.5, 6.6, s * 0.5);
    }
    const cols: [string, string][] = [
      ['#FF6B6B', '#FFFFFF'],
      ['#FFD166', '#FFFFFF'],
      ['#4ECDC4', '#FFFFFF'],
      ['#F78FB3', '#FFF3B0'],
      ['#6C8CFF', '#FFFFFF'],
    ];
    for (let i = 0; i < 5; i++) {
      const c = cols[i];
      umbrella(ctx, -22 + i * 11 + rnd(ctx) * 2, -10.6 - rnd(ctx) * 1.5, rgb(c[0]), rgb(c[1]));
    }
    bleachers(ctx, -5.6, -8.5, 7, 2, 0.85);
    bleachers(ctx, 5.6, -8.5, 7, 2, 0.85);
    // lifeguard tower
    b.box(15.5, 1.6, -11, 2.4, 0.12, 2.2, rgb('#FFFFFF'));
    b.box(15.5, 1.72, -11.3, 2.0, 1.4, 1.5, rgb('#FF6B6B'), rgb('#FF8A8A'));
    b.roof(15.5, 3.12, -11.3, 2.6, 0.6, 2.1, rgb('#FFFFFF'));
    for (const lx of [-1, 1]) for (const lz of [-1, 1]) b.box(15.5 + lx * 1.0, 0, -11 + lz * 0.9, 0.12, 1.6, 0.12, rgb('#E9E4DA'));
    ctx.shadows.push({ x: 16.2, z: -11.6, rx: 2, rz: 1.8, strength: 0.36 });
    for (let i = 0; i < 5; i++) rock(ctx, -30 + i * 15 + rnd(ctx) * 4, -17 - rnd(ctx), 0.6 + rnd(ctx) * 0.5, rgb('#B9A58C'));
    // islands on the horizon
    hill(ctx, -60, -150, 26, 9, rgb('#5B9E86'), rgb('#9AD3A8'));
    hill(ctx, 70, -170, 34, 11, rgb('#5B9E86'), rgb('#9AD3A8'));
    scatterClouds(ctx, 6);
  },
};

const rooftop: CourtTheme = {
  id: 'rooftop',
  name: 'Downtown Rooftop',
  sky: { top: '#2B2F77', horizon: '#F59B7A', glow: '#FFC36B' },
  light: {
    dir: [0.6, 0.55, 0.34],
    sun: [0.66, 0.52, 0.5],
    sky: [0.46, 0.44, 0.62],
    ground: [0.44, 0.38, 0.4],
    rim: [0.44, 0.3, 0.3],
  },
  fog: { color: '#E79A86', near: 50, far: 190 },
  floor: {
    court: '#7A4FC9',
    court2: '#8A5FDB',
    key: '#FFB03B',
    line: '#FFFFFF',
    circle: '#FFB03B',
    apron: '#5E3AA6',
    out: '#8B8F9C',
    out2: '#80848F',
    stripes: 0,
  },
  hoop: { pole: '#2B2F3A', pad: '#FFB03B', board: '#FFFFFF', trim: '#7A4FC9', rim: '#FF6A2B', net: '#FFFFFF' },
  dust: '#D6D2DC',
  props: (ctx) => {
    const b = ctx.b;
    const wall = rgb('#B0553F');
    // parapet around the roof
    b.box(0, 0, -12.2, 44, 1.0, 0.5, tint(wall, 0.82), wall);
    b.box(0, 1.0, -12.2, 44.2, 0.12, 0.7, rgb('#D9D4CC'));
    for (const s of [1, -1]) {
      b.box(s * 21.8, 0, -1, 0.5, 1.0, 22.9, tint(wall, 0.82), wall);
      b.box(s * 21.8, 1.0, -1, 0.7, 0.12, 23.1, rgb('#D9D4CC'));
    }
    ctx.shadows.push({ x: 0, z: -11.6, rx: 23, rz: 1.1, strength: 0.34 });
    // rooftop clutter: water tower, vents, a stair hut
    b.cyl(-15, 2.6, -9.2, 1.5, 1.5, 2.2, 14, rgb('#8A5A3C'), rgb('#A8734E'));
    b.cyl(-15, 4.8, -9.2, 1.62, 0, 0.9, 14, rgb('#5B4636'), rgb('#6E5644'), false);
    for (const lx of [-1, 1]) for (const lz of [-1, 1]) b.box(-15 + lx * 1.0, 0, -9.2 + lz * 1.0, 0.14, 2.6, 0.14, rgb('#4B5563'));
    ctx.shadows.push({ x: -14.4, z: -9.8, rx: 2.4, rz: 2.2, strength: 0.4 });
    b.box(15.5, 0, -9.3, 3.2, 2.5, 2.6, rgb('#9AA1AE'), rgb('#B9C0CC'));
    b.box(15.0, 0, -7.97, 0.95, 1.9, 0.06, rgb('#E0574B'));
    ctx.shadows.push({ x: 16, z: -9.9, rx: 2.4, rz: 2.0, strength: 0.4 });
    for (let i = 0; i < 4; i++) {
      const x = -8 + i * 5.4;
      b.box(x, 0, -10.6, 1.1, 0.7, 1.1, rgb('#9AA1AE'), rgb('#C3CAD6'));
      b.cyl(x, 0.7, -10.6, 0.34, 0.34, 0.22, 10, rgb('#7C8494'));
    }
    bleachers(ctx, 0, -8.6, 6.4, 2, 0.9);
    // the buildings next door stand taller than this roof, so the street below never shows
    const lit = rgb('#FFE08A');
    const dark = rgb('#4A3F6E');
    const near = ['#8E5F8F', '#A8647A', '#7C6CA8', '#B0705E', '#6F7BA8'].map(rgb);
    let nx = -54;
    for (let i = 0; nx < 54; i++) {
      const w = 7 + rnd(ctx) * 5;
      tower(ctx, nx + w / 2, -18.4, w - 0.3, 10, 4.5 + rnd(ctx) * 7.5, near[i % near.length], lit, dark);
      nx += w;
    }
    for (const s of [1, -1]) tower(ctx, s * 30.5, -4, 15, 22, 8 + rnd(ctx) * 3, near[s > 0 ? 1 : 3], lit, dark);
    // skyline
    const palette = ['#5A4E8C', '#6B5FA3', '#4A4379', '#7A6BB8', '#40396B'].map(rgb);
    for (let i = 0; i < 24; i++) {
      const x = -96 + i * 8 + (rnd(ctx) - 0.5) * 3;
      const w = 5 + rnd(ctx) * 4;
      tower(ctx, x, -44 - rnd(ctx) * 30, w, w, 20 + rnd(ctx) * 30, palette[i % palette.length], lit, rgb('#3A3463'));
    }
    scatterClouds(ctx, 5);
  },
};

const snow: CourtTheme = {
  id: 'snow',
  name: 'Snowy Peak',
  sky: { top: '#5FA8F5', horizon: '#EAF6FF', glow: '#FFFFFF' },
  light: {
    dir: [0.5, 0.74, 0.4],
    sun: [0.6, 0.6, 0.6],
    sky: [0.56, 0.6, 0.7],
    ground: [0.52, 0.55, 0.62],
    rim: [0.3, 0.33, 0.38],
  },
  fog: { color: '#EAF4FF', near: 36, far: 150 },
  floor: {
    court: '#4FB3E8',
    court2: '#63C1F2',
    key: '#2F6FD6',
    line: '#FFFFFF',
    circle: '#2F6FD6',
    apron: '#3A9AD1',
    out: '#F4F9FF',
    out2: '#E3EEF9',
    stripes: 0,
  },
  hoop: { pole: '#3D5A80', pad: '#E8483A', board: '#FFFFFF', trim: '#2F6FD6', rim: '#FF6A2B', net: '#FFFFFF' },
  dust: '#FFFFFF',
  props: (ctx) => {
    const b = ctx.b;
    const leaf = rgb('#2E7D5B');
    for (let i = 0; i < 16; i++) {
      pine(ctx, -36 + i * 4.8 + (rnd(ctx) - 0.5) * 2, -13.5 - rnd(ctx) * 6, 4.5 + rnd(ctx) * 3.5, leaf, true);
    }
    for (const s of [1, -1]) {
      pine(ctx, s * 17, -6, 6, leaf, true);
      pine(ctx, s * 20, 2.5, 7, leaf, true);
      snowman(ctx, s * 15.2, -9.4);
    }
    bleachers(ctx, -5.6, -8.6, 7, 2, 0.85);
    bleachers(ctx, 5.6, -8.6, 7, 2, 0.85);
    // log cabin
    house(ctx, 0, -17.5, 8.5, 6, 3.4, rgb('#9C6B45'), rgb('#F4F9FF'), rgb('#E8483A'));
    // snow banks along the back
    for (let i = 0; i < 10; i++) {
      b.ball(-36 + i * 8 + rnd(ctx) * 3, 0, -11.4 - rnd(ctx), 3.2 + rnd(ctx), 0.7 + rnd(ctx) * 0.4, 1.3, 10, 5, rgb('#DCE9F7'), rgb('#FFFFFF'));
    }
    // mountains
    for (let i = 0; i < 7; i++) {
      const x = -110 + i * 36 + rnd(ctx) * 10;
      const h = 34 + rnd(ctx) * 22;
      const z = -95 - rnd(ctx) * 25;
      b.cyl(x, 0, z, h * 0.9, 0, h, 7, rgb('#7C93B8'), rgb('#A9BCD8'), false);
      b.cyl(x, h * 0.62, z, h * 0.345, 0, h * 0.385, 7, rgb('#EAF2FB'), rgb('#FFFFFF'), false);
    }
    scatterClouds(ctx, 6);
  },
};

const canyon: CourtTheme = {
  id: 'canyon',
  name: 'Cactus Canyon',
  sky: { top: '#4A90E2', horizon: '#FFE2B8', glow: '#FFD08A' },
  light: {
    dir: [-0.56, 0.68, 0.36],
    sun: [0.7, 0.62, 0.5],
    sky: [0.5, 0.52, 0.6],
    ground: [0.5, 0.42, 0.35],
    rim: [0.38, 0.3, 0.22],
  },
  fog: { color: '#FFE0B8', near: 46, far: 180 },
  floor: {
    court: '#D9683C',
    court2: '#E57A4C',
    key: '#2A9D8F',
    line: '#FFF6E5',
    circle: '#2A9D8F',
    apron: '#B9532D',
    out: '#EBC383',
    out2: '#DDB070',
    stripes: 0,
  },
  hoop: { pole: '#6B4E37', pad: '#2A9D8F', board: '#FFF6E5', trim: '#D9683C', rim: '#FF6A2B', net: '#FFFFFF' },
  dust: '#EBCB93',
  props: (ctx) => {
    const sand = rgb('#C9824E');
    const sand2 = rgb('#E9A66B');
    for (let i = 0; i < 10; i++) {
      cactus(ctx, -34 + i * 7.6 + (rnd(ctx) - 0.5) * 3, -12.5 - rnd(ctx) * 5, 2.2 + rnd(ctx) * 1.8);
    }
    for (const s of [1, -1]) {
      cactus(ctx, s * 16, -5.5, 3.2);
      cactus(ctx, s * 18.5, 3, 2.6);
      rock(ctx, s * 15, -9.5, 0.9, rgb('#B8794C'));
    }
    for (let i = 0; i < 8; i++) rock(ctx, -32 + i * 9 + rnd(ctx) * 4, -11.6 - rnd(ctx) * 2, 0.5 + rnd(ctx) * 0.6, rgb('#B8794C'));
    fence(ctx, -34, 34, -11.2, 1.0, rgb('#A9764C'), false);
    bleachers(ctx, -5.6, -8.6, 7, 2, 0.85);
    bleachers(ctx, 5.6, -8.6, 7, 2, 0.85);
    for (let i = 0; i < 8; i++) {
      mesa(ctx, -120 + i * 34 + rnd(ctx) * 10, -60 - rnd(ctx) * 40, 11 + rnd(ctx) * 9, 12 + rnd(ctx) * 12, sand, sand2);
    }
    scatterClouds(ctx, 4);
  },
};

export const COURTS: Record<CourtId, CourtTheme> = { park, street, beach, rooftop, snow, canyon };
export const COURT_IDS = Object.keys(COURTS) as CourtId[];

export interface CourtMeshes {
  theme: CourtTheme;
  scenery: THREE.BufferGeometry;
  floor: THREE.BufferGeometry;
  boards: [THREE.BufferGeometry, THREE.BufferGeometry];
  rims: [THREE.BufferGeometry, THREE.BufferGeometry];
  net: THREE.BufferGeometry;
}

/** The ground: a grid so soft shadows can be baked per vertex, plus a skirt out to the horizon. */
function buildFloor(shadows: GroundShadow[]): THREE.BufferGeometry {
  const x0 = -44;
  const x1 = 44;
  const z0 = -36;
  const z1 = 16;
  const cell = 0.5;
  const nx = Math.round((x1 - x0) / cell);
  const nz = Math.round((z1 - z0) / cell);
  const count = (nx + 1) * (nz + 1) + 16;
  const pos = new Float32Array(count * 3);
  const shade = new Float32Array(count);
  let v = 0;
  for (let j = 0; j <= nz; j++) {
    const z = z0 + j * cell;
    for (let i = 0; i <= nx; i++) {
      const x = x0 + i * cell;
      let s = 1;
      for (const sh of shadows) {
        const dx = (x - sh.x) / sh.rx;
        const dz = (z - sh.z) / sh.rz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= 1) continue;
        const d = Math.sqrt(d2);
        const t = d <= 0.3 ? 1 : 1 - (d - 0.3) / 0.7;
        s *= 1 - sh.strength * t * t * (3 - 2 * t);
      }
      pos[v * 3] = x;
      pos[v * 3 + 1] = 0;
      pos[v * 3 + 2] = z;
      shade[v] = s;
      v++;
    }
  }
  const idx: number[] = [];
  const row = nx + 1;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * row + i;
      idx.push(a, a + row, a + row + 1, a, a + row + 1, a + 1);
    }
  }
  // skirt: four big quads around the grid
  const far = 600;
  const quads: [number, number, number, number][] = [
    [-far, x1 + far, -far, z0], // behind
    [-far, x1 + far, z1, far], // in front
    [-far, x0, z0, z1], // left
    [x1, far, z0, z1], // right
  ];
  for (const [qx0, qx1, qz0, qz1] of quads) {
    const base = v;
    for (const [px, pz] of [
      [qx0, qz0],
      [qx1, qz0],
      [qx1, qz1],
      [qx0, qz1],
    ]) {
      pos[v * 3] = px;
      pos[v * 3 + 1] = 0;
      pos[v * 3 + 2] = pz;
      shade[v] = 1;
      v++;
    }
    idx.push(base, base + 3, base + 2, base, base + 2, base + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('shade', new THREE.BufferAttribute(shade, 1));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
  g.computeBoundingSphere();
  return g;
}

/** The net: an open cone under the rim, with UVs for the string pattern. */
function buildNet(): THREE.BufferGeometry {
  const segs = 20;
  const rows = 6;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= rows; j++) {
    const t = j / rows;
    const r = COURT.rimR * (1 - 0.42 * Math.pow(t, 0.8));
    const y = -0.5 * t;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      uv.push(i / segs, t);
    }
  }
  const row = segs + 1;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * row + i;
      idx.push(a, a + row, a + row + 1, a, a + row + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(idx), 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -0.25, 0), 1);
  return g;
}

export function buildCourt(id: CourtId): CourtMeshes {
  const theme = COURTS[id];
  const dir = theme.light.dir;
  const dl = Math.hypot(dir[0], dir[1], dir[2]);
  const ctx: SceneCtx = {
    b: new MeshBuilder(),
    shadows: [],
    // shadows fall away from the sun
    sunX: -dir[0] / dl / Math.max(0.3, dir[1] / dl),
    sunZ: -dir[2] / dl / Math.max(0.3, dir[1] / dl),
    seed: id.length * 17 + id.charCodeAt(0),
  };
  const pole: Rgb = rgb(theme.hoop.pole);
  const pad: Rgb = rgb(theme.hoop.pad);
  hoopStand(ctx, 1, pole, pad);
  hoopStand(ctx, -1, pole, pad);
  theme.props(ctx);
  const board = rgb(theme.hoop.board);
  const trim = rgb(theme.hoop.trim);
  const rim = rgb(theme.hoop.rim);
  return {
    theme,
    scenery: ctx.b.build(),
    floor: buildFloor(ctx.shadows),
    boards: [buildBackboard(-1, board, trim).build(), buildBackboard(1, board, trim).build()],
    rims: [buildRim(-1, rim).build(), buildRim(1, rim).build()],
    net: buildNet(),
  };
}
