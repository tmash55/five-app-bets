/** Prizes shown the same way everywhere: an amount of coins, a pack. */

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { packById } from '@/meta/packs';
import { size as sizes, space, type ColorName } from '@/theme/tokens';
import { Icon } from './Icon';
import { PackArt } from './PackArt';
import { Txt } from './Txt';

export function CoinAmount({ coins, size = 'body', color = 'ink', plus, style }: { coins: number; size?: 'small' | 'body' | 'large' | 'title'; color?: ColorName; plus?: boolean; style?: StyleProp<ViewStyle> }) {
  const icon = size === 'small' ? sizes.iconTiny : size === 'body' ? sizes.iconSmall : size === 'large' ? sizes.icon : sizes.iconLarge;
  return (
    <View style={[styles.row, style]}>
      <Icon name="coin" color="sun" size={icon} />
      <Txt font="display" size={size} color={color} shadow={color === 'white'}>
        {`${plus ? '+' : ''}${coins.toLocaleString('en-US')}`}
      </Txt>
    </View>
  );
}

/** A little pack with its name beside it. */
export function PackChip({ packId, width = sizes.avatarSmall, color = 'ink', label = true, style }: { packId: string; width?: number; color?: ColorName; label?: boolean; style?: StyleProp<ViewStyle> }) {
  const def = packById(packId);
  return (
    <View style={[styles.row, style]}>
      <PackArt pack={def} width={width} />
      {label && (
        <Txt font="display" size="small" color={color} shadow={color === 'white'} lines={1}>
          {def.name}
        </Txt>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
});
