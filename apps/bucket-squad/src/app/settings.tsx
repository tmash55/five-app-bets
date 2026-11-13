/** Settings: sound, controls, game length, your record, the how-to-play guide and starting over. */

import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { HAS_EXTRA_ROSTER } from '@/data/roster';
import { HowToOverlay } from '@/match/HowTo';
import { useSave } from '@/state/save';
import { px, size as sizes, space } from '@/theme/tokens';
import { Tag } from '@/ui/Bits';
import { Segmented, ToggleChip, type Choice } from '@/ui/Inputs';
import { Overlay, Panel } from '@/ui/Overlay';
import { Screen } from '@/ui/Screen';
import { Sticker, StickerButton } from '@/ui/Sticker';
import { StickerText, Txt } from '@/ui/Txt';

const QUARTERS: readonly Choice<45 | 60 | 90>[] = [
  { value: 45, label: '0:45' },
  { value: 60, label: '1:00' },
  { value: 90, label: '1:30' },
];

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Txt font="display" size="large">
        {value.toLocaleString('en-US')}
      </Txt>
      <Txt size="tiny" color="inkSoft" lines={1}>
        {label}
      </Txt>
    </View>
  );
}

export default function Settings() {
  const router = useRouter();
  const settings = useSave((s) => s.settings);
  const stats = useSave((s) => s.stats);
  const setSetting = useSave((s) => s.setSetting);
  const resetAll = useSave((s) => s.resetAll);
  const [howTo, setHowTo] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const startOver = () => {
    resetAll();
    setConfirm(false);
    router.dismissTo('/');
  };

  return (
    <View style={styles.root}>
      <Screen title="SETTINGS" tone="sky" coins={false} right={HAS_EXTRA_ROSTER ? <Tag label="Family build" fill="sun" icon="star" style={styles.centerSelf} /> : undefined}>
        <View style={styles.row}>
          <Sticker fill="paper" round="lg" raise="mid" style={styles.column} face={styles.panel}>
            <View style={styles.chips}>
              <ToggleChip label="Sound" icon="sound" iconOff="mute" on={settings.sound} onChange={(v) => setSetting('sound', v)} style={styles.chip} />
              <ToggleChip label="Music" icon="music" on={settings.music} onChange={(v) => setSetting('music', v)} style={styles.chip} />
              <ToggleChip label="Buzz" icon="bolt" on={settings.haptics} onChange={(v) => setSetting('haptics', v)} style={styles.chip} />
            </View>
            <View style={styles.chips}>
              <ToggleChip label="Easy shots" icon="target" fill="sun" on={settings.easyShots} onChange={(v) => setSetting('easyShots', v)} style={styles.chip} />
              <ToggleChip label="Lefty pad" icon="swap" fill="sun" on={settings.lefty} onChange={(v) => setSetting('lefty', v)} style={styles.chip} />
            </View>
            <Txt size="tiny" color="inkSoft">
              Easy shots gives you more time to let go of a shot. Lefty pad puts the buttons on the left.
            </Txt>
            <View style={styles.option}>
              <Txt font="display" size="small" color="inkSoft">
                QUARTER LENGTH
              </Txt>
              <Segmented options={QUARTERS} value={settings.quarterSeconds} onChange={(v) => setSetting('quarterSeconds', v)} />
            </View>
          </Sticker>

          <View style={styles.column}>
            <Sticker fill="paper" round="lg" raise="mid" face={styles.panel}>
              <Txt font="display" size="small" color="inkSoft">
                YOUR RECORD
              </Txt>
              <View style={styles.stats}>
                <Stat label="Wins" value={stats.wins} />
                <Stat label="Games" value={stats.games} />
                <Stat label="Points" value={stats.points} />
                <Stat label="Dunks" value={stats.dunks} />
                <Stat label="Threes" value={stats.threes} />
                <Stat label="Steals" value={stats.steals} />
                <Stat label="Blocks" value={stats.blocks} />
                <Stat label="Packs" value={stats.packs} />
              </View>
            </Sticker>
            <StickerButton label="HOW TO PLAY" icon="help" iconColor="sun" fill="white" textSize="body" onPress={() => setHowTo(true)} />
            <StickerButton label="START OVER" icon="close" iconColor="coral" fill="white" textSize="body" onPress={() => setConfirm(true)} />
            <Txt size="tiny" color="white" center>{`Bucket Squad ${Constants.expoConfig?.version ?? ''}  ·  Your game is saved on this device.`}</Txt>
          </View>
        </View>
      </Screen>
      {howTo && <HowToOverlay onClose={() => setHowTo(false)} />}
      {confirm && (
        <Overlay>
          <Panel width={sizes.panelMax - px(120)} face={styles.confirm}>
            <StickerText size="title" color="coral" center>
              START OVER?
            </StickerText>
            <Txt center color="inkSoft">
              This erases every player, coin, pack and win on this device. It cannot be undone.
            </Txt>
            <View style={styles.chips}>
              <StickerButton label="KEEP MY GAME" fill="mint" textSize="body" onPress={() => setConfirm(false)} style={styles.chip} />
              <StickerButton label="ERASE IT" fill="coral" textColor="white" textSize="body" onPress={startOver} style={styles.chip} />
            </View>
          </Panel>
        </Overlay>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
  },
  column: {
    flex: 1,
    gap: space.sm,
  },
  panel: {
    padding: space.md,
    gap: space.sm,
  },
  chips: {
    flexDirection: 'row',
    gap: space.sm,
  },
  chip: {
    flex: 1,
  },
  option: {
    gap: space.hair,
  },
  // two rows of four, so the whole record shows at once
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: space.xs,
  },
  stat: {
    alignItems: 'center',
    width: '25%',
  },
  confirm: {
    gap: space.sm,
  },
  centerSelf: {
    alignSelf: 'center',
  },
});
