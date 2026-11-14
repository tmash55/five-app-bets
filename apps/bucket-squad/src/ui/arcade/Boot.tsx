/**
 * The first second of the game. The phone was already showing the loading picture (the hoop sign and the
 * game's name, see `tools/brand/make_brand.py`); this draws the same picture in the same place, so nobody
 * sees the hand-over, then lets the sign flicker the way a neon tube catches and opens the room behind it.
 *
 * The phone's loading picture stays up until this one is really on the glass (`onShown`). Taking it down
 * any sooner shows a blink of bare background, because the phone is still busy drawing the first page.
 */

import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, interpolate, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { night, tube } from '@/theme/arcade';
import brand from '@/theme/brand.json';
import { useAfter } from '@/ui/hooks';

import { Bloom } from './Room';

const PICTURE = require('../../../assets/images/splash-icon.png');

/** The picture's side in screen points. The phone draws it this size whatever the screen, so this does not scale either. */
const SIDE = brand.splashWidth;

/** how long it all takes, in milliseconds */
const LENGTH = 1180;
/** The tube catching: when, and how bright the sign is then. It starts fully lit, because that is how the loading picture left it. */
const FLICKER_AT = [0, 200, 215, 270, 285, 370, 382, 425, 440, LENGTH];
const FLICKER = [1, 1, 0.18, 0.18, 1, 1, 0.42, 0.42, 1, 1];
/** when the light behind the sign starts to swell, and when the room starts to show through */
const SWELL_AT = 440;
const OPEN_AT = 780;
/** for anyone who has asked their phone for less motion: no flicker, a plain fade */
const CALM_LENGTH = 420;
/** how long to wait for the picture to say it is drawn before carrying on without the word */
const PATIENCE = 1500;

/** how big the light behind the sign gets, as a share of the picture */
const LIGHT = 1.7;
/** how far the sign comes forward as the room opens */
const COME_FORWARD = 0.12;

export function Boot({ onShown, onDone }: { onShown?: () => void; onDone: () => void }) {
  const calm = useReducedMotion();
  const length = calm ? CALM_LENGTH : LENGTH;
  const openAt = calm ? 0 : OPEN_AT;
  const t = useSharedValue(0);
  const after = useAfter();
  const begun = useRef(false);

  /** The picture is on the glass: the phone's own can come down, and the tube can start to catch. */
  const begin = () => {
    if (begun.current) return;
    begun.current = true;
    onShown?.();
    t.set(withTiming(length, { duration: length, easing: Easing.linear }));
    after(length + 40, onDone);
  };

  useEffect(() => {
    after(PATIENCE, begin);
    // once, when the game starts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const whole = useAnimatedStyle(() => {
    const u = Math.min(1, Math.max(0, (t.value - openAt) / (length - openAt)));
    return { opacity: 1 - u * u };
  });
  const sign = useAnimatedStyle(() => {
    const u = Math.min(1, Math.max(0, (t.value - openAt) / (length - openAt)));
    return { opacity: calm ? 1 : interpolate(t.value, FLICKER_AT, FLICKER), transform: [{ scale: calm ? 1 : 1 + COME_FORWARD * u * u }] };
  });
  const light = useAnimatedStyle(() => ({ opacity: calm ? 0 : interpolate(t.value, [SWELL_AT, OPEN_AT, LENGTH], [0, 1, 1], 'clamp') }));

  return (
    <Animated.View style={[styles.fill, whole]}>
      <Animated.View pointerEvents="none" style={[styles.light, light]}>
        <Bloom size={SIDE * LIGHT} color={tube.violet.glass} alpha={0.34} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={sign}>
        <Image source={PICTURE} style={styles.picture} contentFit="contain" transition={0} onDisplay={begin} />
      </Animated.View>
      {/* nothing under it can be tapped until it has gone */}
      <View style={StyleSheet.absoluteFill} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: night.wallTop },
  light: { position: 'absolute' },
  picture: { width: SIDE, height: SIDE },
});
