/**
 * A pausable stopwatch as plain data. Every function takes `now` (ms) so the
 * same code runs from a real interval, a test with fake timers, or a replay.
 * Time spent paused never counts.
 */
export type Clock = {
  /** When the clock last started running, or null while stopped or paused. */
  runningSince: number | null;
  /** Time counted before the last pause. */
  banked: number;
};

export const stoppedClock: Clock = { runningSince: null, banked: 0 };

export function startClock(now: number): Clock {
  return { runningSince: now, banked: 0 };
}

export function pauseClock(clock: Clock, now: number): Clock {
  if (clock.runningSince === null) return clock;
  return { runningSince: null, banked: clock.banked + Math.max(0, now - clock.runningSince) };
}

export function resumeClock(clock: Clock, now: number): Clock {
  if (clock.runningSince !== null) return clock;
  return { runningSince: now, banked: clock.banked };
}

export function elapsed(clock: Clock, now: number): number {
  return clock.banked + (clock.runningSince === null ? 0 : Math.max(0, now - clock.runningSince));
}

export function isRunning(clock: Clock): boolean {
  return clock.runningSince !== null;
}
