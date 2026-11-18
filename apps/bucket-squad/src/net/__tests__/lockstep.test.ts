/**
 * Two devices in lockstep through the in-memory relay, on a fake clock: each steps its own copy of the match the way
 * the match runner does (as time passes, only while both teams' frames are here), with its own thumb on its pad.
 */

import type { InputSource } from '@/game/runner';
import { DT } from '@/game/sim/constants';
import { emptyFrame, packFrame, unpackFrame } from '@/game/sim/input';
import { createMatch, stepMatch } from '@/game/sim/sim';
import type { InputFrame, MatchConfig, MatchState, TeamId } from '@/game/sim/types';
import { FakeClock, testRng } from '@/testing/fakeClock';
import { ScriptedThumb, traceConfig } from '@/testing/simTrace';
import { Lockstep, LOCKSTEP, type LockstepOptions } from '../lockstep';
import { readMsg, type InputMsg } from '../protocol';
import { stateHash } from '../stateHash';
import { MemoryRelay, type RoomLink } from '../transport';

function config(seed: number): MatchConfig {
  return traceConfig(seed, { userTeam: 0, humans: [true, true], rubberBand: 0, catchUp: [0, 0], teamAssist: [1.15, 1.7], quarters: 1, quarterSeconds: 24 });
}

interface Device {
  m: MatchState;
  lock: Lockstep;
  link: RoomLink;
  thumb: ScriptedThumb;
  sources: [InputSource, InputSource];
  acc: number;
  /** the frames each tick was stepped with, packed, home and away */
  played: [number, number][];
  /** frames of display time (rounded to whole ms) this device spends between draws */
  frameMs: () => number;
  nextDraw: number;
  lastDraw: number;
  stalledTicks: number;
  /** a slow device: its draw loop stops for a while */
  frozenUntil: number;
}

interface Net {
  clock: FakeClock;
  relay: MemoryRelay;
  devices: [Device, Device];
}

async function connect(seed: number, net: { latency?: () => number; loss?: number; lock?: Partial<LockstepOptions> } = {}): Promise<Net> {
  const clock = new FakeClock();
  const rng = testRng(seed * 7 + 1);
  const relay = new MemoryRelay({ schedule: clock.schedule, now: clock.now, latency: net.latency, loss: net.loss, rng });
  const t = relay.transport();
  const make = async (team: TeamId): Promise<Device> => {
    const link = await t.join('TEST', { id: `dev${team}`, role: team === 0 ? 'host' : 'guest' });
    const lock = new Lockstep({ ...net.lock, local: team, send: (m) => link.send(m), now: clock.now });
    const thumb = new ScriptedThumb(seed * 31 + team + 5);
    const sources: [InputSource, InputSource] = [lock.source(0, team === 0 ? thumb.pad : undefined), lock.source(1, team === 1 ? thumb.pad : undefined)];
    const jitter = testRng(seed * 13 + team);
    link.listen({
      message: (data) => {
        const msg = readMsg(data);
        if (msg?.k === 'in') lock.receive(msg);
      },
    });
    return { m: createMatch(config(seed)), lock, link, thumb, sources, acc: 0, played: [], frameMs: () => 16 + Math.round(jitter() * 2), nextDraw: 0, lastDraw: -1, stalledTicks: 0, frozenUntil: 0 };
  };
  const devices: [Device, Device] = [await make(0), await make(1)];
  for (const d of devices) d.lock.start();
  return { clock, relay, devices };
}

const frames: [InputFrame | null, InputFrame | null] = [null, null];

/** One draw of one device: move its thumb, then step as many ticks as time and the frames allow. */
function draw(d: Device, dt: number): void {
  d.thumb.step();
  d.acc += dt;
  let steps = 0;
  while (d.acc >= DT && steps < 6 && d.m.phase !== 'final') {
    const next = d.m.tick + 1;
    if (!d.sources[0].ready?.(next) || !d.sources[1].ready?.(next)) {
      d.stalledTicks++;
      break;
    }
    frames[0] = d.sources[0].frame(next, 0);
    frames[1] = d.sources[1].frame(next, 1);
    d.played.push([packFrame(frames[0]!), packFrame(frames[1]!)]);
    stepMatch(d.m, frames);
    d.lock.afterStep(d.m);
    d.acc -= DT;
    steps++;
  }
  if (d.acc >= DT) d.acc = 0;
}

/** Run both devices for `ms` of fake time, 1 ms at a time: draws when each device's frame comes round, polls every 50 ms. */
function run(net: Net, ms: number, until?: () => boolean): void {
  const { clock, devices } = net;
  const end = clock.now() + ms;
  let lastPoll = clock.now();
  while (clock.now() < end) {
    clock.advance(1);
    const now = clock.now();
    for (const d of devices) {
      if (now < d.frozenUntil) continue;
      if (now >= d.nextDraw) {
        const dt = d.lastDraw < 0 ? 0 : (now - d.lastDraw) / 1000;
        d.lastDraw = now;
        d.nextDraw = now + d.frameMs();
        draw(d, Math.min(0.1, dt));
      }
    }
    if (now - lastPoll >= 50) {
      lastPoll = now;
      for (const d of devices) d.lock.poll();
    }
    if (until?.()) return;
  }
}

/** The same match stepped on one machine with every tick's two frames as the devices played them. */
function replay(seed: number, played: [number, number][]): MatchState {
  const m = createMatch(config(seed));
  const a = emptyFrame();
  const b = emptyFrame();
  for (const [h, w] of played) stepMatch(m, [unpackFrame(h, a), unpackFrame(w, b)]);
  return m;
}

const bothFinal = (net: Net) => () => net.devices.every((d) => d.m.phase === 'final');

describe('lockstep between two devices', () => {
  it('plays the same match on both devices as one machine with both pads, through latency and jitter', async () => {
    const seed = 11;
    // 30 to 90 ms each way
    const lat = testRng(99);
    const net = await connect(seed, { latency: () => 30 + lat() * 60 });
    run(net, 240000, bothFinal(net));
    const [a, b] = net.devices;
    expect(a.m.phase).toBe('final');
    expect(b.m.phase).toBe('final');
    expect(a.m.tick).toBe(b.m.tick);
    expect(a.played).toEqual(b.played);
    expect(stateHash(a.m)).toBe(stateHash(b.m));
    expect(a.m.score).toEqual(b.m.score);
    // somebody actually played: the pads moved and points went up
    expect(a.played.some(([h]) => h !== a.played[0][0])).toBe(true);
    expect(a.played.some(([, w]) => w !== a.played[0][1])).toBe(true);
    expect(a.m.score[0] + a.m.score[1]).toBeGreaterThan(0);
    const solo = replay(seed, a.played);
    expect(stateHash(solo)).toBe(stateHash(a.m));
    expect(solo.score).toEqual(a.m.score);
    expect(a.lock.status).toBe('playing');
    expect(b.lock.status).toBe('playing');
  });

  it('survives lost messages: every message carries what the other side has not had', async () => {
    const seed = 4;
    const net = await connect(seed, { latency: () => 40, loss: 0.2 });
    run(net, 60000, () => net.devices.every((d) => d.m.tick >= 1800));
    const [a, b] = net.devices;
    const n = Math.min(a.played.length, b.played.length);
    expect(n).toBeGreaterThanOrEqual(1700);
    expect(a.played.slice(0, n)).toEqual(b.played.slice(0, n));
    expect(a.lock.status).toBe('playing');
  });

  it('sends no more than about 20 messages a second from each device', async () => {
    const net = await connect(5, { latency: () => 50 });
    const start = net.clock.now();
    run(net, 20000);
    const seconds = (net.clock.now() - start) / 1000;
    for (const d of net.devices) {
      const rate = (net.relay.sent.get(d.link.self.id) ?? 0) / seconds;
      expect(rate).toBeLessThanOrEqual(20);
      expect(rate).toBeGreaterThan(10);
    }
  });

  it('starts at 6 ticks of input delay and follows the round trip, no further than 12', async () => {
    const slowNet = await connect(6, { latency: () => 120 });
    expect(slowNet.devices[0].lock.delay).toBe(LOCKSTEP.delay);
    run(slowNet, 15000);
    // 240 ms round trip: a frame needs more than 6 ticks to arrive in time, and the most is 12
    for (const d of slowNet.devices) {
      expect(d.lock.delay).toBeGreaterThan(LOCKSTEP.delay);
      expect(d.lock.delay).toBeLessThanOrEqual(LOCKSTEP.maxDelay);
      expect(d.lock.srtt).toBeGreaterThan(200);
    }

    const fastNet = await connect(6, { latency: () => 5 });
    run(fastNet, 15000);
    // a quick network brings the delay down, but never under the floor
    for (const d of fastNet.devices) {
      expect(d.lock.delay).toBeLessThan(LOCKSTEP.delay);
      expect(d.lock.delay).toBeGreaterThanOrEqual(LOCKSTEP.minDelay);
    }
    // and the games still agree, delay changes and all
    const [a, b] = fastNet.devices;
    const n = Math.min(a.played.length, b.played.length);
    expect(a.played.slice(0, n)).toEqual(b.played.slice(0, n));

    const awful = await connect(6, { latency: () => 400 });
    run(awful, 15000);
    for (const d of awful.devices) expect(d.lock.delay).toBe(LOCKSTEP.maxDelay);
  });

  it('waits for the other device instead of guessing, and says how long it has waited', async () => {
    const net = await connect(8, { latency: () => 30 });
    run(net, 3000);
    const [a, b] = net.devices;
    const before = a.m.tick;
    // b's draw loop stops for 2 s (a slow phone); a cannot step past what b has sent
    b.frozenUntil = net.clock.now() + 2000;
    run(net, 1000);
    expect(a.m.tick - before).toBeLessThan(LOCKSTEP.maxDelay + 10);
    expect(a.lock.waiting()).toBeGreaterThan(800);
    run(net, 3000);
    expect(a.lock.waiting()).toBe(0);
    expect(a.m.tick).toBeGreaterThan(before + 60);
    const n = Math.min(a.played.length, b.played.length);
    expect(a.played.slice(0, n)).toEqual(b.played.slice(0, n));
  });

  it('catches a desync: the state checks stop disagreeing games', async () => {
    const net = await connect(9, { latency: () => 25 });
    run(net, 4000);
    const [a, b] = net.devices;
    expect(a.lock.status).toBe('playing');
    // something on one device comes out a hair different
    b.m.players[2].x += 1e-9;
    run(net, 3000);
    expect(a.lock.status).toBe('desync');
    expect(b.lock.status).toBe('desync');
    expect(a.lock.desyncAt).toBeGreaterThan(0);
    // and once out of sync, neither device steps on
    const ticks = [a.m.tick, b.m.tick];
    run(net, 1000);
    expect([a.m.tick, b.m.tick]).toEqual(ticks);
  });

  it('notices a device that has gone quiet for 8 seconds', async () => {
    const net = await connect(10, { latency: () => 30 });
    run(net, 3000);
    const [a, b] = net.devices;
    net.relay.cut(b.link.self.id);
    run(net, LOCKSTEP.silenceMs - 1000);
    expect(a.lock.status).toBe('playing');
    run(net, 2500);
    expect(a.lock.status).toBe('gone');
  });

  it('keeps its heartbeat going while nothing steps (a pause), so a paused game is not a lost one', async () => {
    const net = await connect(12, { latency: () => 30 });
    run(net, 2000);
    for (const d of net.devices) d.frozenUntil = net.clock.now() + 20000;
    run(net, 20000);
    for (const d of net.devices) expect(d.lock.status).toBe('playing');
  });

  it('refuses frames that are not frames', () => {
    expect(readMsg({ k: 'in', s: 1, f: [1, 2, 'x'], a: 0, t: 0 })).toBeNull();
    expect(readMsg({ k: 'in', s: 0, f: [], a: 0, t: 0 })).toBeNull();
    expect(readMsg({ k: 'in', s: 1, f: [2 ** 21], a: 0, t: 0 })).toBeNull();
    const ok = readMsg({ k: 'in', s: 3, f: [1, 2], a: 2, t: 5, e: 1, h: 2, c: [[60, -5]] }) as InputMsg;
    expect(ok).toEqual({ k: 'in', s: 3, f: [1, 2], a: 2, t: 5, e: 1, h: 2, c: [[60, -5]] });
  });
});
