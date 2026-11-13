/** Coins earned for a match. Every line is shown on the results screen, so nothing is hidden maths. */

import type { MatchSummary, Mode } from './match';

export interface RewardLine {
  label: string;
  coins: number;
}

export interface Rewards {
  lines: RewardLine[];
  total: number;
}

const BASE: Record<Mode, { win: number; loss: number }> = {
  quick: { win: 50, loss: 20 },
  tour: { win: 60, loss: 20 },
  ladder: { win: 70, loss: 25 },
};

/** bonus per highlight and the most of each that pays out */
const HIGHLIGHTS = {
  dunks: { each: 3, max: 8, one: 'dunk', many: 'dunks' },
  threes: { each: 3, max: 8, one: 'three-pointer', many: 'three-pointers' },
  steals: { each: 2, max: 8, one: 'steal', many: 'steals' },
  blocks: { each: 2, max: 8, one: 'block', many: 'blocks' },
  perfects: { each: 2, max: 10, one: 'perfect shot', many: 'perfect shots' },
} as const;

export const FIRST_WIN_BONUS = 50;

export function matchRewards(s: MatchSummary, firstWinToday: boolean): Rewards {
  const lines: RewardLine[] = [];
  const base = BASE[s.mode];
  lines.push(s.won ? { label: 'Win', coins: base.win } : { label: 'Good game', coins: base.loss });
  const mine = s.totals[0];
  for (const key of Object.keys(HIGHLIGHTS) as (keyof typeof HIGHLIGHTS)[]) {
    const h = HIGHLIGHTS[key];
    const n = Math.min(h.max, mine[key]);
    if (n > 0) lines.push({ label: `${n} ${n === 1 ? h.one : h.many}`, coins: n * h.each });
  }
  if (s.won && s.score[0] - s.score[1] >= 10) lines.push({ label: 'Big win', coins: 10 });
  if (s.won && s.buzzerBeater) lines.push({ label: 'Buzzer beater', coins: 15 });
  if (s.won && s.overtime) lines.push({ label: 'Overtime thriller', coins: 10 });
  // tougher opponents pay better
  const bonus = Math.round(lines.reduce((a, l) => a + l.coins, 0) * Math.max(0, s.difficulty - 0.3) * 0.6);
  if (bonus > 0) lines.push({ label: 'Tough opponent', coins: bonus });
  if (s.won && firstWinToday) lines.push({ label: 'First win today', coins: FIRST_WIN_BONUS });
  return { lines, total: lines.reduce((a, l) => a + l.coins, 0) };
}
