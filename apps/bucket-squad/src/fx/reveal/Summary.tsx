/**
 * The haul: every card of the pack in a row, each popping in with its tag, under a lit headline, with the way
 * to open another and the way out.
 */

import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { rarityPaint, tube } from '@/theme/arcade';
import { px, size as sizes, space } from '@/theme/tokens';
import { GhostButton, GoldButton } from '@/ui/arcade/Buttons';
import { ArcadeCard } from '@/ui/arcade/Card';
import { Bloom } from '@/ui/arcade/Room';
import { Tag } from '@/ui/arcade/Surface';
import { Glow } from '@/ui/arcade/Type';
import type { OpenLayout } from './layout';
import { backOut, span } from './motion';
import type { CardPlan } from './plan';
import { around } from './pieces';

/** each card pops in this long after the one before it */
export const POP_GAP = 120;
const POP = 420;
/** the biggest a card gets here, and the gap between cards */
const MOST = px(150);
const GAP = px(16);
/** room the headline, the tags and the buttons take from the card's height */
const ROOM = px(186);
/** how far each card rises as it pops in (worked out here: a worklet can't call `px`) */
const POP_RISE = px(26);

function Popping({ clock, at, children }: { clock: SharedValue<number>; at: number; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => {
    const u = span(clock.value, at, at + POP);
    return { opacity: Math.min(1, u * 2.5), transform: [{ translateY: (1 - u) * POP_RISE }, { scale: 0.6 + 0.4 * backOut(u, 2) }] };
  });
  return <Animated.View style={[styles.item, style]}>{children}</Animated.View>;
}

export interface SummaryProps {
  clock: SharedValue<number>;
  plans: readonly CardPlan[];
  lay: OpenLayout;
  first: boolean;
  /** packs of this kind still to open: offers another */
  another: number;
  onAgain: () => void;
  onDone: () => void;
}

export function Summary({ clock, plans, lay, first, another, onAgain, onDone }: SummaryProps) {
  const n = Math.max(1, plans.length);
  const across = lay.screen.width - lay.edge.left - lay.edge.right;
  const width = Math.floor(Math.min(MOST, (across - GAP * (n - 1)) / n, (lay.frame.height - ROOM) / sizes.cardRatio));
  const height = Math.round(width * sizes.cardRatio);
  const headline = useAnimatedStyle(() => {
    const u = span(clock.value, 0, 360);
    return { opacity: u, transform: [{ scale: 0.85 + 0.15 * backOut(u) }] };
  });
  const buttons = useAnimatedStyle(() => ({ opacity: span(clock.value, n * POP_GAP + 200, n * POP_GAP + 500) }));
  return (
    <View pointerEvents="box-none" style={[styles.root, { top: lay.frame.top, height: lay.frame.height, paddingLeft: lay.edge.left, paddingRight: lay.edge.right }]}>
      <Animated.View style={headline}>
        <Glow face="display" size="title" tube={first ? 'pink' : 'gold'} track="wide" center room={across * 0.7}>
          {first ? 'YOUR FIRST PLAYERS!' : 'NICE PULLS!'}
        </Glow>
      </Animated.View>
      <View style={[styles.row, { gap: GAP }]}>
        {plans.map((p, i) => {
          const glow = tube[rarityPaint[p.rarity].tube];
          return (
            <Popping key={i} clock={clock} at={200 + i * POP_GAP}>
              <View pointerEvents="none" style={[styles.point, { left: width / 2, top: height / 2 }]}>
                <View style={around(width * 1.9)}>
                  <Bloom size={width * 1.9} color={glow.soft} alpha={p.rarity === 'common' ? 0.25 : 0.55} />
                </View>
              </View>
              <ArcadeCard player={p.player} level={p.level} width={width} shine={p.rarity === 'legend' || p.rarity === 'epic'} />
              <Tag label={p.label.text} tube={p.label.tube} small={width < px(120)} style={styles.tag} />
            </Popping>
          );
        })}
      </View>
      <Animated.View pointerEvents="box-none" style={[styles.buttons, buttons]}>
        {another > 0 && !first && <GhostButton label={`OPEN ANOTHER (${another})`} icon="pack" tube="pink" onPress={onAgain} />}
        <GoldButton label={first ? "LET'S PLAY!" : 'DONE'} size="small" onPress={onDone} style={styles.done} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  item: {
    alignItems: 'center',
    gap: space.sm,
  },
  point: {
    position: 'absolute',
  },
  tag: {
    alignSelf: 'center',
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  done: {
    minWidth: px(170),
  },
});
