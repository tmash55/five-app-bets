/** A row of lit tabs in a dark chip: the league picker in a top bar, the sort on the collection page. */

import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { tapFeedback } from '@/fx/feedback';
import { arcade, halo, night, tube } from '@/theme/arcade';
import { px } from '@/theme/tokens';
import { Print } from './Type';

/** a tab is a slim strip inside its chip: its tap area reaches the bar's full height */
const TAB_SLOP = { top: px(11), bottom: px(11), left: px(2), right: px(2) };

export interface LitTab<T extends string> {
  id: T;
  label: string;
  /** what a screen reader says, when the label alone is not enough */
  say?: string;
}

export function LitTabs<T extends string>({ tabs, value, onChange, style }: { tabs: readonly LitTab<T>[]; value: T; onChange: (id: T) => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View accessibilityRole="tablist" style={[styles.tabs, style]}>
      {tabs.map((t) => {
        const on = t.id === value;
        return (
          <Pressable
            key={t.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t.say ?? t.label}
            hitSlop={TAB_SLOP}
            onPress={() => {
              tapFeedback();
              onChange(t.id);
            }}
            style={({ pressed }) => [styles.tab, on && { borderColor: tube.cyan.glass, boxShadow: [halo(tube.cyan.glass, 8, 0.6)] }, pressed && styles.pressed]}>
            <Print face="bold" size="tiny" color={on ? tube.cyan.tint : 'textDim'} track="wide" upper>
              {t.label}
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
