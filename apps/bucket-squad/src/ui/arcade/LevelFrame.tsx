/**
 * The frame a player card wears for its level, drawn over the card. Level 1 is the plain rim. Each level after it
 * adds one piece and keeps the ones before: a neon trim inside the rim (in the rarity's own glow), a lit gold stud
 * in each corner, a chrome edge round the card, and at the top level the edge turns gold and a crest sits on top.
 * The rarity stays the card's colour; the frame only trims it.
 *
 * Given `from` and a clock `t` (0 to 1), the pieces the level up added come in on `t` over the pieces the card had:
 * the frame upgrades in place, with a ring of light bursting off it. With less motion asked for they only fade.
 */

import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

import { CHROME_STOPS, halo, levelPaint, tube as tubes, type Tube } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { frameTier, type FramePiece } from './levels';
import { useSvgId } from './Room';

const GOLD = tubes[levelPaint.tube];
/** the crest's shield, in a 24 by 24 box, and the crown on it */
const SHIELD = 'M12 1.2L21.4 4.6V11.4C21.4 17.1 17.4 20.9 12 22.9C6.6 20.9 2.6 17.1 2.6 11.4V4.6Z';
const CROWN = 'M3 8l4.5 4L12 5l4.5 7L21 8l-1.8 10.5H4.8z';

export interface FrameBox {
  width: number;
  height: number;
  /** the card's corner radius */
  round: number;
  /** how thick the card's own rim is: the trim runs just inside it */
  rim: number;
  /** a cell in the collection grid, not a card: thinner pieces, and a smaller crest */
  small?: boolean;
  /** the card width the pieces are sized for, when the box is not card-shaped (a wide picture); its width otherwise */
  basis?: number;
}

/** The sizes of each piece for a box: worked out once, so a worklet never has to. */
function measure(b: FrameBox) {
  const w = b.basis ?? b.width;
  const trim = b.small ? px(1.3) : Math.max(px(1.3), w * 0.011);
  const trimAt = b.rim + (b.small ? px(1.6) : Math.max(px(1.5), w * 0.014));
  const stud = b.small ? px(2.1) : Math.max(px(2.6), w * 0.027);
  const studAt = Math.max(b.rim * 0.5 + stud * 0.4, b.round * 0.3);
  const chrome = b.small ? px(1.7) : Math.max(px(2), w * 0.021);
  const crest = b.small ? px(13) : Math.max(px(17), w * 0.17);
  // the crest stands on the top edge: a card's a little under half above it, a cell's mostly inside, clear of the row above
  const crestTop = b.small ? -crest * 0.3 : -crest * 0.45;
  const pad = Math.ceil(Math.max(chrome * 3.5, stud * 2, -crestTop + px(2)));
  return { trim, trimAt, stud, studAt, chrome, crest, crestTop, pad };
}

type Size = ReturnType<typeof measure>;

/** One layer of the frame: the pieces named, drawn in one picture over the card and round it. */
function Pieces({ box, size, pieces, gold, glow }: { box: FrameBox; size: Size; pieces: readonly FramePiece[]; gold: boolean; glow: Tube }) {
  const id = useSvgId('frame');
  const { width: w, height: h, round: r } = box;
  const { pad: P, trim, trimAt, stud, studAt, chrome, crest, crestTop } = size;
  const has = (k: FramePiece) => pieces.includes(k);
  const edge = gold ? levelPaint.goldChrome : levelPaint.chrome;
  const corners = [
    [studAt, studAt],
    [w - studAt, studAt],
    [studAt, h - studAt],
    [w - studAt, h - studAt],
  ] as const;
  const cx = w / 2;
  return (
    <Svg width={w + P * 2} height={h + P * 2} style={{ position: 'absolute', left: -P, top: -P }}>
      <Defs>
        <LinearGradient id={`${id}e`} x1={0} y1={0} x2={w + P * 2} y2={h + P * 2} gradientUnits="userSpaceOnUse">
          {edge.map((c, i) => (
            <Stop key={i} offset={CHROME_STOPS[i]} stopColor={c} />
          ))}
        </LinearGradient>
        <LinearGradient id={`${id}c`} x1={0} y1={0} x2={0} y2={1}>
          {levelPaint.crest.map((c, i) => (
            <Stop key={i} offset={i / (levelPaint.crest.length - 1)} stopColor={c} />
          ))}
        </LinearGradient>
      </Defs>
      <G transform={`translate(${P} ${P})`}>
        {has('chrome') && (
          <>
            {gold && <Rect x={-chrome / 2} y={-chrome / 2} width={w + chrome} height={h + chrome} rx={r + chrome / 2} fill="none" stroke={GOLD.glass} strokeOpacity={0.35} strokeWidth={chrome * 3.2} />}
            <Rect x={-chrome / 2} y={-chrome / 2} width={w + chrome} height={h + chrome} rx={r + chrome / 2} fill="none" stroke={`url(#${id}e)`} strokeWidth={chrome} />
          </>
        )}
        {has('trim') && (
          <>
            <Rect x={trimAt} y={trimAt} width={w - trimAt * 2} height={h - trimAt * 2} rx={Math.max(1, r - trimAt)} fill="none" stroke={glow.glass} strokeOpacity={0.5} strokeWidth={trim * 4.5} />
            <Rect x={trimAt} y={trimAt} width={w - trimAt * 2} height={h - trimAt * 2} rx={Math.max(1, r - trimAt)} fill="none" stroke={glow.soft} strokeWidth={trim * 2} />
            <Rect x={trimAt} y={trimAt} width={w - trimAt * 2} height={h - trimAt * 2} rx={Math.max(1, r - trimAt)} fill="none" stroke={levelPaint.trim} strokeWidth={trim * 0.9} />
          </>
        )}
        {has('studs') &&
          corners.map(([x, y], i) => (
            <G key={i}>
              <Circle cx={x} cy={y} r={stud * 2} fill={levelPaint.stud} fillOpacity={0.3} />
              <Circle cx={x} cy={y} r={stud} fill={levelPaint.stud} />
              <Circle cx={x - stud * 0.15} cy={y - stud * 0.15} r={stud * 0.45} fill={levelPaint.studCore} />
            </G>
          ))}
        {has('crest') && (
          <G transform={`translate(${cx - crest / 2} ${crestTop}) scale(${crest / 24})`}>
            <G>
              <Path d={SHIELD} fill={GOLD.glass} fillOpacity={0.35} stroke={GOLD.glass} strokeOpacity={0.35} strokeWidth={4} />
              <Path d={SHIELD} fill={`url(#${id}c)`} stroke={GOLD.tint} strokeWidth={1.2} />
              <G transform="translate(6 5.4) scale(0.5)">
                <Path d={CROWN} fill={levelPaint.crestInk} />
              </G>
            </G>
          </G>
        )}
      </G>
    </Svg>
  );
}

export interface LevelFrameProps extends FrameBox {
  level: number;
  /** the rarity's tube: the trim glows in it */
  glow: Tube;
  /** for a level up: the level the card had, and the clock (0 to 1) the new pieces come in on */
  from?: number;
  t?: SharedValue<number>;
}

const PIECES: readonly FramePiece[] = ['trim', 'studs', 'chrome', 'crest'];

function piecesOf(level: number): FramePiece[] {
  const tier = frameTier(level);
  return PIECES.filter((k) => tier[k]);
}

/** The new pieces snapping in over the old frame, and a ring of light bursting off the card as they land. */
function Upgrade({ box, size, pieces, gold, glow, t }: { box: FrameBox; size: Size; pieces: readonly FramePiece[]; gold: boolean; glow: Tube; t: SharedValue<number> }) {
  const reduced = useReducedMotion();
  const still = reduced ? 0 : 1;
  const grow = box.small ? 0.06 : 0.1;
  const come = useAnimatedStyle(() => {
    const u = Math.max(0, Math.min(1, t.value));
    const e = 1 - (1 - u) * (1 - u) * (1 - u);
    return { opacity: Math.min(1, u * 2.5), transform: [{ scale: 1 + still * grow * 1.6 * (1 - e) }] };
  });
  const burst = useAnimatedStyle(() => {
    const u = t.value;
    return { opacity: u > 0 && u < 1 ? still * (1 - u) * 0.95 : 0, transform: [{ scale: 1 + grow * 1.4 * u }] };
  });
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.burst, { width: box.width, height: box.height, borderRadius: box.round, borderWidth: Math.max(px(2), size.chrome * 1.4), boxShadow: [halo(GOLD.glass, box.small ? 8 : 18, 1)] }, burst]} />
      <Animated.View pointerEvents="none" style={[styles.layer, { width: box.width, height: box.height }, come]}>
        <Pieces box={box} size={size} pieces={pieces} gold={gold} glow={glow} />
      </Animated.View>
    </>
  );
}

export const LevelFrame = memo(function LevelFrame({ level, glow, from, t, ...box }: LevelFrameProps) {
  const size = measure(box);
  const now = piecesOf(level);
  const gold = frameTier(level).crest;
  if (from === undefined || t === undefined || from >= level) {
    if (now.length === 0) return null;
    return (
      <View pointerEvents="none" style={[styles.layer, { width: box.width, height: box.height }]}>
        <Pieces box={box} size={size} pieces={now} gold={gold} glow={glow} />
      </View>
    );
  }
  const had = piecesOf(from);
  // the gold edge replaces the chrome one: it comes in with the crest, over the chrome
  const added = now.filter((k) => !had.includes(k) || (k === 'chrome' && gold && !frameTier(from).crest));
  return (
    <View pointerEvents="none" style={[styles.layer, { width: box.width, height: box.height }]}>
      {had.length > 0 && <Pieces box={box} size={size} pieces={had} gold={false} glow={glow} />}
      <Upgrade box={box} size={size} pieces={added} gold={gold} glow={glow} t={t} />
    </View>
  );
});

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  burst: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderColor: GOLD.glass,
  },
});
