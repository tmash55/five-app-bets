/**
 * A room code in lights, a big letter in each of four boxes, and the letter pad a child taps it in with (the
 * system keyboard is small, full of letters a code never has, and covers half a landscape screen).
 */

import { Pressable, StyleSheet, View } from 'react-native';

import { tapFeedback } from '@/fx/feedback';
import { CODE_LENGTH, CODE_LETTERS } from '@/net/code';
import { arcade, halo, inner, night, tubeOf, type Tube, type TubeName } from '@/theme/arcade';
import { px, space } from '@/theme/tokens';
import { LineIcon } from './LineIcon';
import { Glow } from './Type';

/** Four boxes with the code's letters lit in them; the next empty box glows while typing. */
export function CodeTiles({ code, size = px(72), tube: t = 'cyan', typing }: { code: string; size?: number; tube?: TubeName | Tube; typing?: boolean }) {
  const tb = tubeOf(t);
  return (
    <View style={styles.tiles} accessible accessibilityLabel={code.length > 0 ? `Room code ${code.split('').join(' ')}` : 'No letters yet'}>
      {Array.from({ length: CODE_LENGTH }, (_, i) => {
        const ch = code[i];
        const next = typing && i === code.length;
        return (
          <View
            key={i}
            style={[
              styles.tile,
              { width: size, height: Math.round(size * 1.18) },
              ch !== undefined || next ? { borderColor: tb.glass, boxShadow: [halo(tb.glass, next ? 14 : 10, next ? 0.8 : 0.5), inner(tb.glass, 14, 0.3)] } : styles.tileOff,
            ]}>
            {ch !== undefined && (
              <Glow face="display" size={Math.round(size * 0.62)} tube={tb} track="none">
                {ch}
              </Glow>
            )}
          </View>
        );
      })}
    </View>
  );
}

/** The pad: every letter a code can have, and a key to take one back. `width` is the room it has across. */
export function LetterPad({ width, onLetter, onBack, disabled, tube: t = 'pink' }: { width: number; onLetter: (ch: string) => void; onBack: () => void; disabled?: boolean; tube?: TubeName | Tube }) {
  const tb = tubeOf(t);
  const cols = 6;
  const key = Math.max(px(36), Math.floor((width - KEY_GAP * (cols - 1)) / cols));
  const keyH = Math.min(key, px(58));
  const press = (fn: () => void) => () => {
    tapFeedback();
    fn();
  };
  return (
    <View style={[styles.pad, { width: key * cols + KEY_GAP * (cols - 1) }]}>
      {CODE_LETTERS.split('').map((ch) => (
        <Pressable
          key={ch}
          accessibilityRole="button"
          accessibilityLabel={ch}
          disabled={disabled}
          onPress={press(() => onLetter(ch))}
          style={({ pressed }) => [styles.key, { width: key, height: keyH, borderColor: tb.glass, boxShadow: [halo(tb.glass, 8, pressed ? 0.85 : 0.45)] }, pressed && styles.pressed, disabled && styles.off]}>
          <Glow face="display" size={Math.round(keyH * 0.5)} tube={tb} track="none">
            {ch}
          </Glow>
        </Pressable>
      ))}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete a letter"
        disabled={disabled}
        onPress={press(onBack)}
        style={({ pressed }) => [styles.key, { width: key, height: keyH }, styles.backKey, pressed && styles.pressed, disabled && styles.off]}>
        <LineIcon name="back" size={Math.round(keyH * 0.42)} tube="cyan" weight={2.4} />
      </Pressable>
    </View>
  );
}

const KEY_GAP = space.sm;

const styles = StyleSheet.create({
  tiles: {
    flexDirection: 'row',
    gap: space.md,
  },
  tile: {
    borderWidth: arcade.outline,
    borderRadius: arcade.rTile,
    backgroundColor: night.pit,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileOff: {
    borderColor: night.line,
  },
  pad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: KEY_GAP,
  },
  key: {
    borderWidth: arcade.outline,
    borderRadius: arcade.rButton,
    backgroundColor: night.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backKey: {
    borderColor: night.lineLit,
  },
  pressed: {
    transform: [{ scale: 0.94 }],
    backgroundColor: night.plate,
  },
  off: {
    opacity: 0.4,
  },
});
