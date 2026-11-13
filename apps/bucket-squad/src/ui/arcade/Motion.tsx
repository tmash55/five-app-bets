/**
 * Motion the menu pages share. Things arrive with a short pop or slide, and a lit thing that is
 * waiting for a tap breathes. Transforms and opacity only, on the UI thread.
 */

import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';
import Animated, { Easing, ReduceMotion, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';

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

/** a page's content rising into place as the page comes to the front, and how long it takes */
const PAGE_RISE = px(10);
const PAGE_IN = 280;
/** with less motion asked for it only fades, and quicker */
const PAGE_FADE = 180;

/**
 * The style for a page's content as the page comes to the front, the first time and every time the child comes
 * back to it: up a little and out of the dark, under a frame that stays put. A phone that asks for less motion
 * gets only the fade.
 */
export function usePageIn() {
  const calm = useReducedMotion();
  const t = useSharedValue(0);
  useFocusEffect(
    useCallback(() => {
      t.set(0);
      t.set(withTiming(1, { duration: calm ? PAGE_FADE : PAGE_IN, easing: Easing.out(Easing.cubic), reduceMotion: ReduceMotion.Never }));
    }, [t, calm]),
  );
  return useAnimatedStyle(() => (calm ? { opacity: t.value } : { opacity: t.value, transform: [{ translateY: PAGE_RISE * (1 - t.value) }] }));
}

export interface BumpProps {
  children?: React.ReactNode;
  /** changes whenever it should bump: a new amount, a new line landed (not on the first draw) */
  beat: number | string;
  /** how much it swells */
  amount?: number;
  style?: StyleProp<ViewStyle>;
  pointerEvents?: 'box-none' | 'none' | 'auto' | 'box-only';
}

/** A quick swell and settle each time `beat` changes: "this just went up". A phone that asks for less motion keeps it still. */
export function Bump({ children, beat, amount = 0.12, style, pointerEvents }: BumpProps) {
  const t = useSharedValue(0);
  const first = useRef(beat);
  useEffect(() => {
    if (first.current === beat) return;
    first.current = beat;
    t.set(withSequence(withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }), withSpring(0, POP)));
  }, [t, beat]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: 1 + amount * t.value }] }));
  return (
    <Animated.View pointerEvents={pointerEvents} style={[style, anim]}>
      {children}
    </Animated.View>
  );
}

/** a bouncier spring than the pop: something that has just been found jumps a little past its size and back */
const FOUND = { damping: 9, stiffness: 210, mass: 0.7 } as const;

/** Something new that has just been found: it springs up from small when the page opens, a beat after the page itself. */
export function Found({ children, delay = 260, style }: { children?: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withDelay(delay, withSpring(1, FOUND)));
  }, [t, delay]);
  const anim = useAnimatedStyle(() => ({ opacity: Math.min(1, t.value * 2), transform: [{ scale: 0.55 + 0.45 * t.value }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}
