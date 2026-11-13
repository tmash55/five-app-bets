/** The Tour: a road trip of courts. Beat each home team three times to win its star player. */

import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { LEAGUES, leagueOf, mustPlayer } from '@/data/roster';
import { RARITY_LABEL } from '@/data/types';
import { tapFeedback } from '@/fx/feedback';
import { COURTS } from '@/game/render/court';
import type { Owned } from '@/meta/collection';
import { packById } from '@/meta/packs';
import { STARS_PER_GAME, gameKey, gameOpen, nextTourGame, preferredTour, stageOpen, stageStars, tourStars, toursFor, type Tour, type TourGame, type TourProgress } from '@/meta/tour';
import { startTour } from '@/state/play';
import { useSave } from '@/state/save';
import { arcade, goldButton, halo, night, rarityPaint, ring, tube } from '@/theme/arcade';
import { px, size as sizes, space } from '@/theme/tokens';
import { ArcadeScreen } from '@/ui/arcade/ArcadeScreen';
import { Gems } from '@/ui/arcade/Card';
import { LockVeil, StarRow, Star, Tabs } from '@/ui/arcade/Controls';
import { Face } from '@/ui/arcade/Face';
import { FoilPack } from '@/ui/arcade/Foil';
import { LineIcon } from '@/ui/arcade/LineIcon';
import { MIN_FIT_LABEL } from '@/ui/arcade/measure';
import { Arrive } from '@/ui/arcade/Motion';
import { CoinAmount } from '@/ui/arcade/Rewards';
import { Meter } from '@/ui/arcade/SegBar';
import { Chip, NeonPanel, TeamMark } from '@/ui/arcade/Surface';
import { teamTube } from '@/ui/arcade/TeamPick';
import { Glow, Print } from '@/ui/arcade/Type';

const CARD_W = px(264);
const CARD_PAD = px(10);
/** the room inside a stop's card for one line of lettering */
const CARD_ROOM = CARD_W - (CARD_PAD + arcade.outline) * 2;
const GAP = space.md;
/** the prize at the end of a game's row */
const PRIZE_W = px(46);
const ROW_PAD = px(10);
/** the room for a game's name: its row less the padding, the stars, the prize and the gaps between them */
const TITLE_ROOM = CARD_ROOM - ROW_PAD * 2 - PRIZE_W - px(55) - space.sm * 2;
const PLAY_ICON = px(16);

function GameRow({ game, stars, open, next, onPress }: { game: TourGame; stars: number; open: boolean; /** the next game to play: the one yellow thing on the page */ next: boolean; onPress: () => void }) {
  const won = stars > 0;
  const ink = next ? 'onLight' : open ? 'text' : 'textFaint';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !open }}
      accessibilityLabel={`${game.title}, ${game.perTeam} on ${game.perTeam}${open ? '' : ', locked'}`}
      disabled={!open}
      hitSlop={space.hair}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [styles.game, next && styles.gameNext, !open && styles.gameLocked, pressed && styles.pressed]}>
      {next && <LinearGradient colors={[goldButton.top, goldButton.bottom]} style={[StyleSheet.absoluteFill, styles.gameFace]} />}
      {next && <View style={styles.gameLip} />}
      {next && <LineIcon name="play" size={PLAY_ICON} color={night.onLight} />}
      <View style={styles.gameText}>
        <Print face={next ? 'display' : 'bold'} size={next ? 'body' : 'large'} color={ink} track={next ? 'close' : 'none'} lines={1} room={next ? TITLE_ROOM - PLAY_ICON - space.sm : TITLE_ROOM} least={MIN_FIT_LABEL}>
          {next ? game.title.toUpperCase() : game.title}
        </Print>
        <Print face="bold" size="micro" color={next ? 'onLight' : 'textFaint'} track="wider" lines={1}>{`${game.perTeam} ON ${game.perTeam}`}</Print>
      </View>
      {open ? <StarRow have={stars} size={px(17)} gap={px(2)} style={next && styles.starsOnGold} /> : <LineIcon name="lock" size={px(17)} color={night.lineLit} />}
      <View style={styles.prize}>
        {won ? (
          <View style={styles.won}>
            <LineIcon name="check" size={px(20)} tube="green" weight={3} />
          </View>
        ) : game.unlock ? (
          <Face id={game.unlock} size={px(30)} dark={!open} />
        ) : game.pack ? (
          <FoilPack pack={packById(game.pack)} width={px(22)} flat={!open} />
        ) : (
          <CoinAmount coins={game.coins} size="small" dim={!open} />
        )}
      </View>
    </Pressable>
  );
}

function StageCard({ tour, index, progress, owned, packDone, next, onPlay }: { tour: Tour; index: number; progress: TourProgress; owned: Owned; packDone: boolean; next: number | null; onPlay: (game: number) => void }) {
  const stage = tour.stages[index];
  const open = stageOpen(progress, tour, index);
  const stars = stageStars(progress, tour, index);
  const all = stage.games.length * STARS_PER_GAME;
  const starId = stage.games.find((g) => g.unlock)?.unlock;
  const star = starId ? mustPlayer(starId) : null;
  const tb = teamTube(stage.team);
  const pack = packById(stage.starPack);
  const have = star ? (owned[star.id] ?? 0) > 0 : false;
  return (
    <NeonPanel tube={tb} lit={open} style={styles.card}>
      <View style={styles.head}>
        <TeamMark team={stage.team} />
        <View style={styles.grow}>
          <Glow face="sign" size="large" tube={tb} track="close" room={CARD_ROOM - px(130)} lit={open} tight>
            {stage.team.name.toUpperCase()}
          </Glow>
          <Print face="medium" size="tiny" color="textDim" lines={1}>
            {COURTS[stage.team.court].name}
          </Print>
        </View>
        <Chip small style={styles.count}>
          <Star lit={stars > 0} size={px(14)} />
          <Print face="bold" size="small" color={stars > 0 ? tube.gold.tint : 'textDim'} track="normal">{`${stars} / ${all}`}</Print>
        </Chip>
      </View>
      {star && (
        <View style={styles.star}>
          <Face id={star.id} size={px(38)} />
          <View style={styles.grow}>
            <Print face="bold" size="micro" color={have ? tube.green.soft : tube.gold.soft} track="wider">
              {have ? 'IN YOUR COLLECTION' : 'WIN THEIR STAR'}
            </Print>
            <Print face="bold" size="body" room={CARD_ROOM - px(120)}>
              {star.name}
            </Print>
          </View>
          <View accessible accessibilityLabel={RARITY_LABEL[star.rarity]} style={styles.rarity}>
            <Gems rarity={star.rarity} size={px(9)} />
            <Print face="bold" size="micro" color={tube[rarityPaint[star.rarity].tube].tint} track="wider" upper>
              {RARITY_LABEL[star.rarity]}
            </Print>
          </View>
        </View>
      )}
      <View style={styles.games}>
        {stage.games.map((g, i) => (
          <GameRow key={i} game={g} stars={progress[gameKey(tour.id, index, i)] ?? 0} open={gameOpen(progress, tour, index, i)} next={next === i} onPress={() => onPlay(i)} />
        ))}
      </View>
      <View style={styles.foot}>
        <FoilPack pack={pack} width={px(16)} flat={!packDone} />
        <Print face="medium" size="tiny" color={packDone ? tube.green.soft : 'textDim'} lines={1} style={styles.grow}>
          {packDone ? `You won the ${pack.name}!` : `Get all ${all} stars to win the ${pack.name}`}
        </Print>
        {packDone && <LineIcon name="check" size={px(16)} tube="green" weight={3} />}
      </View>
      {!open && <LockVeil message={`Beat the ${tour.stages[index - 1].team.name} first`} />}
    </NeonPanel>
  );
}

/** a tour is named after its league, and the league's own name is the short one */
function leagueName(id: string): string {
  return LEAGUES.find((l) => l.id === id)?.name ?? id;
}

export default function TourScreen() {
  const router = useRouter();
  const progress = useSave((s) => s.tour);
  const owned = useSave((s) => s.owned);
  const starPacks = useSave((s) => s.starPacks);
  const homeTeam = useSave((s) => s.homeTeam);
  const tours = toursFor(homeTeam);
  const [tourId, setTourId] = useState(() => preferredTour(tours, progress, leagueOf(homeTeam)).id);
  const tour = tours.find((t) => t.id === tourId) ?? tours[0];
  const stars = tourStars(progress, tour);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const next = nextTourGame(progress, tour);
  const focus = next ? next.stage : 0;

  // start on the stop you are up to
  useEffect(() => {
    const x = Math.max(0, focus * (CARD_W + GAP) - space.huge);
    const id = setTimeout(() => scroller.current?.scrollTo({ x, animated: false }), 0);
    return () => clearTimeout(id);
  }, [focus, tourId]);

  const play = (stage: number, game: number) => {
    if (startTour(tour.id, stage, game)) router.push('/versus');
  };

  return (
    <ArcadeScreen
      title="TOUR"
      tube="orange"
      style={styles.body}
      right={
        <>
          {tours.length > 1 && <Tabs options={tours.map((t) => ({ value: t.id, label: leagueName(t.id) }))} value={tour.id} onChange={setTourId} tube="orange" />}
          <Chip>
            <Star lit size={px(18)} />
            <Print face="bold" size="large" color={tube.gold.glass} track="wide" glow={tube.gold.glass}>{`${stars.have} / ${stars.all}`}</Print>
            <Meter value={stars.all > 0 ? stars.have / stars.all : 0} lamps={10} tube="gold" />
          </Chip>
        </>
      }>
      <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {tour.stages.map((_, i) => (
          <Arrive key={`${tour.id}${i}`} delay={Math.min(4, Math.abs(i - focus)) * 70} from="up">
            <StageCard tour={tour} index={i} progress={progress} owned={owned} packDone={starPacks[`${tour.id}/${i}`] === true} next={next && next.stage === i ? next.game : null} onPlay={(g) => play(i, g)} />
          </Arrive>
        ))}
      </ScrollView>
    </ArcadeScreen>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingTop: space.sm,
  },
  scroll: {
    gap: GAP,
    paddingTop: space.xs,
    paddingBottom: space.xs,
    paddingRight: space.lg,
    paddingLeft: space.xs,
    alignItems: 'center',
    flexGrow: 1,
  },
  card: {
    width: CARD_W,
    padding: CARD_PAD,
    gap: px(7),
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  grow: {
    flex: 1,
  },
  count: {
    gap: px(5),
    paddingLeft: px(7),
  },
  star: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: px(5),
    paddingHorizontal: px(8),
    borderRadius: arcade.rWell,
    backgroundColor: night.well,
  },
  rarity: {
    alignItems: 'flex-end',
    gap: px(2),
  },
  games: {
    gap: px(6),
  },
  game: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: sizes.tap + px(4),
    paddingHorizontal: ROW_PAD,
    borderRadius: arcade.rButton,
    backgroundColor: night.pit,
    borderWidth: arcade.hairline,
    borderColor: night.lineLit,
  },
  gameNext: {
    borderWidth: 0,
    boxShadow: [ring(goldButton.ring, 2), halo(goldButton.glow, 14, 0.75)],
  },
  gameFace: {
    borderRadius: arcade.rButton,
  },
  gameLip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: px(4),
    borderBottomLeftRadius: arcade.rButton,
    borderBottomRightRadius: arcade.rButton,
    backgroundColor: goldButton.lip,
  },
  gameLocked: {
    borderColor: night.line,
    backgroundColor: night.plate,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  gameText: {
    flex: 1,
  },
  // stars still to win, pressed into the yellow rather than drawn on it
  starsOnGold: {
    opacity: 0.4,
  },
  prize: {
    width: PRIZE_W,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  won: {
    width: px(28),
    height: px(28),
    alignItems: 'center',
    justifyContent: 'center',
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(6),
    paddingHorizontal: px(2),
  },
});
