import * as Linking from 'expo-linking';

import { shareConfig } from '../share/shareConfig';

/**
 * The link that opens the join screen for a code.
 *
 * With EXPO_PUBLIC_INVITE_LINK_HOST set (UNJ-1425), a web link such as
 * https://calledit.app/join/ABCD2345: it opens the app where it is installed
 * (universal links / app links, set up in app.config.ts) and otherwise shows
 * the invite page from `invite-site/`, which sends people to the store.
 *
 * Without it, the app scheme: calledit://join/ABCD2345 in a store build (the
 * scheme is in app.identity.json), an exp:// link in Expo Go.
 */
export function inviteUrl(code: string, host: string | null = shareConfig.inviteHost): string {
  if (host) return `https://${host}/join/${encodeURIComponent(code)}`;
  return Linking.createURL(`/join/${code}`);
}
