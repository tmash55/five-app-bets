/**
 * The row of places under the card, one per card in the pack: "?" for a card still to come, lit and lifted
 * for the one being revealed (in its rarity's colours once it is face-up), and a check in its rarity's colour
 * for each one done.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import type { Rarity } from '@/data/types';
import { arcade, halo, night, rarityPaint, tube } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { LineIcon } from '@/ui/arcade/LineIcon';
import { Print } from '@/ui/arcade/Type';
import type { OpenLayout } from './layout';
import { span } from './motion';
import { around } from './pieces';

export type SlotState = 'waiting' | 'current' | 'shown' | 'done';

const LIFT = px(5);

const Slot = memo(function Slot({ state, rarity, width, height }: { state: SlotState; rarity: Rarity; width: number; height: number }) {
  const rp = rarityPaint[rarity];
  const tb = tube[rp.tube];
  if (state === 'done') {
    return (
      <View style={[styles.slot, { width, height, borderColor: tb.glass, boxShadow: [halo(tb.glass, 6, 0.5)] }]}>
        <LineIcon name="check" size={px(14)} color={tb.soft} weight={3.6} />
      </View>
    );
  }
  if (state === 'current' || state === 'shown') {
    const colors = state === 'shown' ? ([rp.halo[0], rp.halo[1]] as const) : ([tube.cyan.tint, tube.cyan.glass] as const);
    const glow = state === 'shown' ? tb.soft : tube.cyan.glass;
    return (
      <View style={[styles.slot, styles.lit, { width, height, transform: [{ translateY: -LIFT }], boxShadow: [halo(glow, 10, 0.95)] }]}>
        <LinearGradient colors={colors} start={SLANT_A} end={SLANT_B} style={[StyleSheet.absoluteFill, styles.fill]} />
      </View>
    );
  }
  return (
    <View style={[styles.slot, { width, height, borderColor: tube.cyan.glass, boxShadow: [halo(tube.cyan.glass, 6, 0.6)] }]}>
      <Print face="bold" size="sign" color={tube.cyan.soft} style={styles.mark}>
        ?
      </Print>
    </View>
  );
});

/** A slot's "?" coming on as its card lands, on the tear's clock. */
function Landing({ clock, at, children }: { clock: SharedValue<number>; at: number; children: React.ReactNode }) {
  const style = useAnimatedStyle(() => {
    const u = span(clock.value, at - 40, at + 90);
    return { opacity: u, transform: [{ scale: 1 + 0.25 * (1 - u) * (u > 0 ? 1 : 0) }] };
  });
  return <Animated.View style={style}>{children}</Animated.View>;
}

export interface SlotsProps {
  lay: OpenLayout;
  rarities: readonly Rarity[];
  states: readonly SlotState[];
  /** while the pack tears: the tear's clock, and when each card lands in its place */
  landing?: { clock: SharedValue<number>; at: readonly number[] };
}

export function Slots({ lay, rarities, states, landing }: SlotsProps) {
  const { width, height } = lay.slot;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {lay.slots.map((p, i) => {
        const slot = <Slot state={states[i] ?? 'waiting'} rarity={rarities[i] ?? 'common'} width={width} height={height} />;
        return (
          <View key={i} style={[styles.place, { left: p.x, top: p.y }]}>
            <View style={around(width, height)}>{landing ? <Landing clock={landing.clock} at={landing.at[i] ?? 0}>{slot}</Landing> : slot}</View>
          </View>
        );
      })}
    </View>
  );
}

const SLANT_A = { x: 0.2, y: 0 } as const;
const SLANT_B = { x: 0.8, y: 1 } as const;

const styles = StyleSheet.create({
  place: {
    position: 'absolute',
  },
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.onTube,
    borderWidth: arcade.outline,
    borderColor: night.line,
    borderRadius: arcade.rPlate,
  },
  lit: {
    borderColor: night.white,
  },
  fill: {
    borderRadius: arcade.rPlate - arcade.outline,
  },
  mark: {
    marginTop: -px(1),
  },
});
