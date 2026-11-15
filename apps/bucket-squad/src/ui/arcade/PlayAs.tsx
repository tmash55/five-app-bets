/**
 * Who a person plays as: their own squad (the default), or any team in the game with that team's own players, colours
 * and name. A button that shows the choice, and a pop-up of tiles to change it.
 */

import { Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { teamById } from '@/data/roster';
import type { TeamDef } from '@/data/types';
import { tapFeedback } from '@/fx/feedback';
import { playableTeams } from '@/meta/setups';
import { arcade, halo, inner, night, tubeOf, type Tube, type TubeName } from '@/theme/arcade';
import { px, size as sizes, space } from '@/theme/tokens';
import { SignHead } from './Controls';
import { LineIcon } from './LineIcon';
import { MIN_FIT_LABEL } from './measure';
import { TEAM_GAP } from './Pickers';
import { Popup } from './Popup';
import { TeamBadge, useSquadLook } from './TeamBadge';
import { TEAM_PICK_HEIGHT, TEAM_PICK_WIDTH, TeamPick, teamTube } from './TeamPick';
import { Glow, Print } from './Type';

/** The name, letters and colours a choice plays under. */
function usePlayAsLook(team: string | null): { name: string; short: string; colors: { color: string; color2: string } } {
  const squad = useSquadLook();
  if (team === null) return squad;
  const t = teamById(team);
  return { name: t.name, short: t.short, colors: { color: t.color, color2: t.color2 } };
}

/** The choice as a button: the badge it plays under, its name, and the swap sign. `room` is the widest it may be. */
export function PlayAsButton({ team, onPress, room, disabled, style }: { team: string | null; onPress: () => void; room: number; disabled?: boolean; style?: StyleProp<ViewStyle> }) {
  const look = usePlayAsLook(team);
  const tb = teamTube(look.colors);
  const badge = px(28);
  const words = room - badge - px(16) - space.sm * 2 - px(10) * 2 - arcade.outline * 2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`You play as ${look.name}. Change`}
      disabled={disabled}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [styles.button, { maxWidth: room, borderColor: tb.glass, boxShadow: [halo(tb.glass, 10, pressed ? 0.35 : 0.6), inner(tb.glass, 12, 0.22)] }, pressed && styles.pressed, disabled && styles.off, style]}>
      <TeamBadge short={look.short} colors={look.colors} size={badge} />
      <View style={styles.words}>
        <Glow face="display" size="body" tube={tb} track="close" room={Math.max(px(40), words)} least={MIN_FIT_LABEL}>
          {look.name.toUpperCase()}
        </Glow>
      </View>
      <LineIcon name="swap" size={px(16)} tube={tb} weight={2.4} />
    </Pressable>
  );
}

/** The squad's own tile: its badge and its name, first in the grid. */
function SquadTile({ selected, onPress }: { selected: boolean; onPress: () => void }) {
  const look = useSquadLook();
  const tb = teamTube(look.colors);
  const room = TEAM_PICK_WIDTH - px(8) * 2 - arcade.outline * 2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${look.name}, your squad${selected ? ', selected' : ''}`}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [styles.tile, selected && { borderColor: tb.glass, backgroundColor: night.panel, boxShadow: [halo(tb.glass, 14, 0.85), inner(tb.glass, 18, 0.4)] }, pressed && styles.pressed]}>
      <TeamBadge short={look.short} colors={look.colors} size={px(34)} />
      <Print face="bold" size="small" color={selected ? 'text' : 'textDim'} track="tight" center room={room} least={MIN_FIT_LABEL}>
        {look.name}
      </Print>
    </Pressable>
  );
}

/**
 * The pop-up: your squad, then every team that can field a side of this size. `not` is a team the other side already
 * plays (it is left out: a game never has the same team on both sides).
 */
export function PlayAsPopup({ team, perTeam, not, onPick, onClose, tube: t = 'cyan' }: { team: string | null; perTeam: 2 | 3; not?: string | null; onPick: (team: string | null) => void; onClose: () => void; tube?: TubeName | Tube }) {
  const tb = tubeOf(t);
  const teams: TeamDef[] = playableTeams(perTeam).filter((x) => x.id !== not);
  const pick = (id: string | null) => {
    onPick(id);
    onClose();
  };
  return (
    <Popup tube={tb} onDismiss={onClose} width={sizes.panelMax + px(80)} style={styles.popup}>
      <SignHead
        title="WHO DO YOU PLAY AS?"
        tube={tb}
        right={
          <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={space.sm} onPress={onClose} style={styles.close}>
            <LineIcon name="close" size={px(18)} tube={tb} weight={2.6} />
          </Pressable>
        }
      />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.grid} showsVerticalScrollIndicator={false}>
        <SquadTile selected={team === null} onPress={() => pick(null)} />
        {teams.map((x) => (
          <TeamPick key={x.id} team={x} selected={x.id === team} onPress={() => pick(x.id)} />
        ))}
      </ScrollView>
      <Print face="medium" size="tiny" color="textFaint" center>
        A team plays with its own players, at about your squad’s level.
      </Print>
    </Popup>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: sizes.tap,
    paddingVertical: px(3),
    paddingHorizontal: px(10),
    backgroundColor: night.pit,
    borderWidth: arcade.outline,
    borderRadius: arcade.rButton,
  },
  words: {
    flexShrink: 1,
    flexGrow: 1,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  off: {
    opacity: 0.45,
  },
  popup: {
    gap: space.sm,
  },
  close: {
    width: sizes.tap * 0.8,
    height: sizes.tap * 0.8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 0,
    flexShrink: 1,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: TEAM_GAP,
    padding: px(7),
  },
  tile: {
    width: TEAM_PICK_WIDTH,
    height: TEAM_PICK_HEIGHT,
    paddingHorizontal: px(8),
    paddingVertical: px(7),
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: night.tile,
    borderWidth: arcade.outline,
    borderColor: night.line,
    borderRadius: arcade.rTile,
  },
});
