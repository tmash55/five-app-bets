// Films the pack opening on the virtual clock: the sealed pack, the tear, then one card of each rarity with its
// own reveal (the demo pack, so nothing is saved and no coins change), through to the haul.
//
// usage: node reveals.js <fps> <scale> <outdir>      then: python3 assemble.py <outdir> <fps> out.mp4
// Environment: APP_URL (http://localhost:8081/), CDP_PORT as for cdp.js.
const { spawnSync } = require('child_process');
const fps = Number(process.argv[2] || 30);
const dsf = Number(process.argv[3] || 2);
const out = process.argv[4] || 'reveals';
const url = process.env.APP_URL || 'http://localhost:8081/';
const P = `${out}/f_`;
const steps = [];
const rec = (seconds) => steps.push(`vtrec:${Math.max(1, Math.round(seconds * fps))},${fps},${P}`);
const tap = (label) => steps.push(`tap:${label}`);
const js = (code) => steps.push(`eval:${code}`);
const mark = (name) => steps.push(`eval:'--- ${name}'`);
const note = (kind) => js(`(()=>{ __soundLog.push({ kind: '${kind}', t: performance.now() }); return '${kind}' })()`);

// how long each card holds the screen: rising out of the row, its reveal, what it says coming in, and a beat to read it
const ARRIVE = 0.42;
const SIDE = 1.75;
const READ = 0.7;
const card = (reveal) => ARRIVE + reveal + SIDE + READ;

steps.push(`size:844x390@${dsf}`, 'vtinstall', `nav:${url}`, 'until:!!globalThis.__save', 'wait:2500');
js(`(()=>{ const s=__save.getState(); s.resetAll(); s.startCareer('coyotes'); __save.setState({ tips: { howToPlay: true } }); return 'reset' })()`);
js(`(()=>{ __router.push({ pathname: '/open', params: { pack: 'allstar', demo: 'common,rare,epic,legend' } }); return 'open' })()`);
steps.push('wait:1500', 'vt:on');
note('start');

mark('sealed'); rec(1.8);
// the tear lasts about 2.6 s for four cards, then the first card (a common) comes up
mark('tear and common'); tap('Open the pack'); rec(2.6 + card(0.9));
mark('rare'); tap('Next'); rec(card(1.6));
mark('epic'); tap('Next'); rec(card(2.6));
mark('legend'); tap('Next'); rec(card(4.2) + 0.4);
mark('haul'); tap('Next'); rec(3.2);

note('end');
steps.push(`save:${out}/sound.json,JSON.stringify(__soundLog)`, 'log:8');
const r = spawnSync('node', ['cdp.js', ...steps], { cwd: __dirname, stdio: 'inherit', env: { ...process.env } });
process.exit(r.status || 0);
