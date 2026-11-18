/**
 * Name your squad: spin two word wheels (a place or colour, then a mascot), roll the dice for a surprise, or type a name
 * on the big letter keys. Then pick the squad's colours. Nothing changes until THAT'S US! is pressed.
 */

import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { playSfx } from '@/audio/sound';
import { tapFeedback } from '@/fx/feedback';
import { COLOR_SCHEMES, DEFAULT_NAME, MASCOT_WORDS, PLACE_WORDS, TYPED_MAX, cleanTyped, nameText, shortOf, wordIndexes, type TeamName } from '@/meta/teamName';
import { squadUniform } from '@/state/logic';
import { useSave } from '@/state/save';
import { arcade, halo, inner, night, tube as tubes, type Tube } from '@/theme/arcade';
import { px, size as sizes, space } from '@/theme/tokens';
import { ArcadeScreen } from '@/ui/arcade/ArcadeScreen';
import { GhostButton, GoldButton, useWidth } from '@/ui/arcade/Buttons';
import { PickRow, type Choice } from '@/ui/arcade/Controls';
import { Jersey } from '@/ui/arcade/Jersey';
import { LineIcon } from '@/ui/arcade/LineIcon';
import { MIN_FIT_LABEL } from '@/ui/arcade/measure';
import { Arrive, Bump } from '@/ui/arcade/Motion';
import { NeonPanel } from '@/ui/arcade/Surface';
import { TeamBadge, squadLook } from '@/ui/arcade/TeamBadge';
import { teamTube } from '@/ui/arcade/TeamPick';
import { Glow, Print } from '@/ui/arcade/Type';

type Mode = 'wheels' | 'typed';
const MODES: readonly Choice<Mode>[] = [
  { value: 'wheels', label: 'Word wheels', icon: 'dice' },
  { value: 'typed', label: 'Type my own', icon: 'pencil' },
];

/** the page's own tube */
const TUBE = tubes.orange;
const PANEL_PAD = px(12);
/** the big lit badge at the top of the name panel */
const BADGE = px(52);
/** a wheel's up and down keys, and the three words it shows */
const WHEEL_KEY = px(30);
const WHEEL_ROW = px(28);
const WHEEL_NOW = px(40);
const DICE = px(72);
/** the dice spins through this many names before it stops */
const SPIN_STEPS = 9;
const SPIN_MS = 55;
/** the letter keys: ten across */
const KEY_COLS = 10;
const KEY_GAP = px(6);
const KEY_H = px(34);
const KEY_ROWS = ['1234567890', 'ABCDEFGHIJ', 'KLMNOPQRST', 'UVWXYZ'] as const;
/** the colour swatches: five across */
const SWATCH_COLS = 5;
const SWATCH_GAP = space.sm;
const SWATCH_H = px(40);

function wrap(i: number, n: number): number {
  return ((i % n) + n) % n;
}

function randomAt(): [number, number] {
  return [Math.floor(Math.random() * PLACE_WORDS.length), Math.floor(Math.random() * MASCOT_WORDS.length)];
}

/** One word wheel: the word before (faint), the word picked (lit), the word after (faint), and a key above and below. */
function WordWheel({ words, at, onChange, tube: tb, label }: { words: readonly string[]; at: number; onChange: (i: number) => void; tube: Tube; label: string }) {
  const [w, onLayout] = useWidth();
  const step = (d: number) => () => {
    tapFeedback('lampTick');
    onChange(wrap(at + d, words.length));
  };
  const room = Math.max(px(40), w - px(12));
  return (
    <View style={styles.wheel} onLayout={onLayout} accessible accessibilityRole="adjustable" accessibilityLabel={`${label}: ${words[at]}`} accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]} onAccessibilityAction={(e) => onChange(wrap(at + (e.nativeEvent.actionName === 'increment' ? 1 : -1), words.length))}>
      <Pressable accessibilityLabel={`${label}: the word before`} hitSlop={space.xs} onPress={step(-1)} style={({ pressed }) => [styles.wheelKey, { borderColor: tb.glass }, pressed && styles.pressed]}>
        <LineIcon name="chevUp" size={px(20)} tube={tb} weight={2.8} />
      </Pressable>
      <View style={[styles.window, { borderColor: tb.glass, boxShadow: [inner(tb.glass, 14, 0.3)] }]}>
        <Pressable onPress={step(-1)} style={styles.wheelRow} accessible={false}>
          <Print face="bold" size="small" color="textFaint" center room={room} least={MIN_FIT_LABEL}>
            {words[wrap(at - 1, words.length)]}
          </Print>
        </Pressable>
        <View style={[styles.wheelNow, { borderColor: tb.glass }]}>
          <Bump beat={at} amount={0.12}>
            <Glow face="display" size="large" tube={tb} track="close" center room={room} least={MIN_FIT_LABEL}>
              {words[at].toUpperCase()}
            </Glow>
          </Bump>
        </View>
        <Pressable onPress={step(1)} style={styles.wheelRow} accessible={false}>
          <Print face="bold" size="small" color="textFaint" center room={room} least={MIN_FIT_LABEL}>
            {words[wrap(at + 1, words.length)]}
          </Print>
        </Pressable>
      </View>
      <Pressable accessibilityLabel={`${label}: the word after`} hitSlop={space.xs} onPress={step(1)} style={({ pressed }) => [styles.wheelKey, { borderColor: tb.glass }, pressed && styles.pressed]}>
        <LineIcon name="chevDown" size={px(20)} tube={tb} weight={2.8} />
      </Pressable>
    </View>
  );
}

/** The letter keys a name is typed on: big, in ABC order, with a space bar and a key to take a letter back. */
function NameKeys({ onKey, onBack, onSpace, full }: { onKey: (ch: string) => void; onBack: () => void; onSpace: () => void; full: boolean }) {
  const [w, onLayout] = useWidth();
  const key = w > 0 ? Math.floor((w - KEY_GAP * (KEY_COLS - 1)) / KEY_COLS) : 0;
  const press = (fn: () => void) => () => {
    tapFeedback();
    fn();
  };
  return (
    <View style={styles.keys} onLayout={onLayout}>
      {key > 0 &&
        KEY_ROWS.map((row) => (
          <View key={row} style={styles.keyRow}>
            {row.split('').map((ch) => (
              <Pressable key={ch} accessibilityRole="button" accessibilityLabel={ch} disabled={full} onPress={press(() => onKey(ch))} style={({ pressed }) => [styles.key, { width: key }, pressed && styles.keyDown, full && styles.off]}>
                <Glow face="display" size={Math.round(KEY_H * 0.5)} tube={/[0-9]/.test(ch) ? 'cyan' : TUBE} track="none">
                  {ch}
                </Glow>
              </Pressable>
            ))}
            {row === KEY_ROWS[KEY_ROWS.length - 1] && (
              <>
                <Pressable accessibilityRole="button" accessibilityLabel="Space" disabled={full} onPress={press(onSpace)} style={({ pressed }) => [styles.key, { width: key * 2 + KEY_GAP }, pressed && styles.keyDown, full && styles.off]}>
                  <Print face="bold" size="tiny" color="textDim" track="wider">
                    SPACE
                  </Print>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Delete a letter" onPress={press(onBack)} style={({ pressed }) => [styles.key, styles.backKey, { width: key * 2 + KEY_GAP }, pressed && styles.keyDown]}>
                  <LineIcon name="back" size={Math.round(KEY_H * 0.5)} tube="cyan" weight={2.6} />
                </Pressable>
              </>
            )}
          </View>
        ))}
    </View>
  );
}

/** One colour scheme to pick: its two colours side by side, lit all round when picked. The first is the colours the squad wears. */
function Swatch({ colors, label, selected, onPress, width, art }: { colors: { color: string; color2: string }; label: string; selected: boolean; onPress: () => void; width: number; art?: React.ReactNode }) {
  const tb = teamTube(colors);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}${selected ? ', selected' : ''}`}
      onPress={() => {
        tapFeedback();
        onPress();
      }}
      style={({ pressed }) => [styles.swatch, { width }, selected && { borderColor: tb.glass, boxShadow: [halo(tb.glass, 10, 0.85), inner(tb.glass, 10, 0.4)] }, pressed && styles.pressed]}>
      <LinearGradient colors={[colors.color, colors.color, colors.color2, colors.color2]} locations={[0, 0.55, 0.56, 1]} start={ACROSS_A} end={ACROSS_B} style={styles.swatchPaint} />
      {art !== undefined && <View style={styles.swatchArt}>{art}</View>}
      {selected && (
        <View style={[styles.check, { backgroundColor: tb.glass }]}>
          <LineIcon name="check" size={px(11)} color={night.onTube} weight={3.6} />
        </View>
      )}
    </Pressable>
  );
}

export default function TeamNamePage() {
  const router = useRouter();
  const saved = useSave((s) => s.teamName);
  const savedColors = useSave((s) => s.teamColors);
  const nameTeam = useSave((s) => s.nameTeam);
  const squad = useSave((s) => s.squad);
  const uniform = useSave((s) => s.uniform);
  const homeTeam = useSave((s) => s.homeTeam);
  const { wear } = squadUniform({ squad, uniform, homeTeam });

  const [mode, setMode] = useState<Mode>(saved && 'typed' in saved ? 'typed' : 'wheels');
  // a squad still called "Your Squad" starts the wheels somewhere fun
  const [at, setAt] = useState<[number, number]>(() => (saved && 'words' in saved ? wordIndexes(saved.words) : randomAt()));
  const [typed, setTyped] = useState(saved && 'typed' in saved ? saved.typed : '');
  const [colors, setColors] = useState<string | null>(savedColors);
  const [spins, setSpins] = useState(0);
  const spin = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(
    () => () => {
      if (spin.current) clearInterval(spin.current);
    },
    [],
  );

  const draft: TeamName | null = mode === 'wheels' ? { words: [PLACE_WORDS[at[0]], MASCOT_WORDS[at[1]]] } : typed.trim().length > 0 ? { typed: typed.trim() } : null;
  const look = squadLook(draft, colors, wear);
  const tb = teamTube(look.colors);
  const [panelW, onPanelLayout] = useWidth();
  const [colorsW, onColorsLayout] = useWidth();
  const swatchW = colorsW > 0 ? Math.floor((colorsW - SWATCH_GAP * (SWATCH_COLS - 1)) / SWATCH_COLS) : 0;

  const roll = () => {
    if (spin.current) clearInterval(spin.current);
    playSfx('drumRoll', 0.5);
    setSpins((n) => n + 1);
    let left = SPIN_STEPS;
    spin.current = setInterval(() => {
      setAt(randomAt());
      left--;
      if (left <= 0 && spin.current) {
        clearInterval(spin.current);
        spin.current = null;
        playSfx('lock');
      }
    }, SPIN_MS);
  };

  // typing: each word starts with a capital, the rest is small letters
  const typeKey = (ch: string) => setTyped((t) => cleanTyped(t + (t === '' || t.endsWith(' ') ? ch : ch.toLowerCase())));
  const typeSpace = () => setTyped((t) => (t === '' || t.endsWith(' ') ? t : cleanTyped(`${t} `)));
  const typeBack = () => setTyped((t) => t.slice(0, -1));

  const keep = () => {
    playSfx('levelUp', 0.6);
    nameTeam(draft, colors);
    router.back();
  };
  const plain = () => {
    nameTeam(null, colors);
    router.back();
  };

  const nameRoom = panelW > 0 ? panelW - PANEL_PAD * 2 - BADGE - space.md : undefined;
  const showName = mode === 'typed' && typed === '' ? 'TYPE A NAME…' : look.name.toUpperCase();

  return (
    <ArcadeScreen
      title="TEAM NAME"
      tube="orange"
      style={styles.body}
      right={saved !== null ? <GhostButton small label={DEFAULT_NAME.toUpperCase()} icon="again" tube="steel" accessibilityLabel={`Go back to ${DEFAULT_NAME}`} onPress={plain} /> : undefined}>
      <View style={styles.row}>
        <Arrive delay={40} from="left" style={styles.left}>
          <NeonPanel tube={TUBE} style={styles.panel}>
            <View style={styles.preview} onLayout={onPanelLayout}>
              <TeamBadge short={draft ? shortOf(draft) : shortOf(null)} colors={look.colors} size={BADGE} />
              <View style={styles.grow}>
                <Print face="bold" size="micro" color="textFaint" track="wider">
                  {mode === 'typed' ? `YOUR NAME · UP TO ${TYPED_MAX} LETTERS` : 'YOUR NAME'}
                </Print>
                <Glow face="display" size="title" tube={mode === 'typed' && typed === '' ? tubes.steel : tb} track="close" room={nameRoom} least={0.5}>
                  {showName}
                </Glow>
              </View>
            </View>
            {mode === 'wheels' ? (
              <View style={styles.wheels}>
                <WordWheel words={PLACE_WORDS} at={at[0]} onChange={(i) => setAt([i, at[1]])} tube={tubes.cyan} label="First word" />
                <WordWheel words={MASCOT_WORDS} at={at[1]} onChange={(i) => setAt([at[0], i])} tube={tubes.pink} label="Mascot" />
                <View style={styles.diceBox}>
                  <Bump beat={spins} amount={0.2}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Roll the dice for a random name" onPress={roll} style={({ pressed }) => [styles.dice, { boxShadow: [halo(tubes.gold.glass, 14, pressed ? 0.4 : 0.75), inner(tubes.gold.glass, 14, 0.3)] }, pressed && styles.pressed]}>
                      <LineIcon name="dice" size={px(40)} tube="gold" weight={2.4} />
                    </Pressable>
                  </Bump>
                  <Print face="display" size="tiny" color={tubes.gold.tint} track="wide">
                    RANDOM
                  </Print>
                </View>
              </View>
            ) : (
              <NameKeys onKey={typeKey} onSpace={typeSpace} onBack={typeBack} full={typed.length >= TYPED_MAX} />
            )}
            <PickRow options={MODES} value={mode} onChange={setMode} tube={TUBE} />
          </NeonPanel>
        </Arrive>

        <Arrive delay={110} from="right" style={styles.right}>
          <NeonPanel tube={tb} style={styles.panel}>
            <View style={styles.colorsHead}>
              <LineIcon name="drop" size={px(18)} tube={tb} />
              <Glow face="sign" size="large" tube={tb} track="wide">
                TEAM COLORS
              </Glow>
            </View>
            <View style={styles.swatches} onLayout={onColorsLayout}>
              {swatchW > 0 && (
                <>
                  <Swatch colors={{ color: wear.color, color2: wear.color2 }} label="The colors you wear" selected={colors === null} onPress={() => setColors(null)} width={swatchW} art={<Jersey kit={wear.kit} width={px(22)} />} />
                  {COLOR_SCHEMES.map((c) => (
                    <Swatch key={c.id} colors={c} label={c.name} selected={colors === c.id} onPress={() => setColors(c.id)} width={swatchW} />
                  ))}
                </>
              )}
            </View>
            <Print face="medium" size="tiny" color="textFaint">
              Your badge and name glow in these. Jerseys come from UNIFORMS.
            </Print>
          </NeonPanel>
          <GoldButton label="THAT'S US!" icon="check" disabled={draft === null} onPress={keep} accessibilityLabel={`Keep the name ${draft ? nameText(draft) : ''}`} />
        </Arrive>
      </View>
    </ArcadeScreen>
  );
}

const ACROSS_A = { x: 0, y: 0 } as const;
const ACROSS_B = { x: 1, y: 1 } as const;

const styles = StyleSheet.create({
  body: {
    paddingTop: space.md,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    gap: space.lg,
  },
  grow: {
    flex: 1,
  },
  left: {
    flex: 1.45,
    justifyContent: 'center',
  },
  right: {
    flex: 1,
    justifyContent: 'center',
    gap: space.md,
  },
  panel: {
    padding: PANEL_PAD,
    gap: space.sm,
  },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  wheels: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  wheel: {
    flex: 1,
    alignItems: 'stretch',
    gap: px(4),
  },
  wheelKey: {
    height: WHEEL_KEY,
    borderWidth: arcade.hairline,
    borderRadius: arcade.rButton,
    backgroundColor: night.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  window: {
    borderWidth: arcade.hairline,
    borderRadius: arcade.rWell,
    backgroundColor: night.pit,
    overflow: 'hidden',
  },
  wheelRow: {
    height: WHEEL_ROW,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.75,
  },
  wheelNow: {
    height: WHEEL_NOW,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: arcade.hairline,
    borderBottomWidth: arcade.hairline,
    backgroundColor: night.well,
  },
  diceBox: {
    width: DICE + space.sm,
    alignItems: 'center',
    gap: space.xs,
  },
  dice: {
    width: DICE,
    height: DICE,
    borderRadius: arcade.rBig,
    borderWidth: arcade.outline,
    borderColor: tubes.gold.glass,
    backgroundColor: night.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keys: {
    gap: KEY_GAP,
  },
  keyRow: {
    flexDirection: 'row',
    gap: KEY_GAP,
  },
  key: {
    height: KEY_H,
    borderWidth: arcade.hairline,
    borderColor: TUBE.glass,
    borderRadius: arcade.rCell,
    backgroundColor: night.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyDown: {
    transform: [{ scale: 0.92 }],
    backgroundColor: night.plate,
  },
  backKey: {
    borderColor: night.lineLit,
  },
  off: {
    opacity: 0.4,
  },
  colorsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  swatches: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SWATCH_GAP,
    paddingVertical: px(4),
  },
  swatch: {
    height: SWATCH_H,
    minHeight: sizes.tap * 0.8,
    borderRadius: arcade.rButton,
    borderWidth: arcade.outline,
    borderColor: night.line,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchPaint: {
    ...StyleSheet.absoluteFill,
  },
  swatchArt: {
    padding: px(2),
    borderRadius: arcade.rCell,
    backgroundColor: night.shade,
  },
  check: {
    position: 'absolute',
    right: px(3),
    top: px(3),
    width: px(16),
    height: px(16),
    borderRadius: px(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: 0.95 }],
  },
});
