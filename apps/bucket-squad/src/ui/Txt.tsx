/** Text in the game's fonts and colours. Every label in the app goes through here. */

import { StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { color, font, stroke, text, type ColorName } from '@/theme/tokens';
import { MIN_FIT_LABEL } from './fitName';

type SizeName = keyof typeof text;
type FontName = keyof typeof font;

export interface TxtProps {
  children: React.ReactNode;
  size?: SizeName;
  font?: FontName;
  /** a token name, or a colour that comes from data (team colours) */
  color?: ColorName | (string & {});
  center?: boolean;
  /** hard drop shadow, for display text sitting on colour */
  shadow?: boolean;
  lines?: number;
  /** shrink to fit one line */
  fit?: boolean;
  upper?: boolean;
  style?: StyleProp<TextStyle>;
}

export function resolveColor(c: ColorName | (string & {})): string {
  return (color as Record<string, string>)[c] ?? c;
}

export function Txt({ children, size = 'body', font: f = 'body', color: c = 'ink', center, shadow, lines, fit, upper, style }: TxtProps) {
  const px = text[size];
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={lines ?? (fit ? 1 : undefined)}
      adjustsFontSizeToFit={fit}
      minimumFontScale={fit ? MIN_FIT_LABEL : undefined}
      style={[
        {
          fontFamily: font[f],
          fontSize: px,
          lineHeight: Math.round(px * (f === 'display' ? 1.12 : 1.25)),
          color: resolveColor(c),
        },
        center && styles.center,
        upper && styles.upper,
        shadow && { textShadowColor: color.ink, textShadowOffset: { width: 0, height: Math.max(2, Math.round(px * 0.07)) }, textShadowRadius: 0 },
        style,
      ]}>
      {children}
    </Text>
  );
}

/** unit offsets all the way round: stacked copies of the text at these offsets make a smooth outline */
const RING: readonly (readonly [number, number])[] = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  return [Math.round(Math.cos(a) * 100) / 100, Math.round(Math.sin(a) * 100) / 100] as const;
});

export interface StickerTextProps {
  children: string;
  size?: SizeName;
  color?: ColorName | (string & {});
  outline?: ColorName | (string & {});
  /** outline thickness */
  weight?: number;
  /** how far the hard shadow drops below the letters */
  drop?: number;
  center?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Big display lettering with a thick outline and a hard shadow, like a
 * die-cut sticker. Built from stacked copies because text strokes are not
 * available on every platform.
 */
export function StickerText({ children, size = 'big', color: c = 'white', outline = 'ink', weight = stroke.regular, drop, center, style }: StickerTextProps) {
  const px = text[size];
  const d = drop ?? Math.max(3, Math.round(px * 0.09));
  const base: TextStyle = {
    fontFamily: font.display,
    fontSize: px,
    lineHeight: Math.round(px * 1.14),
    textAlign: center ? 'center' : 'left',
  };
  const edge = resolveColor(outline);
  return (
    <View style={[{ paddingHorizontal: weight, paddingTop: weight, paddingBottom: weight + d }, style]}>
      {RING.map(([x, y], i) => (
        <Text key={`s${i}`} allowFontScaling={false} style={[base, styles.layer, { color: edge, left: weight + x * weight, right: weight - x * weight, top: weight + y * weight + d }]}>
          {children}
        </Text>
      ))}
      {RING.map(([x, y], i) => (
        <Text key={`o${i}`} allowFontScaling={false} style={[base, styles.layer, { color: edge, left: weight + x * weight, right: weight - x * weight, top: weight + y * weight }]}>
          {children}
        </Text>
      ))}
      <Text allowFontScaling={false} style={[base, { color: resolveColor(c) }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  upper: { textTransform: 'uppercase' },
  layer: { position: 'absolute' },
});
