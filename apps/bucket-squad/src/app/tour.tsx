/** The Tour: a road trip of courts. Beat each home team three times to win its star player. */

import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { mustPlayer } from '@/data/roster';
import { COURTS } from '@/game/render/court';
import type { Owned } from '@/meta/collection';
import { packById } from '@/meta/packs';
import { STARS_PER_GAME, gameKey, gameOpen, nextTourGame, stageOpen, stageStars, tourStars, toursFor, type Tour, type TourGame, type TourProgress } from '@/meta/tour';
import { startTour } from '@/state/play';
import { useSave } from '@/state/save';
import { color, opacity, size as sizes, space, stroke } from '@/theme/tokens';
import { Avatar, RarityTag, Stars, Tag, TeamBadge, readableOn } from '@/ui/Bits';
import { Icon } from '@/ui/Icon';
import { Segmented } from '@/ui/Inputs';
import { PackArt } from '@/ui/PackArt';
import { CoinAmount } from '@/ui/Rewards';
import { Screen } from '@/ui/Screen';
import { Sticker, StickerButton } from '@/ui/Sticker';
import { Txt } from '@/ui/Txt';

const CARD_W = sizes.cardLarge + space.huge + space.lg;

function GameRow({ game, stars, open, onPress }: { game: TourGame; stars: number; open: boolean; onPress: () => void }) {
  const won = stars > 0;
  return (
    <StickerButton fill={!open ? 'paperDim' : won ? 'white' : 'sun'} round="md" raise={open ? 'low' : 'none'} disabled={!open} onPress={onPress} accessibilityLabel={`${game.title}, ${game.perTeam} on ${game.perTeam}${open ? '' : ', locked'}`} face={styles.game}>
      <View style={styles.gameText}>
        <Txt font="display" size="body" lines={1}>
          {game.title}
        </Txt>
        <Txt size="tiny" color="inkSoft" lines={1}>{`${game.perTeam} on ${game.perTeam}`}</Txt>
      </View>
      {open ? <Stars have={stars} /> : <Icon name="lock" size={sizes.iconSmall} color="paper" ink="inkFaint" />}
      <View style={styles.prize}>
        {won ? (
          <Icon name="check" size={sizes.icon} color="mint" />
        ) : game.unlock ? (
          <Avatar id={game.unlock} diameter={sizes.badgeSmall + space.xs} />
        ) : game.pack ? (
          <PackArt pack={packById(game.pack)} width={sizes.badgeTiny + space.xs} />
        ) : (
          <CoinAmount coins={game.coins} size="small" />
        )}
      </View>
    </StickerButton>
  );
}

function StageCard({ tour, index, progress, owned, packDone, onPlay }: { tour: Tour; index: number; progress: TourProgress; owned: Owned; packDone: boolean; onPlay: (game: number) => void }) {
  const stage = tour.stages[index];
  const open = stageOpen(progress, tour, index);
  const stars = stageStars(progress, tour, index);
  const all = stage.games.length * STARS_PER_GAME;
  const starId = stage.games.find((g) => g.unlock)?.unlock;
  const star = starId ? mustPlayer(starId) : null;
  const on = readableOn(stage.team.color);
  return (
    <Sticker fill="paper" round="lg" raise="mid" style={styles.card} face={styles.cardFace}>
      <View style={[styles.head, { backgroundColor: stage.team.color }]}>
        <TeamBadge team={stage.team} diameter={sizes.badge} />
        <View style={styles.grow}>
          <Txt font="display" size="large" color={on} lines={1}>
            {stage.team.name}
          </Txt>
          <Txt size="tiny" color={on} lines={1}>
            {COURTS[stage.team.court].name}
          </Txt>
        </View>
        <Tag label={`${stars} / ${all}`} fill="paper" icon="star" style={styles.centerSelf} />
      </View>
      <View style={styles.body}>
        {star && (
          <View style={styles.star}>
            <Avatar id={star.id} diameter={sizes.avatarSmall} />
            <View style={styles.grow}>
              <Txt size="tiny" color="inkSoft">
                {(owned[star.id] ?? 0) > 0 ? 'ON YOUR SHELF' : 'WIN THEIR STAR'}
              </Txt>
              <Txt font="display" size="body" lines={1}>
                {star.name}
              </Txt>
            </View>
            <RarityTag rarity={star.rarity} style={styles.centerSelf} />
          </View>
        )}
        {stage.games.map((g, i) => (
          <GameRow key={i} game={g} stars={progress[gameKey(tour.id, index, i)] ?? 0} open={gameOpen(progress, tour, index, i)} onPress={() => onPlay(i)} />
        ))}
        <View style={styles.foot}>
          <PackArt pack={packById(stage.starPack)} width={sizes.badgeTiny} />
          <Txt size="tiny" color="inkSoft" lines={1} style={styles.grow}>
            {packDone ? `You won the ${packById(stage.starPack).name}!` : `Get all ${all} stars to win the ${packById(stage.starPack).name}`}
          </Txt>
          {packDone && <Icon name="check" size={sizes.iconSmall} color="mint" />}
        </View>
      </View>
      {!open && (
        <>
          <View style={styles.lockDim} />
          <View style={styles.lockOver}>
            <Sticker fill="paper" round="pill" raise="low" face={styles.lockPill}>
              <Icon name="lock" size={sizes.icon} color="sun" />
              <Txt font="display" size="body" lines={1}>
                {`Beat the ${tour.stages[index - 1].team.name} first`}
              </Txt>
            </Sticker>
          </View>
        </>
      )}
    </Sticker>
  );
}

export default function TourScreen() {
  const router = useRouter();
  const progress = useSave((s) => s.tour);
  const owned = useSave((s) => s.owned);
  const starPacks = useSave((s) => s.starPacks);
  const tours = toursFor(useSave((s) => s.homeTeam));
  const [tourId, setTourId] = useState(() => (tours.find((t) => nextTourGame(progress, t) !== null) ?? tours[0]).id);
  const tour = tours.find((t) => t.id === tourId) ?? tours[0];
  const stars = tourStars(progress, tour);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const next = nextTourGame(progress, tour);
  const focus = next ? next.stage : 0;

  // start on the stop you are up to
  useEffect(() => {
    const x = Math.max(0, focus * (CARD_W + space.md) - space.huge);
    const id = setTimeout(() => scroller.current?.scrollTo({ x, animated: false }), 0);
    return () => clearTimeout(id);
  }, [focus, tourId]);

  const play = (stage: number, game: number) => {
    if (startTour(tour.id, stage, game)) router.push('/versus');
  };

  return (
    <Screen title="TOUR" tone="mint" right={<Tag label={`${stars.have} / ${stars.all}`} fill="paper" icon="star" style={styles.centerSelf} />}>
      {tours.length > 1 && <Segmented options={tours.map((t) => ({ value: t.id, label: t.name }))} value={tour.id} onChange={setTourId} style={styles.tours} />}
      <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {tour.stages.map((_, i) => (
          <StageCard key={`${tour.id}${i}`} tour={tour} index={i} progress={progress} owned={owned} packDone={starPacks[`${tour.id}/${i}`] === true} onPlay={(g) => play(i, g)} />
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    gap: space.md,
    paddingRight: space.lg,
    alignItems: 'center',
  },
  tours: {
    marginBottom: space.xs,
    maxWidth: sizes.panelMax,
  },
  card: {
    width: CARD_W,
  },
  cardFace: {
    gap: 0,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderBottomWidth: stroke.regular,
    borderColor: color.ink,
  },
  body: {
    padding: space.sm,
    gap: space.xs,
  },
  star: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  grow: {
    flex: 1,
  },
  centerSelf: {
    alignSelf: 'center',
  },
  game: {
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    minHeight: sizes.buttonSmall,
    gap: space.sm,
  },
  gameText: {
    flex: 1,
  },
  prize: {
    width: sizes.tap,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  lockDim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: color.scrim,
    opacity: 1 - opacity.pattern,
  },
  lockOver: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.md,
  },
  lockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
});
