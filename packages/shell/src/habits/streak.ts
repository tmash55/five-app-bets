/**
 * Daily streak rules, kept pure so they can be tested without a device.
 *
 * Days are local calendar days written as `YYYY-MM-DD` ("day keys"). A streak
 * counts consecutive days with at least one recorded activity. A streak freeze
 * covers one missed day: when the user comes back after missing days and holds
 * enough freezes, the freezes are spent and the streak carries on.
 */

export type DayKey = string;

export type StreakState = {
  /** Consecutive active days, including freeze-covered days, ending at lastActiveDay. */
  current: number;
  longest: number;
  lastActiveDay: DayKey | null;
  /** Freezes the user holds right now. */
  freezes: number;
  /** Days that a freeze covered, newest last, so the UI can show them. */
  frozenDays: DayKey[];
  /** When this state last changed, for picking the newer copy when syncing. */
  updatedAt: string;
};

export type StreakRules = {
  /** Most freezes a user can hold. 0 turns freezes off. */
  maxFreezes: number;
};

export type StreakStatus =
  /** Already active today. */
  | 'done-today'
  /** Active yesterday (or covered by freezes); acting today extends the streak. */
  | 'at-risk'
  /** No streak to keep. */
  | 'none';

export type StreakView = {
  /** The streak to show right now: 0 once it has been lost. */
  current: number;
  longest: number;
  freezes: number;
  status: StreakStatus;
  /** Freezes that will be spent if the user is active today. */
  freezesNeededToday: number;
};

/** Keep the frozen-day history short; the UI only needs recent days. */
const MAX_FROZEN_DAYS = 30;

export function emptyStreak(now: Date = new Date()): StreakState {
  return {
    current: 0,
    longest: 0,
    lastActiveDay: null,
    freezes: 0,
    frozenDays: [],
    updatedAt: now.toISOString(),
  };
}

function pad(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** The local calendar day of a date, as YYYY-MM-DD. */
export function dayKey(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dayNumber(key: DayKey): number {
  const [year, month, day] = key.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** Whole days from `from` to `to` (1 when `to` is the day after `from`). */
export function daysBetween(from: DayKey, to: DayKey): number {
  return dayNumber(to) - dayNumber(from);
}

export function addDays(key: DayKey, days: number): DayKey {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** Days missed between the last active day and today, 0 if none. */
function missedDays(state: StreakState, today: DayKey): number {
  if (!state.lastActiveDay) return 0;
  return Math.max(0, daysBetween(state.lastActiveDay, today) - 1);
}

/** What the streak looks like today, without changing it. */
export function viewStreak(state: StreakState, today: DayKey): StreakView {
  const base = { longest: state.longest, freezes: state.freezes };
  if (!state.lastActiveDay || state.current === 0) {
    return { ...base, current: 0, status: 'none', freezesNeededToday: 0 };
  }
  const gap = daysBetween(state.lastActiveDay, today);
  if (gap <= 0) return { ...base, current: state.current, status: 'done-today', freezesNeededToday: 0 };

  const missed = missedDays(state, today);
  if (missed <= state.freezes) {
    // Frozen days count toward the streak, so the number shown includes them.
    return { ...base, current: state.current + missed, status: 'at-risk', freezesNeededToday: missed };
  }
  return { ...base, current: 0, status: 'none', freezesNeededToday: 0 };
}

/**
 * Records an activity today. Calling it more than once a day does nothing.
 * A day earlier than the last active day (the clock moved back) is ignored.
 */
export function recordActivity(state: StreakState, today: DayKey, now: Date = new Date()): StreakState {
  if (state.lastActiveDay && daysBetween(state.lastActiveDay, today) <= 0) return state;

  const view = viewStreak(state, today);
  const missed = missedDays(state, today);
  let { freezes, frozenDays } = state;
  let current: number;

  if (view.status === 'at-risk') {
    current = view.current + 1;
    if (missed > 0) {
      freezes -= missed;
      const covered = Array.from({ length: missed }, (_, i) => addDays(state.lastActiveDay!, i + 1));
      frozenDays = [...frozenDays, ...covered].slice(-MAX_FROZEN_DAYS);
    }
  } else {
    current = 1;
  }

  return {
    current,
    longest: Math.max(state.longest, current),
    lastActiveDay: today,
    freezes,
    frozenDays,
    updatedAt: now.toISOString(),
  };
}

/**
 * Gives the user freezes, up to the app's limit. Each app decides when: for
 * example a Pro perk, or one earned for every 7-day streak.
 */
export function grantFreezes(
  state: StreakState,
  rules: StreakRules,
  count = 1,
  now: Date = new Date(),
): StreakState {
  const freezes = Math.min(rules.maxFreezes, state.freezes + Math.max(0, count));
  if (freezes === state.freezes) return state;
  return { ...state, freezes, updatedAt: now.toISOString() };
}

/** Picks the copy that changed last, for merging local and server state. */
export function newerStreak(a: StreakState, b: StreakState | null): StreakState {
  if (!b) return a;
  return Date.parse(b.updatedAt) > Date.parse(a.updatedAt) ? b : a;
}

/** Checks data read from storage or the server; returns null when it is not a streak. */
export function parseStreak(value: unknown): StreakState | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const isCount = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0;
  const isDay = (d: unknown) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
  if (!isCount(v.current) || !isCount(v.longest) || !isCount(v.freezes)) return null;
  if (v.lastActiveDay !== null && !isDay(v.lastActiveDay)) return null;
  if (!Array.isArray(v.frozenDays) || !v.frozenDays.every(isDay)) return null;
  if (typeof v.updatedAt !== 'string' || Number.isNaN(Date.parse(v.updatedAt))) return null;
  return {
    current: v.current as number,
    longest: v.longest as number,
    lastActiveDay: v.lastActiveDay as DayKey | null,
    freezes: v.freezes as number,
    frozenDays: v.frozenDays as DayKey[],
    updatedAt: v.updatedAt,
  };
}
