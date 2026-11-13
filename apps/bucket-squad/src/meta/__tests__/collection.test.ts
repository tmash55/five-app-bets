import { DUPLICATE_COINS, LEVEL_COPIES, MAX_COPIES, addCopy, countOwned, levelOf, levelProgress, owns } from '../collection';

describe('levels from copies', () => {
  it('unlocks at one copy and tops out at the last step', () => {
    expect(levelOf(0)).toBe(0);
    expect(levelOf(1)).toBe(1);
    expect(levelOf(2)).toBe(2);
    expect(levelOf(3)).toBe(2);
    expect(levelOf(4)).toBe(3);
    expect(levelOf(7)).toBe(4);
    expect(levelOf(11)).toBe(5);
    expect(levelOf(99)).toBe(5);
  });

  it('needs more copies for each level than the one before', () => {
    for (let i = 2; i < LEVEL_COPIES.length; i++) {
      expect(LEVEL_COPIES[i] - LEVEL_COPIES[i - 1]).toBeGreaterThan(LEVEL_COPIES[i - 1] - LEVEL_COPIES[i - 2]);
    }
  });

  it('reports progress toward the next level', () => {
    expect(levelProgress(0)).toEqual({ level: 0, have: 0, need: 1, maxed: false });
    expect(levelProgress(1)).toEqual({ level: 1, have: 0, need: 1, maxed: false });
    expect(levelProgress(5)).toEqual({ level: 3, have: 1, need: 3, maxed: false });
    expect(levelProgress(MAX_COPIES)).toEqual({ level: 5, have: 0, need: 0, maxed: true });
  });
});

describe('adding a copy', () => {
  it('unlocks a new player without touching the old collection', () => {
    const before = { 'pippa-quinn': 1 };
    const { owned, gain } = addCopy(before, 'dash-bennett', 'rare');
    expect(owned).toEqual({ 'pippa-quinn': 1, 'dash-bennett': 1 });
    expect(before).toEqual({ 'pippa-quinn': 1 });
    expect(gain).toEqual({ playerId: 'dash-bennett', isNew: true, levelBefore: 0, levelAfter: 1, coins: 0 });
  });

  it('levels a player up when the bar fills', () => {
    const { owned, gain } = addCopy({ 'dash-bennett': 3 }, 'dash-bennett', 'rare');
    expect(owned['dash-bennett']).toBe(4);
    expect(gain.isNew).toBe(false);
    expect(gain.levelBefore).toBe(2);
    expect(gain.levelAfter).toBe(3);
  });

  it('turns a copy of a maxed player into coins', () => {
    const before = { 'stella-starr': MAX_COPIES };
    const { owned, gain } = addCopy(before, 'stella-starr', 'legend');
    expect(owned).toBe(before);
    expect(gain.coins).toBe(DUPLICATE_COINS.legend);
    expect(gain.levelAfter).toBe(5);
  });

  it('counts who you have', () => {
    const owned = { a: 1, b: 0, c: 3 };
    expect(owns(owned, 'a')).toBe(true);
    expect(owns(owned, 'b')).toBe(false);
    expect(owns(owned, 'zzz')).toBe(false);
    expect(countOwned(owned, ['a', 'b', 'c', 'd'])).toBe(2);
  });
});
