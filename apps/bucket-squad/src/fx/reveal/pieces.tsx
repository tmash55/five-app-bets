/**
 * The pieces the reveals are built from: the card's two sides, rings of light, sparks, sparkles, a starburst,
 * confetti, a beam and a glint. Every piece takes the reveal's clock and the moment it plays at, and works out
 * its own look from the clock on the UI thread: one clock drives them all, the way the match's confetti works.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withTiming, type SharedValue } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient as SvgGradient, Polygon, Stop } from 'react-native-svg';

import { fade, halo, inner, night, rarityPaint, tube as tubes } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { LineIcon } from '@/ui/arcade/LineIcon';
import { Bloom, Rays, useSvgId } from '@/ui/arcade/Room';
import type { Rarity } from '@/data/types';
import { easeIn, easeInOut, easeOut, lerp, span } from './motion';

/** A box of `w` x `h` with its middle on the point it is placed at. */
export function around(w: number, h = w): ViewStyle {
  return { position: 'absolute', left: -w / 2, top: -h / 2, width: w, height: h };
}

/** A clock that runs from 0 to `ms` and round again, for things that keep moving while a page is open. */
export function useLoop(ms: number): SharedValue<number> {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(0);
    t.set(withRepeat(withTiming(ms, { duration: ms, easing: Easing.linear }), -1, false));
    return () => cancelAnimation(t);
  }, [t, ms]);
  return t;
}

/**
 * The card's two sides, one over the other: the back until `flipAt`, the face from then on. Both are always
 * there, so the face's picture has long loaded when it is needed, and a reveal swaps them while the card is
 * turned edge-on and neither can be seen.
 */
export function Sides({ clock, flipAt, width, height, back, face }: { clock: SharedValue<number>; flipAt: number; width: number; height: number; back: React.ReactNode; face: React.ReactNode }) {
  const backStyle = useAnimatedStyle(() => ({ opacity: clock.value < flipAt ? 1 : 0 }));
  const faceStyle = useAnimatedStyle(() => ({ opacity: clock.value < flipAt ? 0 : 1 }));
  return (
    <View style={{ width, height }}>
      <Animated.View style={[StyleSheet.absoluteFill, backStyle]}>{back}</Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, faceStyle]}>{face}</Animated.View>
    </View>
  );
}

/** a card's corner, as the card draws it */
export function cardRound(width: number): number {
  return Math.round(width * 0.087);
}

/** A ring of light. It spreads out from the card (a shockwave) or, `closing`, closes in on it. */
export function Ring({ clock, at, ms, size, color, from = 0.7, to = 2.8, thick = px(4), closing }: { clock: SharedValue<number>; at: number; ms: number; size: number; color: string; from?: number; to?: number; thick?: number; closing?: boolean }) {
  const style = useAnimatedStyle(() => {
    const u = span(clock.value, at, at + ms);
    if (u <= 0 || u >= 1) return { opacity: 0, transform: [{ scale: from }] };
    // a shockwave is brightest as it leaves; a closing ring is faint far out and brightest just before it lands
    const opacity = closing ? Math.min(1, easeIn(u) * 1.6) * (u > 0.86 ? (1 - u) / 0.14 : 1) : Math.min(1, u / 0.06) * Math.pow(1 - u, 1.4);
    return { opacity, transform: [{ scale: lerp(from, to, closing ? easeInOut(u) : easeOut(u)) }] };
  });
  return <Animated.View pointerEvents="none" style={[around(size), { borderRadius: size / 2, borderWidth: thick, borderColor: color, boxShadow: [halo(color, 16, 0.9), inner(color, 12, 0.7)] }, style]} />;
}

function Spark({ clock, at, ms, angle, reach, color, length, thick }: { clock: SharedValue<number>; at: number; ms: number; angle: number; reach: number; color: string; length: number; thick: number }) {
  const style = useAnimatedStyle(() => {
    const u = span(clock.value, at, at + ms);
    if (u <= 0 || u >= 1) return { opacity: 0 };
    return { opacity: 1 - u * u, transform: [{ rotate: `${angle}deg` }, { translateY: -(length / 2 + reach * easeOut(u)) }, { scaleY: 1 - u * 0.7 }] };
  });
  return <Animated.View pointerEvents="none" style={[around(thick, length), { borderRadius: thick / 2, backgroundColor: color, boxShadow: [halo(color, 8, 1)] }, style]} />;
}

/** Short streaks of light shooting out all round, from the middle of the card. */
export function Sparks({ clock, at, ms, count, reach, color, length = px(18), thick = px(3) }: { clock: SharedValue<number>; at: number; ms: number; count: number; reach: number; color: string; length?: number; thick?: number }) {
  const specs = useMemo(() => {
    const out: { angle: number; reach: number }[] = [];
    // spread evenly with a little give, the same way every time
    for (let i = 0; i < count; i++) out.push({ angle: (i / count) * 360 + ((i * 0.618034) % 1) * 14, reach: reach * (0.7 + 0.3 * ((i * 0.754877) % 1)) });
    return out;
  }, [count, reach]);
  return (
    <>
      {specs.map((s, i) => (
        <Spark key={i} clock={clock} at={at} ms={ms} angle={s.angle} reach={s.reach} color={color} length={length} thick={thick} />
      ))}
    </>
  );
}

/** One four-pointed sparkle that grows, turns and goes out, at `x`, `y` from the point it is placed at. */
export function Twinkle({ clock, at, ms, x, y, size, color, glow, every }: { clock: SharedValue<number>; at: number; ms: number; x: number; y: number; size: number; color: string; glow: string; /** repeat on a looping clock of this length */ every?: number }) {
  const style = useAnimatedStyle(() => {
    const t = every ? clock.value % every : clock.value;
    const u = span(t, at, at + ms);
    const s = u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * u);
    return { opacity: s, transform: [{ translateX: x }, { translateY: y }, { scale: 0.2 + s * 0.8 }, { rotate: `${u * 90}deg` }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[around(size), style]}>
      <LineIcon name="spark" size={size} color={color} tube={{ glass: glow, tint: color, soft: color }} />
    </Animated.View>
  );
}

/** Rays bursting out of the card and fading as they spread. */
export function Starburst({ clock, at, ms, size, color, count = 16 }: { clock: SharedValue<number>; at: number; ms: number; size: number; color: string; count?: number }) {
  const style = useAnimatedStyle(() => {
    const u = span(clock.value, at, at + ms);
    if (u <= 0 || u >= 1) return { opacity: 0, transform: [{ scale: 0.25 }] };
    return { opacity: u < 0.08 ? u / 0.08 : 1 - easeIn((u - 0.08) / 0.92), transform: [{ scale: lerp(0.25, 1.3, easeOut(u)) }, { rotate: `${u * 24}deg` }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[around(size), style]}>
      <Rays size={size} color={color} alpha={0.8} count={count} fill={0.24} fadeAt={[0.08, 0.92]} />
    </Animated.View>
  );
}

/** A patch of coloured light whose brightness follows the clock between two moments: in from `from`, out by `to`. */
export function Pool({ clock, from, to, size, color, peak = 1, fadeIn = 300, fadeOut = 500 }: { clock: SharedValue<number>; from: number; to: number; size: number; color: string; peak?: number; fadeIn?: number; fadeOut?: number }) {
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    return { opacity: peak * span(t, from, from + fadeIn) * (1 - span(t, to - fadeOut, to)) };
  });
  return (
    <Animated.View pointerEvents="none" style={[around(size), style]}>
      <Bloom size={size} color={color} />
    </Animated.View>
  );
}

export interface ConfettiPiece {
  x: number;
  y: number;
  /** where it is going: for a burst, how far out and at what angle; for rain, how far it sways */
  angle: number;
  reach: number;
  fall: number;
  spin: number;
  /** paper turning over as it falls: how fast its width goes through zero */
  flutter: number;
  size: number;
  tint: string;
  delay: number;
  life: number;
}

function Bit({ clock, at, p, rain, height }: { clock: SharedValue<number>; at: number; p: ConfettiPiece; rain: boolean; height: number }) {
  const style = useAnimatedStyle(() => {
    const u = span(clock.value, at + p.delay, at + p.delay + p.life);
    if (u <= 0 || u >= 1) return { opacity: 0 };
    const turn = Math.cos(u * p.flutter);
    if (rain) {
      return {
        opacity: 1,
        transform: [{ translateX: p.x + Math.sin(u * 7 + p.angle) * p.reach }, { translateY: lerp(p.y, height + p.size * 2, u) }, { rotate: `${p.spin * u}deg` }, { scaleX: turn }],
      };
    }
    const out = 1 - (1 - u) * (1 - u);
    return {
      opacity: u < 0.75 ? 1 : (1 - u) / 0.25,
      transform: [{ translateX: Math.cos(p.angle) * p.reach * out }, { translateY: Math.sin(p.angle) * p.reach * out + p.fall * u * u }, { rotate: `${p.spin * u}deg` }, { scaleX: turn }],
    };
  });
  return <Animated.View pointerEvents="none" style={[styles.bit, { width: p.size, height: p.size * 0.62, marginLeft: -p.size / 2, marginTop: -p.size * 0.31, backgroundColor: p.tint }, style]} />;
}

/**
 * Paper confetti on the reveal's clock. A `burst` flies out from the point it is placed at; `rain` falls across
 * a screen of `area` from above its top edge (place it at the screen's top-left corner).
 */
export const Confetti = memo(function Confetti({ clock, at, count, colors, reach = px(240), life = 1600, rain, area, spread = 0 }: { clock: SharedValue<number>; at: number; count: number; colors: readonly string[]; reach?: number; life?: number; rain?: boolean; area?: { width: number; height: number }; /** rain: how long the pieces take to all set off */ spread?: number }) {
  const pieces = useMemo(() => {
    const out: ConfettiPiece[] = [];
    const w = area?.width ?? 0;
    // fixed spreads instead of chance, so it looks full and even every time
    for (let i = 0; i < count; i++) {
      const k = (i * 0.618034) % 1;
      const k2 = (i * 0.754877) % 1;
      const k3 = (i * 0.569840) % 1;
      const size = px(7) + px(6) * k2;
      out.push(
        rain
          ? { x: w * ((i + 0.5) / count) + (k - 0.5) * (w / count), y: -size * 2 - k3 * px(60), angle: k * 6.28, reach: px(10) + px(16) * k3, fall: 0, spin: (k2 - 0.5) * 900, flutter: 8 + 10 * k, size, tint: colors[i % colors.length], delay: k3 * spread, life: life * (0.75 + 0.5 * k2) }
          : { x: 0, y: 0, angle: -Math.PI / 2 + (k - 0.5) * Math.PI * 1.85, reach: reach * (0.4 + 0.6 * k2), fall: reach * (0.7 + 0.7 * k), spin: (k - 0.5) * 1300, flutter: 10 + 14 * k3, size, tint: colors[i % colors.length], delay: k3 * 60, life: life * (0.8 + 0.2 * k2) },
      );
    }
    return out;
  }, [count, colors, reach, life, rain, area?.width, spread]);
  return (
    <View pointerEvents="none" style={rain ? styles.rain : styles.burst}>
      {pieces.map((p, i) => (
        <Bit key={i} clock={clock} at={at} p={p} rain={!!rain} height={area?.height ?? 0} />
      ))}
    </View>
  );
});

/** A beam of light from a lamp: narrow at the top, wide where it lands, soft at its edges and fading as it goes. */
export const Beam = memo(function Beam({ width, height, color, alpha = 0.5, narrow = 0.16 }: { width: number; height: number; /** `#RRGGBB` */ color: string; alpha?: number; /** the lamp end's width, as a share of the far end's */ narrow?: number }) {
  const id = useSvgId('beam');
  // three beams of slightly different widths, one on another, so the edges are soft
  const layers: readonly (readonly [number, number, number])[] = [
    [1, 1, 0.35],
    [0.8, 0.82, 0.5],
    [0.55, 0.6, 0.7],
  ];
  return (
    <View pointerEvents="none" style={{ width, height }}>
      <Svg width={width} height={height} viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <SvgGradient id={id} x1={0} y1={0} x2={0} y2={100} gradientUnits="userSpaceOnUse">
            <Stop offset={0} stopColor={color} stopOpacity={alpha} />
            <Stop offset={0.7} stopColor={color} stopOpacity={alpha * 0.55} />
            <Stop offset={1} stopColor={color} stopOpacity={alpha * 0.15} />
          </SvgGradient>
        </Defs>
        {layers.map(([top, bottom, strength], i) => {
          const a = 50 * narrow * top;
          const b = 50 * bottom;
          return <Polygon key={i} points={`${50 - a},0 ${50 + a},0 ${50 + b},100 ${50 - b},100`} fill={`url(#${id})`} opacity={strength} />;
        })}
      </Svg>
    </View>
  );
});

/** A bright band sweeping once across the card's face. Place it over the card, the card's size. */
export function Glint({ clock, at, ms, width, height }: { clock: SharedValue<number>; at: number; ms: number; width: number; height: number }) {
  const band = width * 0.42;
  const style = useAnimatedStyle(() => {
    const u = span(clock.value, at, at + ms);
    if (u <= 0 || u >= 1) return { opacity: 0 };
    return { opacity: 1, transform: [{ translateX: lerp(-width * 0.75, width * 1.05, easeInOut(u)) }, { rotate: '18deg' }] };
  });
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: cardRound(width) }]}>
      <Animated.View style={[styles.glint, { width: band, height: height * 1.7, top: -height * 0.35 }, style]}>
        <LinearGradient colors={GLINT} locations={GLINT_AT} start={ACROSS_A} end={ACROSS_B} style={StyleSheet.absoluteFill} />
      </Animated.View>
    </View>
  );
}

const GLINT = [fade(night.white, 0), fade(night.white, 0.75), fade(night.white, 0)] as const;
const GLINT_AT = [0, 0.5, 1] as const;
const ACROSS_A = { x: 0, y: 0.5 } as const;
const ACROSS_B = { x: 1, y: 0.5 } as const;

/** where the sparkles round a resting card sit, as shares of its width and height from its middle */
const RESTING_SPARKLES: readonly (readonly [number, number, number, number])[] = [
  [-0.72, -0.4, 22, 0],
  [0.77, -0.5, 14, 900],
  [-0.86, 0.36, 16, 1500],
  [0.83, 0.32, 18, 500],
];
const SPARKLE_EVERY = 2600;

/**
 * The light a revealed card rests in: slowly turning rays and a soft bloom in its rarity's colour, and a few
 * sparkles round it. It comes up as the card turns face-up, from `from` on the reveal's clock.
 */
export function Afterglow({ clock, from, rarity, width, height }: { clock: SharedValue<number>; from: number; rarity: Rarity; width: number; height: number }) {
  const tb = tubes[rarityPaint[rarity].tube];
  const turn = useLoop(60000);
  const twinkle = useLoop(SPARKLE_EVERY);
  const raysSize = width * 3.3;
  const bloomSize = width * 2;
  const shown = useAnimatedStyle(() => ({ opacity: easeOut(span(clock.value, from, from + 500)) }));
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${(turn.value / 60000) * 360}deg` }] }));
  const sparkleColor = [night.white, tubes.cyan.tint, tubes.pink.tint, tubes.gold.tint];
  const sparkleGlow = [night.white, tubes.cyan.glass, tubes.pink.glass, tubes.gold.glass];
  return (
    <Animated.View pointerEvents="none" style={[styles.point, shown]}>
      <Animated.View style={[around(raysSize), spin]}>
        <Rays size={raysSize} color={tb.glass} alpha={rarity === 'common' ? 0.22 : 0.42} count={18} fill={0.35} fadeAt={[0.25, 0.96]} />
      </Animated.View>
      <View style={around(bloomSize)}>
        <Bloom size={bloomSize} color={tb.soft} alpha={rarity === 'common' ? 0.5 : 0.85} />
      </View>
      {RESTING_SPARKLES.map(([x, y, size, at], i) => (
        <Twinkle key={i} clock={twinkle} every={SPARKLE_EVERY} at={at} ms={1100} x={x * width} y={y * height} size={px(size)} color={sparkleColor[i]} glow={sparkleGlow[i]} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  point: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  burst: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  rain: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  bit: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: px(1.5),
  },
  clip: {
    overflow: 'hidden',
  },
  glint: {
    position: 'absolute',
    left: 0,
  },
});
