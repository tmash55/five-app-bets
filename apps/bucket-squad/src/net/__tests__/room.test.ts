/**
 * From the code to the final buzzer: the handshake (versions, roster, squads, the match), readiness, pausing both
 * devices, leaving, a full room, a code nobody hosts, and two builds that run different games.
 */

import { PLAYERS } from '@/data/roster';
import { buildMatch } from '@/meta/match';
import { onlineSetup } from '@/meta/setups';
import { FakeClock } from '@/testing/fakeClock';
import { newRoomCode, cleanCode, CODE_LETTERS, isRoomCode } from '../code';
import { NETCODE_VERSION, ROSTER_FINGERPRINT, rosterFingerprint, setupOk, type Offer } from '../protocol';
import { OnlineRoom, type RoomOptions } from '../room';
import { MemoryRelay } from '../transport';

const ids = PLAYERS.map((p) => p.id);
const offer = (start: number, over: Partial<Offer> = {}): Offer => ({
  v: NETCODE_VERSION,
  fp: ROSTER_FINGERPRINT,
  squad: [0, 1, 2].map((i) => ({ id: ids[start + i], level: 1 + i })),
  uni: null,
  easy: start % 2 === 0,
  ...over,
});

function world(latency = 20) {
  const clock = new FakeClock();
  const relay = new MemoryRelay({ schedule: clock.schedule, now: clock.now, latency: () => latency });
  const t = relay.transport();
  const room = (o: Partial<RoomOptions> & Pick<RoomOptions, 'role'>) =>
    new OnlineRoom({
      transport: t,
      code: 'BCDF',
      offer: offer(o.role === 'host' ? 0 : 3),
      clock,
      makeSetup: (h, g) => onlineSetup({ squad: h.squad, uniform: h.uni, easyShots: h.easy }, { squad: g.squad, uniform: g.uni, easyShots: g.easy }, 3, 60, () => 0.5),
      ...o,
    });
  const run = async (ms: number) => {
    for (let i = 0; i < ms; i += 10) {
      clock.advance(10);
      await Promise.resolve();
    }
  };
  return { clock, relay, room, run };
}

describe('room codes', () => {
  it('are four letters a child can read: no vowels, nothing that looks like a number', () => {
    for (const ch of 'AEIOUL0OQSZ125') expect(CODE_LETTERS).not.toContain(ch);
    for (let i = 0; i < 200; i++) expect(isRoomCode(newRoomCode())).toBe(true);
    expect(cleanCode(' bc-df ')).toBe('BCDF');
    expect(cleanCode('BCDFGH')).toBe('BCDF');
  });
});

describe('the handshake', () => {
  it('builds the identical match on both devices: the host squad is P1, the guest squad P2, each played by its own device', async () => {
    const w = world();
    const host = w.room({ role: 'host' });
    const guest = w.room({ role: 'guest' });
    await host.open();
    expect(host.state.phase).toBe('waiting');
    await guest.open();
    await w.run(500);
    expect(host.state.phase).toBe('matched');
    expect(guest.state.phase).toBe('matched');
    const a = host.state.setup!;
    const b = guest.state.setup!;
    expect(b).toEqual(a);
    expect(setupOk(b)).toBe(true);
    expect(a.mode).toBe('online');
    expect(a.home.players).toEqual(offer(0).squad);
    expect(a.away.players).toEqual(offer(3).squad);
    // the same match, number for number, on both
    expect(buildMatch(b).config).toEqual(buildMatch(a).config);
    expect(buildMatch(a).config.humans).toEqual([true, true]);
    // nothing personal crosses: the sides go by Player 1 and Player 2
    expect([a.home.name, a.away.name]).toEqual(['Player 1', 'Player 2']);

    // TIP-OFF on one device waits for the other
    host.ready();
    await w.run(300);
    expect(host.state.phase).toBe('matched');
    expect(guest.state.friendReady).toBe(true);
    guest.ready();
    await w.run(300);
    expect(host.state.phase).toBe('playing');
    expect(guest.state.phase).toBe('playing');
    expect(host.lock?.local).toBe(0);
    expect(guest.lock?.local).toBe(1);
    host.leave();
    guest.leave();
  });

  it('says "update both devices" when the two run different versions or rosters', async () => {
    for (const over of [{ v: NETCODE_VERSION + 1 }, { fp: 'other' }]) {
      const w = world();
      const host = w.room({ role: 'host' });
      const guest = w.room({ role: 'guest', offer: offer(3, over) });
      await host.open();
      await guest.open();
      await w.run(500);
      expect(host.state.problem).toBe('mismatch');
      expect(guest.state.problem).toBe('mismatch');
      expect(guest.state.setup).toBeNull();
    }
  });

  it('fingerprints the roster by ids and ratings', () => {
    const base = PLAYERS.slice(0, 4).map((p) => ({ id: p.id, ratings: { ...p.ratings } }));
    const same = rosterFingerprint(base);
    expect(rosterFingerprint([...base].reverse())).toBe(same);
    const tweaked = base.map((p, i) => (i === 2 ? { ...p, ratings: { ...p.ratings, shot: p.ratings.shot + 1 } } : p));
    expect(rosterFingerprint(tweaked)).not.toBe(same);
  });

  it('turns away a third device: a room holds two', async () => {
    const w = world();
    const host = w.room({ role: 'host' });
    const guest = w.room({ role: 'guest' });
    const third = w.room({ role: 'guest', offer: offer(6) });
    await host.open();
    await guest.open();
    await w.run(400);
    await third.open();
    await w.run(400);
    expect(host.state.phase).toBe('matched');
    expect(guest.state.phase).toBe('matched');
    expect(third.state.problem).toBe('full');
  });

  it('finds no game behind a code nobody hosts, and the code goes when its host leaves', async () => {
    const w = world();
    const lost = w.room({ role: 'guest', code: 'XYTW' });
    await lost.open();
    await w.run(7000);
    expect(lost.state.problem).toBe('no-room');

    const host = w.room({ role: 'host' });
    const guest = w.room({ role: 'guest' });
    await host.open();
    await guest.open();
    await w.run(400);
    host.leave();
    await w.run(400);
    expect(guest.state.problem).toBe('left');
    expect(w.relay.members('BCDF').map((p) => p.role)).toEqual(['guest']);
  });

  it('lets a host pick another code when another host already has it', async () => {
    const w = world();
    const first = w.room({ role: 'host' });
    await first.open();
    await w.run(2500);
    const second = w.room({ role: 'host' });
    await second.open();
    await w.run(100);
    expect(second.state.problem).toBe('taken');
    expect(first.state.phase).toBe('waiting');
  });
});

describe('during the match', () => {
  async function playing() {
    const w = world();
    const host = w.room({ role: 'host' });
    const guest = w.room({ role: 'guest' });
    await host.open();
    await guest.open();
    await w.run(400);
    host.ready();
    guest.ready();
    await w.run(400);
    return { w, host, guest };
  }

  it('pauses both devices when either pauses, and either can carry on', async () => {
    const { w, host, guest } = await playing();
    guest.pause(true);
    await w.run(200);
    expect(host.state).toMatchObject({ paused: true, pausedBy: 'friend' });
    expect(guest.state).toMatchObject({ paused: true, pausedBy: 'me' });
    host.pause(false);
    await w.run(200);
    expect(guest.state.paused).toBe(false);
    expect(host.state.paused).toBe(false);
  });

  it('ends the game for the other device when one leaves', async () => {
    const { w, host, guest } = await playing();
    guest.leave();
    await w.run(200);
    expect(host.state).toMatchObject({ phase: 'failed', problem: 'left' });
  });

  it('ends the game when the other device goes quiet for 8 seconds, and not before', async () => {
    const { w, host, guest } = await playing();
    w.relay.cut(guest.self.id);
    await w.run(6000);
    expect(host.state.phase).toBe('playing');
    await w.run(3000);
    expect(host.state).toMatchObject({ phase: 'failed', problem: 'gone' });
  });

  it('lets a finished game wind down without calling it a lost connection', async () => {
    const { w, host, guest } = await playing();
    host.finish();
    guest.finish();
    w.relay.cut(guest.self.id);
    await w.run(12000);
    expect(host.state.phase).toBe('done');
    expect(host.state.problem).toBeNull();
  });
});
