/**
 * Host a game for a friend on another device: a room code in big letters to read out, and a wait for the friend to
 * type it in. When they do, both devices go to the versus card together.
 */

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { COURT_IDS } from '@/game/render/court';
import { RANDOM_COURT } from '@/meta/courts';
import { problemWords } from '@/net/words';
import { useLeaveUnlessMatched, useOnline } from '@/state/online';
import { useSave } from '@/state/save';
import { tube as tubes } from '@/theme/arcade';
import { px, space } from '@/theme/tokens';
import { ArcadeScreen } from '@/ui/arcade/ArcadeScreen';
import { GoldButton } from '@/ui/arcade/Buttons';
import { PickRow, SignHead, type Choice } from '@/ui/arcade/Controls';
import { FadeScroll } from '@/ui/arcade/FadeScroll';
import { LineIcon } from '@/ui/arcade/LineIcon';
import { Arrive, Breathe } from '@/ui/arcade/Motion';
import { PlayAsButton, PlayAsPopup } from '@/ui/arcade/PlayAs';
import { CourtPick, GLOW_ROOM } from '@/ui/arcade/Pickers';
import { CodeTiles } from '@/ui/arcade/RoomCode';
import { NeonPanel } from '@/ui/arcade/Surface';
import { Glow, Print } from '@/ui/arcade/Type';

const FORMATS: readonly Choice<2 | 3>[] = [
  { value: 2, label: '2 on 2', lamps: 2 },
  { value: 3, label: '3 on 3', lamps: 3 },
];

export default function Host() {
  const router = useRouter();
  const view = useOnline((s) => s.view);
  const unavailable = useOnline((s) => s.unavailable);
  const host = useOnline((s) => s.host);
  const leave = useOnline((s) => s.leave);
  const format = useSave((s) => s.settings.format);
  const setSetting = useSave((s) => s.setSetting);
  // the court and the team the host plays as are read when the friend arrives, so they can change until then
  const court = useSave((s) => s.settings.hostCourt);
  const playAs = useOnline((s) => s.playAs);
  const setPlayAs = useOnline((s) => s.setPlayAs);
  const [choosing, setChoosing] = useState(false);
  const [rowW, setRowW] = useState(0);

  useEffect(() => {
    host();
  }, [host]);
  useLeaveUnlessMatched();

  const phase = view?.phase;
  useEffect(() => {
    if (phase === 'matched') router.replace('/versus');
  }, [phase, router]);

  const failed = view?.phase === 'failed' && view.problem ? problemWords(view.problem) : null;
  const code = view && view.phase !== 'joining' && view.phase !== 'failed' ? view.code : '';

  return (
    <View style={styles.root}>
    <ArcadeScreen
      title="HOST A GAME"
      tube="pink"
      onBack={() => {
        leave();
        router.back();
      }}
      style={styles.body}>
      <View style={styles.row}>
        <Arrive delay={40} from="left" style={styles.grow}>
          <NeonPanel tube="cyan" style={styles.panel}>
            <SignHead title="YOUR ROOM CODE" tube="cyan" />
            <View style={styles.center}>
              <CodeTiles code={code} size={px(76)} tube="cyan" />
            </View>
            <Print face="medium" size="body" color="textSoft" center>
              On your friend’s device, tap 2 PLAYERS, then JOIN, and type these letters.
            </Print>
          </NeonPanel>
        </Arrive>
        <Arrive delay={110} from="right" style={styles.side}>
          <NeonPanel tube="pink" style={[styles.panel, styles.status]}>
            {unavailable ? (
              <>
                <Glow face="display" size="large" tube="pink" center>
                  NOT IN THIS BUILD
                </Glow>
                <Print face="medium" size="body" color="textSoft" center>
                  Playing on two devices isn’t set up in this version of the game.
                </Print>
              </>
            ) : failed ? (
              <>
                <Glow face="display" size="large" tube="red" center>
                  {failed.title}
                </Glow>
                <Print face="medium" size="body" color="textSoft" center>
                  {failed.text}
                </Print>
                <GoldButton label="TRY AGAIN" icon="again" size="small" onPress={host} />
              </>
            ) : (
              <>
                <View style={styles.status}>
                  <Breathe depth={0.5} ms={900}>
                    <LineIcon name="duo" size={px(32)} tube={view?.friendHere ? 'green' : 'pink'} />
                  </Breathe>
                  <Glow face="display" size="large" tube={view?.friendHere ? 'green' : 'pink'} center>
                    {phase === 'joining' || !view ? 'OPENING A ROOM…' : view.friendHere ? 'YOUR FRIEND IS HERE!' : 'WAITING FOR YOUR FRIEND…'}
                  </Glow>
                </View>
                <View style={styles.option}>
                  <Print face="bold" size="tiny" color="textFaint" track="wider" style={styles.optionLabel}>
                    PLAYERS
                  </Print>
                  <View style={styles.grow}>
                    <PickRow options={FORMATS} value={format} onChange={(v) => setSetting('format', v)} tube="pink" />
                  </View>
                </View>
                <View style={styles.option}>
                  <Print face="bold" size="tiny" color="textFaint" track="wider" style={styles.optionLabel}>
                    YOU
                  </Print>
                  <View
                    style={styles.grow}
                    onLayout={(e) => {
                      const w = Math.floor(e.nativeEvent.layout.width);
                      if (w !== rowW) setRowW(w);
                    }}>
                    {rowW > 0 && <PlayAsButton team={playAs} room={rowW} onPress={() => setChoosing(true)} />}
                  </View>
                </View>
                <View style={styles.option}>
                  <Print face="bold" size="tiny" color="textFaint" track="wider" style={styles.optionLabel}>
                    COURT
                  </Print>
                  <FadeScroll horizontal showsHorizontalScrollIndicator={false} reach={px(30)} style={styles.courtsBox} contentContainerStyle={styles.courts}>
                    <CourtPick id={RANDOM_COURT} selected={court === RANDOM_COURT} onPress={() => setSetting('hostCourt', RANDOM_COURT)} tube="pink" />
                    <CourtPick id={null} selected={court === null} onPress={() => setSetting('hostCourt', null)} tube="pink" homeLabel="Your court" />
                    {COURT_IDS.map((id) => (
                      <CourtPick key={id} id={id} selected={court === id} onPress={() => setSetting('hostCourt', id)} tube="pink" />
                    ))}
                  </FadeScroll>
                </View>
                <Print face="medium" size="tiny" color={tubes.pink.soft} center>
                  Your friend picks their own team.
                </Print>
              </>
            )}
          </NeonPanel>
        </Arrive>
      </View>
    </ArcadeScreen>
    {choosing && <PlayAsPopup team={playAs} perTeam={format} tube="pink" onClose={() => setChoosing(false)} onPick={setPlayAs} />}
    </View>
  );
}

/** the label column beside each choice, so the rows line up */
const LABEL_W = px(66);

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
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
    justifyContent: 'center',
  },
  side: {
    width: '48%',
    justifyContent: 'center',
  },
  panel: {
    padding: px(16),
    gap: space.md,
  },
  center: {
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  status: {
    alignItems: 'center',
    gap: space.xs,
  },
  option: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  optionLabel: {
    width: LABEL_W,
  },
  courtsBox: {
    flex: 1,
    marginLeft: -GLOW_ROOM,
    marginRight: -px(16),
  },
  courts: {
    gap: space.sm,
    padding: GLOW_ROOM,
  },
});
