/**
 * The sticker look: a flat shape with a thick ink outline sitting on a hard
 * shadow. `Sticker` is the plain shape, `StickerButton` is the pressable one
 * that squashes down onto its shadow.
 */

import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from 'react-native';

import { tapFeedback } from '@/fx/feedback';
import { lift, opacity, radius, size as sizes, space, stroke, type ColorName } from '@/theme/tokens';
import { Icon, type IconName } from './Icon';
import { Txt, resolveColor } from './Txt';

type LiftName = keyof typeof lift;
type RadiusName = keyof typeof radius;

export interface StickerProps {
  children?: React.ReactNode;
  fill?: ColorName | (string & {});
  edge?: ColorName | (string & {});
  round?: RadiusName;
  raise?: LiftName | 'none';
  /** how far the face is pushed down onto its shadow, 0..1 */
  pressed?: number;
  border?: number;
  style?: StyleProp<ViewStyle>;
  /** style of the face (padding, layout of the children) */
  face?: StyleProp<ViewStyle>;
}

export function Sticker({ children, fill = 'paper', edge = 'ink', round = 'lg', raise = 'mid', pressed = 0, border = stroke.regular, style, face }: StickerProps) {
  const drop = raise === 'none' ? 0 : lift[raise];
  const r = radius[round];
  const edgeColor = resolveColor(edge);
  return (
    <View style={[{ paddingBottom: drop }, style]}>
      {drop > 0 && <View style={[styles.shadow, { top: drop, borderRadius: r, backgroundColor: edgeColor }]} />}
      <View
        style={[
          styles.face,
          { borderRadius: r, borderWidth: border, borderColor: edgeColor, backgroundColor: resolveColor(fill), transform: [{ translateY: drop * pressed }] },
          face,
        ]}>
        {children}
      </View>
    </View>
  );
}

export interface StickerButtonProps extends Omit<StickerProps, 'pressed'> {
  onPress?: (e: GestureResponderEvent) => void;
  disabled?: boolean;
  /** shown instead of children: a label, with an optional icon before it */
  label?: string;
  icon?: IconName;
  iconColor?: ColorName | (string & {});
  textColor?: ColorName | (string & {});
  textSize?: 'small' | 'body' | 'large' | 'title' | 'big';
  /** a smaller font size for a label that has to fit a narrow button (the button keeps its height) */
  labelPx?: number;
  height?: number;
  /** skip the click sound (the caller plays its own) */
  quiet?: boolean;
  hitSlop?: number;
  accessibilityLabel?: string;
  /** fill the height the button is given (for big cards in a row) */
  stretch?: boolean;
}

export function StickerButton({
  onPress,
  disabled,
  label,
  icon,
  iconColor,
  textColor = 'ink',
  textSize = 'large',
  labelPx,
  height,
  quiet,
  hitSlop = space.xs,
  accessibilityLabel,
  stretch,
  children,
  style,
  face,
  ...rest
}: StickerButtonProps) {
  const [down, setDown] = useState(false);
  const press = useCallback(
    (e: GestureResponderEvent) => {
      if (!quiet) tapFeedback();
      onPress?.(e);
    },
    [onPress, quiet],
  );
  const iconSize = textSize === 'small' ? sizes.iconSmall : textSize === 'big' || textSize === 'title' ? sizes.iconLarge : sizes.icon;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={press}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      style={[disabled && styles.disabled, style]}>
      <Sticker {...rest} pressed={down ? 1 : 0} style={stretch ? styles.stretch : undefined} face={[styles.buttonFace, height !== undefined && { height }, stretch && styles.stretch, face]}>
        {children ?? (
          <>
            {icon && <Icon name={icon} size={iconSize} color={iconColor ?? textColor} />}
            {label !== undefined && (
              <Txt font="display" size={textSize} color={textColor} lines={1} style={labelPx !== undefined && { fontSize: labelPx }}>
                {label}
              </Txt>
            )}
          </>
        )}
      </Sticker>
    </Pressable>
  );
}

/** A round icon-only button (back, pause, settings). */
export function IconButton({
  name,
  onPress,
  fill = 'paper',
  iconColor = 'ink',
  diameter = sizes.tap,
  label,
  disabled,
  quiet,
}: {
  name: IconName;
  onPress?: () => void;
  fill?: ColorName | (string & {});
  iconColor?: ColorName | (string & {});
  diameter?: number;
  /** read by screen readers */
  label: string;
  disabled?: boolean;
  /** skip the click sound (the caller plays its own) */
  quiet?: boolean;
}) {
  return (
    <StickerButton
      onPress={onPress}
      disabled={disabled}
      quiet={quiet}
      fill={fill}
      round="pill"
      raise="low"
      accessibilityLabel={label}
      hitSlop={Math.max(space.xs, Math.ceil((sizes.tap - diameter) / 2))}
      face={{ width: diameter, height: diameter, minHeight: diameter, paddingHorizontal: 0 }}>
      <Icon name={name} size={Math.round(diameter * 0.5)} color={iconColor} />
    </StickerButton>
  );
}

const styles = StyleSheet.create({
  shadow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  face: {
    overflow: 'hidden',
  },
  buttonFace: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    minHeight: sizes.tap,
  },
  disabled: {
    opacity: opacity.dim,
  },
  stretch: {
    flex: 1,
  },
});
