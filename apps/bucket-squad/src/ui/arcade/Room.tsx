/** The arcade itself: the wall behind every page, the floor, the stage a pack is opened on, and the light in the room. */

import { LinearGradient } from 'expo-linear-gradient';
import { memo, useId, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Ellipse, LinearGradient as SvgLinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';

import { halo, night, stop, tube as tubes, tubeOf, type Tube, type TubeName } from '@/theme/arcade';
import { px } from '@/theme/tokens';

/** An id for a gradient inside an SVG: unique on the page, and safe inside `url(#...)`. */
export function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
}

/** the gap between the wall's diagonal lines */
const LATTICE_PITCH = px(13);

/** Thin diagonal lines both ways: the quilted wall of the arcade. */
export const Lattice = memo(function Lattice({ width, height, color = night.lattice }: { width: number; height: number; color?: string }) {
  const d = useMemo(() => {
    // lines a pitch apart measured across them are that times root two apart along the top edge
    const step = LATTICE_PITCH * Math.SQRT2;
    const out: string[] = [];
    for (let x = -height; x < width; x += step) out.push(`M${x.toFixed(1)} 0l${height} ${height}`);
    for (let x = 0; x < width + height; x += step) out.push(`M${x.toFixed(1)} 0l${-height} ${height}`);
    return out.join('');
  }, [width, height]);
  if (!(width > 0 && height > 0)) return null;
  return (
    <Svg width={width} height={height} style={styles.pinned}>
      <Path d={d} stroke={color} strokeWidth={1} fill="none" />
    </Svg>
  );
});

/** The wall behind every menu page. */
export const Wall = memo(function Wall() {
  const { width, height } = useWindowDimensions();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient colors={[night.wallTop, night.wallMid, night.wallBottom]} locations={[0, 0.62, 1]} style={StyleSheet.absoluteFill} />
      <Lattice width={width} height={height} />
    </View>
  );
});

/**
 * The dark stage a pack is opened on: light in the middle of the room, falling away to black at the edges.
 * `at` is where the light is, as shares of the width and the height.
 */
export const StageWall = memo(function StageWall({ at = [0.28, 0.48] }: { at?: readonly [number, number] }) {
  const id = useSvgId('stage');
  // an ellipse the shape of the screen, big enough to reach the farthest corner
  const rx = Math.max(at[0], 1 - at[0]) * Math.SQRT2 * 100;
  const ry = Math.max(at[1], 1 - at[1]) * Math.SQRT2 * 100;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.stage]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id={id} cx={0} cy={0} r={1} gradientUnits="userSpaceOnUse" gradientTransform={`translate(${at[0] * 100} ${at[1] * 100}) scale(${rx} ${ry})`}>
            <Stop offset={0} stopColor={night.stageMid} />
            <Stop offset={0.46} stopColor={night.stageOut} />
            <Stop offset={1} stopColor={night.stageEdge} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
});

export interface RaysProps {
  /** the side of the square they are drawn in, in screen points */
  size: number;
  /** `#RRGGBB` */
  color?: string;
  /** how bright they are at their brightest */
  alpha?: number;
  /** rays all the way round */
  count?: number;
  /** how much of each step is lit */
  fill?: number;
  /** where the light fades, as shares of the half-size: full until the first, gone by the second. Left out, the rays do not fade. */
  fadeAt?: readonly [number, number];
  style?: StyleProp<ViewStyle>;
}

/** Rays of light fanning out from a point, like the back of a prize machine. */
export const Rays = memo(function Rays({ size, color = night.white, alpha = 0.2, count = 20, fill = 1 / 3, fadeAt, style }: RaysProps) {
  const id = useSvgId('rays');
  const d = useMemo(() => {
    // far enough to cover the corners of the square
    const far = 150;
    const step = (Math.PI * 2) / count;
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const a0 = i * step;
      const a1 = a0 + step * fill;
      out.push(`M0 0L${(Math.cos(a0) * far).toFixed(1)} ${(Math.sin(a0) * far).toFixed(1)}L${(Math.cos(a1) * far).toFixed(1)} ${(Math.sin(a1) * far).toFixed(1)}Z`);
    }
    return out.join('');
  }, [count, fill]);
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="-100 -100 200 200">
        {fadeAt && (
          <Defs>
            <RadialGradient id={id} cx={0} cy={0} r={100} gradientUnits="userSpaceOnUse">
              <Stop offset={0} stopColor={color} stopOpacity={alpha} />
              <Stop offset={fadeAt[0]} stopColor={color} stopOpacity={alpha} />
              <Stop offset={fadeAt[1]} stopColor={color} stopOpacity={0} />
            </RadialGradient>
          </Defs>
        )}
        <Path d={d} fill={fadeAt ? `url(#${id})` : color} opacity={fadeAt ? 1 : alpha} />
      </Svg>
    </View>
  );
});

/** A round patch of coloured light with soft edges: what a glowing thing throws on the wall behind it. */
export const Bloom = memo(function Bloom({ size, color, alpha = 0.85, style }: { size: number; /** `#RRGGBB` */ color: string; alpha?: number; style?: StyleProp<ViewStyle> }) {
  const id = useSvgId('bloom');
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Svg width={size} height={size} viewBox="-100 -100 200 200">
        <Defs>
          <RadialGradient id={id} cx={0} cy={0} r={100} gradientUnits="userSpaceOnUse">
            <Stop offset={0} stopColor={color} stopOpacity={alpha} />
            <Stop offset={0.42} stopColor={color} stopOpacity={alpha * 0.4} />
            <Stop offset={0.68} stopColor={color} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={-100} y={-100} width={200} height={200} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
});

/** The floor of the arcade, with a lit line where it meets the wall. Give it its place with `style`. */
export function Floor({ tube: t = 'pink', style }: { tube?: TubeName | Tube; style?: StyleProp<ViewStyle> }) {
  const tb = tubeOf(t);
  return (
    <View pointerEvents="none" style={[styles.floor, { borderTopColor: tb.glass, boxShadow: [halo(tb.glass, 14, 0.8)] }, style]}>
      <LinearGradient colors={[night.floorTop, night.floorBottom]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

/** A lit ring lying on the floor, seen from the front: the spot a squad stands on. */
export const StageRing = memo(function StageRing({ width, height, tube: t = 'cyan', style }: { width: number; height: number; tube?: TubeName | Tube; style?: StyleProp<ViewStyle> }) {
  const tb = tubeOf(t);
  const id = useSvgId('ring');
  const rx = width / 2;
  const ry = height / 2;
  // the tube sits a little inside the pool of light it throws
  const tx = rx - px(10);
  const ty = ry - px(4);
  return (
    <View pointerEvents="none" style={[{ width, height }, style]}>
      <Svg width={width} height={height} viewBox={`${-rx} ${-ry} ${width} ${height}`}>
        <Defs>
          <RadialGradient id={id} cx={0} cy={0} r={1} gradientUnits="userSpaceOnUse" gradientTransform={`scale(${rx} ${ry})`}>
            <Stop offset={0} stopColor={tb.tint} stopOpacity={0.5} />
            <Stop offset={0.46} stopColor={tb.glass} stopOpacity={0.2} />
            <Stop offset={0.7} stopColor={tb.glass} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Ellipse cx={0} cy={0} rx={rx} ry={ry} fill={`url(#${id})`} />
        <Ellipse cx={0} cy={0} rx={tx} ry={ty} fill="none" stroke={tb.glass} strokeWidth={px(11)} opacity={0.14} />
        <Ellipse cx={0} cy={0} rx={tx} ry={ty} fill="none" stroke={tb.glass} strokeWidth={px(5.5)} opacity={0.32} />
        <Ellipse cx={0} cy={0} rx={tx} ry={ty} fill="none" stroke={tb.glass} strokeWidth={px(2)} />
      </Svg>
    </View>
  );
});

/** A spotlight's beam coming down from the ceiling, narrow at the lamp and wide at the floor. */
export const Spotlight = memo(function Spotlight({ width, height, style }: { width: number; height: number; style?: StyleProp<ViewStyle> }) {
  const id = useSvgId('beam');
  // three beams of slightly different widths, one on another, so the edges are soft
  const beams: readonly (readonly [number, number, number])[] = [
    [0.4, -0.05, 0.3],
    [0.44, 0, 0.45],
    [0.47, 0.05, 0.4],
  ];
  return (
    <View pointerEvents="none" style={[{ width, height }, style]}>
      <Svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <SvgLinearGradient id={id} x1={0} y1={0} x2={0} y2={100} gradientUnits="userSpaceOnUse">
            <Stop offset={0} {...stop(night.beam)} />
            <Stop offset={1} {...stop(night.beamFar)} />
          </SvgLinearGradient>
        </Defs>
        {beams.map(([top, bottom, strength], i) => (
          <Polygon key={i} points={`${top * 100},0 ${(1 - top) * 100},0 ${(1 - bottom) * 100},100 ${bottom * 100},100`} fill={`url(#${id})`} opacity={strength} />
        ))}
      </Svg>
    </View>
  );
});

/** A row of marquee bulbs, every other one in the second colour. `phase` swaps which are lit, for a chase. */
export const Bulbs = memo(function Bulbs({ width, phase = 0, first = tubes.gold.glass, second = tubes.pink.glass, style }: { width: number; phase?: number; first?: string; second?: string; style?: StyleProp<ViewStyle> }) {
  const pitch = px(14);
  const n = Math.max(0, Math.floor(width / pitch));
  const r = px(2.6);
  const h = px(10);
  if (n === 0) return null;
  const left = (width - (n - 1) * pitch) / 2;
  return (
    <View pointerEvents="none" style={[{ width, height: h }, style]}>
      <Svg width={width} height={h}>
        {Array.from({ length: n }, (_, i) => {
          const c = (i + phase) % 2 === 0 ? first : second;
          const cx = left + i * pitch;
          return (
            <Ellipse key={i} cx={cx} cy={h / 2} rx={r * 1.7} ry={r * 1.7} fill={c} opacity={0.3} />
          );
        })}
        {Array.from({ length: n }, (_, i) => (
          <Ellipse key={i} cx={left + i * pitch} cy={h / 2} rx={r} ry={r} fill={(i + phase) % 2 === 0 ? first : second} />
        ))}
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  pinned: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  stage: {
    backgroundColor: night.stageEdge,
  },
  floor: {
    borderTopWidth: px(2),
    overflow: 'visible',
  },
});
