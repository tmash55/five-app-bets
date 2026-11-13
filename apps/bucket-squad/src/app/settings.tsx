/** Settings: sound, controls, game length, your record, the how-to-play guide, the account and starting over. */

import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAccount } from '@/account';
import { HAS_EXTRA_ROSTER } from '@/data/roster';
import { HowToOverlay } from '@/match/HowTo';
import type { Stats } from '@/state/logic';
import { useSave } from '@/state/save';
import { tube as tubes } from '@/theme/arcade';
import { px, space } from '@/theme/tokens';
import { AccountRow, AccountSheet, useGate } from '@/ui/arcade/Account';
import { ArcadeScreen } from '@/ui/arcade/ArcadeScreen';
import { GhostButton, GoldButton } from '@/ui/arcade/Buttons';
import { LampSwitch, PickRow, SignHead, type Choice } from '@/ui/arcade/Controls';
import { LineIcon, type LineIconName } from '@/ui/arcade/LineIcon';
import { Arrive } from '@/ui/arcade/Motion';
import { Popup } from '@/ui/arcade/Popup';
import { NeonPanel, Tag, Well } from '@/ui/arcade/Surface';
import { Glow, Print } from '@/ui/arcade/Type';

// one lamp for the shortest game, three for the longest
const QUARTERS: readonly Choice<45 | 60 | 90>[] = [
  { value: 45, label: '0:45', lamps: 1 },
  { value: 60, label: '1:00', lamps: 2 },
  { value: 90, label: '1:30', lamps: 3 },
];

/** the record, each with the same picture it has on the missions page */
const RECORD: readonly { key: keyof Stats; label: string; icon: LineIconName }[] = [
  { key: 'wins', label: 'WINS', icon: 'trophy' },
  { key: 'games', label: 'GAMES', icon: 'ball' },
  { key: 'points', label: 'POINTS', icon: 'star' },
  { key: 'dunks', label: 'DUNKS', icon: 'up' },
  { key: 'threes', label: 'THREES', icon: 'target' },
  { key: 'steals', label: 'STEALS', icon: 'bolt' },
  { key: 'blocks', label: 'BLOCKS', icon: 'close' },
  { key: 'packs', label: 'PACKS', icon: 'pack' },
];

function Stat({ label, value, icon }: { label: string; value: number; icon: LineIconName }) {
  return (
    <View accessible accessibilityLabel={`${label.toLowerCase()}: ${value}`} style={styles.stat}>
      <LineIcon name={icon} size={px(18)} tube="steel" />
      <Print face="display" size="large" color="text" lines={1}>
        {value.toLocaleString('en-US')}
      </Print>
      <Print face="bold" size="micro" color="textFaint" track="wide" lines={1}>
        {label}
      </Print>
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
  const [accountOpen, setAccountOpen] = useState(false);
  const [gate, askGrownUp] = useGate();
  const phase = useAccount((s) => s.phase);
  const inAccount = useAccount((s) => s.userId !== null);

  const startOver = () => {
    resetAll();
    setConfirm(false);
    router.dismissTo('/');
  };

  return (
    <View style={styles.root}>
      <ArcadeScreen title="SETTINGS" tube="white" coins={false} style={styles.body} right={HAS_EXTRA_ROSTER ? <Tag label="FAMILY BUILD" tube="gold" small /> : undefined}>
        <View style={styles.row}>
          <Arrive delay={40} from="left" style={styles.left}>
            <NeonPanel tube="steel" style={styles.panel}>
              <View style={styles.switches}>
                <LampSwitch label="Sound" icon="sound" iconOff="mute" tube="cyan" on={settings.sound} onChange={(v) => setSetting('sound', v)} />
                <LampSwitch label="Music" icon="music" tube="cyan" on={settings.music} onChange={(v) => setSetting('music', v)} />
                <LampSwitch label="Buzz" icon="buzz" tube="cyan" on={settings.haptics} onChange={(v) => setSetting('haptics', v)} />
              </View>
              <View style={styles.switches}>
                <LampSwitch label="Easy shots" icon="target" tube="gold" on={settings.easyShots} onChange={(v) => setSetting('easyShots', v)} />
                <LampSwitch label="Lefty pad" icon="swap" tube="gold" on={settings.lefty} onChange={(v) => setSetting('lefty', v)} />
              </View>
              <Print face="medium" size="tiny" color="textDim">
                Easy shots gives you more time to let go of a shot. Lefty pad puts the buttons on the left.
              </Print>
              <View style={styles.option}>
                <Print face="bold" size="tiny" color="textFaint" track="wider" lines={1} style={styles.optionLabel}>
                  QUARTER LENGTH
                </Print>
                <PickRow options={QUARTERS} value={settings.quarterSeconds} onChange={(v) => setSetting('quarterSeconds', v)} tube="cyan" style={styles.grow} />
              </View>
            </NeonPanel>
          </Arrive>

          <Arrive delay={110} from="right" style={styles.right}>
            <NeonPanel tube="steel" style={styles.panel}>
              <SignHead title="YOUR RECORD" tube="steel" />
              <Well style={styles.stats}>
                {RECORD.map((r) => (
                  <Stat key={r.key} label={r.label} value={stats[r.key]} icon={r.icon} />
                ))}
              </Well>
            </NeonPanel>
            <View style={styles.buttons}>
              <GhostButton label="HOW TO PLAY" icon="help" tube="cyan" onPress={() => setHowTo(true)} style={styles.grow} />
              <GhostButton label="START OVER" icon="close" tube="red" onPress={() => setConfirm(true)} style={styles.grow} />
            </View>
            <AccountRow onOpen={() => askGrownUp(() => setAccountOpen(true))} note={`Bucket Squad ${Constants.expoConfig?.version ?? ''}`} />
          </Arrive>
        </View>
      </ArcadeScreen>
      {howTo && <HowToOverlay onClose={() => setHowTo(false)} />}
      {/* the pick between two saved games has its own pop-up over every page (see _layout) */}
      {accountOpen && phase !== 'choose' && <AccountSheet onClose={() => setAccountOpen(false)} />}
      {gate}
      {confirm && (
        <Popup tube="red" width={px(400)} onDismiss={() => setConfirm(false)} style={styles.confirm}>
          <Glow face="display" size="title" tube="red" track="close">
            START OVER?
          </Glow>
          <Print face="medium" size="body" color="textSoft" center>
            {inAccount ? 'This erases every player, coin, pack and win on this device and in your account. It cannot be undone.' : 'This erases every player, coin, pack and win on this device. It cannot be undone.'}
          </Print>
          <View style={styles.buttons}>
            <GoldButton label="KEEP MY GAME" size="small" onPress={() => setConfirm(false)} style={styles.grow} />
            <GhostButton label="ERASE IT" icon="close" tube={tubes.red} onPress={startOver} style={styles.grow} />
          </View>
        </Popup>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  body: {
    paddingTop: space.md,
  },
  // both panels hang from the same top line, so their tops match whatever their heights
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.lg,
  },
  grow: {
    flex: 1,
  },
  left: {
    flex: 1.1,
  },
  right: {
    flex: 1,
    gap: space.sm,
  },
  panel: {
    padding: px(10),
    gap: space.sm,
  },
  switches: {
    flexDirection: 'row',
    gap: space.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  optionLabel: {
    flexShrink: 0,
  },
  // two rows of four, so the whole record shows at once
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: space.sm,
    paddingVertical: space.sm,
  },
  stat: {
    width: '25%',
    alignItems: 'center',
    gap: px(1),
  },
  buttons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  confirm: {
    alignItems: 'center',
    gap: space.md,
  },
});
