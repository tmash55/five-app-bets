/**
 * The account in the app: the store Settings reads, and the one sync engine wired to Supabase, Sign in with
 * Apple and the device save. A build without account settings (see `config.ts`) never starts any of it.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { newSave, repairSave, type SaveData } from '@/state/logic';
import { dataOf, useSave } from '@/state/save';
import { appleSignIn, appleSignInAvailable } from './apple';
import { ACCOUNTS_SET_UP } from './config';
import { createSyncEngine, type AuthPort, type SavePort } from './engine';
import { GATE_FRESH_MS } from './gate';
import { accountClient, deleteAccountRemote, supabaseSaves } from './remote';
import { META_KEYS, initialAccount, type AccountMeta, type AccountState } from './state';

export { ACCOUNTS_SET_UP } from './config';
export type { AccountPhase, AccountProblem, AccountState } from './state';

export const useAccount = create<AccountState>()(
  persist(() => initialAccount(ACCOUNTS_SET_UP), {
    name: 'bucket-squad-account',
    version: 1,
    storage: createJSONStorage(() => AsyncStorage),
    // only who is signed in and how the device save stands; never the session (the account client keeps that)
    partialize: (s) => Object.fromEntries(META_KEYS.map((k) => [k, s[k]])) as AccountMeta,
    merge: (persisted, current) => ({ ...current, ...cleanMeta(persisted) }),
  }),
);

function cleanMeta(raw: unknown): AccountMeta {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof AccountMeta, unknown>>;
  return {
    userId: typeof r.userId === 'string' && r.userId !== '' ? r.userId : null,
    rev: typeof r.rev === 'number' && Number.isInteger(r.rev) && r.rev > 0 ? r.rev : null,
    dirty: r.dirty === true,
    savedAt: typeof r.savedAt === 'number' && Number.isFinite(r.savedAt) ? r.savedAt : null,
  };
}

const SAVE_KEYS = Object.keys(newSave()) as (keyof SaveData)[];

const savePort: SavePort = {
  get: () => dataOf(useSave.getState()),
  replace: (data) => useSave.setState(repairSave(data)),
  subscribe: (onChange) =>
    useSave.subscribe((now, before) => {
      if (SAVE_KEYS.some((k) => now[k] !== before[k])) onChange();
    }),
};

const authPort: AuthPort = {
  async currentUser() {
    const { data, error } = await accountClient().auth.getSession();
    if (error) {
      // offline: the session may still be good once it can be refreshed
      if (isAuthRetryableFetchError(error)) throw error;
      return null;
    }
    return data.session?.user.id ?? null;
  },
  async signIn() {
    const apple = await appleSignIn();
    if (!apple) return null;
    const { data, error } = await accountClient().auth.signInWithIdToken({ provider: 'apple', token: apple.token, nonce: apple.nonce });
    if (error) throw error;
    if (!data.user) throw new Error('No account came back.');
    return data.user.id;
  },
  async signOut() {
    // this device only: other devices signed in to the same account stay signed in
    const { error } = await accountClient().auth.signOut({ scope: 'local' });
    if (error) throw error;
  },
  deleteAccount: deleteAccountRemote,
};

const engine = createSyncEngine({ store: useAccount, remote: supabaseSaves, auth: authPort, save: savePort });

function accountHydrated(): Promise<void> {
  if (useAccount.persist.hasHydrated()) return Promise.resolve();
  return new Promise((done) => {
    const off = useAccount.persist.onFinishHydration(() => {
      off();
      done();
    });
  });
}

let started = false;

/** Start the account once the device save has been read. Does nothing in a build without accounts. */
export function startAccount(): void {
  if (!ACCOUNTS_SET_UP || started) return;
  started = true;
  void (async () => {
    await accountHydrated();
    useAccount.setState({ appleAvailable: await appleSignInAvailable() });
    const auth = accountClient().auth;
    // the session only refreshes itself while the app is in front (as Supabase asks for React Native)
    if (AppState.currentState === 'active') auth.startAutoRefresh();
    AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        auth.startAutoRefresh();
        void engine.resume();
      } else {
        auth.stopAutoRefresh();
        if (state === 'background') void engine.flush();
      }
    });
    auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') engine.sessionEnded();
    });
    await engine.start();
  })();
}

/** True when a grown-up passed the check a moment ago. */
export function gateFresh(passedAt: number, now = Date.now()): boolean {
  return passedAt > 0 && now - passedAt < GATE_FRESH_MS;
}

/** What Settings and the choice pop-up can do. */
export const account = {
  signIn: () => engine.signIn(),
  signOut: () => engine.signOut(),
  deleteAccount: () => engine.deleteAccount(),
  choose: (keep: 'device' | 'cloud') => engine.choose(keep),
  hideChoice: () => useAccount.setState({ choiceHidden: true }),
  showChoice: () => useAccount.setState({ choiceHidden: false }),
  passGate: () => useAccount.setState({ gatePassedAt: Date.now() }),
};
