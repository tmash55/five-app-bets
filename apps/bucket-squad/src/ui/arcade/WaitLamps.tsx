/** Three lamps lit one after the other, round and round: the game is waiting for an answer and has not stopped. */

import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';

import { halo, tubeOf, type Tube, type TubeName } from '@/theme/arcade';
import { px } from '@/theme/tokens';

const LAMPS = 3;
/** once round all the lamps */
const TURN_MS = 1150;

function Lamp({ index, turn, tube: tb, size }: { index: number; turn: SharedValue<number>; tube: Tube; size: number }) {
  const anim = useAnimatedStyle(() => {
    // how long ago this lamp's turn was, as a share of the round: bright at its turn, dim again before the next
    const since = (turn.value - index / LAMPS + 1) % 1;
    const lit = Math.max(0, 1 - since * 1.9);
    return { opacity: 0.22 + 0.78 * lit, transform: [{ scale: 0.82 + 0.3 * lit }] };
  });
  return <Animated.View style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: tb.glass, boxShadow: [halo(tb.glass, size * 0.8, 0.9)] }, anim]} />;
}

export function WaitLamps({ tube: t = 'violet', size = px(10), label = 'Working on it', style }: { tube?: TubeName | Tube; size?: number; /** what a screen reader says */ label?: string; style?: StyleProp<ViewStyle> }) {
  const tb = tubeOf(t);
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.set(withRepeat(withTiming(1, { duration: TURN_MS, easing: Easing.linear }), -1, false));
  }, [turn]);
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} style={[styles.row, { gap: size * 0.9 }, style]}>
      {Array.from({ length: LAMPS }, (_, i) => (
        <Lamp key={i} index={i} turn={turn} tube={tb} size={size} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
