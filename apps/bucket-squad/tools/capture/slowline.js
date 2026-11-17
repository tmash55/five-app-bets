// Two devices playing each other over a slow line, in real time: how far the match falls behind and how often it
// has to stop and wait. Two headless Chromiums (chrome.sh with CDP_PORT=9334 and 9335 unless PORT_A / PORT_B say
// otherwise), one web build, and the local room relay started here with a one-way delay and jitter.
//
//   node slowline.js --delay 300 --jitter 100 --seconds 25 [--out FILE.json] [--shot DIR]
//
// --delay is one way, device to device, in ms: Wi-Fi is about 20, good mobile data 80, 3G 200 to 400.
// Prints, for each device: match ticks a second (60 is full speed), the share of the time it stood waiting for
// the other device, the input delay it settled on and the round trip it measured.
const fs = require('fs');
const path = require('path');
const { connect, sleep, readArgs } = require('./lib');
const { startRelay } = require('../relay/relay');

const args = readArgs();
const DELAY = Number(args.delay ?? 300);
const JITTER = Number(args.jitter ?? 0);
const SECONDS = Number(args.seconds ?? 25);
const RELAY_PORT = Number(args.relay ?? 8799);
const APP = process.env.APP_URL || 'http://localhost:8081/';
const URL = `${APP}?net=relay:ws://localhost:${RELAY_PORT}&insets=off`;
const SHOT = args.shot ? path.resolve(String(args.shot)) : '';
if (SHOT) fs.mkdirSync(SHOT, { recursive: true });

const seed = (team, rngSeed) => `(()=>{
  const mul=(seed)=>{ let s=seed>>>0; return ()=>{ s=(s+0x6d2b79f5)>>>0; let t=s; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; };
  const S=__save; const real=Math.random; Math.random=mul(${rngSeed});
  try {
    S.getState().resetAll(); S.getState().startCareer('${team}'); S.getState().addCoins(4000);
    for (const id of ['playground','playground','allstar','allstar']) { if (S.getState().buyPack(id)) S.getState().openPack(id); }
  } finally { Math.random=real; }
  const owned=S.getState().owned; const best=Object.keys(owned).map((id)=>__roster.mustPlayer(id)).sort((a,b)=>__roster.playerOverall(b)-__roster.playerOverall(a)).slice(0,3).map((p)=>p.id);
  S.getState().setSquad(best);
  S.setState({ tips: { howToPlay: true }, settings: { ...S.getState().settings, quarterSeconds: 60, format: 2, graphics: 'fast' } });
  return S.getState().squad;
})()`;

async function main() {
  const relay = startRelay(RELAY_PORT, { delay: DELAY, jitter: JITTER, host: '127.0.0.1' });
  const A = await connect({ port: Number(process.env.PORT_A || 9334) });
  const B = await connect({ port: Number(process.env.PORT_B || 9335) });
  const both = (fn) => Promise.all([fn(A), fn(B)]);
  // small and coarse: the software GPU must not be what slows the match down
  await both((d) => d.send('Emulation.setDeviceMetricsOverride', { width: 640, height: 360, deviceScaleFactor: SHOT ? 1 : 0.5, mobile: false }));
  await both(async (d) => {
    await d.send('Page.resetNavigationHistory').catch(() => {});
    await d.send('Page.navigate', { url: URL });
  });
  await both((d) => d.until('!!globalThis.__save && !!globalThis.__roster && !!globalThis.__online'));
  await sleep(2500);
  await A.evalJs(seed('coyotes', 11));
  await B.evalJs(seed('yetis', 23));

  const t0 = Date.now();
  await A.evalJs(`(()=>{ __router.push('/host'); return 1 })()`);
  const hostUp = await A.until(`(()=>{ const v=__online.getState().view; return !!v && v.phase==='waiting' })()`, 30000);
  const code = await A.evalJs(`__online.getState().view.code`);
  await B.evalJs(`(()=>{ __router.push('/join'); return 1 })()`);
  await sleep(1200);
  const j0 = Date.now();
  for (const ch of code) {
    await B.tap(ch);
    await sleep(200);
  }
  if (SHOT) {
    await sleep(400);
    await B.shot(path.join(SHOT, 'join-looking.png'));
  }
  const matched = await both((d) => d.until(`(()=>{ const v=__online.getState().view; return !!v && (v.phase==='matched' || v.phase==='failed') })()`, 40000));
  const phase = await both((d) => d.evalJs(`(()=>{ const v=__online.getState().view; return v.phase + (v.problem ? ':' + v.problem : '') })()`));
  console.log(`one-way delay ${DELAY} ms (+0..${JITTER}): room open in ${hostUp} ms, friend found ${Date.now() - j0} ms after the code was typed (${matched.join(' / ')}), ${phase.join(' / ')}`);
  if (!phase.every((p) => p === 'matched')) {
    relay.close();
    A.close();
    B.close();
    return;
  }
  await sleep(2500);
  await B.tap('TIP-OFF');
  await sleep(600);
  await A.tap('TIP-OFF');
  const playing = await both((d) => d.until(`!!globalThis.__bs && __online.getState().view.phase==='playing'`, 40000));
  console.log(`tip-off to playing: ${playing.join(' / ')} ms`);

  // sample both devices four times a second
  const SAMPLE = `(()=>{ const v=__online.getState().view; const hint=[...document.querySelectorAll('[dir]')].map((e)=>e.textContent).find((t)=>/Waiting for your friend|Connecting|Slow connection/.test(t||'')) || ''; return { tick: __bs.m.tick, phase: v.phase, problem: v.problem, waiting: v.waiting, delay: v.delay, rtt: v.rtt, hint, now: performance.now() }; })()`;
  await sleep(3000);
  const rows = [[], []];
  const end = Date.now() + SECONDS * 1000;
  let shots = 0;
  let mid = false;
  while (Date.now() < end) {
    const s = await both((d) => d.evalJs(SAMPLE));
    rows[0].push(s[0]);
    rows[1].push(s[1]);
    if (SHOT && shots < 3 && (s[0].hint || s[1].hint)) {
      await (s[0].hint ? A : B).shot(path.join(SHOT, `waiting-${shots++}.png`));
    }
    // and the match as it looks half way through, whatever it says
    if (SHOT && !mid && Date.now() > end - (SECONDS * 1000) / 2) {
      mid = true;
      await A.shot(path.join(SHOT, 'mid-host.png'));
      await B.shot(path.join(SHOT, 'mid-guest.png'));
    }
    await sleep(250);
  }
  const summary = rows.map((r, i) => {
    const ok = r.filter((x) => x && !x.error);
    const first = ok[0];
    const last = ok[ok.length - 1];
    const secs = (last.now - first.now) / 1000;
    // the longest stretch the match clock did not move
    let stall = 0;
    let run = 0;
    for (let k = 1; k < ok.length; k++) {
      if (ok[k].tick === ok[k - 1].tick) run += ok[k].now - ok[k - 1].now;
      else run = 0;
      stall = Math.max(stall, run);
    }
    return {
      device: i === 0 ? 'host' : 'guest',
      ticksPerSecond: Math.round(((last.tick - first.tick) / secs) * 10) / 10,
      waitingShare: Math.round((ok.filter((x) => x.waiting > 0).length / ok.length) * 100),
      hintShare: Math.round((ok.filter((x) => x.hint).length / ok.length) * 100),
      longestStallMs: Math.round(stall),
      delayTicks: last.delay,
      rtt: last.rtt,
      phase: last.phase + (last.problem ? ':' + last.problem : ''),
    };
  });
  for (const s of summary) console.log(`  ${s.device.padEnd(5)} ${String(s.ticksPerSecond).padStart(5)} ticks/s   waiting ${String(s.waitingShare).padStart(3)}% of the time   hint shown ${String(s.hintShare).padStart(3)}%   longest stall ${s.longestStallMs} ms   input delay ${s.delayTicks} ticks   round trip ${s.rtt} ms   ${s.phase}`);
  if (args.out) fs.writeFileSync(path.resolve(String(args.out)), JSON.stringify({ delay: DELAY, jitter: JITTER, seconds: SECONDS, setupMs: Date.now() - t0, summary }, null, 1));
  await both((d) => d.evalJs(`(()=>{ __online.getState().leave(); __router.dismissTo('/'); return 1 })()`).catch(() => {}));
  relay.close();
  A.close();
  B.close();
}
main().catch((e) => {
  console.error('slowline error', e.message);
  process.exit(1);
});
