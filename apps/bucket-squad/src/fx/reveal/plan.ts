/**
 * What a pack holds, worked out once for the page that opens it: the order the cards come in, which reveal
 * each one gets, and everything the page says about each player. Plain data, so it is tested without a screen.
 */

import { PLAYERS, boosted, leagueOf, levelBonus, mustPlayer, playerOverall, teamById, teamPlayers } from '@/data/roster';
import { RARITIES, type PlayerDef, type Rarity } from '@/data/types';
import { RATING_KEYS, RATING_LABELS, type RatingKey } from '@/game/sim/ratings';
import { levelProgress, type Gain, type LevelProgress, type Owned } from '@/meta/collection';
import type { PackResult } from '@/meta/packs';
import type { TubeName } from '@/theme/arcade';
import { REVEAL_TIMES, type RevealTimes } from './times';

/** What a card did for the collection, in the words of its tag: the same four cases the page has always had. */
export function gainLabel(g: Gain): { text: string; tube: TubeName } {
  if (g.isNew) return { text: 'NEW!', tube: 'pink' };
  if (g.coins > 0) return { text: `+${g.coins} COINS`, tube: 'gold' };
  if (g.levelAfter > g.levelBefore) return { text: `LEVEL UP! LV ${g.levelAfter}`, tube: 'green' };
  return { text: 'EXTRA COPY', tube: 'cyan' };
}

export interface StatLine {
  key: RatingKey;
  label: string;
  value: number;
}

/** A player's best ratings at a level, best first; a tie keeps the order the card prints them in. */
export function bestStats(p: PlayerDef, level = 1, count = 3): StatLine[] {
  const r = boosted(p.ratings, levelBonus(level));
  return RATING_KEYS.map((key, i) => ({ key, i, value: r[key] }))
    .sort((a, b) => b.value - a.value || a.i - b.i)
    .slice(0, count)
    .map(({ key, value }) => ({ key, label: RATING_LABELS[key].toUpperCase(), value }));
}

/** "No. 13 of 48": where a player stands in roster order within their league, and how many the league has. */
export function cardNumber(p: PlayerDef): { number: number; of: number } {
  const league = leagueOf(p.team);
  const mates = PLAYERS.filter((q) => leagueOf(q.team) === league);
  return { number: mates.findIndex((q) => q.id === p.id) + 1, of: mates.length };
}

/** How many of a player's team the collection holds. */
export function teamCount(p: PlayerDef, owned: Owned): { name: string; have: number; of: number } {
  const mates = teamPlayers(p.team);
  return { name: teamById(p.team).name, have: mates.filter((q) => (owned[q.id] ?? 0) > 0).length, of: mates.length };
}

export interface CardPlan {
  gain: Gain;
  player: PlayerDef;
  rarity: Rarity;
  /** the player's level once the pack is open */
  level: number;
  overall: number;
  label: { text: string; tube: TubeName };
  number: { number: number; of: number };
  stats: StatLine[];
  team: { name: string; have: number; of: number };
  /** copies toward the next level */
  progress: LevelProgress;
  reveal: RevealTimes;
}

/** Everything the page shows for one card, against the collection as it is once the pack is open. */
export function planCard(gain: Gain, owned: Owned): CardPlan {
  const player = mustPlayer(gain.playerId);
  const progress = levelProgress(owned[gain.playerId] ?? 1);
  const level = Math.max(1, progress.level);
  return {
    gain,
    player,
    rarity: player.rarity,
    level,
    overall: playerOverall(player, level),
    label: gainLabel(gain),
    number: cardNumber(player),
    stats: bestStats(player, level),
    team: teamCount(player, owned),
    progress,
    reveal: REVEAL_TIMES[player.rarity],
  };
}

/** The pack, card by card, in the order it is revealed (the pack itself puts the best card last). */
export function planPack(result: PackResult): CardPlan[] {
  return result.cards.map((g) => planCard(g, result.owned));
}

/** The best rarity in a pack: the colour of the light that pours out when it tears. */
export function bestRarity(cards: readonly { rarity: Rarity }[]): Rarity {
  let best = 0;
  for (const c of cards) best = Math.max(best, RARITIES.indexOf(c.rarity));
  return RARITIES[best];
}

/** the most cards a demo pack holds: the most any real pack holds */
const DEMO_MOST = 5;

/** The rarities a demo pack asks for (`demo=common,rare,epic,legend`), or null when it asks for none. */
export function parseDemo(param: string | string[] | undefined): Rarity[] | null {
  const raw = Array.isArray(param) ? param.join(',') : (param ?? '');
  const out = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is Rarity => (RARITIES as readonly string[]).includes(s))
    .slice(0, DEMO_MOST);
  return out.length > 0 ? out : null;
}

/**
 * A pack for looking at the reveals: the first player of each named rarity in roster order (the next one when a
 * rarity is named twice), every one of them new. Nothing is saved and no coins change.
 */
export function demoResult(rarities: readonly Rarity[], owned: Owned): PackResult {
  const used = new Set<string>();
  const cards: Gain[] = [];
  const after: Owned = { ...owned };
  for (const r of rarities) {
    const p = PLAYERS.find((q) => q.rarity === r && !used.has(q.id)) ?? PLAYERS.find((q) => q.rarity === r);
    if (!p) continue;
    used.add(p.id);
    after[p.id] = 1;
    cards.push({ playerId: p.id, isNew: true, levelBefore: 0, levelAfter: 1, coins: 0 });
  }
  return { cards, owned: after, coins: 0 };
}
