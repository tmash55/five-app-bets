/**
 * The printed patterns on the flat jersey (Jersey.tsx), drawn in its own 100 x 150 grid and cut to the cloth by the
 * caller. They follow the court's prints (game/render/shaders, `printOn`) closely enough to be the same design: the
 * same colours in the same places, at about the same size against the jersey. The shapes are worked out once, when
 * the module loads.
 */

import { memo } from 'react';
import { Circle, Defs, G, Path, RadialGradient, Stop } from 'react-native-svg';

import type { KitPrint, PrintStyle } from '@/game/kit/look';
import { night } from '@/theme/arcade';

/** the grid's size: the top and its shorts */
const W = 100;
const H = 150;
/** figure units to grid units: the court jersey is about 0.43 wide, the drawn one 84 */
const UNIT = 195;
/** the court jersey's centre (y 0.68) in the grid, and its top (y 0.9) */
const CHEST_Y = 52;
const TOP_Y = 52 - (0.9 - 0.68) * UNIT;

const n1 = (v: number) => Math.round(v * 10) / 10;
const pt = (x: number, y: number) => `${n1(x)} ${n1(y)}`;

/** a little random that is the same every time, so the drawing never changes between renders */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Tie-dye: three spiral arms of each colour, as the court's s = r * 6.5 + angle * 3 / 2 pi
// ---------------------------------------------------------------------------

/** one band's three arms, as one path */
function tieDyeBand(band: number): string {
  const perS = UNIT / 6.5;
  const parts: string[] = [];
  for (let arm = 0; arm < 3; arm++) {
    const s0 = 0.125 + 0.25 * band + arm;
    const top = (2 * Math.PI * s0) / 3;
    const steps = 96;
    const pts: string[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = top - (i / steps) * 2 * Math.PI * 1.5;
      const r = Math.max(0, perS * (s0 - (3 * a) / (2 * Math.PI)) - 0.05 * perS * Math.sin(a * 5));
      // the court's angle is measured from straight up, clockwise as seen from the front
      pts.push(pt(W / 2 + r * Math.sin(a), CHEST_Y - r * Math.cos(a)));
    }
    parts.push(`M${pts.join('L')}`);
  }
  return parts.join('');
}
const TIE_DYE = [0, 1, 2].map(tieDyeBand);
const TIE_DYE_WIDTH = (UNIT / 6.5) * 0.25 + 0.6;

// ---------------------------------------------------------------------------
// Galaxy: clouds and stars
// ---------------------------------------------------------------------------

/** cloud ellipses: centre, radii, colour (0 the main one, 1 the second) */
const CLOUDS: readonly { x: number; y: number; rx: number; ry: number; c: 0 | 1 }[] = [
  { x: 28, y: 38, rx: 30, ry: 18, c: 0 },
  { x: 74, y: 70, rx: 30, ry: 20, c: 1 },
  { x: 60, y: 22, rx: 18, ry: 12, c: 1 },
  { x: 22, y: 92, rx: 26, ry: 16, c: 1 },
  { x: 76, y: 118, rx: 24, ry: 14, c: 0 },
  { x: 30, y: 132, rx: 22, ry: 12, c: 0 },
];
const STARS: readonly { x: number; y: number; r: number }[] = (() => {
  const rnd = seeded(7);
  const out: { x: number; y: number; r: number }[] = [];
  for (let i = 0; i < 46; i++) out.push({ x: 4 + rnd() * 92, y: 2 + rnd() * 146, r: 0.7 + rnd() * 1.4 });
  return out;
})();

// ---------------------------------------------------------------------------
// Lightning: zigzag bolts on a slant, as the court's u = (0.45 x + y) * 4.2 with a zig of 0.3
// ---------------------------------------------------------------------------

const BOLTS: string = (() => {
  const gap = UNIT / 4.2;
  const zig = (0.3 / 4.2) * UNIT * 0.5;
  const step = UNIT / 12;
  const parts: string[] = [];
  for (let k = -1; k <= 4; k++) {
    const pts: string[] = [];
    for (let i = 0, x = -12; x <= W + 12; i++, x += step) pts.push(pt(x, k * gap + 0.45 * (x - W / 2) + (i % 2 === 0 ? -zig : zig) - 6));
    parts.push(`M${pts.join('L')}`);
  }
  return parts.join('');
})();

// ---------------------------------------------------------------------------
// Candy stripes on a slant, as the court's fract((0.7 x + y) * 8)
// ---------------------------------------------------------------------------

/** the stripes between fractions a and b of each period, as one path */
function stripes(a: number, b: number): string {
  const period = UNIT / 8;
  const slope = 0.7;
  const parts: string[] = [];
  for (let k = -6; k <= 10; k++) {
    // lines y = slope * x + c: going down to the right, as u grows going up and to the right on the court
    const c0 = (k + a) * period;
    const c1 = (k + b) * period;
    const x0 = -10;
    const x1 = W + 10;
    parts.push(`M${pt(x0, slope * (x0 - W / 2) + c0)}L${pt(x1, slope * (x1 - W / 2) + c0)}L${pt(x1, slope * (x1 - W / 2) + c1)}L${pt(x0, slope * (x0 - W / 2) + c1)}Z`);
  }
  return parts.join('');
}
const CANDY = [stripes(0.06, 0.38), stripes(0.52, 0.7), stripes(0.8, 0.86)];

// ---------------------------------------------------------------------------
// Spider web from the top corner: 14 spokes a lap and threads sagging between them
// ---------------------------------------------------------------------------

const WEB_X = W / 2 + 0.2 * UNIT * 0.92;
const WEB_Y = TOP_Y;
const WEB: string = (() => {
  const spokes = 14;
  const reach = 190;
  const parts: string[] = [];
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * 2 * Math.PI;
    parts.push(`M${pt(WEB_X, WEB_Y)}L${pt(WEB_X + reach * Math.cos(a), WEB_Y + reach * Math.sin(a))}`);
  }
  const ring = UNIT / 13;
  for (let k = 1; k * ring < reach; k++) {
    const pts: string[] = [];
    for (let i = 0; i <= spokes * 6; i++) {
      const t = i / 6;
      const a = (t / spokes) * 2 * Math.PI;
      const r = k * ring * (1 - 0.12 * Math.sin(Math.PI * (t % 1)));
      pts.push(pt(WEB_X + r * Math.cos(a), WEB_Y + r * Math.sin(a)));
    }
    parts.push(`M${pts.join('L')}`);
  }
  return parts.join('');
})();

// ---------------------------------------------------------------------------
// Snowflakes: six arms and a heart, scattered through a grid, a few left out; dots of the second colour between
// ---------------------------------------------------------------------------

const SNOW: { flakes: string; hearts: readonly { x: number; y: number }[]; dots: readonly { x: number; y: number }[] } = (() => {
  const rnd = seeded(12);
  const cell = 21;
  const arms: string[] = [];
  const hearts: { x: number; y: number }[] = [];
  const dots: { x: number; y: number }[] = [];
  for (let row = 0; row * cell < H + cell; row++) {
    for (let col = 0; col * cell < W + cell; col++) {
      const h = rnd();
      const jx = (rnd() - 0.5) * 0.3 * cell;
      const jy = (rnd() - 0.5) * 0.3 * cell;
      const x = (col + 0.5) * cell + jx - 6;
      const y = (row + 0.5) * cell + jy - 4;
      if (rnd() > 0.5) dots.push({ x: col * cell - 6, y: row * cell - 4 });
      if (h < 0.25) continue;
      const r = (0.2 + 0.1 * rnd()) * cell;
      for (let k = 0; k < 3; k++) {
        const a = (k * Math.PI) / 3;
        arms.push(`M${pt(x - r * Math.cos(a), y - r * Math.sin(a))}L${pt(x + r * Math.cos(a), y + r * Math.sin(a))}`);
      }
      hearts.push({ x, y });
    }
  }
  return { flakes: arms.join(''), hearts, dots };
})();

/** The pattern itself for one print, in the full grid: the caller cuts it to the cloth. */
export const PrintArt = memo(function PrintArt({ print, glowId }: { print: KitPrint; glowId: string }) {
  const [a, b, c = a] = print.colors;
  const style: PrintStyle = print.style;
  switch (style) {
    case 'tieDye':
      return (
        <G>
          {TIE_DYE.map((d, i) => (
            <Path key={i} d={d} fill="none" stroke={[a, b, c][i]} strokeWidth={TIE_DYE_WIDTH} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.92} />
          ))}
        </G>
      );
    case 'galaxy':
      return (
        <G>
          <Defs>
            <RadialGradient id={`${glowId}a`} cx="50%" cy="50%" r="50%">
              <Stop offset={0} stopColor={a} stopOpacity={0.85} />
              <Stop offset={0.6} stopColor={a} stopOpacity={0.45} />
              <Stop offset={1} stopColor={a} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id={`${glowId}b`} cx="50%" cy="50%" r="50%">
              <Stop offset={0} stopColor={b} stopOpacity={0.75} />
              <Stop offset={0.6} stopColor={b} stopOpacity={0.35} />
              <Stop offset={1} stopColor={b} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          {CLOUDS.map((cl, i) => (
            <Path key={i} d={`M${cl.x - cl.rx} ${cl.y}a${cl.rx} ${cl.ry} 0 1 0 ${cl.rx * 2} 0a${cl.rx} ${cl.ry} 0 1 0 ${-cl.rx * 2} 0Z`} fill={`url(#${glowId}${cl.c === 0 ? 'a' : 'b'})`} />
          ))}
          {CLOUDS.filter((_, i) => i % 2 === 0).map((cl, i) => (
            <Circle key={`core${i}`} cx={cl.x} cy={cl.y} r={cl.ry * 0.35} fill={c} fillOpacity={0.35} />
          ))}
          {STARS.map((s, i) => (
            <Circle key={`s${i}`} cx={s.x} cy={s.y} r={s.r} fill={night.white} />
          ))}
        </G>
      );
    case 'lightning':
      return (
        <G>
          <Path d={BOLTS} fill="none" stroke={b} strokeWidth={9} strokeOpacity={0.85} strokeLinejoin="miter" />
          <Path d={BOLTS} fill="none" stroke={a} strokeWidth={4} strokeLinejoin="miter" />
        </G>
      );
    case 'candy':
      return (
        <G>
          <Path d={CANDY[0]} fill={a} />
          <Path d={CANDY[1]} fill={b} />
          <Path d={CANDY[2]} fill={c} />
        </G>
      );
    case 'web':
      return (
        <G>
          <Defs>
            <RadialGradient id={`${glowId}a`} cx="50%" cy="50%" r="50%">
              <Stop offset={0} stopColor={b} stopOpacity={0.5} />
              <Stop offset={1} stopColor={b} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={WEB_X} cy={WEB_Y} r={0.3 * UNIT} fill={`url(#${glowId}a)`} />
          <Path d={WEB} fill="none" stroke={a} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
        </G>
      );
    case 'snow':
      return (
        <G>
          {SNOW.dots.map((d, i) => (
            <Circle key={`d${i}`} cx={d.x} cy={d.y} r={1.1} fill={b} />
          ))}
          <Path d={SNOW.flakes} fill="none" stroke={a} strokeWidth={1.7} strokeLinecap="round" />
          {SNOW.hearts.map((h, i) => (
            <Circle key={`h${i}`} cx={h.x} cy={h.y} r={1.6} fill={a} />
          ))}
        </G>
      );
  }
});
