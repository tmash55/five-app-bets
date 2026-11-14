/** A clock that only moves when a test moves it, with timers on it: for the netcode, whose timing is the point. */

import type { NetClock } from '@/net/room';

interface Due {
  at: number;
  seq: number;
  fn: () => void;
}

export class FakeClock implements NetClock {
  private t = 0;
  private seq = 0;
  private queue: Due[] = [];

  now = (): number => this.t;

  /** run `fn` once, `ms` from now */
  schedule = (ms: number, fn: () => void): void => {
    this.queue.push({ at: this.t + Math.max(0, ms), seq: this.seq++, fn });
  };

  every = (ms: number, fn: () => void): (() => void) => {
    let on = true;
    const again = () => {
      if (!on) return;
      fn();
      this.schedule(ms, again);
    };
    this.schedule(ms, again);
    return () => {
      on = false;
    };
  };

  /** Move time on by `ms`, running everything that falls due on the way, in order. */
  advance(ms: number): void {
    const end = this.t + ms;
    for (;;) {
      let best = -1;
      for (let i = 0; i < this.queue.length; i++) {
        const q = this.queue[i];
        if (q.at > end) continue;
        if (best < 0 || q.at < this.queue[best].at || (q.at === this.queue[best].at && q.seq < this.queue[best].seq)) best = i;
      }
      if (best < 0) break;
      const [due] = this.queue.splice(best, 1);
      this.t = Math.max(this.t, due.at);
      due.fn();
    }
    this.t = end;
  }

  /** Let promises settle and timers that are due now run. */
  async settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      this.advance(0);
    }
  }
}

/** Small, repeatable random numbers for tests (mulberry32). */
export function testRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
