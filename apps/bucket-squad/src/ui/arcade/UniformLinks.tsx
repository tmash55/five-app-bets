/** The ways into the uniforms page from other pages: a small button in the top bar, and the squad page's "what we wear". */

import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { tapFeedback } from '@/fx/feedback';
import { squadUniform } from '@/state/logic';
import { useSave } from '@/state/save';
import { arcade, halo, inner, night } from '@/theme/arcade';
import { px, size as sizes } from '@/theme/tokens';
import { GhostButton } from './Buttons';
import { Jersey } from './Jersey';
import { LineIcon } from './LineIcon';
import { MIN_FIT_LABEL } from './measure';
import { teamTube } from './TeamPick';
import { Print } from './Type';

/** what the squad wears, read from the save */
function useWorn() {
  const squad = useSave((s) => s.squad);
  const uniform = useSave((s) => s.uniform);
  const homeTeam = useSave((s) => s.homeTeam);
  return squadUniform({ squad, uniform, homeTeam });
}

/** the name of what the squad wears, as the pages print it */
export function wornName(def: { name: string } | null): string {
  return def ? def.name : 'Captain’s colours';
}

/** A small button for the top bar: the squad's jersey and the word UNIFORMS. */
export function UniformsButton({ style }: { style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const { wear } = useWorn();
  return (
    <GhostButton small tube="orange" art={<Jersey kit={wear.kit} width={px(20)} />} label="UNIFORMS" accessibilityLabel="Uniforms" onPress={() => router.push('/uniforms')} style={style} />
  );
}

const WEAR_JERSEY = px(30);

/** The squad page's button: the jersey the squad wears and its name, lit in its colour; it opens the uniforms page. */
export function WearingButton({ room, style }: { /** the widest the button may be */ room: number; style?: StyleProp<ViewStyle> }) {
  const router = useRouter();
  const { def, wear } = useWorn();
  const tb = teamTube(wear);
  const name = wornName(def).toUpperCase();
  const words = room - WEAR_JERSEY - px(16) - px(10) * 2 - px(12) * 2 - arcade.outline * 2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Uniform: ${wornName(def)}. Change uniform`}
      onPress={() => {
        tapFeedback();
        router.push('/uniforms');
      }}
      style={({ pressed }) => [styles.wear, { maxWidth: room, borderColor: tb.glass, boxShadow: [halo(tb.glass, 10, pressed ? 0.35 : 0.6), inner(tb.glass, 12, 0.22)] }, pressed && styles.pressed, style]}>
      <Jersey kit={wear.kit} width={WEAR_JERSEY} />
      <View style={styles.words}>
        <Print face="bold" size="micro" color="textFaint" track="wider">
          UNIFORM
        </Print>
        <Print face="display" size="small" color={tb.tint} track="close" room={Math.max(px(40), words)} least={MIN_FIT_LABEL}>
          {name}
        </Print>
      </View>
      <LineIcon name="arrow" size={px(16)} tube={tb} weight={2.6} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: px(10),
    minHeight: sizes.tap,
    paddingVertical: px(4),
    paddingHorizontal: px(12),
    backgroundColor: night.pit,
    borderWidth: arcade.outline,
    borderRadius: arcade.rButton,
  },
  words: {
    flexShrink: 1,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
});
