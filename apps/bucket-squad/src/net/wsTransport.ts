/**
 * Rooms through the little WebSocket relay in tools/relay (development and filming only): the relay keeps rooms
 * by code and copies every message to the others in the room, the same job a Supabase channel does.
 *
 * To the relay:   { t: 'msg', data }
 * From the relay: { t: 'msg', from, data } and { t: 'peers', peers: [{ id, role }] }
 */

import type { Peer, RoomLink, Transport } from './transport';

type SocketLike = Pick<WebSocket, 'send' | 'close' | 'readyState'> & {
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
};

const OPEN = 1;

export function wsTransport(base: string, make: (url: string) => SocketLike = (url) => new WebSocket(url) as unknown as SocketLike): Transport {
  return {
    name: 'relay',
    join(code, self) {
      return new Promise<RoomLink>((resolve, reject) => {
        const url = `${base.replace(/\/$/, '')}/?room=${encodeURIComponent(code)}&id=${encodeURIComponent(self.id)}&role=${self.role}`;
        let ws: SocketLike;
        try {
          ws = make(url);
        } catch (e) {
          reject(e);
          return;
        }
        let events: Parameters<RoomLink['listen']>[0] = {};
        let peers: Peer[] = [];
        let open = false;
        let left = false;
        const link: RoomLink = {
          self: { ...self },
          send: (data) => {
            if (!left && ws.readyState === OPEN) ws.send(JSON.stringify({ t: 'msg', data }));
          },
          listen: (e) => {
            events = e;
            e.presence?.(peers);
          },
          leave: () => {
            if (left) return;
            left = true;
            ws.close();
          },
        };
        ws.onopen = () => {
          open = true;
          resolve(link);
        };
        ws.onerror = () => {
          if (!open) reject(new Error('relay unreachable'));
        };
        ws.onclose = () => {
          if (!open) reject(new Error('relay closed'));
          else if (!left) events.closed?.();
        };
        ws.onmessage = (ev) => {
          let m: { t?: unknown; from?: unknown; data?: unknown; peers?: unknown };
          try {
            m = JSON.parse(String(ev.data));
          } catch {
            return;
          }
          if (m.t === 'msg' && typeof m.from === 'string' && m.from !== self.id) events.message?.(m.data, m.from);
          else if (m.t === 'peers' && Array.isArray(m.peers)) {
            peers = (m.peers as { id?: unknown; role?: unknown }[]).flatMap((p) => (typeof p.id === 'string' && p.id !== self.id && (p.role === 'host' || p.role === 'guest') ? [{ id: p.id, role: p.role }] : []));
            events.presence?.(peers);
          }
        };
      });
    },
  };
}
