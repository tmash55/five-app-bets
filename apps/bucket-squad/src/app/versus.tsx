/** The matchup before tip-off: your players, theirs, the court, and one big button. */

import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Polygon } from 'react-native-svg';

import { playSfx } from '@/audio/sound';
import { mustPlayer, teamById } from '@/data/roster';
import { COURTS } from '@/game/render/court';
import { TIERS, tierIndex } from '@/meta/ladder';
import { buildMatch, chemistry, type MatchSetup, type Side } from '@/meta/match';
import { DIFFICULTY_NAMES, sideOverall } from '@/meta/setups';
import { tourById } from '@/meta/tour';
import { useSave } from '@/state/save';
import { useSession } from '@/state/session';
import { color, size as sizes, space } from '@/theme/tokens';
import { Tag, TeamBadge } from '@/ui/Bits';
import { PlayerCard } from '@/ui/PlayerCard';
import { Screen, Sunburst } from '@/ui/Screen';
import { StickerButton } from '@/ui/Sticker';
import { StickerText, Txt } from '@/ui/Txt';

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function modeLine(setup: MatchSetup, ladderPoints: number, homeTeam: string | null): string {
  if (setup.mode === 'tour' && setup.tour) {
    const stage = tourById(setup.tour.tourId, homeTeam).stages[setup.tour.stage];
    return `TOUR  ·  ${stage.games[setup.tour.game].title.toUpperCase()}`;
  }
  if (setup.mode === 'ladder') return `LADDER  ·  ${TIERS[tierIndex(ladderPoints)].name.toUpperCase()}`;
  const level = setup.difficulty < 0.4 ? 0 : setup.difficulty < 0.7 ? 1 : 2;
  return `QUICK GAME  ·  ${DIFFICULTY_NAMES[level].toUpperCase()}`;
}

function SideColumn({ side, perTeam, cardW, mine, from }: { side: Side; perTeam: number; cardW: number; mine: boolean; from: -1 | 1 }) {
  const players = side.players.slice(0, perTeam);
  const team = teamById(side.kitTeam);
  const chem = mine ? chemistry(players.map((p) => p.id)) : 0;
  const slide = useSharedValue(0);
  useEffect(() => {
    slide.set(withDelay(80, withSpring(1, { damping: 14, stiffness: 150, mass: 0.9 })));
  }, [slide]);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, slide.value * 1.4), transform: [{ translateX: (1 - slide.value) * 160 * from }] }));
  return (
    <Animated.View style={[styles.side, style]}>
      <View style={styles.sideHead}>
        {!mine && <TeamBadge team={team} diameter={sizes.badge} />}
        <StickerText size="title" color={mine ? 'sun' : 'white'}>
          {side.name.toUpperCase()}
        </StickerText>
      </View>
      <View style={styles.cards}>
        {players.map((p) => (
          <PlayerCard key={p.id} player={mustPlayer(p.id)} level={p.level} width={cardW} />
        ))}
      </View>
      <View style={styles.tags}>
        <Tag label={`${sideOverall(side, perTeam)} OVR`} fill="paper" />
        {chem > 0 && <Tag label={`Teammates +${chem}`} fill="mint" icon="bolt" />}
      </View>
    </Animated.View>
  );
}

function Matchup({ setup }: { setup: MatchSetup }) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const ladderPoints = useSave((s) => s.ladder.points);
  const homeTeam = useSave((s) => s.homeTeam);
  const colors = useMemo(() => buildMatch(setup).colors, [setup]);
  const court = COURTS[setup.court];
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.set(withDelay(260, withTiming(1, { duration: 320, easing: Easing.out(Easing.back(2.2)) })));
    playSfx('swipe');
  }, [pop]);
  const vs = useAnimatedStyle(() => ({ opacity: Math.min(1, pop.value * 2), transform: [{ scale: 0.3 + pop.value * 0.7 }, { rotate: '-6deg' }] }));

  const room = Math.max(space.huge, (width - space.lg * 2 - sizes.avatarLarge * 2) / 2);
  const cardW = Math.max(sizes.cardSmall - space.md, Math.min(sizes.card + space.md, Math.floor((room - space.sm * (setup.perTeam - 1)) / setup.perTeam), Math.floor((height - 190) / sizes.cardRatio)));

  const tipOff = () => {
    playSfx('whistle');
    router.replace('/match');
  };

  return (
    <View style={styles.root}>
      <LinearGradient colors={[colors[0], color.ink]} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1.5 }} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
          <Polygon points="56,0 100,0 100,100 44,100" fill={colors[1]} />
          <Polygon points="56,0 100,0 100,100 44,100" fill={color.ink} opacity={0.18} />
          <Polygon points="54.5,0 57.5,0 45.5,100 42.5,100" fill={color.ink} />
        </Svg>
      </View>
      <Sunburst strength={0.08} />
      <Screen title={modeLine(setup, ladderPoints, homeTeam)} coins={false} bare>
        <View style={styles.row}>
          <SideColumn side={setup.home} perTeam={setup.perTeam} cardW={cardW} mine from={-1} />
          <Animated.View style={[styles.middle, vs]}>
            <StickerText size="huge" color="white">
              VS
            </StickerText>
          </Animated.View>
          <SideColumn side={setup.away} perTeam={setup.perTeam} cardW={cardW} mine={false} from={1} />
        </View>
        <View style={styles.foot}>
          <View style={styles.footInfo}>
            <Txt font="display" size="body" color="white" shadow lines={1}>
              {court.name}
            </Txt>
            <Txt size="small" color="white" lines={1}>{`${setup.quarters} quarters  ·  ${clock(setup.quarterSeconds)} each`}</Txt>
          </View>
          <StickerButton label="TIP-OFF!" icon="ball" iconColor="orange" fill="sun" textSize="title" raise="high" height={sizes.buttonLarge} quiet onPress={tipOff} style={styles.go} />
          <View style={styles.footInfo} />
        </View>
      </Screen>
    </View>
  );
}

export default function Versus() {
  const setup = useSession((s) => s.setup);
  if (!setup) return <Redirect href="/" />;
  return <Matchup key={setup.seed} setup={setup} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.ink,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: {
    flex: 1,
    alignItems: 'center',
    gap: space.xs,
  },
  sideHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  cards: {
    flexDirection: 'row',
    gap: space.sm,
  },
  tags: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'center',
  },
  middle: {
    width: sizes.avatarLarge * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingBottom: space.xs,
  },
  footInfo: {
    flex: 1,
  },
  go: {
    minWidth: sizes.cardLarge + space.huge,
  },
});
