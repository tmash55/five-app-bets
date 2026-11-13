/** Teams in the arcade: a tube bent in a team's own colour, and a tile to pick a team by its colours and letters. */

import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { TeamDef } from '@/data/types';
import { tapFeedback } from '@/fx/feedback';
import { arcade, blend, halo, inner, night, tube as tubes, type Tube } from '@/theme/arcade';
import { px, space } from '@/theme/tokens';
import { LineIcon, type LineIconName } from './LineIcon';
import { MIN_FIT_LABEL } from './measure';
import { teamLine } from './Surface';
import { Print } from './Type';

/** A neon tube in a team's (or a uniform's) colour, light enough to read on the dark wall. */
export function teamTube(team: Pick<TeamDef, 'color'>): Tube {
  const glass = teamLine(team);
  return { glass, tint: blend(glass, night.white, 0.82), soft: blend(glass, night.white, 0.45) };
}

export const TEAM_PICK_WIDTH = px(100);
export const TEAM_PICK_HEIGHT = px(88);
/** the shortest a tile can be and still hold its letters and its name */
export const TEAM_PICK_MIN_HEIGHT = px(64);
const PAD = px(8);

export interface TeamPickProps {
  /** leave out for a tile that is not a team ("Surprise me") */
  team?: TeamDef;
  label?: string;
  icon?: LineIconName;
  selected: boolean;
  onPress: () => void;
  width?: number;
  /** shorter tiles, so a whole grid fits the room it has */
  height?: number;
  style?: StyleProp<ViewStyle>;
}

/** A team you can pick: its two colours along the top, its letters lit in its colour, its name; lit all round when picked. */
export function TeamPick({ team, label, icon = 'help', selected, onPress, width = TEAM_PICK_WIDTH, height = TEAM_PICK_HEIGHT, style }: TeamPickProps) {
  const name = team ? team.name : (label ?? '');
  const tb = team ? teamTube(team) : tubes.violet;
  const room = width - PAD * 2 - arcade.outline * 2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${team ? `${team.place} ${team.name}` : name}${selected ? ', selected' : ''}`}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [
        styles.tile,
        { width, height },
        selected ? { borderColor: tb.glass, backgroundColor: night.panel, boxShadow: [halo(tb.glass, 14, 0.85), inner(tb.glass, 18, 0.4)] } : undefined,
        pressed && styles.pressed,
        style,
      ]}>
      {team ? <LinearGradient colors={[team.color, team.color2]} start={ACROSS_A} end={ACROSS_B} style={styles.stripe} /> : <View style={[styles.stripe, { backgroundColor: tb.glass }]} />}
      <View style={styles.middle}>
        {team ? (
          <Print face="display" size={px(24)} color={selected ? tb.tint : tb.soft} track="normal" glow={selected ? tb.glass : undefined} room={room} least={MIN_FIT_LABEL}>
            {team.short}
          </Print>
        ) : (
          <LineIcon name={icon} size={px(28)} tube={tb} weight={2.6} />
        )}
      </View>
      <Print face="bold" size="small" color={selected ? 'text' : 'textDim'} track="tight" center room={room} least={MIN_FIT_LABEL}>
        {name}
      </Print>
      {selected && (
        <View style={[styles.check, { backgroundColor: tb.glass, boxShadow: [halo(tb.glass, 8, 1)] }]}>
          <LineIcon name="check" size={px(12)} color={night.onTube} weight={3.6} />
        </View>
      )}
    </Pressable>
  );
}

const ACROSS_A = { x: 0, y: 0 } as const;
const ACROSS_B = { x: 1, y: 0 } as const;

const styles = StyleSheet.create({
  tile: {
    paddingHorizontal: PAD,
    paddingBottom: px(7),
    alignItems: 'center',
    backgroundColor: night.tile,
    borderWidth: arcade.outline,
    borderColor: night.line,
    borderRadius: arcade.rTile,
    overflow: 'hidden',
  },
  pressed: {
    transform: [{ scale: 0.96 }],
  },
  stripe: {
    alignSelf: 'stretch',
    height: px(6),
    marginHorizontal: -PAD,
  },
  middle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  check: {
    position: 'absolute',
    right: px(5),
    top: px(10),
    width: px(18),
    height: px(18),
    borderRadius: px(9),
    alignItems: 'center',
    justifyContent: 'center',
  },
});
