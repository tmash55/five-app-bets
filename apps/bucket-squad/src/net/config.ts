/**
 * Which wire two devices play over.
 *
 * - A build with the Supabase project set up (`EXPO_PUBLIC_SUPABASE_URL` and `..._PUBLISHABLE_KEY`) uses Supabase
 *   Realtime. Nothing else is needed: no tables, no accounts.
 * - Development can use the local relay instead (`node tools/relay/relay.js`): set `EXPO_PUBLIC_NET=relay` (and
 *   `EXPO_PUBLIC_NET_RELAY=ws://host:8787` when it is not on this machine), or in the browser add `?net=relay`
 *   (or `?net=relay:ws://host:8787`) to the page's address. `?net=supabase` picks Supabase in the browser.
 * - A development build with neither uses the relay on this machine; a release build with neither has no online play.
 */

import { Platform } from 'react-native';

import { ACCOUNT_KEY, ACCOUNT_URL, ACCOUNTS_SET_UP } from '@/account/config';
import { supabaseRealtime, supabaseTransport, type RealtimeLike } from './supabaseTransport';
import type { Transport } from './transport';
import { wsTransport } from './wsTransport';

export type NetKind = 'supabase' | 'relay';

export interface NetChoice {
  kind: NetKind;
  /** the relay's address, for `relay` */
  relay: string;
}

const ENV_NET = (process.env.EXPO_PUBLIC_NET ?? '').trim();
const ENV_RELAY = (process.env.EXPO_PUBLIC_NET_RELAY ?? '').trim();
export const RELAY_PORT = 8787;

function defaultRelay(): string {
  if (ENV_RELAY !== '') return ENV_RELAY;
  const host = Platform.OS === 'web' && typeof location !== 'undefined' && location.hostname ? location.hostname : 'localhost';
  return `ws://${host}:${RELAY_PORT}`;
}

/** `?net=...` on the page's address, in a development build in the browser */
function fromAddress(): string | null {
  if (!__DEV__ || Platform.OS !== 'web' || typeof location === 'undefined') return null;
  return new URLSearchParams(location.search).get('net');
}

/** Read a choice as written in `EXPO_PUBLIC_NET` or `?net=`: `supabase`, `relay` or `relay:ws://host:port`. */
export function parseNet(text: string | null, fallbackRelay: string): NetChoice | null {
  if (!text) return null;
  if (text === 'supabase') return { kind: 'supabase', relay: fallbackRelay };
  if (text === 'relay') return { kind: 'relay', relay: fallbackRelay };
  if (text.startsWith('relay:')) return { kind: 'relay', relay: text.slice('relay:'.length) };
  return null;
}

export function netChoice(): NetChoice | null {
  const relay = defaultRelay();
  const asked = parseNet(fromAddress(), relay) ?? parseNet(ENV_NET, relay);
  if (asked && (asked.kind === 'relay' || ACCOUNTS_SET_UP)) return asked;
  if (ACCOUNTS_SET_UP) return { kind: 'supabase', relay };
  return __DEV__ ? { kind: 'relay', relay } : null;
}

let realtime: RealtimeLike | null = null;

/** The wire this build plays over, or null when it has none. */
export function makeTransport(choice: NetChoice | null = netChoice()): Transport | null {
  if (!choice) return null;
  if (choice.kind === 'relay') return wsTransport(choice.relay);
  return supabaseTransport(() => {
    realtime ??= supabaseRealtime(ACCOUNT_URL, ACCOUNT_KEY);
    return realtime;
  });
}
