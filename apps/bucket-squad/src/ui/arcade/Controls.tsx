/**
 * The arcade's controls for the menu pages: a panel's lit heading, a row of tabs, a pick-one row,
 * an on/off switch with a lamp, a row of stars and the veil over something still locked.
 * Built from the kit's own pieces so they sit next to them without a seam.
 */

import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { SfxName } from '@/audio/sound';
import { tapFeedback } from '@/fx/feedback';
import { arcade, halo, inner, night, tube as tubes, tubeOf, type Tube, type TubeName } from '@/theme/arcade';
import { px, size as sizes, space } from '@/theme/tokens';
import { useWidth } from './Buttons';
import { LineIcon, type LineIconName } from './LineIcon';
import { MIN_FIT_LABEL } from './measure';
import { CountBadge } from './Surface';
import { Glow, Print } from './Type';

/** a label measured by hand may come out a touch wider than it is drawn (as in Buttons) */
const GIVE = 1.04;

export interface SignHeadProps {
  title: string;
  tube?: TubeName | Tube;
  /** a lit count after the title */
  count?: number;
  /** more at the far end of the line */
  right?: React.ReactNode;
  /** the width there is for the title: it shrinks to stay on one line */
  room?: number;
  style?: StyleProp<ViewStyle>;
}

/** A panel's heading: one line of lit sign lettering, its count, and anything that belongs at the end of the line. */
export function SignHead({ title, tube: t = 'cyan', count = 0, right, room, style }: SignHeadProps) {
  return (
    <View style={[styles.head, style]}>
      <Glow face="sign" size="large" tube={t} track="wide" room={room} tight>
        {title}
      </Glow>
      <CountBadge count={count} tube={t} />
      {right !== undefined && <View style={styles.headRight}>{right}</View>}
    </View>
  );
}

export interface Choice<T> {
  value: T;
  label: string;
  /** a few lamps over the label, for anyone who cannot read it: 1 to 3 for easy to hard, 2 or 3 for players a side */
  lamps?: number;
  /** a picture before the label */
  icon?: LineIconName;
}

export interface TabsProps<T> {
  options: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  tube?: TubeName | Tube;
  style?: StyleProp<ViewStyle>;
}

/** A row of tabs with a lit line under the one that is showing, as along the top of the collection. */
export function Tabs<T extends string | number>({ options, value, onChange, tube: t = 'cyan', style }: TabsProps<T>) {
  const tb = tubeOf(t);
  return (
    <View style={[styles.tabs, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${o.label}${on ? ', selected' : ''}`}
            onPress={() => {
              tapFeedback();
              onChange(o.value);
            }}
            style={({ pressed }) => [styles.tab, pressed && styles.pressed]}>
            <Print face="bold" size="small" color={on ? tb.tint : 'textFaint'} track="wider" upper lines={1} glow={on ? tb.glass : undefined}>
              {o.label}
            </Print>
            <View style={[styles.tabLine, on && { backgroundColor: tb.glass, boxShadow: [halo(tb.glass, 6, 0.9)] }]} />
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small round lamps in a row: how many players a side, how hard a level is. */
const Lamps = memo(function Lamps({ count, lit, tube: tb }: { count: number; lit: boolean; tube: Tube }) {
  return (
    <View style={styles.lamps}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={[styles.lamp, lit ? { backgroundColor: tb.glass, boxShadow: [halo(tb.glass, 5, 0.9)] } : undefined]} />
      ))}
    </View>
  );
});

function PickCell<T extends string | number>({ option, on, tube: tb, fill, onPick }: { option: Choice<T>; on: boolean; tube: Tube; fill: boolean; onPick: (value: T) => void }) {
  const [width, onLayout] = useWidth(fill ? option.label : undefined);
  const iconSize = px(16);
  const room = fill && width > 0 ? (width - PICK_PAD * 2 - arcade.outline * 2 - (option.icon ? iconSize + space.xs : 0)) * GIVE : undefined;
  const tall = option.lamps !== undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${option.label}${on ? ', selected' : ''}`}
      hitSlop={space.xs}
      onLayout={onLayout}
      onPress={() => {
        tapFeedback();
        onPick(option.value);
      }}
      style={({ pressed }) => [
        styles.pick,
        fill && styles.pickFill,
        tall && styles.pickTall,
        on ? { borderColor: tb.glass, backgroundColor: night.tile, boxShadow: [halo(tb.glass, 10, pressed ? 0.35 : 0.6), inner(tb.glass, 12, 0.3)] } : undefined,
        pressed && styles.pressed,
      ]}>
      {tall && <Lamps count={option.lamps ?? 0} lit={on} tube={tb} />}
      <View style={styles.pickLine}>
        {option.icon && <LineIcon name={option.icon} size={iconSize} tube={on ? tb : undefined} color={on ? undefined : night.textFaint} />}
        <Print face="display" size="small" color={on ? tb.tint : 'textDim'} track="normal" upper room={room} least={MIN_FIT_LABEL} lines={1}>
          {option.label}
        </Print>
      </View>
    </Pressable>
  );
}

export interface PickRowProps<T> {
  options: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  tube?: TubeName | Tube;
  /** the choices share the row equally (on by default); off, each is as wide as its label, for a row that scrolls */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** Pick one of a few: the chosen one is lit, the others are dark outlines. */
export function PickRow<T extends string | number>({ options, value, onChange, tube: t = 'cyan', fill = true, style }: PickRowProps<T>) {
  const tb = tubeOf(t);
  return (
    <View style={[styles.pickRow, style]}>
      {options.map((o) => (
        <PickCell key={String(o.value)} option={o} on={o.value === value} tube={tb} fill={fill} onPick={onChange} />
      ))}
    </View>
  );
}

export interface LampSwitchProps {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
  icon: LineIconName;
  /** the picture while it is off, when it differs */
  iconOff?: LineIconName;
  tube?: TubeName | Tube;
  sound?: SfxName;
  style?: StyleProp<ViewStyle>;
}

/** An on/off switch: a tile whose picture and lamp are lit when it is on and dark when it is off, with the word for which. */
export function LampSwitch({ label, on, onChange, icon, iconOff, tube: t = 'green', sound, style }: LampSwitchProps) {
  const tb = tubeOf(t);
  const [width, onLayout] = useWidth(label);
  const room = width > 0 ? (width - SWITCH_PAD * 2 - arcade.outline * 2) * GIVE : undefined;
  const press = useCallback(() => {
    tapFeedback(sound);
    onChange(!on);
  }, [on, onChange, sound]);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${label}: ${on ? 'on' : 'off'}`}
      onLayout={onLayout}
      onPress={press}
      style={({ pressed }) => [styles.switch, on ? { borderColor: tb.glass, boxShadow: [halo(tb.glass, 10, pressed ? 0.35 : 0.55), inner(tb.glass, 14, 0.28)] } : undefined, pressed && styles.pressed, style]}>
      <View style={styles.switchTop}>
        <LineIcon name={on ? icon : (iconOff ?? icon)} size={px(22)} tube={on ? tb : undefined} color={on ? undefined : night.textFaint} />
        <View style={[styles.switchLamp, on && { backgroundColor: tb.glass, borderColor: tb.tint, boxShadow: [halo(tb.glass, 8, 1)] }]} />
      </View>
      <Print face="bold" size="body" color={on ? 'text' : 'textDim'} room={room} least={MIN_FIT_LABEL}>
        {label}
      </Print>
      <Print face="display" size="micro" color={on ? tb.glass : 'textFaint'} track="wider">
        {on ? 'ON' : 'OFF'}
      </Print>
    </Pressable>
  );
}

const STAR = 'M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5-5.9-3.3-5.9 3.3 1.3-6.5-4.9-4.5 6.6-.8z';

/** One star: lit and filled when earned, a dark outline when not. */
export const Star = memo(function Star({ lit, size = px(18), tube: t = 'gold' }: { lit: boolean; size?: number; tube?: TubeName | Tube }) {
  const tb = tubeOf(t);
  const full = size * 1.25;
  const out = -size * 0.125;
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      <Svg width={full} height={full} viewBox="-3 -3 30 30" style={{ position: 'absolute', left: out, top: out }}>
        {lit && <Path d={STAR} stroke={tb.glass} strokeWidth={6} strokeLinejoin="round" opacity={0.18} fill="none" />}
        {lit && <Path d={STAR} stroke={tb.glass} strokeWidth={3.4} strokeLinejoin="round" opacity={0.4} fill="none" />}
        <Path d={STAR} fill={lit ? tb.glass : night.pit} stroke={lit ? tb.tint : night.lineLit} strokeWidth={1.6} strokeLinejoin="round" />
      </Svg>
    </View>
  );
});

/** A row of stars, the earned ones lit. */
export function StarRow({ have, of = 3, size = px(18), gap = px(3), style }: { have: number; of?: number; size?: number; gap?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View accessible accessibilityLabel={`${have} of ${of} stars`} style={[styles.stars, { gap }, style]}>
      {Array.from({ length: of }, (_, i) => (
        <Star key={i} lit={i < have} size={size} />
      ))}
    </View>
  );
}

/** A dark veil over something still locked, with a lock and the reason. */
export function LockVeil({ message, round = arcade.rPanel, style }: { message: string; round?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[StyleSheet.absoluteFill, styles.veil, { borderRadius: round }, style]}>
      <View style={styles.veilPlate}>
        <LineIcon name="lock" size={px(20)} tube="gold" />
        <Print face="bold" size="body" color="textSoft" track="tight" lines={2} style={styles.veilText}>
          {message}
        </Print>
      </View>
    </View>
  );
}

const PICK_PAD = px(10);
const SWITCH_PAD = px(10);

const styles = StyleSheet.create({
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: px(26),
  },
  headRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space.sm,
  },
  tabs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(14),
  },
  tab: {
    height: sizes.tap,
    minWidth: sizes.tap,
    justifyContent: 'center',
    alignItems: 'center',
    gap: px(5),
    paddingTop: px(5),
  },
  tabLine: {
    alignSelf: 'stretch',
    height: px(3),
    borderRadius: px(1.5),
    backgroundColor: night.line,
  },
  pickRow: {
    flexDirection: 'row',
    gap: space.sm,
  },
  pick: {
    height: sizes.tap,
    paddingHorizontal: PICK_PAD,
    alignItems: 'center',
    justifyContent: 'center',
    gap: px(4),
    backgroundColor: night.pit,
    borderWidth: arcade.outline,
    borderColor: night.line,
    borderRadius: arcade.rButton,
  },
  pickFill: {
    flexGrow: 1,
    flexBasis: 0,
  },
  pickTall: {
    height: px(52),
  },
  pickLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  lamps: {
    flexDirection: 'row',
    gap: px(4),
  },
  lamp: {
    width: px(7),
    height: px(7),
    borderRadius: px(3.5),
    backgroundColor: night.line,
  },
  switch: {
    flex: 1,
    minHeight: px(78),
    paddingHorizontal: SWITCH_PAD,
    paddingVertical: px(7),
    justifyContent: 'space-between',
    backgroundColor: night.tile,
    borderWidth: arcade.outline,
    borderColor: night.line,
    borderRadius: arcade.rTile,
  },
  switchTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLamp: {
    width: px(13),
    height: px(13),
    borderRadius: px(6.5),
    backgroundColor: night.pit,
    borderWidth: arcade.hairline,
    borderColor: night.lineLit,
  },
  stars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  veil: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.md,
    backgroundColor: night.scrim,
  },
  veilPlate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    maxWidth: '100%',
    paddingHorizontal: px(14),
    paddingVertical: px(9),
    backgroundColor: night.pit,
    borderWidth: arcade.hairline,
    borderColor: tubes.gold.glass,
    borderRadius: arcade.rWell,
    boxShadow: [halo(tubes.gold.glass, 10, 0.45)],
  },
  veilText: {
    flexShrink: 1,
  },
});
