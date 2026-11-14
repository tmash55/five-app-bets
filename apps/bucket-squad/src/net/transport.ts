/**
 * The wire between two devices: join a room by its code, send to the others in it, hear from them, see who is there,
 * and leave. The game has three: Supabase Realtime for real play, a small WebSocket relay for development and
 * filming, and one in memory for tests. None of them stores anything; a room exists while somebody is in it.
 */

import type { Role } from './protocol';

export interface Peer {
  /** a random id for this visit to the room, made fresh every time: never anything about the device or person */
  id: string;
  role: Role;
}

export interface LinkEvents {
  /** a message from someone else in the room (never your own) */
  message?: (data: unknown, from: string) => void;
  /** who else is in the room now */
  presence?: (peers: Peer[]) => void;
  /** the wire is gone and will not come back */
  closed?: () => void;
}

export interface RoomLink {
  readonly self: Peer;
  send(data: unknown): void;
  /** Replaces any earlier listeners. */
  listen(events: LinkEvents): void;
  leave(): void;
}

export interface Transport {
  readonly name: string;
  /** Resolves once in the room and able to send; rejects when the room cannot be reached. */
  join(code: string, self: Peer): Promise<RoomLink>;
}

/** A fresh id for one visit to a room. */
export function visitId(rng: () => number = Math.random): string {
  let out = '';
  for (let i = 0; i < 10; i++) out += Math.floor(rng() * 36).toString(36);
  return out;
}

// ---------------------------------------------------------------------------
// In memory: two clients in one process, with as much delay, jitter and loss as a test wants
// ---------------------------------------------------------------------------

export interface MemoryRelayOptions {
  /** run `fn` after `ms` (a test's virtual clock); left out, setTimeout */
  schedule?: (ms: number, fn: () => void) => void;
  /** ms a message takes, picked per message; left out, it is handed over at once (still later, never inside send) */
  latency?: () => number;
  /** share of messages lost on the way, 0..1 */
  loss?: number;
  /** random numbers for loss; left out, Math.random */
  rng?: () => number;
  /** the clock `schedule` runs on, so messages keep their order however their delays are picked */
  now?: () => number;
}

interface MemberBox {
  peer: Peer;
  events: LinkEvents;
  /** when the last message to this member arrives, so later ones never overtake it (a socket keeps order) */
  lastAt: number;
}

/** A relay inside the process: rooms keyed by code, every message copied to everyone else in the room. */
export class MemoryRelay {
  private readonly rooms = new Map<string, Set<MemberBox>>();
  /** messages carried so far, by sender id (tests check the message rate) */
  readonly sent = new Map<string, number>();

  constructor(private readonly o: MemoryRelayOptions = {}) {}

  private later(ms: number, fn: () => void): void {
    if (this.o.schedule) this.o.schedule(ms, fn);
    else setTimeout(fn, ms);
  }

  private now(): number {
    return this.o.now ? this.o.now() : Date.now();
  }

  private presence(room: Set<MemberBox>): void {
    for (const m of room) {
      const peers = [...room].filter((x) => x !== m).map((x) => ({ ...x.peer }));
      this.later(0, () => m.events.presence?.(peers));
    }
  }

  /** Everyone in a room, for tests. */
  members(code: string): Peer[] {
    return [...(this.rooms.get(code) ?? [])].map((m) => m.peer);
  }

  /** Cut a member off as if their phone went into a tunnel: nothing to or from them arrives any more. */
  cut(id: string): void {
    for (const room of this.rooms.values()) for (const m of room) if (m.peer.id === id) room.delete(m);
  }

  transport(): Transport {
    return {
      name: 'memory',
      join: async (code, self) => {
        let room = this.rooms.get(code);
        if (!room) {
          room = new Set();
          this.rooms.set(code, room);
        }
        const box: MemberBox = { peer: { ...self }, events: {}, lastAt: 0 };
        room.add(box);
        const r = room;
        this.presence(r);
        let gone = false;
        const link: RoomLink = {
          self: { ...self },
          listen: (events) => {
            box.events = events;
            // a late listener still hears who is here
            const peers = [...r].filter((x) => x !== box).map((x) => ({ ...x.peer }));
            this.later(0, () => events.presence?.(peers));
          },
          send: (data) => {
            if (gone || !r.has(box)) return;
            this.sent.set(self.id, (this.sent.get(self.id) ?? 0) + 1);
            const text = JSON.stringify(data);
            for (const m of r) {
              if (m === box) continue;
              if (this.o.loss && (this.o.rng ?? Math.random)() < this.o.loss) continue;
              const now = this.now();
              const at = Math.max(m.lastAt, now + (this.o.latency ? Math.max(0, this.o.latency()) : 0));
              m.lastAt = at;
              this.later(at - now, () => {
                if (r.has(m)) m.events.message?.(JSON.parse(text), self.id);
              });
            }
          },
          leave: () => {
            if (gone) return;
            gone = true;
            r.delete(box);
            if (r.size === 0) this.rooms.delete(code);
            else this.presence(r);
          },
        };
        return link;
      },
    };
  }
}
