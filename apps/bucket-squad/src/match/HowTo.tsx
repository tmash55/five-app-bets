/** The one-page guide to the controls, shown before a first game and from the pause menu. */

import { ScrollView, StyleSheet, View } from 'react-native';

import { color, px, size as sizes, space, stroke, type ColorName } from '@/theme/tokens';
import { Icon, type IconName } from '@/ui/Icon';
import { Overlay, Panel } from '@/ui/Overlay';
import { Sticker, StickerButton } from '@/ui/Sticker';
import { StickerText, Txt } from '@/ui/Txt';

interface Line {
  fill: ColorName;
  icon: IconName;
  name: string;
  text: string;
}

const WITH_BALL: readonly Line[] = [
  { fill: 'coral', icon: 'ball', name: 'SHOOT', text: 'Hold it, then let go at the top of your jump.' },
  { fill: 'coral', icon: 'ball', name: 'DUNK', text: 'Run at the hoop and press SHOOT.' },
  { fill: 'sky', icon: 'swap', name: 'PASS', text: 'Find a teammate. A cutter means alley-oop!' },
];

const WITHOUT_BALL: readonly Line[] = [
  { fill: 'sky', icon: 'hand', name: 'STEAL', text: 'Swipe when you are right next to the ball.' },
  { fill: 'coral', icon: 'jump', name: 'JUMP', text: 'Block shots and grab rebounds.' },
  { fill: 'grape', icon: 'swap', name: 'SWITCH', text: 'Take over your other player.' },
];

const ALWAYS: readonly Line[] = [
  { fill: 'sunDeep', icon: 'bolt', name: 'TURBO', text: 'Hold to sprint. Watch the ring run down.' },
  { fill: 'sun', icon: 'star', name: 'HYPE', text: 'Big plays fill your bar for Hype Time!' },
  { fill: 'orange', icon: 'flame', name: 'ON FIRE', text: 'Plays in a row fill a flame. Fill it to catch fire!' },
];

function Row({ line }: { line: Line }) {
  return (
    <View style={styles.row}>
      <View style={[styles.chip, { backgroundColor: color[line.fill] }]}>
        <Icon name={line.icon} size={sizes.iconSmall} color="white" />
      </View>
      <View style={styles.rowText}>
        <Txt font="display" size="small">
          {line.name}
        </Txt>
        <Txt size="small" color="inkSoft">
          {line.text}
        </Txt>
      </View>
    </View>
  );
}

function Column({ title, fill, lines }: { title: string; fill: ColorName; lines: readonly Line[] }) {
  return (
    <Sticker fill="white" round="md" raise="low" border={stroke.thin} style={styles.column} face={styles.columnFace}>
      <View style={[styles.columnHead, { backgroundColor: color[fill] }]}>
        <Txt font="display" size="small" color="white" shadow center>
          {title}
        </Txt>
      </View>
      <View style={styles.columnBody}>
        {lines.map((l) => (
          <Row key={l.name} line={l} />
        ))}
      </View>
    </Sticker>
  );
}

/** The guide itself, without a frame, so it can sit in an overlay or on its own screen. */
export function HowToGuide() {
  return (
    <View style={styles.guide}>
      <View style={styles.columns}>
        <Column title="YOU HAVE THE BALL" fill="coral" lines={WITH_BALL} />
        <Column title="THEY HAVE THE BALL" fill="sky" lines={WITHOUT_BALL} />
      </View>
      <View style={styles.columns}>
        {ALWAYS.map((l) => (
          <Sticker key={l.name} fill="white" round="md" raise="low" border={stroke.thin} style={styles.column} face={styles.single}>
            <Row line={l} />
          </Sticker>
        ))}
      </View>
    </View>
  );
}

export function HowToOverlay({ onClose, closeLabel = 'GOT IT!' }: { onClose: () => void; closeLabel?: string }) {
  return (
    <Overlay>
      <Panel width={sizes.panelMax + px(120)} face={styles.panel}>
        <StickerText size="title" color="sun" center>
          HOW TO PLAY
        </StickerText>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false} bounces={false}>
          <HowToGuide />
        </ScrollView>
        <StickerButton label={closeLabel} fill="mint" onPress={onClose} style={styles.close} height={sizes.button} />
      </Panel>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  panel: {
    padding: space.md,
    gap: space.sm,
    alignItems: 'center',
  },
  scroll: {
    alignSelf: 'stretch',
    flexGrow: 0,
    flexShrink: 1,
  },
  scrollBody: {
    paddingBottom: space.xs,
  },
  guide: {
    gap: space.sm,
  },
  columns: {
    flexDirection: 'row',
    gap: space.sm,
  },
  column: {
    flex: 1,
  },
  columnFace: {
    flex: 1,
  },
  columnHead: {
    paddingVertical: space.xs,
    borderBottomWidth: stroke.thin,
    borderColor: color.ink,
  },
  columnBody: {
    padding: space.sm,
    gap: space.sm,
  },
  single: {
    padding: space.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  rowText: {
    flex: 1,
  },
  chip: {
    width: sizes.iconLarge,
    height: sizes.iconLarge,
    borderRadius: sizes.iconLarge / 2,
    borderWidth: stroke.thin,
    borderColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  close: {
    minWidth: sizes.cardLarge,
  },
});
