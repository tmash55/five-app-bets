import { LEVEL_BONUS, MAX_LEVEL, PLAYERS, playerOverall } from '@/data/roster';
import { RATING_KEYS } from '@/game/sim/ratings';
import { LEVEL_COPIES, MAX_COPIES } from '@/meta/collection';
import { FRAME_TIERS, allRatingLamps, copyKind, copyLine, copyWords, frameTier, lampsFor, lampsGained, newPieces, nextLevel, ratingLamps } from '@/ui/arcade/levels';

const pieces = (level: number) => (['trim', 'studs', 'chrome', 'crest'] as const).filter((k) => frameTier(level)[k]);

describe('the frame a level wears', () => {
  it('has one frame for every level', () => {
    expect(FRAME_TIERS).toHaveLength(MAX_LEVEL);
    FRAME_TIERS.forEach((t, i) => expect(t.level).toBe(i + 1));
  });

  it('is plain at level 1 and adds one piece a level, keeping the ones before', () => {
    expect(pieces(1)).toEqual([]);
    expect(pieces(2)).toEqual(['trim']);
    expect(pieces(3)).toEqual(['trim', 'studs']);
    expect(pieces(4)).toEqual(['trim', 'studs', 'chrome']);
    expect(pieces(5)).toEqual(['trim', 'studs', 'chrome', 'crest']);
    for (let l = 2; l <= MAX_LEVEL; l++) expect(pieces(l).length).toBe(pieces(l - 1).length + 1);
  });

  it('gives a player not found yet, or any level past the top, a frame that exists', () => {
    expect(frameTier(0)).toBe(FRAME_TIERS[0]);
    expect(frameTier(-3)).toBe(FRAME_TIERS[0]);
    expect(frameTier(MAX_LEVEL + 4)).toBe(FRAME_TIERS[MAX_LEVEL - 1]);
    expect(frameTier(2.7)).toBe(FRAME_TIERS[1]);
  });

  it('names a different piece for every level up', () => {
    expect(new Set(FRAME_TIERS.map((t) => t.name)).size).toBe(FRAME_TIERS.length);
  });

  it('knows which pieces a level up brings in', () => {
    expect(newPieces(1, 2)).toEqual(['trim']);
    expect(newPieces(3, 4)).toEqual(['chrome']);
    expect(newPieces(4, 5)).toEqual(['crest']);
    expect(newPieces(1, 5)).toEqual(['trim', 'studs', 'chrome', 'crest']);
    expect(newPieces(3, 3)).toEqual([]);
    expect(newPieces(5, 2)).toEqual([]);
  });
});

describe('the rating lamps a level lit', () => {
  it('lights nothing gold at level 1', () => {
    const l = ratingLamps(74, 1);
    expect(l).toEqual({ value: 74, bonus: 0, lit: 7, levelFrom: 7, next: 1 });
  });

  it('lights a gold lamp only when the level carries the rating past one', () => {
    // 74 at level 1: +2 a level is 76, 78, 80, 82
    expect(ratingLamps(74, 2)).toMatchObject({ value: 76, lit: 8, levelFrom: 7 });
    expect(ratingLamps(70, 2)).toMatchObject({ value: 72, lit: 7, levelFrom: 7 });
    expect(ratingLamps(70, 3)).toMatchObject({ value: 74, lit: 7, levelFrom: 7 });
    expect(ratingLamps(70, 4)).toMatchObject({ value: 76, lit: 8, levelFrom: 7 });
  });

  it('shows what the next level would light as outlines, and none at the top', () => {
    expect(ratingLamps(70, 3).next).toBe(1);
    expect(ratingLamps(70, 2).next).toBe(0);
    expect(ratingLamps(70, MAX_LEVEL).next).toBe(0);
    expect(ratingLamps(70, 4).next).toBe(0);
  });

  it('adds the level bonus and stops at 99', () => {
    expect(ratingLamps(60, MAX_LEVEL).bonus).toBe((MAX_LEVEL - 1) * LEVEL_BONUS);
    expect(ratingLamps(97, MAX_LEVEL)).toMatchObject({ value: 99, bonus: 2, lit: 10, levelFrom: 10, next: 0 });
  });

  it('never lights more lamps than the bar has, nor fewer than at level 1', () => {
    for (let base = 1; base <= 99; base += 7) {
      for (let level = 1; level <= MAX_LEVEL; level++) {
        const l = ratingLamps(base, level);
        expect(l.lit).toBeGreaterThanOrEqual(l.levelFrom);
        expect(l.lit + l.next).toBeLessThanOrEqual(10);
        expect(l.lit).toBe(lampsFor(l.value));
      }
    }
  });

  it('counts the new lamps a level up lights across the ratings', () => {
    const p = PLAYERS[0];
    const all = allRatingLamps(p.ratings, 3);
    expect(Object.keys(all)).toEqual([...RATING_KEYS]);
    const gained = lampsGained(p.ratings, 1, MAX_LEVEL);
    const counted = RATING_KEYS.reduce((n, k) => n + ratingLamps(p.ratings[k], MAX_LEVEL).lit - ratingLamps(p.ratings[k], 1).lit, 0);
    expect(gained).toBe(counted);
    expect(lampsGained(p.ratings, 2, 2)).toBe(0);
  });
});

describe('the words for copies', () => {
  it('counts the copies toward the next level', () => {
    // level 3 takes 4 copies and level 4 takes 7: with 6, two of the three are in
    expect(copyWords(6)).toMatchObject({ level: 3, have: 2, need: 3, count: '2 OF 3', left: '1 MORE COPY', toNext: '1 MORE COPY TO LV 4', maxed: false });
    expect(copyWords(4)).toMatchObject({ have: 0, need: 3, left: '3 MORE COPIES' });
    expect(copyWords(1)).toMatchObject({ level: 1, count: '0 OF 1', left: '1 MORE COPY', toNext: '1 MORE COPY TO LV 2' });
  });

  it('says the top level is the top', () => {
    expect(copyWords(MAX_COPIES)).toMatchObject({ level: MAX_LEVEL, maxed: true, left: 'TOP LEVEL' });
    expect(copyWords(MAX_COPIES).say).toContain('top level');
  });

  it('reads out the same thing it shows', () => {
    expect(copyWords(6).say).toBe('Level 3. 1 more copy to level 4');
    expect(copyWords(4).say).toBe('Level 3. 3 more copies to level 4');
  });

  it('tells a level up from a copy toward one', () => {
    const up = { playerId: 'x', isNew: false, levelBefore: 2, levelAfter: 3, coins: 0 };
    const copy = { playerId: 'x', isNew: false, levelBefore: 3, levelAfter: 3, coins: 0 };
    expect(copyKind(up)).toBe('levelUp');
    expect(copyKind(copy)).toBe('copy');
    expect(copyKind({ ...copy, isNew: true, levelBefore: 0, levelAfter: 1 })).toBe('new');
    expect(copyKind({ ...copy, levelBefore: 5, levelAfter: 5, coins: 50 })).toBe('coins');
    expect(copyLine(up, LEVEL_COPIES[2])).toBe(`Level 2 → 3: +${LEVEL_BONUS} to every rating.`);
    expect(copyLine(copy, 6)).toBe('Copy 2 of 3 toward level 4.');
  });
});

describe('what the next level brings', () => {
  const p = PLAYERS[0];

  it('names the level, its frame piece and the overall it lifts to', () => {
    const n = nextLevel(p, 3);
    expect(n).toMatchObject({ level: 4, bonus: LEVEL_BONUS, overallNow: playerOverall(p, 3), overall: playerOverall(p, 4), adds: 'chrome' });
    expect(n?.frame).toBe(frameTier(4));
  });

  it('brings nothing at the top level or before the player is found', () => {
    expect(nextLevel(p, MAX_LEVEL)).toBeNull();
    expect(nextLevel(p, 0)).toBeNull();
  });
});
