import { badgeStates } from '../src/profile/badges';
import { accuracyLine, parseProfileStats, totals } from '../src/profile/profileState';

const raw = {
  by_sport: [
    { sport: 'nba', graded: 20, correct: 14, voided: 1, points: 160, bonus_picks: 2 },
    { sport: 'nfl', graded: 6, correct: 0, voided: 0, points: 0, bonus_picks: 0 },
  ],
  slates_played: 9,
  best_streak: 8,
  perfect_slates: 0,
  leagues_owned: 0,
  leagues_joined: 2,
};

it('reads profile_stats and adds up the sports', () => {
  const stats = parseProfileStats(raw);
  expect(totals(stats)).toEqual({ graded: 26, correct: 14, points: 160, bonus_picks: 2 });
  expect(accuracyLine(14, 20)).toBe('70% · 14 of 20');
  expect(accuracyLine(0, 0)).toBe('No graded picks yet');
  expect(parseProfileStats(null)).toEqual({
    by_sport: [],
    slates_played: 0,
    best_streak: 0,
    perfect_slates: 0,
    leagues_owned: 0,
    leagues_joined: 0,
  });
});

it('works out badges from the stats', () => {
  const stats = parseProfileStats(raw);
  const earned = badgeStates({ stats, totals: totals(stats), streak: 2 })
    .filter((b) => b.earned)
    .map((b) => b.badge.id);
  // The best streak of 8 keeps the streak badge after the current streak dropped to 2.
  expect(earned).toEqual(['first-call', 'contrarian', 'streak-7']);

  const more = parseProfileStats({
    ...raw,
    by_sport: [raw.by_sport[0], { ...raw.by_sport[1], correct: 30 }],
    perfect_slates: 1,
    leagues_owned: 1,
  });
  const all = badgeStates({ stats: more, totals: totals(more), streak: 0 }).filter((b) => b.earned);
  expect(all.map((b) => b.badge.id)).toEqual([
    'first-call',
    'sharp-25',
    'contrarian',
    'perfect-slate',
    'streak-7',
    'two-sport',
    'commissioner',
  ]);
});
