/** A burst of lit sparks, for a win or a prize: the arcade's own confetti. One shared clock drives every spark. */

import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { halo, tube as tubes } from '@/theme/arcade';
import { px } from '@/theme/tokens';

/**
 * A burst around a box goes up and out to the sides, and leaves out the 150 degrees around straight down,
 * where the buttons under a pop-up and under a scoreboard are. Angles go clockwise from the right.
 */
const DEG = Math.PI / 180;
const AROUND_FROM = 165 * DEG;
const AROUND_SPAN = 210 * DEG;

const COLOURS: readonly string[] = [tubes.gold.glass, tubes.pink.glass, tubes.cyan.glass, tubes.green.glass, tubes.violet.glass, tubes.amber.glass];

interface SparkSpec {
  angle: number;
  /** how far from the middle it starts: nothing for a burst from a point, the box's edge for one around a box */
  start: number;
  reach: number;
  long: number;
  colour: string;
  /** how far it drops at the end, as if it had weight */
  fall: number;
}

function Spark({ t, spec }: { t: SharedValue<number>; spec: SparkSpec }) {
  const style = useAnimatedStyle(() => {
    const u = t.value;
    const out = spec.start + spec.reach * (1 - (1 - u) * (1 - u) * (1 - u));
    return {
      opacity: u <= 0 ? 0 : u < 0.6 ? 1 : Math.max(0, (1 - u) / 0.4),
      transform: [
        { translateX: Math.cos(spec.angle) * out },
        { translateY: Math.sin(spec.angle) * out + spec.fall * u * u },
        { rotate: `${(spec.angle * 180) / Math.PI}deg` },
        // a long streak as it leaves, a dot by the time it fades
        { scaleX: 1.6 - u * 1.1 },
      ],
    };
  });
  return <Animated.View style={[styles.spark, { width: spec.long, height: spec.long * 0.34, borderRadius: spec.long * 0.17, backgroundColor: spec.colour, boxShadow: [halo(spec.colour, 6, 0.9)] }, style]} />;
}

/** where a line from the middle of a box, at this angle, leaves the box */
function edge(angle: number, halfW: number, halfH: number): number {
  const c = Math.abs(Math.cos(angle));
  const s = Math.abs(Math.sin(angle));
  return Math.min(c > 1e-6 ? halfW / c : Infinity, s > 1e-6 ? halfH / s : Infinity);
}

export interface SparksProps {
  burst: number;
  count?: number;
  reach?: number;
  colours?: readonly string[];
  /**
   * Fill the box it is put in and fly outward from its edges all the way round, so the burst frames the box
   * and never crosses what is inside it (a pop-up's words and buttons). Without it the sparks fly up and out
   * from one point: put that behind what they must not cover.
   */
  around?: boolean;
  /** from a point: how wide the fan is, in degrees, centred straight up (all but straight down by default) */
  spread?: number;
  /** from a point: how heavy the sparks are, as a share of `reach` (they drop this far by the end) */
  weight?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Fires once each time `burst` changes to a new number above zero.
 * The sparks fly as far as `reach` (a design size, scaled to the screen like the tokens).
 */
export function Sparks({ burst, count = 36, reach = 240, colours = COLOURS, around, spread = 342, weight = 0.5, style }: SparksProps) {
  const t = useSharedValue(0);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const ready = !around || box.width > 0;
  const specs = useMemo<SparkSpec[]>(() => {
    const far = px(reach);
    const list: SparkSpec[] = [];
    // a fixed spread (no randomness) so the burst looks the same, and full, every time
    for (let i = 0; i < count; i++) {
      const k = (i * 0.618034) % 1;
      const k2 = (i * 0.754877) % 1;
      const long = px(12) + px(12) * k2;
      if (around) {
        // up and out to the sides only (see AROUND_FROM)
        const angle = AROUND_FROM + k * AROUND_SPAN;
        // a streak's own length clear of the edge, so not even its tail is over the box
        list.push({ angle, start: edge(angle, box.width / 2, box.height / 2) + long, reach: far * (0.25 + 0.45 * k2), long, colour: colours[i % colours.length], fall: 0 });
      } else {
        list.push({ angle: -Math.PI / 2 + (k - 0.5) * spread * DEG, start: 0, reach: far * (0.4 + 0.6 * k2), long, colour: colours[i % colours.length], fall: far * weight * (0.6 + 0.8 * k) });
      }
    }
    return list;
  }, [count, reach, colours, around, spread, weight, box.width, box.height]);

  useEffect(() => {
    if (burst === 0 || !ready) return;
    t.set(0);
    t.set(withTiming(1, { duration: 1300, easing: Easing.linear }));
  }, [burst, t, ready]);

  return (
    <View
      pointerEvents="none"
      style={[around ? styles.around : styles.point, style]}
      onLayout={
        around
          ? (e) => {
              const width = Math.round(e.nativeEvent.layout.width);
              const height = Math.round(e.nativeEvent.layout.height);
              if (width !== box.width || height !== box.height) setBox({ width, height });
            }
          : undefined
      }>
      {ready && specs.map((s, i) => <Spark key={i} t={t} spec={s} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  point: {
    position: 'absolute',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  around: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spark: {
    position: 'absolute',
  },
});
