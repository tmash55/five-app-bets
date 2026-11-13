/** Home: your squad warming up in their corner of the arcade on one side, everything you can do on the other. */

import { Image } from 'expo-image';
import { Redirect, useFocusEffect, useIsFocused, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';

import { PLAYERS, cardArt, leagueOf, mustPlayer, playerOverall } from '@/data/roster';
import { tapFeedback } from '@/fx/feedback';
import { StageView } from '@/game/StageView';
import type { StageFocus, StageMarks, StagePaint } from '@/game/render/stage';
import { STAGE_BASE_R, STAGE_GROUP_W, stageMarks } from '@/game/render/stage';
import { squadStage } from '@/game/stage/cast';
import { countOwned, levelOf } from '@/meta/collection';
import { tierProgress } from '@/meta/ladder';
import { currentMissions, missionsToClaim } from '@/meta/missions';
import { dayKey } from '@/meta/rng';
import { nextTourGame, preferredTour, toursFor } from '@/meta/tour';
import { useSave } from '@/state/save';
import { blend, neonText, night, rarityPaint, track, tube } from '@/theme/arcade';
import { color, px, space } from '@/theme/tokens';
import { ArcadeScreen, CoinChip } from '@/ui/arcade/ArcadeScreen';
import { GoldButton, NeonTile, RoundButton } from '@/ui/arcade/Buttons';
import { fitPerson, widthOf } from '@/ui/arcade/measure';
import { placePlates } from '@/ui/arcade/plateRow';
import { Floor, Spotlight, StageRing } from '@/ui/arcade/Room';
import { HoopSign, StarSign } from '@/ui/arcade/Signs';
import { Chip, Plate } from '@/ui/arcade/Surface';
import { Glow, Print } from '@/ui/arcade/Type';

const ALL_IDS = PLAYERS.map((p) => p.id);
/** one full breath of the squad's card art, before the live squad takes over */
const IDLE_MS = 2400;
/** the live 3D squad needs GL; tests have none and keep the card art */
const LIVE = process.env.NODE_ENV !== 'test';
const FADE_MS = 280;
/** the squad stands on the arcade's own floor: the 3D base is only their contact shadows */
const FLOOR_PAINT: StagePaint = { shadow: night.pit, strength: 0.62 };
/** the lit ring they stand in, as a share of the 3D base: a little wider than the squad */
const RING = 1.32;
/** where the front of the base sits, as a share of the way from the top of the corner to the bottom of the screen */
const BASE_FRONT = 0.885;
/** the right-hand column: the big button and the four signs */
const MENU_W = px(284);
/** the room for the line under PLAY: the big button less its padding, its icon and the gap after it */
const PLAY_ROOM = MENU_W - px(18) * 2 - px(46) - px(14);

/** The first of these that fits on the line under PLAY at its own size (the last one if none does): a shrunk line would be cut. */
function fitLine(choices: readonly string[], room: number): string {
  return choices.find((t) => widthOf(t, 'bold', neonText.small, track.close) <= room) ?? choices[choices.length - 1];
}

/** the slow breath of the lit lettering and signs */
const BREATH_MS = 3600;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A gentle, endless rise and fall between `low` and 1, starting `delay` in. */
function useBreath(low: number, delay = 0): SharedValue<number> {
  const v = useSharedValue(1);
  useEffect(() => {
    const half = { duration: BREATH_MS / 2, easing: Easing.inOut(Easing.sin) };
    v.set(withDelay(delay, withRepeat(withSequence(withTiming(low, half), withTiming(1, half)), -1)));
  }, [v, low, delay]);
  return v;
}

/** The game's name in two lit words. It breathes very slightly, never flashes. */
function Logo() {
  const breath = useBreath(0.86);
  const style = useAnimatedStyle(() => ({ opacity: breath.value }));
  return (
    <Animated.View accessible accessibilityRole="header" accessibilityLabel="Bucket Squad" style={[styles.logo, style]}>
      <Glow tube="pink" size="title">
        BUCKET
      </Glow>
      <Glow tube="cyan" size="title">
        SQUAD
      </Glow>
    </Animated.View>
  );
}

/** One of the four signs, breathing a little out of step with the others. */
function BreathingTile({ delay, ...tile }: React.ComponentProps<typeof NeonTile> & { delay: number }) {
  const breath = useBreath(0.9, delay);
  const style = useAnimatedStyle(() => ({ opacity: breath.value }));
  return (
    <Animated.View style={[styles.tile, style]}>
      <NeonTile {...tile} style={styles.tileFace} />
    </Animated.View>
  );
}

/** One squad member's card art, gently bouncing on their toes, standing where the live figure will stand. */
function Figure({ id, clock, beat, style }: { id: string; clock: SharedValue<number>; beat: number; style: ViewStyle }) {
  const art = cardArt(id);
  const bob = useAnimatedStyle(() => {
    const wave = Math.sin((clock.value + beat) * Math.PI * 2);
    return { transform: [{ translateY: -space.xs * 0.5 * (1 + wave) }, { scaleY: 1 + 0.012 * wave }] };
  });
  return <Animated.View style={[styles.figure, style, bob]}>{art !== undefined && <Image source={art} style={styles.fill} contentFit="contain" contentPosition="bottom" transition={0} />}</Animated.View>;
}

/** What the plate under a figure says, and how wide it is. */
function plateText(id: string, owned: Record<string, number>, room: number): { name: string; size: number; ovr: string } {
  const p = mustPlayer(id);
  const ovr = String(playerOverall(p, levelOf(owned[id] ?? 1)));
  const fit = fitPerson(p.name.toUpperCase(), 'bold', neonText.tiny, room - PLATE_PAD - widthOf(ovr, 'bold', neonText.tiny, track.normal), track.normal, p.short?.toUpperCase(), 0.8);
  return { name: fit.text, size: fit.size, ovr };
}

/** inside a plate: its padding and edges, and the gap between the name and the number */
const PLATE_PAD = space.sm * 2 + px(1.5) * 2 + px(7);

/**
 * The squad's corner of the arcade: a hoop and a star on the wall, a spotlight on the floor, a lit ring to stand in and
 * a name plate under each player. The three are card art at first, then the live warm-up over it. Everything here is
 * placed from where the 3D stage puts the figures, so the ring, the light and the plates line up with them on any screen.
 */
function SquadCorner({ ids, owned, onPress }: { ids: string[]; owned: Record<string, number>; onPress: () => void }) {
  const clock = useSharedValue(0);
  useEffect(() => {
    clock.set(withRepeat(withTiming(1, { duration: IDLE_MS, easing: Easing.linear }), -1));
  }, [clock]);

  // the live stage only runs while this screen is on top: another screen covering it frees its GL context
  const focused = useIsFocused();
  const [failed, setFailed] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const area = useRef<ComponentRef<typeof View>>(null);
  const window = useWindowDimensions();
  const live = useSharedValue(0);
  const setup = useMemo(() => squadStage(ids, FLOOR_PAINT), [ids]);
  useFocusEffect(
    useCallback(() => {
      return () => live.set(0);
    }, [live]),
  );
  const measure = useCallback(() => {
    area.current?.measureInWindow((x, y, w, h) => {
      if (w > 0 && h > 0) setRect((r) => (r && r.x === x && r.y === y && r.w === w && r.h === h ? r : { x, y, w, h }));
    });
  }, []);
  const ready = useCallback(() => live.set(withTiming(1, { duration: FADE_MS })), [live]);
  const fail = useCallback(
    (e: unknown) => {
      live.set(0);
      setFailed(true);
      if (__DEV__) console.warn('warm-up stage unavailable', e);
    },
    [live],
  );
  const cardStyle = useAnimatedStyle(() => ({ opacity: 1 - live.value }));
  const liveStyle = useAnimatedStyle(() => ({ opacity: live.value }));

  // the GL view reaches up under the top bar and out to the left edge so raised arms and a flying ball are never cut off;
  // the bar is drawn over it
  const glW = rect ? rect.x + rect.w + space.lg : 1;
  const glH = window.height;
  const focus = useMemo<StageFocus>(() => {
    if (!rect) return { x: 0, y: 0, w: 1, h: 1 };
    // room above the heads for a hop or a tossed ball before it passes under the top bar
    const top = rect.y + px(30);
    const front = rect.y + (glH - rect.y) * BASE_FRONT;
    // the squad is framed to the box's width when that is what holds it back: narrow it until the ring and its glow fit the corner
    const wide = Math.min(rect.w - px(32), ((rect.w + px(8) - px(20)) / (2 * RING * STAGE_BASE_R)) * STAGE_GROUP_W);
    return { x: (rect.x + (rect.w - wide) / 2) / glW, y: top / glH, w: wide / glW, h: (front - top) / glH };
  }, [rect, glW, glH]);
  const marks = useMemo<StageMarks | null>(() => (rect ? stageMarks(setup, focus, glW, glH, RING) : null), [rect, setup, focus, glW, glH]);
  const showLive = LIVE && focused && !failed && rect !== null;

  // in the GL view's own frame, which starts at the screen's top left corner
  const ring = marks?.rings[0];
  const cx = ring ? ring.x * glW : 0;
  const cy = ring ? ring.y * glH : 0;
  const rx = ring ? ring.rx * glW : 0;
  const ry = ring ? ring.ry * glH : 0;
  const unit = marks ? marks.scale * glH : 0;
  // captain in the middle: the stage puts the captain first, then the players to the left and the right
  const feet = marks ? marks.feet.map((f, i) => ({ id: ids[i], x: f.x * glW, y: f.y * glH })) : [];
  const across = [...feet].sort((a, b) => a.x - b.x);
  const plates = useMemo(() => {
    if (!rect || across.length === 0) return [];
    const natural = across.map((f) => {
      const p = mustPlayer(f.id);
      const ovr = String(playerOverall(p, levelOf(owned[f.id] ?? 1)));
      return widthOf(p.name.toUpperCase(), 'bold', neonText.tiny, track.normal) + widthOf(ovr, 'bold', neonText.tiny, track.normal) + PLATE_PAD;
    });
    const placed = placePlates(
      across.map((f, i) => ({ at: f.x, width: natural[i] })),
      rect.x - px(6),
      rect.x + rect.w + px(4),
      px(6),
    );
    // one row along the front of the ring, the captain's plate a step lower like the captain
    const row = Math.max(...across.map((f) => f.y)) + px(8);
    return placed.map((p, i) => ({ ...p, ...plateText(across[i].id, owned, p.width), top: row + (across[i].id === ids[0] ? px(4) : 0), id: across[i].id }));
    // the plates follow the figures, which follow the layout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rect, marks, owned]);

  return (
    <View style={styles.corner} ref={area} onLayout={measure}>
      {rect && marks && ring && (
        <View pointerEvents="box-none" style={[styles.room, { left: -rect.x, top: -rect.y, width: window.width, height: glH }]}>
          <HoopSign width={px(92)} style={[styles.at, { left: rect.x + px(4), top: rect.y + px(16) }, styles.sign]} />
          <StarSign size={px(40)} style={[styles.at, { left: rect.x + rect.w - px(54), top: rect.y + px(22) }, styles.sign]} />
          <Spotlight width={rx * 2.08} height={cy - rect.y + px(4)} style={[styles.at, { left: cx - rx * 1.04, top: rect.y - px(6) }]} />
          <Floor style={[styles.at, { left: 0, right: 0, top: cy - ry - px(12), bottom: 0 }]} />
          <StageRing width={(rx + px(10)) * 2} height={(ry + px(4)) * 2} style={[styles.at, { left: cx - rx - px(10), top: cy - ry - px(4) }]} />

          <Animated.View style={[styles.at, { left: 0, top: 0, width: glW, height: glH }, cardStyle]}>
            <Pressable
              style={styles.fill}
              accessibilityRole="button"
              accessibilityLabel="Your squad. Tap to change it."
              onPress={() => {
                tapFeedback();
                onPress();
              }}>
              {/* back to front: the side players stand a step behind the captain */}
              {[...feet].reverse().map((f, i) => {
                const h = unit * 1.57 * 1.32;
                const w = h * (440 / 560);
                return <Figure key={f.id} id={f.id} clock={clock} beat={i * 0.37} style={{ left: f.x - w / 2, top: f.y - h * 0.955, width: w, height: h }} />;
              })}
            </Pressable>
          </Animated.View>
          {showLive && (
            <Animated.View style={[styles.at, { left: 0, top: 0, width: glW, height: glH }, liveStyle]}>
              <StageView
                key={ids.join(',')}
                setup={setup}
                focus={focus}
                onReady={ready}
                onError={fail}
                onPressEmpty={() => {
                  tapFeedback();
                  onPress();
                }}
                style={styles.fill}
              />
            </Animated.View>
          )}

          {plates.map((p) => {
            const tb = rarityPaint[mustPlayer(p.id).rarity].tube;
            return (
              <View key={p.id} pointerEvents="none" style={[styles.at, styles.plateBox, { left: p.x - p.width / 2, top: p.top, width: p.width }]}>
                <Plate tube={tb}>
                  <Print face="bold" size={p.size} track="normal" lines={1}>
                    {p.name}
                  </Print>
                  <Print face="bold" size="tiny" color={tube[tb].soft} track="normal">
                    {p.ovr}
                  </Print>
                </Plate>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const onboarded = useSave((s) => s.onboarded);
  const squad = useSave((s) => s.squad);
  const owned = useSave((s) => s.owned);
  const packs = useSave((s) => s.packs);
  const fresh = useSave((s) => s.fresh);
  const missions = useSave((s) => s.missions);
  const freePackDay = useSave((s) => s.freePackDay);
  const coins = useSave((s) => s.coins);
  const ladder = useSave((s) => s.ladder);
  const tour = useSave((s) => s.tour);
  const homeTeam = useSave((s) => s.homeTeam);

  if (!onboarded || squad.length === 0) return <Redirect href="/welcome" />;

  const today = dayKey();
  const packCount = Object.values(packs).reduce((a, n) => a + n, 0);
  const freePack = freePackDay !== today;
  const toClaim = missionsToClaim(currentMissions(missions, today));
  const have = countOwned(owned, ALL_IDS);
  const go = (href: Href) => () => router.push(href);

  // where PLAY leads: the next stop on the tour the Tour screen opens on, or the ladder once every court is beaten
  const tier = tierProgress(ladder.points).tier;
  const current = preferredTour(toursFor(homeTeam), tour, leagueOf(homeTeam));
  const next = nextTourGame(tour, current);
  const nextStage = next ? current.stages[next.stage] : null;
  const stop = nextStage?.team.name.toUpperCase();
  const playSub = fitLine(stop !== undefined ? [`TOUR · NEXT STOP: ${stop}`, `TOUR · NEXT: ${stop}`, `NEXT: ${stop}`, stop] : [`LADDER · ${tier.name.toUpperCase()}`], PLAY_ROOM);
  const tierLight = color[tier.color];

  const packSub = freePack ? (packCount > 0 ? `Free pack + ${packCount} more` : '1 free pack today') : packCount > 0 ? `${packCount} to open` : 'Card shop';

  return (
    <ArcadeScreen
      back={false}
      coins={false}
      left={<Logo />}
      right={
        <>
          <View accessible accessibilityLabel={`Ladder: ${tier.name}`}>
            <Chip>
              <Print face="bold" size="small" color="textFaint" track="wider">
                LADDER
              </Print>
              <Print face="bold" size="small" color={blend(tierLight, night.white, 0.72)} track="wider" glow={blend(tierLight, night.white, 0.4)} upper>
                {tier.name}
              </Print>
            </Chip>
          </View>
          <CoinChip coins={coins} />
          <RoundButton icon="gear" label="Settings" onPress={go('/settings')} />
        </>
      }>
      <View style={styles.row}>
        <SquadCorner ids={squad} owned={owned} onPress={go('/squad')} />
        <View style={styles.menu}>
          <GoldButton size="big" label="PLAY" sub={playSub} icon="play" onPress={go('/play')} accessibilityLabel={`Play. ${playSub}`} />
          <View style={styles.tiles}>
            <View style={styles.tileRow}>
              <BreathingTile delay={0} tube="pink" icon="pack" title="PACKS" sub={packSub} badge={packCount + (freePack ? 1 : 0)} onPress={go('/packs')} />
              <BreathingTile delay={900} tube="cyan" icon="grid" title="COLLECTION" sub={`${have} of ${ALL_IDS.length} players`} badge={fresh.length} onPress={go('/shelf')} />
            </View>
            <View style={styles.tileRow}>
              <BreathingTile delay={1800} tube="violet" icon="squad" title="SQUAD" sub="Pick your three" onPress={go('/squad')} />
              <BreathingTile delay={2700} tube="green" icon="target" title="MISSIONS" sub={toClaim > 0 ? 'Prizes waiting!' : 'New every day'} badge={toClaim} onPress={go('/missions')} />
            </View>
          </View>
        </View>
      </View>
    </ArcadeScreen>
  );
}

const styles = StyleSheet.create({
  logo: {
    flexDirection: 'row',
    gap: px(9),
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: px(18),
  },
  corner: {
    flex: 1,
  },
  room: {
    position: 'absolute',
  },
  at: {
    position: 'absolute',
  },
  sign: {
    opacity: 0.85,
  },
  figure: {
    position: 'absolute',
    transformOrigin: 'bottom',
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  plateBox: {
    alignItems: 'center',
  },
  menu: {
    width: MENU_W,
    justifyContent: 'center',
    gap: px(22),
    paddingBottom: px(4),
  },
  tiles: {
    gap: px(14),
  },
  tileRow: {
    flexDirection: 'row',
    gap: px(12),
  },
  tile: {
    flex: 1,
  },
  tileFace: {
    height: px(84),
  },
});
