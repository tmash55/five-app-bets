import type { Sport } from '../../supabase/functions/_shared/slate/types.ts';
import { accuracy } from '../compete/standings';

/** One sport's record, from `profile_stats()` (UNJ-1424). */
export type SportStats = {
  sport: Sport;
  /** Picks with a yes/no result. Void picks are not graded. */
  graded: number;
  correct: number;
  voided: number;
  points: number;
  /** Correct picks that earned a bonus for going against the crowd. */
  bonus_picks: number;
};

export type ProfileStats = {
  by_sport: SportStats[];
  slates_played: number;
  /** Longest run of slates in a row played, ever. */
  best_streak: number;
  perfect_slates: number;
  leagues_owned: number;
  leagues_joined: number;
};

export type ProfileTotals = { graded: number; correct: number; points: number; bonus_picks: number };

export function parseProfileStats(raw: unknown): ProfileStats {
  const r = (raw ?? {}) as Record<string, unknown>;
  const bySport = Array.isArray(r.by_sport) ? (r.by_sport as Record<string, unknown>[]) : [];
  return {
    by_sport: bySport.map((s) => ({
      sport: s.sport as Sport,
      graded: Number(s.graded ?? 0),
      correct: Number(s.correct ?? 0),
      voided: Number(s.voided ?? 0),
      points: Number(s.points ?? 0),
      bonus_picks: Number(s.bonus_picks ?? 0),
    })),
    slates_played: Number(r.slates_played ?? 0),
    best_streak: Number(r.best_streak ?? 0),
    perfect_slates: Number(r.perfect_slates ?? 0),
    leagues_owned: Number(r.leagues_owned ?? 0),
    leagues_joined: Number(r.leagues_joined ?? 0),
  };
}

export function totals(stats: ProfileStats): ProfileTotals {
  return stats.by_sport.reduce<ProfileTotals>(
    (t, s) => ({
      graded: t.graded + s.graded,
      correct: t.correct + s.correct,
      points: t.points + s.points,
      bonus_picks: t.bonus_picks + s.bonus_picks,
    }),
    { graded: 0, correct: 0, points: 0, bonus_picks: 0 },
  );
}

/** "64% · 16 of 25" or "No graded picks yet". */
export function accuracyLine(correct: number, graded: number): string {
  const pct = accuracy(correct, graded);
  return pct === null ? 'No graded picks yet' : `${pct}% · ${correct} of ${graded}`;
}

export const SPORT_LABEL: Record<Sport, string> = { nba: 'NBA', nfl: 'NFL' };
