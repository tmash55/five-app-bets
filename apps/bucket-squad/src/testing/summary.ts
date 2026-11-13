/** Building blocks for tests: a finished game with sensible defaults. */

import type { MatchSummary, TeamTotals } from '@/meta/match';

export function totals(over: Partial<TeamTotals> = {}): TeamTotals {
  return { points: 0, dunks: 0, threes: 0, steals: 0, blocks: 0, perfects: 0, assists: 0, rebounds: 0, ...over };
}

/** A finished game: a six-point quick-game win unless told otherwise. */
export function summary(over: Partial<MatchSummary> = {}): MatchSummary {
  const score = over.score ?? [21, 15];
  return {
    mode: 'quick',
    perTeam: 2,
    won: score[0] > score[1],
    score,
    overtime: false,
    totals: [totals({ points: score[0] }), totals({ points: score[1] })],
    players: [],
    mvp: 'dash-bennett',
    buzzerBeater: false,
    difficulty: 0.22,
    names: ['Your Squad', 'Stompers'],
    ...over,
  };
}
