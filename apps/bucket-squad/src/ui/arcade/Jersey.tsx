/**
 * A uniform drawn flat, the way it hangs in a locker: a tank top in the jersey colour with its trim round the
 * collar and the arm holes and a number on the front, and the shorts under it when there is room.
 */

import { memo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop, Text as SvgText } from 'react-native-svg';

import type { KitColors } from '@/game/kit/look';
import { neonFont, night } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { useSvgId } from './Room';

/** the drawing's own grid: the top alone, and the top over its shorts */
const W = 100;
const TOP_H = 112;
const FULL_H = 150;

/** width over height, so a layout can size the box before drawing in it */
export const JERSEY_RATIO = TOP_H / W;
export const JERSEY_FULL_RATIO = FULL_H / W;

// the tank top: straps, a scooped collar, deep arm holes, and a hem that curves a little
const BODY = 'M29 4H41C42 20 58 20 59 4H71C71 20 78 31 91 35L93 104Q50 113 7 104L9 35C22 31 29 20 29 4Z';
const COLLAR = 'M41 4C42 20 58 20 59 4';
const ARM_LEFT = 'M29 4C29 20 22 31 9 35';
const ARM_RIGHT = 'M71 4C71 20 78 31 91 35';
// a stripe down each side, from the arm hole to the hem
const SIDE_LEFT = 'M12 40L10.5 101';
const SIDE_RIGHT = 'M88 40L89.5 101';
const SHORTS = 'M12 96H88L94 142Q74 146 55 143L50 122L45 143Q26 146 6 142Z';
const SHORTS_SIDE_LEFT = 'M11 100L7.5 139';
const SHORTS_SIDE_RIGHT = 'M89 100L92.5 139';

export interface JerseyProps {
  kit: KitColors;
  /** on the front; left out, the front is plain */
  number?: string | number;
  /** the box's width in screen points; the height follows */
  width?: number;
  /** the shorts under the top */
  shorts?: boolean;
  /** not yours yet: drawn faint */
  dim?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A jersey in a uniform's colours. */
export const Jersey = memo(function Jersey({ kit, number, width = px(60), shorts = false, dim = false, style }: JerseyProps) {
  const shine = useSvgId('shine');
  const h = shorts ? FULL_H : TOP_H;
  const label = number === undefined ? '' : String(number);
  // one figure sits big in the middle, two share the width
  const numberSize = label.length > 1 ? 36 : 44;
  return (
    <View pointerEvents="none" style={[{ width, height: (width * h) / W, opacity: dim ? 0.38 : 1 }, style]}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${h}`}>
        <Defs>
          {/* light from the top left, falling off across the cloth */}
          <LinearGradient id={shine} x1={0} y1={0} x2={1} y2={1}>
            <Stop offset={0} stopColor={night.white} stopOpacity={0.28} />
            <Stop offset={0.55} stopColor={night.white} stopOpacity={0} />
            <Stop offset={1} stopColor={night.black} stopOpacity={0.22} />
          </LinearGradient>
        </Defs>
        {shorts && (
          <>
            <Path d={SHORTS} fill={kit.shorts} stroke={night.lineLit} strokeWidth={1.5} strokeLinejoin="round" />
            <Path d={SHORTS_SIDE_LEFT} stroke={kit.shortsTrim} strokeWidth={4} strokeLinecap="round" />
            <Path d={SHORTS_SIDE_RIGHT} stroke={kit.shortsTrim} strokeWidth={4} strokeLinecap="round" />
            <Path d={SHORTS} fill={`url(#${shine})`} />
          </>
        )}
        <Path d={BODY} fill={kit.jersey} stroke={night.lineLit} strokeWidth={1.5} strokeLinejoin="round" />
        <Path d={SIDE_LEFT} stroke={kit.trim} strokeWidth={3} strokeLinecap="round" />
        <Path d={SIDE_RIGHT} stroke={kit.trim} strokeWidth={3} strokeLinecap="round" />
        <Path d={COLLAR} fill="none" stroke={kit.trim} strokeWidth={5.5} strokeLinecap="round" />
        <Path d={ARM_LEFT} fill="none" stroke={kit.trim} strokeWidth={5.5} strokeLinecap="round" />
        <Path d={ARM_RIGHT} fill="none" stroke={kit.trim} strokeWidth={5.5} strokeLinecap="round" />
        {label !== '' && (
          <SvgText x={W / 2} y={74} fontFamily={neonFont.display} fontSize={numberSize} fill={kit.number} stroke={kit.trim} strokeWidth={1.2} textAnchor="middle">
            {label}
          </SvgText>
        )}
        <Path d={BODY} fill={`url(#${shine})`} />
      </Svg>
    </View>
  );
});
