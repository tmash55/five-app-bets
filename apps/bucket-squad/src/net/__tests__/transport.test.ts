/**
 * Every wire keeps the same promises: two people in a room by its code hear each other's messages in order and never
 * their own, see who else is there, see someone leave, and rooms with different codes never mix. The in-memory relay,
 * the WebSocket relay (tools/relay, really started here) and Supabase Realtime (on a fake channel) all run it.
 */

import { roomTopic, supabaseTransport, type ChannelLike, type RealtimeLike } from '../supabaseTransport';
import { MemoryRelay, type Peer, type RoomLink, type Transport } from '../transport';
import { wsTransport } from '../wsTransport';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { startRelay } = require('../../../tools/relay/relay.js') as { startRelay: (port: number, o?: object) => { close: (cb?: () => void) => void; address: () => { port: number } } };

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function until(test: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!test()) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await wait(5);
  }
}

interface Ear {
  link: RoomLink;
  got: { data: unknown; from: string }[];
  peers: Peer[];
}

async function enter(t: Transport, code: string, id: string, role: Peer['role']): Promise<Ear> {
  const link = await t.join(code, { id, role });
  const ear: Ear = { link, got: [], peers: [] };
  link.listen({
    message: (data, from) => ear.got.push({ data, from }),
    presence: (peers) => {
      ear.peers = peers;
    },
  });
  return ear;
}

/** A Supabase project in miniature: channels by topic, broadcast to the others, presence kept by key. */
class FakeRealtime implements RealtimeLike {
  private readonly topics = new Map<string, Set<FakeChannel>>();

  channel(topic: string, key: string): ChannelLike {
    let set = this.topics.get(topic);
    if (!set) {
      set = new Set();
      this.topics.set(topic, set);
    }
    return new FakeChannel(set, key);
  }

  get topicNames(): string[] {
    return [...this.topics.keys()].filter((k) => (this.topics.get(k)?.size ?? 0) > 0);
  }
}

class FakeChannel implements ChannelLike {
  private broadcasts: { event: string; fn: (p: unknown) => void }[] = [];
  private syncs: (() => void)[] = [];
  meta: Record<string, string> | null = null;
  sentCount = 0;

  constructor(
    private readonly others: Set<FakeChannel>,
    readonly key: string,
  ) {}

  onBroadcast(event: string, fn: (p: unknown) => void): void {
    this.broadcasts.push({ event, fn });
  }
  onPresenceSync(fn: () => void): void {
    this.syncs.push(fn);
  }
  subscribe(fn: (status: string) => void): void {
    this.others.add(this);
    setTimeout(() => fn('SUBSCRIBED'), 1);
  }
  presence(): Record<string, unknown[]> {
    const out: Record<string, unknown[]> = {};
    for (const c of this.others) if (c.meta) out[c.key] = [{ ...c.meta, presence_ref: 'x' }];
    return out;
  }
  private sync(): void {
    for (const c of this.others) setTimeout(() => c.syncs.forEach((f) => f()), 1);
  }
  async track(meta: Record<string, string>): Promise<unknown> {
    this.meta = meta;
    this.sync();
    return 'ok';
  }
  async broadcast(event: string, payload: unknown): Promise<unknown> {
    this.sentCount++;
    const copy = JSON.parse(JSON.stringify(payload));
    // broadcast with self off: everybody else on the topic
    for (const c of this.others) if (c !== this) for (const b of c.broadcasts) if (b.event === event) setTimeout(() => b.fn({ ...copy }), 1);
    return 'ok';
  }
  remove(): void {
    this.others.delete(this);
    this.sync();
  }
}

const relays: { close: (cb?: () => void) => void }[] = [];
afterAll(async () => {
  await Promise.all(relays.map((r) => new Promise<void>((res) => r.close(() => res()))));
});

const WIRES: [string, () => Promise<Transport>][] = [
  ['in memory', async () => new MemoryRelay().transport()],
  [
    'the WebSocket relay',
    async () => {
      const server = startRelay(0, { host: '127.0.0.1' });
      relays.push(server);
      await new Promise((r) => setTimeout(r, 50));
      return wsTransport(`ws://127.0.0.1:${server.address().port}`);
    },
  ],
  [
    'Supabase Realtime',
    async () => {
      const rt = new FakeRealtime();
      return supabaseTransport(() => rt);
    },
  ],
];

describe.each(WIRES)('the room contract, %s', (_name, make) => {
  it('carries messages both ways, in order, never back to the sender, and shows who is there', async () => {
    const t = await make();
    const host = await enter(t, 'BCDF', 'h1', 'host');
    const guest = await enter(t, 'BCDF', 'g1', 'guest');
    await until(() => host.peers.length === 1 && guest.peers.length === 1);
    expect(host.peers).toEqual([{ id: 'g1', role: 'guest' }]);
    expect(guest.peers).toEqual([{ id: 'h1', role: 'host' }]);
    for (let i = 0; i < 20; i++) host.link.send({ k: 'n', i });
    guest.link.send({ k: 'hi', squad: [{ id: 'x', level: 2 }] });
    await until(() => guest.got.length === 20 && host.got.length === 1);
    expect(guest.got.map((g) => (g.data as { i: number }).i)).toEqual([...Array(20).keys()]);
    expect(guest.got.every((g) => g.from === 'h1')).toBe(true);
    expect(host.got).toEqual([{ data: { k: 'hi', squad: [{ id: 'x', level: 2 }] }, from: 'g1' }]);
    host.link.leave();
    guest.link.leave();
  });

  it('keeps rooms apart and tells the others when someone leaves', async () => {
    const t = await make();
    const a = await enter(t, 'GHJK', 'a', 'host');
    const b = await enter(t, 'GHJK', 'b', 'guest');
    const c = await enter(t, 'MNPR', 'c', 'host');
    await until(() => a.peers.length === 1 && b.peers.length === 1);
    a.link.send({ k: 'only-ghjk' });
    await until(() => b.got.length === 1);
    await wait(30);
    expect(c.got).toEqual([]);
    expect(c.peers).toEqual([]);
    b.link.leave();
    await until(() => a.peers.length === 0);
    // a message after leaving goes nowhere
    b.link.send({ k: 'late' });
    await wait(30);
    expect(a.got).toEqual([]);
    a.link.leave();
    c.link.leave();
  });
});

describe('Supabase Realtime rooms', () => {
  it('use one prefixed channel per room code, and send who it is from with each message', async () => {
    const rt = new FakeRealtime();
    const t = supabaseTransport(() => rt);
    const host = await enter(t, 'TVWX', 'h', 'host');
    expect(rt.topicNames).toEqual([roomTopic('TVWX')]);
    expect(roomTopic('TVWX')).toBe('bucket-squad-room-TVWX');
    const guest = await enter(t, 'TVWX', 'g', 'guest');
    await until(() => host.peers.length === 1);
    guest.link.send({ k: 'ready' });
    await until(() => host.got.length === 1);
    expect(host.got[0]).toEqual({ data: { k: 'ready' }, from: 'g' });
    host.link.leave();
    guest.link.leave();
    await wait(10);
    expect(rt.topicNames).toEqual([]);
  });

  it('gives up joining when the channel never subscribes', async () => {
    const stuck: RealtimeLike = {
      channel: () => ({
        onBroadcast: () => undefined,
        onPresenceSync: () => undefined,
        subscribe: (fn) => setTimeout(() => fn('CHANNEL_ERROR'), 1),
        presence: () => ({}),
        track: async () => 'ok',
        broadcast: async () => 'ok',
        remove: () => undefined,
      }),
    };
    await expect(supabaseTransport(() => stuck).join('BCDF', { id: 'x', role: 'host' })).rejects.toThrow('CHANNEL_ERROR');
  });
});
