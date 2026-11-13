/** A team you can pick: its badge and name on a sticker that lights up when chosen. */

import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import type { TeamDef } from '@/data/types';
import { tapFeedback } from '@/fx/feedback';
import { size as sizes, space, type ColorName } from '@/theme/tokens';
import { TeamBadge } from './Bits';
import { Icon, type IconName } from './Icon';
import { Sticker } from './Sticker';
import { Txt } from './Txt';

export const TEAM_TILE_WIDTH = sizes.cardSmall + space.sm;

export function TeamTile({
  team,
  label,
  icon = 'help',
  selected,
  onPress,
  fill = 'sun',
  style,
}: {
  /** leave out for a tile that is not a team ("Surprise me") */
  team?: TeamDef;
  label?: string;
  icon?: IconName;
  selected: boolean;
  onPress: () => void;
  fill?: ColorName;
  style?: StyleProp<ViewStyle>;
}) {
  const name = team ? team.name : (label ?? '');
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${team ? `${team.place} ${team.name}` : name}${selected ? ', selected' : ''}`}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={[styles.tile, style]}>
      <Sticker fill={selected ? fill : 'paper'} round="md" raise={selected ? 'mid' : 'low'} face={styles.face}>
        {team ? <TeamBadge team={team} diameter={sizes.avatar} /> : <Icon name={icon} size={sizes.avatar} color="grape" />}
        <Txt font="display" size="small" lines={1}>
          {name}
        </Txt>
      </Sticker>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: TEAM_TILE_WIDTH,
  },
  face: {
    alignItems: 'center',
    gap: space.xs,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
  },
});
