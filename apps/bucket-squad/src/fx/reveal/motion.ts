/**
 * Small pieces of motion maths the reveals are built from. They all run on the UI thread, inside animated
 * styles, as functions of one clock in milliseconds: so a reveal is a timeline that can be jumped to its end.
 */

/** How far through `from`..`to` the time is, 0 before and 1 after. */
export function span(t: number, from: number, to: number): number {
  'worklet';
  if (t <= from) return 0;
  if (t >= to) return 1;
  return (t - from) / (to - from);
}

export function lerp(a: number, b: number, u: number): number {
  'worklet';
  return a + (b - a) * u;
}

export function easeOut(u: number): number {
  'worklet';
  const v = 1 - u;
  return 1 - v * v * v;
}

export function easeIn(u: number): number {
  'worklet';
  return u * u * u;
}

export function easeInOut(u: number): number {
  'worklet';
  return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
}

/** Overshoots a little and settles back: something snapping into place. */
export function backOut(u: number, s = 1.7): number {
  'worklet';
  const v = u - 1;
  return 1 + (s + 1) * v * v * v + s * v * v;
}

/** A bump: 0, up to 1 by `rise`, back to 0 by `rise + fall`, counted from `at`. */
export function bump(t: number, at: number, rise: number, fall: number): number {
  'worklet';
  if (t <= at || t >= at + rise + fall) return 0;
  return t < at + rise ? easeOut((t - at) / rise) : 1 - easeInOut((t - at - rise) / fall);
}

/**
 * A card turning over by squeezing it flat and opening it again: the width (`scaleX`) through zero, closing
 * from `at` and open again by `at + close + open`. The face swaps at the moment it is flat.
 */
export function flipWidth(t: number, at: number, close: number, open: number): number {
  'worklet';
  if (t <= at) return 1;
  if (t < at + close) return Math.max(0.001, 1 - easeIn((t - at) / close));
  if (t < at + close + open) return Math.max(0.001, backOut((t - at - close) / open, 1.2));
  return 1;
}

/** the tilt a revealed card rests at, as in the mockup */
export const REST_TILT = -4;

/** The card easing into its resting tilt over the last moments of a reveal. */
export function restTilt(t: number, from: number, to: number): number {
  'worklet';
  return REST_TILT * easeInOut(span(t, from, to));
}

/** A steady wobble for trembling and shaking: smooth, never repeating exactly, always between -1 and 1. */
export function wobble(t: number, speed: number, seed: number): number {
  'worklet';
  const a = t * speed + seed;
  return (Math.sin(a) + Math.sin(a * 2.31 + 1.7) * 0.6 + Math.sin(a * 3.73 + 4.1) * 0.3) / 1.9;
}

/** A neon tube stuttering on: dark, a few flickers, then lit for good by `ms` after `at`. */
export function flicker(t: number, at: number, ms: number): number {
  'worklet';
  const u = (t - at) / ms;
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  // on and off at fixed points, like the hum in the neonOn sound
  if (u < 0.08) return 0.85;
  if (u < 0.16) return 0.08;
  if (u < 0.2) return 0.7;
  if (u < 0.3) return 0.12;
  if (u < 0.44) return 0.95;
  if (u < 0.52) return 0.3;
  return 1;
}
