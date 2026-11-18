/** A foil pack: a crimped wrapper that catches the light, in the pack's own colours (or a team's). */

import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { teamById } from '@/data/roster';
import type { PackDef } from '@/meta/packs';
import { fade, foil as foils, halo, night, teamFoil, type Foil } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { LineIcon, type LineIconName } from './LineIcon';
import { MIN_FIT_LABEL } from './measure';
import { useSvgId } from './Room';
import { Print } from './Type';

/** the drawing's own grid */
const W = 100;
const H = 130;
/** height for a width of 1 */
export const FOIL_RATIO = H / W;
/** teeth along the crimped top and bottom edges, and how deep they are cut */
const TEETH = 16;
const BITE = 2.4;
/** below this width a pack is a thumbnail: wrapper and shine only */
const PLAIN = px(56);

function wrapper(): string {
  const step = W / TEETH;
  let d = `M0 ${BITE}`;
  for (let i = 0; i < TEETH; i++) d += `L${(step * (i + 0.5)).toFixed(2)} 0L${(step * (i + 1)).toFixed(2)} ${BITE}`;
  d += `L${W} ${H - BITE}`;
  for (let i = TEETH - 1; i >= 0; i--) d += `L${(step * (i + 0.5)).toFixed(2)} ${H}L${(step * i).toFixed(2)} ${H - BITE}`;
  return `${d}Z`;
}

const WRAPPER = wrapper();

/** the line a slanted colour run follows across the wrapper: its two ends, for an angle measured as CSS does */
function run(deg: number): { x1: number; y1: number; x2: number; y2: number; ux: number; uy: number; len: number } {
  const a = (deg * Math.PI) / 180;
  const ux = Math.sin(a);
  const uy = -Math.cos(a);
  const len = Math.abs(W * ux) + Math.abs(H * uy);
  return { x1: W / 2 - (ux * len) / 2, y1: H / 2 - (uy * len) / 2, x2: W / 2 + (ux * len) / 2, y2: H / 2 + (uy * len) / 2, ux, uy, len };
}

const COLOUR_RUN = run(125);

/** bright stripes across the foil: each is a band between two distances along a slanted line */
function stripes(from: number, to: number, every: number): string {
  const r = run(115);
  const far = 200;
  let d = '';
  for (let t = from; t < r.len; t += every) {
    const a = { x: r.x1 + r.ux * t, y: r.y1 + r.uy * t };
    const b = { x: r.x1 + r.ux * (t + (to - from)), y: r.y1 + r.uy * (t + (to - from)) };
    // across the line, far past both edges: the wrapper's outline cuts it to shape
    const px2 = -r.uy * far;
    const py2 = r.ux * far;
    d += `M${(a.x + px2).toFixed(1)} ${(a.y + py2).toFixed(1)}L${(a.x - px2).toFixed(1)} ${(a.y - py2).toFixed(1)}L${(b.x - px2).toFixed(1)} ${(b.y - py2).toFixed(1)}L${(b.x + px2).toFixed(1)} ${(b.y + py2).toFixed(1)}Z`;
  }
  return d;
}

const STRIPES = stripes(12, 17, 31);
/** a thumbnail's stripes are closer together, so a few still cross it */
const STRIPES_PLAIN = stripes(20, 31, 54);

/** the ribs pressed into the wrapper's ends: one path for the light ribs, one for the dark gaps between them */
function ribs(offset: number): string {
  let d = '';
  for (let x = offset; x < W; x += 4) d += `M${x} 0h2v11h-2zM${x} ${H - 11}h2v11h-2z`;
  return d;
}

const RIBS_LIGHT = ribs(0);
const RIBS_DARK = ribs(2);

const EMBLEM: Record<string, LineIconName> = { playground: 'ball', allstar: 'star', legend: 'crown' };

/** The foil a pack is wrapped in. */
export function foilFor(pack: PackDef): Foil {
  if (pack.team) {
    const team = teamById(pack.team);
    return teamFoil(team.color, team.color2);
  }
  return (foils as Record<string, Foil>)[pack.id] ?? foils.playground;
}

export interface FoilPackProps {
  pack: PackDef;
  /** in screen points */
  width?: number;
  /** no light round it */
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const FoilPack = memo(function FoilPack({ pack, width = px(100), flat, style }: FoilPackProps) {
  const f = foilFor(pack);
  const height = Math.round(width * FOIL_RATIO);
  const k = width / W;
  const plain = width < PLAIN;
  const id = useSvgId('foil');
  const clip = useSvgId('wrap');
  const emblem = 46 * k;
  const team = pack.team ? teamById(pack.team) : undefined;
  return (
    <View style={[{ width, height }, style]}>
      {/* the light the foil throws: a lit box just inside the wrapper's outline, hidden by the wrapper itself */}
      {!flat && <View style={[styles.light, { left: width * 0.06, right: width * 0.06, top: height * 0.05, bottom: height * 0.05, backgroundColor: f.glow, boxShadow: [halo(f.glow, plain ? 7 : 13, 0.75)] }]} />}
      <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`} style={styles.wrapper}>
        <Defs>
          <LinearGradient id={id} x1={COLOUR_RUN.x1} y1={COLOUR_RUN.y1} x2={COLOUR_RUN.x2} y2={COLOUR_RUN.y2} gradientUnits="userSpaceOnUse">
            {f.colors.map((c, i) => (
              <Stop key={i} offset={f.stops[i]} stopColor={c} />
            ))}
          </LinearGradient>
          <ClipPath id={clip}>
            <Path d={WRAPPER} />
          </ClipPath>
        </Defs>
        <G clipPath={`url(#${clip})`}>
          <Rect x={0} y={0} width={W} height={H} fill={`url(#${id})`} />
          <Path d={plain ? STRIPES_PLAIN : STRIPES} fill={night.white} opacity={plain ? 0.35 : 0.32} />
          {!plain && <Path d={RIBS_LIGHT} fill={night.white} opacity={0.55} />}
          {!plain && <Path d={RIBS_DARK} fill={night.black} opacity={0.18} />}
          {!plain && <Rect x={0} y={H - 37} width={W} height={19} fill={night.onTube} />}
          {!plain && <Circle cx={W / 2} cy={47} r={22} fill={night.onTube} stroke={night.white} strokeWidth={2} />}
        </G>
      </Svg>
      {!plain && (
        <View pointerEvents="none" style={[styles.emblem, { left: width / 2 - emblem / 2, top: 47 * k - emblem / 2, width: emblem, height: emblem }]}>
          {team ? (
            <Print face="bold" size={emblem * 0.34} color={f.ink} track="normal" room={emblem * 0.78} least={MIN_FIT_LABEL}>
              {team.short}
            </Print>
          ) : (
            <LineIcon name={EMBLEM[pack.id] ?? 'ball'} size={emblem * 0.56} color={f.ink} />
          )}
        </View>
      )}
      {!plain && (
        <View pointerEvents="none" style={[styles.count, { top: (H - 37) * k, height: 19 * k }]}>
          <Print face="bold" size={Math.max(px(8), 10.5 * k)} track="normal" room={width * 0.9} least={MIN_FIT_LABEL}>
            {`${pack.cards} PLAYERS`}
          </Print>
        </View>
      )}
    </View>
  );
});

/** The soft colour a pack throws on the wall behind it. */
export function foilLight(pack: PackDef, alpha = 0.22): string {
  return fade(foilFor(pack).glow, alpha);
}

const styles = StyleSheet.create({
  light: {
    position: 'absolute',
  },
  wrapper: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  emblem: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
