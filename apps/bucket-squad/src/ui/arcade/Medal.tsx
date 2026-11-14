/** The Ladder's tiers in the arcade: each tier is a medal lit in its own tube, from a steel Rookie to an amber Legend. */

import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { TIERS } from '@/meta/ladder';
import { arcade, halo, inner, night, tube as tubes, type Tube, type TubeName } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { LineIcon } from './LineIcon';

/** the tube each tier is lit in, Rookie first: the same order of colours as the tiers' own, from the room's tubes */
const TIER_TUBES: readonly TubeName[] = ['steel', 'orange', 'white', 'gold', 'cyan', 'violet', 'pink', 'amber'];

/** The tube a tier is lit in. */
export function tierTube(index: number): Tube {
  return tubes[TIER_TUBES[Math.max(0, Math.min(TIER_TUBES.length - 1, index))]];
}

/** A tier's index from its name, for prizes that carry the tier itself. */
export function tierIndexOf(name: string): number {
  return Math.max(0, TIERS.findIndex((t) => t.name === name));
}

/** A round medal with a trophy in it, lit in the tier's tube; dark when the tier is not reached yet. */
export function TierMedal({ index, size = px(40), lit = true, style }: { index: number; size?: number; lit?: boolean; style?: StyleProp<ViewStyle> }) {
  const tb = tierTube(index);
  const big = size >= px(64);
  return (
    <View
      style={[
        styles.medal,
        { width: size, height: size, borderRadius: size / 2, borderWidth: big ? arcade.outline * 1.5 : arcade.outline },
        lit ? { borderColor: tb.glass, boxShadow: [halo(tb.glass, big ? 22 : 10, big ? 0.8 : 0.7), inner(tb.glass, big ? 22 : 12, 0.35)] } : undefined,
        style,
      ]}>
      <LineIcon name="trophy" size={size * 0.56} tube={lit ? tb : undefined} color={lit ? undefined : night.lineLit} weight={big ? 1.8 : 2.2} />
    </View>
  );
}

const styles = StyleSheet.create({
  medal: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: night.pit,
    borderColor: night.line,
  },
});
