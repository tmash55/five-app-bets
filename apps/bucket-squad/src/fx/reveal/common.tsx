/**
 * COMMON, "quick flip": a hop, one snappy flip, a white glint across the face and a few sparkles. Fast on
 * purpose: most cards are Commons, and a child opens a lot of packs.
 */

import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { night, tube } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { CardBack } from '@/ui/arcade/Card';
import { backOut, bump, easeIn, easeOut, flipWidth, restTilt, span } from './motion';
import { Glint, Pool, Sides, Twinkle } from './pieces';
import { REVEAL_TIMES } from './times';
import type { CardProps, Reveal, StageProps } from './types';

const T = REVEAL_TIMES.common;
/** how high the card hops */
const HOP = px(30);
/** the hop's way up and back down */
const UP = 200;
const DOWN = 470;
/** the flip: closing to edge-on, then open again */
const CLOSE = 110;
const OPEN = 170;

function Card({ clock, face, width, height }: CardProps) {
  const style = useAnimatedStyle(() => {
    const t = clock.value;
    const up = easeOut(span(t, 0, UP));
    const down = easeIn(span(t, UP, DOWN));
    // a little squash as it lands
    const land = bump(t, DOWN, 50, 180);
    return {
      transform: [
        { translateY: -HOP * (up - down) },
        { rotate: `${restTilt(t, 520, T.length)}deg` },
        { scale: 1 + 0.06 * backOut(span(t, 0, UP)) * (1 - down) },
        { scaleX: flipWidth(t, T.flipAt - CLOSE, CLOSE, OPEN) * (1 + land * 0.05) },
        { scaleY: 1 - land * 0.05 },
      ],
    };
  });
  return (
    <Animated.View style={style}>
      <Sides clock={clock} flipAt={T.flipAt} width={width} height={height} back={<CardBack width={width} />} face={face} />
      <Glint clock={clock} at={T.flipAt + 120} ms={380} width={width} height={height} />
    </Animated.View>
  );
}

function Behind({ clock, width }: StageProps) {
  return <Pool clock={clock} from={T.flipAt - 40} to={T.length + 200} size={width * 2.6} color={night.white} peak={0.55} fadeIn={90} fadeOut={500} />;
}

/** where the sparkles pop, as shares of the card's width and height from its middle, and when */
const SPARKLES: readonly (readonly [number, number, number, number])[] = [
  [-0.62, -0.46, 20, 0],
  [0.66, -0.3, 16, 60],
  [-0.7, 0.28, 14, 110],
  [0.6, 0.5, 18, 150],
  [0.08, -0.66, 12, 200],
];

function Front({ clock, width, height }: StageProps) {
  return (
    <>
      {SPARKLES.map(([x, y, size, delay], i) => (
        <Twinkle key={i} clock={clock} at={T.flipAt + 60 + delay} ms={520} x={x * width} y={y * height} size={px(size)} color={i % 2 ? tube.steel.tint : night.white} glow={i % 2 ? tube.cyan.glass : night.white} />
      ))}
    </>
  );
}

export const commonReveal: Reveal = {
  rarity: 'common',
  name: 'quick flip',
  ...T,
  cues: [
    { at: UP - 40, sfx: 'cardFlip', volume: 0.8 },
    { at: T.flipAt, sfx: 'revealCommon', buzz: 'light', stinger: true },
    { at: T.flipAt + 90, sfx: 'sparkle', volume: 0.5 },
  ],
  shakes: [],
  flashes: [],
  Card,
  Behind,
  Front,
};
