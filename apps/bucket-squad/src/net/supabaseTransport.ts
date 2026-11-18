/**
 * Rooms over Supabase Realtime: one public broadcast channel per room code, with presence to see who is in it.
 * Nothing is stored and nobody signs in: the realtime client is made with the project's publishable key only, so
 * no account token ever rides along. The channel carries what the room sends and nothing more.
 */

import { RealtimeClient } from '@supabase/supabase-js';

import type { Peer, RoomLink, Transport } from './transport';

/** The few channel calls a room needs, so tests can stand a fake channel in for the real one. */
export interface ChannelLike {
  onBroadcast(event: string, fn: (payload: unknown) => void): void;
  onPresenceSync(fn: () => void): void;
  /** `fn` hears 'SUBSCRIBED', 'TIMED_OUT', 'CLOSED' or 'CHANNEL_ERROR' */
  subscribe(fn: (status: string) => void): void;
  presence(): Record<string, unknown[]>;
  track(meta: Record<string, string>): Promise<unknown>;
  broadcast(event: string, payload: unknown): Promise<unknown>;
  remove(): void;
}

export interface RealtimeLike {
  channel(topic: string, presenceKey: string): ChannelLike;
}

/** the channel's name: prefixed, because the project is shared with other apps */
export function roomTopic(code: string): string {
  return `bucket-squad-room-${code}`;
}

const EVENT = 'm';
const JOIN_MS = 10000;

/** The real thing: a realtime client on the project's URL with its publishable key. */
export function supabaseRealtime(url: string, key: string): RealtimeLike {
  const endpoint = new URL('realtime/v1', url.endsWith('/') ? url : `${url}/`);
  endpoint.protocol = endpoint.protocol.replace('http', 'ws');
  const client = new RealtimeClient(endpoint.href, { params: { apikey: key } });
  return {
    channel(topic, presenceKey) {
      const ch = client.channel(topic, { config: { broadcast: { self: false, ack: false }, presence: { key: presenceKey }, private: false } });
      return {
        onBroadcast: (event, fn) => {
          ch.on('broadcast', { event }, (msg: { payload?: unknown }) => fn(msg.payload));
        },
        onPresenceSync: (fn) => {
          ch.on('presence', { event: 'sync' }, fn);
        },
        subscribe: (fn) => {
          ch.subscribe((status) => fn(status));
        },
        presence: () => ch.presenceState() as Record<string, unknown[]>,
        track: (meta) => ch.track(meta),
        broadcast: (event, payload) => ch.send({ type: 'broadcast', event, payload }),
        remove: () => {
          client.removeChannel(ch).catch(() => undefined);
        },
      };
    },
  };
}

function peersOf(state: Record<string, unknown[]>, self: string): Peer[] {
  const out: Peer[] = [];
  for (const metas of Object.values(state)) {
    const m = metas[0] as { id?: unknown; role?: unknown } | undefined;
    if (!m || typeof m.id !== 'string' || m.id === self) continue;
    if (m.role !== 'host' && m.role !== 'guest') continue;
    out.push({ id: m.id, role: m.role });
  }
  return out;
}

export function supabaseTransport(realtime: () => RealtimeLike): Transport {
  return {
    name: 'supabase',
    join(code, self) {
      return new Promise<RoomLink>((resolve, reject) => {
        const ch = realtime().channel(roomTopic(code), self.id);
        let events: Parameters<RoomLink['listen']>[0] = {};
        let joined = false;
        let gone = false;
        ch.onBroadcast(EVENT, (payload) => {
          const p = payload as { from?: unknown; data?: unknown } | null;
          if (!p || typeof p.from !== 'string' || p.from === self.id) return;
          events.message?.(p.data, p.from);
        });
        ch.onPresenceSync(() => events.presence?.(peersOf(ch.presence(), self.id)));
        const timer = setTimeout(() => {
          if (joined) return;
          gone = true;
          ch.remove();
          reject(new Error('timed out'));
        }, JOIN_MS);
        const link: RoomLink = {
          self: { ...self },
          send: (data) => {
            if (!gone) ch.broadcast(EVENT, { from: self.id, data }).catch(() => undefined);
          },
          listen: (e) => {
            events = e;
            e.presence?.(peersOf(ch.presence(), self.id));
          },
          leave: () => {
            if (gone) return;
            gone = true;
            ch.remove();
          },
        };
        ch.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            if (joined) return;
            joined = true;
            clearTimeout(timer);
            ch.track({ id: self.id, role: self.role }).catch(() => undefined);
            resolve(link);
            return;
          }
          if (!joined) {
            clearTimeout(timer);
            gone = true;
            ch.remove();
            reject(new Error(status));
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            // the client reconnects by itself after a blip; a room that is really gone shows up as silence
            if (status === 'CLOSED' && !gone) events.closed?.();
          }
        });
      });
    },
  };
}
