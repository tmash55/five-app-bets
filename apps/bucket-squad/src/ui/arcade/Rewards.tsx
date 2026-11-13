/** Prizes in the arcade, shown the same way on every page: coins as a coin and a gold number, a pack as its foil. */

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { packById } from '@/meta/packs';
import { tube as tubes } from '@/theme/arcade';
import { px, space } from '@/theme/tokens';
import { FoilPack } from './Foil';
import { Coin } from './LineIcon';
import { Chip } from './Surface';
import { Print } from './Type';

type PrizeSize = 'small' | 'body' | 'large' | 'big';

const COIN: Record<PrizeSize, { coin: number; text: number }> = {
  small: { coin: px(15), text: px(13) },
  body: { coin: px(18), text: px(16) },
  large: { coin: px(22), text: px(20) },
  big: { coin: px(30), text: px(28) },
};

/** An amount of coins: the coin, then the number in lit gold. */
export function CoinAmount({ coins, size = 'body', plus, dim, style }: { coins: number; size?: PrizeSize; plus?: boolean; /** not earned yet, or already taken */ dim?: boolean; style?: StyleProp<ViewStyle> }) {
  const c = COIN[size];
  return (
    <View accessible accessibilityLabel={`${coins} coins`} style={[styles.row, { gap: c.coin * 0.32 }, style]}>
      <Coin size={c.coin} />
      <Print face="bold" size={c.text} color={dim ? 'textFaint' : tubes.gold.glass} track="wide" glow={dim ? undefined : tubes.gold.glass} lines={1}>
        {`${plus ? '+' : ''}${coins.toLocaleString('en-US')}`}
      </Print>
    </View>
  );
}

/** A small pack in its foil, with its name beside it. */
export function PackPrize({ packId, width = px(26), label = true, style }: { packId: string; width?: number; label?: boolean; style?: StyleProp<ViewStyle> }) {
  const def = packById(packId);
  return (
    <View accessible accessibilityLabel={def.name} style={[styles.row, style]}>
      <FoilPack pack={def} width={width} />
      {label && (
        <Print face="bold" size="small" color="textSoft" track="tight" lines={1} style={styles.shrink}>
          {def.name}
        </Print>
      )}
    </View>
  );
}

/** A prize in a dark chip: coins, a pack, or both. */
export function RewardChip({ coins = 0, packId, style }: { coins?: number; packId?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Chip style={[styles.chip, style]}>
      {coins > 0 && <CoinAmount coins={coins} size="small" plus />}
      {packId !== undefined && <PackPrize packId={packId} width={px(16)} />}
    </Chip>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  shrink: {
    flexShrink: 1,
  },
  chip: {
    gap: space.sm,
  },
});
