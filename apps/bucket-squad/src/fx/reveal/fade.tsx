/**
 * For a phone set to reduce motion: no hop, no spin, no shake. The card's back fades into its face where it
 * already rests, with the rarity's own sound.
 */

import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { CardBack } from '@/ui/arcade/Card';
import { REST_TILT, span } from './motion';
import { FADE_TIMES } from './times';
import type { CardProps, Reveal } from './types';

const T = FADE_TIMES;

function Card({ clock, face, width, height }: CardProps) {
  const back = useAnimatedStyle(() => ({ opacity: 1 - span(clock.value, 0, T.length) }));
  const front = useAnimatedStyle(() => ({ opacity: span(clock.value, 0, T.length) }));
  return (
    <View style={{ width, height, transform: [{ rotate: `${REST_TILT}deg` }] }}>
      <Animated.View style={[StyleSheet.absoluteFill, back]}>
        <CardBack width={width} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, front]}>{face}</Animated.View>
    </View>
  );
}

export const fadeReveal: Reveal = {
  rarity: 'common',
  name: 'fade',
  ...T,
  // the page swaps in the rarity's own sound for this one
  cues: [{ at: T.flipAt, sfx: 'revealCommon', stinger: true }],
  shakes: [],
  flashes: [],
  Card,
};
