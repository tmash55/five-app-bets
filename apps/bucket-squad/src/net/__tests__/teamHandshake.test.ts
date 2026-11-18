/**
 * Names, colours and teams over the wire: a wheel name crosses only as the places of its two words, a typed name never
 * crosses at all, and the other device checks everything it is sent.
 */

import { teamById } from '@/data/roster';
import { onlineSetup } from '@/meta/setups';
import { MASCOT_WORDS, PLACE_WORDS, wordIndexes } from '@/meta/teamName';
import { newSave, startCareer, type SaveData } from '@/state/logic';
import { offerFrom, squadOf } from '@/state/offer';
import { FakeClock } from '@/testing/fakeClock';

import { NETCODE_VERSION, readMsg, setupOk, type Offer } from '../protocol';
import { OnlineRoom } from '../room';
import { MemoryRelay, type Transport } from '../transport';

const SECRET = 'Zelda Ramirez';

function save(team: string, over: Partial<SaveData> = {}): SaveData {
  return { ...startCareer(newSave(), team), ...over };
}

/** A wire that keeps a copy of everything sent over it. */
function recorded(t: Transport, log: string[]): Transport {
  return {
    ...t,
    join: async (code, self) => {
      const link = await t.join(code, self);
      return {
        ...link,
        listen: (events) => link.listen(events),
        leave: () => link.leave(),
        send: (data) => {
          log.push(JSON.stringify(data));
          link.send(data);
        },
      };
    },
  };
}

async function handshake(host: Offer, guest: Offer, court: Parameters<typeof onlineSetup>[5] = null) {
  const clock = new FakeClock();
  const relay = new MemoryRelay({ schedule: clock.schedule, now: clock.now, latency: () => 20 });
  const log: string[] = [];
  const t = recorded(relay.transport(), log);
  const make = (role: 'host' | 'guest', offer: Offer) =>
    new OnlineRoom({ transport: t, code: 'BCDF', role, offer, clock, makeSetup: (h, g) => onlineSetup(squadOf(h), squadOf(g), 2, 60, () => 0.5, court) });
  const h = make('host', host);
  const g = make('guest', guest);
  await h.open();
  await g.open();
  for (let i = 0; i < 50; i++) {
    clock.advance(10);
    await Promise.resolve();
  }
  return { h, g, log };
}

describe('what a device offers', () => {
  it('a wheel name goes as the two words’ places on the wheels, never the words', () => {
    const o = offerFrom(save('comets', { teamName: { words: ['Pixel', 'Puffins'] }, teamColors: 'hot-pink' }), 'waves');
    expect(o.words).toEqual(wordIndexes(['Pixel', 'Puffins']));
    expect(o.colors).toBe('hot-pink');
    expect(o.team).toBe('waves');
    expect(JSON.stringify(o)).not.toMatch(/Pixel|Puffins/);
  });

  it('a typed name is left out altogether', () => {
    const o = offerFrom(save('comets', { teamName: { typed: SECRET } }), null);
    expect(o.words).toBeUndefined();
    expect(o.team).toBeUndefined();
    expect(JSON.stringify(o)).not.toContain(SECRET);
    expect(JSON.stringify(o)).not.toContain('Zelda');
  });
});

describe('the handshake with names and teams', () => {
  it('sends word places and team ids, builds the names from them, and never sends a typed name', async () => {
    const host = offerFrom(save('comets', { teamName: { words: ['Cosmic', 'Otters'] }, teamColors: 'deep-sea' }), null);
    const guest = offerFrom(save('waves', { teamName: { typed: SECRET } }), null);
    const { h, g, log } = await handshake(host, guest);
    expect(h.state.phase).toBe('matched');
    expect(g.state.phase).toBe('matched');
    const s = g.state.setup!;
    expect(s).toEqual(h.state.setup);
    expect(setupOk(s)).toBe(true);
    expect([s.home.name, s.home.colors]).toEqual(['Cosmic Otters', 'deep-sea']);
    // the friend with a typed name is shown by the default label
    expect(s.away.name).toBe('Player 2');
    for (const line of log) expect(line).not.toContain('Zelda');
    const hello = log.map((l) => JSON.parse(l) as Offer & { k: string }).find((m) => m.k === 'hello');
    expect(hello).toBeDefined();
    expect(hello?.words).toBeUndefined();
  });

  it('a guest’s wheel name and team cross as places and an id', async () => {
    const host = offerFrom(save('comets'), 'legends');
    const guest = offerFrom(save('waves', { teamName: { words: ['Lava', 'Llamas'] } }), 'yetis');
    const { g, log } = await handshake(host, guest, 'random');
    const s = g.state.setup!;
    expect(setupOk(s)).toBe(true);
    expect([s.home.kitTeam, s.home.name]).toEqual(['legends', teamById('legends').name]);
    // a side playing a team goes by the team's name
    expect([s.away.kitTeam, s.away.name]).toEqual(['yetis', teamById('yetis').name]);
    expect(s.randomCourt).toBe(true);
    const hello = log.map((l) => JSON.parse(l) as Offer & { k: string }).find((m) => m.k === 'hello')!;
    expect(hello.words).toEqual(wordIndexes(['Lava', 'Llamas']));
    expect(hello.team).toBe('yetis');
    expect(log.find((l) => l.includes('"hello"'))).not.toMatch(/Lava|Llamas/);
  });

  it('a guest’s wheel name is shown to the host when the guest plays its own squad', async () => {
    const { h } = await handshake(offerFrom(save('comets'), null), offerFrom(save('waves', { teamName: { words: ['Lava', 'Llamas'] } }), null));
    expect(h.state.setup!.away.name).toBe('Lava Llamas');
  });
});

describe('checking what arrives', () => {
  const base = { k: 'hello', v: NETCODE_VERSION, fp: 'x', squad: offerFrom(save('comets'), null).squad, uni: null, easy: false };

  it('keeps good word places, colours and teams from a hello, and drops bad ones', () => {
    const good = readMsg({ ...base, words: [3, 4], colors: 'hot-pink', team: 'waves' }) as Offer;
    expect([good.words, good.colors, good.team]).toEqual([[3, 4], 'hot-pink', 'waves']);
    for (const words of [[-1, 0], [0, MASCOT_WORDS.length], [PLACE_WORDS.length, 0], [1.5, 1], ['Lava', 'Llamas'], SECRET]) {
      const m = readMsg({ ...base, words }) as Offer & { k: string };
      expect(m.k).toBe('hello');
      expect(m.words).toBeUndefined();
    }
    const bad = readMsg({ ...base, colors: 'plaid', team: 'no-such-team', name: SECRET }) as Offer & { name?: string };
    expect([bad.colors, bad.team, bad.name]).toEqual([undefined, undefined, undefined]);
  });

  it('refuses a setup whose side has a name the wheels cannot make (it could be typed), or the same team twice', () => {
    const ok = onlineSetup(squadOf(offerFrom(save('comets', { teamName: { words: ['Neon', 'Ninjas'] } }), null)), squadOf(offerFrom(save('waves'), 'yetis')), 2, 60, () => 0.5);
    expect(setupOk(ok)).toBe(true);
    expect(setupOk({ ...ok, home: { ...ok.home, name: SECRET } })).toBe(false);
    expect(setupOk({ ...ok, home: { ...ok.home, name: 'Ninjas Neon' } })).toBe(false);
    expect(setupOk({ ...ok, home: { ...ok.home, short: 'ZEL' } })).toBe(false);
    expect(setupOk({ ...ok, home: { ...ok.home, colors: 'plaid' } })).toBe(false);
    expect(setupOk({ ...ok, away: { ...ok.away, name: teamById('waves').name } })).toBe(false);
    expect(setupOk({ ...ok, home: { ...ok.away, short: 'P1' } })).toBe(false);
    expect(setupOk({ ...ok, randomCourt: 'yes' })).toBe(false);
  });

  it('is a new netcode version: an older build is told to update', () => {
    expect(NETCODE_VERSION).toBeGreaterThanOrEqual(2);
  });
});
