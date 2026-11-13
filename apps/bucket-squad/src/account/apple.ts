/**
 * Sign in with Apple, on the device itself (iPhone and iPad only).
 *
 * Apple is handed the SHA-256 of a one-time random string and puts it in the token it signs; the account
 * service is handed the string itself and checks the two match, so a token cannot be replayed.
 */

import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

/** True where the system's Sign in with Apple sheet exists (iOS). Never throws. */
export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/** what the account service needs: Apple's signed token and the nonce whose hash is inside it */
export interface AppleToken {
  token: string;
  nonce: string;
}

/** a random string for one sign-in */
function makeNonce(): string {
  return Array.from(Crypto.getRandomBytes(32), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Shows Apple's sheet. Gives null when the grown-up closed it. Asks only for the email scope, which the
 * account service needs to create the account (Apple lets the person hide their real address); never the name.
 */
export async function appleSignIn(): Promise<AppleToken | null> {
  const nonce = makeNonce();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce: hashed,
    });
    if (!credential.identityToken) throw new Error('Apple gave no token.');
    return { token: credential.identityToken, nonce };
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null;
    throw e;
  }
}
