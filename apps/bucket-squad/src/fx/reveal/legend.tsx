/**
 * LEGEND, "jackpot": blackout and one silent beat. Marquee bulbs chase round the edge of the screen, slowly,
 * then faster and faster, under a drum roll. A golden beam comes down on the card; it trembles, shoots up out
 * of the frame and slams down face-up with a white flash, three shockwaves and a hard shake, and gold
 * confetti rains for a while.
 */

import { memo, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { fade, night, tube } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { CardBack } from '@/ui/arcade/Card';
import { Bloom } from '@/ui/arcade/Room';
import { bulbSpots } from './marquee';
import { bump, easeIn, easeInOut, easeOut, lerp, restTilt, span, wobble } from './motion';
import { Beam, Confetti, Ring, Sides, Sparks, Starburst, around, cardRound } from './pieces';
import { REVEAL_TIMES } from './times';
import type { CardProps, Reveal, StageProps } from './types';

const T = REVEAL_TIMES.legend;
const GOLD = tube.amber;
/** the lights go out, and stay out for a beat */
const BLACK_IN = 160;
/** the bulbs start chasing, and the drum roll with them, until the card takes off */
const CHASE = 700;
const BEAM = { from: 1200, ms: 380 } as const;
const TREMBLE = 1800;
const LAUNCH = { from: 3000, ms: 300 } as const;
/** it falls from out of the frame and lands */
const FALL = 3540;
const IMPACT = 3700;
/** how hard it trembles just before it goes */
const SHAKE = px(4.5);
/** how high the card hops when it lands (sizes used inside a worklet are worked out up here: it can't call `px`) */
const LAND_HOP = px(12);
const CONFETTI = [GOLD.glass, tube.gold.glass, GOLD.soft, tube.gold.tint, tube.orange.glass, night.white];

/** How far the marquee's chase has gone: three steps a second at first, twenty-six by the time the card goes, then slowing to four. */
function chaseAt(t: number): number {
  'worklet';
  if (t <= CHASE) return 0;
  const run = (LAUNCH.from - CHASE) / 1000;
  const s = (Math.min(t, LAUNCH.from) - CHASE) / 1000;
  let p = 3 * s + (23 * s * s * s) / (3 * run * run);
  if (t > LAUNCH.from) p += (26 * (Math.min(t, IMPACT) - LAUNCH.from)) / 1000;
  if (t > IMPACT) {
    const s2 = (t - IMPACT) / 1000;
    p += 4 * s2 + 22 * 0.25 * (1 - Math.exp(-s2 / 0.25));
  }
  return p;
}

const Bulbs = memo(function Bulbs({ spots, width, height, lit }: { spots: { x: number; y: number }[]; width: number; height: number; lit: boolean }) {
  const r = px(4.2);
  return (
    <Svg width={width} height={height}>
      {lit && spots.map((s, i) => <Circle key={`h${i}`} cx={s.x} cy={s.y} r={r * 2.6} fill={tube.gold.glass} opacity={0.22} />)}
      {lit && spots.map((s, i) => <Circle key={`m${i}`} cx={s.x} cy={s.y} r={r * 1.5} fill={GOLD.glass} opacity={0.7} />)}
      {spots.map((s, i) => (
        <Circle key={`c${i}`} cx={s.x} cy={s.y} r={r} fill={lit ? tube.gold.tint : fade(GOLD.glass, 0.28)} />
      ))}
    </Svg>
  );
});

function BulbGroup({ clock, k, spots, width, height }: { clock: SharedValue<number>; k: number; spots: { x: number; y: number }[]; width: number; height: number }) {
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    if (t < CHASE) return { opacity: 0 };
    const all = t >= IMPACT && t < IMPACT + 380;
    const on = all || Math.floor(chaseAt(t)) % 3 === k;
    // once the card has landed the lights go down, so they never sit over what the side says about the player
    return { opacity: on ? (t > IMPACT + 380 ? 0.85 : 1) * (1 - span(t, T.length, T.length + 900)) : 0 };
  });
  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, style]}>
      <Bulbs spots={spots} width={width} height={height} lit />
    </Animated.View>
  );
}

/** Marquee bulbs round the edge of the screen: every third one lit, the lit ones stepping on, so the light runs round. */
function Marquee({ clock, width, height }: { clock: SharedValue<number>; width: number; height: number }) {
  const safe = useSafeAreaInsets();
  const spots = useMemo(() => bulbSpots(width, height, safe), [width, height, safe]);
  const groups = useMemo(() => [0, 1, 2].map((k) => spots.filter((_, i) => i % 3 === k)), [spots]);
  const base = useAnimatedStyle(() => ({ opacity: span(clock.value, CHASE - 120, CHASE + 200) * (1 - span(clock.value, T.length, T.length + 900)) }));
  return (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, base]}>
        <Bulbs spots={spots} width={width} height={height} lit={false} />
      </Animated.View>
      {groups.map((g, k) => (
        <BulbGroup key={k} clock={clock} k={k} spots={g} width={width} height={height} />
      ))}
    </>
  );
}

function Room({ clock, screen, at, width, height }: StageProps) {
  const black = useAnimatedStyle(() => {
    const t = clock.value;
    return { opacity: 0.93 * span(t, 0, BLACK_IN) * (1 - 0.65 * easeInOut(span(t, IMPACT, IMPACT + 900))) };
  });
  const length = at.y + height * 0.62;
  const beamW = width * 1.9;
  const beam = useAnimatedStyle(() => {
    const t = clock.value;
    const grow = easeOut(span(t, BEAM.from, BEAM.from + BEAM.ms));
    const on = span(t, BEAM.from, BEAM.from + 90) * (1 - easeIn(span(t, IMPACT, IMPACT + 700)));
    // brighter as the card trembles in it, brightest as it goes
    const bright = 0.75 + 0.25 * span(t, TREMBLE, LAUNCH.from) + 0.1 * wobble(t, 0.03, 2);
    return { opacity: on * Math.min(1, bright), transform: [{ translateY: -length / 2 }, { scaleY: Math.max(0.001, grow) }, { translateY: length / 2 }] };
  });
  const glareSize = px(190);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: night.black }, black]} />
      <Animated.View style={[{ position: 'absolute', left: at.x - beamW / 2, top: 0, width: beamW, height: length }, beam]}>
        <Beam width={beamW} height={length} color={tube.gold.soft} alpha={0.62} narrow={0.22} />
        <View style={[around(glareSize), { left: beamW / 2 - glareSize / 2, top: -glareSize / 2 }]}>
          <Bloom size={glareSize} color={tube.gold.tint} />
        </View>
      </Animated.View>
      <Marquee clock={clock} width={screen.width} height={screen.height} />
    </View>
  );
}

function Card({ clock, face, width, height, at }: CardProps) {
  // far enough up that the card is all the way out of the frame
  const off = at.y + height * 1.3;
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    const shake = SHAKE * easeIn(span(t, TREMBLE, LAUNCH.from)) * (t < LAUNCH.from + LAUNCH.ms ? 1 : 0);
    let y = wobble(t, 0.19, 5) * shake * 0.5;
    let scale = 1 + 0.05 * span(t, TREMBLE, LAUNCH.from);
    let tilt = wobble(t, 0.13, 9) * 1.4 * (shake / SHAKE);
    if (t >= LAUNCH.from && t < FALL) {
      const u = span(t, LAUNCH.from, LAUNCH.from + LAUNCH.ms);
      y = -off * easeIn(u);
      scale = lerp(1.05, 0.85, u);
    } else if (t >= FALL && t < IMPACT) {
      // falling: faster and faster, and bigger as it comes
      const v = span(t, FALL, IMPACT);
      y = -off * (1 - v * v);
      scale = lerp(1.3, 1, v * v);
      tilt = lerp(-9, 0, v);
    } else if (t >= IMPACT) {
      y = -LAND_HOP * bump(t, IMPACT + 70, 130, 220);
      scale = 1;
      tilt = restTilt(t, IMPACT + 240, T.length);
    }
    const squash = bump(t, IMPACT, 45, 260);
    return {
      transform: [{ translateX: wobble(t, 0.16, 1) * shake }, { translateY: y }, { rotate: `${tilt}deg` }, { scale }, { scaleX: 1 + squash * 0.1 }, { scaleY: 1 - squash * 0.1 }],
    };
  });
  // the card sits in the dark until the beam finds it
  const veil = useAnimatedStyle(() => {
    const t = clock.value;
    return { opacity: 0.75 * span(t, 0, BLACK_IN) * (1 - easeOut(span(t, BEAM.from + 150, BEAM.from + 650))) };
  });
  return (
    <Animated.View style={style}>
      <Sides clock={clock} flipAt={T.flipAt} width={width} height={height} back={<CardBack width={width} />} face={face} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: cardRound(width), backgroundColor: night.black }, veil]} />
    </Animated.View>
  );
}

function Behind({ clock, width }: StageProps) {
  const size = width * 3;
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    const pool = 0.3 * span(t, BEAM.from + 200, BEAM.from + 600) + 0.4 * span(t, TREMBLE, LAUNCH.from);
    return { opacity: t < IMPACT ? pool * (0.9 + 0.1 * wobble(t, 0.04, 3)) : lerp(1, 0, easeOut(span(t, IMPACT, T.length + 600))) };
  });
  // the burst of light goes behind the card, so the face it lights up is never crossed out by its rays
  return (
    <>
      <Animated.View pointerEvents="none" style={[around(size), style]}>
        <Bloom size={size} color={GOLD.soft} />
      </Animated.View>
      <Starburst clock={clock} at={IMPACT} ms={1000} size={width * 4} color={tube.gold.soft} count={20} />
    </>
  );
}

function Front({ clock, width, height }: StageProps) {
  const diag = Math.hypot(width, height);
  return (
    <>
      <Ring clock={clock} at={IMPACT} ms={620} size={diag * 0.9} color={night.white} from={0.85} to={3.2} thick={px(6)} />
      <Ring clock={clock} at={IMPACT + 110} ms={700} size={diag * 0.9} color={tube.gold.glass} from={0.85} to={3.6} thick={px(5)} />
      <Ring clock={clock} at={IMPACT + 220} ms={780} size={diag * 0.9} color={GOLD.glass} from={0.85} to={4} thick={px(4)} />
      <Sparks clock={clock} at={IMPACT} ms={560} count={20} reach={width * 1.25} color={tube.gold.tint} length={px(22)} />
    </>
  );
}

function Over({ clock, screen }: StageProps) {
  return <Confetti clock={clock} at={IMPACT} count={40} colors={CONFETTI} rain area={screen} life={2300} spread={1500} />;
}

export const legendReveal: Reveal = {
  rarity: 'legend',
  name: 'jackpot',
  ...T,
  cues: [
    { at: 0, buzz: 'medium' },
    { at: CHASE, sfx: 'drumRoll' },
    { at: BEAM.from, sfx: 'neonOn', volume: 0.8, buzz: 'light' },
    { at: TREMBLE, buzz: 'light' },
    { at: 2300, buzz: 'light' },
    { at: 2600, buzz: 'light' },
    { at: 2800, buzz: 'medium' },
    { at: LAUNCH.from, sfx: 'whooshUp', buzz: 'heavy' },
    { at: IMPACT, sfx: 'slam', buzz: 'heavy', stinger: true },
    { at: IMPACT, sfx: 'jackpot', stinger: true },
    { at: IMPACT + 110, buzz: 'success' },
    { at: IMPACT + 220, buzz: 'heavy' },
    { at: IMPACT + 400, sfx: 'sparkle', volume: 0.7 },
  ],
  shakes: [
    { at: LAUNCH.from, ms: 220, amount: px(3) },
    { at: IMPACT, ms: 620, amount: px(13) },
  ],
  flashes: [{ at: IMPACT, ms: 500, amount: 0.95 }],
  Card,
  Room,
  Behind,
  Front,
  Over,
};
