/** Small shared pieces: badges, pills, bars and stars. */

import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { headArt, playerById, teamById } from '@/data/roster';
import type { Rarity, TeamDef } from '@/data/types';
import { RARITY_LABEL } from '@/data/types';
import { luminance } from '@/game/kit/look';
import { color, radius, size as sizes, space, stroke, text, type ColorName } from '@/theme/tokens';
import { MIN_FIT_LABEL, fitSize } from './fitName';
import { Icon, type IconName } from './Icon';
import { Sticker } from './Sticker';
import { Txt, resolveColor } from './Txt';

/** Ink on light colours, white on dark ones. */
export function readableOn(bg: string): ColorName {
  return luminance(resolveColor(bg)) > 0.6 ? 'ink' : 'white';
}

export const RARITY_COLOR: Record<Rarity, { fill: ColorName; deep: ColorName }> = {
  common: { fill: 'common', deep: 'commonDeep' },
  rare: { fill: 'rare', deep: 'rareDeep' },
  epic: { fill: 'epic', deep: 'epicDeep' },
  legend: { fill: 'legend', deep: 'legendDeep' },
};

/** A team's roundel: its colours and three letters (colours only when it is too small to read). */
export function TeamBadge({ team, diameter = sizes.badge, style }: { team: TeamDef; diameter?: number; style?: StyleProp<ViewStyle> }) {
  const small = diameter < sizes.avatarSmall;
  const edge = small ? stroke.thin : stroke.regular;
  const inner = diameter - edge * 2 - Math.round(diameter * 0.16);
  const size = diameter >= sizes.badgeLarge ? 'large' : diameter >= sizes.badge ? 'small' : 'tiny';
  // the letters have to fit across the inner circle whatever they are ("WAV" is nearly twice as wide as "ILL"):
  // a phone breaks a word that is too wide onto a second line
  const px = fitSize(team.short, text[size], inner - stroke.thin * 2, MIN_FIT_LABEL);
  return (
    <View style={[styles.badge, { width: diameter, height: diameter, borderRadius: diameter / 2, borderWidth: edge, backgroundColor: team.color2 }, style]}>
      <View style={[styles.badgeInner, { width: inner, height: inner, borderRadius: inner / 2, backgroundColor: team.color }, small && styles.badgeInnerSmall]}>
        {!small && (
          <Txt font="display" size={size} lines={1} color={readableOn(team.color)} style={{ fontSize: px, lineHeight: Math.round(px * 1.12) }}>
            {team.short}
          </Txt>
        )}
      </View>
    </View>
  );
}

/** A player's face in a circle, on their team's colour unless another is given. */
export function Avatar({ id, diameter = sizes.avatar, fill, style }: { id: string; diameter?: number; fill?: ColorName | (string & {}); style?: StyleProp<ViewStyle> }) {
  const src = headArt(id);
  const player = playerById(id);
  const bg = resolveColor(fill ?? (player ? teamById(player.team).color : 'paperDim'));
  return (
    <View style={[styles.avatar, { width: diameter, height: diameter, borderRadius: diameter / 2, backgroundColor: bg }, style]}>
      {src !== undefined && <Image source={src} style={styles.fill} contentFit="cover" transition={0} />}
    </View>
  );
}

/** Counts smoothly toward a number whenever it changes. */
export function useCountUp(value: number, ms = 600): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const t0 = Date.now();
    let raf = 0;
    const step = () => {
      const u = Math.min(1, (Date.now() - t0) / ms);
      const eased = 1 - (1 - u) * (1 - u);
      const v = Math.round(start + (value - start) * eased);
      from.current = v;
      setShown(v);
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return shown;
}

export function CoinPill({ coins, style }: { coins: number; style?: StyleProp<ViewStyle> }) {
  const shown = useCountUp(coins);
  return (
    <Sticker fill="paper" round="pill" raise="low" style={style} face={styles.pill}>
      <Icon name="coin" color="sun" size={sizes.icon} />
      <Txt font="display" size="large">
        {shown.toLocaleString('en-US')}
      </Txt>
    </Sticker>
  );
}

/** A small coloured label ("RARE", "NEW!", "x3"). */
export function Tag({ label, fill = 'ink', textColor, icon, style }: { label: string; fill?: ColorName | (string & {}); textColor?: ColorName; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.tag, { backgroundColor: resolveColor(fill) }, style]}>
      {icon && <Icon name={icon} size={sizes.iconTiny} color={textColor ?? readableOn(resolveColor(fill))} />}
      <Txt font="display" size="tiny" color={textColor ?? readableOn(resolveColor(fill))} upper>
        {label}
      </Txt>
    </View>
  );
}

export function RarityTag({ rarity, style }: { rarity: Rarity; style?: StyleProp<ViewStyle> }) {
  return <Tag label={RARITY_LABEL[rarity]} fill={RARITY_COLOR[rarity].deep} textColor="white" style={style} />;
}

export function ProgressBar({
  value,
  fill = 'mint',
  track = 'paperDim',
  height = sizes.bar,
  style,
}: {
  /** 0..1 */
  value: number;
  fill?: ColorName | (string & {});
  track?: ColorName | (string & {});
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const v = Math.max(0, Math.min(1, value));
  return (
    <View style={[styles.track, { height, borderRadius: height / 2, backgroundColor: resolveColor(track) }, style]}>
      <View style={{ width: `${v * 100}%`, height: '100%', backgroundColor: resolveColor(fill), borderRadius: height / 2 }} />
    </View>
  );
}

export function Stars({ have, of = 3, size = sizes.iconSmall, style }: { have: number; of?: number; size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.stars, style]}>
      {Array.from({ length: of }, (_, i) => (
        <Icon key={i} name="star" size={size} color={i < have ? 'sun' : 'paperDim'} ink={i < have ? 'ink' : 'inkFaint'} />
      ))}
    </View>
  );
}

/** A red dot with a number, for "something is waiting for you here". */
export function Dot({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  if (count <= 0) return null;
  return (
    <View style={[styles.dot, style]}>
      <Txt font="display" size="tiny" color="white">
        {count > 9 ? '9+' : String(count)}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    overflow: 'hidden',
    borderWidth: stroke.thin,
    borderColor: color.ink,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: stroke.regular,
    borderColor: color.ink,
  },
  badgeInner: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: stroke.thin,
    borderColor: color.ink,
  },
  badgeInnerSmall: {
    borderWidth: 0,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: space.sm,
    paddingVertical: space.hair,
    borderRadius: radius.sm,
    borderWidth: stroke.thin,
    borderColor: color.ink,
  },
  track: {
    overflow: 'hidden',
    borderWidth: stroke.thin,
    borderColor: color.ink,
  },
  stars: {
    flexDirection: 'row',
    gap: space.hair,
  },
  dot: {
    position: 'absolute',
    top: -space.sm,
    right: -space.sm,
    minWidth: space.xl,
    height: space.xl,
    borderRadius: space.md,
    paddingHorizontal: space.xs,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.coral,
    borderWidth: stroke.thin,
    borderColor: color.ink,
  },
});
