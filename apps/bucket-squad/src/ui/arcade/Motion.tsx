/**
 * Motion the menu pages share. Things arrive with a short pop or slide, and a lit thing that is
 * waiting for a tap breathes. Transforms and opacity only, on the UI thread.
 */

import { useEffect } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming } from 'react-native-reanimated';

import { px } from '@/theme/tokens';

/** how far a thing slides in from */
const SLIDE = px(18);
/** a quick spring with a little bounce at the end: a pop, not a wobble */
const POP = { damping: 15, stiffness: 200, mass: 0.8 } as const;

export type ArriveFrom = 'pop' | 'up' | 'left' | 'right';

export interface ArriveProps {
  children?: React.ReactNode;
  /** ms after the page opens */
  delay?: number;
  from?: ArriveFrom;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'box-none' | 'none' | 'auto' | 'box-only';
  /** where it ends up, for something else to be placed around it */
  onLayout?: (e: LayoutChangeEvent) => void;
}

/** Something that pops or slides into place when the page opens. */
export function Arrive({ children, delay = 0, from = 'pop', style, pointerEvents, onLayout }: ArriveProps) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(delay, withSpring(1, POP)));
  }, [t, delay]);
  const anim = useAnimatedStyle(() => {
    const v = t.value;
    const opacity = Math.min(1, v * 1.6);
    if (from === 'pop') return { opacity, transform: [{ scale: 0.84 + 0.16 * v }] };
    const d = SLIDE * (1 - v);
    if (from === 'up') return { opacity, transform: [{ translateY: d }] };
    return { opacity, transform: [{ translateX: from === 'left' ? -d : d }] };
  });
  return (
    <Animated.View pointerEvents={pointerEvents} onLayout={onLayout} style={[style, anim]}>
      {children}
    </Animated.View>
  );
}

export interface BreatheProps {
  children?: React.ReactNode;
  /** off: it holds still at full strength */
  on?: boolean;
  /** how far the light dips, as a share */
  depth?: number;
  /** how much it swells at the top of a breath */
  swell?: number;
  /** one breath in, in ms */
  ms?: number;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'box-none' | 'none' | 'auto' | 'box-only';
}

/** A slow rise and fall of light: "this one is waiting for you". */
export function Breathe({ children, on = true, depth = 0.35, swell = 0, ms = 1100, style, pointerEvents }: BreatheProps) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(on ? withRepeat(withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin) }), -1, true) : withTiming(0, { duration: 160 }));
  }, [t, on, ms]);
  const anim = useAnimatedStyle(() => ({ opacity: 1 - depth * t.value, transform: [{ scale: 1 + swell * t.value }] }));
  return (
    <Animated.View pointerEvents={pointerEvents} style={[style, anim]}>
      {children}
    </Animated.View>
  );
}
