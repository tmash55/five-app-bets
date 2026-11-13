/**
 * Ratings as rows of lamps. A child who cannot read "92" yet can still see that
 * nine lamps are lit, so every rating in the arcade is shown this way first and
 * as a number second.
 */

import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { arcade, halo, night, tubeOf, type Tube, type TubeName } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { Print } from './Type';

/** How many of `lamps` a rating out of 100 lights. */
export function lampsFor(value: number, lamps = 10): number {
  return Math.max(0, Math.min(lamps, Math.round((value / 100) * lamps)));
}

export interface SegBarProps {
  /** a rating out of 100 */
  value?: number;
  /** how many lamps are lit, when the caller counts them itself (a bar filling up lamp by lamp) */
  lit?: number;
  lamps?: number;
  tube?: TubeName | Tube;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A row of lamps, lit from the left. */
export const SegBar = memo(function SegBar({ value = 0, lit, lamps = 10, tube: t = 'cyan', small, style }: SegBarProps) {
  const tb = tubeOf(t);
  const on = lit ?? lampsFor(value, lamps);
  return (
    <View aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[styles.bar, small && styles.barSmall, style]}>
      {Array.from({ length: lamps }, (_, i) => (
        <View key={i} style={[styles.lamp, small && styles.lampSmall, i < on ? { backgroundColor: tb.glass, boxShadow: [halo(tb.glass, 5, 0.9)] } : undefined]} />
      ))}
    </View>
  );
});

export interface StatRowProps {
  label: string;
  /** the rating out of 100: shown as a number at the end of the row */
  value: number;
  /** lamps lit, when the row is filling up; the rating's own count when left out */
  lit?: number;
  /** the number shown, when it is counting up */
  shown?: number;
  tube?: TubeName | Tube;
  small?: boolean;
  /** hide the number: for the very young, the lamps are the rating */
  bare?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** One rating: its name, its lamps and its number. */
export const StatRow = memo(function StatRow({ label, value, lit, shown, tube: t = 'cyan', small, bare, style }: StatRowProps) {
  return (
    <View accessible accessibilityLabel={`${label} ${value}`} style={[styles.row, small && styles.rowSmall, style]}>
      <Print face="bold" size={small ? px(11) : px(12.5)} color="textDim" track={small ? 'normal' : 'wide'} lines={1} style={small ? styles.labelSmall : styles.label}>
        {label}
      </Print>
      <SegBar value={value} lit={lit} tube={t} small={small} style={styles.grow} />
      {!bare && (
        <Print face="bold" size={small ? px(12.5) : px(15)} right lines={1} style={small ? styles.numberSmall : styles.number}>
          {String(shown ?? value)}
        </Print>
      )}
    </View>
  );
});

/** Round lamps for counting a few things: three of a team's six players, two of three stars. */
export function Pips({ have, of, tube: t = 'cyan', size = px(12), style }: { have: number; of: number; tube?: TubeName | Tube; size?: number; style?: StyleProp<ViewStyle> }) {
  const tb = tubeOf(t);
  return (
    <View aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[styles.pips, style]}>
      {Array.from({ length: of }, (_, i) => (
        <View
          key={i}
          style={[styles.pip, { width: size, height: size, borderRadius: size / 2 }, i < have ? { backgroundColor: tb.glass, borderColor: tb.glass, boxShadow: [halo(tb.glass, 6, 0.9)] } : undefined]}
        />
      ))}
    </View>
  );
}

/** A short meter of upright lamps: how much of something there is (the collection, a level). */
export function Meter({ value, lamps = 12, tube: t = 'green', style }: { /** 0..1 */ value: number; lamps?: number; tube?: TubeName | Tube; style?: StyleProp<ViewStyle> }) {
  const tb = tubeOf(t);
  const on = Math.max(0, Math.min(lamps, Math.round(value * lamps)));
  return (
    <View aria-hidden importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={[styles.meter, style]}>
      {Array.from({ length: lamps }, (_, i) => (
        <View key={i} style={[styles.meterLamp, i < on ? { backgroundColor: tb.glass, boxShadow: [halo(tb.glass, 5, 0.8)] } : undefined]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: arcade.segGap,
  },
  barSmall: {
    gap: px(3),
  },
  lamp: {
    flex: 1,
    height: arcade.seg,
    borderRadius: arcade.rSeg,
    backgroundColor: night.line,
  },
  lampSmall: {
    height: arcade.segSmall,
    borderRadius: px(1.5),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(10),
  },
  rowSmall: {
    gap: px(7),
  },
  grow: {
    flex: 1,
  },
  label: {
    width: px(82),
  },
  labelSmall: {
    width: px(62),
  },
  number: {
    width: px(28),
  },
  numberSmall: {
    width: px(22),
  },
  pips: {
    flexDirection: 'row',
    gap: px(5),
  },
  pip: {
    borderWidth: arcade.hairline,
    borderColor: night.lineLit,
    backgroundColor: night.clear,
  },
  meter: {
    flexDirection: 'row',
    gap: px(3),
  },
  meterLamp: {
    width: px(7),
    height: px(12),
    borderRadius: px(1.5),
    backgroundColor: night.line,
  },
});
