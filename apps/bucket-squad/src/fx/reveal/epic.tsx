/**
 * EPIC, "spotlight show": the room dims, two purple spotlights sweep in from the sides and cross on the card,
 * it lifts and spins once, holds for a beat, then flips with a starburst, two shockwaves, a short shake and
 * purple and pink confetti.
 */

import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { night, tube } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { CardBack } from '@/ui/arcade/Card';
import { Bloom } from '@/ui/arcade/Room';
import { backOut, easeIn, easeInOut, easeOut, flipWidth, lerp, restTilt, span, wobble } from './motion';
import { Beam, Confetti, Pool, Ring, Sides, Starburst, around } from './pieces';
import { REVEAL_TIMES } from './times';
import type { CardProps, Reveal, StageProps } from './types';

const T = REVEAL_TIMES.epic;
const PURPLE = tube.purple;
/** the room dims to this, and back up after the flip */
const DIM = 0.62;
const DIM_IN = 380;
/** the two spotlights set off one after the other and take this long to find the card */
const LAMPS = [280, 460] as const;
const SWEEP = 900;
/** they start pointing this far away from the card */
const SWING = 52;
/** the card lifts, spins once, then holds still for a beat */
const LIFT = 1300;
const SPIN = { from: 1420, to: 1960 } as const;
const RISE = px(18);
const CLOSE = 80;
const OPEN = 170;
const CONFETTI = [PURPLE.glass, tube.pink.glass, PURPLE.soft, tube.pink.soft, tube.violet.glass, night.white];

function Card({ clock, face, width, height }: CardProps) {
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    const lift = easeOut(span(t, LIFT, LIFT + 320));
    const land = easeOut(span(t, T.flipAt, T.flipAt + 360));
    const up = lift * (1 - land);
    // once round, as a flat card turns: its width through zero and back, twice
    const u = span(t, SPIN.from, SPIN.to);
    const spin = u > 0 && u < 1 ? Math.cos(Math.PI * 2 * easeInOut(u)) : 1;
    const hold = t > SPIN.to && t < T.flipAt - CLOSE ? span(t, SPIN.to, T.flipAt - CLOSE) : 0;
    const pop = backOut(span(t, T.flipAt, T.flipAt + 320)) * (1 - span(t, T.flipAt + 320, T.flipAt + 700));
    return {
      transform: [
        { translateX: wobble(t, 0.12, 3) * px(1.6) * hold },
        { translateY: -RISE * up + Math.sin(t * 0.006) * px(2) * up },
        { rotate: `${restTilt(t, 2300, T.length) + wobble(t, 0.05, 1) * 1.5 * up}deg` },
        { scale: 1 + 0.08 * up + 0.05 * pop },
        { scaleX: (Math.abs(spin) < 0.001 ? 0.001 : spin) * flipWidth(t, T.flipAt - CLOSE, CLOSE, OPEN) },
      ],
    };
  });
  return (
    <Animated.View style={style}>
      <Sides clock={clock} flipAt={T.flipAt} width={width} height={height} back={<CardBack width={width} />} face={face} />
    </Animated.View>
  );
}

function Lamp({ clock, start, from, to, x, y, width, length }: { clock: SharedValue<number>; start: number; from: number; to: number; x: number; y: number; width: number; length: number }) {
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    const angle = lerp(from, to, easeInOut(span(t, start, start + SWEEP)));
    const on = easeOut(span(t, start, start + 220)) * (1 - easeIn(span(t, T.flipAt, T.flipAt + 500)));
    // turned about the lamp, at the top of the beam: move the lamp to the middle, turn, move it back
    return { opacity: on * (0.9 + 0.1 * wobble(t, 0.02, start)), transform: [{ translateY: -length / 2 }, { rotate: `${angle}deg` }, { translateY: length / 2 }] };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: x - width / 2, top: y, width, height: length }, style]}>
      <Beam width={width} height={length} color={PURPLE.soft} alpha={0.55} narrow={0.12} />
    </Animated.View>
  );
}

/** The angle that points a beam hanging from (x, y) at the card: 0 hangs straight down, more turns it to the left. */
function aim(x: number, y: number, at: { x: number; y: number }): number {
  return (Math.atan2(-(at.x - x), at.y - y) * 180) / Math.PI;
}

function Room({ clock, screen, at, width, height }: StageProps) {
  const dim = useAnimatedStyle(() => {
    const t = clock.value;
    return { opacity: DIM * easeOut(span(t, 0, DIM_IN)) * (1 - easeInOut(span(t, T.flipAt, T.flipAt + 1200))) };
  });
  const lampY = -px(24);
  const left = { x: at.x - screen.width * 0.44, y: lampY };
  const right = { x: at.x + screen.width * 0.44, y: lampY };
  const length = Math.hypot(at.x - left.x, at.y - lampY) + height * 0.55;
  const beamW = width * 1.7;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: night.black }, dim]} />
      <Lamp clock={clock} start={LAMPS[0]} from={aim(left.x, lampY, at) + SWING} to={aim(left.x, lampY, at)} x={left.x} y={lampY} width={beamW} length={length} />
      <Lamp clock={clock} start={LAMPS[1]} from={aim(right.x, lampY, at) - SWING} to={aim(right.x, lampY, at)} x={right.x} y={lampY} width={beamW} length={length} />
    </View>
  );
}

function Behind({ clock, width }: StageProps) {
  const size = width * 2.8;
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    // the pool the crossed beams make, then the burst of the flip
    const pool = 0.5 * easeOut(span(t, LAMPS[1] + SWEEP * 0.6, LAMPS[1] + SWEEP + 200));
    return { opacity: t < T.flipAt ? pool : lerp(1, 0, easeOut(span(t, T.flipAt, T.length + 500))) };
  });
  return (
    <Animated.View pointerEvents="none" style={[around(size), style]}>
      <Bloom size={size} color={PURPLE.soft} />
    </Animated.View>
  );
}

function Front({ clock, width, height }: StageProps) {
  const diag = Math.hypot(width, height);
  return (
    <>
      <Pool clock={clock} from={T.flipAt - 30} to={T.flipAt + 600} size={width * 2.2} color={night.white} peak={0.8} fadeIn={60} fadeOut={500} />
      <Starburst clock={clock} at={T.flipAt} ms={760} size={width * 3.4} color={PURPLE.soft} />
      <Ring clock={clock} at={T.flipAt} ms={600} size={diag * 0.9} color={PURPLE.glass} from={0.8} to={3} thick={px(5)} />
      <Ring clock={clock} at={T.flipAt + 120} ms={680} size={diag * 0.9} color={tube.pink.glass} from={0.8} to={3.3} thick={px(4)} />
      <Confetti clock={clock} at={T.flipAt} count={30} colors={CONFETTI} reach={width * 1.5} life={1700} />
    </>
  );
}

export const epicReveal: Reveal = {
  rarity: 'epic',
  name: 'spotlight show',
  ...T,
  cues: [
    { at: LAMPS[0], sfx: 'spotWhoosh', volume: 0.85 },
    { at: LAMPS[1], sfx: 'spotWhoosh', volume: 0.85 },
    { at: LIFT, sfx: 'whooshUp', volume: 0.55 },
    { at: SPIN.from, sfx: 'cardFlip' },
    { at: SPIN.from + 270, sfx: 'cardFlip', volume: 0.7 },
    { at: T.flipAt, sfx: 'revealEpic', buzz: 'success', stinger: true },
    { at: T.flipAt, sfx: 'slam', volume: 0.45, stinger: true },
    { at: T.flipAt + 120, buzz: 'heavy' },
  ],
  shakes: [{ at: T.flipAt, ms: 420, amount: px(7) }],
  flashes: [{ at: T.flipAt, ms: 360, amount: 0.5 }],
  Card,
  Room,
  Behind,
  Front,
};
