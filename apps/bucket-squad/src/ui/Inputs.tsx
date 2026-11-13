/** Settings-style inputs: an on/off chip and a pick-one row. */

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { size as sizes, space, type ColorName } from '@/theme/tokens';
import type { IconName } from './Icon';
import { StickerButton } from './Sticker';

/** A button that is either on (coloured) or off (dimmed paper). */
export function ToggleChip({
  label,
  on,
  onChange,
  icon,
  iconOff,
  fill = 'mint',
  style,
}: {
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
  icon?: IconName;
  /** icon shown while off, when it differs */
  iconOff?: IconName;
  fill?: ColorName;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <StickerButton
      label={label}
      icon={on ? icon : (iconOff ?? icon)}
      iconColor={on ? 'white' : 'paper'}
      fill={on ? fill : 'paperDim'}
      textColor={on ? 'ink' : 'inkFaint'}
      textSize="body"
      raise="low"
      round="md"
      height={sizes.tap}
      onPress={() => onChange(!on)}
      accessibilityLabel={`${label}: ${on ? 'on' : 'off'}`}
      style={style}
      face={styles.cellFace}
    />
  );
}

export interface Choice<T> {
  value: T;
  label: string;
}

/** Pick one of a few options. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  fill = 'sun',
  style,
}: {
  options: readonly Choice<T>[];
  value: T;
  onChange: (value: T) => void;
  fill?: ColorName;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.row, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <StickerButton
            key={String(o.value)}
            label={o.label}
            fill={on ? fill : 'paperDim'}
            textColor={on ? 'ink' : 'inkFaint'}
            textSize="body"
            raise={on ? 'low' : 'none'}
            round="md"
            height={sizes.buttonSmall}
            onPress={() => onChange(o.value)}
            accessibilityLabel={`${o.label}${on ? ', selected' : ''}`}
            style={styles.cell}
            face={styles.cellFace}
          />
        );
      })}
    </View>
  );
}

/** width of one tab in a screen's header */
const TAB_W = sizes.card + space.xs;

/** A pick-one row narrow enough to sit in a screen's header, for switching between leagues. */
export function HeaderTabs<T extends string | number>({ options, value, onChange, fill }: { options: readonly Choice<T>[]; value: T; onChange: (value: T) => void; fill?: ColorName }) {
  return <Segmented options={options} value={value} onChange={onChange} fill={fill} style={{ width: options.length * TAB_W + (options.length - 1) * space.sm }} />;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.sm,
    alignItems: 'flex-end',
  },
  cell: {
    flexGrow: 1,
    flexBasis: 0,
  },
  cellFace: {
    paddingHorizontal: space.sm,
  },
});
