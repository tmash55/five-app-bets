/** A player's face in a lit ring of their rarity's colour: for a star to win, an MVP, a prize. */

import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { headArt, mustPlayer } from '@/data/roster';
import { arcade, halo, night, rarityPaint, tube as tubes } from '@/theme/arcade';
import { px } from '@/theme/tokens';

export function Face({ id, size = px(40), dark, style }: { id: string; size?: number; /** a dark shape only: someone not found yet */ dark?: boolean; style?: StyleProp<ViewStyle> }) {
  const player = mustPlayer(id);
  const rp = rarityPaint[player.rarity];
  const tb = tubes[rp.tube];
  const head = headArt(id);
  // the head pictures are square with the face in the middle: a little bigger than the ring, from just above the hair
  const side = size * 1.3;
  return (
    <View style={[styles.face, { width: size, height: size, borderRadius: size / 2, backgroundColor: dark ? night.plate : rp.cell, borderColor: dark ? night.lineLit : tb.glass, boxShadow: dark ? undefined : [halo(tb.glass, 8, 0.8)] }, style]}>
      {head !== undefined && <Image source={head} contentFit="cover" transition={0} tintColor={dark ? night.lineLit : undefined} style={{ position: 'absolute', left: (size - side) / 2, top: -size * 0.06, width: side, height: side, opacity: dark ? 0.5 : 1 }} />}
    </View>
  );
}

const styles = StyleSheet.create({
  face: {
    overflow: 'hidden',
    borderWidth: arcade.hairline,
  },
});
