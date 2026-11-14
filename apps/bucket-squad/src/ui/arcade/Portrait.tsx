/**
 * A player's picture in a lit box: the figure from the waist up on rays of light in the rarity's colours,
 * with the rarity word lit beside it and the overall rating in its box. A player not found yet is a
 * dark shape on a dark box, with the rarity still lit so the child knows what they are hunting for.
 * It takes whatever room its parent gives it and fits itself in.
 */

import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { cardArt, playerOverall } from '@/data/roster';
import { RARITY_LABEL, type PlayerDef } from '@/data/types';
import { tapFeedback } from '@/fx/feedback';
import { arcade, fade, night, rarityPaint, tube as tubes } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { LevelFrame } from './LevelFrame';
import { MIN_FIT_LABEL } from './measure';
import { Rays, useSvgId } from './Room';
import { OvrBox } from './Surface';
import { Glow, Print } from './Type';

/** the card pictures' height for a width of 1 */
const ART_RATIO = 560 / 440;
/** the figure is drawn this many times the box's height, so the box shows it from the waist up */
const ART_TALL = 1.72;
/** below this height the rarity word and the rating sit side by side instead of one over the other */
const STACKED = px(88);

/** Light from behind the figure, bright where it stands and falling away to the rarity's dark. */
const Backlight = memo(function Backlight({ colors }: { colors: readonly [string, string, string] }) {
  const id = useSvgId('backlight');
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id={id} cx={0} cy={0} r={1} gradientUnits="userSpaceOnUse" gradientTransform="translate(30 42) scale(96 112)">
          <Stop offset={0} stopColor={colors[0]} />
          <Stop offset={0.46} stopColor={colors[1]} />
          <Stop offset={1} stopColor={colors[2]} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={100} height={100} fill={`url(#${id})`} />
    </Svg>
  );
});

export interface PortraitProps {
  player: PlayerDef;
  /** 0 when the player is not found yet */
  level: number;
  /** opens the player's own page */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const Portrait = memo(function Portrait({ player, level, onPress, style }: PortraitProps) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox((b) => (Math.abs(b.w - width) < 0.5 && Math.abs(b.h - height) < 0.5 ? b : { w: width, h: height }));
  };
  const rp = rarityPaint[player.rarity];
  const tb = tubes[rp.tube];
  const found = level > 0;
  const art = cardArt(player.id);
  const { w, h } = box;
  // a tall box (a tablet) keeps the figure the size a wide one would give it, standing at the bottom
  const s = Math.min(h, w * 0.5);
  const artH = s * ART_TALL;
  const artW = artH / ART_RATIO;
  const stacked = h >= STACKED;
  const pad = Math.max(px(8), Math.round(s * 0.1));
  const word = RARITY_LABEL[player.rarity].toUpperCase();

  const face = (
    <View onLayout={onLayout} style={[styles.box, styles.fill, { backgroundColor: found ? rp.halo[2] : night.plate }]}>
      {w > 0 && (
        <>
          {found && <Backlight colors={rp.halo} />}
          {found && <Rays size={w * 1.45} alpha={0.14} count={20} fill={1 / 3} style={{ position: 'absolute', left: w * 0.3 - w * 0.725, top: h * 0.45 - w * 0.725 }} />}
          {art !== undefined && (
            <Image
              source={art}
              contentFit="contain"
              transition={0}
              tintColor={found ? undefined : night.lineLit}
              style={{ position: 'absolute', left: w * 0.28 - artW / 2, top: h - s * 1.23, width: artW, height: artH, opacity: found ? 1 : 0.3 }}
            />
          )}
          {/* the rarity and the rating keep to the right half, clear of the figure: one over the other, and on a short
              picture the rating as a small chip instead of its box */}
          <View style={[styles.side, { right: pad, top: stacked ? pad : 0, bottom: stacked ? undefined : 0, justifyContent: 'center', gap: stacked ? px(6) : px(4) }]}>
            <Glow face="sign" size={stacked ? 'sign' : 'body'} tube={tb} track={stacked ? 'widest' : 'wider'} tight room={w * 0.46 - pad} least={MIN_FIT_LABEL}>
              {word}
            </Glow>
            {found &&
              (stacked ? (
                <OvrBox value={playerOverall(player, level)} tube={{ ...tb, glass: tb.soft }} small />
              ) : (
                <View style={[styles.chip, { borderColor: tb.soft }]}>
                  <Print face="bold" size="micro" color="textDim" track="wide">
                    OVR
                  </Print>
                  <Print face="display" size="large">
                    {String(playerOverall(player, level))}
                  </Print>
                </View>
              ))}
          </View>
        </>
      )}
    </View>
  );
  // the level's frame, over the picture and round it: the box clips what is inside it, not what stands round it
  const framed = (
    <View style={[styles.fill, onPress ? undefined : style]}>
      {face}
      {found && w > 0 && <LevelFrame level={level} glow={tb} width={w} height={h} round={arcade.rButton} rim={0} basis={Math.min(w, h)} />}
    </View>
  );
  if (!onPress) return framed;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`See ${player.name} up close`}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [styles.fill, pressed && styles.pressed, style]}>
      {framed}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  box: {
    overflow: 'hidden',
    borderRadius: arcade.rButton,
  },
  fill: {
    flex: 1,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(5),
    height: px(26),
    paddingHorizontal: px(7),
    borderRadius: arcade.rChip,
    borderWidth: arcade.hairline,
    backgroundColor: fade(night.pit, 0.82),
  },
  side: {
    position: 'absolute',
    alignItems: 'flex-end',
    gap: px(6),
  },
  pressed: {
    opacity: 0.85,
  },
});
