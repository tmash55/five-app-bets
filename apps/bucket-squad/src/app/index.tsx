/** Home: your squad on one side, everything you can do on the other. */

import { Image } from 'expo-image';
import { Redirect, useFocusEffect, useIsFocused, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';

import { PLAYERS, cardArt, mustPlayer, playerOverall } from '@/data/roster';
import { tapFeedback } from '@/fx/feedback';
import { StageView } from '@/game/StageView';
import { squadStage } from '@/game/stage/cast';
import { countOwned, levelOf } from '@/meta/collection';
import { currentMissions, missionsToClaim } from '@/meta/missions';
import { dayKey } from '@/meta/rng';
import { useSave } from '@/state/save';
import { color, size as sizes, space, type ColorName } from '@/theme/tokens';
import { Dot, Tag } from '@/ui/Bits';
import { Icon, type IconName } from '@/ui/Icon';
import { Screen } from '@/ui/Screen';
import { IconButton, Sticker, StickerButton } from '@/ui/Sticker';
import { StickerText, Txt } from '@/ui/Txt';

const ALL_IDS = PLAYERS.map((p) => p.id);
/** one full breath of the squad on the home screen */
const IDLE_MS = 2400;
/** the live 3D squad needs GL; tests have none and keep the card art */
const LIVE = process.env.NODE_ENV !== 'test';
const FADE_MS = 280;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function Tile({ label, sub, icon, fill, count = 0, tag, onPress }: { label: string; sub: string; icon: IconName; fill: ColorName; count?: number; tag?: string; onPress: () => void }) {
  return (
    <View style={styles.tile}>
      <StickerButton fill={fill} round="lg" onPress={onPress} accessibilityLabel={`${label}. ${sub}`} face={styles.tileFace}>
        <Icon name={icon} size={sizes.iconLarge} color="white" />
        <View style={styles.tileText}>
          <Txt font="display" size="large" color="white" shadow lines={1}>
            {label}
          </Txt>
          <Txt size="small" color="ink" lines={1}>
            {sub}
          </Txt>
        </View>
      </StickerButton>
      <Dot count={count} />
      {tag !== undefined && <Tag label={tag} fill="coral" textColor="white" style={styles.tileTag} />}
    </View>
  );
}

/** One squad member, gently bouncing on their toes. `beat` offsets them so the three never move as one. */
function Figure({ id, lead, clock, beat }: { id: string; lead: boolean; clock: SharedValue<number>; beat: number }) {
  const art = cardArt(id);
  const style = useAnimatedStyle(() => {
    const wave = Math.sin((clock.value + beat) * Math.PI * 2);
    return { transform: [{ translateY: -space.xs * 0.5 * (1 + wave) }, { scaleY: 1 + 0.012 * wave }] };
  });
  return (
    <Animated.View style={[styles.figure, lead ? styles.figureLead : styles.figureSide, style]}>
      {art !== undefined && <Image source={art} style={styles.fill} contentFit="contain" contentPosition="bottom" transition={0} />}
    </Animated.View>
  );
}

/** The three players in your squad, standing together: card art at once, then the live warm-up over it. */
function SquadStage({ ids, onPress }: { ids: string[]; onPress: () => void }) {
  // captain in the middle and a step in front
  const order = ids.length >= 3 ? [ids[1], ids[0], ids[2]] : ids;
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
  const setup = useMemo(() => squadStage(ids), [ids]);
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

  // the GL view reaches up under the header and out to the left edge so raised arms and a flying ball are never cut off
  const glW = rect ? rect.x + rect.w + space.lg : 1;
  const glH = window.height;
  const focus = useMemo(() => (rect ? { x: rect.x / glW, y: rect.y / glH, w: rect.w / glW, h: rect.h / glH } : { x: 0, y: 0, w: 1, h: 1 }), [rect, glW, glH]);
  const showLive = LIVE && focused && !failed && rect !== null;

  return (
    <View style={styles.stage} ref={area} onLayout={measure}>
      <Animated.View style={[styles.fill, cardStyle]}>
        <Pressable
          style={styles.cards}
          accessibilityRole="button"
          accessibilityLabel="Your squad. Tap to change it."
          onPress={() => {
            tapFeedback();
            onPress();
          }}>
          <View style={styles.floor} />
          <View style={styles.figures}>
            {order.map((id, i) => (
              <Figure key={id} id={id} lead={id === ids[0]} clock={clock} beat={i * 0.37} />
            ))}
          </View>
        </Pressable>
      </Animated.View>
      {showLive && rect && (
        <Animated.View style={[styles.live, { left: -rect.x, top: -rect.y, width: glW, height: glH }, liveStyle]}>
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

  if (!onboarded || squad.length === 0) return <Redirect href="/welcome" />;

  const today = dayKey();
  const packCount = Object.values(packs).reduce((a, n) => a + n, 0);
  const freePack = freePackDay !== today;
  const toClaim = missionsToClaim(currentMissions(missions, today));
  const have = countOwned(owned, ALL_IDS);
  const squadOvr = Math.round(squad.reduce((a, id) => a + playerOverall(mustPlayer(id), levelOf(owned[id] ?? 1)), 0) / squad.length);
  const go = (href: Href) => () => router.push(href);

  return (
    <Screen
      back={false}
      headerOnTop
      left={
        // the squad warms up behind the name: a hop or a tossed ball passes under it, and a tap on it reaches them
        <View pointerEvents="none">
          <StickerText size="title" color="sun">
            BUCKET SQUAD
          </StickerText>
        </View>
      }
      right={<IconButton name="gear" label="Settings" onPress={go('/settings')} />}>
      <View style={styles.row}>
        <View style={styles.left}>
          <SquadStage ids={squad} onPress={go('/squad')} />
          <Pressable
            style={styles.squadPill}
            accessibilityRole="button"
            accessibilityLabel={`Your squad, ${squadOvr} overall. Tap to change it.`}
            onPress={() => {
              tapFeedback();
              go('/squad')();
            }}>
            <Sticker fill="paper" round="pill" raise="low" face={styles.squadPillFace}>
              <Icon name="crown" size={sizes.iconSmall} color="sun" />
              <Txt font="display" size="body">
                YOUR SQUAD
              </Txt>
              <Tag label={`${squadOvr} OVR`} fill="ink" textColor="white" style={styles.center} />
            </Sticker>
          </Pressable>
        </View>
        <View style={styles.right}>
          <StickerButton fill="coral" round="xl" raise="high" onPress={go('/play')} accessibilityLabel="Play" face={styles.playFace}>
            <Icon name="play" size={sizes.iconHuge} color="white" />
            <StickerText size="big" color="white">
              PLAY
            </StickerText>
          </StickerButton>
          <View style={styles.grid}>
            <Tile label="PACKS" sub={packCount > 0 ? `${packCount} to open` : 'Card shop'} icon="pack" fill="grape" count={packCount} tag={freePack ? 'FREE PACK!' : undefined} onPress={go('/packs')} />
            <Tile label="SHELF" sub={`${have} of ${ALL_IDS.length} players`} icon="cards" fill="mint" count={fresh.length} onPress={go('/shelf')} />
          </View>
          <View style={styles.grid}>
            <Tile label="SQUAD" sub="Pick your three" icon="swap" fill="orange" onPress={go('/squad')} />
            <Tile label="MISSIONS" sub={toClaim > 0 ? 'Prizes waiting!' : 'New every day'} icon="target" fill="sunDeep" count={toClaim} onPress={go('/missions')} />
          </View>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: space.lg,
  },
  left: {
    flex: 1.05,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  stage: {
    flex: 1,
    alignSelf: 'stretch',
  },
  cards: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  live: {
    position: 'absolute',
  },
  floor: {
    position: 'absolute',
    bottom: space.xs,
    width: '86%',
    height: space.huge,
    borderRadius: space.huge,
    backgroundColor: color.scrimSoft,
  },
  figures: {
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingBottom: space.md,
  },
  figure: {
    width: '48%',
    transformOrigin: 'bottom',
  },
  figureLead: {
    height: '100%',
    zIndex: 2,
    marginHorizontal: '-17%',
  },
  figureSide: {
    height: '86%',
    zIndex: 1,
  },
  fill: {
    width: '100%',
    height: '100%',
  },
  squadPill: {
    marginTop: -space.md,
    marginBottom: space.xs,
  },
  squadPillFace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  center: {
    alignSelf: 'center',
  },
  right: {
    flex: 1,
    gap: space.sm,
    justifyContent: 'center',
    paddingBottom: space.xs,
  },
  playFace: {
    minHeight: sizes.buttonLarge + space.md,
    gap: space.md,
  },
  grid: {
    flexDirection: 'row',
    gap: space.sm,
  },
  tile: {
    flex: 1,
  },
  tileFace: {
    justifyContent: 'flex-start',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: sizes.buttonLarge,
    gap: space.sm,
  },
  tileText: {
    flex: 1,
  },
  tileTag: {
    position: 'absolute',
    top: -space.sm,
    left: space.sm,
    transform: [{ rotate: '-4deg' }],
  },
});
