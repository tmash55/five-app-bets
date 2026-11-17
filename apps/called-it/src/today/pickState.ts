import type { Picks } from './todayState';

/** Sets or clears one pick without touching the others. `undefined` clears it. */
export function withPick(picks: Picks, questionId: string, answer: boolean | undefined): Picks {
  const next = { ...picks };
  if (answer === undefined) delete next[questionId];
  else next[questionId] = answer;
  return next;
}
