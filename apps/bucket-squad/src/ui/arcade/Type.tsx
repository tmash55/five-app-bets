/**
 * Arcade lettering. `Print` is plain print, `Glow` is a lit neon tube.
 * Every label on a menu page goes through one of the two.
 */

import { Platform, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { fade, neonFont, neonLeading, neonText, night, track as tracks, tubeOf, type NeonFace, type NeonSize, type NightName, type Tube, type TubeName } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { fitTo } from './measure';

export type TrackName = keyof typeof tracks;

/** A colour of the room by name, or a colour that comes from data (a team's, a tube's). */
export function paint(c: NightName | (string & {})): string {
  return (night as Record<string, string>)[c] ?? c;
}

/** A lettering size by name, or a size already worked out for this screen. */
export function sizeOf(s: NeonSize | number): number {
  return typeof s === 'number' ? s : neonText[s];
}

function gapOf(t: TrackName | number): number {
  return typeof t === 'number' ? t : tracks[t];
}

/** how far the soft light round plain print reaches */
const SOFT_GLOW = px(8);

/**
 * A line fitted to its room is measured by hand, and a phone may draw it a point or two wider than that.
 * A browser lets such a line run over the edge of its box where nobody sees it; a phone cuts it and adds dots
 * ("KEEP MY GA..."). So on a phone the line may finish the shrinking itself.
 */
const FITS_ITSELF = Platform.OS === 'web' ? null : ({ adjustsFontSizeToFit: true, minimumFontScale: 0.72 } as const);

export interface PrintProps {
  children: React.ReactNode;
  face?: NeonFace;
  /** a size by name, or a size in screen points (something worked out from a layout) */
  size?: NeonSize | number;
  color?: NightName | (string & {});
  /** the gap between letters */
  track?: TrackName | number;
  center?: boolean;
  right?: boolean;
  upper?: boolean;
  lines?: number;
  /** the width there is: the line shrinks to stay on one line inside it (plain text only) */
  room?: number;
  /** how far it may shrink, as a share of its size */
  least?: number;
  /** a soft light round the letters, in this colour (`#RRGGBB`) */
  glow?: string;
  style?: StyleProp<TextStyle>;
}

export function Print({ children, face = 'body', size = 'body', color = 'text', track = 'none', center, right, upper, lines, room, least, glow, style }: PrintProps) {
  const base = sizeOf(size);
  const gap = gapOf(track);
  const plain = typeof children === 'string' || typeof children === 'number' ? String(children) : undefined;
  const fs = room !== undefined && plain !== undefined ? fitTo(upper ? plain.toUpperCase() : plain, face, base, room, gap, least) : base;
  return (
    <Text
      allowFontScaling={false}
      numberOfLines={lines ?? (room !== undefined ? 1 : undefined)}
      {...(room !== undefined ? FITS_ITSELF : null)}
      style={[
        { fontFamily: neonFont[face], fontSize: fs, lineHeight: Math.round(fs * neonLeading[face]), color: paint(color), letterSpacing: gap * (fs / base) },
        center && styles.center,
        right && styles.right,
        upper && styles.upper,
        // the light must not be cut off at the edge of the text's own box
        glow !== undefined && { textShadowColor: fade(glow, 0.75), textShadowOffset: ZERO, textShadowRadius: SOFT_GLOW, padding: SOFT_GLOW, margin: -SOFT_GLOW, maxWidth: ROOMY },
        style,
      ]}>
      {children}
    </Text>
  );
}

const ZERO = { width: 0, height: 0 } as const;
/**
 * Lettering with light round it gets padding for the light and takes it back with a margin, so it is wider than
 * the box it sits in. A one-line text on the web is held to its box's width unless told it may be wider.
 */
const ROOMY = '1000%';

export interface GlowProps {
  children: string;
  face?: NeonFace;
  size?: NeonSize | number;
  /** the tube it is bent from */
  tube?: TubeName | Tube;
  track?: TrackName | number;
  center?: boolean;
  /** the width there is: the sign shrinks to stay on one line inside it */
  room?: number;
  least?: number;
  /** switched off, it is a dark tube on the wall */
  lit?: boolean;
  /** how far the light spreads: a big sign throws it wide, small lettering keeps it close */
  spread?: 'wide' | 'close';
  /** capitals only, in a tight spot: the line is no taller than the letters */
  tight?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Lettering lit like a neon tube: near-white letters with coloured light round them.
 * A phone can give a text one shadow only, so the light is built from copies of the
 * lettering stacked under it, each throwing its own.
 */
export function Glow({ children, face = 'display', size = 'title', tube: t = 'pink', track = 'close', center, room, least, lit = true, spread, tight, style }: GlowProps) {
  const tb = tubeOf(t);
  const base = sizeOf(size);
  const gap = gapOf(track);
  const fs = room !== undefined ? fitTo(children, face, base, room, gap, least) : base;
  const wide = (spread ?? (face === 'display' || fs >= neonText.title * 1.2 ? 'wide' : 'close')) === 'wide';
  const reach = Math.round(fs * (wide ? 1.04 : 0.7));
  const type: TextStyle = {
    fontFamily: neonFont[face],
    fontSize: fs,
    lineHeight: Math.round(fs * (tight ? 1.04 : neonLeading[face])),
    letterSpacing: gap * (fs / base),
    textAlign: center ? 'center' : 'left',
    textShadowOffset: ZERO,
  };
  if (!lit) {
    return (
      <View style={style}>
        <Text allowFontScaling={false} numberOfLines={1} style={[type, { color: night.lineLit }]}>
          {children}
        </Text>
      </View>
    );
  }
  // room round each copy for its light, taken back with a margin so the layout is the lettering alone
  const under: TextStyle = { position: 'absolute', left: -reach, right: -reach, top: -reach, padding: reach, maxWidth: ROOMY };
  return (
    <View style={style}>
      {/* the copies are only light: a screen reader gets the lettering once, from the top layer */}
      <View pointerEvents="none" aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={StyleSheet.absoluteFill}>
        {wide && (
          <Text allowFontScaling={false} numberOfLines={1} style={[type, under, { color: tb.glass, textShadowColor: fade(tb.glass, 0.7), textShadowRadius: reach }]}>
            {children}
          </Text>
        )}
        <Text allowFontScaling={false} numberOfLines={1} style={[type, under, { color: tb.glass, textShadowColor: tb.glass, textShadowRadius: wide ? reach * 0.5 : reach }]}>
          {children}
        </Text>
      </View>
      <Text allowFontScaling={false} numberOfLines={1} style={[type, { color: tb.tint, textShadowColor: tb.glass, textShadowRadius: wide ? reach * 0.17 : reach * 0.36, padding: reach, margin: -reach, maxWidth: ROOMY }]}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  right: { textAlign: 'right' },
  upper: { textTransform: 'uppercase' },
});
