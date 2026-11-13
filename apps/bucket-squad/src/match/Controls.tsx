/**
 * The on-screen game pad: a floating stick under one thumb and a triangle of
 * buttons under the other. Touches are read raw (not through gesture
 * recognisers) so several fingers work at once and nothing waits on a gesture
 * to "win". The rules live in `padModel.ts`; this file only draws.
 */

import { memo, useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import type { MatchRunner } from '@/game/runner';
import { color, duration, layer, opacity, pad, stroke } from '@/theme/tokens';
import { Icon, type IconName } from '@/ui/Icon';
import { Txt } from '@/ui/Txt';
import { PadModel, padLayout, type ButtonId, type ButtonSpot, type PadTouch, type PadView } from './padModel';

const TURBO_STEPS = 20;
/** buttons are see-through until pressed, so players behind them stay visible */
const IDLE = (opacity.dim + opacity.soft) / 2;
const RING_WIDTH = 6;

interface Props {
  runner: MatchRunner;
  /** the person's team has the ball: SHOOT / PASS, otherwise JUMP / STEAL */
  offense: boolean;
  lefty: boolean;
  /** sprint energy, 0..20 */
  turbo: number;
  enabled: boolean;
}

function PadButton({ spot, pressed, fill, label, icon }: { spot: ButtonSpot; pressed: SharedValue<number>; fill: string; label: string; icon?: IconName }) {
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.09 * pressed.value }],
    opacity: IDLE + (1 - IDLE) * pressed.value,
  }));
  const d = spot.r * 2;
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.button, { left: spot.x - spot.r, top: spot.y - spot.r, width: d, height: d, borderRadius: spot.r, backgroundColor: fill }, style]}>
      {icon && <Icon name={icon} size={Math.round(spot.r * 0.62)} color="white" />}
      <Txt font="display" size={spot.r > 40 ? 'body' : spot.r > 34 ? 'small' : 'tiny'} color="white" shadow>
        {label}
      </Txt>
    </Animated.View>
  );
}

/** Sprint energy, drawn as a ring around the TURBO button. */
const TurboRing = memo(function TurboRing({ spot, value }: { spot: ButtonSpot; value: number }) {
  const r = spot.r + RING_WIDTH - 1;
  const box = r * 2 + RING_WIDTH + 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, value / TURBO_STEPS));
  return (
    <View pointerEvents="none" style={[styles.ring, { left: spot.x - box / 2, top: spot.y - box / 2 }]}>
      <Svg width={box} height={box}>
        <Circle cx={box / 2} cy={box / 2} r={r} stroke={color.scrimSoft} strokeWidth={RING_WIDTH} fill="none" />
        <Circle
          cx={box / 2}
          cy={box / 2}
          r={r}
          stroke={frac < 0.25 ? color.coral : color.sun}
          strokeWidth={RING_WIDTH}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c * frac} ${c}`}
          transform={`rotate(-90 ${box / 2} ${box / 2})`}
        />
      </Svg>
    </View>
  );
});

function touchesOf(e: GestureResponderEvent): PadTouch[] {
  const out: PadTouch[] = [];
  for (const t of e.nativeEvent.changedTouches) out.push({ id: t.identifier, x: t.pageX, y: t.pageY });
  return out;
}

export function Controls({ runner, offense, lefty, turbo, enabled }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layout = useMemo(() => padLayout(width, height, insets.left, insets.right, insets.bottom, lefty), [width, height, insets.left, insets.right, insets.bottom, lefty]);
  const [model] = useState(() => new PadModel());

  const baseX = useSharedValue(layout.restX);
  const baseY = useSharedValue(layout.restY);
  const knobX = useSharedValue(0);
  const knobY = useSharedValue(0);
  const live = useSharedValue(0);
  const pA = useSharedValue(0);
  const pB = useSharedValue(0);
  const pT = useSharedValue(0);
  const pS = useSharedValue(0);

  const view = useMemo<PadView>(
    () => ({
      base: (x, y, settle) => {
        baseX.set(settle ? withTiming(x, { duration: duration.slow }) : x);
        baseY.set(settle ? withTiming(y, { duration: duration.slow }) : y);
      },
      knob: (dx, dy, settle) => {
        knobX.set(settle ? withSpring(dx, { damping: 18, stiffness: 320 }) : dx);
        knobY.set(settle ? withSpring(dy, { damping: 18, stiffness: 320 }) : dy);
      },
      live: (on) => live.set(withTiming(on ? 1 : 0, { duration: on ? duration.quick : duration.slow })),
      pressed: (a, b, t, s) => {
        pA.set(a ? 1 : 0);
        pB.set(b ? 1 : 0);
        pT.set(t ? 1 : 0);
        pS.set(s ? 1 : 0);
      },
    }),
    [baseX, baseY, knobX, knobY, live, pA, pB, pT, pS],
  );

  useEffect(() => {
    model.connect(runner.pad, view);
    return () => {
      model.reset();
      model.connect(null, null);
    };
  }, [model, runner, view]);

  useEffect(() => model.setLayout(layout), [model, layout]);
  useEffect(() => model.setOffense(offense), [model, offense]);
  useEffect(() => model.setEnabled(enabled), [model, enabled]);

  // keyboard, for playing in a browser
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const down = (ev: KeyboardEvent) => {
      if (model.key(ev.code, true)) ev.preventDefault();
    };
    const up = (ev: KeyboardEvent) => {
      model.key(ev.code, false);
    };
    const blur = () => model.reset();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [model]);

  const baseStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: baseX.value - pad.stick / 2 }, { translateY: baseY.value - pad.stick / 2 }],
    opacity: opacity.dim + (1 - opacity.dim) * live.value,
  }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: knobX.value }, { translateY: knobY.value }, { scale: 1 + 0.08 * live.value }],
  }));

  const spot = (id: ButtonId) => layout.spots.find((s) => s.id === id) as ButtonSpot;

  return (
    <View
      style={styles.root}
      onTouchStart={(e) => model.start(touchesOf(e))}
      onTouchMove={(e) => model.move(touchesOf(e))}
      onTouchEnd={(e) => model.end(touchesOf(e))}
      onTouchCancel={(e) => model.end(touchesOf(e))}>
      <Animated.View pointerEvents="none" style={[styles.base, baseStyle]}>
        <Animated.View style={[styles.knob, knobStyle]}>
          <View style={styles.knobDot} />
        </Animated.View>
      </Animated.View>
      <TurboRing spot={spot('turbo')} value={turbo} />
      <PadButton spot={spot('turbo')} pressed={pT} fill={color.sunDeep} label="TURBO" icon="bolt" />
      <PadButton spot={spot('b')} pressed={pB} fill={color.sky} label={offense ? 'PASS' : 'STEAL'} icon={offense ? 'swap' : 'hand'} />
      <PadButton spot={spot('a')} pressed={pA} fill={color.coral} label={offense ? 'SHOOT' : 'JUMP'} icon={offense ? 'ball' : 'jump'} />
      {!offense && <PadButton spot={spot('sw')} pressed={pS} fill={color.grape} label="SWITCH" />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: layer.pad,
  },
  base: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: pad.stick,
    height: pad.stick,
    borderRadius: pad.stick / 2,
    borderWidth: stroke.regular,
    borderColor: color.white,
    backgroundColor: color.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  knob: {
    width: pad.knob,
    height: pad.knob,
    borderRadius: pad.knob / 2,
    backgroundColor: color.white,
    borderWidth: stroke.regular,
    borderColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  knobDot: {
    width: pad.knob * 0.42,
    height: pad.knob * 0.42,
    borderRadius: pad.knob * 0.21,
    backgroundColor: color.sun,
    borderWidth: stroke.thin,
    borderColor: color.ink,
  },
  ring: {
    position: 'absolute',
  },
  button: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: stroke.thick,
    borderColor: color.ink,
  },
});
