// How heavy the menus are on a slow device: opens each page with a tap, on a slowed processor, and measures
//   - how long the screen stood still after the tap (the longest gap between two frames),
//   - how much work the page did to open (main-thread time in the 1.5 s after the tap), and
//   - how much work it does just sitting there (main-thread time per second, three seconds after opening).
//
//   node perfmenu.js --size 1024x768@1 --cpu 6 --out FILE.json [--save SAVE.json] [--touch] [--only collection,squad --times 3]
//
// Run it against a production web build (npx expo export -p web, then serve the folder and give its address in
// APP_URL): a development build runs React's slow checks and says little about a device. A production build has no
// dev hooks, so the walk is done with taps only, and the game is seeded by putting a save in the browser's storage
// before the page loads (--save: the text of the `bucket-squad-save` storage entry, see README.md).
// The 3D stage on the home page is drawn by the software GPU here, so its numbers say more about this machine
// than about a device; the menu pages are what this tool is for.
const fs = require('fs');
const path = require('path');
const { connect, sleep, readArgs, readSize } = require('./lib');

const args = readArgs();
const SIZE = readSize(args.size, '1024x768@1');
const CPU = Number(args.cpu || 6);
const APP = process.env.APP_URL || 'http://localhost:8081/';
const OUT = args.out ? path.resolve(String(args.out)) : '';
const SAVE = args.save ? fs.readFileSync(String(args.save), 'utf8') : null;

// each step: the button to press, the name of where it leads, and how to tell the page has arrived
const WALK = [
  ['Collection', 'collection'],
  ['Back', 'home'],
  ['Squad', 'squad'],
  ['Back', 'home'],
  ['Packs', 'shop'],
  ['Packs, something new', 'shop-packs'],
  ['Uniforms', 'uniforms'],
  ['Back', 'shop-packs'],
  ['Back', 'home'],
  ['Missions', 'missions'],
  ['Back', 'home'],
  ['Settings', 'settings'],
  ['Back', 'home'],
  ['Play', 'play'],
  ['Tour', 'tour'],
  ['Back', 'play'],
  ['Ladder', 'ladder'],
  ['Back', 'play'],
  ['Quick game', 'quick'],
  ['Back', 'play'],
  ['2 players', 'duo'],
  ['Back', 'play'],
  ['Back', 'home'],
];

const FRAMES = `(()=>{ if (globalThis.__gaps) return 1; const g = globalThis.__gaps = { list: [], last: performance.now() }; const tick = (t) => { g.list.push(t - g.last); g.last = t; if (g.list.length > 4000) g.list.splice(0, 2000); requestAnimationFrame(tick); }; requestAnimationFrame(tick); return 1; })()`;

async function main() {
  const c = await connect({ touch: !!args.touch });
  const { send, evalJs, tap, until } = c;
  await send('Emulation.setDeviceMetricsOverride', { width: SIZE.width, height: SIZE.height, deviceScaleFactor: SIZE.scale, mobile: !!args.touch });
  await send('Emulation.setTouchEmulationEnabled', { enabled: !!args.touch, maxTouchPoints: 5 });
  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await send('Performance.enable');
  let boot = null;
  if (SAVE) boot = await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { localStorage.setItem('bucket-squad-save', ${JSON.stringify(SAVE)}); } catch {}` });
  await send('Page.resetNavigationHistory').catch(() => {});
  await send('Page.navigate', { url: APP });
  await until(`!!document.querySelector('[role=button]')`);
  await sleep(6000);
  await evalJs(FRAMES);
  await send('Emulation.setCPUThrottlingRate', { rate: CPU });
  await sleep(1500);

  const metrics = async () => {
    const m = (await send('Performance.getMetrics')).metrics;
    const pick = (n) => m.find((x) => x.name === n).value;
    return { task: pick('TaskDuration'), script: pick('ScriptDuration'), layout: pick('LayoutDuration'), style: pick('RecalcStyleDuration') };
  };
  const diff = (a, b) => ({ task: Math.round((b.task - a.task) * 1000), script: Math.round((b.script - a.script) * 1000), layout: Math.round((b.layout - a.layout) * 1000), style: Math.round((b.style - a.style) * 1000) });
  const rows = [];
  const measure = async (label, name) => {
    await evalJs(`(()=>{ __gaps.list.length = 0; return 1 })()`);
    const m0 = await metrics();
    if (label !== null && !(await tap(label))) {
      rows.push({ name, label, missing: true });
      return;
    }
    await sleep(1500);
    const m1 = await metrics();
    const open = await evalJs(`(()=>{ const l = __gaps.list.slice(); return { worst: Math.round(Math.max(0, ...l)), frames: l.length, over50: l.filter((x) => x > 50).length }; })()`);
    await sleep(1500);
    await evalJs(`(()=>{ __gaps.list.length = 0; return 1 })()`);
    const i0 = await metrics();
    await sleep(3000);
    const i1 = await metrics();
    const idle = await evalJs(`(()=>{ const l = __gaps.list.slice(); return { frames: l.length, worst: Math.round(Math.max(0, ...l)) }; })()`);
    const d = diff(i0, i1);
    const row = { name, label, stall: open.worst, open: diff(m0, m1), idlePerSec: { task: Math.round(d.task / 3), script: Math.round(d.script / 3), layout: Math.round(d.layout / 3), style: Math.round(d.style / 3) }, idleFps: Math.round(idle.frames / 3) };
    rows.push(row);
    console.log(`${name.padEnd(12)} stall ${String(row.stall).padStart(5)} ms   open work ${String(row.open.task).padStart(5)} ms (script ${row.open.script}, style ${row.open.style}, layout ${row.open.layout})   idle ${String(row.idlePerSec.task).padStart(4)} ms/s (script ${row.idlePerSec.script}, style ${row.idlePerSec.style})  ${row.idleFps} fps`);
  };

  // --only collection,squad: just those pages, each opened from home and left again (--times N: that many rounds)
  const only = args.only ? String(args.only).split(',') : null;
  if (only) {
    const steps = WALK.filter(([, name], i) => only.includes(name) && WALK[i + 1] && WALK[i + 1][0] === 'Back');
    for (let round = 0; round < Number(args.times || 1); round++) {
      for (const [label, name] of steps) {
        await measure(label, name);
        await tap('Back');
        await sleep(2500);
      }
    }
  } else {
    await measure(null, 'home');
    for (const [label, name] of WALK) await measure(label, name);
  }

  await send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  if (boot) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: boot.identifier });
  if (OUT) fs.writeFileSync(OUT, JSON.stringify({ size: `${SIZE.width}x${SIZE.height}@${SIZE.scale}`, cpu: CPU, app: APP, rows }, null, 1));
  c.close();
}
main().catch((e) => {
  console.error('perfmenu error', e.message);
  process.exit(1);
});
