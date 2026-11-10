import {
  addDays,
  dayKey,
  daysBetween,
  emptyStreak,
  grantFreezes,
  newerStreak,
  parseStreak,
  recordActivity,
  viewStreak,
  type StreakState,
} from '../habits/streak';

const NOW = new Date('2026-11-10T12:00:00Z');

function play(state: StreakState, ...days: string[]) {
  return days.reduce((s, day) => recordActivity(s, day, NOW), state);
}

describe('day keys', () => {
  it('uses the local calendar day', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(dayKey(new Date(2026, 0, 6, 0, 0))).toBe('2026-01-06');
  });

  it('counts days across months, years and DST changes', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('recordActivity', () => {
  it('starts a streak and counts consecutive days', () => {
    const s = play(emptyStreak(NOW), '2026-11-01', '2026-11-02', '2026-11-03');
    expect(s.current).toBe(3);
    expect(s.longest).toBe(3);
    expect(s.lastActiveDay).toBe('2026-11-03');
  });

  it('counts a day once however often the user plays', () => {
    const s = play(emptyStreak(NOW), '2026-11-01', '2026-11-01', '2026-11-01');
    expect(s.current).toBe(1);
  });

  it('resets after a missed day without freezes, keeping the best', () => {
    const s = play(emptyStreak(NOW), '2026-11-01', '2026-11-02', '2026-11-04');
    expect(s.current).toBe(1);
    expect(s.longest).toBe(2);
  });

  it('spends a freeze to cover one missed day', () => {
    let s = play(emptyStreak(NOW), '2026-11-01', '2026-11-02');
    s = grantFreezes(s, { maxFreezes: 2 }, 1, NOW);
    s = recordActivity(s, '2026-11-04', NOW);
    expect(s.current).toBe(4);
    expect(s.freezes).toBe(0);
    expect(s.frozenDays).toEqual(['2026-11-03']);
  });

  it('resets when the missed days are more than the freezes held', () => {
    let s = play(emptyStreak(NOW), '2026-11-01');
    s = grantFreezes(s, { maxFreezes: 2 }, 1, NOW);
    s = recordActivity(s, '2026-11-04', NOW);
    expect(s.current).toBe(1);
    expect(s.freezes).toBe(1);
  });

  it('ignores a day before the last active day', () => {
    const s = play(emptyStreak(NOW), '2026-11-05');
    expect(recordActivity(s, '2026-11-04', NOW)).toBe(s);
  });
});

describe('viewStreak', () => {
  const s = play(emptyStreak(NOW), '2026-11-01', '2026-11-02');

  it('is done today after playing', () => {
    expect(viewStreak(s, '2026-11-02')).toMatchObject({ current: 2, status: 'done-today' });
  });

  it('is at risk the next day', () => {
    expect(viewStreak(s, '2026-11-03')).toMatchObject({ current: 2, status: 'at-risk', freezesNeededToday: 0 });
  });

  it('shows 0 once the streak is lost', () => {
    expect(viewStreak(s, '2026-11-04')).toMatchObject({ current: 0, status: 'none', longest: 2 });
  });

  it('keeps the streak alive while freezes cover the gap', () => {
    const frozen = grantFreezes(s, { maxFreezes: 2 }, 2, NOW);
    expect(viewStreak(frozen, '2026-11-05')).toMatchObject({
      current: 4,
      status: 'at-risk',
      freezesNeededToday: 2,
    });
  });
});

describe('grantFreezes', () => {
  it('caps freezes at the app limit and does nothing when freezes are off', () => {
    const s = emptyStreak(NOW);
    expect(grantFreezes(s, { maxFreezes: 2 }, 5, NOW).freezes).toBe(2);
    expect(grantFreezes(s, { maxFreezes: 0 }, 1, NOW)).toBe(s);
  });
});

describe('syncing', () => {
  it('keeps the copy that changed last', () => {
    const older = { ...emptyStreak(new Date('2026-11-01T00:00:00Z')), current: 9 };
    const newer = { ...emptyStreak(new Date('2026-11-02T00:00:00Z')), current: 1 };
    expect(newerStreak(older, newer)).toBe(newer);
    expect(newerStreak(newer, older)).toBe(newer);
    expect(newerStreak(older, null)).toBe(older);
  });

  it('rejects stored data that is not a streak', () => {
    const good = play(emptyStreak(NOW), '2026-11-01');
    expect(parseStreak(JSON.parse(JSON.stringify(good)))).toEqual(good);
    expect(parseStreak(null)).toBeNull();
    expect(parseStreak({ ...good, current: -1 })).toBeNull();
    expect(parseStreak({ ...good, lastActiveDay: 'yesterday' })).toBeNull();
  });
});
