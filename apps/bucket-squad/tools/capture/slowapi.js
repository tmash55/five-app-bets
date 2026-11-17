// The account on a slow line: what a grown-up sees in Settings while the account service takes its time.
//
// The browser cannot sign in with Apple, and the tools must never touch a real account. So this stands a pretend
// account service in front of the page: every request the game sends to its account address is caught at the
// browser (DevTools "Fetch" interception) and answered here, after a delay, the way the real service would
// answer. Nothing leaves the machine. Start the web build with a made-up account address first:
//
//   EXPO_PUBLIC_SUPABASE_URL=https://bucket-squad-test.invalid EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test npx expo start --web
//
//   node slowapi.js --scenario launch  --delay 8000 --out DIR     a signed-in device starts the game
//   node slowapi.js --scenario signout --delay 8000 --out DIR     SIGN OUT with a game still to save
//   node slowapi.js --scenario delete  --delay 8000 --out DIR     DELETE ACCOUNT
//   node slowapi.js --scenario choose  --delay 8000 --out DIR     two saved games: the grown-up picks one
//   ... --hang          the service never answers at all
//   ... --fail          the service answers with an error (after the delay)
//   ... --shots 600,3000,9000   when to photograph, in ms after the step that starts the wait
//   ... --size 844x390@2 --touch
//
// Writes DIR/<scenario>-<ms>.png, and DIR/<scenario>.json with what the account part of the game said at each shot.
const fs = require('fs');
const path = require('path');
const { connect, sleep, readArgs, readSize } = require('./lib');

const args = readArgs();
const SIZE = readSize(args.size, '844x390@2');
const OUT = path.resolve(String(args.out || 'slowapi'));
const SCENARIO = String(args.scenario || 'launch');
const DELAY = Number(args.delay ?? 8000);
const HANG = !!args.hang;
const FAIL = !!args.fail;
const SHOTS = String(args.shots || '600,3000,9000,15000')
  .split(',')
  .map(Number);
const APP = process.env.APP_URL || 'http://localhost:8081/';
const ACCOUNT = process.env.ACCOUNT_URL || 'https://bucket-squad-test.invalid';
const USER = '00000000-0000-4000-8000-000000000001';
fs.mkdirSync(OUT, { recursive: true });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
/** a session as the account client keeps it on the device: good for a year, so nothing needs refreshing */
function session() {
  const exp = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER, role: 'authenticated', aud: 'authenticated', exp })}.sig`;
  return { access_token: token, refresh_token: 'refresh', token_type: 'bearer', expires_in: 365 * 24 * 3600, expires_at: exp, user: { id: USER, aud: 'authenticated', role: 'authenticated', email: 'grown-up@example.com', app_metadata: { provider: 'apple' }, user_metadata: {}, created_at: new Date().toISOString() } };
}

async function main() {
  /** the pretend account: one save row */
  const cloud = { row: null, calls: [] };
  let delay = 0;
  let c = null;
  const answer = async (p) => {
    const { requestId, request } = p;
    const url = new URL(request.url);
    const cors = [
      { name: 'access-control-allow-origin', value: '*' },
      { name: 'access-control-allow-headers', value: '*' },
      { name: 'access-control-allow-methods', value: 'GET,POST,PATCH,PUT,DELETE,OPTIONS' },
      { name: 'access-control-expose-headers', value: '*' },
    ];
    const reply = (status, body) =>
      c.send('Fetch.fulfillRequest', { requestId, responseCode: status, responseHeaders: [...cors, { name: 'content-type', value: 'application/json' }], body: Buffer.from(body === undefined ? '' : JSON.stringify(body)).toString('base64') }).catch(() => {});
    if (request.method === 'OPTIONS') return reply(204);
    cloud.calls.push({ at: Date.now(), method: request.method, path: url.pathname });
    if (HANG && delay > 0) return; // never answered: the request stays open, as on a dead line
    if (delay > 0) await sleep(delay);
    if (FAIL && delay > 0) return reply(503, { message: 'service unavailable' });
    const one = (request.headers.Accept || request.headers.accept || '').includes('vnd.pgrst.object');
    if (url.pathname.startsWith('/rest/v1/bucket_squad_saves')) {
      if (request.method === 'GET') return reply(200, cloud.row ? [cloud.row] : []);
      const body = request.postData ? JSON.parse(request.postData) : {};
      if (request.method === 'POST') {
        if (cloud.row) return reply(409, { code: '23505', message: 'duplicate key' });
        cloud.row = { rev: 1, data: body.data, updated_at: new Date().toISOString() };
        return reply(201, one ? { rev: 1 } : [{ rev: 1 }]);
      }
      if (request.method === 'PATCH') {
        const base = Number((url.searchParams.get('rev') || '').replace('eq.', ''));
        if (!cloud.row || cloud.row.rev !== base) return reply(200, []);
        cloud.row = { rev: body.rev, data: body.data ?? cloud.row.data, updated_at: new Date().toISOString() };
        return reply(200, [{ rev: body.rev }]);
      }
    }
    if (url.pathname.startsWith('/functions/v1/delete-account')) {
      cloud.row = null;
      return reply(200, { ok: true });
    }
    if (url.pathname.startsWith('/auth/v1/logout')) return reply(204);
    if (url.pathname.startsWith('/auth/v1/token')) return reply(200, session());
    if (url.pathname.startsWith('/auth/v1/user')) return reply(200, session().user);
    return reply(404, { message: 'not in the pretend account' });
  };
  c = await connect({
    touch: !!args.touch,
    on: (method, params) => {
      if (method === 'Fetch.requestPaused') void answer(params);
    },
  });
  const { send, evalJs, tap, until, shot } = c;
  await send('Emulation.setDeviceMetricsOverride', { width: SIZE.width, height: SIZE.height, deviceScaleFactor: SIZE.scale, mobile: !!args.touch });
  await send('Emulation.setTouchEmulationEnabled', { enabled: !!args.touch, maxTouchPoints: 5 });
  await send('Fetch.enable', { patterns: [{ urlPattern: `${ACCOUNT}/*` }] });

  const load = async () => {
    await send('Page.resetNavigationHistory').catch(() => {});
    await send('Page.navigate', { url: `${APP}?insets=off` });
    await until('!!globalThis.__save && !!globalThis.__router && !!globalThis.__account');
    await sleep(1500);
  };
  const said = () => evalJs(`(()=>{ const a=__account.getState(); const words=[...document.querySelectorAll('[role=alert],[dir]')].map((e)=>e.textContent).filter((t)=>/account|saved|sign|delet|check|wait|online|taking/i.test(t||'')).slice(0,6); return { phase: a.phase, problem: a.problem, dirty: a.dirty, rev: a.rev, words }; })()`);
  const record = [];
  /** photograph at each of SHOTS ms after `t0` */
  const film = async (t0, tag = '') => {
    for (const ms of SHOTS) {
      const wait = t0 + ms - Date.now();
      if (wait > 0) await sleep(wait);
      const name = `${SCENARIO}${tag}-${String(ms).padStart(5, '0')}.png`;
      // what the game says first, then the picture: a picture of a page with something moving on it can take a while
      const s = await said();
      const at = Date.now() - t0;
      await shot(path.join(OUT, name));
      record.push({ shot: name, ms, at, shotTook: Date.now() - t0 - at, ...s });
      console.log(name, `at ${at} ms, picture took ${Date.now() - t0 - at} ms`, JSON.stringify(s));
    }
  };

  // 1. a guest game with some progress, kept on the device
  await evalJs(`(()=>{ try { localStorage.clear(); } catch {} return 1 })()`).catch(() => {});
  await load();
  await evalJs(`(()=>{ localStorage.removeItem('sb-bucket-squad-test-auth-token'); localStorage.removeItem('bucket-squad-account'); const S=__save; S.getState().resetAll(); S.getState().startCareer('coyotes'); S.getState().addCoins(5200); S.setState({ stats: { ...S.getState().stats, games: 19, wins: 13, packs: 4 }, tips: { howToPlay: true } }); return 1 })()`);
  await sleep(600);
  const device = JSON.parse(await evalJs(`JSON.stringify((()=>{ const s=JSON.parse(localStorage.getItem('bucket-squad-save')); return s.state; })())`));

  // 2. the same device, signed in: the session and what the game remembers about the account
  const meta = SCENARIO === 'choose' ? { userId: null, rev: null, dirty: false, savedAt: null } : { userId: USER, rev: 3, dirty: SCENARIO === 'signout', savedAt: Date.now() - 4 * 60000 };
  cloud.row = SCENARIO === 'choose' ? { rev: 7, data: { ...device, coins: 48210, stats: { ...device.stats, games: 240, wins: 151, packs: 60 } }, updated_at: new Date(Date.now() - 3 * 3600e3).toISOString() } : { rev: 3, data: device, updated_at: new Date(Date.now() - 4 * 60000).toISOString() };
  await evalJs(`(()=>{ localStorage.setItem('sb-bucket-squad-test-auth-token', ${JSON.stringify(JSON.stringify(session()))}); localStorage.setItem('bucket-squad-account', ${JSON.stringify(JSON.stringify({ state: meta, version: 1 }))}); return 1 })()`);

  const openSheet = async () => {
    await evalJs(`(()=>{ __account.setState({ gatePassedAt: Date.now() }); __router.push('/settings'); return 1 })()`);
    await sleep(900);
    await tap('Account, for grown-ups');
    await sleep(500);
  };

  if (SCENARIO === 'launch') {
    // the game starts; the account answers slowly; a grown-up opens Settings and the account pop-up meanwhile
    delay = DELAY;
    const t0 = Date.now();
    await load();
    await openSheet();
    await film(t0);
  } else if (SCENARIO === 'signout') {
    await load();
    await until(`__account.getState().phase === 'signedIn'`, 15000);
    await evalJs(`(()=>{ __save.getState().addCoins(25); return 1 })()`);
    await openSheet();
    delay = DELAY;
    await tap('SIGN OUT');
    await film(Date.now());
  } else if (SCENARIO === 'delete') {
    await load();
    await until(`__account.getState().phase === 'signedIn'`, 15000);
    await openSheet();
    await tap('DELETE ACCOUNT');
    await sleep(500);
    delay = DELAY;
    await tap('DELETE IT');
    await film(Date.now());
  } else if (SCENARIO === 'choose') {
    await load();
    await until(`__account.getState().phase === 'choose'`, 15000);
    await evalJs(`(()=>{ __account.setState({ gatePassedAt: Date.now() }); return 1 })()`);
    await sleep(700);
    await shot(path.join(OUT, `${SCENARIO}-before.png`));
    delay = DELAY;
    await tap('USE THE SAVED GAME');
    await film(Date.now());
  } else {
    console.log('unknown scenario', SCENARIO);
  }

  fs.writeFileSync(path.join(OUT, `${SCENARIO}.json`), JSON.stringify({ scenario: SCENARIO, delay: DELAY, hang: HANG, fail: FAIL, record, calls: cloud.calls.map((x) => ({ ...x, at: x.at - cloud.calls[0].at })) }, null, 1));
  await send('Fetch.disable');
  await evalJs(`(()=>{ localStorage.removeItem('sb-bucket-squad-test-auth-token'); localStorage.removeItem('bucket-squad-account'); return 1 })()`);
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  c.close();
}
main().catch((e) => {
  console.error('slowapi error', e.message);
  process.exit(1);
});
