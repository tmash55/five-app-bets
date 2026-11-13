// Builds and runs the walkthrough capture: node trailer.js <fps> <dsf> <outdir> [upto]
const { spawnSync } = require('child_process');
const fps = Number(process.argv[2] || 30);
const dsf = Number(process.argv[3] || 2);
const out = process.argv[4] || 'trailer';
const upto = process.argv[5] || '';
const SEED = 238;
const PACK_SEED = 25;
const P = `${out}/f_`;
const steps = [];
const rec = (seconds) => steps.push(`vtrec:${Math.max(1, Math.round(seconds * fps))},${fps},${P}`);
const tap = (label) => steps.push(`tap:${label}`);
const js = (code) => steps.push(`eval:${code}`);
const mark = (name) => steps.push(`eval:'--- ${name}'`);
const note = (kind) => js(`(()=>{ __soundLog.push({ kind: '${kind}', t: performance.now() }); return '${kind}' })()`);

steps.push(`size:844x390@${dsf}`, 'vtinstall', 'nav:http://localhost:8081/', 'until:!!globalThis.__save', 'wait:2500');
js(`(()=>{ __save.getState().resetAll(); __router.replace('/welcome'); return 'reset' })()`);
steps.push('wait:1500', 'vt:on');
note('start');

mark('welcome'); rec(1.2); tap('Coyotes'); rec(1.6); tap('THIS IS MY TEAM'); rec(1.8);
mark('first pack');
// a representative first pack (two everyday players, then a rare) instead of whatever the dice say on the day
js(`(()=>{ const mul=(seed)=>{ let s=seed>>>0; return ()=>{ s=(s+0x6d2b79f5)>>>0; let t=s; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; }; const orig=__save.getState().openPack; __save.setState({ openPack:(id)=>{ const real=Math.random; Math.random=mul(${PACK_SEED}); try { return orig(id); } finally { Math.random=real; __save.setState({ openPack: orig }); } } }); return 'pack seeded' })()`);
tap('Open the pack'); rec(3.0); tap('Next'); rec(2.6); tap('Next'); rec(2.9); tap('Next'); rec(2.4);
if (upto !== 'pack') {
  mark('home'); tap("LET'S PLAY"); rec(2.2); tap('Play'); rec(1.5); tap('TOUR'); rec(1.9);
  mark('versus'); tap('Warm-Up');
  js(`(()=>{ const st=__session.getState(); __session.setState({ setup: { ...st.setup, seed: ${SEED}, demo: true } }); return __session.getState().setup.away.players.map(p=>p.id).join(',') })()`);
  rec(2.6); tap('TIP-OFF'); rec(1.6);
  js(`(()=>({ runner: !!globalThis.__bs, renderer: !!(globalThis.__bs && __bs.renderer), seed: globalThis.__bs && __bs.m.cfg.seed, demo: globalThis.__bs && __bs.m.cfg.demo }))()`);
  if (upto !== 'tip') {
    mark('match'); tap("LET'S PLAY"); rec(21.2);
    js(`(()=>{ const m=__bs.m; return { t:+m.time.toFixed(2), score:m.score, clock:+m.clock.toFixed(1) } })()`);
    // jump to the last seconds
    note('cut0');
    js(`(()=>{ const r=__bs; let n=0; while (r.m.time < 291.9 && r.m.phase !== 'final' && n < 100000) { r.tick(); n++; } return { t:+r.m.time.toFixed(2), score:r.m.score, q:r.m.quarter, clock:+r.m.clock.toFixed(1) } })()`);
    steps.push('vtstep:2400');
    note('cut1');
    mark('finish'); rec(6.3 + 2.6);
    js(`location.pathname`);
    mark('results'); rec(7.5);
    if (upto !== 'results') {
      tap('HOME'); rec(1.8); tap('SHELF'); rec(2.0); tap('Nia Brooks'); rec(2.8); tap('Back'); rec(0.7); tap('Back'); rec(0.7); tap('PACKS'); rec(2.6);
    }
  }
}
note('end');
steps.push(`save:${out}/sound.json,JSON.stringify(__soundLog)`, 'log:8');
const r = spawnSync('node', ['cdp.js', ...steps], { cwd: __dirname, stdio: 'inherit', env: { ...process.env } });
process.exit(r.status || 0);
