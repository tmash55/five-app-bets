/**
 * RARE, "power up": the back's trim charges from the room's cyan to blue, blue rings close in on the card one
 * after another with rising blips, a crackle of light runs round its edge, and the flip throws a blue
 * shockwave and sparks.
 */

import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { halo, night, tube } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { CardBack } from '@/ui/arcade/Card';
import { Bloom } from '@/ui/arcade/Room';
import { bump, easeOut, flipWidth, lerp, restTilt, span, wobble } from './motion';
import { Ring, Sides, Sparks, around, cardRound } from './pieces';
import { REVEAL_TIMES } from './times';
import type { CardProps, Reveal, StageProps } from './types';

const T = REVEAL_TIMES.rare;
const BLUE = tube.blue;
/** the back charges from cyan to blue over this */
const CHARGE = { from: 80, to: 900 } as const;
/** the rings closing in, one after another, and how long each takes */
const RINGS = [0, 260, 520] as const;
const RING_MS = 470;
/** the light running round the edge */
const CRACKLE = { from: 700, to: 1060 } as const;
const CLOSE = 100;
const OPEN = 170;
/** how far the card trembles while it charges */
const BUZZ = px(1.5);

function Card({ clock, face, width, height }: CardProps) {
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    const charge = span(t, 0, T.flipAt - CLOSE);
    const live = t < T.flipAt - CLOSE ? charge * BUZZ : 0;
    const pop = bump(t, T.flipAt, 90, 420);
    return {
      transform: [
        { translateX: wobble(t, 0.09, 1) * live },
        { translateY: wobble(t, 0.11, 4) * live },
        { rotate: `${restTilt(t, 1250, T.length)}deg` },
        { scale: 1 + (t < T.flipAt ? charge * 0.035 : 0) + pop * 0.08 },
        { scaleX: flipWidth(t, T.flipAt - CLOSE, CLOSE, OPEN) },
      ],
    };
  });
  const blue = useAnimatedStyle(() => ({ opacity: easeOut(span(clock.value, CHARGE.from, CHARGE.to)) }));
  const back = (
    <View style={{ width, height }}>
      <CardBack width={width} tube="cyan" />
      <Animated.View style={[StyleSheet.absoluteFill, blue]}>
        <CardBack width={width} tube="blue" />
      </Animated.View>
    </View>
  );
  return (
    <Animated.View style={style}>
      <Sides clock={clock} flipAt={T.flipAt} width={width} height={height} back={back} face={face} />
    </Animated.View>
  );
}

function Behind({ clock, width }: StageProps) {
  const size = width * 2.6;
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    const charge = span(t, 0, T.flipAt);
    return { opacity: t < T.flipAt ? 0.15 + charge * 0.55 : lerp(1, 0, easeOut(span(t, T.flipAt, T.length + 300))) };
  });
  return (
    <Animated.View pointerEvents="none" style={[around(size), style]}>
      <Bloom size={size} color={BLUE.soft} />
    </Animated.View>
  );
}

/** a point on the card's edge, `p` of the way round it from the top-left corner, measured from its middle */
function edgePoint(p: number, w: number, h: number): { x: number; y: number } {
  'worklet';
  const d = (((p % 1) + 1) % 1) * 2 * (w + h);
  if (d < w) return { x: d - w / 2, y: -h / 2 };
  if (d < w + h) return { x: w / 2, y: d - w - h / 2 };
  if (d < 2 * w + h) return { x: w / 2 - (d - w - h), y: h / 2 };
  return { x: -w / 2, y: h / 2 - (d - 2 * w - h) };
}

/** four sparks round the edge, each with three fading behind it */
const RUNNERS = [0, 1, 2, 3].flatMap((k) => [3, 2, 1, 0].map((j) => [k, j] as const));

/** One spark running round the edge; `j` above 0 is one of the fading sparks trailing behind it. */
function Runner({ clock, k, j, width, height }: { clock: SharedValue<number>; k: number; j: number; width: number; height: number }) {
  const size = px(8) * (1 - j * 0.2);
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    const on = span(t, CRACKLE.from, CRACKLE.from + 60) * (1 - span(t, CRACKLE.to - 80, CRACKLE.to));
    if (on <= 0) return { opacity: 0 };
    // one and a half times round in the time, every runner a quarter behind the last
    const p = k / 4 + ((t - CRACKLE.from) / (CRACKLE.to - CRACKLE.from)) * 1.5 - j * 0.014;
    const at = edgePoint(p, width, height);
    return { opacity: on * (1 - j * 0.24) * (0.65 + 0.35 * wobble(t, 0.6, k * 2 + j)), transform: [{ translateX: at.x }, { translateY: at.y }, { scale: 0.8 + 0.4 * wobble(t, 0.5, k) }] };
  });
  return <Animated.View pointerEvents="none" style={[around(size), { borderRadius: size / 2, backgroundColor: night.white, boxShadow: [halo(BLUE.glass, 10, 1, 2), halo(tube.cyan.glass, 22, 0.8)] }, style]} />;
}

function Front({ clock, width, height }: StageProps) {
  const diag = Math.hypot(width, height);
  const edge = useAnimatedStyle(() => {
    const t = clock.value;
    const on = bump(t, CRACKLE.from - 20, 60, CRACKLE.to - CRACKLE.from + 80);
    return { opacity: on * (0.6 + 0.4 * wobble(t, 0.45, 2.2)) };
  });
  return (
    <>
      {RINGS.map((at, i) => (
        <Ring key={i} clock={clock} at={at} ms={RING_MS} size={diag * 1.08} color={i === 2 ? BLUE.soft : BLUE.glass} from={2.3} to={1} thick={px(3)} closing />
      ))}
      <Animated.View pointerEvents="none" style={[around(width, height), { borderRadius: cardRound(width), borderWidth: px(2.5), borderColor: tube.cyan.tint, boxShadow: [halo(BLUE.glass, 14, 1), halo(tube.cyan.glass, 6, 1)] }, edge]} />
      {RUNNERS.map(([k, j]) => (
        <Runner key={`${k}-${j}`} clock={clock} k={k} j={j} width={width} height={height} />
      ))}
      <Ring clock={clock} at={T.flipAt} ms={560} size={diag * 0.9} color={BLUE.glass} from={0.8} to={2.9} thick={px(5)} />
      <Sparks clock={clock} at={T.flipAt} ms={480} count={14} reach={width * 0.95} color={BLUE.soft} />
    </>
  );
}

export const rareReveal: Reveal = {
  rarity: 'rare',
  name: 'power up',
  ...T,
  cues: [
    { at: 0, sfx: 'rareCharge', buzz: 'light' },
    { at: RINGS[1], buzz: 'light' },
    { at: RINGS[2], buzz: 'light' },
    { at: CRACKLE.from, sfx: 'crackle', volume: 0.9 },
    { at: T.flipAt, sfx: 'revealRare', buzz: 'medium', stinger: true },
  ],
  shakes: [{ at: T.flipAt, ms: 240, amount: px(3) }],
  flashes: [{ at: T.flipAt, ms: 340, amount: 0.26 }],
  Card,
  Behind,
  Front,
};
