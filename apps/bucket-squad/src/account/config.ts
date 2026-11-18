/**
 * Where the account lives. Both values come from the build's environment (see `.env.example`):
 * a build without them has no accounts at all and the game is exactly the guest game.
 *
 * `process.env.EXPO_PUBLIC_*` must be written out in full: Expo copies the values into the
 * build by finding these exact expressions.
 */

export const ACCOUNT_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
/** the project's publishable key (safe to ship in an app; the table's row level security does the guarding) */
export const ACCOUNT_KEY = (process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim();

/** true when this build was made with an account project to talk to */
export const ACCOUNTS_SET_UP = /^https:\/\/\S+$/.test(ACCOUNT_URL) && ACCOUNT_KEY !== '';

/** the save table, prefixed because the project is shared with other apps */
export const SAVES_TABLE = 'bucket_squad_saves';

/** the edge function that deletes the signed-in account (and with it, by cascade, the save) */
export const DELETE_ACCOUNT_FUNCTION = 'delete-account';
