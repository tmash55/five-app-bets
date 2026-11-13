import { STARTING_COINS, newSave, repairSave, startCareer, type SaveData } from '@/state/logic';

import { cloudFromRow, isFresh, planSync, progressOf, retryDelay, sameSave, savedAgo, stableJson, type CloudSave } from '../sync';

const career = (): SaveData => startCareer(newSave(), 'comets');
/** a game with real progress in it */
const played = (coins = 900, games = 6): SaveData => {
  const c = career();
  return { ...c, coins, stats: { ...c.stats, games, wins: Math.floor(games / 2) } };
};
const cloud = (data: SaveData, rev = 3): CloudSave => ({ rev, data, at: 1_000 });

describe('progress', () => {
  it('counts players found, coins and games', () => {
    const s = played(1234, 7);
    expect(progressOf(s)).toEqual({ players: 3, coins: 1234, games: 7 });
    expect(progressOf({ ...s, owned: { ...s.owned, ghost: 0 } }).players).toBe(3);
  });

  it('calls a never-started game and a just-started career fresh', () => {
    expect(isFresh(newSave())).toBe(true);
    const c = career();
    expect(c.coins).toBe(STARTING_COINS);
    expect(isFresh(c)).toBe(true);
    expect(isFresh({ ...c, freePackDay: '2026-11-13', packs: { playground: 2 } })).toBe(true);
  });

  it('calls anything played, opened, bought or earned real progress', () => {
    const c = career();
    expect(isFresh({ ...c, stats: { ...c.stats, games: 1 } })).toBe(false);
    expect(isFresh({ ...c, stats: { ...c.stats, packs: 1 } })).toBe(false);
    expect(isFresh({ ...c, ladder: { ...c.ladder, games: 1 } })).toBe(false);
    expect(isFresh({ ...c, uniforms: ['comets-alt'] })).toBe(false);
    expect(isFresh({ ...c, coins: STARTING_COINS + 1 })).toBe(false);
    expect(isFresh({ ...c, owned: { ...c.owned, extra: 1 } })).toBe(false);
    // repairSave keeps the coins and cards of a save whose squad broke: that is progress, though not onboarded
    expect(isFresh({ ...newSave(), coins: 40 })).toBe(false);
    expect(isFresh({ ...newSave(), owned: { someone: 1 } })).toBe(false);
  });
});

describe('comparing saves', () => {
  it('writes JSON with keys in order', () => {
    expect(stableJson({ b: 1, a: [{ d: 2, c: null }], e: undefined })).toBe('{"a":[{"c":null,"d":2}],"b":1}');
    expect(stableJson({ a: 1, b: 2 })).toBe(stableJson({ b: 2, a: 1 }));
  });

  it('finds two saves the same whatever order they were written in', () => {
    const a = played();
    const reordered = JSON.parse(stableJson(a)) as SaveData;
    expect(sameSave(a, reordered)).toBe(true);
    expect(sameSave(a, { ...a, coins: a.coins + 1 })).toBe(false);
    expect(sameSave(a, { ...a, settings: { ...a.settings, sound: !a.settings.sound } })).toBe(false);
  });
});

describe('reading a row from the account', () => {
  it('repairs whatever comes down and reads the time', () => {
    const row = cloudFromRow({ rev: '7', data: { coins: -5, owned: { 'not-a-player': 2 }, squad: 'nonsense', settings: { quarterSeconds: 999 } }, updated_at: '2026-11-13T10:00:00Z' });
    expect(row.rev).toBe(7);
    expect(row.at).toBe(Date.parse('2026-11-13T10:00:00Z'));
    expect(row.data).toEqual(repairSave(row.data));
    expect(row.data.coins).toBe(0);
    expect(row.data.squad).toEqual([]);
    expect(row.data.settings.quarterSeconds).toBe(60);
    // a player this build does not know is kept, not thrown away
    expect(row.data.owned['not-a-player']).toBe(2);
  });

  it('survives a row that is not a save at all', () => {
    expect(cloudFromRow({ rev: 1, data: null, updated_at: null })).toEqual({ rev: 1, data: newSave(), at: null });
    expect(cloudFromRow({ rev: 2, data: 'junk', updated_at: 'not a date' }).at).toBeNull();
  });
});

describe('planSync', () => {
  it('uploads when the account has no save yet', () => {
    expect(planSync({ local: newSave(), dirty: true, base: null, remote: null })).toEqual({ kind: 'upload', base: null });
    expect(planSync({ local: played(), dirty: false, base: 4, remote: null })).toEqual({ kind: 'upload', base: null });
  });

  it('writes over the account when only this device moved', () => {
    expect(planSync({ local: played(), dirty: true, base: 3, remote: cloud(played(10, 1), 3) })).toEqual({ kind: 'upload', base: 3 });
  });

  it('does nothing when neither moved', () => {
    expect(planSync({ local: played(), dirty: false, base: 3, remote: cloud(played(10, 1), 3) })).toEqual({ kind: 'match' });
  });

  it('downloads when only the account moved (another device played)', () => {
    expect(planSync({ local: played(500, 2), dirty: false, base: 3, remote: cloud(played(900, 9), 5) })).toEqual({ kind: 'download' });
  });

  it('on first sign-in takes the account game over a fresh device game', () => {
    expect(planSync({ local: newSave(), dirty: true, base: null, remote: cloud(played()) })).toEqual({ kind: 'download' });
    expect(planSync({ local: career(), dirty: true, base: null, remote: cloud(played()) })).toEqual({ kind: 'download' });
  });

  it('on first sign-in puts the device game over a fresh account game', () => {
    expect(planSync({ local: played(), dirty: true, base: null, remote: cloud(career(), 2) })).toEqual({ kind: 'upload', base: 2 });
  });

  it('asks when both hold real progress', () => {
    expect(planSync({ local: played(900, 6), dirty: true, base: null, remote: cloud(played(300, 20)) })).toEqual({ kind: 'ask' });
    // both moved since the last sync
    expect(planSync({ local: played(900, 6), dirty: true, base: 2, remote: cloud(played(300, 20), 4) })).toEqual({ kind: 'ask' });
  });

  it('never asks about two copies of the same game', () => {
    const game = played();
    expect(planSync({ local: game, dirty: true, base: null, remote: cloud(JSON.parse(stableJson(game)) as SaveData) })).toEqual({ kind: 'match' });
    expect(planSync({ local: game, dirty: true, base: 1, remote: cloud(game, 4) })).toEqual({ kind: 'match' });
  });

  it('never throws progress away without asking', () => {
    // every pairing of saves and sync states: a download only ever replaces a fresh device game, or one
    // that has not changed since it last matched the account; an upload only replaces a fresh account game,
    // one this device last matched, or nothing
    const saves = [newSave(), career(), played(900, 6), played(300, 20)];
    for (const local of saves) {
      for (const remoteData of saves) {
        for (const base of [null, 3, 5]) {
          for (const dirty of [true, false]) {
            const remote = cloud(remoteData, 5);
            const plan = planSync({ local, dirty, base, remote });
            if (plan.kind === 'download') expect(isFresh(local) || (base !== null && !dirty) || sameSave(local, remoteData)).toBe(true);
            if (plan.kind === 'upload') expect(isFresh(remoteData) || plan.base === base).toBe(true);
          }
        }
      }
    }
  });
});

describe('words and waits', () => {
  const now = Date.parse('2026-11-13T15:00:00Z');
  it('says when the account last had the game', () => {
    expect(savedAgo(now - 20_000, now)).toBe('just now');
    expect(savedAgo(now + 5_000, now)).toBe('just now');
    expect(savedAgo(now - 60_000, now)).toBe('1 minute ago');
    expect(savedAgo(now - 5 * 60_000, now)).toBe('5 minutes ago');
    expect(savedAgo(now - 60 * 60_000, now)).toBe('1 hour ago');
    expect(savedAgo(now - 3 * 60 * 60_000, now)).toBe('3 hours ago');
    expect(savedAgo(now - 30 * 60 * 60_000, now)).toBe('yesterday');
    expect(savedAgo(Date.parse('2026-11-02T12:00:00Z'), now)).toBe('on Nov 2');
  });

  it('waits longer after each failure, up to five minutes', () => {
    expect(retryDelay(1)).toBe(15_000);
    expect(retryDelay(2)).toBe(60_000);
    expect(retryDelay(3)).toBe(300_000);
    expect(retryDelay(9)).toBe(300_000);
    expect(retryDelay(0)).toBe(15_000);
  });
});
