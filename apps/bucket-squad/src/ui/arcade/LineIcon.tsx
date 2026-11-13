/**
 * The arcade's icons: thin neon lines on a 24 x 24 grid, with light round them.
 * (The match keeps its own chunky icons in ui/Icon.)
 */

import { View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { coinPaint, night, tubeOf, type Tube, type TubeName } from '@/theme/arcade';
import { px } from '@/theme/tokens';

type Shape = { p: string } | { c: readonly [number, number, number] } | { r: readonly [number, number, number, number, number] };

interface Drawing {
  shapes: readonly Shape[];
  /** a solid shape instead of a line */
  solid?: boolean;
}

const DRAWINGS = {
  back: { shapes: [{ p: 'M15 5l-7 7 7 7' }] },
  arrow: { shapes: [{ p: 'M4 12h15M13 5l7 7-7 7' }] },
  up: { shapes: [{ p: 'M12 19V5M6 11l6-6 6 6' }] },
  check: { shapes: [{ p: 'M5 12.5l4.5 4.5L19 7.5' }] },
  close: { shapes: [{ p: 'M6 6l12 12M18 6L6 18' }] },
  plus: { shapes: [{ p: 'M12 5v14M5 12h14' }] },
  swap: { shapes: [{ p: 'M4 8h15l-3.5-3.5M20 16H5l3.5 3.5' }] },
  play: { shapes: [{ p: 'M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z' }], solid: true },
  pause: { shapes: [{ p: 'M8.5 5v14M15.5 5v14' }] },
  gear: {
    shapes: [
      { c: [12, 12, 3.2] },
      {
        p: 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
      },
    ],
  },
  pack: { shapes: [{ p: 'M5 7h14v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z' }, { p: 'M5 7l2.3-3.5L9.7 7 12 3.5 14.3 7l2.4-3.5L19 7' }] },
  grid: { shapes: [{ r: [3.5, 3.5, 7, 7, 1.5] }, { r: [13.5, 3.5, 7, 7, 1.5] }, { r: [3.5, 13.5, 7, 7, 1.5] }, { r: [13.5, 13.5, 7, 7, 1.5] }] },
  cards: { shapes: [{ r: [3.5, 7, 10.5, 13.5, 2] }, { p: 'M8.5 4h9.5a2 2 0 0 1 2 2v11.5' }] },
  squad: { shapes: [{ c: [12, 7.5, 3.2] }, { p: 'M5.5 20a6.5 6.5 0 0 1 13 0' }, { c: [4.5, 10, 2] }, { c: [19.5, 10, 2] }] },
  target: { shapes: [{ c: [12, 12, 8.5] }, { c: [12, 12, 4.5] }, { c: [12, 12, 1] }] },
  star: { shapes: [{ p: 'M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5-5.9-3.3-5.9 3.3 1.3-6.5-4.9-4.5 6.6-.8z' }] },
  ball: { shapes: [{ p: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3v18M5.6 5.6c3.2 3.2 3.2 9.6 0 12.8M18.4 5.6c-3.2 3.2-3.2 9.6 0 12.8' }] },
  crown: { shapes: [{ p: 'M3 8l4.5 4L12 5l4.5 7L21 8l-1.8 10.5H4.8z' }] },
  lock: { shapes: [{ r: [5, 10.5, 14, 10, 2.5] }, { p: 'M8 10.5V7.5a4 4 0 0 1 8 0v3' }] },
  help: { shapes: [{ p: 'M9 9a3 3 0 1 1 4.5 2.6c-.9.6-1.5 1.2-1.5 2.4' }, { c: [12, 18, 0.5] }] },
  sound: { shapes: [{ p: 'M4 9.5v5h3.5l4.5 4v-13l-4.5 4z' }, { p: 'M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11' }] },
  mute: { shapes: [{ p: 'M4 9.5v5h3.5l4.5 4v-13l-4.5 4z' }, { p: 'M16 9.5l5 5M21 9.5l-5 5' }] },
  music: { shapes: [{ p: 'M9 18V5.5l10-2V16' }, { c: [6.5, 18, 2.5] }, { c: [16.5, 16, 2.5] }] },
  buzz: { shapes: [{ r: [8, 3.5, 8, 17, 2] }, { p: 'M4.5 8.5v7M19.5 8.5v7M11 17h2' }] },
  trophy: { shapes: [{ p: 'M7 4h10v5a5 5 0 0 1-10 0z' }, { p: 'M7 5.5H4.5a2.6 2.6 0 0 0 2.9 4M17 5.5h2.5a2.6 2.6 0 0 1-2.9 4' }, { p: 'M12 14v3.5M8.5 20.5h7M9.5 17.5h5' }] },
  ladder: { shapes: [{ p: 'M7 3v18M17 3v18M7 7.5h10M7 12h10M7 16.5h10' }] },
  flag: { shapes: [{ p: 'M6 21V4M6 4.5h11l-2.5 4 2.5 4H6' }] },
  gift: { shapes: [{ r: [4.5, 10.5, 15, 10, 1.5] }, { p: 'M3 7h18v3.5H3zM12 7v13.5' }, { p: 'M12 7c-1-3.2-5-3.6-5-1.2S10 7 12 7zM12 7c1-3.2 5-3.6 5-1.2S14 7 12 7z' }] },
  bolt: { shapes: [{ p: 'M13 2.5L5 13.5h5.5l-1 8L18 10.5h-5.5z' }] },
  home: { shapes: [{ p: 'M4 11.5L12 4l8 7.5M6.5 10v9.5h11V10' }] },
  bus: { shapes: [{ r: [3.5, 5, 17, 12, 2.5] }, { p: 'M3.5 11.5h17M9 5v6.5M15 5v6.5' }, { c: [8, 18.5, 1.6] }, { c: [16, 18.5, 1.6] }] },
  spark: { shapes: [{ p: 'M12 1l2.2 8.8L23 12l-8.8 2.2L12 23l-2.2-8.8L1 12l8.8-2.2z' }], solid: true },
  gem: { shapes: [{ p: 'M12 2.5l7.5 9.5-7.5 9.5L4.5 12z' }], solid: true },
  dot: { shapes: [{ c: [12, 12, 5] }], solid: true },
} as const satisfies Record<string, Drawing>;

export type LineIconName = keyof typeof DRAWINGS;

export interface LineIconProps {
  name: LineIconName;
  /** in screen points */
  size?: number;
  /** the line's colour; with a tube given, its soft line */
  color?: string;
  /** light it like a tube: the line takes the tube's soft colour and the tube's light spreads round it */
  tube?: TubeName | Tube;
  /** the line's thickness on the 24 grid */
  weight?: number;
}

export function LineIcon({ name, size = px(24), color, tube: t, weight = 2 }: LineIconProps) {
  const drawing: Drawing = DRAWINGS[name];
  const tb = t !== undefined ? tubeOf(t) : undefined;
  const line = color ?? tb?.soft ?? night.textDim;
  const draw = (key: string, stroke: string, strokeWidth: number, opacity: number, fill: string) =>
    drawing.shapes.map((s, i) => {
      const k = `${key}${i}`;
      const common = { stroke, strokeWidth, opacity, fill, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
      if ('p' in s) return <Path key={k} {...common} d={s.p} />;
      if ('c' in s) return <Circle key={k} {...common} cx={s.c[0]} cy={s.c[1]} r={s.c[2]} />;
      return <Rect key={k} {...common} x={s.r[0]} y={s.r[1]} width={s.r[2]} height={s.r[3]} rx={s.r[4]} />;
    });
  const solid = drawing.solid === true;
  // three grid squares of room all round for the light; the box the icon lays out in stays its own size
  const full = size * 1.25;
  const out = -size * 0.125;
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <Svg width={full} height={full} viewBox="-3 -3 30 30" style={{ position: 'absolute', left: out, top: out }}>
        {/* the light: the same lines again, wider and fainter, under the line itself */}
        {tb && draw('far', tb.glass, (solid ? 0 : weight) + 5.5, 0.16, 'none')}
        {tb && draw('near', tb.glass, (solid ? 0 : weight) + 2.6, 0.34, 'none')}
        {draw('line', solid ? 'none' : line, solid ? 0 : weight, 1, solid ? line : 'none')}
      </Svg>
    </View>
  );
}

/** A coin: the one thing in the arcade that is painted, not lit. */
export function Coin({ size = px(20) }: { size?: number }) {
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 26 26">
        <Circle cx={13} cy={13} r={11} fill={coinPaint.fill} stroke={coinPaint.edge} strokeWidth={2} />
        <Path d="M13 6.5l1.9 4 4.4.5-3.3 3 .9 4.3-3.9-2.2-3.9 2.2.9-4.3-3.3-3 4.4-.5z" fill={coinPaint.star} />
      </Svg>
    </View>
  );
}
