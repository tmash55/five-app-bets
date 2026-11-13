/** A foil card pack, drawn with shapes so every pack (and every team's pack) gets its own colours. */

import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';

import { teamById } from '@/data/roster';
import type { PackDef } from '@/meta/packs';
import { color, opacity, size as sizes, stroke, text } from '@/theme/tokens';
import { TeamBadge } from './Bits';
import { MIN_FIT_LABEL, fitSize } from './fitName';
import { Icon } from './Icon';
import { Txt, resolveColor } from './Txt';

/** the drawing's own grid */
const W = 100;
const H = 138;
const TEETH = 9;
/** the name strip's margin from each side of the pack, on the drawing's grid */
const LABEL_INSET = 14;

/** height for a width of 1 */
export const PACK_RATIO = H / W;

function wrapper(): string {
  const left = 7;
  const right = W - 7;
  const top = 9;
  const bottom = H - 9;
  const step = (right - left) / TEETH;
  let d = `M${left} ${top}`;
  for (let i = 0; i < TEETH; i++) d += ` L${(left + step * (i + 0.5)).toFixed(1)} ${top - 5} L${(left + step * (i + 1)).toFixed(1)} ${top}`;
  d += ` L${right} ${bottom}`;
  for (let i = TEETH - 1; i >= 0; i--) d += ` L${(left + step * (i + 0.5)).toFixed(1)} ${bottom + 5} L${(left + step * i).toFixed(1)} ${bottom}`;
  return `${d} Z`;
}

const WRAPPER = wrapper();

function star(cx: number, cy: number, r: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`);
  }
  return pts.join(' ');
}

export const PackArt = memo(function PackArt({ pack, width = sizes.card, style }: { pack: PackDef; width?: number; style?: StyleProp<ViewStyle> }) {
  const height = Math.round(width * PACK_RATIO);
  const fill = resolveColor(pack.fill);
  const fill2 = resolveColor(pack.fill2);
  const accent = resolveColor(pack.accent);
  const k = width / W;
  const emblem = 42 * k;
  const label = pack.name.replace(/ Pack$/, '').toUpperCase();
  const labelSize = width >= sizes.cardLarge ? 'large' : width >= sizes.card ? 'body' : 'tiny';
  return (
    <View style={[{ width, height }, style]}>
      <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`}>
        {/* hard shadow, then the wrapper */}
        <Path d={WRAPPER} fill={color.ink} transform="translate(0 4)" />
        <Path d={WRAPPER} fill={fill} stroke={color.ink} strokeWidth={stroke.regular} strokeLinejoin="round" />
        <Rect x={8.5} y={10} width={W - 17} height={11} fill={fill2} />
        <Rect x={8.5} y={H - 21} width={W - 17} height={11} fill={fill2} />
        <Polygon points={`22,21 44,21 20,${H - 21} 8.5,${H - 21} 8.5,74`} fill={color.white} opacity={opacity.pattern * 1.8} />
        <Polygon points={`52,21 60,21 36,${H - 21} 28,${H - 21}`} fill={color.white} opacity={opacity.pattern * 1.8} />
        <Polygon points={star(22, 36, 6)} fill={accent} stroke={color.ink} strokeWidth={stroke.hair} strokeLinejoin="round" />
        <Polygon points={star(80, 44, 4.5)} fill={accent} stroke={color.ink} strokeWidth={stroke.hair} strokeLinejoin="round" />
        <Polygon points={star(76, 108, 5)} fill={accent} stroke={color.ink} strokeWidth={stroke.hair} strokeLinejoin="round" />
        <Circle cx={W / 2} cy={62} r={24} fill={color.ink} />
        <Circle cx={W / 2} cy={60} r={24} fill={accent} stroke={color.ink} strokeWidth={stroke.regular} />
        <Path d={`M12 88 L${W - 12} 84 L${W - 12} 104 L12 108 Z`} fill={color.paper} stroke={color.ink} strokeWidth={stroke.thin} strokeLinejoin="round" />
      </Svg>
      <View pointerEvents="none" style={[styles.emblem, { top: 60 * k - emblem / 2, left: width / 2 - emblem / 2, width: emblem, height: emblem }]}>
        {pack.team ? <TeamBadge team={teamById(pack.team)} diameter={emblem} /> : <Icon name={pack.id === 'legend' ? 'crown' : pack.id === 'allstar' ? 'star' : 'ball'} size={emblem * 0.72} color="white" />}
      </View>
      {/* a pack drawn as small as an icon keeps its name strip blank: no name fits there */}
      {width >= sizes.badge && (
        <View pointerEvents="none" style={[styles.label, { top: 86 * k, height: 20 * k, left: LABEL_INSET * k, right: LABEL_INSET * k }]}>
          <Txt font="display" size={labelSize} fit center style={{ fontSize: fitSize(label, text[labelSize], width - LABEL_INSET * 2 * k, MIN_FIT_LABEL) }}>
            {label}
          </Txt>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  emblem: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-2.3deg' }],
  },
});
