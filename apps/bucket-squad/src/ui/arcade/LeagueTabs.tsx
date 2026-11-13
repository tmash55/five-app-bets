/** The leagues as lit tabs in the top bar, for a page that lists teams, when a family build adds a league. */

import { Pressable, StyleSheet, View } from 'react-native';

import { LEAGUES } from '@/data/roster';
import { tapFeedback } from '@/fx/feedback';
import { arcade, halo, night, tube } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { Print } from './Type';

/** a tab is a slim strip inside its chip: its tap area reaches the bar's full height */
const TAB_SLOP = { top: px(11), bottom: px(11), left: px(2), right: px(2) };

export function LeagueTabs({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  return (
    <View accessibilityRole="tablist" style={styles.tabs}>
      {LEAGUES.map((l) => {
        const on = l.id === value;
        return (
          <Pressable
            key={l.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={l.name}
            hitSlop={TAB_SLOP}
            onPress={() => {
              tapFeedback();
              onChange(l.id);
            }}
            style={({ pressed }) => [styles.tab, on && { borderColor: tube.cyan.glass, boxShadow: [halo(tube.cyan.glass, 8, 0.6)] }, pressed && styles.pressed]}>
            <Print face="bold" size="tiny" color={on ? tube.cyan.tint : 'textDim'} track="wide" upper>
              {l.name}
            </Print>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: {
    flexDirection: 'row',
    gap: px(4),
    height: arcade.chip,
    padding: px(3),
    backgroundColor: night.pit,
    borderWidth: arcade.hairline,
    borderColor: night.line,
    borderRadius: arcade.rChip,
  },
  tab: {
    justifyContent: 'center',
    paddingHorizontal: px(9),
    borderRadius: px(5),
    borderWidth: arcade.hairline,
    borderColor: night.clear,
  },
  pressed: {
    opacity: 0.8,
  },
});
