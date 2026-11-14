/**
 * What a pack holds, worked out once for the page that opens it: the order the cards come in, which reveal
 * each one gets, and everything the page says about each player. Plain data, so it is tested without a screen.
 */

import { PLAYERS, boosted, leagueOf, levelBonus, mustPlayer, playerOverall, teamById, teamPlayers } from '@/data/roster';
import { RARITIES, type PlayerDef, type Rarity } from '@/data/types';
import { RATING_KEYS, RATING_LABELS, type RatingKey } from '@/game/sim/ratings';
import { addCopy, levelProgress, type Gain, type LevelProgress, type Owned } from '@/meta/collection';
import type { PackResult } from '@/meta/packs';
import type { TubeName } from '@/theme/arcade';
import { copyKind, ratingLamps, type CopyKind } from '@/ui/arcade/levels';
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

/** One of the three ratings as its lamps: lit before this copy, lit once it is in, and where the gold ones start. */
export interface StatLamps {
  /** lamps lit at the level the player had (all of them for a new player) */
  before: number;
  /** lamps lit at the level the player has now */
  lit: number;
  /** the first lamp levelling up lit: from here on they are gold */
  levelFrom: number;
  /** the rating at the level the player had */
  valueBefore: number;
}

export interface CardPlan {
  gain: Gain;
  player: PlayerDef;
  rarity: Rarity;
  /** what this copy did: a new player, a level up, one more copy toward the next level, or coins */
  kind: CopyKind;
  /** the player's level once the pack is open */
  level: number;
  /** the level before this copy: the same as `level` unless it levelled up */
  levelBefore: number;
  overall: number;
  overallBefore: number;
  label: { text: string; tube: TubeName };
  number: { number: number; of: number };
  stats: StatLine[];
  /** the three ratings' lamps, row by row */
  lamps: StatLamps[];
  team: { name: string; have: number; of: number };
  /** copies toward the next level */
  progress: LevelProgress;
  /** copies toward the next level before this copy came in */
  progressBefore: LevelProgress;
  reveal: RevealTimes;
}

/** Everything the page shows for one card, against the collection as it is once the pack is open. */
export function planCard(gain: Gain, owned: Owned): CardPlan {
  const player = mustPlayer(gain.playerId);
  const copies = owned[gain.playerId] ?? 1;
  const progress = levelProgress(copies);
  const level = Math.max(1, progress.level);
  const kind = copyKind(gain);
  const levelBefore = kind === 'levelUp' ? Math.max(1, Math.min(level, gain.levelBefore)) : level;
  const stats = bestStats(player, level);
  return {
    gain,
    player,
    rarity: player.rarity,
    kind,
    level,
    levelBefore,
    overall: playerOverall(player, level),
    overallBefore: playerOverall(player, levelBefore),
    label: gainLabel(gain),
    number: cardNumber(player),
    stats,
    lamps: stats.map((s) => {
      const now = ratingLamps(player.ratings[s.key], level);
      const was = ratingLamps(player.ratings[s.key], levelBefore);
      return { before: was.lit, lit: now.lit, levelFrom: now.levelFrom, valueBefore: was.value };
    }),
    team: teamCount(player, owned),
    progress,
    progressBefore: kind === 'copy' || kind === 'levelUp' ? levelProgress(copies - 1) : progress,
    reveal: REVEAL_TIMES[player.rarity],
  };
}

/** The pack, card by card, in the order it is revealed (the pack itself puts the best card last). */
export function planPack(result: PackResult): CardPlan[] {
  return result.cards.map((g) => planCard(g, result.owned));
}

export interface LampPlan {
  /** lamps each row lights as the words come in (at the level the player had), where each row starts in that count, and their sum */
  each: number[];
  from: number[];
  total: number;
  /** the gold lamps a level up lights in each row afterwards, where each row starts in that count, and their sum */
  gain: number[];
  gainFrom: number[];
  gained: number;
}

function counted(each: number[]): { from: number[]; total: number } {
  const from: number[] = [];
  let n = 0;
  for (const k of each) {
    from.push(n);
    n += k;
  }
  return { from, total: n };
}

/** How many lamps each of the three ratings lights, first as the words come in and then in a level up's beat. */
export function lampPlan(plan: CardPlan): LampPlan {
  const each = plan.lamps.map((l) => l.before);
  const gain = plan.lamps.map((l) => l.lit - l.before);
  const a = counted(each);
  const b = counted(gain);
  return { each, from: a.from, total: a.total, gain, gainFrom: b.from, gained: b.total };
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

/** The copies a demo pack pretends were held of each card before it (`have=0,3,1`), 0 for each one not named. */
export function parseHave(param: string | string[] | undefined, count: number): number[] {
  const raw = (Array.isArray(param) ? param.join(',') : (param ?? '')).split(',');
  return Array.from({ length: count }, (_, i) => {
    const n = Math.floor(Number(raw[i]));
    return Number.isFinite(n) && n > 0 ? Math.min(n, 99) : 0;
  });
}

/**
 * A pack for looking at the reveals: the first player of each named rarity in roster order (the next one when a
 * rarity is named twice). Each is new, unless `have` says how many copies of it were held already: then it is one
 * more copy, which may level the player up. Nothing is saved and no coins change.
 */
export function demoResult(rarities: readonly Rarity[], owned: Owned, have: readonly number[] = []): PackResult {
  const used = new Set<string>();
  const cards: Gain[] = [];
  let after: Owned = { ...owned };
  rarities.forEach((r, i) => {
    const p = PLAYERS.find((q) => q.rarity === r && !used.has(q.id)) ?? PLAYERS.find((q) => q.rarity === r);
    if (!p) return;
    used.add(p.id);
    const held = have[i] ?? 0;
    const res = addCopy({ ...after, [p.id]: held }, p.id, p.rarity);
    after = res.owned;
    cards.push({ ...res.gain, coins: 0 });
  });
  return { cards, owned: after, coins: 0 };
}
