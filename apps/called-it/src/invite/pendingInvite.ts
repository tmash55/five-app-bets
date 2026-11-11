import AsyncStorage from '@react-native-async-storage/async-storage';

import { looksLikeInviteCode, normalizeInviteCode } from '../compete/standings';

const KEY = 'called-it.pending-invite';

/**
 * The invite code from a link opened while signed out (UNJ-1424). It is kept
 * until the player signs in or up, then the join screen opens with it.
 */
export async function savePendingInvite(code: string): Promise<void> {
  if (!looksLikeInviteCode(code)) return;
  try {
    await AsyncStorage.setItem(KEY, normalizeInviteCode(code));
  } catch {
    // Losing it only means the player opens the link again.
  }
}

/** Returns the saved code once and clears it. */
export async function takePendingInvite(): Promise<string | null> {
  try {
    const code = await AsyncStorage.getItem(KEY);
    if (code) await AsyncStorage.removeItem(KEY);
    return code;
  } catch {
    return null;
  }
}

/** The invite code in a link path such as "/join/ABCD2345" or "calledit://join/ABCD2345". */
export function inviteCodeFromPath(path: string): string | null {
  const match = /(?:^|\/)join\/([A-Za-z0-9-]+)\/?(?:[?#].*)?$/.exec(path);
  if (!match) return null;
  return looksLikeInviteCode(match[1]) ? normalizeInviteCode(match[1]) : null;
}
