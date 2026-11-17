import type { Sport } from '../../supabase/functions/_shared/slate/types.ts';

/** A question as a player sees it on the Today screen. */
export type TodayQuestion = {
  id: string;
  position: number;
  sport: Sport;
  game_label: string;
  starts_at: string;
  lock_at: string;
  prompt: string;
  points: number;
};

export type TodaySlate = { id: string; slate_date: string };

/** The player's picks, keyed by question id. true = Yes, false = No. */
export type Picks = Record<string, boolean>;

export function isLocked(q: Pick<TodayQuestion, 'lock_at'>, now: Date): boolean {
  return now.getTime() >= Date.parse(q.lock_at);
}

export function progress(questions: TodayQuestion[], picks: Picks): { picked: number; total: number } {
  return { picked: questions.filter((q) => q.id in picks).length, total: questions.length };
}

/** The earliest lock still ahead of `now`, or null once every question has locked. */
export function nextLock(questions: TodayQuestion[], now: Date): Date | null {
  const ahead = questions
    .map((q) => Date.parse(q.lock_at))
    .filter((t) => t > now.getTime())
    .sort((a, b) => a - b);
  return ahead.length ? new Date(ahead[0]) : null;
}

/** "2h 14m", "14m", "under a minute". Rounds down so it never promises more time than is left. */
export function formatCountdown(ms: number): string {
  if (ms < 60_000) return 'under a minute';
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** The line under the title: "5 questions · Next lock in 2h 14m". */
export function slateSummary(questions: TodayQuestion[], now: Date): string {
  const count = `${questions.length} ${questions.length === 1 ? 'question' : 'questions'}`;
  const next = nextLock(questions, now);
  if (!next) return `${count} · All picks locked`;
  const allLockTogether = questions.every((q) => Date.parse(q.lock_at) === next.getTime());
  const label = allLockTogether ? 'Locks in' : 'Next lock in';
  return `${count} · ${label} ${formatCountdown(next.getTime() - now.getTime())}`;
}

/** How often the countdown should tick: every second in the last minute, else every 15 seconds. */
export function tickInterval(questions: TodayQuestion[], now: Date): number | null {
  const next = nextLock(questions, now);
  if (!next) return null;
  return next.getTime() - now.getTime() <= 60_000 ? 1_000 : 15_000;
}

/**
 * "NBA · 7:30 PM", or "NFL · SUN 4:25 PM" when the game is not today.
 * `timeZone` is for tests; the app uses the phone's zone.
 */
export function cardKicker(q: TodayQuestion, now: Date, timeZone?: string): string {
  const start = new Date(q.starts_at);
  const day = (d: Date) => new Intl.DateTimeFormat('en-US', { timeZone, dateStyle: 'short' }).format(d);
  const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(start);
  const weekday =
    day(start) === day(now)
      ? ''
      : `${new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(start)} `;
  return `${q.sport.toUpperCase()} · ${weekday}${time}`.toUpperCase();
}

export function answerLabel(answer: boolean): 'Yes' | 'No' {
  return answer ? 'Yes' : 'No';
}

/** The note under a card's buttons. */
export function cardStatus(answer: boolean | undefined, locked: boolean): string | null {
  if (locked) return answer === undefined ? 'Locked · No pick' : `Locked · You picked ${answerLabel(answer)}`;
  return answer === undefined ? null : `You picked ${answerLabel(answer)} · You can change it until the game starts`;
}
