// Virtual clock for frame-exact captures: timers, animation frames and "now" all follow one clock that
// either tracks real time (auto) or moves only when stepped. Installed before the page's own scripts run.
(() => {
  if (window.__vt) return;
  const R = { raf: window.requestAnimationFrame.bind(window), now: performance.now.bind(performance), dnow: Date.now.bind(Date) };
  const vt = { now: R.now(), date0: R.dnow() - R.now(), timers: new Map(), rafs: new Map(), seq: 1, auto: true, last: 0, steps: 0 };
  window.setTimeout = (fn, ms, ...args) => { const id = vt.seq++; vt.timers.set(id, { at: vt.now + Math.max(0, +ms || 0), fn, args, every: 0 }); return id; };
  window.setInterval = (fn, ms, ...args) => { const id = vt.seq++; const every = Math.max(1, +ms || 0); vt.timers.set(id, { at: vt.now + every, fn, args, every }); return id; };
  window.clearTimeout = (id) => { vt.timers.delete(id); };
  window.clearInterval = (id) => { vt.timers.delete(id); };
  window.requestAnimationFrame = (fn) => { const id = vt.seq++; vt.rafs.set(id, fn); return id; };
  window.cancelAnimationFrame = (id) => { vt.rafs.delete(id); };
  performance.now = () => vt.now;
  Date.now = () => Math.round(vt.date0 + vt.now);
  vt.step = (ms) => {
    const target = vt.now + ms;
    for (let guard = 0; guard < 20000; guard++) {
      let best = null; let bestId = 0;
      for (const [id, t] of vt.timers) if (t.at <= target && (!best || t.at < best.at)) { best = t; bestId = id; }
      if (!best) break;
      if (best.at > vt.now) vt.now = best.at;
      if (best.every) best.at += best.every; else vt.timers.delete(bestId);
      try { if (typeof best.fn === 'function') best.fn(...best.args); } catch (e) { console.error('vt timer', e); }
    }
    vt.now = target;
    const cbs = [...vt.rafs.values()]; vt.rafs.clear();
    for (const cb of cbs) { try { cb(vt.now); } catch (e) { console.error('vt raf', e); } }
    vt.steps++;
    return vt.now;
  };
  const drive = (t) => { if (vt.auto) { const d = Math.min(100, t - vt.last); if (d > 0) vt.step(d); } vt.last = t; R.raf(drive); };
  R.raf((t) => { vt.last = t; R.raf(drive); });
  window.__vt = vt;
  window.__soundLog = [];
})();
