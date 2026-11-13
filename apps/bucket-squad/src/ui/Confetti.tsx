/** A burst of paper confetti from a point: one shared clock drives every piece. */

import { useEffect, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { party, px, radius, space } from '@/theme/tokens';

interface PieceSpec {
  angle: number;
  reach: number;
  size: number;
  tint: string;
  spin: number;
  fall: number;
}

function Piece({ t, spec }: { t: SharedValue<number>; spec: PieceSpec }) {
  const style = useAnimatedStyle(() => {
    const u = t.value;
    const out = 1 - (1 - u) * (1 - u);
    return {
      opacity: u <= 0 ? 0 : u < 0.7 ? 1 : Math.max(0, (1 - u) / 0.3),
      transform: [{ translateX: Math.cos(spec.angle) * spec.reach * out }, { translateY: Math.sin(spec.angle) * spec.reach * out + spec.fall * u * u }, { rotate: `${spec.spin * u}deg` }],
    };
  });
  return <Animated.View style={[styles.piece, { width: spec.size, height: spec.size * 0.6, backgroundColor: spec.tint }, style]} />;
}

/**
 * Fires once each time `burst` changes to a new non-zero number.
 * Place it where the burst should start; pieces fly out from its centre,
 * as far as `reach` (a design size, scaled to the screen like the tokens).
 */
export function Confetti({ burst, count = 30, reach = 220, colors = party, style }: { burst: number; count?: number; reach?: number; colors?: readonly string[]; style?: StyleProp<ViewStyle> }) {
  const t = useSharedValue(0);
  const specs = useMemo<PieceSpec[]>(() => {
    const out: PieceSpec[] = [];
    const far = px(reach);
    // a fixed spread (no randomness) so the burst looks the same, and full, every time
    for (let i = 0; i < count; i++) {
      const k = (i * 0.618034) % 1;
      const k2 = (i * 0.754877) % 1;
      out.push({
        angle: -Math.PI / 2 + (k - 0.5) * Math.PI * 1.7,
        reach: far * (0.45 + 0.55 * k2),
        size: space.sm + space.sm * k2,
        tint: colors[i % colors.length],
        spin: (k - 0.5) * 1400,
        fall: far * (0.9 + 0.8 * k),
      });
    }
    return out;
  }, [count, reach, colors]);

  useEffect(() => {
    if (burst === 0) return;
    t.set(0);
    t.set(withTiming(1, { duration: 1500, easing: Easing.linear }));
  }, [burst, t]);

  return (
    <View pointerEvents="none" style={[styles.root, style]}>
      {specs.map((s, i) => (
        <Piece key={i} t={t} spec={s} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  piece: {
    position: 'absolute',
    borderRadius: radius.sm / 4,
  },
});
