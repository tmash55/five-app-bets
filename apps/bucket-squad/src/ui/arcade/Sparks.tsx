/** A burst of lit sparks from a point, for a win or a prize: the arcade's own confetti. One shared clock drives every spark. */

import { useEffect, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { halo, tube as tubes } from '@/theme/arcade';
import { px } from '@/theme/tokens';

const COLOURS: readonly string[] = [tubes.gold.glass, tubes.pink.glass, tubes.cyan.glass, tubes.green.glass, tubes.violet.glass, tubes.amber.glass];

interface SparkSpec {
  angle: number;
  reach: number;
  long: number;
  colour: string;
  /** how far it drops at the end, as if it had weight */
  fall: number;
}

function Spark({ t, spec }: { t: SharedValue<number>; spec: SparkSpec }) {
  const style = useAnimatedStyle(() => {
    const u = t.value;
    const out = 1 - (1 - u) * (1 - u) * (1 - u);
    return {
      opacity: u <= 0 ? 0 : u < 0.6 ? 1 : Math.max(0, (1 - u) / 0.4),
      transform: [
        { translateX: Math.cos(spec.angle) * spec.reach * out },
        { translateY: Math.sin(spec.angle) * spec.reach * out + spec.fall * u * u },
        { rotate: `${(spec.angle * 180) / Math.PI}deg` },
        // a long streak as it leaves, a dot by the time it fades
        { scaleX: 1.6 - u * 1.1 },
      ],
    };
  });
  return <Animated.View style={[styles.spark, { width: spec.long, height: spec.long * 0.34, borderRadius: spec.long * 0.17, backgroundColor: spec.colour, boxShadow: [halo(spec.colour, 6, 0.9)] }, style]} />;
}

/**
 * Fires once each time `burst` changes to a new number above zero.
 * Place it where the burst should start; sparks fly out from its centre,
 * as far as `reach` (a design size, scaled to the screen like the tokens).
 */
export function Sparks({ burst, count = 36, reach = 240, colours = COLOURS, style }: { burst: number; count?: number; reach?: number; colours?: readonly string[]; style?: StyleProp<ViewStyle> }) {
  const t = useSharedValue(0);
  const specs = useMemo<SparkSpec[]>(() => {
    const far = px(reach);
    const list: SparkSpec[] = [];
    // a fixed spread (no randomness) so the burst looks the same, and full, every time
    for (let i = 0; i < count; i++) {
      const k = (i * 0.618034) % 1;
      const k2 = (i * 0.754877) % 1;
      list.push({
        angle: -Math.PI / 2 + (k - 0.5) * Math.PI * 1.9,
        reach: far * (0.4 + 0.6 * k2),
        long: px(12) + px(12) * k2,
        colour: colours[i % colours.length],
        fall: far * (0.3 + 0.4 * k),
      });
    }
    return list;
  }, [count, reach, colours]);

  useEffect(() => {
    if (burst === 0) return;
    t.set(0);
    t.set(withTiming(1, { duration: 1300, easing: Easing.linear }));
  }, [burst, t]);

  return (
    <View pointerEvents="none" style={[styles.root, style]}>
      {specs.map((s, i) => (
        <Spark key={i} t={t} spec={s} />
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
  spark: {
    position: 'absolute',
  },
});
