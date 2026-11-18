/** Join a friend's game on another device: tap in the four letters on their screen with a big letter pad. */

import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CODE_LENGTH } from '@/net/code';
import { problemWords } from '@/net/words';
import { useLeaveUnlessMatched, useOnline } from '@/state/online';
import { px, space } from '@/theme/tokens';
import { ArcadeScreen } from '@/ui/arcade/ArcadeScreen';
import { useWidth } from '@/ui/arcade/Buttons';
import { SignHead } from '@/ui/arcade/Controls';
import { Arrive, Breathe } from '@/ui/arcade/Motion';
import { PlayAsButton, PlayAsPopup } from '@/ui/arcade/PlayAs';
import { CodeTiles, LetterPad } from '@/ui/arcade/RoomCode';
import { NeonPanel } from '@/ui/arcade/Surface';
import { Glow, Print } from '@/ui/arcade/Type';

export default function Join() {
  const router = useRouter();
  const view = useOnline((s) => s.view);
  const unavailable = useOnline((s) => s.unavailable);
  const join = useOnline((s) => s.join);
  const leave = useOnline((s) => s.leave);
  const [code, setCode] = useState('');
  const [padW, onPadLayout] = useWidth();
  const playAs = useOnline((s) => s.playAs);
  const setPlayAs = useOnline((s) => s.setPlayAs);
  const [choosing, setChoosing] = useState(false);
  const [rowW, setRowW] = useState(0);

  useLeaveUnlessMatched();
  const phase = view?.phase;
  useEffect(() => {
    if (phase === 'matched') router.replace('/versus');
  }, [phase, router]);

  const type = (ch: string) => {
    // after a code that did not work, the next letter starts a new one
    if (view?.phase === 'failed') {
      leave();
      setCode(ch);
      return;
    }
    if (code.length >= CODE_LENGTH) return;
    const next = code + ch;
    setCode(next);
    if (next.length === CODE_LENGTH) join(next);
  };
  const back = () => {
    // a letter taken back stops looking for the game
    if (view) leave();
    setCode((c) => (view?.phase === 'failed' ? '' : c.slice(0, -1)));
  };

  const failed = view?.phase === 'failed' && view.problem ? problemWords(view.problem) : null;
  const looking = view !== null && (view.phase === 'joining' || view.phase === 'looking');

  return (
    <View style={styles.root}>
    <ArcadeScreen
      title="JOIN A GAME"
      tube="pink"
      onBack={() => {
        leave();
        router.back();
      }}
      style={styles.body}>
      <View style={styles.row}>
        <Arrive delay={40} from="left" style={styles.grow}>
          <NeonPanel tube="cyan" style={styles.panel}>
            <SignHead title="ROOM CODE" tube="cyan" />
            <View style={styles.center}>
              <CodeTiles code={code} size={px(64)} tube={failed ? 'red' : 'cyan'} typing={!looking && !failed} />
            </View>
            <View style={styles.status}>
              {unavailable ? (
                <Print face="medium" size="body" color="textSoft" center>
                  Playing on two devices isn’t set up in this version of the game.
                </Print>
              ) : failed ? (
                <>
                  <Glow face="display" size="large" tube="red" center>
                    {failed.title}
                  </Glow>
                  <Print face="medium" size="small" color="textSoft" center>
                    {failed.text}
                  </Print>
                </>
              ) : looking ? (
                <Breathe depth={0.5} ms={800}>
                  <Glow face="display" size="large" tube="pink" center>
                    LOOKING FOR THE GAME…
                  </Glow>
                </Breathe>
              ) : (
                <Print face="medium" size="body" color="textSoft" center>
                  Type the four letters on your friend’s screen.
                </Print>
              )}
            </View>
            {/* the team this device plays as goes with the hello, so it is picked before the code is in */}
            <View style={styles.you}>
              <Print face="bold" size="tiny" color="textFaint" track="wider">
                YOU
              </Print>
              <View
                style={styles.grow}
                onLayout={(e) => {
                  const w = Math.floor(e.nativeEvent.layout.width);
                  if (w !== rowW) setRowW(w);
                }}>
                {rowW > 0 && <PlayAsButton team={playAs} room={rowW} disabled={looking} onPress={() => setChoosing(true)} />}
              </View>
            </View>
          </NeonPanel>
        </Arrive>
        <Arrive delay={110} from="right" style={styles.side}>
          <View style={styles.padBox} onLayout={onPadLayout}>
            {padW > 0 && <LetterPad width={padW} onLetter={type} onBack={back} disabled={looking || (code.length >= CODE_LENGTH && !failed)} />}
          </View>
        </Arrive>
      </View>
    </ArcadeScreen>
    {/* any team plays in a game of either size, so the list does not depend on the size the host picks */}
    {choosing && <PlayAsPopup team={playAs} perTeam={3} tube="pink" onClose={() => setChoosing(false)} onPick={setPlayAs} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  you: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
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
  },
  status: {
    minHeight: px(64),
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xs,
  },
  padBox: {
    alignItems: 'center',
  },
});
