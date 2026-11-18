/** A grown-up's coin gift (the account sheet, behind the times-table check) lands in the save at once. */

import { GIFT_COINS, addCoins, newSave, startCareer } from '../logic';

describe('gift coins', () => {
  it('offers a thousand and ten thousand', () => {
    expect([...GIFT_COINS]).toEqual([1_000, 10_000]);
  });

  it('adds each gift to the coins and changes nothing else', () => {
    const before = startCareer(newSave(), 'comets');
    const after = GIFT_COINS.reduce((s, n) => addCoins(s, n), before);
    expect(after.coins).toBe(before.coins + 11_000);
    expect({ ...after, coins: before.coins }).toEqual(before);
  });

  it('never takes the coins below zero', () => {
    expect(addCoins(newSave(), -1_000_000).coins).toBe(0);
  });
});
