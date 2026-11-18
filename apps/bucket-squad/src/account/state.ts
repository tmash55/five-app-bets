/** What the account part of the game knows and shows. The engine writes it; Settings and the choice pop-up read it. */

import { createStore, type StoreApi } from 'zustand/vanilla';

import type { Progress } from './sync';

export type AccountPhase =
  /** this build has no account project: the game is the guest game and nothing else */
  | 'off'
  /** looking for a signed-in account kept on the device */
  | 'starting'
  | 'signedOut'
  /** Apple's sheet is up, or the account service is checking Apple's answer */
  | 'signingIn'
  /** reading the account and bringing the two saves together */
  | 'syncing'
  | 'signedIn'
  /** both this device and the account hold a game: a grown-up picks one */
  | 'choose'
  | 'deleting';

/** what went wrong, in a form Settings can put in plain words */
export type AccountProblem =
  /** the account could not be reached (it will be tried again) */
  | 'offline'
  /** signing in did not work */
  | 'signIn'
  /** the account could not be deleted */
  | 'delete';

export interface AccountState {
  phase: AccountPhase;
  problem: AccountProblem | null;
  // remembered on the device (see META_KEYS)
  /** the signed-in account, or null for a guest */
  userId: string | null;
  /** the account's save version this device's save last matched */
  rev: number | null;
  /** this device's save has changed since then */
  dirty: boolean;
  /** when the account last had this game, in ms */
  savedAt: number | null;
  // for this run only
  /** the two games a grown-up is choosing between */
  choice: { device: Progress; cloud: Progress } | null;
  /** the choice was put off ("not now"): Settings offers it again */
  choiceHidden: boolean;
  /** this device has Sign in with Apple */
  appleAvailable: boolean;
  /** when a grown-up last passed the check, in ms (0: not this run) */
  gatePassedAt: number;
}

/** the parts kept on the device between runs */
export const META_KEYS = ['userId', 'rev', 'dirty', 'savedAt'] as const satisfies readonly (keyof AccountState)[];

export type AccountMeta = Pick<AccountState, (typeof META_KEYS)[number]>;

export function initialAccount(setUp: boolean): AccountState {
  return {
    phase: setUp ? 'starting' : 'off',
    problem: null,
    userId: null,
    rev: null,
    dirty: false,
    savedAt: null,
    choice: null,
    choiceHidden: false,
    appleAvailable: false,
    gatePassedAt: 0,
  };
}

export type AccountStore = StoreApi<AccountState>;

/** A store that lives in memory only (tests, and anything that needs no memory between runs). */
export function memoryAccountStore(setUp = true): AccountStore {
  return createStore<AccountState>()(() => initialAccount(setUp));
}
