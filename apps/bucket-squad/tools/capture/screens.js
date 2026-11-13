// Photographs every screen at one size, from a save that is a few days into the game.
// usage: node screens.js <width>x<height>[@scale] <outdir>
//   node screens.js 844x390@2 shots        a current phone
//   node screens.js 667x375@2 shots-small  a small phone
//   node screens.js 1180x820@1 shots-pad   a tablet
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const size = process.argv[2] || '844x390@2';
const out = path.resolve(process.argv[3] || 'shots');
fs.mkdirSync(out, { recursive: true });
const URL = process.env.APP_URL || 'http://localhost:8081/';

// a save with a bit of everything: a mixed shelf, spare coins, packs to open, tour stars, a ladder rank
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

const steps = [`size:${size}`, `nav:${URL}`, 'until:!!globalThis.__save', 'wait:2500', `eval:${SEED}`];
const go = (path, name, wait = 900) => steps.push(`eval:(()=>{ __router.dismissTo('/'); return 1 })()`, 'wait:350', `eval:(()=>{ __router.push(${JSON.stringify(path)}); return ${JSON.stringify(path)} })()`, `wait:${wait}`, `shot:${out}/${name}.png`);

// the squad walks on and warms up first, so the home page waits for the entrance to finish
steps.push(`eval:(()=>{ __router.replace('/'); return 1 })()`, 'wait:5000', `shot:${out}/01-home.png`);
go('/play', '02-play');
go('/tour', '03-tour');
go('/ladder', '04-ladder');
go('/quick', '05-quick');
go('/squad', '06-squad');
go('/shelf', '07-shelf');
steps.push(`eval:(()=>{ const s=__save.getState().squad[0]; __router.push('/player/' + s); return s })()`, 'wait:900', `shot:${out}/08-player.png`);
go('/packs', '09-packs');
go('/uniforms', '09b-uniforms');
go('/missions', '10-missions');
go('/settings', '11-settings');
// a tour game: versus, the match with its pad, the pause menu, how to play, then the results
steps.push(`eval:(()=>{ __router.dismissTo('/'); return 1 })()`, 'wait:350', `eval:(()=>{ __router.push('/tour'); return 1 })()`, 'wait:700', 'tap:Rivalry', 'wait:400', `eval:(()=>{ const st=__session.getState(); __session.setState({ setup: { ...st.setup, seed: 238, demo: true } }); return 1 })()`, 'wait:900', `shot:${out}/12-versus.png`);
steps.push('tap:TIP-OFF', 'until:!!(globalThis.__bs && globalThis.__bs.renderer)', 'wait:5200', `shot:${out}/13-match.png`);
steps.push('tap:Pause', 'wait:600', `shot:${out}/14-pause.png`, 'tap:How to play', 'wait:600', `shot:${out}/15-howto.png`, 'tap:BACK', 'wait:300', 'tap:Resume', 'wait:300');
steps.push(`eval:(()=>{ const r=__bs; let n=0; while (r.m.phase !== 'final' && n < 200000) { r.tick(); n++; } return { score: r.m.score, n } })()`, "until:location.pathname==='/results'", 'wait:3600', `shot:${out}/16-results.png`);
// opening a pack
steps.push(`eval:(()=>{ __router.dismissTo('/'); return 1 })()`, 'wait:350', `eval:(()=>{ __router.push({ pathname: '/open', params: { pack: 'allstar' } }); return 1 })()`, 'wait:900', `shot:${out}/17-pack.png`, 'tap:Open the pack', 'wait:6000', `shot:${out}/18-reveal.png`);
// first launch
steps.push(`eval:(()=>{ __save.getState().resetAll(); __router.replace('/welcome'); return 1 })()`, 'wait:1200', `shot:${out}/19-welcome.png`, 'tap:Yetis', 'wait:700', `shot:${out}/20-welcome-team.png`);
steps.push('log:12');
const r = spawnSync('node', ['cdp.js', ...steps], { cwd: __dirname, stdio: 'inherit' });
process.exit(r.status || 0);
