/** The pause menu: carry on, check the controls, flip a setting, or leave the game. */

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSave } from '@/state/save';
import { px, size as sizes, space } from '@/theme/tokens';
import { ToggleChip } from '@/ui/Inputs';
import { Overlay, Panel } from '@/ui/Overlay';
import { StickerButton } from '@/ui/Sticker';
import { StickerText, Txt } from '@/ui/Txt';

export function PauseMenu({
  line,
  onResume,
  onHowTo,
  onQuit,
  quitNote,
}: {
  /** one line about where the game stands, e.g. "COM 12 - 9 STM" */
  line: string;
  onResume: () => void;
  onHowTo: () => void;
  onQuit: () => void;
  /** what quitting costs, shown before the person confirms */
  quitNote: string;
}) {
  const [confirm, setConfirm] = useState(false);
  const settings = useSave((s) => s.settings);
  const setSetting = useSave((s) => s.setSetting);

  if (confirm) {
    return (
      <Overlay>
        <Panel width={sizes.panelMax - px(140)} face={styles.panel}>
          <StickerText size="title" color="coral" center>
            QUIT GAME?
          </StickerText>
          <Txt center color="inkSoft">
            {quitNote}
          </Txt>
          <View style={styles.row}>
            <StickerButton label="KEEP PLAYING" fill="mint" onPress={() => setConfirm(false)} style={styles.grow} textSize="body" />
            <StickerButton label="QUIT" fill="coral" textColor="white" onPress={onQuit} style={styles.grow} textSize="body" />
          </View>
        </Panel>
      </Overlay>
    );
  }

  return (
    <Overlay>
      <Panel width={sizes.panelMax - px(100)} face={styles.panel}>
        <StickerText size="title" color="sun" center>
          PAUSED
        </StickerText>
        <Txt font="display" size="body" color="inkSoft" center>
          {line}
        </Txt>
        <StickerButton label="RESUME" icon="play" iconColor="white" fill="mint" onPress={onResume} height={sizes.button} />
        <View style={styles.row}>
          <StickerButton label="HOW TO PLAY" icon="help" iconColor="sun" fill="white" onPress={onHowTo} style={styles.grow} textSize="body" />
          <StickerButton label="QUIT" icon="close" iconColor="coral" fill="white" onPress={() => setConfirm(true)} style={styles.grow} textSize="body" />
        </View>
        <View style={styles.row}>
          <ToggleChip label="Sound" icon="sound" iconOff="mute" on={settings.sound} onChange={(v) => setSetting('sound', v)} style={styles.grow} />
          <ToggleChip label="Music" icon="music" on={settings.music} onChange={(v) => setSetting('music', v)} style={styles.grow} />
          <ToggleChip label="Lefty" icon="swap" fill="sun" on={settings.lefty} onChange={(v) => setSetting('lefty', v)} style={styles.grow} />
        </View>
      </Panel>
    </Overlay>
  );
}

const styles = StyleSheet.create({
  panel: {
    padding: space.lg,
    gap: space.sm,
  },
  row: {
    flexDirection: 'row',
    gap: space.sm,
  },
  grow: {
    flex: 1,
  },
});
