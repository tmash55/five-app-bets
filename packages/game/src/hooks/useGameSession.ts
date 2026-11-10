import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { AppState } from 'react-native';

import { randomSeed } from '../core/rng';
import {
  countdownLeft,
  createSession,
  questionTimeLeft,
  roundTimeLeft,
  type SessionOptions,
  type SessionState,
} from '../core/session';
import type { GameModule } from '../types';

export type GameSessionOptions = SessionOptions & {
  /** How often the clock re-renders, in ms. */
  tickMs?: number;
  /** Clock source. Defaults to Date.now. Pass a stable function (module-level or memoized). */
  now?: () => number;
};

export type GameSession<Q, A> = {
  state: SessionState<Q>;
  /** Seconds left of "3, 2, 1", 0 outside the countdown. */
  countdown: number;
  /** Round time left in ms, null when the round has no time limit. */
  timeLeftMs: number | null;
  /** Current question's time left in ms, null when questions have no limit. */
  questionTimeLeftMs: number | null;
  start: () => void;
  /** Answers the question shown when `questionIndex` answers had been given. */
  answer: (answer: A, questionIndex?: number) => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
};

/**
 * Runs one game: drives the session reducer from a ticking clock, and pauses
 * the round when the app goes to the background so nobody loses time to a
 * phone call.
 */
export function useGameSession<Q, A>(
  game: GameModule<Q, A>,
  options: GameSessionOptions = {},
): GameSession<Q, A> {
  const { tickMs = 100, now: nowOption, startLevel, countdownSeconds, seed } = options;
  const readClock = nowOption ?? Date.now;

  const session = useMemo(
    () => createSession(game, { startLevel, countdownSeconds, seed: seed ?? randomSeed() }),
    [game, startLevel, countdownSeconds, seed],
  );
  const [state, dispatch] = useReducer(session.reducer, session.initialState);
  const [now, setNow] = useState(() => readClock());

  const ticking = state.phase === 'countdown' || state.phase === 'playing';
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => {
      const t = readClock();
      setNow(t);
      dispatch({ type: 'tick', now: t });
    }, tickMs);
    return () => clearInterval(id);
  }, [ticking, tickMs, readClock]);

  useEffect(() => {
    if (!ticking) return;
    const subscription = AppState.addEventListener('change', (status) => {
      if (status !== 'active') dispatch({ type: 'pause', now: readClock() });
    });
    return () => subscription.remove();
  }, [ticking, readClock]);

  // Each action stamps its own time so answers are timed to the tap, not the tick.
  const stamp = useCallback(() => {
    const t = readClock();
    setNow(t);
    return t;
  }, [readClock]);

  const start = useCallback(() => dispatch({ type: 'start', now: stamp(), seed: seed ?? randomSeed() }), [stamp, seed]);
  const answer = useCallback(
    (value: A, questionIndex?: number) => dispatch({ type: 'answer', answer: value, now: stamp(), questionIndex }),
    [stamp],
  );
  const pause = useCallback(() => dispatch({ type: 'pause', now: stamp() }), [stamp]);
  const resume = useCallback(() => dispatch({ type: 'resume', now: stamp() }), [stamp]);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);

  return {
    state,
    countdown: countdownLeft(state, session.countdownMs, now),
    timeLeftMs: roundTimeLeft(state, game.round, now),
    questionTimeLeftMs: questionTimeLeft(state, game.round, now),
    start,
    answer,
    pause,
    resume,
    reset,
  };
}
