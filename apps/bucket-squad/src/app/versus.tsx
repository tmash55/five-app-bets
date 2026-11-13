/** The matchup before tip-off, as a fight card on a marquee: your players, theirs, the court, and one big button. */

import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Line } from 'react-native-svg';

import { playSfx } from '@/audio/sound';
import { mustPlayer, teamById } from '@/data/roster';
import { COURTS } from '@/game/render/court';
import { TIERS, tierIndex } from '@/meta/ladder';
import { chemistry, type MatchSetup, type Side } from '@/meta/match';
import { DIFFICULTY_NAMES, sideOverall } from '@/meta/setups';
import { tourById } from '@/meta/tour';
import { useSave } from '@/state/save';
import { useSession } from '@/state/session';
import { arcade, fade, halo, night, tube as tubes, type Tube } from '@/theme/arcade';
import { px, size as sizes, space } from '@/theme/tokens';
import { ArcadeScreen } from '@/ui/arcade/ArcadeScreen';
import { GoldButton } from '@/ui/arcade/Buttons';
import { ArcadeCard } from '@/ui/arcade/Card';
import { LineIcon } from '@/ui/arcade/LineIcon';
import { Breathe } from '@/ui/arcade/Motion';
import { Bulbs } from '@/ui/arcade/Room';
import { ChemChip, OvrMeter } from '@/ui/arcade/Strength';
import { Chip, TeamMark } from '@/ui/arcade/Surface';
import { teamTube } from '@/ui/arcade/TeamPick';
import { Glow, Print } from '@/ui/arcade/Type';

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

/** how far each team slides in from its side */
const SLIDE = px(160);
/** the gap down the middle where the VS goes */
const MIDDLE = px(100);
/** a side's name above its cards and its meters below them */
const HEAD = px(32);
const FOOT = px(34);
const CARD_GAP = space.sm;
/** the marquee's frame: its tube, the bulbs top and bottom, and the room inside them */
const BULB_ROW = px(10);
const FRAME_PAD = px(8);
const CARD_MAX = sizes.card + space.md;
const MARQUEE_PAD_V = px(5);
const MARQUEE_GAP = px(4);
/** what the marquee's frame takes from the room, across and down */
const FRAME_IN_W = (FRAME_PAD + arcade.outline) * 2;
const FRAME_IN_H = (MARQUEE_PAD_V + arcade.outline + BULB_ROW + MARQUEE_GAP) * 2;
/** a side's name, its meters and the gaps between them and the cards */
const AROUND_CARDS = HEAD + FOOT + space.sm * 2;
/** a little dark above and below the fight card on a tall screen */
const STAGE_AIR = px(24);
const FOOT_GAP = space.sm;
/** keeps the cards off the VS in the middle */
const SIDE_ROOM = px(4);
/** how far the VS slash's ends stay inside the stage: more than its widest glow */
const SLASH_INSET = px(14);

function SideColumn({ side, perTeam, cardW, mine, from, tube: tb }: { side: Side; perTeam: number; cardW: number; mine: boolean; from: -1 | 1; tube: Tube }) {
  const players = side.players.slice(0, perTeam);
  const team = teamById(side.kitTeam);
  const chem = mine ? chemistry(players.map((p) => p.id)) : 0;
  const slide = useSharedValue(0);
  useEffect(() => {
    slide.set(withDelay(80, withSpring(1, { damping: 14, stiffness: 150, mass: 0.9 })));
  }, [slide]);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, slide.value * 1.4), transform: [{ translateX: (1 - slide.value) * SLIDE * from }] }));
  return (
    <Animated.View style={[styles.side, style]}>
      <View style={styles.sideHead}>
        {/* your own squad needs no badge: its name says whose it is */}
        {!mine && <TeamMark team={team} small />}
        <Glow face="display" size="title" tube={tb} track="close" room={cardW * perTeam}>
          {side.name.toUpperCase()}
        </Glow>
      </View>
      <View style={styles.cards}>
        {players.map((p) => (
          <ArcadeCard key={p.id} player={mustPlayer(p.id)} level={p.level} width={cardW} />
        ))}
      </View>
      <View style={styles.meters}>
        <OvrMeter value={sideOverall(side, perTeam)} tube={tb} />
        {chem > 0 && <ChemChip chemistry={chem} />}
      </View>
    </Animated.View>
  );
}

/** The marquee's row of bulbs, chasing: a second row, a step along, fades in and out over the first. */
function ChaseBulbs({ width }: { width: number }) {
  return (
    <View style={styles.bulbs}>
      <Bulbs width={width} />
      <Breathe depth={1} ms={520} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Bulbs width={width} phase={1} />
      </Breathe>
    </View>
  );
}

/** A lit slash from top to bottom between the two sides. */
function Slash({ width, height }: { width: number; height: number }) {
  const x1 = width / 2 + px(26);
  const x2 = width / 2 - px(26);
  // the ends stop short of the stage's edges, glow and all, so the slash never reaches the bulb rows
  const y1 = SLASH_INSET;
  const y2 = height - SLASH_INSET;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={tubes.pink.glass} strokeWidth={px(14)} strokeLinecap="round" opacity={0.12} />
        <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={tubes.pink.glass} strokeWidth={px(6)} strokeLinecap="round" opacity={0.35} />
        <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={tubes.pink.tint} strokeWidth={px(2)} strokeLinecap="round" />
      </Svg>
    </View>
  );
}

function Matchup({ setup }: { setup: MatchSetup }) {
  const router = useRouter();
  const ladderPoints = useSave((s) => s.ladder.points);
  const homeTeam = useSave((s) => s.homeTeam);
  const court = COURTS[setup.court];
  const homeTube = teamTube(teamById(setup.home.kitTeam));
  const awayTube = teamTube(teamById(setup.away.kitTeam));
  const [area, setArea] = useState({ width: 0, height: 0 });
  // the button row's own height, measured, so the fight card and the button sit together in the middle of a tall screen
  const [footH, setFootH] = useState(0);
  const pop = useSharedValue(0);
  useEffect(() => {
    pop.set(withDelay(260, withTiming(1, { duration: 320, easing: Easing.out(Easing.back(2.2)) })));
    playSfx('swipe');
  }, [pop]);
  const vs = useAnimatedStyle(() => ({ opacity: Math.min(1, pop.value * 2), transform: [{ scale: 0.3 + pop.value * 0.7 }, { rotate: '-6deg' }] }));

  // the cards are as big as the room lets them be, by its width and by its height; on a tall screen
  // the marquee is only as tall as the fight card needs, in the middle of the room
  const n = setup.perTeam;
  const stageW = area.width - FRAME_IN_W;
  const sideW = (stageW - MIDDLE) / 2 - SIDE_ROOM;
  const byWidth = Math.floor((sideW - CARD_GAP * (n - 1)) / n);
  const room = area.height - footH - FOOT_GAP;
  const byHeight = Math.floor((room - FRAME_IN_H - AROUND_CARDS) / sizes.cardRatio);
  const cardW = Math.min(CARD_MAX, byWidth, byHeight);
  const stageH = Math.min(room - FRAME_IN_H, Math.round(cardW * sizes.cardRatio) + AROUND_CARDS + STAGE_AIR);
  const ready = area.width > 0 && footH > 0 && cardW > 0;

  const tipOff = () => {
    playSfx('whistle');
    router.replace('/match');
  };

  return (
    <ArcadeScreen title={modeLine(setup, ladderPoints, homeTeam)} tube="gold" coins={false} style={styles.body}>
      <View
        style={styles.area}
        onLayout={(e) => {
          const width = Math.round(e.nativeEvent.layout.width);
          const height = Math.round(e.nativeEvent.layout.height);
          if (width !== area.width || height !== area.height) setArea({ width, height });
        }}>
        {ready && (
          <View style={styles.marquee}>
            <ChaseBulbs width={stageW} />
            <View style={[styles.stage, { height: stageH }]}>
              {/* each side's own colour washing in from its edge */}
              <LinearGradient colors={[fade(homeTube.glass, 0.24), fade(homeTube.glass, 0)]} start={ACROSS_A} end={ACROSS_B} style={[styles.wash, styles.washLeft]} />
              <LinearGradient colors={[fade(awayTube.glass, 0), fade(awayTube.glass, 0.24)]} start={ACROSS_A} end={ACROSS_B} style={[styles.wash, styles.washRight]} />
              <Slash width={stageW} height={stageH} />
              <View style={styles.row}>
                <SideColumn side={setup.home} perTeam={n} cardW={cardW} mine from={-1} tube={homeTube} />
                <Animated.View style={[styles.middle, vs]}>
                  <Glow face="display" size={px(50)} tube="pink" track="close">
                    VS
                  </Glow>
                </Animated.View>
                <SideColumn side={setup.away} perTeam={n} cardW={cardW} mine={false} from={1} tube={awayTube} />
              </View>
            </View>
            <ChaseBulbs width={stageW} />
          </View>
        )}
        <View
          style={styles.foot}
          onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height);
            if (h !== footH) setFootH(h);
          }}>
          <View style={styles.footInfo}>
            <Chip small>
              <LineIcon name="flag" size={px(14)} tube="cyan" />
              <Print face="bold" size="small" color="textSoft" lines={1}>
                {court.name}
              </Print>
            </Chip>
          </View>
          <GoldButton label="TIP-OFF!" icon="ball" quiet onPress={tipOff} style={styles.go} />
          <View style={[styles.footInfo, styles.footRight]}>
            <Chip small>
              <LineIcon name="buzz" size={px(14)} tube="gold" />
              <Print face="bold" size="small" color="textSoft" lines={1}>{`${setup.quarters} quarters · ${clock(setup.quarterSeconds)} each`}</Print>
            </Chip>
          </View>
        </View>
      </View>

    </ArcadeScreen>
  );
}

export default function Versus() {
  const setup = useSession((s) => s.setup);
  if (!setup) return <Redirect href="/" />;
  return <Matchup key={setup.seed} setup={setup} />;
}

const ACROSS_A = { x: 0, y: 0 } as const;
const ACROSS_B = { x: 1, y: 0 } as const;

const styles = StyleSheet.create({
  body: {
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  area: {
    flex: 1,
    justifyContent: 'center',
    gap: FOOT_GAP,
  },
  marquee: {
    paddingHorizontal: FRAME_PAD,
    paddingVertical: MARQUEE_PAD_V,
    gap: MARQUEE_GAP,
    backgroundColor: night.panel,
    borderWidth: arcade.outline,
    borderColor: tubes.gold.glass,
    borderRadius: arcade.rPanel,
    boxShadow: [halo(tubes.gold.glass, 14, 0.55)],
    overflow: 'hidden',
  },
  bulbs: {
    height: BULB_ROW,
  },
  stage: {
    borderRadius: arcade.rWell,
    overflow: 'hidden',
    backgroundColor: night.pit,
  },
  wash: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: '55%',
  },
  washLeft: {
    left: 0,
  },
  washRight: {
    right: 0,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  side: {
    flex: 1,
    alignItems: 'center',
    gap: space.sm,
  },
  sideHead: {
    height: HEAD,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  cards: {
    flexDirection: 'row',
    gap: CARD_GAP,
  },
  meters: {
    height: FOOT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  middle: {
    width: MIDDLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  footInfo: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.xs,
  },
  footRight: {
    justifyContent: 'flex-end',
  },
  go: {
    minWidth: sizes.cardLarge + space.huge,
  },
});
