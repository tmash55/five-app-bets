// What the checking tools (qa.js, slowapi.js) share: one DevTools connection to the headless browser, finding a
// button by its label, pressing it with a mouse or a finger, and the browser's network throttling presets.
const PORT = process.env.CDP_PORT || 9333;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** the browser's own throttling presets, as DevTools has them (bytes a second, ms) */
const NETS = {
  '3g': { offline: false, latency: 562.5, downloadThroughput: ((1.6 * 1024 * 1024) / 8) * 0.9, uploadThroughput: ((750 * 1024) / 8) * 0.9 },
  slow3g: { offline: false, latency: 2000, downloadThroughput: ((500 * 1024) / 8) * 0.8, uploadThroughput: ((500 * 1024) / 8) * 0.8 },
  offline: { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 },
  off: { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 },
};

/** the centre of the smallest visible button (or element) whose label or text is, starts with or contains `want` */
const FIND = (want) =>
  `(()=>{ const want=${JSON.stringify(want)}.toLowerCase(); const vis=(e)=>{const r=e.getBoundingClientRect(); return r.width>2&&r.height>2&&r.right>0&&r.bottom>0&&r.left<innerWidth&&r.top<innerHeight;}; const lab=(e)=>((e.getAttribute('aria-label')||'')+' '+(e.textContent||'')).toLowerCase(); const btn=[...document.querySelectorAll('[role=button],button,a,[tabindex]')].filter(vis); const al=(e)=>(e.getAttribute('aria-label')||'').toLowerCase(); let c=btn.filter(e=>al(e)===want); if(!c.length) c=btn.filter(e=>al(e).startsWith(want)); if(!c.length) c=btn.filter(e=>lab(e).includes(want)); if(!c.length) c=[...document.querySelectorAll('div,span')].filter(e=>vis(e)&&lab(e).includes(want)); if(!c.length) return null; const top=(e)=>{const r=e.getBoundingClientRect(); const h=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return !!h&&(e.contains(h)||h.contains(e))&&e.getAttribute('aria-disabled')!=='true';}; const live=c.filter(top); if(live.length) c=live; c.sort((a,b)=>{const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect(); return ra.width*ra.height-rb.width*rb.height;}); const r=c[0].getBoundingClientRect(); return [Math.round(r.x+r.width/2), Math.round(r.y+r.height/2)]; })()`;

/**
 * Connect to the browser's page. `on` hears every protocol event (method, params).
 * Gives `send`, `evalJs`, the console's errors and warnings in `logs`, and helpers that press and wait.
 */
async function connect({ port = PORT, touch = false, on } = {}) {
  const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  let page = list.find((t) => t.type === 'page');
  if (!page) page = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
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
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      if (msg.params.type === 'error' || msg.params.type === 'warning') logs.push(`[${msg.params.type}] ${msg.params.args.map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type)).join(' ')}`.slice(0, 400));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      logs.push(`[exception] ${d.text} ${d.exception ? d.exception.description : ''}`.slice(0, 400));
    }
    if (msg.method && on) on(msg.method, msg.params);
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
  /** press a point: a finger when `touch`, else the mouse */
  const press = async (x, y, hold = 60) => {
    if (touch) {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
      await sleep(hold);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await sleep(hold);
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
  /** poll until the expression is truthy; gives the ms it took, or -1 */
  const until = async (expr, ms = 60000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const v = await evalJs(expr);
      if (v && !v.error) return Date.now() - t0;
      await sleep(100);
    }
    return -1;
  };
  const shot = async (file, format = 'png') => {
    const r = await send('Page.captureScreenshot', { format });
    require('fs').writeFileSync(file, Buffer.from(r.data, 'base64'));
  };
  await send('Runtime.enable');
  await send('Page.enable');
  return { ws, send, evalJs, logs, press, tap, until, shot, close: () => ws.close() };
}

/** `--name value` and `--flag` from the command line */
function readArgs(argv = process.argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[a.slice(2)] = true;
    else args[a.slice(2)] = argv[++i];
  }
  return args;
}

/** "844x390@2" */
function readSize(text, fallback = '844x390@1') {
  const [wh, dsf] = String(text || fallback).split('@');
  const [width, height] = wh.split('x').map(Number);
  return { width, height, scale: Number(dsf || 1) };
}

module.exports = { connect, sleep, NETS, FIND, readArgs, readSize };
