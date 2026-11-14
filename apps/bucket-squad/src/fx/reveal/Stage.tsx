/**
 * One card's reveal on the stage, in the three layers the page stacks: the room (under everything), the card
 * with what moves with it, and what falls over everything (confetti).
 *
 * The page keeps the next card's reveal on the stage before it is needed, hidden and with its clock parked
 * before its start, so a tap on NEXT PLAYER only switches it on: nothing is built at the moment of the tap.
 * The same layers then carry the card back down into its place in the row once it is done. A layer's role
 * changes only the few views that wrap it; what the reveal draws inside is never drawn again for it.
 */

import { memo, useLayoutEffect, useMemo, type ComponentType } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, type SharedValue } from 'react-native-reanimated';

import { px } from '@/theme/tokens';
import { ArcadeCard } from '@/ui/arcade/Card';
import type { OpenLayout } from './layout';
import { REST_TILT, easeInOut, lerp, span } from './motion';
import { Afterglow, around } from './pieces';
import type { CardPlan } from './plan';
import { ARRIVE } from './times';
import type { CardProps, Reveal, StageProps } from './types';

/** what a card's layers are doing: waiting hidden for their turn, playing, or carrying the card back to the row */
export type StageRole = 'hidden' | 'live' | 'leaving';

/**
 * The values one card's layers move by: its reveal's clock, its glide aside, its trip back to the row, and (for a
 * copy that levels the player up) its frame upgrading in place, 0 to 1.
 */
export interface StageValues {
  clock: SharedValue<number>;
  glide: SharedValue<number>;
  leave: SharedValue<number>;
  levelUp: SharedValue<number>;
}

/** A set of stage values, parked: the clock before the card has set off, nothing glided, nothing left, no level up yet. */
export function useStageValues(): StageValues {
  const clock = useSharedValue(-ARRIVE);
  const glide = useSharedValue(0);
  const leave = useSharedValue(0);
  const levelUp = useSharedValue(0);
  return useMemo(() => ({ clock, glide, leave, levelUp }), [clock, glide, leave, levelUp]);
}

/**
 * How many sets of stage values the page keeps. At most four cards are on the stage at once (one dropping back
 * into the row, one playing, and the next two waiting their turn), and
 * card `i` always uses set `i % STAGE_SETS`, so no two of them ever share one.
 */
export const STAGE_SETS = 4;

/** Put a card's values back to before its start, ready for its reveal. */
export function parkStage(v: StageValues, reduced: boolean): void {
  v.clock.set(-ARRIVE);
  v.glide.set(reduced ? 1 : 0);
  v.leave.set(0);
  v.levelUp.set(0);
}

/** how high a card arcs on its way in (worked out here: a worklet can't call `px`) */
const ARRIVE_ARC = px(36);

/** where a card's reveal plays: the middle of the stage, or where the card rests when the phone asks for less motion */
export function stageOrigin(lay: OpenLayout, reduced: boolean) {
  return reduced ? lay.rest : lay.middle;
}

function useStageProps(clock: SharedValue<number>, lay: OpenLayout, reduced: boolean): StageProps {
  const at = stageOrigin(lay, reduced);
  return useMemo(() => ({ clock, width: lay.card.width, height: lay.card.height, screen: lay.screen, at }), [clock, lay, at]);
}

/** One of a reveal's own layers, drawn once and left alone while the page around it changes. */
const Part = memo(function Part({ part: P, stage }: { part: ComponentType<StageProps>; stage: StageProps }) {
  return <P {...stage} />;
});

/** The card's face, built once: a level up shows the level it had until its beat upgrades the frame in place. */
const CardPart = memo(function CardPart({ part: P, stage, plan, levelUp }: { part: ComponentType<CardProps>; stage: StageProps; plan: CardPlan; levelUp: SharedValue<number> }) {
  const up = plan.kind === 'levelUp';
  const face = useMemo(
    () => <ArcadeCard player={plan.player} level={plan.level} levelFrom={up ? plan.levelBefore : undefined} levelUp={up ? levelUp : undefined} width={stage.width} shine={plan.rarity === 'epic' || plan.rarity === 'legend'} />,
    [plan, stage.width, up, levelUp],
  );
  return <P {...stage} face={face} />;
});

const Glow = memo(Afterglow);

interface LayerProps {
  role: StageRole;
  reveal: Reveal;
  values: StageValues;
  lay: OpenLayout;
  reduced: boolean;
}

/** The room the reveal dims, lights and fills with bulbs: fixed to the screen, under the card. */
export const StageRoom = memo(function StageRoom({ role, reveal, values, lay, reduced }: LayerProps) {
  const stage = useStageProps(values.clock, lay, reduced);
  if (!reveal.Room) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, role !== 'live' && styles.off]}>
      <Part part={reveal.Room} stage={stage} />
    </View>
  );
});

/** What falls over everything: fixed to the screen, over the card and the row. */
export const StageOver = memo(function StageOver({ role, reveal, values, lay, reduced }: LayerProps) {
  const stage = useStageProps(values.clock, lay, reduced);
  if (!reveal.Over) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, role !== 'live' && styles.off]}>
      <Part part={reveal.Over} stage={stage} />
    </View>
  );
});

/**
 * The card itself, rising from its place in the row to the middle, with the light behind it and the bursts in
 * front; it glides aside for what the page says about the player, and at the end drops back into its place.
 */
export const StagePoint = memo(function StagePoint({ role, reveal, values, lay, reduced, plan, index }: LayerProps & { plan: CardPlan; index: number }) {
  const { clock, glide, leave } = values;
  const stage = useStageProps(clock, lay, reduced);
  // a card put on the stage ahead of its turn starts parked; nothing of it shows while it waits
  useLayoutEffect(() => {
    if (role === 'hidden') parkStage(values, reduced);
  }, [role, values, reduced]);
  const origin = stage.at;
  const from = lay.slots[index] ?? lay.middle;
  const fromX = reduced ? 0 : from.x - origin.x;
  const fromY = reduced ? 0 : from.y - origin.y;
  const small = reduced ? 1 : lay.slot.width / lay.card.width;
  const glideX = lay.rest.x - origin.x;
  const toX = from.x - lay.rest.x;
  const toY = from.y - lay.rest.y;
  const toScale = lay.slot.width / lay.card.width;

  // aside for the words, then (once it is done) back down into its place in the row, losing its resting tilt
  const move = useAnimatedStyle(() => {
    const u = leave.value;
    const e = easeInOut(u);
    return {
      opacity: u >= 1 ? 0 : 1 - span(u, 0.75, 1),
      transform: [{ translateX: glideX * glide.value + toX * e }, { translateY: toY * e }, { rotate: `${-REST_TILT * e}deg` }, { scale: lerp(1, toScale, e) }],
    };
  });
  const arrive = useAnimatedStyle(() => {
    const u = span(clock.value, -ARRIVE, 0);
    const e = easeInOut(u);
    return { opacity: Math.min(1, u * 6), transform: [{ translateX: fromX * (1 - e) }, { translateY: fromY * (1 - e) - ARRIVE_ARC * Math.sin(Math.PI * u) }, { scale: lerp(small, 1, e) }] };
  });
  const extras = role !== 'live' && styles.off;
  return (
    <View pointerEvents="none" style={[styles.point, { left: origin.x, top: origin.y }, role === 'hidden' && styles.off]}>
      <Animated.View style={[styles.point, move]}>
        <View style={[styles.point, extras]}>
          {reveal.Behind && <Part part={reveal.Behind} stage={stage} />}
          <Glow clock={clock} from={reveal.flipAt} rarity={plan.rarity} width={lay.card.width} height={lay.card.height} />
        </View>
        <Animated.View style={[around(lay.card.width, lay.card.height), arrive]}>
          <CardPart part={reveal.Card} stage={stage} plan={plan} levelUp={values.levelUp} />
        </Animated.View>
        {reveal.Front && (
          <View style={[styles.point, extras]}>
            <Part part={reveal.Front} stage={stage} />
          </View>
        )}
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  point: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  // out of sight but built. A browser keeps a layer for everything it draws, even unseen, and a few hundred
  // waiting bulbs and sparks can run its software renderer out of tiles, so there it is not drawn at all; a
  // phone keeps the views made and simply does not show them
  off: Platform.OS === 'web' ? { display: 'none' } : { opacity: 0 },
});
