// Two devices playing each other, filmed: two headless Chromiums (chrome.sh with CDP_PORT=9355 and 9356), one
// web build, and the local room relay (node tools/relay/relay.js) between them. The first browser hosts, the second
// joins with the code it reads off the first one's page, and both play one short game.
//
//   node twoDevices.js OUT [APP_URL]            stills of every step into OUT
//   FILM=12 node twoDevices.js OUT              also film 12 s of the match on both, side by side frames in OUT/film
//
// Both pages run the virtual clock (vt.js) once the match starts, and are stepped by turns, 1/30 s at a time, so the
// two views are pictured at the same moment of the same game. Nothing here ships in the app.
const fs = require('fs');
const path = require('path');

const OUT = path.resolve(process.argv[2] || 'two');
const APP = process.argv[3] || 'http://localhost:8095/';
const URL = `${APP}${APP.includes('?') ? '&' : '?'}net=relay`;
const SIZE = { width: 844, height: 390, deviceScaleFactor: 2, mobile: false };
fs.mkdirSync(OUT, { recursive: true });

async function connect(port) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const page = list.find((t) => t.type === 'page');
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
      logs.push(`[${msg.params.type}] ${msg.params.args.map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type)).join(' ')}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      logs.push(`[exception] ${d.text} ${d.exception ? d.exception.description : ''}`);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  await send('Runtime.enable');
  await send('Page.enable');
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${expr.slice(0, 80)}: ${r.exceptionDetails.text} ${r.exceptionDetails.exception ? r.exceptionDetails.exception.description : ''}`);
    return r.result.value;
  };
  const until = async (expr, ms = 60000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try {
        if (await ev(expr)) return true;
      } catch {
        // the page may be between loads
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    throw new Error(`timed out: ${expr}`);
  };
  const shot = async (file, format = 'png') => {
    const r = await send('Page.captureScreenshot', format === 'png' ? { format } : { format, quality: 90 });
    fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  };
  const click = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 50));
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  };
  // the centre of the smallest visible button whose label is (or starts with) the text
  const tap = async (text) => {
    const pos = await ev(`(()=>{ const want=${JSON.stringify(text.toLowerCase())}; const vis=(e)=>{const r=e.getBoundingClientRect(); return r.width>2&&r.height>2&&r.left<innerWidth&&r.top<innerHeight&&r.right>0&&r.bottom>0;}; const al=(e)=>(e.getAttribute('aria-label')||e.textContent||'').toLowerCase().trim(); const all=[...document.querySelectorAll('[role=button]')].filter(vis); let c=all.filter(e=>al(e)===want); if(!c.length) c=all.filter(e=>al(e).startsWith(want)); if(!c.length) return null; c.sort((a,b)=>{const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect(); return ra.width*ra.height-rb.width*rb.height;}); const r=c[0].getBoundingClientRect(); return [r.x+r.width/2, r.y+r.height/2]; })()`);
    if (!pos) throw new Error(`no button "${text}"`);
    await click(pos[0], pos[1]);
  };
  await send('Emulation.setDeviceMetricsOverride', SIZE);
  // two touch points at once need the page held at 1:1
  await send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
  return { send, ev, until, shot, tap, click, logs, port };
}

// a save a few days in, with its own squad: each device brings its own cards
const seed = (team, rngSeed) => `(()=>{
  const mul=(seed)=>{ let s=seed>>>0; return ()=>{ s=(s+0x6d2b79f5)>>>0; let t=s; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; };
  const S=__save; const real=Math.random; Math.random=mul(${rngSeed});
  try {
    S.getState().resetAll(); S.getState().startCareer('${team}'); S.getState().addCoins(4000);
    for (const id of ['playground','playground','allstar','allstar']) { if (S.getState().buyPack(id)) S.getState().openPack(id); }
  } finally { Math.random=real; }
  const owned=S.getState().owned; const best=Object.keys(owned).map((id)=>__roster.mustPlayer(id)).sort((a,b)=>__roster.playerOverall(b)-__roster.playerOverall(a)).slice(0,3).map((p)=>p.id);
  S.getState().setSquad(best);
  S.setState({ tips: { howToPlay: true }, settings: { ...S.getState().settings, quarterSeconds: 20, format: 3 } });
  return S.getState().squad;
})()`;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function setUp(A, B, both) {
  // the virtual clock goes into both pages, following real time until the match is filmed
  await both((d) => d.send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(path.join(__dirname, 'vt.js'), 'utf8') }));
  await both(async (d) => {
    await d.send('Page.resetNavigationHistory').catch(() => {});
    await d.send('Page.navigate', { url: URL });
  });
  await both((d) => d.until('!!globalThis.__save && !!globalThis.__roster'));
  await wait(2500);
  console.log('squads', await A.ev(seed('coyotes', 11)), await B.ev(seed('yetis', 23)));
  await both((d) => d.ev(`(()=>{ __router.replace('/'); return 1 })()`));
  await wait(1200);

  // the 2 PLAYERS choice on the play page
  await A.ev(`(()=>{ __router.push('/play'); return 1 })()`);
  await wait(1200);
  await A.tap('2 PLAYERS');
  await wait(900);
  await A.shot(`${OUT}/01-choice.png`);
  await A.tap('HOST');
  await A.until(`(()=>{ const v=__online.getState().view; return !!v && v.phase==='waiting' })()`, 20000);
  await wait(900);
  const code = await A.ev(`__online.getState().view.code`);
  console.log('code', code);
  await A.shot(`${OUT}/02-host.png`);

  await B.ev(`(()=>{ __router.push('/join'); return 1 })()`);
  await wait(1100);
  await B.tap(code[0]);
  await wait(250);
  await B.tap(code[1]);
  await wait(500);
  await B.shot(`${OUT}/03-join.png`);
  await B.tap(code[2]);
  await wait(250);
  await B.tap(code[3]);
  await both((d) => d.until(`(()=>{ const v=__online.getState().view; return !!v && v.phase==='matched' })()`, 20000));
  await wait(2200);
  await A.shot(`${OUT}/04-versus-host.png`);
  await B.shot(`${OUT}/05-versus-guest.png`);
  await B.tap('TIP-OFF');
  await wait(900);
  await B.shot(`${OUT}/06-versus-guest-waiting.png`);
  await A.tap('TIP-OFF');
  await both((d) => d.until(`!!globalThis.__bs && __online.getState().view.phase==='playing'`, 30000));
}

async function main() {
  const A = await connect(9355);
  const B = await connect(9356);
  const both = (fn) => Promise.all([fn(A), fn(B)]);
  // RESUME=1: the two pages are already in the match (a run that stopped part way): play on from there
  const resume = process.env.RESUME === '1';
  if (!resume) await setUp(A, B, both);
  // from here the two clocks are stepped by turns
  await both((d) => d.ev(`(()=>{ __vt.auto=false; return 1 })()`));
  const step = async (ms) => {
    await A.ev(`__vt.step(${ms})`);
    await wait(3);
    await B.ev(`__vt.step(${ms})`);
    await wait(3);
  };
  // each thumb on its own pad: the stick swings round now and then, with a tap of A every so often
  const thumbs = async (k) => {
    const js = (team, s) => `(()=>{ const r=__bs; if(!r) return 0; const p=r.pads[${team}]; const k=${k}; const a=((k*${s})%360)*Math.PI/180; if(k%25===0){ p.mx=Math.cos(a)*0.9; p.mz=Math.sin(a)*0.9; } p.turbo=(k%60)<30; p.a=(k%45)<3; p.b=(k%97)===0; return r.m.tick; })()`;
    return [await A.ev(js(0, 37)), await B.ev(js(1, 53))];
  };
  const ticks = async () => [await A.ev('__bs.m.tick'), await B.ev('__bs.m.tick')];
  // bring both to the very same tick: step whichever is behind on its own (a few ms, well inside the silence limit)
  const level = async () => {
    for (let i = 0; i < 40; i++) {
      const [a, b] = await ticks();
      if (a === b) return a;
      await (a < b ? A : B).ev('__vt.step(16.6667)');
      await wait(3);
    }
    return -1;
  };
  let k = 0;
  // play into the first quarter
  while (!resume && (await ticks())[0] < 60 * 14) {
    await thumbs(k++);
    await step(1000 / 30);
  }
  const at = resume ? -1 : await level();
  console.log('same moment at tick', at, await ticks());
  await wait(400);
  if (!resume) {
    await A.shot(`${OUT}/07-moment-host.png`);
    await B.shot(`${OUT}/08-moment-guest.png`);
  }
  console.log('hashes', await A.ev('globalThis.__netHash ? __netHash() : 0'), await B.ev('globalThis.__netHash ? __netHash() : 0'));

  const film = Number(process.env.FILM || 0);
  if (film > 0) {
    fs.mkdirSync(`${OUT}/film`, { recursive: true });
    for (let f = 0; f < film * 30; f++) {
      await thumbs(k++);
      await step(1000 / 30);
      await level();
      await wait(30);
      await A.shot(`${OUT}/film/a${String(f).padStart(5, '0')}.jpg`, 'jpeg');
      await B.shot(`${OUT}/film/b${String(f).padStart(5, '0')}.jpg`, 'jpeg');
    }
  }

  if (process.env.NO_FINISH === '1') process.exit(0);
  // play it out, quickly: big steps, the game runs its six ticks a frame
  for (let i = 0; i < 20000; i++) {
    const [a, b] = await ticks().catch(() => [-1, -1]);
    const done = await A.ev(`__session.getState().summary !== null`) && (await B.ev(`__session.getState().summary !== null`));
    if (done) break;
    if (i % 200 === 0) console.log('ticks', a, b, await A.ev(`__online.getState().view?.phase`), await B.ev(`__online.getState().view?.phase`));
    await thumbs(k++);
    await step(100);
  }
  // the results count up in their own time
  for (let i = 0; i < 60; i++) await step(100);
  await A.shot(`${OUT}/09-results-host.png`);
  await B.shot(`${OUT}/10-results-guest.png`);
  console.log('summaries', JSON.stringify(await A.ev(`(()=>{const s=__session.getState(); return [s.summary.score, s.summary.won, s.outcome.rewards.total]})()`)), JSON.stringify(await B.ev(`(()=>{const s=__session.getState(); return [s.summary.score, s.summary.won, s.outcome.rewards.total]})()`)));
  for (const d of [A, B]) for (const l of d.logs.filter((x) => /exception|error|warn/i.test(x)).slice(-8)) console.log(d.port, l.slice(0, 300));
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
