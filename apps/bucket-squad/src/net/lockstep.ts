/**
 * Deterministic lockstep between two devices. Both run the very same match; the only thing that crosses the wire is
 * each side's pad, one frame per tick.
 *
 * - Input delay: the pad read while stepping tick t is played on tick t + delay, on both devices. The delay gives
 *   the frame time to travel, so the other device has it by the time it gets there. It starts at 6 ticks (100 ms)
 *   and follows the measured round trip, one tick at a time, between 4 and 12.
 * - Batching: frames go out four ticks at a time (15 messages a second), and every message carries every frame the
 *   other side has not said it has, so a lost message costs nothing but a little time.
 * - The match only steps a tick when both teams' frames for it are here (`ready`). Waiting is shown, never hidden.
 * - A state check every second: each side sends a hash of its match; if the two ever differ the game is out of sync.
 * - Silence: nothing heard for 8 seconds and the other device is gone.
 *
 * No timers in here: the owner calls `poll` every few tens of ms with its own clock, so tests run on a fake one.
 */

import type { InputSource } from '@/game/runner';
import { emptyFrame, packFrame, unpackFrame } from '@/game/sim/input';
import type { InputFrame, MatchState, TeamId } from '@/game/sim/types';
import type { InputMsg } from './protocol';
import { stateHash } from './stateHash';

export const TICK_MS = 1000 / 60;

export interface LockstepOptions {
  /** the team this device plays */
  local: TeamId;
  send: (msg: InputMsg) => void;
  now: () => number;
  /** input delay to start with, in ticks */
  delay?: number;
  minDelay?: number;
  maxDelay?: number;
  /** frames per message */
  batch?: number;
  /** the most time between two messages, even when there is nothing new (stalls, pauses) */
  heartbeatMs?: number;
  /** nothing heard for this long and the other device is gone */
  silenceMs?: number;
  /** ticks between state checks */
  hashEvery?: number;
  /** the state hash (tests swap it to make a desync) */
  hash?: (m: MatchState) => number;
}

export type LockStatus = 'playing' | 'desync' | 'gone';

export const LOCKSTEP = {
  delay: 6,
  minDelay: 4,
  maxDelay: 12,
  batch: 4,
  heartbeatMs: 250,
  silenceMs: 8000,
  hashEvery: 60,
  /** the most frames one message carries */
  maxFrames: 120,
  /** the shortest time between two changes of the input delay (four times as long before it comes down) */
  adaptMs: 500,
} as const;

const EMPTY = packFrame(emptyFrame());

export class Lockstep {
  readonly local: TeamId;
  readonly remote: TeamId;
  status: LockStatus = 'playing';
  /** the tick a state check failed at, when out of sync */
  desyncAt = -1;
  /** the input delay now, in ticks */
  delay: number;
  /** smoothed round trip and its spread, in ms (null until measured) */
  srtt: number | null = null;
  rttvar = 0;
  /** messages sent so far */
  sent = 0;
  /** every input delay used, for tests and the dev readout */
  readonly delays: number[] = [];

  private readonly o: Required<Omit<LockstepOptions, 'local' | 'send' | 'now'>> & Pick<LockstepOptions, 'send' | 'now'>;
  /** packed frames by tick, this device's and the other's */
  private readonly mine: number[] = [];
  private readonly theirs: number[] = [];
  /** the last tick this device has a frame of its own for */
  private mineTop = 0;
  /** the last tick up to which every one of the other side's frames is here */
  private theirTop = 0;
  /** the other side has this device's frames up to here */
  private peerHas = 0;
  private sentTop = 0;
  private lastSend = -Infinity;
  private heard: number;
  private peerT: number | null = null;
  private peerTAt = 0;
  private lastAdapt = -Infinity;
  /** this device's latest state checks, sent along with every message */
  private readonly checks: [number, number][] = [];
  private readonly mineHashes = new Map<number, number>();
  private readonly theirHashes = new Map<number, number>();
  private waitingSince: number | null = null;
  private finished = false;
  private readonly outs: [InputFrame, InputFrame] = [emptyFrame(), emptyFrame()];

  constructor(opts: LockstepOptions) {
    this.local = opts.local;
    this.remote = opts.local === 0 ? 1 : 0;
    this.o = {
      delay: opts.delay ?? LOCKSTEP.delay,
      minDelay: opts.minDelay ?? LOCKSTEP.minDelay,
      maxDelay: opts.maxDelay ?? LOCKSTEP.maxDelay,
      batch: opts.batch ?? LOCKSTEP.batch,
      heartbeatMs: opts.heartbeatMs ?? LOCKSTEP.heartbeatMs,
      silenceMs: opts.silenceMs ?? LOCKSTEP.silenceMs,
      hashEvery: opts.hashEvery ?? LOCKSTEP.hashEvery,
      hash: opts.hash ?? stateHash,
      send: opts.send,
      now: opts.now,
    };
    this.delay = this.o.delay;
    this.heard = opts.now();
  }

  /** Begin: the first `delay` ticks are played with the pad untouched, on both sides, and are sent at once. */
  start(): void {
    while (this.mineTop < this.delay) this.mine[++this.mineTop] = EMPTY;
    this.delays.push(this.delay);
    this.heard = this.o.now();
    this.flush();
  }

  /**
   * Where the runner gets a team's frames. This device's team plays what its pad held `delay` ticks ago (the pad is
   * read as each tick is stepped); the other team plays what the other device sent.
   */
  source(team: TeamId, pad?: InputFrame): InputSource {
    const out = this.outs[team];
    if (team === this.local) {
      const held = pad ?? emptyFrame();
      return {
        ready: (t) => this.status === 'playing' && t <= this.mineTop,
        frame: (t) => {
          this.capture(t, held);
          return unpackFrame(this.mine[t] ?? EMPTY, out);
        },
      };
    }
    return {
      ready: (t) => {
        const ok = this.status === 'playing' && t <= this.theirTop;
        if (!ok && this.waitingSince === null) this.waitingSince = this.o.now();
        return ok;
      },
      frame: (t) => {
        this.waitingSince = null;
        return unpackFrame(this.theirs[t] ?? EMPTY, out);
      },
    };
  }

  /** How long the match has been held up waiting for the other device's frames, in ms (0 when it is not). */
  waiting(): number {
    return this.waitingSince === null ? 0 : this.o.now() - this.waitingSince;
  }

  /** Read the pad for tick `t + delay` as tick `t` is stepped. */
  private capture(t: number, pad: InputFrame): void {
    const target = t + this.delay;
    if (this.mineTop < target) {
      // the delay grew: the ticks it added play the same frame
      const v = packFrame(pad);
      while (this.mineTop < target) this.mine[++this.mineTop] = v;
    }
    // (the delay shrank: nothing new this tick, the frames already sent stand)
    if (this.mineTop - this.sentTop >= this.o.batch) this.flush();
  }

  /** Call after every step: every `hashEvery` ticks the match's hash is noted and compared. */
  afterStep(m: MatchState): void {
    const every = this.o.hashEvery;
    if (m.tick % every !== 0) return;
    const h = this.o.hash(m);
    this.mineHashes.set(m.tick, h);
    this.checks.push([m.tick, h]);
    if (this.checks.length > 2) this.checks.shift();
    const theirs = this.theirHashes.get(m.tick);
    if (theirs !== undefined) this.compare(m.tick, h, theirs);
    const old = m.tick - every * 20;
    this.mineHashes.delete(old);
    this.theirHashes.delete(old);
  }

  private compare(tick: number, mine: number, theirs: number): void {
    if (mine === theirs || this.status !== 'playing') return;
    this.status = 'desync';
    this.desyncAt = tick;
  }

  /** The match is over here: keep handing the other side what it still needs, and stop listening for silence. */
  finish(): void {
    this.finished = true;
    this.flush();
  }

  /** Everything the other side has not had yet, in one message (or a heartbeat when there is nothing). */
  flush(): void {
    const now = this.o.now();
    const from = this.peerHas + 1;
    const to = Math.min(this.mineTop, from + LOCKSTEP.maxFrames - 1);
    const msg: InputMsg = { k: 'in', s: from, f: this.mine.slice(from, to + 1), a: this.theirTop, t: Math.round(now) };
    if (this.peerT !== null) {
      msg.e = this.peerT;
      msg.h = Math.round(now - this.peerTAt);
    }
    if (this.checks.length > 0) msg.c = this.checks.map((c) => [c[0], c[1]]);
    this.sentTop = Math.max(this.sentTop, to);
    this.lastSend = now;
    this.sent++;
    this.o.send(msg);
  }

  receive(msg: InputMsg): void {
    const now = this.o.now();
    this.heard = now;
    if (msg.a > this.peerHas) this.peerHas = Math.min(msg.a, this.mineTop);
    for (let i = 0; i < msg.f.length; i++) {
      const t = msg.s + i;
      if (t > this.theirTop && this.theirs[t] === undefined) this.theirs[t] = msg.f[i];
    }
    while (this.theirs[this.theirTop + 1] !== undefined) this.theirTop++;
    if (msg.e !== undefined && msg.h !== undefined) this.sample(now - msg.e - msg.h);
    this.peerT = msg.t;
    this.peerTAt = now;
    if (msg.c) {
      for (const [t, h] of msg.c) {
        const mine = this.mineHashes.get(t);
        if (mine !== undefined) this.compare(t, mine, h);
        else this.theirHashes.set(t, h);
      }
    }
  }

  /** A round trip, measured: smoothed the way TCP does it, then the input delay follows. */
  private sample(rtt: number): void {
    if (!(rtt >= 0) || rtt > 10000) return;
    if (this.srtt === null) {
      this.srtt = rtt;
      this.rttvar = rtt / 2;
    } else {
      this.rttvar += (Math.abs(this.srtt - rtt) - this.rttvar) / 4;
      this.srtt += (rtt - this.srtt) / 8;
    }
    this.adapt();
  }

  /** The delay a frame needs: the trip one way with room for its spread, plus the wait for its batch to go out. */
  wantedDelay(): number {
    if (this.srtt === null) return this.delay;
    const oneWay = this.srtt / 2 + this.rttvar * 2;
    const want = Math.ceil(oneWay / TICK_MS) + (this.o.batch - 1) + 1;
    return Math.max(this.o.minDelay, Math.min(this.o.maxDelay, want));
  }

  private adapt(): void {
    const want = this.wantedDelay();
    const now = this.o.now();
    // up at once (stalls are worse than delay), down only once the network has been quicker for a while
    if (want === this.delay || now - this.lastAdapt < (want > this.delay ? LOCKSTEP.adaptMs : LOCKSTEP.adaptMs * 4)) return;
    this.delay += Math.sign(want - this.delay);
    this.lastAdapt = now;
    this.delays.push(this.delay);
  }

  /** Call every few tens of ms: sends a heartbeat when it is time, and notices a device gone quiet. */
  poll(): void {
    if (this.status !== 'playing') return;
    const now = this.o.now();
    if (!this.finished && now - this.heard > this.o.silenceMs) {
      this.status = 'gone';
      return;
    }
    const unsent = this.mineTop > this.sentTop;
    if (now - this.lastSend >= this.o.heartbeatMs || (unsent && now - this.lastSend >= this.o.batch * TICK_MS * 1.5)) this.flush();
  }

  /** Everything this device sent has arrived. */
  get settled(): boolean {
    return this.peerHas >= this.mineTop;
  }

  /** ms since the other device was last heard from */
  get quietFor(): number {
    return this.o.now() - this.heard;
  }
}
