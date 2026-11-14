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
          </NeonPanel>
        </Arrive>
        <Arrive delay={110} from="right" style={styles.side}>
          <View style={styles.padBox} onLayout={onPadLayout}>
            {padW > 0 && <LetterPad width={padW} onLetter={type} onBack={back} disabled={looking || (code.length >= CODE_LENGTH && !failed)} />}
          </View>
        </Arrive>
      </View>
    </ArcadeScreen>
  );
}

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
