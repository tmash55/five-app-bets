/**
 * The grown-up check before anything to do with an account: a times-table question with three answers.
 * Easy for a parent, a real stop for a young child, and no typing.
 */

/** A question and its three answers, one of them right. */
export interface GateQuestion {
  a: number;
  b: number;
  answer: number;
  choices: [number, number, number];
}

/** How long a passed check counts for, so a grown-up who just answered is not asked again at once. */
export const GATE_FRESH_MS = 5 * 60_000;

/**
 * A question from 6x6 to 9x9 with two near misses (one more or one fewer of a number, or of both). The right
 * answer is as often the smallest or the largest of the three as the middle one, so "pick the middle" does not work.
 */
export function gateQuestion(rng: () => number): GateQuestion {
  const pick = (lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
  const a = pick(6, 9);
  const b = pick(6, 9);
  const answer = a * b;
  const steps = [a, b, a + b].filter((n, i, all) => all.indexOf(n) === i).sort((x, y) => x - y);
  const step = () => steps[Math.floor(rng() * steps.length)];
  const rank = pick(0, 2);
  let wrong: number[];
  if (rank === 1) wrong = [answer - step(), answer + step()];
  else {
    // two different steps the same way: the answer ends up smallest (rank 0) or largest (rank 2)
    const first = Math.floor(rng() * steps.length);
    const second = (first + 1 + Math.floor(rng() * (steps.length - 1))) % steps.length;
    const sign = rank === 0 ? 1 : -1;
    wrong = [answer + sign * steps[first], answer + sign * steps[second]];
  }
  const choices = [answer, ...wrong];
  // shuffle where they sit, too
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return { a, b, answer, choices: choices as [number, number, number] };
}
