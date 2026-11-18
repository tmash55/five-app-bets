/**
 * The game pad for two people on one screen: a compact cluster at each end, P1 at the left and P2 mirrored at the
 * right, each marked in its team's colour. One layer reads every finger on the screen and hands each touch to the
 * cluster it started in (see `duoLayout`), so both people can play at once. The rules are `padModel.ts`'s.
 */

import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { MatchRunner } from '@/game/runner';
import type { PadInput } from '@/game/sim/types';
import { color, duration, layer, opacity, pad, space, stroke } from '@/theme/tokens';
import { readableOn } from '@/ui/Bits';
import { Txt } from '@/ui/Txt';
import { PadButton, TurboRing, touchesOf } from './Controls';
import { DUO_KEYMAPS, PadModel, duoLayout, type ButtonId, type ButtonSpot, type PadLayout, type PadView } from './padModel';

export interface DuoSeat {
  /** this side's team has the ball: SHOOT / PASS, otherwise JUMP / STEAL */
  offense: boolean;
  /** sprint energy, 0..20 */
  turbo: number;
}

interface Props {
  runner: MatchRunner;
  /** P1 (home) and P2 (away) */
  seats: [DuoSeat, DuoSeat];
  /** each team's colour */
  colors: [string, string];
  enabled: boolean;
}

/** the badge over each stick */
const TAG_W = pad.knob + space.md;
const TAG_H = pad.labelMid * 2;

function Cluster({ model, layout, out, seat, fill, tag }: { model: PadModel; layout: PadLayout; out: PadInput; seat: DuoSeat; fill: string; tag: string }) {
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
    model.connect(out, view);
    return () => {
      model.reset();
      model.connect(null, null);
    };
  }, [model, out, view]);
  useEffect(() => model.setLayout(layout), [model, layout]);
  useEffect(() => model.setOffense(seat.offense), [model, seat.offense]);

  // a phone gets the cluster a little smaller than the one-player pad (see duoLayout)
  const k = layout.scale ?? 1;
  const stick = pad.stick * k;
  const knob = pad.knob * k;
  const tagW = TAG_W * k;
  const tagH = TAG_H * k;
  const baseStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: baseX.value - stick / 2 }, { translateY: baseY.value - stick / 2 }],
    opacity: opacity.dim + (1 - opacity.dim) * live.value,
  }));
  const knobStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: knobX.value }, { translateY: knobY.value }, { scale: 1 + 0.08 * live.value }],
  }));

  const spot = (id: ButtonId) => layout.spots.find((s) => s.id === id) as ButtonSpot;
  const { offense } = seat;
  return (
    <>
      <View pointerEvents="none" style={[styles.tag, { left: layout.restX - tagW / 2, top: layout.restY - stick / 2 - tagH - space.sm * k, width: tagW, height: tagH, borderRadius: tagH / 2, backgroundColor: fill }]}>
        <Txt font="display" color={readableOn(fill)} style={{ fontSize: pad.labelMid * k, lineHeight: Math.round(pad.labelMid * k * 1.12) }}>
          {tag}
        </Txt>
      </View>
      <Animated.View pointerEvents="none" style={[styles.base, { width: stick, height: stick, borderRadius: stick / 2, borderColor: fill }, baseStyle]}>
        <Animated.View style={[styles.knob, { width: knob, height: knob, borderRadius: knob / 2 }, knobStyle]}>
          <View style={[styles.knobDot, { width: knob * 0.42, height: knob * 0.42, borderRadius: knob * 0.21, backgroundColor: fill }]} />
        </Animated.View>
      </Animated.View>
      <TurboRing spot={spot('turbo')} value={seat.turbo} />
      <PadButton spot={spot('turbo')} pressed={pT} fill={color.sunDeep} label="TURBO" icon="bolt" ring={fill} scale={k} />
      <PadButton spot={spot('b')} pressed={pB} fill={color.sky} label={offense ? 'PASS' : 'STEAL'} icon={offense ? 'swap' : 'hand'} ring={fill} scale={k} />
      <PadButton spot={spot('a')} pressed={pA} fill={color.coral} label={offense ? 'SHOOT' : 'JUMP'} icon={offense ? 'ball' : 'jump'} ring={fill} scale={k} />
      {!offense && <PadButton spot={spot('sw')} pressed={pS} fill={color.grape} label="SWITCH" ring={fill} scale={k} />}
    </>
  );
}

export function DuoControls({ runner, seats, colors, enabled }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layouts = useMemo(
    () => [duoLayout(width, height, insets.left, insets.right, insets.bottom, 0), duoLayout(width, height, insets.left, insets.right, insets.bottom, 1)] as const,
    [width, height, insets.left, insets.right, insets.bottom],
  );
  const [models] = useState(() => [new PadModel(DUO_KEYMAPS[0]), new PadModel(DUO_KEYMAPS[1])] as const);

  // tooling: where each cluster's stick and buttons are, so a script can play both sides with real touches
  useEffect(() => {
    if (__DEV__) (globalThis as Record<string, unknown>).__duoLayouts = layouts.map((l) => ({ ...l, stickR: (pad.stick / 2) * (l.scale ?? 1) }));
  }, [layouts]);

  useEffect(() => {
    for (const m of models) m.setEnabled(enabled);
  }, [models, enabled]);

  // two people sharing a keyboard, for playing in a browser
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const down = (ev: KeyboardEvent) => {
      let used = false;
      for (const m of models) used = m.key(ev.code, true) || used;
      if (used) ev.preventDefault();
    };
    const up = (ev: KeyboardEvent) => {
      for (const m of models) m.key(ev.code, false);
    };
    const blur = () => {
      for (const m of models) m.reset();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [models]);

  return (
    <View
      style={styles.root}
      // every cluster sees every changed finger; each keeps only the ones that started in its own part of the screen
      onTouchStart={(e) => {
        const t = touchesOf(e);
        for (const m of models) m.start(t);
      }}
      onTouchMove={(e) => {
        const t = touchesOf(e);
        for (const m of models) m.move(t);
      }}
      onTouchEnd={(e) => {
        const t = touchesOf(e);
        for (const m of models) m.end(t);
      }}
      onTouchCancel={(e) => {
        const t = touchesOf(e);
        for (const m of models) m.end(t);
      }}>
      <Cluster model={models[0]} layout={layouts[0]} out={runner.pads[0]} seat={seats[0]} fill={colors[0]} tag="P1" />
      <Cluster model={models[1]} layout={layouts[1]} out={runner.pads[1]} seat={seats[1]} fill={colors[1]} tag="P2" />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    zIndex: layer.pad,
  },
  tag: {
    position: 'absolute',
    borderWidth: stroke.regular,
    borderColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  base: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderWidth: stroke.thick,
    backgroundColor: color.glass,
    alignItems: 'center',
    justifyContent: 'center',
  },
  knob: {
    backgroundColor: color.white,
    borderWidth: stroke.regular,
    borderColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  knobDot: {
    borderWidth: stroke.thin,
    borderColor: color.ink,
  },
});
