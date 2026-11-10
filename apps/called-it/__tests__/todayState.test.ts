import { withPick } from '../src/today/pickState';
import {
  cardKicker,
  cardStatus,
  formatCountdown,
  isLocked,
  nextLock,
  progress,
  slateSummary,
  tickInterval,
  type TodayQuestion,
} from '../src/today/todayState';

const q = (id: string, lock_at: string, extra: Partial<TodayQuestion> = {}): TodayQuestion => ({
  id,
  position: Number(id.slice(1)),
  sport: 'nba',
  game_label: 'MIL @ NYK',
  starts_at: lock_at,
  lock_at,
  prompt: 'Will Jalen Brunson score 27 or more points?',
  points: 10,
  ...extra,
});

const now = new Date('2026-11-10T22:16:00.000Z'); // 5:16 pm ET
const slate = [
  q('q1', '2026-11-11T00:30:00.000Z'), // 7:30 pm ET, 2h 14m away
  q('q2', '2026-11-11T03:00:00.000Z'), // 10:00 pm ET
  q('q3', '2026-11-10T22:00:00.000Z'), // already locked
];

describe('locking', () => {
  it('locks at the lock time, not a moment later', () => {
    expect(isLocked(q('a', '2026-11-10T22:16:00.000Z'), now)).toBe(true);
    expect(isLocked(q('a', '2026-11-10T22:16:00.001Z'), now)).toBe(false);
  });

  it('finds the next lock still ahead', () => {
    expect(nextLock(slate, now)?.toISOString()).toBe('2026-11-11T00:30:00.000Z');
    expect(nextLock(slate, new Date('2026-11-11T04:00:00Z'))).toBeNull();
  });
});

describe('formatCountdown', () => {
  it.each([
    [30_000, 'under a minute'],
    [60_000, '1m'],
    [14 * 60_000 + 59_000, '14m'],
    [(2 * 60 + 14) * 60_000, '2h 14m'],
    [(26 * 60 + 5) * 60_000, '1d 2h'],
  ])('%i ms → %s', (ms, text) => expect(formatCountdown(ms)).toBe(text));
});

describe('slateSummary', () => {
  it('counts down to the next lock', () => {
    expect(slateSummary(slate, now)).toBe('3 questions · Next lock in 2h 14m');
  });
  it('says "Locks in" when every game starts together', () => {
    expect(slateSummary([q('q1', '2026-11-11T00:30:00Z'), q('q2', '2026-11-11T00:30:00Z')], now)).toBe(
      '2 questions · Locks in 2h 14m',
    );
  });
  it('says when everything has locked', () => {
    expect(slateSummary([q('q1', '2026-11-10T22:00:00Z')], now)).toBe('1 question · All picks locked');
  });
});

describe('tickInterval', () => {
  it('ticks each second in the last minute, slower otherwise, and stops when all locked', () => {
    expect(tickInterval(slate, now)).toBe(15_000);
    expect(tickInterval(slate, new Date('2026-11-11T00:29:30Z'))).toBe(1_000);
    expect(tickInterval(slate, new Date('2026-11-11T04:00:00Z'))).toBeNull();
  });
});

describe('progress and picks', () => {
  it('counts picks only for questions on the slate', () => {
    expect(progress(slate, { q1: true, q3: false, other: true })).toEqual({ picked: 2, total: 3 });
  });
  it('sets, changes and clears one pick', () => {
    const picks = withPick({ q1: true }, 'q2', false);
    expect(picks).toEqual({ q1: true, q2: false });
    expect(withPick(picks, 'q2', true)).toEqual({ q1: true, q2: true });
    expect(withPick(picks, 'q2', undefined)).toEqual({ q1: true });
  });
});

describe('card text', () => {
  it('shows league and time, with the weekday when the game is not today', () => {
    expect(cardKicker(slate[0], now, 'America/New_York')).toBe('NBA · 7:30 PM');
    const sunday = q('q9', '2026-11-15T21:25:00Z', { sport: 'nfl' });
    expect(cardKicker(sunday, now, 'America/New_York')).toBe('NFL · SUN 4:25 PM');
  });

  it('describes the pick and lock state', () => {
    expect(cardStatus(undefined, false)).toBeNull();
    expect(cardStatus(true, false)).toBe('You picked Yes · You can change it until the game starts');
    expect(cardStatus(false, true)).toBe('Locked · You picked No');
    expect(cardStatus(undefined, true)).toBe('Locked · No pick');
  });
});
