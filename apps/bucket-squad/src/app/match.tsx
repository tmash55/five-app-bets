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
import { DuoControls, type DuoSeat } from '@/match/DuoControls';
import { MATCH_SOUNDS, MatchDirector } from '@/match/director';
import { HowToOverlay } from '@/match/HowTo';
import { CalloutLayer, ControlPlate, NetHint, Scoreboard, SquadHeat, type CalloutHandle } from '@/match/Hud';
import { PauseMenu } from '@/match/PauseMenu';
import { buildMatch, seenBy, summarize, type MatchSetup } from '@/meta/match';
import { LOCKSTEP } from '@/net/lockstep';
import { problemWords } from '@/net/words';
import { useOnline } from '@/state/online';
import { useSave } from '@/state/save';
import { useSession } from '@/state/session';
import { color, layer, px, size as sizes, space } from '@/theme/tokens';
import { Overlay, Panel } from '@/ui/Overlay';
import { IconButton, StickerButton } from '@/ui/Sticker';
import { StickerText, Txt } from '@/ui/Txt';

/** an online game held up this long (ms) for the other device's moves says so on screen */
const HINT_AFTER = 300;
/** a round trip longer than the longest input delay covers there and back (12 ticks each way is 400 ms) */
const SLOW_LINE_MS = (LOCKSTEP.maxDelay * 2 * 1000) / 60;

const HOW_TO_TIP = 'howToPlay';

function Match({ setup }: { setup: MatchSetup }) {
  useKeepAwake();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const built = useMemo(() => buildMatch(setup), [setup]);
  // two devices: both run this same match in lockstep; this one plays its own team (the guest's is the away side)
  const online = setup.mode === 'online';
  const room = useOnline((s) => s.room);
  const view = useOnline((s) => s.view);
  const local = online && room?.role === 'guest' ? 1 : 0;
  const [runner] = useState(() => {
    const r = new MatchRunner(built.config, built.visuals);
    const lock = online ? room?.lock : null;
    if (lock) {
      r.setLocalTeam(local);
      r.setSource(0, lock.source(0, local === 0 ? r.pads[0] : undefined));
      r.setSource(1, lock.source(1, local === 1 ? r.pads[1] : undefined));
    }
    return r;
  });
  const [hud, setHud] = useState<HudState | null>(null);
  const [paused, setPaused] = useState(false);
  const firstGame = useSave((s) => !s.tips[HOW_TO_TIP]);
  // two people on one screen: a cluster of controls each, and either of them can pause
  const duo = setup.mode === 'duo' && setup.duo !== undefined && !setup.spectate;
  const [howTo, setHowTo] = useState(firstGame && !setup.spectate && !duo && !online);
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
      onStep: (m) => {
        director.watch(m);
        if (online) room?.lock?.afterStep(m);
      },
      onFinal: (m) => {
        if (setup.spectate) {
          router.dismissTo('/');
          return;
        }
        if (online) room?.finish();
        // online, each device's own side comes first in what it is paid and shown
        const summary = seenBy(summarize(m, setup, director.buzzerBeater), local);
        finish(summary, finishMatch(summary));
        router.replace('/results');
      },
    });
    // tooling: `__bs.pads[0]` and `__bs.pads[1]` are each team's input frame, for driving a two-player game by script
    if (__DEV__) (globalThis as Record<string, unknown>).__bs = runner;
    return () => runner.listen({});
  }, [runner, built, setup, router, finish, finishMatch, room, online, local]);

  // online, a pause on either device pauses both, and a game that has ended for a reason stays stopped
  const netPaused = online && view?.paused === true;
  const netFailed = online && view?.phase === 'failed' ? view.problem : null;
  const pauseHere = useCallback(
    (on: boolean) => {
      if (online) room?.pause(on);
      else setPaused(on);
    },
    [online, room],
  );
  const stopped = paused || howTo || netPaused || netFailed !== null;
  useEffect(() => {
    runner.setPaused(stopped);
  }, [runner, stopped]);

  // a game left in the background waits, paused, for its player to come back
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && runner.m.phase !== 'final') pauseHere(true);
    });
    return () => sub.remove();
  }, [runner, pauseHere]);

  const closeHowTo = useCallback(() => {
    seeTip(HOW_TO_TIP);
    setHowTo(false);
  }, [seeTip]);

  const quit = useCallback(() => {
    if (online) useOnline.getState().leave();
    router.dismissTo('/');
  }, [router, online]);

  // Android's back button never drops a game by accident: it pauses, and a second press carries on
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (howTo) closeHowTo();
      else if (runner.m.phase !== 'final') {
        if (online) room?.pause(!(useOnline.getState().view?.paused ?? false));
        else setPaused((p) => !p);
      }
      return true;
    });
    return () => sub.remove();
  }, [runner, howTo, closeHowTo, online, room]);

  const names: [string, string] = [setup.home.short, setup.away.short];
  const over = hud?.phase === 'final';
  // the person on this screen: the first side, or online the guest's away side (the match's second seat)
  const mine = hud ? (local === 1 ? { offense: hud.second?.offense ?? false, turbo: hud.second?.turbo ?? 0, control: hud.second?.control ?? -1 } : { offense: hud.offense, turbo: hud.turbo, control: hud.control }) : null;
  const controlled = mine && mine.control >= 0 ? built.lineup[mine.control] : null;
  // the person's own players, each with their flame meter
  const squad = hud && mine && !setup.spectate && !duo ? built.lineup.flatMap((l, i) => (l.team === local ? [{ id: l.def.id, fire: hud.fire[i] ?? 0, you: i === mine.control }] : [])) : [];
  const showPause = paused || netPaused;
  // a line too slow for the input delay to cover: the match keeps stopping for a moment at a time, each stop too short
  // for "Connecting…". Said steadily, so slow motion is not taken for a broken game
  const slowLine = online && view?.phase === 'playing' && !netPaused && view.delay >= LOCKSTEP.maxDelay && view.rtt !== null && view.rtt > SLOW_LINE_MS;
  const hint = online && view?.phase === 'playing' && !netPaused && view.waiting >= HINT_AFTER ? (runner.m.tick < 60 ? 'Waiting for your friend…' : 'Connecting…') : slowLine ? 'Slow connection' : null;
  const failedWords = netFailed ? problemWords(netFailed) : null;

  return (
    <View style={styles.root}>
      <MatchView runner={runner} />
      {hud && <Scoreboard hud={hud} names={names} colors={built.colors} />}
      <CalloutLayer ref={callouts} colors={built.colors} />
      {hud && mine && !setup.spectate && !over && !duo && <Controls runner={runner} offense={mine.offense} lefty={lefty} turbo={mine.turbo} enabled={!stopped} />}
      {hud && duo && !over && <DuoControls runner={runner} seats={duoSeats(hud)} colors={built.colors} enabled={!stopped} />}
      {squad.length > 0 && !over && <SquadHeat players={squad} fill={built.colors[local]} />}
      {controlled && mine && !over && !duo && <ControlPlate playerId={controlled.def.id} name={shortName(controlled.def)} fill={built.colors[local]} hyped={hud !== null && hud.hype[local] > 20} onFire={hud !== null && (hud.fire[mine.control] ?? 0) > 20} />}
      {hint !== null && !over && <NetHint text={hint} />}
      {!over && (
        <View style={[styles.pause, { top: Math.max(insets.top, space.sm), left: Math.max(insets.left, space.md) }]}>
          <IconButton name="pause" label={duo ? 'Pause, Player 1' : 'Pause'} onPress={() => pauseHere(true)} />
        </View>
      )}
      {!over && duo && (
        <View style={[styles.pause, { top: Math.max(insets.top, space.sm), right: Math.max(insets.right, space.md) }]}>
          <IconButton name="pause" label="Pause, Player 2" onPress={() => setPaused(true)} />
        </View>
      )}
      {showPause && !howTo && hud && !failedWords && (
        <PauseMenu
          line={`${names[0]} ${hud.score[0]}  -  ${hud.score[1]} ${names[1]}`}
          onResume={() => pauseHere(false)}
          onHowTo={() => setHowTo(true)}
          onQuit={quit}
          lefty={!duo}
          note={online ? (view?.pausedBy === 'friend' ? 'Your friend paused the game.' : 'Your friend’s game is paused too.') : undefined}
          quitNote={online ? 'This game will not count for either of you.' : setup.mode === 'quick' || setup.mode === 'duo' ? 'This game will not count.' : 'This game will not count, and you will not win anything for it.'}
        />
      )}
      {failedWords && (
        <Overlay>
          <Panel width={sizes.panelMax - px(120)} face={styles.panel}>
            <StickerText size="title" color="coral" center>
              {failedWords.title}
            </StickerText>
            <Txt center color="inkSoft">
              {failedWords.text}
            </Txt>
            <StickerButton label="HOME" icon="home" iconColor="white" fill="mint" onPress={quit} height={sizes.button} />
          </Panel>
        </Overlay>
      )}
      {howTo && <HowToOverlay onClose={closeHowTo} closeLabel={paused ? 'BACK' : "LET'S PLAY!"} />}
    </View>
  );
}

/** Each person's side of the pad in a two-player game, from the HUD. */
function duoSeats(hud: HudState): [DuoSeat, DuoSeat] {
  const second = hud.second;
  return [
    { offense: hud.offense, turbo: hud.turbo },
    second ? { offense: second.offense, turbo: second.turbo } : { offense: false, turbo: 0 },
  ];
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
  panel: {
    padding: space.lg,
    gap: space.sm,
  },
});
