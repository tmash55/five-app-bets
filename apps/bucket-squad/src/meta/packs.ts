/** Card packs: what is for sale, the odds inside, and how a pack is rolled. */

import { PLAYERS, teamById, teamPlayers } from '@/data/roster';
import { RARITIES, type PlayerDef, type Rarity } from '@/data/types';
import type { ColorName } from '@/theme/tokens';
import { addCopy, type Gain, type Owned } from './collection';
import type { Rng } from './rng';

export type Odds = Record<Rarity, number>;

export interface PackDef {
  id: string;
  name: string;
  tagline: string;
  /** coins, 0 when the pack can only be earned */
  price: number;
  cards: number;
  odds: Odds;
  /** one card is always at least this good */
  guarantee?: Rarity;
  /** only players from this team */
  team?: string;
  /** wrapper colours: token names, or team colours for team packs */
  fill: ColorName | (string & {});
  fill2: ColorName | (string & {});
  accent: ColorName | (string & {});
}

export const SHOP_PACKS: readonly PackDef[] = [
  {
    id: 'playground',
    name: 'Playground Pack',
    tagline: '3 players. Great for filling the Shelf.',
    price: 250,
    cards: 3,
    odds: { common: 0.74, rare: 0.21, epic: 0.045, legend: 0.005 },
    fill: 'mint',
    fill2: 'mintDeep',
    accent: 'sun',
  },
  {
    id: 'allstar',
    name: 'All-Star Pack',
    tagline: '4 players. At least one Rare or better.',
    price: 700,
    cards: 4,
    odds: { common: 0.5, rare: 0.36, epic: 0.12, legend: 0.02 },
    guarantee: 'rare',
    fill: 'sky',
    fill2: 'skyDeep',
    accent: 'sun',
  },
  {
    id: 'legend',
    name: 'Legend Pack',
    tagline: '5 players. At least one Epic or better.',
    price: 1800,
    cards: 5,
    odds: { common: 0.3, rare: 0.4, epic: 0.24, legend: 0.06 },
    guarantee: 'epic',
    fill: 'grape',
    fill2: 'grapeDeep',
    accent: 'legend',
  },
];

const TEAM_ODDS: Odds = { common: 0.58, rare: 0.3, epic: 0.11, legend: 0.01 };

/** Pack ids look like "playground" or "team:rockets". */
export function packById(id: string): PackDef {
  if (id.startsWith('team:')) {
    const team = teamById(id.slice(5));
    return {
      id,
      name: `${team.name} Pack`,
      tagline: `3 players from the ${team.place} ${team.name}.`,
      price: 0,
      cards: 3,
      odds: TEAM_ODDS,
      team: team.id,
      fill: team.color,
      fill2: team.kit.shorts,
      accent: team.color2,
    };
  }
  const def = SHOP_PACKS.find((p) => p.id === id);
  if (!def) throw new Error(`Unknown pack ${id}`);
  return def;
}

export function teamPackId(teamId: string): string {
  return `team:${teamId}`;
}

/** How strongly a roll leans toward a player you do not have yet. */
const NEW_BIAS = 0.5;

function rollRarity(rng: Rng, odds: Odds, atLeast: Rarity | undefined, available: Set<Rarity>): Rarity {
  const from = atLeast ? RARITIES.indexOf(atLeast) : 0;
  const options = RARITIES.filter((r, i) => i >= from && available.has(r));
  if (options.length === 0) {
    // nothing that good in this pool: take the best there is
    for (let i = RARITIES.length - 1; i >= 0; i--) if (available.has(RARITIES[i])) return RARITIES[i];
    throw new Error('Empty card pool');
  }
  let total = 0;
  for (const r of options) total += odds[r];
  if (total <= 0) return options[options.length - 1];
  let x = rng() * total;
  for (const r of options) {
    x -= odds[r];
    if (x <= 0) return r;
  }
  return options[options.length - 1];
}

export interface PackResult {
  cards: Gain[];
  owned: Owned;
  /** coins paid out for copies of players already at the top level */
  coins: number;
}

export function openPack(def: PackDef, owned: Owned, rng: Rng, pool: readonly PlayerDef[] = def.team ? teamPlayers(def.team) : PLAYERS): PackResult {
  const byRarity = new Map<Rarity, PlayerDef[]>();
  for (const p of pool) {
    const list = byRarity.get(p.rarity);
    if (list) list.push(p);
    else byRarity.set(p.rarity, [p]);
  }
  const available = new Set(byRarity.keys());
  // the guaranteed card comes last so the best reveal ends the pack
  const slots: (Rarity | undefined)[] = [];
  for (let i = 0; i < def.cards; i++) slots.push(i === def.cards - 1 ? def.guarantee : undefined);

  let current = owned;
  let coins = 0;
  const cards: Gain[] = [];
  const inPack = new Set<string>();
  for (const atLeast of slots) {
    const rarity = rollRarity(rng, def.odds, atLeast, available);
    const all = byRarity.get(rarity) ?? [];
    let options = all.filter((p) => !inPack.has(p.id));
    if (options.length === 0) options = all;
    const fresh = options.filter((p) => (current[p.id] ?? 0) === 0);
    const from = fresh.length > 0 && rng() < NEW_BIAS ? fresh : options;
    const player = from[Math.min(from.length - 1, Math.floor(rng() * from.length))];
    inPack.add(player.id);
    const res = addCopy(current, player.id, player.rarity);
    current = res.owned;
    coins += res.gain.coins;
    cards.push(res.gain);
  }
  // show the best card last
  const rank = new Map(pool.map((p) => [p.id, RARITIES.indexOf(p.rarity)]));
  cards.sort((a, b) => (rank.get(a.playerId) ?? 0) - (rank.get(b.playerId) ?? 0));
  return { cards, owned: current, coins };
}
