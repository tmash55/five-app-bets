/** The match screen: the 3D game with the scoreboard, callouts and game pad on top. */

import { useKeepAwake } from 'expo-keep-awake';
import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, BackHandler, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setAmbience, setMusic, warmSounds } from '@/audio/sound';
import { shortName } from '@/data/roster';
import { MatchView } from '@/game/MatchView';
import { MatchRunner, type HudState } from '@/game/runner';
import { Controls } from '@/match/Controls';
import { MATCH_SOUNDS, MatchDirector } from '@/match/director';
import { HowToOverlay } from '@/match/HowTo';
import { CalloutLayer, ControlPlate, Scoreboard, type CalloutHandle } from '@/match/Hud';
import { PauseMenu } from '@/match/PauseMenu';
import { buildMatch, summarize, type MatchSetup } from '@/meta/match';
import { useSave } from '@/state/save';
import { useSession } from '@/state/session';
import { color, layer, space } from '@/theme/tokens';
import { IconButton } from '@/ui/Sticker';

const HOW_TO_TIP = 'howToPlay';

function Match({ setup }: { setup: MatchSetup }) {
  useKeepAwake();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const built = useMemo(() => buildMatch(setup), [setup]);
  const [runner] = useState(() => new MatchRunner(built.config, built.visuals));
  const [hud, setHud] = useState<HudState | null>(null);
  const [paused, setPaused] = useState(false);
  const firstGame = useSave((s) => !s.tips[HOW_TO_TIP]);
  const [howTo, setHowTo] = useState(firstGame && !setup.spectate);
  const callouts = useRef<CalloutHandle>(null);
  const lefty = useSave((s) => s.settings.lefty);
  const finishMatch = useSave((s) => s.finishMatch);
  const seeTip = useSave((s) => s.seeTip);
  const finish = useSession((s) => s.finish);

  useEffect(() => {
    setMusic('game');
    setAmbience(setup.court);
    // the countdown is long enough to have every sound of the match ready before tip-off
    warmSounds(MATCH_SOUNDS);
    return () => setAmbience(null);
  }, [setup.court]);

  useEffect(() => {
    const director = new MatchDirector({
      names: built.lineup.map((l) => shortName(l.def)),
      quarters: setup.quarters,
      show: (c) => callouts.current?.show(c),
    });
    runner.listen({
      onHud: setHud,
      onEvent: (e, m) => director.handle(e, m),
      onStep: (m) => director.watch(m),
      onFinal: (m) => {
        if (setup.spectate) {
          router.dismissTo('/');
          return;
        }
        const summary = summarize(m, setup, director.buzzerBeater);
        finish(summary, finishMatch(summary));
        router.replace('/results');
      },
    });
    if (__DEV__) (globalThis as Record<string, unknown>).__bs = runner;
    return () => runner.listen({});
  }, [runner, built, setup, router, finish, finishMatch]);

  const stopped = paused || howTo;
  useEffect(() => {
    runner.setPaused(stopped);
  }, [runner, stopped]);

  // a game left in the background waits, paused, for its player to come back
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && runner.m.phase !== 'final') setPaused(true);
    });
    return () => sub.remove();
  }, [runner]);

  const closeHowTo = useCallback(() => {
    seeTip(HOW_TO_TIP);
    setHowTo(false);
  }, [seeTip]);

  const quit = useCallback(() => {
    router.dismissTo('/');
  }, [router]);

  // Android's back button never drops a game by accident: it pauses, and a second press carries on
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (howTo) closeHowTo();
      else if (runner.m.phase !== 'final') setPaused((p) => !p);
      return true;
    });
    return () => sub.remove();
  }, [runner, howTo, closeHowTo]);

  const names: [string, string] = [setup.home.short, setup.away.short];
  const over = hud?.phase === 'final';
  const controlled = hud && hud.control >= 0 ? built.lineup[hud.control] : null;

  return (
    <View style={styles.root}>
      <MatchView runner={runner} />
      {hud && <Scoreboard hud={hud} names={names} colors={built.colors} />}
      <CalloutLayer ref={callouts} colors={built.colors} />
      {hud && !setup.spectate && !over && <Controls runner={runner} offense={hud.offense} lefty={lefty} turbo={hud.turbo} enabled={!stopped} />}
      {controlled && !over && <ControlPlate playerId={controlled.def.id} name={shortName(controlled.def)} fill={built.colors[0]} hyped={hud !== null && hud.hype[0] > 20} />}
      {!over && (
        <View style={[styles.pause, { top: Math.max(insets.top, space.sm), left: Math.max(insets.left, space.md) }]}>
          <IconButton name="pause" label="Pause" onPress={() => setPaused(true)} />
        </View>
      )}
      {paused && !howTo && hud && (
        <PauseMenu
          line={`${names[0]} ${hud.score[0]}  -  ${hud.score[1]} ${names[1]}`}
          onResume={() => setPaused(false)}
          onHowTo={() => setHowTo(true)}
          onQuit={quit}
          quitNote={setup.mode === 'quick' ? 'This game will not count.' : 'This game will not count, and you will not win anything for it.'}
        />
      )}
      {howTo && <HowToOverlay onClose={closeHowTo} closeLabel={paused ? 'BACK' : "LET'S PLAY!"} />}
    </View>
  );
}

export default function MatchScreen() {
  const setup = useSession((s) => s.setup);
  if (!setup) return <Redirect href="/" />;
  return <Match key={setup.seed} setup={setup} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.ink,
  },
  pause: {
    position: 'absolute',
    zIndex: layer.menu,
  },
});
