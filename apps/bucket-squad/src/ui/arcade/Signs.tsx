/**
 * Neon signs hung on the arcade's wall: a basketball hoop and a star, bent from tubes with light round them.
 * Drawn the way `LineIcon` lights its lines: the same strokes again, wider and fainter, under a bright core.
 */

import { memo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { tube as tubes, tubeOf, type Tube, type TubeName } from '@/theme/arcade';

interface Bend {
  d: string;
  tube: TubeName | Tube;
  /** the tube's thickness on the drawing's own grid */
  weight: number;
}

/** room round the drawing for its light, in the drawing's own units */
const ROOM = 6;

/** `reach` is how far the light spreads, in the drawing's own units for every unit of a 92-wide drawing: a small drawing keeps it in proportion */
function NeonDrawing({ bends, w, h, width, height, reach = 1, style }: { bends: readonly Bend[]; w: number; h: number; width: number; height: number; reach?: number; style?: StyleProp<ViewStyle> }) {
  const k = width / w;
  const layer = (key: string, stroke: (t: Tube) => string, extra: (weight: number) => number, opacity: number) => (
    <G key={key} opacity={opacity}>
      {bends.map((b, i) => (
        <Path key={i} d={b.d} stroke={stroke(tubeOf(b.tube))} strokeWidth={extra(b.weight)} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </G>
  );
  return (
    <View pointerEvents="none" style={[{ width, height }, style]}>
      <Svg width={width + ROOM * 2 * k} height={height + ROOM * 2 * k} viewBox={`${-ROOM} ${-ROOM} ${w + ROOM * 2} ${h + ROOM * 2}`} style={{ position: 'absolute', left: -ROOM * k, top: -ROOM * k }}>
        {layer('far', (t) => t.glass, (wt) => wt + 9 * reach, 0.12)}
        {layer('near', (t) => t.glass, (wt) => wt + 4 * reach, 0.3)}
        {layer('tube', (t) => t.glass, (wt) => wt, 1)}
        {/* the hot middle of the tube, nearly white */}
        {layer('core', (t) => t.tint, (wt) => wt * 0.38, 0.75)}
      </Svg>
    </View>
  );
}

const HOOP: readonly Bend[] = [
  // the backboard and the square on it
  { d: 'M12 6h68a6 6 0 0 1 6 6v42a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6V12a6 6 0 0 1 6-6z', tube: 'cyan', weight: 3 },
  { d: 'M34 28h24a2 2 0 0 1 2 2v18a2 2 0 0 1-2 2H34a2 2 0 0 1-2-2V30a2 2 0 0 1 2-2z', tube: 'cyan', weight: 3 },
  // the rim and the net hanging from it
  { d: 'M28 60h36', tube: 'pink', weight: 4 },
  { d: 'M31 62l5 26M61 62l-5 26M41 62l2 26M51 62l-2 26M34 76h24', tube: 'pink', weight: 2.2 },
];

/** the hoop sign's shape for hanging it: its height for a width of 1, and where its board (with the rim) is on it */
export const HOOP_SHAPE = { ratio: 96 / 92, left: 6 / 92, right: 86 / 92, bottom: 62 / 96 } as const;

/** A neon hoop: the backboard in cyan, the rim and net in pink. `width` in screen points. */
export const HoopSign = memo(function HoopSign({ width, style }: { width: number; style?: StyleProp<ViewStyle> }) {
  return <NeonDrawing bends={HOOP} w={92} h={96} width={width} height={(width * 96) / 92} style={style} />;
});

const STAR: readonly Bend[] = [{ d: 'M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5-5.9-3.3-5.9 3.3 1.3-6.5-4.9-4.5 6.6-.8z', tube: tubes.gold, weight: 1.5 }];

/** A neon star, tipped a little, in gold. */
export const StarSign = memo(function StarSign({ size, style }: { size: number; style?: StyleProp<ViewStyle> }) {
  return <NeonDrawing bends={STAR} w={24} h={24} width={size} height={size} reach={0.5} style={[{ transform: [{ rotate: '12deg' }] }, style]} />;
});
