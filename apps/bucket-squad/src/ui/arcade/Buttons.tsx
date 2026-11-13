/**
 * The arcade's buttons. One yellow button says "this is what you do next" on every page;
 * everything else is a dark button with a lit edge.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import type { SfxName } from '@/audio/sound';
import { tapFeedback } from '@/fx/feedback';
import { arcade, goldButton, halo, inner, neonText, night, ring, tube as tubes, tubeOf, type Tube, type TubeName } from '@/theme/arcade';
import { px, size as sizes, space } from '@/theme/tokens';
import { Coin, LineIcon, type LineIconName } from './LineIcon';
import { MIN_FIT_LABEL } from './measure';
import { CountBadge } from './Surface';
import { Glow, Print } from './Type';

/**
 * The widest a box has been laid out (0 until it has been), and the handler that learns it.
 *
 * A label is shrunk to fit the box it is in. If the box is only as wide as its label, a smaller label makes
 * a narrower box, which would shrink the label again: so the box's widest layout is the one that counts,
 * until `what` (the label) changes.
 */
export function useWidth(what?: string): [number, (e: LayoutChangeEvent) => void] {
  const [seen, setSeen] = useState({ what, width: 0 });
  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const width = e.nativeEvent.layout.width;
      setSeen((was) => (was.what !== what || width > was.width ? { what, width } : was));
    },
    [what],
  );
  return [seen.what === what ? seen.width : 0, onLayout];
}

/** a label measured by hand may come out a touch wider than it is drawn: let it into the padding before shrinking it */
const GIVE = 1.04;

type GoldSize = 'big' | 'regular' | 'small';

const GOLD: Record<GoldSize, { height: number; round: number; lip: number; padX: number; gap: number; label: number; icon: number; ring: boolean; glow: readonly [number, number, number] }> = {
  big: { height: px(88), round: arcade.rBig, lip: px(6), padX: px(18), gap: px(14), label: neonText.huge, icon: px(46), ring: true, glow: [22, 0.75, 4] },
  regular: { height: px(60), round: arcade.rTile, lip: px(6), padX: px(16), gap: px(12), label: px(25), icon: px(24), ring: true, glow: [22, 0.7, 4] },
  small: { height: sizes.tap, round: arcade.rButton, lip: px(4), padX: px(12), gap: px(8), label: neonText.large, icon: px(18), ring: false, glow: [12, 0.65, 0] },
};

export interface GoldButtonProps {
  label: string;
  /** a second, smaller line under the label (the big button) */
  sub?: string;
  /** a picture before the label */
  icon?: LineIconName;
  /** a picture after the label */
  iconAfter?: LineIconName;
  size?: GoldSize;
  onPress?: () => void;
  disabled?: boolean;
  /** skip the click sound (the caller plays its own) */
  quiet?: boolean;
  sound?: SfxName;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** The yellow button: the one thing on the page that is lit all the way through. */
export function GoldButton({ label, sub, icon, iconAfter, size = 'regular', onPress, disabled, quiet, sound, accessibilityLabel, style }: GoldButtonProps) {
  const g = GOLD[size];
  const [width, onLayout] = useWidth(label);
  const press = useCallback(() => {
    if (!quiet) tapFeedback(sound);
    onPress?.();
  }, [onPress, quiet, sound]);
  const used = g.padX * 2 + (icon ? g.icon + g.gap : 0) + (iconAfter ? g.icon + g.gap : 0);
  const room = width > 0 ? (width - used) * GIVE : undefined;
  const big = size === 'big';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (sub ? `${label}. ${sub}` : label)}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={space.xs}
      onPress={press}
      onLayout={onLayout}
      style={({ pressed }) => [
        { borderRadius: g.round, transform: [{ translateY: pressed ? px(2) : 0 }] },
        !disabled && { boxShadow: [...(g.ring ? [ring(goldButton.ring, 3)] : []), halo(goldButton.glow, g.glow[0] * (pressed ? 0.6 : 1), g.glow[1] * (pressed ? 0.7 : 1), g.glow[2])] },
        disabled && styles.off,
        style,
      ]}>
      <View style={[styles.goldFace, { height: g.height, borderRadius: g.round, paddingHorizontal: g.padX, gap: g.gap }, big && styles.goldBig]}>
        <LinearGradient colors={[goldButton.top, goldButton.bottom]} style={StyleSheet.absoluteFill} />
        {/* the darker band along the bottom edge that makes it a button and not a label */}
        <View style={[styles.lip, { height: g.lip }]} />
        {icon && <LineIcon name={icon} size={g.icon} color={night.onLight} weight={big ? 2 : 3.4} />}
        <View style={big ? styles.goldWords : undefined}>
          <Print face="display" size={g.label} color="onLight" track="wide" room={room} least={MIN_FIT_LABEL} style={big ? styles.goldBigLabel : undefined}>
            {label}
          </Print>
          {sub !== undefined && (
            <Print face="bold" size="small" color="onLight" track="close" room={room} least={MIN_FIT_LABEL} style={styles.goldSub}>
              {sub}
            </Print>
          )}
        </View>
        {iconAfter && <LineIcon name={iconAfter} size={g.icon} color={night.onLight} weight={3.6} />}
      </View>
    </Pressable>
  );
}

export interface PriceButtonProps {
  price: number;
  /** false when the player cannot pay yet: the button goes quiet but can still be pressed, to say why */
  can?: boolean;
  onPress?: () => void;
  quiet?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** A price in coins on a dark button with a gold edge. */
export function PriceButton({ price, can = true, onPress, quiet, accessibilityLabel, style }: PriceButtonProps) {
  const press = useCallback(() => {
    if (!quiet) tapFeedback();
    onPress?.();
  }, [onPress, quiet]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${price.toLocaleString('en-US')} coins`}
      hitSlop={space.xs}
      onPress={press}
      style={({ pressed }) => [styles.price, can ? { borderColor: tubes.gold.glass, boxShadow: [halo(tubes.gold.glass, 10, pressed ? 0.35 : 0.6)] } : styles.priceOff, pressed && styles.pressed, style]}>
      <Coin size={px(20)} />
      <Print face="bold" size={px(20)} color={can ? tubes.gold.glass : 'textDim'} track="widest">
        {price.toLocaleString('en-US')}
      </Print>
    </Pressable>
  );
}

export interface RoundButtonProps {
  icon: LineIconName;
  /** read by screen readers */
  label: string;
  onPress?: () => void;
  /** lit in this tube; left out, it is a quiet dark button */
  tube?: TubeName | Tube;
  quiet?: boolean;
  sound?: SfxName;
  disabled?: boolean;
}

/** A small round button in the top bar (back, settings), inside a full-size place to tap. */
export function RoundButton({ icon, label, onPress, tube: t, quiet, sound, disabled }: RoundButtonProps) {
  const tb = t !== undefined ? tubeOf(t) : undefined;
  const press = useCallback(() => {
    if (!quiet) tapFeedback(sound);
    onPress?.();
  }, [onPress, quiet, sound]);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !!disabled }} disabled={disabled} onPress={press} style={({ pressed }) => [styles.roundTap, pressed && styles.pressed, disabled && styles.off]}>
      <View style={[styles.round, tb ? { borderColor: tb.glass, boxShadow: [halo(tb.glass, 8, 0.6)] } : undefined]}>
        <LineIcon name={icon} size={icon === 'back' || icon === 'close' ? px(17) : px(19)} color={tb ? tb.tint : night.textDim} weight={icon === 'back' || icon === 'close' ? 3.2 : 2} />
      </View>
    </Pressable>
  );
}

export interface GhostButtonProps {
  label: string;
  icon?: LineIconName;
  tube?: TubeName | Tube;
  small?: boolean;
  /** switched off it is a quiet outline: a choice not taken, a thing not on */
  lit?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  quiet?: boolean;
  sound?: SfxName;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** A dark button with a lit edge, for everything that is not the next thing to do. */
export function GhostButton({ label, icon, tube: t = 'cyan', small, lit = true, onPress, disabled, quiet, sound, accessibilityLabel, style }: GhostButtonProps) {
  const tb = tubeOf(t);
  const [width, onLayout] = useWidth(label);
  const press = useCallback(() => {
    if (!quiet) tapFeedback(sound);
    onPress?.();
  }, [onPress, quiet, sound]);
  const iconSize = small ? px(16) : px(19);
  const padX = small ? px(10) : px(14);
  const room = width > 0 ? (width - padX * 2 - (icon ? iconSize + space.sm : 0) - arcade.outline * 2) * GIVE : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={space.xs}
      onPress={press}
      onLayout={onLayout}
      style={({ pressed }) => [
        styles.ghost,
        small && styles.ghostSmall,
        { paddingHorizontal: padX },
        lit ? { borderColor: tb.glass, boxShadow: [halo(tb.glass, 10, pressed ? 0.35 : 0.6), inner(tb.glass, 12, 0.25)] } : styles.ghostOff,
        pressed && styles.pressed,
        disabled && styles.off,
        style,
      ]}>
      {icon && <LineIcon name={icon} size={iconSize} tube={lit ? tb : undefined} color={lit ? undefined : night.textFaint} weight={2.2} />}
      <Print face="display" size={small ? 'small' : 'body'} color={lit ? tb.tint : 'textDim'} track="normal" room={room} least={MIN_FIT_LABEL}>
        {label}
      </Print>
    </Pressable>
  );
}

export interface NeonTileProps {
  tube: TubeName | Tube;
  icon: LineIconName;
  title: string;
  /** one short line under the title */
  sub?: string;
  /** a lit number on its corner */
  badge?: number;
  onPress?: () => void;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

/** A sign you can press: one of the places the home page leads to. */
export function NeonTile({ tube: t, icon, title, sub, badge = 0, onPress, accessibilityLabel, style }: NeonTileProps) {
  const tb = tubeOf(t);
  const [width, onLayout] = useWidth(title);
  const room = width > 0 ? (width - TILE_PAD_X * 2 - arcade.outline * 2) * GIVE : undefined;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? (sub ? `${title}. ${sub}` : title)}
      onPress={() => {
        tapFeedback();
        onPress?.();
      }}
      onLayout={onLayout}
      style={({ pressed }) => [styles.tile, { borderColor: tb.glass, boxShadow: [halo(tb.glass, 12, pressed ? 0.45 : 0.7), inner(tb.glass, 14, 0.3)] }, pressed && styles.pressed, style]}>
      <LineIcon name={icon} size={px(24)} tube={tb} />
      <Glow face="sign" size="sign" tube={tb} track="wide" room={room} tight style={styles.tileTitle}>
        {title}
      </Glow>
      {sub !== undefined && (
        <Print face="body" size="tiny" color="textMuted" track="tight" room={room} style={styles.tileSub}>
          {sub}
        </Print>
      )}
      <CountBadge count={badge} tube={tb} style={styles.tileBadge} />
    </Pressable>
  );
}

const TILE_PAD_X = px(11);

const styles = StyleSheet.create({
  off: {
    opacity: 0.45,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  goldFace: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  goldBig: {
    justifyContent: 'flex-start',
  },
  goldWords: {
    flexShrink: 1,
  },
  goldBigLabel: {
    lineHeight: px(42),
  },
  goldSub: {
    marginTop: px(3),
  },
  lip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: goldButton.lip,
  },
  price: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: px(7),
    height: sizes.tap,
    paddingHorizontal: px(14),
    backgroundColor: night.pit,
    borderWidth: arcade.outline,
    borderRadius: arcade.rButton,
  },
  priceOff: {
    borderColor: night.lineLit,
  },
  roundTap: {
    width: sizes.tap,
    height: sizes.tap,
    alignItems: 'center',
    justifyContent: 'center',
  },
  round: {
    width: arcade.round,
    height: arcade.round,
    borderRadius: arcade.round / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.pit,
    borderWidth: arcade.hairline,
    borderColor: night.line,
  },
  ghost: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: sizes.tap,
    backgroundColor: night.pit,
    borderWidth: arcade.outline,
    borderRadius: arcade.rButton,
  },
  ghostSmall: {
    height: px(36),
    borderRadius: arcade.rCell,
  },
  ghostOff: {
    borderColor: night.lineLit,
  },
  tile: {
    justifyContent: 'center',
    minHeight: px(84),
    paddingVertical: px(7),
    paddingHorizontal: TILE_PAD_X,
    backgroundColor: night.tile,
    borderWidth: arcade.outline,
    borderRadius: arcade.rTile,
  },
  tileTitle: {
    marginTop: px(3),
  },
  tileSub: {
    marginTop: px(2),
  },
  tileBadge: {
    position: 'absolute',
    right: -px(8),
    top: -px(10),
  },
});
