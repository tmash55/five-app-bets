/**
 * Keeps the device's save and the account's save in step. The rules come from `sync.ts`; this file runs
 * them against the account (a `SaveRemote`), the sign-in (an `AuthPort`) and the device save (a `SavePort`),
 * so the same engine runs in the app and, with stand-ins, in the tests.
 *
 * - After sign-in and at every launch and return to the app, the account is read first, then `planSync` decides.
 * - A change to the game is written a few seconds later (one write for a burst of changes), and at once when
 *   the app goes to the background. Every write names the rev it expects; if the account has moved, it is read
 *   again and the rules run again.
 * - Offline nothing is lost: the device save is the game, `dirty` remembers it is newer, and it is tried later.
 */

import type { SaveData } from '@/state/logic';
import type { SaveRemote } from './remote';
import type { AccountMeta, AccountStore } from './state';
import { PUSH_DELAY, planSync, progressOf, retryDelay, type CloudSave } from './sync';

/** Signing in and out. */
export interface AuthPort {
  /** the account signed in on this device, or null; throws when it cannot tell (offline with an old session) */
  currentUser(): Promise<string | null>;
  /** sign in (Apple's sheet): the account, or null when the grown-up closed the sheet; throws when it failed */
  signIn(): Promise<string | null>;
  /** forget the session on this device */
  signOut(): Promise<void>;
  /** delete the signed-in account and its save; throws when that did not happen */
  deleteAccount(): Promise<void>;
}

/** The game on this device. */
export interface SavePort {
  get(): SaveData;
  /** put a save in place of the device's (from the account) */
  replace(data: SaveData): void;
  /** called whenever the game changes */
  subscribe(onChange: () => void): () => void;
}

export interface Clock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const realClock: Clock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** how many times one sync reads again after finding the account has moved, before waiting for later */
const MAX_ROUNDS = 3;
/** how long a sign-out waits for the last write before going ahead without it */
const SIGN_OUT_WAIT = 5000;

const SIGNED_OUT_META: AccountMeta = { userId: null, rev: null, dirty: false, savedAt: null };

export interface SyncEngine {
  /** look for a signed-in account and bring the saves together (once, after the device save is loaded) */
  start(): Promise<void>;
  signIn(): Promise<void>;
  signOut(): Promise<void>;
  deleteAccount(): Promise<void>;
  /** the grown-up's pick between this device's game and the account's */
  choose(keep: 'device' | 'cloud'): Promise<void>;
  /** the app came back to the front: read the account again */
  resume(): Promise<void>;
  /** the app is going to the background: write now rather than in a few seconds */
  flush(): Promise<void>;
  /** the session ended without us (it ran out, or was revoked): carry on as a guest with the game as it is */
  sessionEnded(): void;
  /** wait for any sync that is running (tests) */
  idle(): Promise<void>;
  stop(): void;
}

export function createSyncEngine({ store, remote, auth, save, clock = realClock }: { store: AccountStore; remote: SaveRemote; auth: AuthPort; save: SavePort; clock?: Clock }): SyncEngine {
  const get = () => store.getState();
  const set = (patch: Partial<ReturnType<AccountStore['getState']>>) => store.setState(patch);

  let started = false;
  let unsubscribe: (() => void) | null = null;
  /** counts every change to the device save, so a write knows whether more came in while it was on its way */
  let changes = 0;
  /** true while the engine itself is replacing the device save */
  let applying = false;
  /** the account's save while a grown-up is choosing */
  let pending: CloudSave | null = null;
  /** the next sync reads the account before writing */
  let mustRead = true;
  let pushTimer: unknown = null;
  let retryTimer: unknown = null;
  let failures = 0;
  let running: Promise<void> | null = null;
  let again = false;

  const clearTimers = () => {
    if (pushTimer !== null) clock.clearTimeout(pushTimer);
    if (retryTimer !== null) clock.clearTimeout(retryTimer);
    pushTimer = retryTimer = null;
  };

  const onLocalChange = () => {
    if (applying) return;
    changes++;
    if (!get().userId) return;
    if (!get().dirty) set({ dirty: true });
    if (get().phase === 'signedIn') schedulePush(PUSH_DELAY);
  };

  function schedulePush(ms: number) {
    if (pushTimer !== null) clock.clearTimeout(pushTimer);
    pushTimer = clock.setTimeout(() => {
      pushTimer = null;
      void run();
    }, ms);
  }

  function scheduleRetry() {
    if (retryTimer !== null) clock.clearTimeout(retryTimer);
    retryTimer = clock.setTimeout(() => {
      retryTimer = null;
      mustRead = true;
      void run();
    }, retryDelay(failures));
  }

  function apply(data: SaveData) {
    applying = true;
    try {
      save.replace(data);
    } finally {
      applying = false;
    }
  }

  /** One sync at a time: asking while one runs makes it go round once more when it ends. */
  function run(): Promise<void> {
    if (running) {
      again = true;
      return running;
    }
    running = (async () => {
      try {
        do {
          again = false;
          await syncOnce();
        } while (again);
      } finally {
        running = null;
      }
    })();
    return running;
  }

  /** a write that worked */
  function written(rev: number, mark: number) {
    failures = 0;
    const dirty = changes !== mark;
    set({ rev, dirty, savedAt: clock.now(), phase: 'signedIn', problem: null });
    if (dirty) schedulePush(PUSH_DELAY);
  }

  async function syncOnce(): Promise<void> {
    const userId = get().userId;
    const phase = get().phase;
    if (!userId || (phase !== 'signedIn' && phase !== 'syncing')) return;
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        if (get().userId !== userId) return;
        const { rev: base, dirty } = get();

        // the usual case: this device changed and the account has not moved: write straight over it
        if (!mustRead && base !== null && dirty) {
          const mark = changes;
          const rev = await remote.update(userId, base, save.get());
          if (get().userId !== userId) return;
          if (rev !== 'conflict') return written(rev, mark);
          mustRead = true;
          continue;
        }
        if (!mustRead && !dirty) return;

        const mark = changes;
        const cloud = await remote.read(userId);
        if (get().userId !== userId) return;
        // the game changed while the account was being read: read again so the plan sees the newest game
        if (changes !== mark) {
          if (!get().dirty) set({ dirty: true });
          continue;
        }
        const local = save.get();
        const plan = planSync({ local, dirty: get().dirty, base, remote: cloud });
        mustRead = false;

        if (plan.kind === 'match') {
          failures = 0;
          set({ rev: cloud!.rev, dirty: false, savedAt: cloud!.at ?? get().savedAt ?? clock.now(), phase: 'signedIn', problem: null });
          return;
        }
        if (plan.kind === 'download') {
          apply(cloud!.data);
          failures = 0;
          set({ rev: cloud!.rev, dirty: false, savedAt: cloud!.at ?? clock.now(), phase: 'signedIn', problem: null });
          return;
        }
        if (plan.kind === 'upload') {
          const rev = plan.base === null ? await remote.create(userId, local) : await remote.update(userId, plan.base, local);
          if (get().userId !== userId) return;
          if (rev !== 'conflict') return written(rev, mark);
          mustRead = true;
          continue;
        }
        // both hold real progress: nothing is written until a grown-up picks
        pending = cloud;
        failures = 0;
        set({ phase: 'choose', choice: { device: progressOf(local), cloud: progressOf(cloud!.data) }, choiceHidden: false, problem: null });
        return;
      }
      // the account kept moving under us: leave it for a moment
      mustRead = true;
      scheduleRetry();
    } catch {
      if (get().userId !== userId) return;
      failures++;
      mustRead = true;
      set({ phase: get().phase === 'syncing' ? 'signedIn' : get().phase, problem: 'offline' });
      scheduleRetry();
    }
  }

  const engine: SyncEngine = {
    async start() {
      if (started) return;
      started = true;
      unsubscribe = save.subscribe(onLocalChange);
      const known = get().userId;
      let userId: string | null;
      try {
        userId = await auth.currentUser();
      } catch {
        // cannot tell right now (offline with a session that needs refreshing): keep what we knew and try later
        if (known) {
          failures++;
          set({ phase: 'signedIn', problem: 'offline' });
          scheduleRetry();
        } else set({ phase: 'signedOut' });
        return;
      }
      if (!userId) {
        set({ ...SIGNED_OUT_META, phase: 'signedOut' });
        return;
      }
      // a session for an account this device's save was never matched with: treat it as a first sign-in
      if (userId !== known) set({ ...SIGNED_OUT_META, userId, dirty: true });
      set({ phase: 'syncing', problem: null });
      mustRead = true;
      await run();
    },

    async signIn() {
      if (get().phase !== 'signedOut') return;
      set({ phase: 'signingIn', problem: null });
      let userId: string | null;
      try {
        userId = await auth.signIn();
      } catch {
        set({ phase: 'signedOut', problem: 'signIn' });
        return;
      }
      if (!userId) {
        set({ phase: 'signedOut' });
        return;
      }
      // this device's game has never been in this account
      set({ ...SIGNED_OUT_META, userId, dirty: true, phase: 'syncing' });
      failures = 0;
      mustRead = true;
      await run();
    },

    async signOut() {
      if (!get().userId) return;
      // one last try to put the newest game in the account; the game stays on the device either way
      if (get().dirty && get().phase === 'signedIn') {
        if (pushTimer !== null) clock.clearTimeout(pushTimer);
        pushTimer = null;
        let timer: unknown = null;
        await Promise.race([run(), new Promise<void>((done) => (timer = clock.setTimeout(done, SIGN_OUT_WAIT)))]);
        clock.clearTimeout(timer);
      }
      clearTimers();
      pending = null;
      try {
        await auth.signOut();
      } catch {
        // the session on this device is dropped either way
      }
      set({ ...SIGNED_OUT_META, phase: 'signedOut', choice: null, choiceHidden: false, problem: null });
    },

    async deleteAccount() {
      const phase = get().phase;
      if (!get().userId || phase === 'deleting') return;
      set({ phase: 'deleting', problem: null });
      clearTimers();
      try {
        await auth.deleteAccount();
      } catch {
        set({ phase, problem: 'delete' });
        if (phase === 'signedIn' && get().dirty) schedulePush(PUSH_DELAY);
        return;
      }
      pending = null;
      try {
        await auth.signOut();
      } catch {
        // the account is gone; the session left on the device is useless anyway
      }
      // the game carries on, on this device only
      set({ ...SIGNED_OUT_META, phase: 'signedOut', choice: null, choiceHidden: false, problem: null });
    },

    async choose(keep) {
      const userId = get().userId;
      const cloud = pending;
      if (!userId || !cloud || get().phase !== 'choose') return;
      set({ phase: 'syncing', problem: null });
      try {
        const mark = changes;
        // the game that loses is kept in the account's backup, never just dropped
        const rev = keep === 'device' ? await remote.update(userId, cloud.rev, save.get(), cloud.data) : await remote.update(userId, cloud.rev, null, save.get());
        if (get().userId !== userId) return;
        pending = null;
        set({ choice: null, choiceHidden: false });
        if (rev === 'conflict') {
          // another device wrote meanwhile: start again from what the account holds now
          mustRead = true;
          set({ phase: 'signedIn' });
          await run();
          return;
        }
        if (keep === 'cloud') {
          apply(cloud.data);
          failures = 0;
          set({ rev, dirty: false, savedAt: clock.now(), phase: 'signedIn', problem: null });
        } else written(rev, mark);
      } catch {
        if (get().userId !== userId) return;
        // nothing changed anywhere: the choice is still open
        set({ phase: 'choose', problem: 'offline' });
      }
    },

    async resume() {
      if (!started || !get().userId) return;
      const phase = get().phase;
      if (phase !== 'signedIn' && phase !== 'syncing') return;
      mustRead = true;
      await run();
    },

    async flush() {
      if (!get().userId || get().phase !== 'signedIn' || !get().dirty) return;
      if (pushTimer !== null) clock.clearTimeout(pushTimer);
      pushTimer = null;
      await run();
    },

    sessionEnded() {
      if (!get().userId || get().phase === 'deleting') return;
      clearTimers();
      pending = null;
      set({ ...SIGNED_OUT_META, phase: 'signedOut', choice: null, choiceHidden: false });
    },

    async idle() {
      while (running) await running;
    },

    stop() {
      clearTimers();
      unsubscribe?.();
      unsubscribe = null;
    },
  };
  return engine;
}
