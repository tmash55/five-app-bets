import { PLAYERS, mustPlayer, teamPlayers } from '@/data/roster';
import { RARITIES } from '@/data/types';

import { MAX_COPIES, type Owned } from '../collection';
import { SHOP_PACKS, openPack, packById, teamPackId } from '../packs';
import { seededRng } from '../rng';

const rank = (id: string) => RARITIES.indexOf(mustPlayer(id).rarity);

describe('pack definitions', () => {
  it('has odds that add up to one', () => {
    for (const p of [...SHOP_PACKS, packById(teamPackId('comets'))]) {
      const sum = RARITIES.reduce((a, r) => a + p.odds[r], 0);
      expect(sum).toBeCloseTo(1, 9);
    }
  });

  it('costs more for better packs', () => {
    const prices = SHOP_PACKS.map((p) => p.price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
    // a pricier pack is never a worse deal on rare cards
    for (let i = 1; i < SHOP_PACKS.length; i++) {
      expect(SHOP_PACKS[i].odds.legend).toBeGreaterThan(SHOP_PACKS[i - 1].odds.legend);
    }
  });

  it('builds a pack for any team and rejects unknown ids', () => {
    const p = packById('team:waves');
    expect(p.team).toBe('waves');
    expect(p.price).toBe(0);
    expect(() => packById('nope')).toThrow();
  });
});

describe('opening a pack', () => {
  it('gives the promised number of different players', () => {
    for (const def of SHOP_PACKS) {
      for (let seed = 1; seed <= 40; seed++) {
        const res = openPack(def, {}, seededRng(seed));
        expect(res.cards).toHaveLength(def.cards);
        expect(new Set(res.cards.map((c) => c.playerId)).size).toBe(def.cards);
      }
    }
  });

  it('is the same pack for the same seed', () => {
    const def = packById('allstar');
    expect(openPack(def, {}, seededRng(77))).toEqual(openPack(def, {}, seededRng(77)));
  });

  it('always includes the guaranteed rarity, and shows the best card last', () => {
    for (const def of SHOP_PACKS) {
      const floor = def.guarantee ? RARITIES.indexOf(def.guarantee) : 0;
      for (let seed = 1; seed <= 150; seed++) {
        const ranks = openPack(def, {}, seededRng(seed)).cards.map((c) => rank(c.playerId));
        expect(Math.max(...ranks)).toBeGreaterThanOrEqual(floor);
        expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
      }
    }
  });

  it('adds every card to the collection', () => {
    const start: Owned = { 'pippa-quinn': 1 };
    const res = openPack(packById('legend'), start, seededRng(5));
    const added = Object.values(res.owned).reduce((a, n) => a + n, 0) - 1;
    expect(added).toBe(5);
    expect(start).toEqual({ 'pippa-quinn': 1 });
    for (const c of res.cards) expect(res.owned[c.playerId]).toBeGreaterThan(0);
  });

  it('keeps team packs to that team', () => {
    const ids = new Set(teamPlayers('yetis').map((p) => p.id));
    for (let seed = 1; seed <= 40; seed++) {
      for (const c of openPack(packById('team:yetis'), {}, seededRng(seed)).cards) expect(ids.has(c.playerId)).toBe(true);
    }
  });

  it('pays coins instead of copies once everyone is maxed', () => {
    const full: Owned = {};
    for (const p of PLAYERS) full[p.id] = MAX_COPIES;
    const res = openPack(packById('playground'), full, seededRng(3));
    expect(res.owned).toEqual(full);
    expect(res.coins).toBeGreaterThan(0);
    expect(res.coins).toBe(res.cards.reduce((a, c) => a + c.coins, 0));
  });

  it('leans toward players you do not have', () => {
    // own every common but one: that one should turn up far more often than its fair share
    const commons = PLAYERS.filter((p) => p.rarity === 'common');
    const missing = commons[0].id;
    const owned: Owned = {};
    for (const p of commons) if (p.id !== missing) owned[p.id] = 1;
    let hits = 0;
    let commonCards = 0;
    for (let seed = 1; seed <= 400; seed++) {
      for (const c of openPack(packById('playground'), owned, seededRng(seed)).cards) {
        if (mustPlayer(c.playerId).rarity !== 'common') continue;
        commonCards++;
        if (c.playerId === missing) hits++;
      }
    }
    expect(hits / commonCards).toBeGreaterThan(2 / commons.length);
  });
});
