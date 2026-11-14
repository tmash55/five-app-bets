import { mustPlayer } from '@/data/roster';
import { LIMITED_UNIFORMS, SPECIAL_UNIFORMS } from '@/data/uniforms';
import { DUPLICATE_COINS, LEVEL_COPIES, MAX_COPIES } from '@/meta/collection';
import { dayKey } from '@/meta/rng';
import { LIMITED_SLOT, dayNumber, limitedSlot, shopSlots } from '@/meta/shop';

import { addCard, buyPack, buyShopSlot, buyUniform, hasUniform, newSave, repairSave, slotBlock, startCareer, todaysShop, visitShop, wearUniform, type SaveData } from '../logic';

const rich = (coins = 99999): SaveData => ({ ...startCareer(newSave(), 'comets'), coins });

/** the first day from `from` whose LIMITED slot is a uniform (or a player) */
function dayOf(kind: 'uniform' | 'player', from = '2026-11-13'): string {
  const [y, m, d] = from.split('-').map(Number);
  for (let i = 0; i < 4; i++) {
    const day = dayKey(new Date(y, m - 1, d + i));
    if (limitedSlot(day)?.item.kind === kind) return day;
  }
  throw new Error('no such day');
}

const U_DAY = dayOf('uniform');
const P_DAY = dayOf('player');
const next = (day: string) => {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + 1));
};

describe('the Daily Shop in the save', () => {
  it('starts unopened, and opening it keeps the day and its deals', () => {
    const s = rich();
    expect(s.shop).toBeNull();
    const seen = visitShop(s, U_DAY);
    expect(seen.shop?.day).toBe(U_DAY);
    expect(seen.shop?.deals).toEqual(todaysShop(s, U_DAY).deals);
    expect(seen.shop?.sold).toEqual([]);
    // a second visit the same day changes nothing
    expect(visitShop(seen, U_DAY)).toBe(seen);
    expect(visitShop(seen, next(U_DAY)).shop?.day).toBe(next(U_DAY));
  });

  it('sells a deal: takes the price, adds the card like a pack does, and marks it SOLD', () => {
    const s = visitShop(rich(5000), P_DAY);
    const slot = shopSlots(todaysShop(s, P_DAY)).find((x) => !x.limited);
    if (!slot) throw new Error('no deal');
    const id = slot.item.id;
    const before = s.owned[id] ?? 0;
    const res = buyShopSlot(s, slot.id, P_DAY);
    if (!res) throw new Error('not bought');
    expect(res.data.coins).toBe(5000 - slot.price.amount);
    expect(res.data.owned[id]).toBe(before + 1);
    expect(res.gain).toMatchObject({ playerId: id, isNew: before === 0 });
    if (before === 0) expect(res.data.fresh).toContain(id);
    expect(res.data.shop?.sold).toEqual([slot.id]);
    expect(slotBlock(res.data, slot, P_DAY)).toBe('sold');
    // once a day
    expect(buyShopSlot(res.data, slot.id, P_DAY)).toBeNull();
    // the other deals stay as they were, though the collection changed
    expect(todaysShop(res.data, P_DAY).deals).toEqual(s.shop?.deals);
  });

  it('refuses when short of coins, and for a slot that is not there', () => {
    const s = visitShop(rich(10), P_DAY);
    for (const slot of shopSlots(todaysShop(s, P_DAY))) expect(buyShopSlot(s, slot.id, P_DAY)).toBeNull();
    expect(buyShopSlot(rich(), 'deal-9', P_DAY)).toBeNull();
  });

  it('levels a player up with a copy, and sells no copies past the top level', () => {
    const s0 = visitShop(rich(), P_DAY);
    const featured = shopSlots(todaysShop(s0, P_DAY)).find((x) => x.id === LIMITED_SLOT);
    if (!featured || featured.item.kind !== 'player') throw new Error('no featured player');
    const id = featured.item.id;
    const one = { ...s0, owned: { ...s0.owned, [id]: LEVEL_COPIES[1] - 1 } };
    const res = buyShopSlot(one, LIMITED_SLOT, P_DAY);
    expect(res?.gain).toMatchObject({ isNew: false, levelBefore: 1, levelAfter: 2, coins: 0 });
    const maxed = { ...s0, owned: { ...s0.owned, [id]: MAX_COPIES } };
    expect(slotBlock(maxed, featured, P_DAY)).toBe('maxed');
    expect(buyShopSlot(maxed, LIMITED_SLOT, P_DAY)).toBeNull();
  });

  it('adds a card the way a pack does: a copy past the top level pays coins', () => {
    const id = 'dash-bennett';
    const s = { ...rich(0), owned: { [id]: MAX_COPIES } };
    const res = addCard(s, id);
    expect(res?.data.coins).toBe(DUPLICATE_COINS[mustPlayer(id).rarity]);
    expect(res?.data.owned[id]).toBe(MAX_COPIES);
    expect(addCard(s, 'nobody')).toBeNull();
  });

  it('sells the limited uniform only in the shop, and it is then worn like any special', () => {
    const slot = limitedSlot(U_DAY);
    if (!slot || slot.item.kind !== 'uniform') throw new Error('no uniform day');
    const id = slot.item.id;
    // never from the Uniforms page
    for (const u of LIMITED_UNIFORMS) expect(buyUniform(rich(), u.id)).toBeNull();
    expect(buyUniform(rich(), SPECIAL_UNIFORMS[0].id)?.uniforms).toEqual([SPECIAL_UNIFORMS[0].id]);
    const res = buyShopSlot(rich(2000), LIMITED_SLOT, U_DAY);
    if (!res) throw new Error('not bought');
    expect(res.data.coins).toBe(2000 - slot.price.amount);
    expect(res.data.uniforms).toEqual([id]);
    expect(res.gain).toBeUndefined();
    expect(hasUniform(res.data, id)).toBe(true);
    expect(wearUniform(res.data, id)?.uniform).toBe(id);
    expect(buyShopSlot(res.data, LIMITED_SLOT, U_DAY)).toBeNull();
    // already yours (bought on an earlier turn): not sold to you twice
    const later = { ...rich(), uniforms: [id] };
    expect(slotBlock(later, slot, U_DAY)).toBe('owned');
    expect(buyShopSlot(later, LIMITED_SLOT, U_DAY)).toBeNull();
  });

  it('opens a fresh shop the next day, with nothing SOLD', () => {
    const s = visitShop(rich(), P_DAY);
    const bought = buyShopSlot(s, 'deal-0', P_DAY);
    if (!bought) throw new Error('not bought');
    const tomorrow = next(P_DAY);
    expect(todaysShop(bought.data, tomorrow).sold).toEqual([]);
    expect(dayNumber(tomorrow) - dayNumber(P_DAY)).toBe(1);
    expect(buyShopSlot(bought.data, 'deal-0', tomorrow)?.data.shop).toMatchObject({ day: tomorrow, sold: ['deal-0'] });
  });

  it('pays for packs through the same purse', () => {
    expect(buyPack(rich(249), 'playground')).toBeNull();
    expect(buyPack(rich(250), 'playground')?.coins).toBe(0);
  });
});

describe('older saves and the shop', () => {
  it('gives a save from before the shop an unopened one', () => {
    const old = { ...rich() } as Partial<SaveData>;
    delete old.shop;
    const repaired = repairSave(JSON.parse(JSON.stringify(old)));
    expect(repaired.shop).toBeNull();
    expect(repaired.coins).toBe(old.coins);
  });

  it('keeps a saved day, and drops one it cannot read', () => {
    const s = visitShop(rich(), P_DAY);
    expect(repairSave(JSON.parse(JSON.stringify(s))).shop).toEqual(s.shop);
    expect(repairSave({ ...s, shop: { day: 'yesterday', deals: [], sold: [] } }).shop).toBeNull();
    expect(repairSave({ ...s, shop: 'nope' }).shop).toBeNull();
    expect(repairSave({ ...s, shop: { day: P_DAY, deals: 'x', sold: [3, 'deal-1', 'deal-1'] } }).shop).toEqual({ day: P_DAY, deals: [], sold: ['deal-1'] });
  });
});
