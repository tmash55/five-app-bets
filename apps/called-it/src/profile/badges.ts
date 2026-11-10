import type { ProfileStats, ProfileTotals } from './profileState';

/**
 * Profile badges (UNJ-1424). Each one is worked out from the player's own
 * stats, so nothing is stored and changing a threshold here needs no
 * migration. The list is a first pass for Tyler to edit.
 */
export type BadgeInput = { stats: ProfileStats; totals: ProfileTotals; streak: number };

export type Badge = {
  id: string;
  title: string;
  /** How to earn it, shown under a badge not earned yet. */
  how: string;
  earned: (input: BadgeInput) => boolean;
};

export const BADGES: Badge[] = [
  {
    id: 'first-call',
    title: 'First call',
    how: 'Get a pick right.',
    earned: ({ totals }) => totals.correct >= 1,
  },
  {
    id: 'sharp-25',
    title: 'Sharp',
    how: 'Get 25 picks right.',
    earned: ({ totals }) => totals.correct >= 25,
  },
  {
    id: 'sharp-100',
    title: 'Oracle',
    how: 'Get 100 picks right.',
    earned: ({ totals }) => totals.correct >= 100,
  },
  {
    id: 'contrarian',
    title: 'Against the crowd',
    how: 'Win a bonus for a right pick most players got wrong.',
    earned: ({ totals }) => totals.bonus_picks >= 1,
  },
  {
    id: 'perfect-slate',
    title: 'Perfect night',
    how: 'Get every pick right on a slate (at least 3 graded).',
    earned: ({ stats }) => stats.perfect_slates >= 1,
  },
  {
    id: 'streak-7',
    title: 'Week in a row',
    how: 'Play 7 slates in a row.',
    earned: ({ stats, streak }) => Math.max(stats.best_streak, streak) >= 7,
  },
  {
    id: 'two-sport',
    title: 'Two-sport fan',
    how: 'Get a pick right in both the NBA and the NFL.',
    earned: ({ stats }) => stats.by_sport.filter((s) => s.correct > 0).length >= 2,
  },
  {
    id: 'commissioner',
    title: 'Commissioner',
    how: 'Create a league.',
    earned: ({ stats }) => stats.leagues_owned >= 1,
  },
];

export function badgeStates(input: BadgeInput): { badge: Badge; earned: boolean }[] {
  return BADGES.map((badge) => ({ badge, earned: badge.earned(input) }));
}
