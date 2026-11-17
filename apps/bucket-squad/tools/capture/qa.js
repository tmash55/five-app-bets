// Walks every screen at one size and checks each for layout faults, the way a tester with a ruler would:
// things past the edge of the screen, words cut short, buttons too small for a finger, buttons on top of each other.
// With --touch the walk is done with a finger (touch events, no mouse), with --net the browser's line is throttled,
// and with --cpu the page's processor is slowed, as on an old device.
//
//   node qa.js --size 667x375@1 --out DIR [--touch] [--insets iphone] [--net 3g|slow3g] [--cpu 6] [--only home,play]
//
// Writes DIR/<nn>-<screen>.png and DIR/report.json (one entry per screen: the faults found and how long the page took
// to come up). Nothing here ships in the app. Start the web build and chrome.sh first (see README.md).
const fs = require('fs');
const path = require('path');

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args[a.slice(2)] = true;
  else args[a.slice(2)] = process.argv[++i];
}
const [wh, dsf] = String(args.size || '844x390@1').split('@');
const [W, H] = wh.split('x').map(Number);
const SCALE = Number(dsf || 1);
const OUT = path.resolve(String(args.out || 'qa'));
const TOUCH = !!args.touch;
const PORT = process.env.CDP_PORT || 9333;
const APP = process.env.APP_URL || 'http://localhost:8081/';
const ONLY = args.only ? String(args.only).split(',') : null;
fs.mkdirSync(OUT, { recursive: true });

/** the browser's own throttling presets, as DevTools has them (bytes a second, ms) */
const NETS = {
  '3g': { offline: false, latency: 562.5, downloadThroughput: (1.6 * 1024 * 1024) / 8 * 0.9, uploadThroughput: (750 * 1024) / 8 * 0.9 },
  slow3g: { offline: false, latency: 2000, downloadThroughput: (500 * 1024) / 8 * 0.8, uploadThroughput: (500 * 1024) / 8 * 0.8 },
  offline: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
  off: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
};

// a save with a bit of everything (the same one screens.js uses)
const SEED = `(()=>{
  const mul=(seed)=>{ let s=seed>>>0; return ()=>{ s=(s+0x6d2b79f5)>>>0; let t=s; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; };
  const S=__save; const real=Math.random; Math.random=mul(11);
  try {
    S.getState().resetAll(); S.getState().startCareer('coyotes'); S.getState().addCoins(5200);
    for (const id of ['playground','playground','playground','allstar','allstar','legend']) { if (S.getState().buyPack(id)) S.getState().openPack(id); }
    S.getState().openPack('playground');
    S.getState().buyPack('allstar');
  } finally { Math.random=real; }
  const owned=S.getState().owned; const best=Object.keys(owned).map((id)=>__roster.mustPlayer(id)).sort((a,b)=>__roster.playerOverall(b)-__roster.playerOverall(a)).slice(0,3).map((p)=>p.id);
  S.getState().setSquad(best);
  S.setState({ tour: { 'neighborhood/0/0': 3, 'neighborhood/0/1': 2, 'neighborhood/0/2': 3, 'neighborhood/1/0': 1 }, ladder: { points: 310, games: 14, wins: 9, bestTier: 2 }, stats: { ...S.getState().stats, games: 19, wins: 13, points: 402, dunks: 58, threes: 21, steals: 44, blocks: 17, perfects: 23, bestMargin: 16 }, tips: { howToPlay: true } });
  return { coins: S.getState().coins, owned: Object.keys(S.getState().owned).length, squad: S.getState().squad };
})()`;

/**
 * The ruler, run inside the page. A fault has a kind, the words or label it is about, and its box.
 * - `off`: something to read or press reaches past the edge of the screen, outside any list that scrolls
 * - `cut`: words that end in dots, or lose lines, because they do not fit their box
 * - `small`: something to press that is under MIN_TAP on a side
 * - `overlap`: two things to press whose boxes share room
 * - `edge`: something to press that sits in the strip a phone keeps for itself (the home bar, the notch), or hard
 *   against the bottom edge of the screen
 * - `scroll`: the page itself scrolls (a game page never should)
 */
const INSETS = args.insets === 'iphone' ? [0, 62, 21, 62] : args.insets && args.insets !== 'off' ? String(args.insets).split(',').map(Number) : [0, 0, 0, 0];
const AUDIT = `(()=>{
  const MIN_TAP = 44;
  const [IN_TOP, IN_RIGHT, IN_BOTTOM, IN_LEFT] = ${JSON.stringify(INSETS)};
  // lit lettering keeps room round itself for its glow, and that room grows with the screen
  const GLOW_PAD = Math.max(13, Math.round(innerHeight * 0.04));
  const out = [];
  const vw = innerWidth, vh = innerHeight;
  const rectOf = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; };
  const shown = (e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let n = e; n && n !== document.body; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) < 0.05) return false; }
    return true;
  };
  // the box an element can really be seen in: its own, cut by every ancestor that clips or scrolls
  const seenBox = (e) => {
    const r = e.getBoundingClientRect(); let x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom; let scrolls = false;
    for (let n = e.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      const s = getComputedStyle(n);
      const cx = s.overflowX !== 'visible', cy = s.overflowY !== 'visible';
      if (!cx && !cy) continue;
      if (/(auto|scroll)/.test(s.overflowX + s.overflowY)) scrolls = true;
      const b = n.getBoundingClientRect();
      if (cx) { x0 = Math.max(x0, b.left); x1 = Math.min(x1, b.right); }
      if (cy) { y0 = Math.max(y0, b.top); y1 = Math.min(y1, b.bottom); }
    }
    return { x0, y0, x1, y1, scrolls, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  };
  const inScroller = (e) => { for (let n = e.parentElement; n && n !== document.body; n = n.parentElement) { const s = getComputedStyle(n); if (/(auto|scroll)/.test(s.overflowX + s.overflowY)) return true; } return false; };
  const words = (e) => (e.getAttribute('aria-label') || e.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 60);
  const top = (e) => { const r = e.getBoundingClientRect(); const h = document.elementFromPoint(Math.min(vw - 1, Math.max(0, r.x + r.width / 2)), Math.min(vh - 1, Math.max(0, r.y + r.height / 2))); return !!h && (e.contains(h) || h.contains(e)); };

  // the page itself must not scroll
  const se = document.scrollingElement;
  const fixed = (n) => /(hidden|clip)/.test(getComputedStyle(n).overflowX) && /(hidden|clip)/.test(getComputedStyle(n).overflowY);
  if (se && (se.scrollWidth > vw + 1 || se.scrollHeight > vh + 1) && !fixed(document.body) && !fixed(document.documentElement)) out.push({ kind: 'scroll', what: 'page ' + se.scrollWidth + 'x' + se.scrollHeight });

  // words: every element that holds text directly
  const texts = [...document.querySelectorAll('div[dir],span')].filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '') && shown(e));
  for (const e of texts) {
    const s = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    if (e.scrollWidth > e.clientWidth + 1 && s.overflowX !== 'visible' && s.textOverflow === 'ellipsis') out.push({ kind: 'cut', what: words(e), box: rectOf(e), by: e.scrollWidth - e.clientWidth });
    else if (s.webkitLineClamp && s.webkitLineClamp !== 'none' && e.scrollHeight > e.clientHeight + 2) out.push({ kind: 'cut', what: words(e), box: rectOf(e), lines: s.webkitLineClamp });
    // lit lettering keeps room round itself for its glow (GLOW_PAD), and that room may hang over an edge: only more than that counts
    if (!inScroller(e) && top(e) && (r.right > vw + GLOW_PAD || r.left < -GLOW_PAD || r.bottom > vh + GLOW_PAD || r.top < -GLOW_PAD)) out.push({ kind: 'off', what: words(e), box: rectOf(e) });
    // words cut by a box that does not scroll: more than a sliver of the letters is hidden
    const sb = seenBox(e);
    if (!sb.scrolls && top(e) && (sb.w < r.width - GLOW_PAD || sb.h < r.height - GLOW_PAD) && r.width > 4) out.push({ kind: 'clipped', what: words(e), box: rectOf(e), seen: Math.round(sb.w) + 'x' + Math.round(sb.h) });
  }

  // things to press
  const btns = [...document.querySelectorAll('[role=button],button,a[href],[role=tab],[role=switch],[role=checkbox],[role=radio]')].filter((e) => shown(e) && e.getAttribute('aria-disabled') !== 'true');
  const live = btns.filter(top);
  for (const e of live) {
    const r = e.getBoundingClientRect();
    if (!inScroller(e) && (r.right > vw + 1 || r.left < -1 || r.bottom > vh + 1 || r.top < -1)) out.push({ kind: 'off', what: 'button: ' + words(e), box: rectOf(e) });
    if (r.width < MIN_TAP - 0.5 || r.height < MIN_TAP - 0.5) out.push({ kind: 'small', what: words(e), box: rectOf(e) });
    // the phone's own strips, and never flush with the bottom edge (a full-screen thing to press is not a button to miss)
    const big = r.width * r.height > vw * vh * 0.5;
    if (!big && !inScroller(e) && (r.bottom > vh - Math.max(IN_BOTTOM, 4) + 1 || r.left < IN_LEFT - 1 || r.right > vw - IN_RIGHT + 1 || r.top < IN_TOP - 1)) out.push({ kind: 'edge', what: words(e), box: rectOf(e) });
  }
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) {
    const a = live[i], b = live[j];
    if (a.contains(b) || b.contains(a)) continue;
    const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
    // only the part of each that can be seen counts: a tile scrolled away under its list's edge is on top of nothing
    const sa = seenBox(a), sb = seenBox(b);
    const ox = Math.min(sa.x1, sb.x1) - Math.max(sa.x0, sb.x0), oy = Math.min(sa.y1, sb.y1) - Math.max(sa.y0, sb.y0);
    // a page that is one big thing to press (tap anywhere to open the pack) has its other buttons on top of it by design
    if (ra.width * ra.height > vw * vh * 0.5 || rb.width * rb.height > vw * vh * 0.5) continue;
    if (ox > 3 && oy > 3) out.push({ kind: 'overlap', what: words(a) + ' / ' + words(b), box: rectOf(a), other: rectOf(b), by: Math.round(ox) + 'x' + Math.round(oy) });
  }
  return { faults: out, buttons: live.length, texts: texts.length };
})()`;

async function connect() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  let page = list.find((t) => t.type === 'page');
  if (!page) page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  const logs = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(JSON.stringify(msg.error)));
      else res(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      if (msg.params.type === 'error' || msg.params.type === 'warning') logs.push(`[${msg.params.type}] ${msg.params.args.map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type)).join(' ')}`.slice(0, 400));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      logs.push(`[exception] ${d.text} ${d.exception ? d.exception.description : ''}`.slice(0, 400));
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : '') };
    return r.result.value;
  };
  return { ws, send, evalJs, logs };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const FIND = (want) => `(()=>{ const want=${JSON.stringify(want)}.toLowerCase(); const vis=(e)=>{const r=e.getBoundingClientRect(); return r.width>2&&r.height>2&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight;}; const lab=(e)=>((e.getAttribute('aria-label')||'')+' '+(e.textContent||'')).toLowerCase(); const btn=[...document.querySelectorAll('[role=button],button,a,[tabindex]')].filter(vis); const al=(e)=>(e.getAttribute('aria-label')||'').toLowerCase(); let c=btn.filter(e=>al(e)===want); if(!c.length) c=btn.filter(e=>al(e).startsWith(want)); if(!c.length) c=btn.filter(e=>lab(e).includes(want)); if(!c.length) c=[...document.querySelectorAll('div,span')].filter(e=>vis(e)&&lab(e).includes(want)); if(!c.length) return null; const top=(e)=>{const r=e.getBoundingClientRect(); const h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return !!h&&(e.contains(h)||h.contains(e))&&e.getAttribute('aria-disabled')!=='true';}; const live=c.filter(top); if(live.length) c=live; c.sort((a,b)=>{const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect(); return ra.width*ra.height-rb.width*rb.height;}); const r=c[0].getBoundingClientRect(); return [Math.round(r.x+r.width/2), Math.round(r.y+r.height/2)]; })()`;

async function main() {
  const c = await connect();
  const { send, evalJs } = c;
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: SCALE, mobile: TOUCH });
  await send('Emulation.setTouchEmulationEnabled', { enabled: TOUCH, maxTouchPoints: 5 });
  await send('Emulation.setEmitTouchEventsForMouse', { enabled: false }).catch(() => {});
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await send('Network.emulateNetworkConditions', NETS.off);

  const press = async (x, y) => {
    if (TOUCH) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await sleep(60);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await sleep(60);
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    }
  };
  const tap = async (label) => {
    const pos = await evalJs(FIND(label));
    if (!pos || pos.error) {
      console.log('  tap: not found', label);
      return false;
    }
    await press(pos[0], pos[1]);
    return true;
  };
  const until = async (expr, ms = 60000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const v = await evalJs(expr);
      if (v && !v.error) return Date.now() - t0;
      await sleep(100);
    }
    return -1;
  };

  // the page loads on a full line and a full processor: on a phone the game is on the device, not downloaded
  const url = APP + (args.insets ? `${APP.includes('?') ? '&' : '?'}insets=${args.insets}` : `${APP.includes('?') ? '&' : '?'}insets=off`);
  await send('Page.resetNavigationHistory').catch(() => {});
  await send('Page.navigate', { url });
  await until('!!globalThis.__save && !!globalThis.__router');
  await sleep(2500);
  console.log('seed', JSON.stringify(await evalJs(SEED)));
  if (args.net && NETS[args.net]) await send('Network.emulateNetworkConditions', NETS[args.net]);
  if (args.cpu) await send('Emulation.setCPUThrottlingRate', { rate: Number(args.cpu) });

  const report = { size: `${W}x${H}@${SCALE}`, touch: TOUCH, insets: args.insets || null, net: args.net || null, cpu: args.cpu ? Number(args.cpu) : 1, scale: null, screens: [] };
  let n = 0;
  const snap = async (name, extra = {}) => {
    n++;
    if (ONLY && !ONLY.includes(name)) return;
    const file = `${String(n).padStart(2, '0')}-${name}.png`;
    const audit = await evalJs(AUDIT);
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(OUT, file), Buffer.from(r.data, 'base64'));
    const errors = c.logs.splice(0);
    report.screens.push({ name, file, ...extra, ...(audit && !audit.error ? audit : { faults: [], auditError: audit && audit.error }), errors });
    const f = audit && audit.faults ? audit.faults : [];
    const count = (k) => f.filter((x) => x.kind === k).length;
    console.log(`${file}  off ${count('off')}  cut ${count('cut')}  clipped ${count('clipped')}  small ${count('small')}  edge ${count('edge')}  overlap ${count('overlap')}  scroll ${count('scroll')}  errors ${errors.length}${extra.ms !== undefined ? `  up in ${extra.ms} ms` : ''}`);
  };
  const home = async () => {
    await evalJs(`(()=>{ __router.dismissTo('/'); return 1 })()`);
    await sleep(350);
  };
  /** go to a page from home, and time how long it takes to be on the glass (two frames after the address changes) */
  const go = async (route, name, wait = 900) => {
    if (ONLY && !ONLY.includes(name)) {
      n++;
      return;
    }
    await home();
    const ms = await evalJs(`new Promise((done)=>{ const t0=performance.now(); __router.push(${JSON.stringify(route)}); const want=${JSON.stringify(String(route).split('?')[0])}; const tick=()=>{ if (location.pathname===want || performance.now()-t0>20000) requestAnimationFrame(()=>requestAnimationFrame(()=>done(Math.round(performance.now()-t0)))); else requestAnimationFrame(tick); }; tick(); })`);
    await sleep(wait);
    await snap(name, { ms: typeof ms === 'number' ? ms : null });
  };

  await evalJs(`(()=>{ __router.replace('/'); return 1 })()`);
  await sleep(5000);
  await snap('home');
  await go('/play', 'play');
  await go('/tour', 'tour');
  await go('/ladder', 'ladder');
  await go('/quick', 'quick');
  await go('/duo', 'duo');
  await go('/host', 'host', 1600);
  await go('/join', 'join');
  await go('/squad', 'squad');
  await go('/team', 'team');
  await go('/shelf', 'shelf');
  await home();
  await evalJs(`(()=>{ const s=__save.getState().squad[0]; __router.push('/player/' + s); return s })()`);
  await sleep(900);
  await snap('player');
  await go('/packs', 'shop-daily', 1500);
  await go('/packs?tab=packs', 'shop-packs');
  await go('/uniforms', 'uniforms');
  await go('/missions', 'missions');
  await go('/settings', 'settings');
  // the account pop-ups, drawn from the store (nothing is sent anywhere)
  if (!ONLY || ONLY.some((x) => x.startsWith('account') || x === 'gate' || x === 'two-saves')) {
    await home();
    await evalJs(`(()=>{ __router.push('/settings'); return 1 })()`);
    await sleep(900);
    if (await tap('Account, for grown-ups')) {
      await sleep(500);
      await snap('gate');
      await evalJs(`(()=>{ __account.setState({ gatePassedAt: Date.now() }); return 1 })()`);
      await tap('CLOSE');
      await sleep(300);
      await tap('Account, for grown-ups');
      await sleep(500);
      await snap('account-signed-out');
      await evalJs(`(()=>{ __account.setState({ phase: 'signedIn', userId: 'u', rev: 3, savedAt: Date.now() - 240000, dirty: false, problem: null }); return 1 })()`);
      await sleep(400);
      await snap('account-signed-in');
      await evalJs(`(()=>{ __account.setState({ phase: 'signedIn', problem: 'offline', dirty: true }); return 1 })()`);
      await sleep(400);
      await snap('account-offline');
      await tap('CLOSE');
      await evalJs(`(()=>{ __account.setState({ phase: 'choose', problem: null, choiceHidden: false, choice: { device: { players: 23, coins: 12450, games: 118 }, cloud: { players: 141, coins: 1203450, games: 2315 } } }); return 1 })()`);
      await sleep(500);
      await snap('two-saves');
      await evalJs(`(()=>{ __account.setState({ phase: 'signedOut', userId: null, rev: null, savedAt: null, dirty: false, problem: null, choice: null, gatePassedAt: 0 }); return 1 })()`);
      await sleep(300);
    } else n += 5;
  } else n += 5;
  // a tour game: versus, the match with its pad, the pause menu, how to play, then the results
  if (!ONLY || ONLY.some((x) => ['versus', 'match', 'pause', 'howto', 'results'].includes(x))) {
    await home();
    await evalJs(`(()=>{ __router.push('/tour'); return 1 })()`);
    await sleep(700);
    await tap('Rivalry');
    await sleep(400);
    await evalJs(`(()=>{ const st=__session.getState(); __session.setState({ setup: { ...st.setup, seed: 238, demo: true } }); return 1 })()`);
    await sleep(900);
    await snap('versus');
    await tap('TIP-OFF');
    const up = await until('!!(globalThis.__bs && globalThis.__bs.renderer)');
    await sleep(5200);
    await snap('match', { ms: up });
    await tap('Pause');
    await sleep(600);
    await snap('pause');
    await tap('How to play');
    await sleep(600);
    await snap('howto');
    await tap('BACK');
    await sleep(300);
    await tap('Resume');
    await sleep(300);
    await evalJs(`(()=>{ const r=__bs; let n=0; while (r.m.phase !== 'final' && n < 200000) { r.tick(); n++; } return { score: r.m.score, n } })()`);
    await until("location.pathname==='/results'");
    await sleep(3600);
    await snap('results');
  } else n += 5;
  // opening a pack
  if (!ONLY || ONLY.some((x) => ['pack', 'reveal'].includes(x))) {
    await home();
    await evalJs(`(()=>{ __router.push({ pathname: '/open', params: { pack: 'allstar' } }); return 1 })()`);
    await sleep(900);
    await snap('pack');
    await tap('Open the pack');
    await sleep(6000);
    await snap('reveal');
  } else n += 2;
  // first launch
  if (!ONLY || ONLY.some((x) => x.startsWith('welcome'))) {
    await evalJs(`(()=>{ __save.getState().resetAll(); __router.replace('/welcome'); return 1 })()`);
    await sleep(1200);
    await snap('welcome');
    await tap('Yetis');
    await sleep(700);
    await snap('welcome-team');
  }

  report.scale = await evalJs(`(()=>{ const e=[...document.querySelectorAll('[role=button]')][0]; return e ? getComputedStyle(e).fontSize : null })()`);
  await send('Network.emulateNetworkConditions', NETS.off);
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 1));
  const total = report.screens.reduce((s, x) => s + x.faults.length, 0);
  console.log(`${report.screens.length} screens, ${total} faults -> ${path.join(OUT, 'report.json')}`);
  c.ws.close();
}
main().catch((e) => {
  console.error('qa error', e.message);
  process.exit(1);
});
