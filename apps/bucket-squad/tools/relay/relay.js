#!/usr/bin/env node
/**
 * A room relay for playing two devices against each other without Supabase: development, tests and filming only.
 * Rooms are kept by code in memory; every message is copied to the others in the room; everyone hears who is in
 * it. Nothing is stored, and a room goes when the last person leaves.
 *
 *   node tools/relay/relay.js [port]          (default 8787)
 *   RELAY_DELAY_MS=40 RELAY_JITTER_MS=20 ...  a slower network, for watching the netcode work
 *
 * Clients connect to ws://host:port/?room=CODE&id=VISIT&role=host|guest (see src/net/wsTransport.ts).
 */

const { WebSocketServer } = require('ws');

function startRelay(port = 8787, opts = {}) {
  const delay = Number(opts.delay ?? process.env.RELAY_DELAY_MS ?? 0);
  const jitter = Number(opts.jitter ?? process.env.RELAY_JITTER_MS ?? 0);
  const rooms = new Map();
  const wss = new WebSocketServer({ port, host: opts.host ?? '0.0.0.0' });

  const peersOf = (room) => [...room].map((c) => ({ id: c.id, role: c.role }));
  const tellPeers = (room) => {
    const text = JSON.stringify({ t: 'peers', peers: peersOf(room) });
    for (const c of room) if (c.ws.readyState === 1) c.ws.send(text);
  };

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', 'http://relay');
    const code = (url.searchParams.get('room') ?? '').slice(0, 12);
    const id = (url.searchParams.get('id') ?? '').slice(0, 40);
    const role = url.searchParams.get('role') === 'host' ? 'host' : 'guest';
    if (!code || !id) {
      ws.close();
      return;
    }
    let room = rooms.get(code);
    if (!room) {
      room = new Set();
      rooms.set(code, room);
    }
    // each sender's messages keep their order to each receiver, however the delays are picked
    const me = { ws, id, role, lastAt: new Map() };
    room.add(me);
    tellPeers(room);
    ws.on('message', (raw) => {
      let m;
      try {
        m = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!m || m.t !== 'msg') return;
      const text = JSON.stringify({ t: 'msg', from: id, data: m.data });
      for (const c of room) {
        if (c === me) continue;
        const now = Date.now();
        const wait = delay + (jitter > 0 ? Math.random() * jitter : 0);
        const at = Math.max(me.lastAt.get(c) ?? 0, now + wait);
        me.lastAt.set(c, at);
        const deliver = () => c.ws.readyState === 1 && c.ws.send(text);
        if (at <= now) deliver();
        else setTimeout(deliver, at - now);
      }
    });
    ws.on('close', () => {
      room.delete(me);
      if (room.size === 0) rooms.delete(code);
      else tellPeers(room);
    });
  });
  return wss;
}

module.exports = { startRelay };

if (require.main === module) {
  const port = Number(process.argv[2] ?? 8787);
  startRelay(port);
  console.log(`room relay on ws://0.0.0.0:${port}`);
}
