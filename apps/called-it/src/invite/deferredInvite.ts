import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Clipboard from 'expo-clipboard';
import { Platform } from 'react-native';

import { looksLikeInviteCode, normalizeInviteCode } from '../compete/standings';
import { inviteCodeFromPath, savePendingInvite } from './pendingInvite';

/**
 * Invites for people who did not have the app when they opened the link
 * (UNJ-1425). The invite page (invite-site/) hands the code over in two ways:
 *
 * - Android: the Play Store link carries `referrer=invite%3DCODE`, which the
 *   Play Store passes to the app on its first launch (the install referrer).
 * - iOS has no such channel, so the page copies the invite link when the
 *   player taps "Get Called It". After sign-up the app offers to paste it
 *   (the system paste button, so iOS shows no permission prompt).
 */

const REFERRER_CHECKED_KEY = 'called-it.install-referrer-checked';
const CLIPBOARD_OFFERED_KEY = 'called-it.clipboard-invite-offered';

/** The invite code in a Play install referrer such as "invite=ABCD2345&utm_source=…". */
export function inviteCodeFromReferrer(referrer: string): string | null {
  for (const part of referrer.split('&')) {
    const [key, value] = part.split('=');
    if (key !== 'invite' || !value) continue;
    let code: string;
    try {
      code = decodeURIComponent(value);
    } catch {
      return null;
    }
    return looksLikeInviteCode(code) ? normalizeInviteCode(code) : null;
  }
  return null;
}

/** The invite code in pasted text: an invite link, or a bare code. */
export function inviteCodeFromPaste(text: string): string | null {
  const trimmed = text.trim();
  if (looksLikeInviteCode(trimmed)) return normalizeInviteCode(trimmed);
  const url = /\S*join\/[A-Za-z0-9-]+\S*/.exec(trimmed)?.[0];
  return url ? inviteCodeFromPath(url) : null;
}

/**
 * Android, once per install: save the invite from the install referrer so the
 * join screen opens after sign-up, like a link opened while signed out.
 */
export async function captureInstallReferrer(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    if (await AsyncStorage.getItem(REFERRER_CHECKED_KEY)) return;
    await AsyncStorage.setItem(REFERRER_CHECKED_KEY, '1');
    const code = inviteCodeFromReferrer(await Application.getInstallReferrerAsync());
    if (code) await savePendingInvite(code);
  } catch {
    // No referrer (sideloaded, or Play services missing): nothing to join.
  }
}

/**
 * iOS, once per install, after sign-up with no invite already handled: is
 * there a link on the clipboard worth offering to paste? Reading whether the
 * clipboard holds a URL does not read its contents, so it shows no prompt.
 */
export async function shouldOfferClipboardInvite(): Promise<boolean> {
  if (Platform.OS !== 'ios' || !Clipboard.isPasteButtonAvailable) return false;
  try {
    if (await AsyncStorage.getItem(CLIPBOARD_OFFERED_KEY)) return false;
    await AsyncStorage.setItem(CLIPBOARD_OFFERED_KEY, '1');
    return await Clipboard.hasUrlAsync();
  } catch {
    return false;
  }
}
