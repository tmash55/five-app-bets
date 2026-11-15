// Frame costs of a whole demo match in the web build, under a slowed CPU: node perfmatch.js [options]
//
//   --size 1024x768@2   viewport in CSS pixels and device scale (an older iPad by default)
//   --throttle 4        CDP CPU throttling rate (1 = this machine's speed)
//   --court park        court id
//   --seed 238          match seed (demo: the person's team plays itself, so it is the same game every time)
//   --frames 0          stop after this many frames (0: play to the final whistle)
//   --tier -1           force a graphics level (0 sharpest ... see src/game/quality.ts), -1 leaves Auto
//   --quarter 45        quarter length in seconds
//   --out FILE          write the per-frame numbers and the summary as JSON
//   --shot FILE         after --shotAt seconds of play, draw --fill frames for real (timing the software GPU on each),
//   --shotAt 30         take a picture and stop: the same moment of the same match at each --tier, and its fill cost
//   --fill 12
//   --draw              let the software GPU draw every frame (slow: a few frames for a picture or a fill measure);
//                       left out, the draw calls are dropped at the WebGL boundary, after three.js has done all its own
//                       work for them, so the software GPU never holds up the page and only JavaScript is measured
//
// How it measures: the page clock is the virtual clock of vt.js, stepped exactly 1/60 s per frame, so the match runs
// as on a 60 Hz screen that never drops a frame. Each frame's JavaScript is timed with the real clock: the simulation
// steps, the animator (MatchMotion.frame), three.js submitting the scene, and everything else on the frame. After the
// frame, with --draw, reading one pixel back makes the software GPU finish drawing it before the next one, so its time
// never lands in the next frame's JavaScript; that wait is noted on its own as a rough measure of the frame's fill.
// The CPU throttle slows the page's main thread only, not the GPU process.
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
const opt = (name, d) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : d;
};
const PORT = process.env.CDP_PORT || 9333;
const URL = process.env.APP_URL || 'http://localhost:8081/';
const size = opt('size', '1024x768@2');
const throttle = Number(opt('throttle', '4'));
const court = opt('court', 'park');
const seed = Number(opt('seed', '238'));
const maxFrames = Number(opt('frames', '0'));
const tier = Number(opt('tier', '-1'));
const quarter = Number(opt('quarter', '45'));
const out = opt('out', '');
const shot = opt('shot', '');
const shotAt = Number(opt('shotAt', '30'));
const fill = Number(opt('fill', '12'));
const draw = argv.includes('--draw');

// a save with a squad (same as screens.js), and the how-to already seen
const SEED_SAVE = `(()=>{
  const mul=(seed)=>{ let s=seed>>>0; return ()=>{ s=(s+0x6d2b79f5)>>>0; let t=s; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; };
  const S=__save; const real=Math.random; Math.random=mul(11);
  try {
    S.getState().resetAll(); S.getState().startCareer('coyotes'); S.getState().addCoins(5200);
    for (const id of ['playground','playground','playground','allstar','allstar','legend']) { if (S.getState().buyPack(id)) S.getState().openPack(id); }
  } finally { Math.random=real; }
  const owned=S.getState().owned; const best=Object.keys(owned).map((id)=>__roster.mustPlayer(id)).sort((a,b)=>__roster.playerOverall(b)-__roster.playerOverall(a)).slice(0,3).map((p)=>p.id);
  S.getState().setSquad(best);
  S.setState({ tips: { howToPlay: true } });
  S.getState().setSetting('quarterSeconds', ${quarter});
  return S.getState().squad;
})()`;

const START = `(()=>{
  const S=__save.getState();
  const prefs={ squad: S.squad.map((id)=>({ id, level: 1 })), quarterSeconds: ${quarter}, easyShots: true, homeTeam: S.homeTeam, uniform: S.uniform };
  let r=0x1234; const rng=()=>{ r=(r*1103515245+12345)>>>0; return r/4294967296; };
  const setup=__setups.quickSetup(prefs, { perTeam: 3, difficulty: 1, opponent: null, court: '${court}' }, rng);
  __session.getState().begin({ ...setup, court: '${court}', seed: ${seed}, demo: true });
  __router.push('/match');
  return setup.away.players.map((p)=>p.id).length;
})()`;

// in the page: play frames until the final whistle (or the limit), a chunk per call
const LOOP = `(async (limit) => {
  const now = window.__realNow;
  const r = globalThis.__bs; const R = r.renderer;
  const st = (globalThis.__pm ??= { f: [], sim: 0, steps: 0, anim: 0, submit: 0, draw: 0, wrapped: false });
  if (!st.wrapped) {
    st.wrapped = true;
    const tick = r.tick.bind(r); r.tick = () => { const t = now(); tick(); st.sim += now() - t; st.steps++; };
    const mo = R.motion; const frame = mo.frame.bind(mo); mo.frame = (...a) => { const t = now(); frame(...a); st.anim += now() - t; };
    const three = R.three; const render = three.render.bind(three); three.render = (...a) => { const t = now(); render(...a); st.submit += now() - t; st.drew = true; };
    const draw = R.render.bind(R); R.render = (...a) => { const t = now(); draw(...a); st.draw += now() - t; };
  }
  const gl = r.gl;
  const px = new Uint8Array(4);
  st.drawOn ??= ${draw};
  if (!st.drawOff && !st.drawOn) {
    st.drawOff = true;
    for (const k of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) gl[k] = () => {};
  }
  const yieldReal = () => new Promise((res) => window.__realSetTimeout(res, 0));
  for (let i = 0; i < limit; i++) {
    if (r.m.phase === 'final' && r.m.phaseT > 2.3) return { done: true, n: st.f.length };
    st.sim = 0; st.steps = 0; st.anim = 0; st.submit = 0; st.draw = 0; st.drew = false;
    const t0 = now();
    __vt.step(1000 / 60);
    const t1 = now();
    if (st.drawOn) gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const t2 = now();
    const info = R.three.info.render;
    st.f.push([+(t1 - t0).toFixed(3), +st.sim.toFixed(3), st.steps, +st.anim.toFixed(3), +st.submit.toFixed(3), +st.draw.toFixed(3), +(t2 - t1).toFixed(3), st.drew ? info.calls : 0, st.drew ? info.triangles : 0, gl.drawingBufferWidth * gl.drawingBufferHeight]);
    if (i % 30 === 29) await yieldReal();
  }
  return { done: false, n: st.f.length, t: +r.m.time.toFixed(1) };
})`;

async function main() {
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
      logs.push(msg.params.args.map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type)).join(' '));
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
  const js = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : ''));
    return r.result.value;
  };
  const until = async (expr, ms = 60000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await js(expr).catch(() => false)) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`timed out: ${expr}`);
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const [wh, dsf] = size.split('@');
  const [w, h] = wh.split('x').map(Number);
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: Number(dsf || 1), mobile: false });
  const pre = `window.__realNow = performance.now.bind(performance); window.__realSetTimeout = setTimeout.bind(window);`;
  await send('Page.addScriptToEvaluateOnNewDocument', { source: pre + fs.readFileSync(path.join(__dirname, 'vt.js'), 'utf8') });
  // a blank page first, so nothing below can be answered by the page that was open before
  await send('Page.navigate', { url: 'about:blank' });
  await until('location.href === "about:blank"');
  await send('Page.resetNavigationHistory').catch(() => {});
  await send('Page.navigate', { url: URL });
  await until('location.href !== "about:blank" && !!globalThis.__save && !!globalThis.__setups');
  await new Promise((r) => setTimeout(r, 2500));
  // the page can still reload once while it starts: make the save again until it holds
  await until(`!!globalThis.__save && (${SEED_SAVE}).length === 3`);
  await new Promise((r) => setTimeout(r, 1500));
  await js(START);
  // the pages can still be settling after the save was replaced: start again until the match is on screen
  await until(`(location.pathname === '/match' && !!(globalThis.__bs && __bs.renderer && __bs.gl)) || (location.pathname !== '/match' && (${START}, false))`, 90000);
  // hold the level once the match is on screen (the page can reload while it starts, which forgets an earlier force)
  if (tier >= 0) {
    await until(`!!globalThis.__quality && (__quality.force(${tier}), __quality.describe().some((g) => g.locked && g.level === ${tier}))`, 20000);
  }
  // let the countdown begin in real time, then freeze the clock and slow the CPU
  await new Promise((r) => setTimeout(r, 1500));
  await js('(__vt.auto = false, 1)');
  await send('Emulation.setCPUThrottlingRate', { rate: throttle });
  const t0 = Date.now();
  let shotTaken = !shot;
  for (;;) {
    const chunk = shotTaken ? 600 : Math.max(1, Math.min(600, Math.round(shotAt * 60) - (await js('(globalThis.__pm?.f.length ?? 0)'))));
    const r = await js(`${LOOP}(${maxFrames > 0 ? `Math.min(${chunk}, ${maxFrames} - (globalThis.__pm?.f.length ?? 0))` : chunk})`);
    process.stderr.write(`\r${r.n} frames, game ${r.t ?? '-'} s, ${Math.round((Date.now() - t0) / 1000)} s   `);
    if (!shotTaken && r.n >= Math.round(shotAt * 60)) {
      // the pictures of different runs must show the same moment: frames counted from a countdown that starts in real time can be a step or two apart, so go on to one tick of the game
      const at = Math.round(shotAt * 60) + 20;
      for (let i = 0; i < 120 && (await js('__bs.m.tick')) < at; i++) await js(`${LOOP}(1)`);
      // draw for real from here: the software GPU finishes each frame before the next, and its time is the fill measure
      await send('Emulation.setCPUThrottlingRate', { rate: 1 });
      await js(`(()=>{ const gl = __bs.gl; for (const k of ['drawElements', 'drawArrays', 'drawElementsInstanced', 'drawArraysInstanced', 'drawRangeElements']) delete gl[k]; __pm.drawOn = true; __pm.drawOff = false; return 1; })()`);
      await js(`${LOOP}(${fill})`);
      await new Promise((res) => setTimeout(res, 400));
      const p = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(shot, Buffer.from(p.data, 'base64'));
      shotTaken = true;
      break;
    }
    if (r.done || (maxFrames > 0 && r.n >= maxFrames)) break;
  }
  process.stderr.write('\n');
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const frames = await js('globalThis.__pm.f');
  const meta = await js(`(()=>({ score: __bs.m.score, phase: __bs.m.phase, tick: __bs.m.tick, quality: globalThis.__quality ? __quality.describe() : null }))()`);
  const pick = (k) => frames.slice(30).map((f) => f[k]);
  const mean = (xs) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : 0);
  const pct = (xs, p) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * p))] : 0;
  };
  const r2 = (x) => Math.round(x * 100) / 100;
  const stat = (k) => ({ mean: r2(mean(pick(k))), p90: r2(pct(pick(k), 0.9)), p99: r2(pct(pick(k), 0.99)), max: r2(Math.max(...pick(k))) });
  const total = pick(0);
  const steps = pick(2).reduce((a, x) => a + x, 0);
  const drawn = frames.slice(30).filter((f) => f[7] > 0);
  // the frames drawn for real (with --shot): leave out the first two, which build the software GPU's routines
  const real = shot ? frames.slice(-fill).slice(2) : [];
  const summary = {
    size,
    throttle,
    court,
    seed,
    frames: total.length,
    drawn: drawn.length,
    simPerStep: r2(pick(1).reduce((a, x) => a + x, 0) / Math.max(1, steps)),
    frame: stat(0),
    sim: stat(1),
    anim: stat(3),
    submit: stat(4),
    draw: stat(5),
    gpuFinish: stat(6),
    over20: total.filter((x) => x > 20).length,
    over33: total.filter((x) => x > 33).length,
    calls: { mean: r2(mean(drawn.map((f) => f[7]))), max: Math.max(0, ...drawn.map((f) => f[7])) },
    triangles: { mean: Math.round(mean(drawn.map((f) => f[8]))), max: Math.max(0, ...drawn.map((f) => f[8])) },
    pixels: drawn.length ? drawn[drawn.length - 1][9] : 0,
    fillMs: real.length ? r2(mean(real.map((f) => f[6]))) : null,
    level: await js('globalThis.__quality ? __quality.describe().map((g) => g.level) : null'),
    meta,
  };
  console.log(JSON.stringify(summary, null, 1));
  if (out) fs.writeFileSync(out, JSON.stringify({ summary, frames, logs: logs.slice(-50) }));
  ws.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
