/** Daily missions: three small goals that change every day, each worth coins. */

import type { MatchSummary } from './match';
import { hashSeed, randInt, seededRng, shuffled } from './rng';

export type Metric = 'wins' | 'games' | 'points' | 'dunks' | 'threes' | 'steals' | 'blocks' | 'perfects' | 'packs' | 'tourWins' | 'ladderWins';

interface MissionDef {
  metric: Metric;
  /** smallest and largest target */
  range: [number, number];
  /** round targets to a multiple of this */
  step: number;
  text: (n: number) => string;
  /** coins per unit of target, and a flat part */
  coins: [number, number];
}

const s = (n: number, one: string, many: string) => (n === 1 ? one : many);

const DEFS: readonly MissionDef[] = [
  { metric: 'wins', range: [1, 3], step: 1, text: (n) => `Win ${n} ${s(n, 'game', 'games')}`, coins: [40, 40] },
  { metric: 'games', range: [2, 4], step: 1, text: (n) => `Play ${n} games`, coins: [20, 30] },
  { metric: 'points', range: [30, 70], step: 10, text: (n) => `Score ${n} points`, coins: [1, 40] },
  { metric: 'dunks', range: [3, 8], step: 1, text: (n) => `Throw down ${n} dunks`, coins: [10, 40] },
  { metric: 'threes', range: [2, 6], step: 1, text: (n) => `Make ${n} three-pointers`, coins: [12, 40] },
  { metric: 'steals', range: [3, 7], step: 1, text: (n) => `Steal the ball ${n} times`, coins: [10, 40] },
  { metric: 'blocks', range: [2, 5], step: 1, text: (n) => `Block ${n} shots`, coins: [14, 40] },
  { metric: 'perfects', range: [3, 8], step: 1, text: (n) => `Hit ${n} perfect shots`, coins: [10, 40] },
  { metric: 'packs', range: [1, 1], step: 1, text: () => 'Open a pack', coins: [0, 60] },
  { metric: 'tourWins', range: [1, 2], step: 1, text: (n) => `Win ${n} Tour ${s(n, 'game', 'games')}`, coins: [40, 40] },
  { metric: 'ladderWins', range: [1, 2], step: 1, text: (n) => `Win ${n} Ladder ${s(n, 'game', 'games')}`, coins: [40, 50] },
];

export interface Mission {
  metric: Metric;
  text: string;
  target: number;
  progress: number;
  coins: number;
  claimed: boolean;
}

export interface MissionDay {
  day: string;
  missions: Mission[];
  /** the pack for finishing all three has been collected */
  bonusClaimed: boolean;
}

export const MISSIONS_PER_DAY = 3;
export const ALL_DONE_PACK = 'playground';

export function missionsFor(day: string): MissionDay {
  const rng = seededRng(hashSeed(`missions:${day}`));
  const defs = shuffled(rng, DEFS).slice(0, MISSIONS_PER_DAY);
  return {
    day,
    bonusClaimed: false,
    missions: defs.map((d) => {
      const steps = Math.floor((d.range[1] - d.range[0]) / d.step);
      const target = d.range[0] + randInt(rng, 0, steps) * d.step;
      return { metric: d.metric, text: d.text(target), target, progress: 0, coins: Math.round((d.coins[1] + d.coins[0] * target) / 5) * 5, claimed: false };
    }),
  };
}

/** Today's missions, starting a fresh set if the saved ones are from another day. */
export function currentMissions(saved: MissionDay | null, day: string): MissionDay {
  return saved && saved.day === day ? saved : missionsFor(day);
}

function bump(day: MissionDay, amounts: Partial<Record<Metric, number>>): MissionDay {
  let changed = false;
  const missions = day.missions.map((m) => {
    const add = amounts[m.metric] ?? 0;
    if (add <= 0 || m.progress >= m.target) return m;
    changed = true;
    return { ...m, progress: Math.min(m.target, m.progress + add) };
  });
  return changed ? { ...day, missions } : day;
}

export function missionsAfterMatch(day: MissionDay, summary: MatchSummary): MissionDay {
  const mine = summary.totals[0];
  return bump(day, {
    games: 1,
    wins: summary.won ? 1 : 0,
    tourWins: summary.won && summary.mode === 'tour' ? 1 : 0,
    ladderWins: summary.won && summary.mode === 'ladder' ? 1 : 0,
    points: mine.points,
    dunks: mine.dunks,
    threes: mine.threes,
    steals: mine.steals,
    blocks: mine.blocks,
    perfects: mine.perfects,
  });
}

export function missionsAfterPack(day: MissionDay): MissionDay {
  return bump(day, { packs: 1 });
}

export function missionDone(m: Mission): boolean {
  return m.progress >= m.target;
}

/** Missions finished but not collected yet (for the badge on the home screen). */
export function missionsToClaim(day: MissionDay): number {
  let n = day.missions.filter((m) => missionDone(m) && !m.claimed).length;
  if (!day.bonusClaimed && day.missions.every((m) => m.claimed)) n++;
  return n;
}
