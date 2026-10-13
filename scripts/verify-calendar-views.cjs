// Run after build:h5. Uses an isolated Edge profile, never the user's browser data.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const dist = path.resolve('dist/build/h5');
  const out = path.resolve('.artifacts/calendar-views');
  fs.mkdirSync(out, { recursive: true });
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    let file = path.resolve(dist, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(dist + path.sep)) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ucas-calendar-views-'));
  const child = spawn(process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
    assert.ok(fs.existsSync(portFile), 'Edge remote debugging did not start');
    const [port, endpoint] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
    socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let sequence = 0, sessionId;
    const pending = new Map(), errors = [], checks = [];
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const job = pending.get(message.id);
        if (job) { pending.delete(message.id); message.error ? job.reject(message.error) : job.resolve(message.result); }
      } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    };
    const send = (method, params = {}, attached = true) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timed out: ' + method)); }, 15000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      socket.send(JSON.stringify({ id, method, params, ...(attached && sessionId ? { sessionId } : {}) }));
    });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' }, false);
    ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }, false));
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor = async expression => {
      for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(50); }
      throw new Error('Timed out: ' + expression);
    };
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const ready = mode => waitFor(`document.querySelectorAll('[data-calendar-panel="ready"]').length === 5 && [...document.querySelectorAll('[data-calendar-panel="ready"]')].every(p => p.querySelector('[data-calendar-view="active"] .${mode === 'grid' ? 'week-content' : 'week-list-content'}'))`);
    const week = () => evaluate("Number(document.querySelector('.week-select').textContent.match(/\\d+/)[0])");
    const screenshot = async name => {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(shot.data, 'base64'));
    };
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/index.html#/pages/index/index` });
    await waitFor("Boolean(document.querySelector('.week-view-toggle'))");
    await click('.week-select');
    await waitFor("Boolean(document.querySelector('.week-option'))");
    await click('.week-option:nth-child(3)'); await ready('grid');
    assert.equal(await week(), 3);
    await evaluate("window.savedGrid = document.querySelector('.week-panel-content[data-week=\"3\"] .week-content'); window.savedGridScroll = [...window.savedGrid.querySelectorAll('.uni-scroll-view')].find(e => e.scrollHeight > e.clientHeight); window.savedGridScroll.scrollTop = 120");
    assert.equal(await evaluate('window.savedGridScroll.scrollTop'), 120);
    await click('.week-view-toggle'); await ready('list');
    assert.equal(await evaluate("document.querySelectorAll('.week-content,.week-list-content').length"), 6);
    await evaluate("window.savedList = document.querySelector('.week-panel-content[data-week=\"3\"] .week-list-content')");
    await screenshot('list');
    await click('.week-view-toggle'); await ready('grid');
    assert.equal(await evaluate("window.savedGrid === document.querySelector('.week-panel-content[data-week=\"3\"] .week-content')"), true);
    assert.equal(await evaluate('window.savedGridScroll.scrollTop'), 120);
    await screenshot('grid');
    await click('.week-view-toggle'); await ready('list');
    assert.equal(await evaluate("window.savedList === document.querySelector('.week-panel-content[data-week=\"3\"] .week-list-content')"), true);
    checks.push('current grid/list DOM reused; grid scroll retained; maximum six mounted views');
    await evaluate("(async () => { for (let i = 0; i < 10; i++) { document.querySelector('.week-view-toggle').click(); await new Promise(r => setTimeout(r, 8)); } })()");
    await ready('list');
    assert.equal(await evaluate("document.querySelectorAll('.week-content,.week-list-content').length"), 6);
    const swipe = async (from, to) => {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y: 350 }] });
      for (let i = 1; i <= 8; i++) {
        await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from + (to - from) * i / 8, y: 350 }] });
        await sleep(16);
      }
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(400);
    };
    await swipe(320, 70); assert.equal(await week(), 4);
    await ready('list');
    await swipe(70, 320); assert.equal(await week(), 3);
    await ready('list');
    assert.ok(await evaluate("document.querySelectorAll('.week-content,.week-list-content').length") <= 6);
    await click('.week-view-toggle'); await ready('grid');
    await swipe(320, 70); assert.equal(await week(), 4);
    checks.push('rapid toggles settle on final mode; list swipes both directions; grid swipe remains functional; cache remains bounded');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(JSON.stringify({ checks, errors, out }, null, 2));
    await send('Browser.close', {}, false);
  } finally { socket?.close(); child.kill(); server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
