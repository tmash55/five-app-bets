/**
 * The Ladder: ranked games against computer squads that get tougher as you
 * climb. Points only ever fall back to the bottom of your current tier, so a
 * bad run never costs a tier you earned.
 */

import { TEAMS, playerOverall, teamPlayers } from '@/data/roster';
import type { ColorName } from '@/theme/tokens';
import type { Side } from './match';
import { pick, type Rng } from './rng';

export interface Tier {
  name: string;
  /** ladder points needed to enter */
  floor: number;
  difficulty: number;
  /** level of the opponents' players */
  level: number;
  color: ColorName;
  /** paid once, the first time you reach the tier */
  reward: { coins: number; pack?: string };
}

export const TIERS: readonly Tier[] = [
  { name: 'Rookie', floor: 0, difficulty: 0.2, level: 1, color: 'common', reward: { coins: 0 } },
  { name: 'Bronze', floor: 100, difficulty: 0.32, level: 1, color: 'orangeDeep', reward: { coins: 150 } },
  { name: 'Silver', floor: 250, difficulty: 0.44, level: 2, color: 'inkFaint', reward: { coins: 200, pack: 'playground' } },
  { name: 'Gold', floor: 450, difficulty: 0.56, level: 2, color: 'sun', reward: { coins: 300, pack: 'allstar' } },
  { name: 'Platinum', floor: 700, difficulty: 0.67, level: 3, color: 'skyLight', reward: { coins: 400, pack: 'allstar' } },
  { name: 'Diamond', floor: 1000, difficulty: 0.78, level: 4, color: 'grape', reward: { coins: 500, pack: 'legend' } },
  { name: 'All-Star', floor: 1400, difficulty: 0.88, level: 5, color: 'coral', reward: { coins: 700, pack: 'legend' } },
  { name: 'Legend', floor: 1900, difficulty: 0.97, level: 5, color: 'legend', reward: { coins: 1000, pack: 'legend' } },
];

export function tierIndex(points: number): number {
  let t = 0;
  for (let i = 0; i < TIERS.length; i++) if (points >= TIERS[i].floor) t = i;
  return t;
}

export interface TierProgress {
  index: number;
  tier: Tier;
  next: Tier | null;
  /** points earned inside this tier */
  have: number;
  /** points this tier spans, 0 at the top */
  span: number;
}

export function tierProgress(points: number): TierProgress {
  const index = tierIndex(points);
  const tier = TIERS[index];
  const next = TIERS[index + 1] ?? null;
  return { index, tier, next, have: points - tier.floor, span: next ? next.floor - tier.floor : 0 };
}

/** New ladder points after a game. */
export function ladderResult(points: number, won: boolean, margin: number): number {
  const t = tierIndex(points);
  if (won) return points + 28 + Math.min(12, Math.max(0, margin));
  const loss = 10 + t * 2;
  return Math.max(TIERS[t].floor, points - loss);
}

/** A computer squad for the next ladder game: any team, with weaker picks low on the ladder. */
export function ladderOpponent(points: number, perTeam: 2 | 3, rng: Rng, avoidTeam?: string): Side {
  const t = tierIndex(points);
  const candidates = TEAMS.filter((team) => team.id !== avoidTeam && teamPlayers(team.id).length >= perTeam);
  const team = pick(rng, candidates);
  const sorted = teamPlayers(team.id).sort((a, b) => playerOverall(a) - playerOverall(b));
  // slide a window up the team's depth chart as the tiers go by
  const span = sorted.length - perTeam;
  const start = Math.round((span * Math.min(t, TIERS.length - 2)) / (TIERS.length - 2));
  const players = sorted.slice(start, start + perTeam).reverse();
  return {
    name: team.name,
    short: team.short,
    kitTeam: team.id,
    players: players.map((p) => ({ id: p.id, level: TIERS[t].level })),
  };
}
