/** Pick a way to play: the Tour, the Ladder, a quick game, or two players on one screen. */

import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { leagueOf } from '@/data/roster';
import { tapFeedback } from '@/fx/feedback';
import { tierProgress } from '@/meta/ladder';
import { DIFFICULTY_NAMES } from '@/meta/setups';
import { nextTourGame, preferredTour, tourStars, toursFor } from '@/meta/tour';
import { useSave } from '@/state/save';
import { arcade, halo, inner, night, tube as tubes, type TubeName } from '@/theme/arcade';
import { px, space } from '@/theme/tokens';
import { ArcadeScreen } from '@/ui/arcade/ArcadeScreen';
import { useWidth } from '@/ui/arcade/Buttons';
import { Star } from '@/ui/arcade/Controls';
import { LineIcon, type LineIconName } from '@/ui/arcade/LineIcon';
import { TierMedal, tierTube } from '@/ui/arcade/Medal';
import { Arrive } from '@/ui/arcade/Motion';
import { Bloom, Rays } from '@/ui/arcade/Room';
import { Meter, Pips, SegBar } from '@/ui/arcade/SegBar';
import { TeamMark, Well } from '@/ui/arcade/Surface';
import { Glow, Print } from '@/ui/arcade/Type';

/** the sign's padding and its tube, both sides */
const SIGN_IN = (px(12) + arcade.outline) * 2;
/** the foot's own padding and line, both sides */
const FOOT_IN = (px(9) + arcade.hairline) * 2;
/** the round badge with the mode's picture, and the light it throws on the sign */
const BADGE = px(64);
const BLOOM = px(170);
const RAYS = px(260);
/** two lines of the explanation, so the three signs line up whether theirs takes one line or two */
const TWO_LINES = Math.round(px(13) * 1.25) * 2;
/** one row of a sign's foot: the ladder's tier medal, its tallest piece */
const FOOT_ROW = px(30);
/** the tour's star count beside its meter: the star, the widest count and the gaps between them */
const TOUR_COUNT = px(18) + px(64) + space.sm * 2;
/** one lamp of the meter and the gap after it */
const LAMP = px(10);

/** As many lamps as the tour's foot has room for beside its count, up to ten (four signs share a narrow screen). */
function tourLamps(room: number): number {
  if (room <= 0) return 10;
  return Math.max(3, Math.min(10, Math.floor((room - TOUR_COUNT) / LAMP)));
}

function ModeSign({ title, text, icon, tube: t, delay, onPress, children }: { title: string; text: string; icon: LineIconName; tube: TubeName; delay: number; onPress: () => void; children: (room: number) => React.ReactNode }) {
  const tb = tubes[t];
  const [width, onLayout] = useWidth(title);
  const room = width > 0 ? width - SIGN_IN : 0;
  return (
    <Arrive delay={delay} from="up" style={styles.grow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${text}`}
        onLayout={onLayout}
        onPress={() => {
          tapFeedback();
          onPress();
        }}
        style={({ pressed }) => [styles.sign, { borderColor: tb.glass, boxShadow: [halo(tb.glass, 14, pressed ? 0.4 : 0.65), inner(tb.glass, 22, 0.3)] }, pressed && styles.pressed]}>
        <View style={styles.top}>
          <View>
            <Rays size={RAYS} color={tb.glass} alpha={0.22} count={16} fill={0.3} fadeAt={[0.2, 0.92]} style={styles.rays} />
            <Bloom size={BLOOM} color={tb.glass} alpha={0.42} style={styles.bloom} />
            <View style={[styles.badge, { borderColor: tb.glass, boxShadow: [halo(tb.glass, 14, 0.8), inner(tb.glass, 14, 0.4)] }]}>
              <LineIcon name={icon} size={px(32)} tube={tb} />
            </View>
          </View>
          <Glow face="display" size="title" tube={tb} track="close" room={room > 0 ? room : undefined} least={0.6}>
            {title}
          </Glow>
          <Print face="medium" size="small" color="textMuted" center lines={2} style={styles.text}>
            {text}
          </Print>
        </View>
        <Well style={styles.foot}>{children(room > 0 ? room - FOOT_IN : 0)}</Well>
      </Pressable>
    </Arrive>
  );
}

export default function Play() {
  const router = useRouter();
  const tour = useSave((s) => s.tour);
  const ladder = useSave((s) => s.ladder);
  const settings = useSave((s) => s.settings);
  const homeTeam = useSave((s) => s.homeTeam);
  const tours = toursFor(homeTeam);
  const go = (href: Href) => () => router.push(href);

  let have = 0;
  let all = 0;
  for (const t of tours) {
    const s = tourStars(tour, t);
    have += s.have;
    all += s.all;
  }
  // the same tour the Tour screen opens on
  const current = preferredTour(tours, tour, leagueOf(homeTeam));
  const next = nextTourGame(tour, current);
  const nextStage = next ? current.stages[next.stage] : null;
  const tp = tierProgress(ladder.points);
  const nextTube = tp.next ? tierTube(tp.index + 1) : tierTube(tp.index);

  return (
    <ArcadeScreen title="PLAY" tube="gold" style={styles.body}>
      <View style={styles.row}>
        <ModeSign title="TOUR" text="Beat each court and win its star." icon="flag" tube="orange" delay={40} onPress={go('/tour')}>
          {(room) => (
            <>
              <View style={styles.line}>
                <Star lit size={px(18)} />
                <Print face="display" size="body" color={tubes.gold.tint} glow={tubes.gold.glass} lines={1}>{`${have} / ${all}`}</Print>
                <Meter value={all > 0 ? have / all : 0} lamps={tourLamps(room)} tube="gold" />
              </View>
              {nextStage ? (
                <View style={styles.line}>
                  <Print face="bold" size="tiny" color="textFaint" track="wide">
                    NEXT
                  </Print>
                  <TeamMark team={nextStage.team} small />
                  <Print face="bold" size="body" color="textSoft" room={Math.max(px(40), room - px(90))}>
                    {nextStage.team.name}
                  </Print>
                </View>
              ) : (
                <Print face="display" size="small" color={tubes.gold.tint} glow={tubes.gold.glass}>
                  EVERY COURT BEATEN!
                </Print>
              )}
            </>
          )}
        </ModeSign>

        <ModeSign title="LADDER" text="Climb from Rookie up to Legend." icon="ladder" tube="indigo" delay={110} onPress={go('/ladder')}>
          {() => (
            <>
              <View style={styles.line}>
                <TierMedal index={tp.index} size={FOOT_ROW} />
                <Glow face="sign" size="large" tube={tierTube(tp.index)} track="wide">
                  {tp.tier.name.toUpperCase()}
                </Glow>
              </View>
              {tp.next ? (
                <View style={styles.bar}>
                  <SegBar value={tp.span > 0 ? (tp.have / tp.span) * 100 : 100} tube={nextTube} small />
                  <Print face="medium" size="tiny" color="textDim" center lines={1}>{`${tp.span - tp.have} points to ${tp.next.name}`}</Print>
                </View>
              ) : (
                <Print face="display" size="small" color={tubes.amber.tint} glow={tubes.amber.glass}>
                  TOP OF THE LADDER!
                </Print>
              )}
            </>
          )}
        </ModeSign>

        <ModeSign title="QUICK GAME" text="Pick a team and court, then play." icon="bolt" tube="cyan" delay={180} onPress={go('/quick')}>
          {() => (
            <>
              <View style={styles.line}>
                <LineIcon name="squad" size={px(18)} tube="cyan" />
                <Print face="display" size="body" color={tubes.cyan.tint} glow={tubes.cyan.glass}>{`${settings.format} ON ${settings.format}`}</Print>
              </View>
              <View style={styles.line}>
                <Pips have={settings.difficulty + 1} of={DIFFICULTY_NAMES.length} tube="cyan" size={px(10)} />
                <Print face="medium" size="small" color="textDim">{`${DIFFICULTY_NAMES[settings.difficulty]} level`}</Print>
              </View>
            </>
          )}
        </ModeSign>

        <ModeSign title="2 PLAYERS" text="Play a friend on one screen." icon="duo" tube="pink" delay={250} onPress={go('/duo')}>
          {() => (
            <>
              <View style={styles.line}>
                <Glow face="display" size="large" tube="cyan" track="close">
                  P1
                </Glow>
                <Print face="bold" size="tiny" color="textFaint" track="wide">
                  VS
                </Print>
                <Glow face="display" size="large" tube="pink" track="close">
                  P2
                </Glow>
              </View>
              <View style={styles.line}>
                <LineIcon name="squad" size={px(18)} tube="pink" />
                <Print face="medium" size="small" color="textDim">
                  Your squad vs any team
                </Print>
              </View>
            </>
          )}
        </ModeSign>
      </View>
    </ArcadeScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: space.lg,
  },
  grow: {
    flex: 1,
  },
  sign: {
    flex: 1,
    padding: px(12),
    gap: space.sm,
    backgroundColor: night.tile,
    borderWidth: arcade.outline,
    borderRadius: arcade.rPanel,
    overflow: 'hidden',
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  top: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: px(7),
  },
  bloom: {
    position: 'absolute',
    left: (BADGE - BLOOM) / 2,
    top: (BADGE - BLOOM) / 2,
  },
  rays: {
    position: 'absolute',
    left: (BADGE - RAYS) / 2,
    top: (BADGE - RAYS) / 2,
  },
  text: {
    minHeight: TWO_LINES,
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.pit,
    borderWidth: arcade.outline,
    marginBottom: px(2),
  },
  foot: {
    minHeight: px(92),
    alignItems: 'center',
    justifyContent: 'center',
    gap: px(8),
  },
  // every row of every foot is as tall as the ladder's medal, so the three feet line up row for row
  line: {
    minHeight: FOOT_ROW,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  bar: {
    minHeight: FOOT_ROW,
    alignSelf: 'stretch',
    justifyContent: 'center',
    gap: px(5),
  },
});
