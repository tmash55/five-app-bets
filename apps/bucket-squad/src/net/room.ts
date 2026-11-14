/**
 * A game between two devices, from the room code to the final buzzer.
 *
 * The host opens a room and waits. The guest joins it, says which game version and roster it runs and which squad
 * it brings (`hello`). The host checks both match its own, builds the match (seed, court, both squads, the size)
 * and sends it (`setup`); both devices now hold the identical match. Each says `ready` from the versus card, and
 * when both have, the match starts and the lockstep takes over. Either can pause both; a device that says `bye`, or
 * goes quiet for 8 seconds, ends the game for the other.
 */

import type { MatchSetup } from '@/meta/match';
import { Lockstep } from './lockstep';
import { NETCODE_VERSION, ROSTER_FINGERPRINT, readMsg, sameGame, type NetMsg, type Offer, type Role } from './protocol';
import { visitId, type Peer, type RoomLink, type Transport } from './transport';

export interface NetClock {
  now(): number;
  /** call `fn` every `ms` until the returned function is called */
  every(ms: number, fn: () => void): () => void;
}

export const realClock: NetClock = {
  now: () => (typeof performance !== 'undefined' ? performance.now() : Date.now()),
  every: (ms, fn) => {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  },
};

export type RoomPhase = 'joining' | 'waiting' | 'looking' | 'matched' | 'playing' | 'done' | 'failed';

/**
 * What went wrong: the wire (`offline`), no host behind the code (`no-room`), two players already (`full`), the two
 * devices run different games (`mismatch`), the other person left (`left`) or went quiet (`gone`), the games drifted
 * apart (`desync`), or another host already uses the code (`taken`, the host tries a new one).
 */
export type RoomProblem = 'offline' | 'no-room' | 'full' | 'mismatch' | 'left' | 'gone' | 'desync' | 'taken';

export interface RoomView {
  phase: RoomPhase;
  problem: RoomProblem | null;
  role: Role;
  code: string;
  setup: MatchSetup | null;
  /** somebody is in the room with the host (before the match is made) */
  friendHere: boolean;
  meReady: boolean;
  friendReady: boolean;
  paused: boolean;
  pausedBy: 'me' | 'friend' | null;
  /** the match has waited this long (ms) for the other device's moves */
  waiting: number;
  /** the input delay now, in ticks, and the measured round trip in ms */
  delay: number;
  rtt: number | null;
}

export interface RoomOptions {
  transport: Transport;
  role: Role;
  code: string;
  offer: Offer;
  clock?: NetClock;
  /** the host builds the match from both offers; throwing refuses the guest as running another game */
  makeSetup?: (host: Offer, guest: Offer) => MatchSetup;
  /** how long a guest looks for the host behind a code before saying there is none */
  lookMs?: number;
  /** options for the lockstep (tests) */
  lockstep?: Partial<Omit<ConstructorParameters<typeof Lockstep>[0], 'local' | 'send' | 'now'>>;
}

const POLL_MS = 50;
const HELLO_MS = 1500;
const READY_MS = 1000;
const LOOK_MS = 6000;
/** how soon after joining a host checks whether another host has its code */
const TAKEN_MS = 2000;
/** after the final buzzer, keep handing the other device what it still needs for this long at most */
const SETTLE_MS = 10000;

export class OnlineRoom {
  readonly role: Role;
  readonly code: string;
  readonly self: Peer;
  lock: Lockstep | null = null;
  private view: RoomView;
  private link: RoomLink | null = null;
  private readonly clock: NetClock;
  private readonly listeners = new Set<(v: RoomView) => void>();
  private stopTimer: (() => void) | null = null;
  /** the other person's visit id, once they have said hello (guest: the host's, once seen) */
  private partner: string | null = null;
  private lookFrom = 0;
  private lastHello = -Infinity;
  private lastReady = -Infinity;
  private pauseN = 0;
  private early: NetMsg[] = [];
  private finishedAt = -1;
  private closed = false;

  constructor(private readonly o: RoomOptions) {
    this.role = o.role;
    this.code = o.code;
    this.clock = o.clock ?? realClock;
    this.self = { id: visitId(), role: o.role };
    this.view = {
      phase: 'joining',
      problem: null,
      role: o.role,
      code: o.code,
      setup: null,
      friendHere: false,
      meReady: false,
      friendReady: false,
      paused: false,
      pausedBy: null,
      waiting: 0,
      delay: 0,
      rtt: null,
    };
  }

  get state(): RoomView {
    return this.view;
  }

  subscribe(fn: (v: RoomView) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<RoomView>): void {
    let changed = false;
    for (const k of Object.keys(patch) as (keyof RoomView)[]) if (this.view[k] !== patch[k]) changed = true;
    if (!changed) return;
    this.view = { ...this.view, ...patch };
    for (const fn of this.listeners) fn(this.view);
  }

  private fail(problem: RoomProblem): void {
    if (this.view.phase === 'failed') return;
    this.set({ phase: 'failed', problem, paused: false, pausedBy: null });
    this.stop();
  }

  private send(msg: NetMsg): void {
    this.link?.send(msg);
  }

  async open(): Promise<void> {
    try {
      this.link = await this.o.transport.join(this.code, this.self);
    } catch {
      this.fail('offline');
      return;
    }
    if (this.closed) {
      this.link.leave();
      return;
    }
    this.link.listen({
      message: (data, from) => this.hear(data, from),
      presence: (peers) => this.presence(peers),
      closed: () => {
        if (this.view.phase !== 'playing' && this.view.phase !== 'done') this.fail('offline');
      },
    });
    this.lookFrom = this.clock.now();
    this.set({ phase: this.role === 'host' ? 'waiting' : 'looking' });
    this.stopTimer = this.clock.every(POLL_MS, () => this.poll());
  }

  private presence(peers: Peer[]): void {
    const phase = this.view.phase;
    if (phase === 'failed' || phase === 'done') return;
    if (this.role === 'host') {
      // another host already in the room when this one came: the code is taken (a host coming later is the one to move)
      if (phase === 'waiting' && this.clock.now() - this.lookFrom < TAKEN_MS && peers.some((p) => p.role === 'host')) {
        this.fail('taken');
        return;
      }
      if (phase === 'waiting' || phase === 'matched') this.set({ friendHere: peers.some((p) => p.role === 'guest') });
      if (phase === 'matched' && this.partner && !peers.some((p) => p.id === this.partner)) this.fail('left');
      return;
    }
    const host = peers.find((p) => p.role === 'host');
    if (phase === 'looking' && host) {
      this.partner = host.id;
      this.hello();
    }
    if (phase === 'matched' && this.partner && !host) this.fail('left');
  }

  private hello(): void {
    this.lastHello = this.clock.now();
    this.send({ k: 'hello', ...this.o.offer });
  }

  private hear(data: unknown, from: string): void {
    const msg = readMsg(data);
    if (!msg || this.view.phase === 'failed') return;
    if ((msg.k === 'setup' || msg.k === 'nope') && msg.to !== this.self.id) return;
    if (this.role === 'host' && msg.k === 'hello') {
      this.hostHello(msg, from);
      return;
    }
    // past the hello, only the other person in the match is listened to
    if (from !== this.partner) return;
    switch (msg.k) {
      case 'setup':
        if (this.role !== 'guest' || this.view.phase !== 'looking') return;
        if (!sameGame(msg)) {
          this.fail('mismatch');
          return;
        }
        this.set({ phase: 'matched', setup: msg.setup });
        return;
      case 'nope':
        this.fail(msg.why === 'full' ? 'full' : 'mismatch');
        return;
      case 'ready':
        if (this.view.phase !== 'matched') return;
        this.set({ friendReady: true });
        if (this.view.meReady) {
          // say it once more, in case the first one went missing
          this.send({ k: 'ready' });
          this.begin();
        }
        return;
      case 'in':
        if (this.view.phase === 'matched' && this.view.meReady) {
          // they started: they had both readies
          this.set({ friendReady: true });
          this.begin();
        }
        if (this.lock) this.lock.receive(msg);
        else this.early.push(msg);
        return;
      case 'pause':
        if (this.view.phase !== 'playing') return;
        this.set({ paused: msg.on, pausedBy: msg.on ? 'friend' : null });
        return;
      case 'bye':
        // past the final buzzer the other device may finish first and go: this one has every frame it still needs
        if (this.view.phase === 'playing' && this.lock?.ending) {
          this.lock.finish();
          return;
        }
        if (this.view.phase !== 'done') this.fail('left');
        return;
      default:
        return;
    }
  }

  private hostHello(msg: Extract<NetMsg, { k: 'hello' }>, from: string): void {
    if (this.partner !== null && from !== this.partner) {
      this.send({ k: 'nope', to: from, why: 'full' });
      return;
    }
    if (this.view.phase !== 'waiting' && this.view.phase !== 'matched') return;
    if (!sameGame(msg)) {
      this.send({ k: 'nope', to: from, why: 'version' });
      this.fail('mismatch');
      return;
    }
    let setup = this.view.setup;
    if (!setup) {
      try {
        setup = this.o.makeSetup ? this.o.makeSetup(this.o.offer, msg) : null;
      } catch {
        setup = null;
      }
      if (!setup) {
        this.send({ k: 'nope', to: from, why: 'version' });
        this.fail('mismatch');
        return;
      }
    }
    this.partner = from;
    // a second hello (the setup went missing) gets the same match again
    this.send({ k: 'setup', to: from, v: NETCODE_VERSION, fp: ROSTER_FINGERPRINT, setup });
    this.set({ phase: 'matched', setup, friendHere: true });
  }

  /** This device pressed TIP-OFF. */
  ready(): void {
    if (this.view.phase !== 'matched' || this.view.meReady) return;
    this.set({ meReady: true });
    this.lastReady = this.clock.now();
    this.send({ k: 'ready' });
    if (this.view.friendReady) this.begin();
  }

  private begin(): void {
    if (this.lock) return;
    const lock = new Lockstep({ ...this.o.lockstep, local: this.role === 'host' ? 0 : 1, send: (m) => this.send(m), now: () => this.clock.now() });
    this.lock = lock;
    lock.start();
    for (const m of this.early) if (m.k === 'in') lock.receive(m);
    this.early = [];
    this.set({ phase: 'playing', delay: lock.delay });
  }

  /** Pause or carry on, on both devices. */
  pause(on: boolean): void {
    if (this.view.phase !== 'playing' || this.view.paused === on) return;
    this.pauseN++;
    this.set({ paused: on, pausedBy: on ? 'me' : null });
    this.send({ k: 'pause', on, n: this.pauseN });
  }

  /** The final buzzer went here. */
  finish(): void {
    if (this.view.phase !== 'playing') return;
    this.lock?.finish();
    this.finishedAt = this.clock.now();
    this.set({ phase: 'done', paused: false, pausedBy: null, waiting: 0 });
  }

  private poll(): void {
    const now = this.clock.now();
    const phase = this.view.phase;
    if (phase === 'looking') {
      if (this.partner === null && now - this.lookFrom > (this.o.lookMs ?? LOOK_MS)) this.fail('no-room');
      else if (this.partner !== null && now - this.lastHello > HELLO_MS) this.hello();
      return;
    }
    if (phase === 'matched' && this.view.meReady && now - this.lastReady > READY_MS) {
      this.lastReady = now;
      this.send({ k: 'ready' });
      return;
    }
    const lock = this.lock;
    if (!lock) return;
    if (phase === 'done') {
      // the other device may still be a few ticks behind: it needs this one's last frames to get there
      if (lock.settled || now - this.finishedAt > SETTLE_MS) this.stop();
      else lock.poll();
      return;
    }
    if (phase !== 'playing') return;
    lock.poll();
    if (lock.status === 'desync') this.fail('desync');
    else if (lock.status === 'gone') this.fail('gone');
    else this.set({ waiting: Math.round(lock.waiting() / 100) * 100, delay: lock.delay, rtt: lock.srtt === null ? null : Math.round(lock.srtt) });
  }

  private stop(): void {
    this.stopTimer?.();
    this.stopTimer = null;
  }

  /** Leave the room: the other device hears `bye`. A host leaving takes its code with it. */
  leave(): void {
    if (this.closed) return;
    this.closed = true;
    this.stop();
    if (this.link) {
      this.send({ k: 'bye' });
      this.link.leave();
    }
    this.link = null;
    this.listeners.clear();
  }
}
