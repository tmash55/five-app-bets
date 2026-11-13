/**
 * The Daily Shop: a few things for sale each day that change at local midnight.
 *
 * - One LIMITED slot. On even days it is a limited-edition uniform (sold nowhere else), on odd days a featured
 *   Epic or Legend player at a premium. Both take turns through a shuffled cycle: a limited uniform comes back only
 *   after every other one has had its day, and never two cycles back to back.
 * - Three DEAL slots: player cards you could also pull from packs, priced by rarity, leaning toward players you do
 *   not have yet or that one more copy would level up. Each can be bought once a day, then it is SOLD.
 *
 * The LIMITED slot depends on the day alone, so everyone sees the same one. The deals depend on the day and on the
 * collection when the shop is first opened that day; the save keeps them (`ShopDay`) so buying one never reshuffles
 * the others.
 *
 * Every price is a `Price` with a currency. Only coins exist today; `canAfford`, `shortBy` and `pay` are the one place a
 * price is checked and taken, so a second currency (gems bought with real money, say) is one more name in `Currency`
 * and one more number in the save.
 */

import { PLAYERS, playerById } from '@/data/roster';
import { RARITIES, type PlayerDef, type Rarity } from '@/data/types';
import { LIMITED_UNIFORMS, type UniformDef } from '@/data/uniforms';
import { LEVEL_COPIES, MAX_COPIES, type Owned } from './collection';
import { hashSeed, seededRng, shuffled, type Rng } from './rng';

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------

/** What things cost. Add a name here (and a number to the save) for a second currency. */
export type Currency = 'coins';

export const CURRENCIES: readonly Currency[] = ['coins'];

export interface Price {
  currency: Currency;
  amount: number;
}

/** Anything that holds money: the save has a number for each currency. */
export type Purse = Record<Currency, number>;

export function coins(amount: number): Price {
  return { currency: 'coins', amount };
}

export function canAfford(purse: Purse, price: Price): boolean {
  return price.amount >= 0 && purse[price.currency] >= price.amount;
}

/** How much more of the price's currency it takes: 0 when there is enough. */
export function shortBy(purse: Purse, price: Price): number {
  return Math.max(0, price.amount - purse[price.currency]);
}

/** Take the price out of the purse, or null when there is not enough. Everything the shop sells is paid through here. */
export function pay<T extends Purse>(purse: T, price: Price): T | null {
  if (!canAfford(purse, price)) return null;
  return { ...purse, [price.currency]: purse[price.currency] - price.amount };
}

// ---------------------------------------------------------------------------
// Prices and odds
// ---------------------------------------------------------------------------

/**
 * A deal's price by rarity. Against the packs (Playground 250 for 3 cards, All-Star 700 for 4, Legend 1800 for 5):
 * a Common you choose costs a little more than a pack card on average, a Rare about half an All-Star pack, and an Epic
 * half a Legend pack. Legends are never deals.
 */
export const DEAL_PRICE: Record<Exclude<Rarity, 'legend'>, number> = { common: 120, rare: 350, epic: 900 };

/** A featured player in the LIMITED slot: a premium over the deal price, since you pick exactly who you get. */
export const FEATURED_PRICE: Record<'epic' | 'legend', number> = { epic: 1200, legend: 2400 };

/** How often each rarity fills a deal slot. */
export const DEAL_ODDS: Record<Exclude<Rarity, 'legend'>, number> = { common: 0.55, rare: 0.35, epic: 0.1 };

/** How much more likely a deal is to be a player you do not have yet, or one a single copy would level up. */
const NEW_WEIGHT = 3;
const LEVEL_WEIGHT = 2;

export const DEAL_SLOTS = 3;

// ---------------------------------------------------------------------------
// The day
// ---------------------------------------------------------------------------

/** Days since 1970-01-01 for a day key ("2026-03-09"): one more each local day. */
export function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, (m || 1) - 1, d || 1) / 86400000);
}

/** Milliseconds from `now` to the next local midnight, when the shop changes. */
export function msToMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return Math.max(0, next.getTime() - now.getTime());
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** A countdown as a scoreboard shows it, "05:32:10", rounded up so it reads 00:00:01 in the last second. */
export function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${pad2(Math.floor(total / 3600))}:${pad2(Math.floor(total / 60) % 60)}:${pad2(total % 60)}`;
}

/** A countdown in words for a small space: "5h 32m", or "32m 10s" in the last hour. */
export function shortClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor(total / 60) % 60;
  return h > 0 ? `${h}h ${pad2(m)}m` : `${m}m ${pad2(total % 60)}s`;
}

// ---------------------------------------------------------------------------
// The rotation
// ---------------------------------------------------------------------------

/**
 * The order a cycle goes through `items`: shuffled by the cycle's own seed, and never starting with the one the cycle
 * before ended on, so nothing comes back two turns in a row.
 */
export function cycleOrder<T>(items: readonly T[], cycle: number, salt: string): T[] {
  const order = shuffled(seededRng(hashSeed(`${salt}:${cycle}`)), items);
  // with three or more, swapping the first two never moves the last one, so the cycle before needs no fixing of its own
  if (items.length >= 3) {
    const before = shuffled(seededRng(hashSeed(`${salt}:${cycle - 1}`)), items);
    if (order[0] === before[before.length - 1]) [order[0], order[1]] = [order[1], order[0]];
  }
  return order;
}

/** The item for turn `turn`: every item once per cycle of `items.length` turns. */
export function cyclePick<T>(items: readonly T[], turn: number, salt: string): T {
  const n = items.length;
  const cycle = Math.floor(turn / n);
  return cycleOrder(items, cycle, salt)[turn - cycle * n];
}

/** Players good enough to be featured. */
export function featuredPool(pool: readonly PlayerDef[] = PLAYERS): PlayerDef[] {
  return pool.filter((p) => p.rarity === 'epic' || p.rarity === 'legend');
}

export type ShopItem = { kind: 'uniform'; id: string } | { kind: 'player'; id: string };

export interface ShopSlot {
  /** "limited", "deal-0", "deal-1", ...: what the save marks SOLD */
  id: string;
  limited: boolean;
  item: ShopItem;
  price: Price;
}

export const LIMITED_SLOT = 'limited';

/** The LIMITED slot for a day: the same for everyone. Even days a limited uniform, odd days a featured player. */
export function limitedSlot(day: string, uniforms: readonly UniformDef[] = LIMITED_UNIFORMS, pool: readonly PlayerDef[] = PLAYERS): ShopSlot | null {
  const n = dayNumber(day);
  const players = featuredPool(pool);
  const uniformDay = n % 2 === 0;
  const turn = Math.floor(n / 2);
  if ((uniformDay || players.length === 0) && uniforms.length > 0) {
    const u = cyclePick(uniforms, turn, 'limited-uniform');
    return { id: LIMITED_SLOT, limited: true, item: { kind: 'uniform', id: u.id }, price: coins(u.price ?? 0) };
  }
  if (players.length === 0) return null;
  const p = cyclePick(players, turn, 'featured-player');
  return { id: LIMITED_SLOT, limited: true, item: { kind: 'player', id: p.id }, price: coins(FEATURED_PRICE[p.rarity as 'epic' | 'legend']) };
}

/** What a deal costs for this player. */
export function dealPrice(p: PlayerDef): Price {
  return coins(p.rarity === 'legend' ? FEATURED_PRICE.legend : DEAL_PRICE[p.rarity]);
}

/** True when one more copy takes the player up a level (or unlocks them). */
export function copyLevelsUp(copies: number): boolean {
  return copies < MAX_COPIES && LEVEL_COPIES.includes(copies + 1);
}

function weightOf(copies: number): number {
  if (copies >= MAX_COPIES) return 0;
  if (copies === 0) return NEW_WEIGHT;
  return copyLevelsUp(copies) ? LEVEL_WEIGHT : 1;
}

function weighted<T>(rng: Rng, items: readonly T[], weight: (t: T) => number): T | null {
  let total = 0;
  for (const t of items) total += weight(t);
  if (total <= 0) return null;
  let x = rng() * total;
  for (const t of items) {
    x -= weight(t);
    if (x < 0) return t;
  }
  return items[items.length - 1];
}

/**
 * The day's three deals for this collection: rarity by `DEAL_ODDS`, then a player of that rarity, leaning toward ones
 * not owned yet or one copy short of a level, never a player already at the top level or the day's featured player.
 * Cheapest first. Deterministic for a day and a collection.
 */
export function rollDeals(day: string, owned: Owned, pool: readonly PlayerDef[] = PLAYERS, skip: readonly string[] = []): string[] {
  const rng = seededRng(hashSeed(`deals:${day}`));
  const taken = new Set(skip);
  const picks: PlayerDef[] = [];
  for (let i = 0; i < DEAL_SLOTS; i++) {
    const open = (r: Rarity) => pool.filter((p) => p.rarity === r && !taken.has(p.id) && weightOf(owned[p.id] ?? 0) > 0);
    const rarities = (Object.keys(DEAL_ODDS) as (keyof typeof DEAL_ODDS)[]).filter((r) => open(r).length > 0);
    const rarity = weighted(rng, rarities, (r) => DEAL_ODDS[r]);
    if (!rarity) break;
    const player = weighted(rng, open(rarity), (p) => weightOf(owned[p.id] ?? 0));
    if (!player) break;
    taken.add(player.id);
    picks.push(player);
  }
  return picks.sort((a, b) => RARITIES.indexOf(a.rarity) - RARITIES.indexOf(b.rarity)).map((p) => p.id);
}

/** A day's shop as the save keeps it: the deals rolled for it, and the slots already bought. */
export interface ShopDay {
  day: string;
  /** player ids, one per deal slot */
  deals: string[];
  /** slot ids bought today */
  sold: string[];
}

/** Today's shop from the save: what it kept for today, or a fresh roll from the collection as it is now. */
export function shopDay(saved: ShopDay | null, day: string, owned: Owned): ShopDay {
  if (saved && saved.day === day) return saved;
  const featured = limitedSlot(day);
  return { day, deals: rollDeals(day, owned, PLAYERS, featured?.item.kind === 'player' ? [featured.item.id] : []), sold: [] };
}

/** Every slot of a day's shop, LIMITED first. A deal for a player this build does not have is left out. */
export function shopSlots(today: ShopDay): ShopSlot[] {
  const slots: ShopSlot[] = [];
  const featured = limitedSlot(today.day);
  if (featured) slots.push(featured);
  today.deals.forEach((id, i) => {
    const p = playerById(id);
    if (p) slots.push({ id: `deal-${i}`, limited: false, item: { kind: 'player', id }, price: dealPrice(p) });
  });
  return slots;
}

/** True when today's shop has not been looked at yet: the NEW dot. */
export function shopIsNew(saved: ShopDay | null, day: string): boolean {
  return saved?.day !== day;
}
