/** The squad's own badge: a lit shield in its colours with its three letters, and the button that opens the name page. */

import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { tapFeedback } from '@/fx/feedback';
import { nameText, schemeById, shortOf, type TeamName } from '@/meta/teamName';
import { squadUniform } from '@/state/logic';
import { useSave } from '@/state/save';
import { arcade, fade, halo, inner, night } from '@/theme/arcade';
import { px, size as sizes, space } from '@/theme/tokens';
import { LineIcon } from './LineIcon';
import { MIN_FIT_LABEL } from './measure';
import { useSvgId } from './Room';
import { teamTube } from './TeamPick';
import { Glow, Print } from './Type';

export interface BadgeColors {
  color: string;
  color2: string;
}

/** What the squad is called and the colours it goes by: the scheme it picked, or else the colours it wears. */
export function squadLook(name: TeamName | null, scheme: string | null, worn: BadgeColors): { name: string; short: string; colors: BadgeColors } {
  const picked = schemeById(scheme);
  return { name: nameText(name), short: shortOf(name), colors: picked ? { color: picked.color, color2: picked.color2 } : { color: worn.color, color2: worn.color2 } };
}

/** The squad's name, letters and colours, read from the save. */
export function useSquadLook() {
  const teamName = useSave((s) => s.teamName);
  const teamColors = useSave((s) => s.teamColors);
  const squad = useSave((s) => s.squad);
  const uniform = useSave((s) => s.uniform);
  const homeTeam = useSave((s) => s.homeTeam);
  const { wear } = squadUniform({ squad, uniform, homeTeam });
  return squadLook(teamName, teamColors, wear);
}

/** the shield on a 24 x 26 grid, and the band across its top */
const SHIELD = 'M12 1.5l9.5 3.4v7.3c0 5.8-4 10.4-9.5 12.3C6.5 22.6 2.5 18 2.5 12.2V4.9z';
const BAND = 'M12 1.5l9.5 3.4v3.3H2.5V4.9z';

/** A shield lit round its edge in the first colour, a band of the second across its top, and the letters in the middle. */
export function TeamBadge({ short, colors, size = px(44), style }: { short: string; colors: BadgeColors; size?: number; style?: StyleProp<ViewStyle> }) {
  const tb = teamTube(colors);
  const h = Math.round(size * (26 / 24));
  const id = useSvgId('badge');
  return (
    <View style={[{ width: size, height: h }, styles.badge, style]} accessible={false}>
      <Svg width={size} height={h} viewBox="0 0 24 26" style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={fade(colors.color, 0.38)} />
            <Stop offset="1" stopColor={night.pit} />
          </LinearGradient>
        </Defs>
        <Path d={SHIELD} fill={`url(#${id})`} />
        <Path d={BAND} fill={colors.color2} opacity={0.9} />
        <Path d={SHIELD} fill="none" stroke={tb.glass} strokeWidth={1.6} strokeLinejoin="round" />
      </Svg>
      <View style={[styles.letters, { paddingTop: h * 0.24 }]}>
        <Print face="display" size={Math.round(size * 0.34)} color={tb.tint} glow={tb.glass} track="none" room={size * 0.78} least={MIN_FIT_LABEL}>
          {short}
        </Print>
      </View>
    </View>
  );
}

/**
 * The squad's name with its badge, as a button that opens the name page. `room` is the widest it may be; `small` is
 * the size for the top bar.
 */
export function TeamNameButton({ room, small, style }: { room: number; small?: boolean; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const look = useSquadLook();
  const tb = teamTube(look.colors);
  const badge = small ? px(26) : px(36);
  const words = room - badge - px(16) - space.sm * 2 - px(10) * 2 - arcade.outline * 2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Team name: ${look.name}. Change it`}
      onPress={() => {
        tapFeedback();
        router.push('/team');
      }}
      style={({ pressed }) => [styles.button, small && styles.buttonSmall, { maxWidth: room, borderColor: tb.glass, boxShadow: [halo(tb.glass, 10, pressed ? 0.35 : 0.6), inner(tb.glass, 12, 0.22)] }, pressed && styles.pressed, style]}>
      <TeamBadge short={look.short} colors={look.colors} size={badge} />
      <View style={styles.words}>
        {!small && (
          <Print face="bold" size="micro" color="textFaint" track="wider">
            TEAM NAME
          </Print>
        )}
        <Glow face="display" size={small ? 'body' : 'large'} tube={tb} track="close" room={Math.max(px(40), words)} least={MIN_FIT_LABEL}>
          {look.name.toUpperCase()}
        </Glow>
      </View>
      <LineIcon name="pencil" size={px(16)} tube={tb} weight={2.4} />
    </Pressable>
  );
}

/** The squad's name lit in its colours, for a page that only shows it. */
export function TeamNameSign({ size = 'large', room }: { size?: 'body' | 'large' | 'title'; room?: number }) {
  const look = useSquadLook();
  return (
    <Glow face="display" size={size} tube={teamTube(look.colors)} track="close" room={room} least={MIN_FIT_LABEL}>
      {look.name.toUpperCase()}
    </Glow>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  letters: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: sizes.tap,
    paddingVertical: px(4),
    paddingHorizontal: px(10),
    backgroundColor: night.pit,
    borderWidth: arcade.outline,
    borderRadius: arcade.rButton,
  },
  buttonSmall: {
    minHeight: arcade.chip + px(4),
    paddingVertical: px(2),
  },
  words: {
    flexShrink: 1,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
});
