/**
 * The sync engine against stand-ins for the account, the sign-in and the device save. The stand-ins live
 * here only: the app itself always talks to the real account.
 */

import { newSave, repairSave, startCareer, type SaveData } from '@/state/logic';

import { createSyncEngine, type AuthPort, type Clock, type SavePort } from '../engine';
import type { SaveRemote } from '../remote';
import { memoryAccountStore, type AccountStore } from '../state';
import { PUSH_DELAY, cloudFromRow, sameSave } from '../sync';

const USER = 'user-1';

const career = (): SaveData => startCareer(newSave(), 'comets');
const played = (coins = 900, games = 6): SaveData => {
  const c = career();
  return { ...c, coins, stats: { ...c.stats, games } };
};
const copy = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** the account's table, in memory, with the same rev rule as the database */
class TableStandIn implements SaveRemote {
  rows = new Map<string, { rev: number; data: SaveData; backup: SaveData | null; at: number }>();
  offline = false;
  writes = 0;
  reads = 0;
  constructor(private clock: ManualClock) {}
  private check() {
    if (this.offline) throw new Error('offline');
  }
  async read(userId: string) {
    this.check();
    this.reads++;
    const row = this.rows.get(userId);
    return row ? cloudFromRow({ rev: row.rev, data: copy(row.data), updated_at: new Date(row.at).toISOString() }) : null;
  }
  async create(userId: string, data: SaveData) {
    this.check();
    if (this.rows.has(userId)) return 'conflict' as const;
    this.writes++;
    this.rows.set(userId, { rev: 1, data: copy(data), backup: null, at: this.clock.now() });
    return 1;
  }
  async update(userId: string, base: number, data: SaveData | null, backup?: SaveData) {
    this.check();
    const row = this.rows.get(userId);
    if (!row || row.rev !== base) return 'conflict' as const;
    this.writes++;
    this.rows.set(userId, { rev: base + 1, data: data ? copy(data) : row.data, backup: backup ? copy(backup) : row.backup, at: this.clock.now() });
    return base + 1;
  }
  /** another device writes */
  elsewhere(userId: string, data: SaveData) {
    const row = this.rows.get(userId);
    this.rows.set(userId, { rev: (row?.rev ?? 0) + 1, data: copy(data), backup: row?.backup ?? null, at: this.clock.now() });
  }
}

class ManualClock implements Clock {
  t = Date.parse('2026-11-13T12:00:00Z');
  timers: { at: number; fn: () => void; id: number }[] = [];
  private next = 1;
  now = () => this.t;
  setTimeout = (fn: () => void, ms: number) => {
    const id = this.next++;
    this.timers.push({ at: this.t + ms, fn, id });
    return id;
  };
  clearTimeout = (id: unknown) => {
    this.timers = this.timers.filter((x) => x.id !== id);
  };
  advance(ms: number) {
    const until = this.t + ms;
    for (;;) {
      const due = this.timers.filter((x) => x.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.timers = this.timers.filter((x) => x !== due);
      this.t = due.at;
      due.fn();
    }
    this.t = until;
  }
}

class DeviceSave implements SavePort {
  data: SaveData;
  private listeners = new Set<() => void>();
  constructor(data: SaveData) {
    this.data = copy(data);
  }
  get = () => this.data;
  replace = (d: SaveData) => {
    this.data = repairSave(d);
    this.listeners.forEach((l) => l());
  };
  subscribe = (l: () => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  /** the child plays */
  play(change: Partial<SaveData>) {
    this.data = { ...this.data, ...change };
    this.listeners.forEach((l) => l());
  }
}

class AuthStandIn implements AuthPort {
  session: string | null = null;
  unreachable = false;
  cancel = false;
  failSignIn = false;
  failDelete = false;
  deleted: string[] = [];
  constructor(private table: TableStandIn) {}
  async currentUser() {
    if (this.unreachable) throw new Error('offline');
    return this.session;
  }
  async signIn() {
    if (this.failSignIn) throw new Error('nope');
    if (this.cancel) return null;
    this.session = USER;
    return USER;
  }
  async signOut() {
    this.session = null;
  }
  async deleteAccount() {
    if (this.failDelete || !this.session) throw new Error('nope');
    this.deleted.push(this.session);
    // on delete cascade
    this.table.rows.delete(this.session);
  }
}

function setup({ device = newSave(), store = memoryAccountStore() }: { device?: SaveData; store?: AccountStore } = {}) {
  const clock = new ManualClock();
  const table = new TableStandIn(clock);
  const auth = new AuthStandIn(table);
  const save = new DeviceSave(device);
  const engine = createSyncEngine({ store, remote: table, auth, save, clock });
  const state = () => store.getState();
  /** let timers run, then wait for whatever sync they started */
  const later = async (ms: number) => {
    clock.advance(ms);
    await engine.idle();
  };
  return { clock, table, auth, save, engine, store, state, later };
}

async function signedIn(device: SaveData, cloud?: SaveData) {
  const t = setup({ device });
  if (cloud) t.table.rows.set(USER, { rev: 3, data: copy(cloud), backup: null, at: t.clock.now() });
  await t.engine.start();
  await t.engine.signIn();
  return t;
}

describe('signing in', () => {
  it('stays a guest with no session, and keeps the game exactly as it is', async () => {
    const t = setup({ device: played() });
    await t.engine.start();
    expect(t.state().phase).toBe('signedOut');
    expect(t.state().userId).toBeNull();
    expect(t.save.get()).toEqual(played());
    expect(t.table.reads + t.table.writes).toBe(0);
  });

  it('uploads the device game when the account has none', async () => {
    const t = await signedIn(played());
    expect(t.state()).toMatchObject({ phase: 'signedIn', userId: USER, rev: 1, dirty: false, problem: null });
    expect(t.state().savedAt).toBe(t.clock.now());
    expect(sameSave(t.table.rows.get(USER)!.data, played())).toBe(true);
  });

  it('takes the account game over a fresh device game', async () => {
    const t = await signedIn(career(), played(1500, 12));
    expect(t.state()).toMatchObject({ phase: 'signedIn', rev: 3, dirty: false });
    expect(t.save.get().coins).toBe(1500);
    expect(t.save.get().stats.games).toBe(12);
    expect(t.table.writes).toBe(0);
  });

  it('asks a grown-up when both have real progress, and writes nothing until then', async () => {
    const t = await signedIn(played(900, 6), played(300, 20));
    expect(t.state().phase).toBe('choose');
    expect(t.state().choice).toEqual({ device: { players: 3, coins: 900, games: 6 }, cloud: { players: 3, coins: 300, games: 20 } });
    expect(t.table.writes).toBe(0);
    expect(t.save.get().coins).toBe(900);
    // playing on while the question waits is not written either
    t.save.play({ coins: 950 });
    await t.later(PUSH_DELAY * 3);
    expect(t.table.writes).toBe(0);
  });

  it('keeps this device game when picked, with the account game as the backup', async () => {
    const t = await signedIn(played(900, 6), played(300, 20));
    t.save.play({ coins: 950 });
    await t.engine.choose('device');
    const row = t.table.rows.get(USER)!;
    expect(row.rev).toBe(4);
    expect(row.data.coins).toBe(950);
    expect(row.backup?.stats.games).toBe(20);
    expect(t.state()).toMatchObject({ phase: 'signedIn', rev: 4, dirty: false, choice: null });
  });

  it('uses the saved game when picked, with this device game as the backup', async () => {
    const t = await signedIn(played(900, 6), played(300, 20));
    await t.engine.choose('cloud');
    const row = t.table.rows.get(USER)!;
    expect(row.rev).toBe(4);
    expect(row.data.stats.games).toBe(20);
    expect(row.backup?.coins).toBe(900);
    expect(t.save.get().coins).toBe(300);
    expect(t.save.get().stats.games).toBe(20);
    expect(t.state()).toMatchObject({ phase: 'signedIn', rev: 4, dirty: false, choice: null });
    // taking the account's game is not itself a change to send back
    await t.later(PUSH_DELAY * 2);
    expect(t.table.writes).toBe(1);
  });

  it('leaves the choice open, with nothing changed, when the pick cannot reach the account', async () => {
    const t = await signedIn(played(900, 6), played(300, 20));
    t.table.offline = true;
    await t.engine.choose('cloud');
    expect(t.state()).toMatchObject({ phase: 'choose', problem: 'offline' });
    expect(t.save.get().coins).toBe(900);
    t.table.offline = false;
    await t.engine.choose('device');
    expect(t.state()).toMatchObject({ phase: 'signedIn', problem: null });
    expect(t.table.rows.get(USER)!.data.coins).toBe(900);
  });

  it('goes back to signed out when the sheet is closed, and says so when sign-in fails', async () => {
    const t = setup({ device: played() });
    await t.engine.start();
    t.auth.cancel = true;
    await t.engine.signIn();
    expect(t.state()).toMatchObject({ phase: 'signedOut', problem: null, userId: null });
    t.auth.cancel = false;
    t.auth.failSignIn = true;
    await t.engine.signIn();
    expect(t.state()).toMatchObject({ phase: 'signedOut', problem: 'signIn', userId: null });
    expect(t.save.get()).toEqual(played());
  });
});

describe('while signed in', () => {
  it('writes a burst of changes once, a few seconds after the last', async () => {
    const t = await signedIn(played());
    t.save.play({ coins: 1000 });
    expect(t.state().dirty).toBe(true);
    await t.later(PUSH_DELAY - 1000);
    t.save.play({ coins: 1100 });
    await t.later(PUSH_DELAY - 1000);
    expect(t.table.writes).toBe(1);
    await t.later(1000);
    expect(t.table.writes).toBe(2);
    expect(t.table.rows.get(USER)).toMatchObject({ rev: 2 });
    expect(t.table.rows.get(USER)!.data.coins).toBe(1100);
    expect(t.state()).toMatchObject({ rev: 2, dirty: false });
  });

  it('writes at once when the app goes to the background', async () => {
    const t = await signedIn(played());
    t.save.play({ coins: 1234 });
    await t.engine.flush();
    expect(t.table.rows.get(USER)!.data.coins).toBe(1234);
    expect(t.state().dirty).toBe(false);
  });

  it('keeps the game on the device when offline and writes it once the account is back', async () => {
    const t = await signedIn(played());
    t.table.offline = true;
    t.save.play({ coins: 2000 });
    await t.later(PUSH_DELAY);
    expect(t.state()).toMatchObject({ phase: 'signedIn', problem: 'offline', dirty: true });
    expect(t.save.get().coins).toBe(2000);
    t.table.offline = false;
    await t.later(15_000);
    expect(t.state()).toMatchObject({ problem: null, dirty: false });
    expect(t.table.rows.get(USER)!.data.coins).toBe(2000);
  });

  it('downloads what another device saved when this one has not changed', async () => {
    const t = await signedIn(played());
    t.table.elsewhere(USER, played(5000, 40));
    await t.engine.resume();
    expect(t.save.get().coins).toBe(5000);
    expect(t.state()).toMatchObject({ rev: 2, dirty: false });
  });

  it('notices another device wrote first, and asks instead of writing over it', async () => {
    const t = await signedIn(played(900, 6));
    t.table.elsewhere(USER, played(5000, 40));
    t.save.play({ coins: 950 });
    await t.later(PUSH_DELAY);
    expect(t.state().phase).toBe('choose');
    expect(t.table.rows.get(USER)!.data.coins).toBe(5000);
    expect(t.save.get().coins).toBe(950);
  });

  it('starts over in the account too when the game is started over', async () => {
    const t = await signedIn(played());
    t.save.play(newSave());
    await t.later(PUSH_DELAY);
    expect(sameSave(t.table.rows.get(USER)!.data, newSave())).toBe(true);
  });
});

describe('launching while signed in', () => {
  async function relaunch(store: AccountStore, table: SaveRemote & { rows: TableStandIn['rows'] }, device: SaveData) {
    const t = setup({ device, store });
    t.table.rows = table.rows;
    t.auth.session = USER;
    t.store.setState({ phase: 'starting' });
    await t.engine.start();
    return t;
  }

  it('reads the account first and takes what another device saved', async () => {
    const first = await signedIn(played());
    first.table.elsewhere(USER, played(7000, 50));
    first.engine.stop();
    const t = await relaunch(first.store, first.table, first.save.get());
    expect(t.save.get().coins).toBe(7000);
    expect(t.state()).toMatchObject({ phase: 'signedIn', rev: 2, dirty: false });
  });

  it('sends what was played offline last time', async () => {
    const first = await signedIn(played());
    first.table.offline = true;
    first.save.play({ coins: 4321 });
    await first.later(PUSH_DELAY);
    first.engine.stop();
    first.table.offline = false;
    const t = await relaunch(first.store, first.table, first.save.get());
    expect(t.table.rows.get(USER)!.data.coins).toBe(4321);
    expect(t.state()).toMatchObject({ phase: 'signedIn', dirty: false, problem: null });
  });

  it('keeps playing offline when the account cannot be reached at launch', async () => {
    const first = await signedIn(played());
    first.engine.stop();
    const t = setup({ device: first.save.get(), store: first.store });
    t.auth.unreachable = true;
    await t.engine.start();
    expect(t.state()).toMatchObject({ phase: 'signedIn', userId: USER, problem: 'offline' });
    expect(t.save.get()).toEqual(first.save.get());
  });

  it('carries on as a guest when the session has gone', async () => {
    const first = await signedIn(played());
    first.engine.stop();
    const t = setup({ device: first.save.get(), store: first.store });
    await t.engine.start();
    expect(t.state()).toMatchObject({ phase: 'signedOut', userId: null, rev: null });
    expect(t.save.get()).toEqual(first.save.get());
  });
});

describe('signing out and deleting', () => {
  it('signs out keeping the game on this device, after one last write', async () => {
    const t = await signedIn(played());
    t.save.play({ coins: 3333 });
    await t.engine.signOut();
    expect(t.table.rows.get(USER)!.data.coins).toBe(3333);
    expect(t.state()).toMatchObject({ phase: 'signedOut', userId: null, rev: null, dirty: false });
    expect(t.auth.session).toBeNull();
    expect(t.save.get().coins).toBe(3333);
    // a guest's changes go nowhere
    t.save.play({ coins: 1 });
    await t.later(PUSH_DELAY * 2);
    expect(t.table.rows.get(USER)!.data.coins).toBe(3333);
  });

  it('signs out even when the account cannot be reached', async () => {
    const t = await signedIn(played());
    t.table.offline = true;
    t.save.play({ coins: 3333 });
    await t.engine.signOut();
    expect(t.state()).toMatchObject({ phase: 'signedOut', userId: null });
    expect(t.save.get().coins).toBe(3333);
  });

  it('deletes the account and its save, then plays on locally', async () => {
    const t = await signedIn(played());
    await t.engine.deleteAccount();
    expect(t.auth.deleted).toEqual([USER]);
    expect(t.table.rows.has(USER)).toBe(false);
    expect(t.state()).toMatchObject({ phase: 'signedOut', userId: null, problem: null });
    expect(sameSave(t.save.get(), played())).toBe(true);
  });

  it('stays signed in and says so when deleting fails', async () => {
    const t = await signedIn(played());
    t.auth.failDelete = true;
    await t.engine.deleteAccount();
    expect(t.state()).toMatchObject({ phase: 'signedIn', userId: USER, problem: 'delete' });
    expect(t.table.rows.has(USER)).toBe(true);
  });

  it('carries on as a guest when the session ends by itself', async () => {
    const t = await signedIn(played());
    t.engine.sessionEnded();
    expect(t.state()).toMatchObject({ phase: 'signedOut', userId: null });
    expect(sameSave(t.save.get(), played())).toBe(true);
  });
});
