/**
 * The rules for keeping the device's save and the account's save in step, as plain functions.
 * `engine.ts` does the talking to the account; everything it decides comes from here.
 *
 * The words used throughout:
 * - the device save: the game on this phone (`useSave`), which always works with or without an account;
 * - the cloud save: the row in the account, with a `rev` that goes up by one on every write;
 * - `base`: the cloud rev the device save last matched (null before the first sync on this device);
 * - `dirty`: the device save has changed since then.
 */

import { STARTING_COINS, SQUAD_SIZE, repairSave, type SaveData } from '@/state/logic';

/** What a grown-up is shown to tell two saves apart. */
export interface Progress {
  /** different players found */
  players: number;
  coins: number;
  /** games played */
  games: number;
}

export function progressOf(s: SaveData): Progress {
  return { players: playersFound(s), coins: s.coins, games: s.stats.games };
}

function playersFound(s: SaveData): number {
  return Object.values(s.owned).filter((n) => n > 0).length;
}

/**
 * True when a save holds nothing anyone would miss: never started, or started and not played yet
 * (the three starters, the starting coins and the packs a new career is handed).
 */
export function isFresh(s: SaveData): boolean {
  const players = playersFound(s);
  if (!s.onboarded) return players === 0 && s.coins === 0 && s.stats.games === 0 && s.stats.packs === 0;
  return s.stats.games === 0 && s.stats.packs === 0 && s.ladder.games === 0 && s.uniforms.length === 0 && players <= SQUAD_SIZE && s.coins <= STARTING_COINS;
}

/** JSON with every object's keys in order, so two saves that hold the same things compare equal. */
export function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? 'null' : stableJson(x))).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** True when two saves hold the same game. */
export function sameSave(a: SaveData, b: SaveData): boolean {
  return stableJson(repairSave(a)) === stableJson(repairSave(b));
}

/** The cloud save as the app reads it. `data` is already repaired. */
export interface CloudSave {
  rev: number;
  data: SaveData;
  /** when it was last written, in ms (null when unknown) */
  at: number | null;
}

/** A row of the save table as it comes over the network. */
export interface SaveRow {
  rev: number | string;
  data: unknown;
  updated_at: string | null;
}

/** A row from the account, read the way the device reads its own save: through `repairSave`, so nothing bad gets in. */
export function cloudFromRow(row: SaveRow): CloudSave {
  const at = row.updated_at ? Date.parse(row.updated_at) : NaN;
  return { rev: Number(row.rev), data: repairSave(row.data), at: Number.isFinite(at) ? at : null };
}

export type SyncPlan =
  /** write the device save to the account over cloud rev `base` (null: the account has no save yet) */
  | { kind: 'upload'; base: number | null }
  /** replace the device save with the cloud save */
  | { kind: 'download' }
  /** they already match: just remember the cloud rev */
  | { kind: 'match' }
  /** both hold progress the other lacks: a grown-up chooses */
  | { kind: 'ask' };

/**
 * What to do once the cloud save has been read. Never throws progress away without asking:
 * - no cloud save yet: upload the device save;
 * - the cloud has not moved since this device last synced: upload if the device changed, else nothing;
 * - the cloud moved and the device did not change since its last sync: download;
 * - otherwise (first sync on this device, or both changed): download over a fresh device save,
 *   upload over a fresh cloud save, and ask when both hold real progress.
 */
export function planSync({ local, dirty, base, remote }: { local: SaveData; dirty: boolean; base: number | null; remote: CloudSave | null }): SyncPlan {
  if (!remote) return { kind: 'upload', base: null };
  if (base === remote.rev) return dirty ? { kind: 'upload', base } : { kind: 'match' };
  if (sameSave(local, remote.data)) return { kind: 'match' };
  if (base !== null && !dirty) return { kind: 'download' };
  if (isFresh(local)) return { kind: 'download' };
  if (isFresh(remote.data)) return { kind: 'upload', base: remote.rev };
  return { kind: 'ask' };
}

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", "Nov 2": when the account last had the game. */
export function savedAgo(at: number, now: number): string {
  const minutes = Math.floor(Math.max(0, now - at) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  if (hours < 48) return 'yesterday';
  return `on ${new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

/** How long to wait before trying the account again after the n-th failure in a row (from 1). */
export function retryDelay(failures: number): number {
  const steps = [15_000, 60_000, 5 * 60_000];
  return steps[Math.min(steps.length, Math.max(1, failures)) - 1];
}

/** How long after the last change to the game the account is written (so a burst of changes is one write). */
export const PUSH_DELAY = 4000;
