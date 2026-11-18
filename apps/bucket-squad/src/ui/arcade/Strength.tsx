/** How strong a squad is, as lamps first: its overall rating, and the bonus for teammates who play together. */

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { night, tube as tubes, tubeOf, type Tube, type TubeName } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { LineIcon } from './LineIcon';
import { SegBar } from './SegBar';
import { Chip } from './Surface';
import { Print } from './Type';

/** the most a teammate bonus can be (three from one team) */
const MOST_CHEMISTRY = 3;

/** A squad's overall rating: a row of lamps, then the number. */
export function OvrMeter({ value, label = 'OVR', tube: t = 'cyan', style }: { value: number; label?: string; tube?: TubeName | Tube; style?: StyleProp<ViewStyle> }) {
  const tb = tubeOf(t);
  return (
    <Chip style={[styles.chip, style]}>
      <Print face="bold" size="tiny" color="textFaint" track="wide" lines={1}>
        {label}
      </Print>
      <SegBar value={value} tube={tb} small style={styles.bar} />
      <Print face="display" size="large" color={tb.tint} glow={tb.glass} lines={1}>
        {String(value)}
      </Print>
    </Chip>
  );
}

/** The teammate bonus: three bolts, lit for what the squad has, and the words for it. */
export function ChemChip({ chemistry, style }: { chemistry: number; style?: StyleProp<ViewStyle> }) {
  const on = chemistry > 0;
  const tb = tubes.green;
  return (
    <Chip style={[styles.chip, on && { borderColor: tb.glass }, style]}>
      <View style={styles.bolts}>
        {Array.from({ length: MOST_CHEMISTRY }, (_, i) => (
          <LineIcon key={i} name="bolt" size={px(14)} tube={i < chemistry ? tb : undefined} color={i < chemistry ? undefined : night.lineLit} />
        ))}
      </View>
      <Print face="bold" size="tiny" color={on ? tb.tint : 'textFaint'} track="normal" glow={on ? tb.glass : undefined} lines={1}>
        {on ? `TEAMMATES +${chemistry}` : 'SAME TEAM = BONUS'}
      </Print>
    </Chip>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: px(34),
    gap: px(7),
    paddingHorizontal: px(9),
  },
  bar: {
    width: px(58),
  },
  bolts: {
    flexDirection: 'row',
    gap: px(1),
  },
});
