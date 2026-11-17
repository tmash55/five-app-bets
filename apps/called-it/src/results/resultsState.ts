import type { Sport } from '../../supabase/functions/_shared/slate/types.ts';

/** A question as the Results screen shows it. */
export type ResultQuestion = {
  id: string;
  position: number;
  sport: Sport;
  game_label: string;
  prompt: string;
  points: number;
  result: 'yes' | 'no' | 'void' | null;
  result_value: number | null;
  void_reason: string | null;
  yes_picks: number | null;
  no_picks: number | null;
};

/** The player's own pick with what it earned. Points are null until graded. */
export type ResultPick = {
  question_id: string;
  answer: boolean;
  correct: boolean | null;
  base_points: number | null;
  bonus_points: number | null;
};

export type ResultsSlate = { id: string; slate_date: string; graded_at: string | null };

export type RowStatus = 'correct' | 'wrong' | 'void' | 'pending' | 'no_pick';

export function rowStatus(q: ResultQuestion, pick: ResultPick | undefined): RowStatus {
  if (q.result === 'void') return 'void';
  if (!pick) return q.result === null ? 'pending' : 'no_pick';
  if (q.result === null) return 'pending';
  return pick.correct ? 'correct' : 'wrong';
}

export type ResultsSummary = {
  points: number;
  correct: number;
  /** Questions with a yes/no result that the player picked. */
  graded: number;
  pending: number;
  bonus: number;
  allGraded: boolean;
};

export function summarize(questions: ResultQuestion[], picks: Record<string, ResultPick>): ResultsSummary {
  let points = 0;
  let correct = 0;
  let graded = 0;
  let pending = 0;
  let bonus = 0;
  for (const q of questions) {
    const pick = picks[q.id];
    const status = rowStatus(q, pick);
    if (status === 'pending') pending += 1;
    if (status === 'correct' || status === 'wrong') graded += 1;
    if (status === 'correct') correct += 1;
    points += (pick?.base_points ?? 0) + (pick?.bonus_points ?? 0);
    bonus += pick?.bonus_points ?? 0;
  }
  return { points, correct, graded, pending, bonus, allGraded: questions.every((q) => q.result !== null) };
}

/** "Only 18% picked Yes" for a less popular pick, "62% picked Yes" otherwise. Null before grading. */
export function crowdLine(q: ResultQuestion, answer: boolean | undefined): string | null {
  if (answer === undefined || q.yes_picks === null || q.no_picks === null) return null;
  const total = q.yes_picks + q.no_picks;
  if (total === 0) return null;
  const same = answer ? q.yes_picks : q.no_picks;
  const pct = Math.round((same / total) * 100);
  const label = answer ? 'Yes' : 'No';
  return same / total < 0.5 ? `Only ${pct}% picked ${label}` : `${pct}% picked ${label}`;
}

/** The note under a result: what happened and what it earned. */
export function rowDetail(q: ResultQuestion, pick: ResultPick | undefined): string {
  const status = rowStatus(q, pick);
  const picked = pick ? `You picked ${pick.answer ? 'Yes' : 'No'}` : 'No pick';
  const actual = q.result_value !== null ? ` · Final: ${formatNumber(q.result_value)}` : '';
  switch (status) {
    case 'correct': {
      const bonus = pick?.bonus_points ? ` (+${pick.bonus_points} bonus)` : '';
      return `${picked} · +${(pick?.base_points ?? 0) + (pick?.bonus_points ?? 0)} pts${bonus}${actual}`;
    }
    case 'wrong':
      return `${picked} · 0 pts${actual}`;
    case 'void':
      return `${q.void_reason ?? 'Voided'} · No points either way`;
    case 'no_pick':
      return `No pick${actual}`;
    case 'pending':
      return `${picked} · Waiting for the final`;
  }
}

export const STATUS_LABEL: Record<RowStatus, string> = {
  correct: 'Called it',
  wrong: 'Missed',
  void: 'Void',
  pending: 'Pending',
  no_pick: 'No pick',
};

function formatNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/** "Tuesday, Nov 10" for the slate date (a calendar date, so formatted in UTC). */
export function slateDateLabel(slateDate: string): string {
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${slateDate}T12:00:00Z`),
  );
}

export function streakLabel(days: number): string {
  return days === 1 ? '1-day streak' : `${days}-day streak`;
}
