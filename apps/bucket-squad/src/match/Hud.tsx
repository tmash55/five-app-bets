/** The match overlay: scoreboard, shot clock, hype bars and the big pop-up callouts. */

import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { HudState } from '@/game/runner';
import { color, duration, layer, radius, size as sizes, space, stroke, type ColorName } from '@/theme/tokens';
import { Avatar, ProgressBar, readableOn } from '@/ui/Bits';
import { Sticker } from '@/ui/Sticker';
import { StickerText, Txt } from '@/ui/Txt';
import type { Callout, CalloutTone } from './director';

function clockText(tenths: number): string {
  if (tenths < 100) return `${Math.floor(tenths / 10)}.${tenths % 10}`;
  const s = Math.ceil(tenths / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const HypeBar = memo(function HypeBar({ value, fill, flip }: { value: number; fill: string; flip?: boolean }) {
  const on = value > 20;
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = on ? withRepeat(withTiming(1, { duration: duration.slow, easing: Easing.inOut(Easing.quad) }), -1, true) : withTiming(0, { duration: duration.normal });
  }, [on, glow]);
  const style = useAnimatedStyle(() => ({ opacity: 1 - 0.45 * glow.value, transform: [{ scaleY: 1 + 0.25 * glow.value }] }));
  return (
    <Animated.View style={[styles.hype, flip && styles.flip, style]}>
      <ProgressBar value={on ? 1 : value / 20} fill={on ? 'sun' : fill} track="paperDim" height={sizes.bar - 2} />
    </Animated.View>
  );
});

const TeamBlock = memo(function TeamBlock({ short, fill, score, hype, flip }: { short: string; fill: string; score: number; hype: number; flip?: boolean }) {
  const pop = useSharedValue(1);
  const last = useRef(score);
  useEffect(() => {
    if (score !== last.current) {
      last.current = score;
      pop.value = withSequence(withTiming(1.35, { duration: duration.quick }), withSpring(1, { damping: 9, stiffness: 260 }));
    }
  }, [score, pop]);
  const scoreStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <View style={[styles.team, flip && styles.teamFlip]}>
      <View style={[styles.chip, { backgroundColor: fill }]}>
        <Txt font="display" size="small" color={readableOn(fill)}>
          {short}
        </Txt>
      </View>
      <View style={styles.scoreCol}>
        <Animated.View style={scoreStyle}>
          <Txt font="display" size="title" center>
            {String(score)}
          </Txt>
        </Animated.View>
        <HypeBar value={hype} fill={fill} flip={flip} />
      </View>
    </View>
  );
});

export const Scoreboard = memo(function Scoreboard({ hud, names, colors }: { hud: HudState; names: [string, string]; colors: [string, string] }) {
  const insets = useSafeAreaInsets();
  const low = hud.shotClock <= 5;
  const period = hud.overtime ? 'OT' : `Q${hud.quarter}`;
  const showShot = hud.phase === 'live' || hud.phase === 'inbound';
  return (
    <View pointerEvents="none" style={[styles.top, { top: Math.max(insets.top, space.sm) }]}>
      <Sticker fill="paper" round="lg" raise="low" face={styles.board}>
        <TeamBlock short={names[0]} fill={colors[0]} score={hud.score[0]} hype={hud.hype[0]} />
        <View style={styles.middle}>
          <Txt font="display" size="tiny" color="inkSoft">
            {period}
          </Txt>
          <Txt font="display" size="large" color={!hud.overtime && hud.clock < 100 ? 'coralDeep' : 'ink'}>
            {hud.overtime ? 'NEXT WINS' : clockText(hud.clock)}
          </Txt>
        </View>
        <TeamBlock short={names[1]} fill={colors[1]} score={hud.score[1]} hype={hud.hype[1]} flip />
      </Sticker>
      {showShot && (
        <View style={[styles.shot, { backgroundColor: low ? color.coral : color.sun }]}>
          <Txt font="display" size="small" color={low ? 'white' : 'ink'}>
            {String(Math.max(0, hud.shotClock))}
          </Txt>
        </View>
      )}
    </View>
  );
});

/** Who the person is controlling right now, at the bottom of the screen. */
export const ControlPlate = memo(function ControlPlate({ playerId, name, fill, hyped }: { playerId: string; name: string; fill: string; hyped: boolean }) {
  const insets = useSafeAreaInsets();
  const pop = useSharedValue(1);
  useEffect(() => {
    pop.value = withSequence(withTiming(1.12, { duration: duration.quick }), withSpring(1, { damping: 10, stiffness: 260 }));
  }, [playerId, pop]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.plate, { bottom: Math.max(insets.bottom, space.sm) }, style]}>
      <Sticker fill={hyped ? 'sun' : 'paper'} round="pill" raise="low" face={styles.plateFace}>
        <Avatar id={playerId} diameter={sizes.avatarSmall} fill={fill} />
        <Txt font="display" size="body" lines={1}>
          {name}
        </Txt>
      </Sticker>
    </Animated.View>
  );
});

// ---------------------------------------------------------------------------
// Callouts
// ---------------------------------------------------------------------------

export interface CalloutHandle {
  show: (c: Callout) => void;
  clear: () => void;
}

function toneColor(tone: CalloutTone, colors: [string, string]): ColorName | (string & {}) {
  switch (tone) {
    case 'home':
      return colors[0];
    case 'away':
      return colors[1];
    case 'gold':
      return 'sun';
    case 'perfect':
      return 'perfect';
    case 'good':
      return 'good';
    case 'okay':
      return 'okay';
    case 'bad':
      return 'bad';
    default:
      return 'white';
  }
}

interface Shown extends Callout {
  key: number;
}

function Lane({ item, colors, note }: { item: Shown | null; colors: [string, string]; note?: boolean }) {
  const scale = useSharedValue(0);
  const fade = useSharedValue(0);
  const tilt = useSharedValue(0);
  const key = item?.key ?? 0;
  const hold = item?.hold ?? 1;
  useEffect(() => {
    if (!key) {
      fade.value = withTiming(0, { duration: duration.quick });
      return;
    }
    scale.value = 0.35;
    scale.value = withSpring(1, { damping: 8, stiffness: 240, mass: 0.7 });
    tilt.value = key % 2 === 0 ? -5 : 5;
    tilt.value = withSpring(key % 2 === 0 ? -1.5 : 1.5, { damping: 10, stiffness: 180 });
    fade.value = withSequence(withTiming(1, { duration: 70 }), withDelay(Math.max(200, hold * 1000 - 200), withTiming(0, { duration: duration.normal })));
  }, [key, hold, scale, fade, tilt]);
  const style = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ scale: scale.value }, { rotate: `${tilt.value}deg` }, { translateY: (1 - fade.value) * -14 }],
  }));
  if (!item) return null;
  const fill = toneColor(item.tone, colors);
  // very dark team colours need a light outline to stay readable over the court
  return (
    <Animated.View pointerEvents="none" style={[note ? styles.noteLane : styles.mainLane, style]}>
      <StickerText size={note ? 'title' : item.big ? 'huge' : 'big'} color={fill} center>
        {item.text}
      </StickerText>
      {item.sub !== undefined && (
        <Txt font="display" size={item.big ? 'large' : 'body'} color="white" shadow center>
          {item.sub}
        </Txt>
      )}
    </Animated.View>
  );
}

export const CalloutLayer = forwardRef<CalloutHandle, { colors: [string, string] }>(function CalloutLayer({ colors }, ref) {
  const [main, setMain] = useState<Shown | null>(null);
  const [note, setNote] = useState<Shown | null>(null);
  const counter = useRef(1);
  const show = useCallback((c: Callout) => {
    const item = { ...c, key: ++counter.current };
    if (c.lane === 'note') setNote(item);
    else setMain(item);
  }, []);
  const clear = useCallback(() => {
    setMain(null);
    setNote(null);
  }, []);
  useImperativeHandle(ref, () => ({ show, clear }), [show, clear]);
  return (
    <View pointerEvents="none" style={styles.callouts}>
      <Lane item={main} colors={colors} />
      <Lane item={note} colors={colors} note />
    </View>
  );
});

const styles = StyleSheet.create({
  top: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: layer.hud,
  },
  board: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minWidth: sizes.scoreboard,
  },
  team: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  teamFlip: {
    flexDirection: 'row-reverse',
  },
  chip: {
    minWidth: sizes.tap,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    borderRadius: radius.sm,
    borderWidth: stroke.thin,
    borderColor: color.ink,
    alignItems: 'center',
  },
  scoreCol: {
    flex: 1,
    minWidth: sizes.tap,
    alignItems: 'stretch',
  },
  hype: {
    marginTop: -space.hair,
  },
  flip: {
    transform: [{ scaleX: -1 }],
  },
  middle: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    minWidth: sizes.avatarLarge + space.lg,
    borderLeftWidth: stroke.thin,
    borderRightWidth: stroke.thin,
    borderColor: color.ink,
    backgroundColor: color.white,
  },
  shot: {
    marginTop: -space.xs,
    minWidth: sizes.buttonSmall,
    paddingHorizontal: space.sm,
    borderRadius: radius.md,
    borderWidth: stroke.regular,
    borderColor: color.ink,
    alignItems: 'center',
  },
  plate: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: layer.hud,
  },
  plateFace: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingLeft: space.xs,
    paddingRight: space.md,
    paddingVertical: space.hair,
  },
  callouts: {
    ...StyleSheet.absoluteFill,
    zIndex: layer.callout,
  },
  mainLane: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '21%',
    alignItems: 'center',
  },
  noteLane: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '56%',
    alignItems: 'center',
  },
});
