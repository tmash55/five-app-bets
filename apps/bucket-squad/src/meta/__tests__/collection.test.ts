import { DUPLICATE_COINS, LEVEL_COPIES, MAX_COPIES, SHELF_SORTS, addCopy, countOwned, levelOf, levelProgress, owns, sortShelf, type Owned } from '../collection';

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

describe('sorting the collection page', () => {
  type P = { id: string; team: string; rarity: 'common' | 'rare' | 'epic' | 'legend'; name: string; ovr: number };
  const mk = (id: string, team: string, rarity: P['rarity'], ovr: number): P => ({ id, team, rarity, name: id, ovr });
  const players: P[] = [mk('ann', 'red', 'common', 60), mk('bo', 'blue', 'legend', 90), mk('cy', 'red', 'rare', 70), mk('di', 'blue', 'common', 65), mk('ed', 'red', 'epic', 80), mk('fay', 'blue', 'rare', 72)];
  const rank = { common: 0, rare: 1, epic: 2, legend: 3 };
  const value = (a: P, b: P) => rank[b.rarity] - rank[a.rarity] || b.ovr - a.ovr;
  const overall = (p: P, level: number) => p.ovr + level * 3;
  // found in this order: di first, then ann, then cy (cy has three copies, so level 2)
  const owned: Owned = { di: 1, ann: 1, cy: 3 };
  const ids = (s: Parameters<typeof sortShelf>[1]) => sortShelf(players, s, owned, value, overall, ['red', 'blue']).map((p) => p.id);

  it('shows the newest found first, then the rest by value', () => {
    expect(ids('new')).toEqual(['cy', 'ann', 'di', 'bo', 'ed', 'fay']);
  });

  it('shows the rarest found players first, then the rest rarest first', () => {
    expect(ids('rare')).toEqual(['cy', 'di', 'ann', 'bo', 'ed', 'fay']);
  });

  it('shows the best found players by their level-boosted rating, then the rest', () => {
    // cy 70 + 6, di 65 + 3, ann 60 + 3
    expect(ids('best')).toEqual(['cy', 'di', 'ann', 'bo', 'ed', 'fay']);
  });

  it('keeps each team together in the league order, best first within a team', () => {
    expect(ids('team')).toEqual(['ed', 'cy', 'ann', 'bo', 'fay', 'di']);
  });

  it('never loses or repeats a player, whatever the sort', () => {
    for (const s of SHELF_SORTS) expect([...ids(s.id)].sort()).toEqual(players.map((p) => p.id).sort());
  });

  it('keeps the order players were found in through a save and a reload', () => {
    let o: Owned = {};
    for (const id of ['fay', 'ann', 'bo']) o = addCopy(o, id, 'common').owned;
    o = addCopy(o, 'fay', 'common').owned;
    const back = JSON.parse(JSON.stringify(o)) as Owned;
    expect(Object.keys(back)).toEqual(['fay', 'ann', 'bo']);
  });
});
