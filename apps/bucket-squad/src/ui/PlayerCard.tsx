/** A collectible player card: rarity frame, the figure's picture, overall rating, name and level. */

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';

import { MAX_LEVEL, cardArt, playerOverall, teamById } from '@/data/roster';
import type { PlayerDef } from '@/data/types';
import { tapFeedback } from '@/fx/feedback';
import { color, duration, opacity, size as sizes, space, stroke, text } from '@/theme/tokens';
import { RARITY_COLOR, Tag, TeamBadge } from './Bits';
import { Icon } from './Icon';
import { Sunburst } from './Screen';
import { Sticker } from './Sticker';
import { Txt } from './Txt';

export interface PlayerCardProps {
  player: PlayerDef;
  /** 0 when the player is not owned yet */
  level?: number;
  width?: number;
  /** show a silhouette and hide the numbers */
  locked?: boolean;
  /** "NEW!" corner tag */
  fresh?: boolean;
  selected?: boolean;
  /** a slow glint across the card, for big reveals */
  shine?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

type Scale = 'tiny' | 'small' | 'medium' | 'large';

const SCALE: Record<Scale, { ovr: 'body' | 'large' | 'title' | 'big'; name: 'tiny' | 'small' | 'body' | 'large'; badge: number; pip: number; pad: number }> = {
  tiny: { ovr: 'body', name: 'tiny', badge: 0, pip: sizes.pipTiny, pad: space.hair },
  small: { ovr: 'large', name: 'small', badge: sizes.badgeTiny, pip: sizes.pipSmall, pad: space.xs },
  medium: { ovr: 'title', name: 'body', badge: sizes.badgeSmall, pip: sizes.pip, pad: space.xs },
  large: { ovr: 'big', name: 'large', badge: sizes.avatarSmall, pip: sizes.pipLarge, pad: space.sm },
};

/** average glyph width of the display font, as a share of the font size */
const GLYPH = 0.53;
const MIN_FIT = 0.74;

/**
 * Fit a name on one line: shrink a little, and if that is not enough use
 * "Wren K." for "Wren Kowalski". Done by hand so every platform agrees.
 */
function fitName(name: string, px: number, room: number): { text: string; px: number } {
  const need = (t: string) => t.length * px * GLYPH;
  let text = name;
  if (need(text) * MIN_FIT > room) {
    const parts = name.split(' ');
    if (parts.length > 1) text = `${parts[0]} ${parts[parts.length - 1][0]}.`;
  }
  const k = Math.min(1, room / need(text));
  return { text, px: Math.max(px * MIN_FIT, Math.floor(px * k)) };
}

function scaleFor(width: number): Scale {
  if (width < 92) return 'tiny';
  if (width < 140) return 'small';
  if (width < 200) return 'medium';
  return 'large';
}

function Glint({ width, height }: { width: number; height: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withRepeat(withSequence(withDelay(1600, withTiming(1, { duration: duration.reveal, easing: Easing.inOut(Easing.quad) })), withTiming(0, { duration: 0 })), -1));
  }, [t]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -width + t.value * width * 2.4 }, { rotate: '20deg' }] }));
  return <Animated.View pointerEvents="none" style={[styles.glint, { width: width * 0.3, height: height * 1.6, top: -height * 0.3 }, style]} />;
}

export const PlayerCard = memo(function PlayerCard({ player, level = 1, width = sizes.card, locked, fresh, selected, shine, onPress, style }: PlayerCardProps) {
  const height = Math.round(width * sizes.cardRatio);
  const scale = scaleFor(width);
  const sc = SCALE[scale];
  const rc = RARITY_COLOR[player.rarity];
  const art = cardArt(player.id);
  const team = teamById(player.team);
  const shown = Math.max(1, level);
  const plateH = Math.round(height * (scale === 'tiny' ? 0.25 : 0.23));
  const artH = height - plateH;
  const name = fitName(player.name, text[sc.name], width - (sc.pad + space.hair) * 2 - stroke.regular * 2);

  const body = (
    <Sticker fill={locked ? 'paperDim' : rc.fill} round={scale === 'large' ? 'lg' : 'md'} raise={scale === 'tiny' || scale === 'small' ? 'low' : 'mid'} edge={selected ? 'coralDeep' : 'ink'} style={onPress ? undefined : style} face={{ width, height }}>
      {!locked && <LinearGradient colors={[color[rc.fill], color[rc.deep]]} style={StyleSheet.absoluteFill} />}
      {!locked && scale !== 'tiny' && <Sunburst strength={opacity.pattern * 1.6} />}
      {art !== undefined && (
        <Image
          source={art}
          contentFit="contain"
          transition={0}
          tintColor={locked ? color.inkFaint : undefined}
          style={[styles.art, { height: artH * 1.02, top: artH * 0.04, opacity: locked ? opacity.dim : 1 }]}
        />
      )}
      {!locked && shine && <Glint width={width} height={height} />}
      <View style={[styles.corner, { top: sc.pad, left: sc.pad + space.hair }]}>
        {locked ? (
          <Icon name="lock" size={Math.round(width * 0.17)} color="paper" ink="inkFaint" />
        ) : (
          <Txt font="display" size={sc.ovr} color="white" shadow>
            {String(playerOverall(player, shown))}
          </Txt>
        )}
      </View>
      {sc.badge > 0 && !locked && <TeamBadge team={team} diameter={sc.badge} style={[styles.corner, { top: sc.pad + space.hair, right: sc.pad + space.hair }]} />}
      <View style={[styles.plate, { height: plateH, paddingHorizontal: sc.pad + space.hair }]}>
        <Txt font="display" size={sc.name} color={locked ? 'inkFaint' : 'ink'} lines={1} center style={{ fontSize: name.px, lineHeight: Math.round(name.px * 1.12) }}>
          {name.text}
        </Txt>
        {locked ? (
          <View style={[styles.rarityBar, { backgroundColor: color[rc.fill], height: sc.pip }]} />
        ) : (
          <View style={styles.pips}>
            {Array.from({ length: MAX_LEVEL }, (_, i) => (
              <View key={i} style={[styles.pip, { width: sc.pip, height: sc.pip, borderRadius: sc.pip / 2, backgroundColor: i < shown ? color[rc.deep] : color.paperDim }]} />
            ))}
          </View>
        )}
      </View>
      {fresh && <Tag label="NEW!" fill="coral" textColor="white" style={[styles.corner, styles.fresh, { top: sc.pad, right: sc.pad }]} />}
    </Sticker>
  );

  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${player.name}${locked ? ', not collected yet' : ''}`}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [pressed && styles.pressed, style]}>
      {body}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  art: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
  corner: {
    position: 'absolute',
  },
  fresh: {
    transform: [{ rotate: '8deg' }],
  },
  plate: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: color.paper,
    borderTopWidth: stroke.thin,
    borderColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.hair,
  },
  pips: {
    flexDirection: 'row',
    gap: space.hair,
  },
  pip: {
    borderWidth: stroke.hair,
    borderColor: color.ink,
  },
  rarityBar: {
    width: '46%',
    borderRadius: space.xs,
    opacity: opacity.soft,
  },
  glint: {
    position: 'absolute',
    left: 0,
    backgroundColor: color.glassStrong,
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
});
