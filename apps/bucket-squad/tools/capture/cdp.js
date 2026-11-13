// A small Chrome DevTools Protocol driver for looking at the web build without a phone: no browser
// automation framework, just the protocol over a WebSocket. Start the browser with chrome.sh first.
//
// usage: node cdp.js step [step...]      (steps run in order; give size: in every run)
//   size:WxH[@scale]        viewport in CSS pixels and device scale, for example size:844x390@2
//   nav:URL                 open a page, with an empty back list
//   wait:MS                 wait in real time
//   until:JS                poll until the expression is truthy (60 s at most)
//   eval:JS                 run an expression and print its JSON
//   save:FILE,JS            write the result of an expression to a file
//   shot:FILE               PNG screenshot
//   tap:TEXT                click the button whose label is, starts with or contains TEXT
//   click:X,Y               mouse click at a point
//   touch:TYPE,X,Y,ID[,...] raw touches (TYPE is start, move or end; list every finger that is down)
//   text:SELECTOR           print an element's text
//   log[:N]                 print the last N console lines
//   seq:N,DT,PREFIX[,JS]    on the match screen: advance the match DT seconds and screenshot, N times
//   vtinstall               put the virtual clock (vt.js) into pages loaded later in this run; use before nav:
//   vt:on | vt:off          freeze the page clock, or let it follow real time again
//   vtstep:MS[,SLICE]       move the frozen clock forward without capturing
//   vtrec:N,FPS,PREFIX[,JS] record N frames, each 1/FPS of page time after the last (PREFIX00000.jpg ...)
//   caststart:PREFIX[,Q[,MAXW]] / caststop   real-time screencast (CSS pixel size, uneven frame times)
//
// Environment: CDP_PORT (9333), VT_WAIT (ms to let a frame settle, 35), VT_Q (JPEG quality, 92).
const fs = require('fs');
const PORT = process.env.CDP_PORT || 9333;

async function main() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  let page = list.find((t) => t.type === 'page');
  if (!page) page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const logs = [];
  let cast = null;
  const vtCount = {};
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(JSON.stringify(msg.error))); else res(msg.result);
    } else if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a) => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ');
      logs.push(`[${msg.params.type}] ${text}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      logs.push(`[exception] ${d.text} ${d.exception ? d.exception.description : ''}`);
    } else if (msg.method === 'Page.screencastFrame') {
      if (cast) cast.frames.push({ data: msg.params.data, t: msg.params.metadata.timestamp });
      ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId: msg.params.sessionId } }));
    } else if (msg.method === 'Log.entryAdded') {
      logs.push(`[log:${msg.params.entry.level}] ${msg.params.entry.text} ${msg.params.entry.url || ''}`);
    }
  };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) return { error: r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : '') };
    return r.result.value;
  };
  for (const step of process.argv.slice(2)) {
    const k = step.indexOf(':');
    const cmd = k < 0 ? step : step.slice(0, k);
    const arg = k < 0 ? '' : step.slice(k + 1);
    if (cmd === 'size') {
      const [wh, dsf] = arg.split('@');
      const [w, h] = wh.split('x').map(Number);
      await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: Number(dsf || 1), mobile: false });
    } else if (cmd === 'nav') {
      // a tab that has been driven for hours has a full back list, and the browser then drops entries the app's router still
      // counts on, so going home can land in an older page load: every page starts with a clean back list
      await send('Page.resetNavigationHistory').catch(() => {});
      await send('Page.navigate', { url: arg });
    } else if (cmd === 'wait') {
      await new Promise((r) => setTimeout(r, Number(arg)));
    } else if (cmd === 'eval') {
      console.log(JSON.stringify(await evalJs(arg)));
    } else if (cmd === 'until') {
      const t0 = Date.now();
      let ok = false;
      while (Date.now() - t0 < 60000) {
        const v = await evalJs(arg);
        if (v && !v.error) { ok = true; break; }
        await new Promise((r) => setTimeout(r, 250));
      }
      console.log(`until ${ok ? 'ok' : 'TIMEOUT'} after ${Date.now() - t0}ms`);
    } else if (cmd === 'shot') {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(arg, Buffer.from(r.data, 'base64'));
      console.log('saved', arg);
    } else if (cmd === 'seq') {
      // seq:N,DT,PREFIX,JS  -> advance DT seconds, run JS, capture, N times
      const parts = arg.split(',');
      const n = Number(parts[0]);
      const dt = Number(parts[1]);
      const prefix = parts[2];
      const js = parts.slice(3).join(',') || '0';
      for (let i = 0; i < n; i++) {
        await evalJs(`(()=>{ globalThis.__bs.advance(${dt}); ${js}; return 1; })()`);
        await new Promise((r) => setTimeout(r, Number(process.env.SEQ_WAIT || 350)));
        const r = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(`${prefix}${String(i).padStart(2, '0')}.png`, Buffer.from(r.data, 'base64'));
      }
      console.log('seq saved', n, prefix);
    } else if (cmd === 'save') {
      // save:FILE,JS -> write the (string or JSON) result of JS to FILE
      const k2 = arg.indexOf(',');
      const v = await evalJs(arg.slice(k2 + 1));
      fs.writeFileSync(arg.slice(0, k2), typeof v === 'string' ? v : JSON.stringify(v));
      console.log('saved', arg.slice(0, k2));
    } else if (cmd === 'vtinstall') {
      // vtinstall -> put the virtual clock (vt.js) into every page loaded from now on in this run
      await send('Page.addScriptToEvaluateOnNewDocument', { source: fs.readFileSync(require('path').join(__dirname, 'vt.js'), 'utf8') });
    } else if (cmd === 'vt') {
      // vt:on freezes the page clock (time then moves only through vtrec/vtstep), vt:off lets it follow real time again
      console.log('vt', arg, JSON.stringify(await evalJs(`(()=>{ if(!globalThis.__vt) return 'missing'; __vt.auto = ${arg === 'off'}; return __vt.now|0; })()`)));
    } else if (cmd === 'vtstep') {
      // vtstep:MS[,SLICE] -> move the frozen clock forward without capturing
      const [ms, slice] = arg.split(',').map(Number);
      const each = slice || 1000 / 30;
      for (let left = ms; left > 0; left -= each) { await evalJs(`__vt.step(${Math.min(each, left)})`); await new Promise((r) => setTimeout(r, 4)); }
    } else if (cmd === 'vtrec') {
      // vtrec:N,FPS,PREFIX[,JS] -> N frames, each one 1/FPS of page time after the last; numbering carries on across calls with the same prefix
      const parts = arg.split(',');
      const n = Number(parts[0]);
      const fps = Number(parts[1]);
      const prefix = parts[2];
      const js = parts.slice(3).join(',');
      vtCount[prefix] = vtCount[prefix] || 0;
      const settle = Number(process.env.VT_WAIT || 35);
      for (let i = 0; i < n; i++) {
        await evalJs(`__vt.step(${1000 / fps})`);
        if (js) await evalJs(js);
        await new Promise((r) => setTimeout(r, settle));
        // a layer that has just slid into view can come out as a black block: its new tiles are only painted
        // when a frame is drawn, and the clock is stopped. The first picture draws that frame, the second keeps it.
        if (process.env.VT_TWICE) await send('Page.captureScreenshot', { format: 'jpeg', quality: 10 });
        const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: Number(process.env.VT_Q || 92) });
        fs.writeFileSync(`${prefix}${String(vtCount[prefix]++).padStart(5, '0')}.jpg`, Buffer.from(r.data, 'base64'));
      }
      console.log('vtrec', n, 'frames ->', prefix, 'total', vtCount[prefix]);
    } else if (cmd === 'caststart') {
      // caststart:PREFIX[,QUALITY[,MAXW]] -> record the page in real time until caststop; frames land in PREFIXNNNN.jpg with PREFIXlist.txt for ffmpeg concat
      const parts = arg.split(',');
      cast = { prefix: parts[0], frames: [] };
      const params = { format: 'jpeg', quality: Number(parts[1] || 85), everyNthFrame: 1 };
      if (parts[2]) { params.maxWidth = Number(parts[2]); params.maxHeight = Number(parts[2]); }
      await send('Page.startScreencast', params);
    } else if (cmd === 'caststop') {
      await send('Page.stopScreencast');
      const c = cast; cast = null;
      const end = Date.now() / 1000;
      const lines = [];
      c.frames.forEach((f, i) => {
        const name = `${c.prefix}${String(i).padStart(4, '0')}.jpg`;
        fs.writeFileSync(name, Buffer.from(f.data, 'base64'));
        const next = i + 1 < c.frames.length ? c.frames[i + 1].t : Math.max(f.t + 0.05, Math.min(end, f.t + 1.5));
        lines.push(`file '${require('path').resolve(name)}'`);
        lines.push(`duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
      });
      if (c.frames.length) lines.push(`file '${require('path').resolve(`${c.prefix}${String(c.frames.length - 1).padStart(4, '0')}.jpg`)}'`);
      fs.writeFileSync(`${c.prefix}list.txt`, lines.join('\n') + '\n');
      const span = c.frames.length ? c.frames[c.frames.length - 1].t - c.frames[0].t : 0;
      console.log('cast saved', c.frames.length, 'frames', span.toFixed(2) + 's', c.prefix);
    } else if (cmd === 'click') {
      // click:X,Y -> a mouse click
      const [x, y] = arg.split(',').map(Number);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await new Promise((r) => setTimeout(r, 60));
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    } else if (cmd === 'tap') {
      // tap:TEXT -> click the centre of the smallest visible button (or element) whose label or text contains TEXT
      const pos = await evalJs(`(()=>{ const want=${JSON.stringify(arg)}.toLowerCase(); const vis=(e)=>{const r=e.getBoundingClientRect(); return r.width>2&&r.height>2&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight;}; const lab=(e)=>((e.getAttribute('aria-label')||'')+' '+(e.textContent||'')).toLowerCase(); const btn=[...document.querySelectorAll('[role=button],button,a,[tabindex]')].filter(vis); const al=(e)=>(e.getAttribute('aria-label')||'').toLowerCase(); let c=btn.filter(e=>al(e)===want); if(!c.length) c=btn.filter(e=>al(e).startsWith(want)); if(!c.length) c=btn.filter(e=>lab(e).includes(want)); if(!c.length) c=[...document.querySelectorAll('div,span')].filter(e=>vis(e)&&lab(e).includes(want)); if(!c.length) return null; const top=(e)=>{const r=e.getBoundingClientRect(); const h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return !!h&&(e.contains(h)||h.contains(e))&&e.getAttribute('aria-disabled')!=='true';}; const live=c.filter(top); if(live.length) c=live; c.sort((a,b)=>{const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect(); return ra.width*ra.height-rb.width*rb.height;}); const r=c[0].getBoundingClientRect(); return [Math.round(r.x+r.width/2), Math.round(r.y+r.height/2)]; })()`);
      if (!pos || pos.error) { console.log('tap: not found', arg, pos && pos.error ? pos.error : ''); }
      else {
        const [x, y] = pos;
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await new Promise((r) => setTimeout(r, 60));
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        console.log('tap', arg, x, y);
      }
    } else if (cmd === 'touch') {
      // touch:TYPE,X,Y,ID[,X,Y,ID...]  TYPE = start | move | end   (all fingers currently down must be listed for start/move)
      const parts = arg.split(',');
      const type = parts[0];
      const pts = [];
      for (let i = 1; i + 2 < parts.length + 0; i += 3) pts.push({ x: Number(parts[i]), y: Number(parts[i + 1]), id: Number(parts[i + 2]) });
      await send('Input.dispatchTouchEvent', { type: type === 'start' ? 'touchStart' : type === 'move' ? 'touchMove' : 'touchEnd', touchPoints: pts });
    } else if (cmd === 'text') {
      // text:SELECTOR -> innerText of the first match (or the whole page)
      console.log(await evalJs(`(document.querySelector(${JSON.stringify(arg || 'body')})||{}).innerText`));
    } else if (cmd === 'log') {
      console.log(logs.slice(-Number(arg || 60)).join('\n'));
    } else {
      console.log('unknown step', step);
    }
  }
  ws.close();
}
main().catch((e) => { console.error('cdp error', e.message); process.exit(1); });
