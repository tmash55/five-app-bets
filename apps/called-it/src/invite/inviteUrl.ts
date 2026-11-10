import * as Linking from 'expo-linking';

/**
 * The link that opens the join screen for a code: calledit://join/ABCD2345 in
 * a store build (the scheme is in app.identity.json), an exp:// link in Expo Go.
 * A web link that also works without the app installed needs a domain (see README).
 */
export function inviteUrl(code: string): string {
  return Linking.createURL(`/join/${code}`);
}
