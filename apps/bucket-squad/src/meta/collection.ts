/**
 * The collection: which players you own and how far each has levelled up.
 *
 * Owning is counted in copies. The first copy unlocks a player, extra copies
 * fill a bar toward the next level, and copies beyond the top level turn into
 * coins.
 */

import { MAX_LEVEL } from '@/data/roster';
import type { Rarity } from '@/data/types';

/** copies owned, by player id */
export type Owned = Record<string, number>;

/** total copies needed to reach each level (index 0 is level 1) */
export const LEVEL_COPIES: readonly number[] = [1, 2, 4, 7, 11];

export const MAX_COPIES = LEVEL_COPIES[MAX_LEVEL - 1];

/** coins paid for a copy of a player who is already at the top level */
export const DUPLICATE_COINS: Record<Rarity, number> = { common: 20, rare: 50, epic: 120, legend: 300 };

export function levelOf(copies: number): number {
  let level = 0;
  for (let i = 0; i < LEVEL_COPIES.length; i++) if (copies >= LEVEL_COPIES[i]) level = i + 1;
  return level;
}

export interface LevelProgress {
  level: number;
  /** copies collected toward the next level */
  have: number;
  /** copies the next level needs from this one, 0 at the top */
  need: number;
  maxed: boolean;
}

export function levelProgress(copies: number): LevelProgress {
  const level = levelOf(copies);
  if (level >= MAX_LEVEL) return { level, have: 0, need: 0, maxed: true };
  const base = level === 0 ? 0 : LEVEL_COPIES[level - 1];
  const next = LEVEL_COPIES[level];
  return { level, have: copies - base, need: next - base, maxed: false };
}

export function owns(owned: Owned, id: string): boolean {
  return (owned[id] ?? 0) > 0;
}

export interface Gain {
  playerId: string;
  /** first copy ever */
  isNew: boolean;
  levelBefore: number;
  levelAfter: number;
  /** coins paid out because the player was already at the top level */
  coins: number;
}

/** Add one copy of a player. Returns the new collection and what changed. */
export function addCopy(owned: Owned, playerId: string, rarity: Rarity): { owned: Owned; gain: Gain } {
  const before = owned[playerId] ?? 0;
  if (before >= MAX_COPIES) {
    return { owned, gain: { playerId, isNew: false, levelBefore: MAX_LEVEL, levelAfter: MAX_LEVEL, coins: DUPLICATE_COINS[rarity] } };
  }
  const after = before + 1;
  return {
    owned: { ...owned, [playerId]: after },
    gain: { playerId, isNew: before === 0, levelBefore: levelOf(before), levelAfter: levelOf(after), coins: 0 },
  };
}

export function countOwned(owned: Owned, ids: readonly string[]): number {
  let n = 0;
  for (const id of ids) if ((owned[id] ?? 0) > 0) n++;
  return n;
}

const RARITY_RANK: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legend: 3 };

/** The ways the collection page can line its players up. */
export type ShelfSort = 'new' | 'rare' | 'best' | 'team';

export const SHELF_SORTS: readonly { id: ShelfSort; label: string; say: string }[] = [
  { id: 'new', label: 'NEW', say: 'Newest found first' },
  { id: 'rare', label: 'RARE', say: 'Rarest first' },
  { id: 'best', label: 'BEST', say: 'Best overall first' },
  { id: 'team', label: 'TEAM', say: 'By team' },
];

/**
 * The players in the order a sort shows them. Players found come before players still to find, so a sort opens on
 * what you have, except by team, which keeps each team together. NEW goes by when each player was first found, newest first: `owned` keeps its
 * players in the order they were first found (an object keeps the order its keys were added in, and so does the
 * saved JSON), so the order costs nothing to keep.
 */
export function sortShelf<P extends { id: string; team: string; rarity: Rarity; name: string }>(
  players: readonly P[],
  sort: ShelfSort,
  owned: Owned,
  value: (a: P, b: P) => number,
  overall: (p: P, level: number) => number,
  teamOrder: readonly string[] = [],
): P[] {
  const foundAt = new Map(Object.keys(owned).map((id, i) => [id, (owned[id] ?? 0) > 0 ? i : -1]));
  const found = (p: P) => (foundAt.get(p.id) ?? -1) >= 0;
  const foundFirst = (a: P, b: P) => Number(found(b)) - Number(found(a));
  const team = (p: P) => {
    const i = teamOrder.indexOf(p.team);
    return i < 0 ? teamOrder.length : i;
  };
  const order: Record<ShelfSort, (a: P, b: P) => number> = {
    new: (a, b) => foundFirst(a, b) || (foundAt.get(b.id) ?? -1) - (foundAt.get(a.id) ?? -1) || value(a, b),
    rare: (a, b) => foundFirst(a, b) || RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity] || value(a, b),
    best: (a, b) => foundFirst(a, b) || overall(b, levelOf(owned[b.id] ?? 0)) - overall(a, levelOf(owned[a.id] ?? 0)) || value(a, b),
    team: (a, b) => team(a) - team(b) || value(a, b),
  };
  return [...players].sort(order[sort]);
}
