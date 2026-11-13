/**
 * The account, over the network: the Supabase client, the save row and account deletion.
 * Every call either answers or throws; a throw means "could not reach the account" and the engine tries later.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { SAVE_VERSION, type SaveData } from '@/state/logic';
import { ACCOUNT_KEY, ACCOUNT_URL, ACCOUNTS_SET_UP, DELETE_ACCOUNT_FUNCTION, SAVES_TABLE } from './config';
import { cloudFromRow, type CloudSave, type SaveRow } from './sync';

/** What the sync engine needs from the account. The app has one, backed by Supabase; tests use their own. */
export interface SaveRemote {
  /** the account's save, or null when it has none */
  read(userId: string): Promise<CloudSave | null>;
  /** create the account's save at rev 1, or 'conflict' when one already exists */
  create(userId: string, data: SaveData): Promise<number | 'conflict'>;
  /**
   * Write over cloud rev `base`, giving the new rev, or 'conflict' when the cloud is no longer at `base`.
   * `data` null leaves the save as it is (used to store only a backup); `backup` is the copy that lost a choice.
   */
  update(userId: string, base: number, data: SaveData | null, backup?: SaveData): Promise<number | 'conflict'>;
}

let client: SupabaseClient | null = null;

/** The one Supabase client, made on first use (never in a build without accounts). */
export function accountClient(): SupabaseClient {
  if (!ACCOUNTS_SET_UP) throw new Error('Accounts are not set up in this build.');
  if (!client) {
    client = createClient(ACCOUNT_URL, ACCOUNT_KEY, {
      auth: {
        // the session sits beside the save, in the same storage the save uses
        storage: AsyncStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}

/** the platform, never the device's name */
const DEVICE = Platform.OS;

/** the Postgres code for "that row already exists" */
const UNIQUE_VIOLATION = '23505';

export const supabaseSaves: SaveRemote = {
  async read(userId) {
    const { data, error } = await accountClient().from(SAVES_TABLE).select('rev, data, updated_at').eq('user_id', userId).maybeSingle<SaveRow>();
    if (error) throw error;
    return data ? cloudFromRow(data) : null;
  },
  async create(userId, save) {
    const { data, error } = await accountClient().from(SAVES_TABLE).insert({ user_id: userId, data: save, schema_version: SAVE_VERSION, rev: 1, device: DEVICE }).select('rev').single<{ rev: number | string }>();
    if (error?.code === UNIQUE_VIOLATION) return 'conflict';
    if (error) throw error;
    return Number(data.rev);
  },
  async update(userId, base, save, backup) {
    const changes: Record<string, unknown> = { rev: base + 1, device: DEVICE };
    if (save) {
      changes.data = save;
      changes.schema_version = SAVE_VERSION;
    }
    if (backup) changes.backup = backup;
    const { data, error } = await accountClient().from(SAVES_TABLE).update(changes).eq('user_id', userId).eq('rev', base).select('rev');
    if (error) throw error;
    // no row matched: someone else wrote first (or the row is gone)
    if (!data || data.length === 0) return 'conflict';
    return Number((data[0] as { rev: number | string }).rev);
  },
};

/** Delete the signed-in account; the save row goes with it. Throws when that did not happen. */
export async function deleteAccountRemote(): Promise<void> {
  const { error } = await accountClient().functions.invoke(DELETE_ACCOUNT_FUNCTION, { method: 'POST' });
  if (error) throw error;
}
