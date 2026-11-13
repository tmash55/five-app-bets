/**
 * The arcade's player card: a foil rim in the rarity's colours, the figure on rays of light,
 * the overall rating, the team, the name and the rarity. Also its face-down back, and the
 * small face used in the collection grid.
 */

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

import { MAX_LEVEL, cardArt, headArt, playerOverall, teamById } from '@/data/roster';
import { RARITY_LABEL, type PlayerDef, type Rarity } from '@/data/types';
import { tapFeedback } from '@/fx/feedback';
import { RIM_STOPS, arcade, blend, fade, halo, night, rarityPaint, ring, track, tube as tubes, tubeOf, type Tube, type TubeName } from '@/theme/arcade';
import { duration, px, size as sizes } from '@/theme/tokens';
import { LineIcon } from './LineIcon';
import { fitPerson } from './measure';
import { Lattice, Rays, useSvgId } from './Room';
import { Tag, teamLine } from './Surface';
import { Print } from './Type';

/** the card pictures' height for a width of 1 */
const ART_RATIO = 560 / 440;
/** How far the picture is pushed up past the card's top edge, as a share of the card's inner height. Any more and the tallest hair in the league is cut off flat. */
const ART_LIFT = 0.066;
/** below this width a card is a thumbnail: no rays, no team, no rarity word */
const SMALL = px(92);
/** from this width a card is a hero: it throws light, and its background is lit from behind the figure */
const HERO = px(140);

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Gems to count: one for a Common up to four for a Legend, so the rarity can be read without reading. */
export function Gems({ rarity, size = px(9), lit = true, style }: { rarity: Rarity; size?: number; lit?: boolean; style?: StyleProp<ViewStyle> }) {
  const paintOf = rarityPaint[rarity];
  const tb = tubes[paintOf.tube];
  return (
    <View aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[styles.gems, { gap: Math.max(1, size * 0.12) }, style]}>
      {Array.from({ length: paintOf.gems }, (_, i) => (
        <LineIcon key={i} name="gem" size={size} color={lit ? tb.soft : night.lineLit} />
      ))}
    </View>
  );
}

/** Light behind a figure: bright where the figure stands, falling away to the rarity's dark. */
const HaloFill = memo(function HaloFill({ colors, at = [0.5, 0.38] }: { colors: readonly [string, string, string]; at?: readonly [number, number] }) {
  const id = useSvgId('halo');
  return (
    <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id={id} cx={0} cy={0} r={1} gradientUnits="userSpaceOnUse" gradientTransform={`translate(${at[0] * 100} ${at[1] * 100}) scale(${Math.max(at[0], 1 - at[0]) * 124} ${Math.max(at[1], 1 - at[1]) * 124})`}>
          <Stop offset={0} stopColor={colors[0]} />
          <Stop offset={0.44} stopColor={colors[1]} />
          <Stop offset={1} stopColor={colors[2]} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={100} height={100} fill={`url(#${id})`} />
    </Svg>
  );
});

/** A slow glint that crosses the card now and then. */
function Glint({ width, height }: { width: number; height: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withRepeat(withSequence(withDelay(1600, withTiming(1, { duration: duration.reveal, easing: Easing.inOut(Easing.quad) })), withTiming(0, { duration: 0 })), -1));
  }, [t]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: -width + t.value * width * 2.4 }, { rotate: '20deg' }] }));
  return <Animated.View pointerEvents="none" style={[styles.glint, { width: width * 0.3, height: height * 1.6, top: -height * 0.3 }, style]} />;
}

export interface ArcadeCardProps {
  player: PlayerDef;
  /** 0 when the player is not owned yet */
  level?: number;
  /** in screen points */
  width?: number;
  /** show a silhouette and hide the numbers */
  locked?: boolean;
  /** "NEW!" on its corner */
  fresh?: boolean;
  selected?: boolean;
  /** a slow glint across the card, for big reveals */
  shine?: boolean;
  /** no light round it: for cards in a long list */
  flat?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const ArcadeCard = memo(function ArcadeCard({ player, level = 1, width = sizes.card, locked, fresh, selected, shine, flat, onPress, style }: ArcadeCardProps) {
  const height = Math.round(width * sizes.cardRatio);
  const rp = rarityPaint[player.rarity];
  const tb = tubes[rp.tube];
  const team = teamById(player.team);
  const art = cardArt(player.id);
  const shown = Math.max(1, level);
  const small = width < SMALL;
  const hero = width >= HERO;

  const rim = Math.max(px(2), Math.round(width * 0.022));
  const round = Math.round(width * 0.087);
  const innerW = width - rim * 2;
  const innerH = height - rim * 2;
  const edge = Math.round(width * 0.043);

  const nameSize = clamp(width * 0.0815, px(9), px(20));
  const wordSize = clamp(width * 0.057, px(8.5), px(13));
  const lampH = Math.max(px(2.5), Math.round(width * 0.018));
  const padY = Math.max(px(3), Math.round(width * 0.022));
  // measured with the letter spacing it is drawn with, and clear of the card's sides, so a long name shrinks or shortens instead of running to the edge
  const nameGap = small ? 0 : track.close;
  const name = fitPerson(player.name.toUpperCase(), 'display', nameSize, innerW - edge * 2.4, nameGap, player.short?.toUpperCase());

  const chip = Math.max(px(22), Math.round(width * 0.217));
  const artW = innerW * 1.159;

  const light = locked || flat ? undefined : selected ? [ring(night.white, 2), halo(tb.glass, 16, 1, 3)] : hero ? [halo(tb.soft, 18, 0.95), halo(tb.glass, 54, 0.6)] : [halo(tb.glass, 8, 0.7)];

  const body = (
    <View style={[{ width, height, borderRadius: round, boxShadow: light }, onPress ? undefined : style]}>
      {/* the rim: foil that runs through the rarity's colours from corner to corner */}
      <View style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: round, backgroundColor: locked ? night.line : rp.rim[1] }]}>
        {!locked && <LinearGradient colors={[...rp.rim]} locations={[...RIM_STOPS]} start={CORNER_A} end={CORNER_B} style={StyleSheet.absoluteFill} />}
      </View>
      <View style={[styles.clip, { position: 'absolute', left: rim, top: rim, width: innerW, height: innerH, borderRadius: Math.max(1, round - rim), backgroundColor: locked ? night.plate : rp.halo[1] }]}>
        {!locked && (hero ? <HaloFill colors={rp.halo} /> : <LinearGradient colors={[blend(rp.halo[0], rp.halo[1], 0.3), rp.halo[1], rp.halo[2]]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />)}
        {!locked && !small && <Rays size={innerW * 1.75} alpha={0.2} style={{ position: 'absolute', left: innerW / 2 - innerW * 0.875, top: innerH * 0.46 - innerW * 0.875 }} />}
        {art !== undefined && (
          <Image
            source={art}
            contentFit="contain"
            transition={0}
            tintColor={locked ? night.lineLit : undefined}
            style={{ position: 'absolute', left: (innerW - artW) / 2, top: -innerH * ART_LIFT, width: artW, height: artW * ART_RATIO, opacity: locked ? 0.3 : 1 }}
          />
        )}
        {!locked && hero && <LinearGradient pointerEvents="none" colors={SHEEN} locations={SHEEN_AT} start={SHEEN_A} end={SHEEN_B} style={StyleSheet.absoluteFill} />}
        {!locked && shine && <Glint width={innerW} height={innerH} />}

        {locked ? (
          <View style={[styles.corner, { left: edge, top: edge }]}>
            <LineIcon name="lock" size={Math.round(width * 0.17)} color={night.lineLit} weight={2.2} />
          </View>
        ) : (
          <View style={[styles.corner, styles.ovr, { left: edge, top: edge, width: chip, height: chip, borderRadius: Math.round(chip * 0.225), borderColor: rp.rim[0], borderWidth: Math.max(px(1.5), Math.round(width * 0.011)) }]}>
            <Print face="display" size={chip * 0.45}>
              {String(playerOverall(player, shown))}
            </Print>
          </View>
        )}
        {!locked && !small && (
          <View style={[styles.corner, styles.team, { right: edge, top: edge, height: Math.round(width * 0.12), paddingHorizontal: Math.round(width * 0.038), borderRadius: Math.round(width * 0.033) }]}>
            <Print face="bold" size={clamp(width * 0.0625, px(8.5), px(14))} color={blend(teamLine(team), night.white, 0.35)} track="normal">
              {team.short}
            </Print>
          </View>
        )}

        <View style={[styles.band, { paddingTop: padY, paddingBottom: padY, gap: Math.max(1, Math.round(width * 0.008)) }]}>
          <Print face="display" size={name.size} color={locked ? 'textFaint' : 'text'} track={small ? 'none' : 'close'} lines={1} center style={{ lineHeight: Math.round(name.size * 1.08) }}>
            {name.text}
          </Print>
          {!small && (
            <View style={styles.word}>
              <Gems rarity={player.rarity} size={wordSize * 0.82} lit={!locked} />
              <Print face="bold" size={wordSize} color={locked ? 'textFaint' : tb.tint} track="widest" upper style={{ lineHeight: Math.round(wordSize * 1.15) }}>
                {RARITY_LABEL[player.rarity]}
              </Print>
            </View>
          )}
          {!locked && (
            <View aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[styles.lamps, { gap: Math.max(1, Math.round(width * 0.014)) }]}>
              {Array.from({ length: MAX_LEVEL }, (_, i) => (
                <View key={i} style={{ width: Math.round(width * 0.075), height: lampH, borderRadius: lampH / 2, backgroundColor: i < shown ? tb.glass : night.line }} />
              ))}
            </View>
          )}
        </View>
      </View>
      {fresh && <Tag label="NEW!" tube="pink" small={!hero} style={[styles.fresh, { top: -px(11), right: -px(9) }]} />}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${player.name}${locked ? ', not collected yet' : `, ${RARITY_LABEL[player.rarity]}`}`}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [pressed && styles.pressed, style]}>
      {body}
    </Pressable>
  );
});

export interface CardBackProps {
  width?: number;
  /** the tube it is trimmed in: the room's cyan, or a rarity's colour to hint at what is under it */
  tube?: TubeName | Tube;
  /** no light round it */
  flat?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A card face-down: the arcade's own back, the same for every player. */
export const CardBack = memo(function CardBack({ width = sizes.card, tube: t = 'cyan', flat, style }: CardBackProps) {
  const tb = tubeOf(t);
  const height = Math.round(width * sizes.cardRatio);
  const rim = Math.max(px(2), Math.round(width * 0.022));
  const round = Math.round(width * 0.087);
  const innerW = width - rim * 2;
  const innerH = height - rim * 2;
  const badge = Math.round(width * 0.44);
  return (
    <View style={[{ width, height, borderRadius: round, boxShadow: flat ? undefined : [halo(tb.glass, width >= HERO ? 16 : 8, 0.7)] }, style]}>
      <View style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: round }]}>
        <LinearGradient colors={[tb.tint, tb.glass, tb.soft, tb.glass]} locations={[0, 0.3, 0.6, 1]} start={CORNER_A} end={CORNER_B} style={StyleSheet.absoluteFill} />
      </View>
      <View style={[styles.clip, styles.back, { left: rim, top: rim, width: innerW, height: innerH, borderRadius: Math.max(1, round - rim) }]}>
        <Lattice width={innerW} height={innerH} color={fade(tb.glass, 0.16)} />
        <View style={[styles.backBadge, { width: badge, height: badge, borderRadius: badge / 2, borderColor: tb.glass, boxShadow: [halo(tb.glass, 10, 0.7)] }]}>
          <LineIcon name="ball" size={badge * 0.6} tube={tb} weight={1.8} />
        </View>
      </View>
    </View>
  );
});

export interface HeadCellProps {
  player: PlayerDef;
  /** 0 when the player is not owned yet */
  level?: number;
  selected?: boolean;
  /** a lit dot: this one is new and has not been looked at yet */
  fresh?: boolean;
  width?: number;
  height?: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** One face in the collection grid: lit in its rarity's colour when owned, a dark outline when not. */
export const HeadCell = memo(function HeadCell({ player, level = 0, selected, fresh, width = px(66), height = px(44), onPress, style }: HeadCellProps) {
  const rp = rarityPaint[player.rarity];
  const tb = tubes[rp.tube];
  const owned = level > 0;
  const head = headArt(player.id);
  // the head pictures are square with the face in the middle: show a little more than the cell's width, from just above the hair
  const side = Math.max(width * 1.12, height * 1.5);
  // a player still to find is a shadow, and a shadow only reads as a person when its whole outline shows: the head
  // and shoulders smaller, standing on the cell's bottom edge, with the picture's top corners rounded off so a head of
  // hair cut flat by the picture's own edge still shows as a round top
  const shadow = Math.min(width, height) * 0.98;
  const body = (
    <View
      style={[
        styles.cell,
        { width, height },
        owned ? { borderColor: selected ? night.white : tb.glass, backgroundColor: rp.cell, boxShadow: selected ? [ring(tb.glass, 2), halo(tb.glass, 16, 1, 3)] : [halo(tb.glass, 7, 0.9)] } : selected ? { borderColor: night.white } : undefined,
        selected && styles.cellSelected,
        onPress ? undefined : style,
      ]}>
      {owned && <LinearGradient colors={[fade(night.stageOut, 0), fade(night.stageOut, 0.25), night.stageOut]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />}
      {head !== undefined && (
        <Image
          source={head}
          contentFit="cover"
          transition={0}
          tintColor={owned ? undefined : night.white}
          style={
            owned
              ? { position: 'absolute', left: (width - side) / 2, top: -(side - height) * 0.3, width: side, height: side }
              : { position: 'absolute', left: (width - shadow) / 2, top: height - shadow * 0.94, width: shadow, height: shadow, opacity: 0.1, borderTopLeftRadius: shadow * 0.42, borderTopRightRadius: shadow * 0.42 }
          }
        />
      )}
      {owned && (
        <View style={styles.cellTag}>
          <Print face="bold" size="micro" style={styles.cellTagText}>
            {String(playerOverall(player, level))}
          </Print>
        </View>
      )}
      {fresh && owned && <View style={[styles.cellDot, { backgroundColor: tubes.pink.glass, boxShadow: [halo(tubes.pink.glass, 6, 1)] }]} />}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      accessibilityLabel={owned ? `${player.name}, ${RARITY_LABEL[player.rarity]}, ${playerOverall(player, level)} overall` : `${player.name}, ${RARITY_LABEL[player.rarity]}, not found yet`}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [pressed && styles.pressed, style]}>
      {body}
    </Pressable>
  );
});

const CORNER_A = { x: 0, y: 0 } as const;
const CORNER_B = { x: 1, y: 1 } as const;
const SHEEN = [fade(night.white, 0), fade(night.white, 0), fade(night.white, 0.34), fade(night.white, 0), fade(night.white, 0)] as const;
const SHEEN_AT = [0, 0.3, 0.44, 0.56, 1] as const;
const SHEEN_A = { x: 0, y: 0.32 } as const;
const SHEEN_B = { x: 1, y: 0.68 } as const;

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
  },
  corner: {
    position: 'absolute',
  },
  ovr: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.onTube,
  },
  team: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.onTube,
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.shade,
  },
  word: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(4),
  },
  gems: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lamps: {
    flexDirection: 'row',
  },
  fresh: {
    position: 'absolute',
    transform: [{ rotate: '6deg' }],
  },
  glint: {
    position: 'absolute',
    left: 0,
    backgroundColor: fade(night.white, 0.34),
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  back: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.plate,
  },
  backBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.pit,
    borderWidth: arcade.outline,
  },
  cell: {
    overflow: 'hidden',
    borderRadius: arcade.rCell,
    borderWidth: arcade.hairline,
    borderColor: night.line,
    backgroundColor: night.plate,
  },
  cellSelected: {
    borderWidth: arcade.outline,
  },
  cellTag: {
    position: 'absolute',
    right: px(2),
    bottom: px(2),
    height: px(14),
    paddingHorizontal: px(4),
    borderRadius: px(4),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: fade(night.bar, 0.9),
  },
  cellTagText: {
    lineHeight: px(13),
  },
  cellDot: {
    position: 'absolute',
    left: px(3),
    top: px(3),
    width: px(7),
    height: px(7),
    borderRadius: px(3.5),
  },
});
