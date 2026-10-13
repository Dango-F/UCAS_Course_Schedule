// Browser regression for the handoff artwork and real component CSS.
// This isolates layout from the app's async page loading; it is not an APK test.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  // A uniform native interior cannot introduce differently positioned logos.
  const native = spawnSync('python', ['-c', `
from pathlib import Path
from PIL import Image
files = list(Path('unpackage/res/splash').glob('lakeside-*.9.png'))
assert len(files) == 3, 'Expected three native launch images'
for p in files:
    im = Image.open(p).convert('RGBA')
    assert im.crop((1, 1, im.width-1, im.height-1)).getextrema() == ((246,246),(248,248),(252,252),(255,255)), p
print('Native splash interiors share the uniform WebView background.')
`], { encoding: 'utf8', windowsHide: true });
  assert.equal(native.status, 0, native.stderr);
  const component = fs.readFileSync('src/components/LaunchScreen.vue', 'utf8');
  // Map uni-app's view elements to ordinary divs for this isolated CSS check.
  const css = component.match(/<style[^>]*>([\s\S]*?)<\/style>/)[1].replace(/> view/g, '> div');
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:#f6f8fc}${css}</style>
<div class="launch-screen"><div class="launch-hero">
<div class="launch-water"><div></div><div></div></div>
<img class="launch-hero-art" src="/launch-hero.png"></div>
<img class="launch-school" src="/launch-school.png"></div>`;
  const server = http.createServer((req, res) => {
    if (['/launch-hero.png', '/launch-school.png'].includes(req.url)) {
      res.setHeader('Content-Type', 'image/png');
      res.end(fs.readFileSync(path.join('src/static/splash', req.url.slice(1))));
    } else { res.setHeader('Content-Type', 'text/html'); res.end(html); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  const out = path.resolve('.artifacts/launch-screen');
  fs.mkdirSync(out, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lakeside-handoff-'));
  const child = spawn(process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'],
    { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let n = 0; n < 100 && !fs.existsSync(portFile); n++) await sleep(100);
    const [port, endpoint] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
    socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let seq = 0, sessionId;
    const pending = new Map();
    socket.onmessage = event => {
      const m = JSON.parse(event.data), job = pending.get(m.id);
      if (job) { pending.delete(m.id); m.error ? job.reject(m.error) : job.resolve(m.result); }
    };
    const send = (method, params = {}, attached = true) => new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      socket.send(JSON.stringify({ id, method, params, ...(attached && sessionId ? { sessionId } : {}) }));
    });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' }, false);
    ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }, false));
    await send('Runtime.enable'); await send('Page.enable');
    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    const checks = [];
    for (const [width, height] of [[320,568], [390,844], [480,960], [844,390]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      await send('Page.navigate', { url: origin });
      for (let n = 0; n < 100; n++) {
        if (await evaluate(`document.images.length===2 && [...document.images].every(i=>i.complete && i.naturalWidth>0)`)) break;
        await sleep(25);
      }
      assert.ok(await evaluate(`document.images.length===2 && [...document.images].every(i=>i.complete && i.naturalWidth>0)`), 'actual launch artwork loaded');
      const result = await evaluate(`(async()=>{
        const box=q=>{const r=document.querySelector(q).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}};
        const sample=()=>({hero:box('.launch-hero-art'),school:box('.launch-school'),opacity:getComputedStyle(document.querySelector('.launch-hero-art')).opacity});
        const before=sample();document.querySelector('.launch-screen').classList.add('is-playing');
        const frames=[];for(const delay of [0,80,160,210]) {await new Promise(r=>setTimeout(r,delay));frames.push(sample());}
        return {before,frames,animation:getComputedStyle(document.querySelector('.launch-water > div')).animationName};
      })()`);
      assert.equal(result.before.opacity, '0', 'marks wait until the shared background handoff');
      for (const frame of result.frames) {
        assert.deepEqual(frame.hero, result.before.hero, 'app mark stays in place throughout reveal/ripple');
        assert.deepEqual(frame.school, result.before.school, 'school mark stays in place throughout reveal/ripple');
      }
      assert.equal(result.frames.at(-1).opacity, '1');
      assert.match(result.animation, /launch-ripple/);
      assert.ok(result.before.hero.bottom < result.before.school.y);
      assert.ok(result.before.hero.x >= 0 && result.before.hero.x + result.before.hero.w <= width);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(out, `handoff-${width}.png`), Buffer.from(shot.data, 'base64'));
      checks.push({ width, height, ...result });
    }
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.launch-hero-art')).opacity`), '1');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.launch-hero-art')).animationName`), 'none');
    fs.writeFileSync(path.join(out, 'handoff-report.json'), JSON.stringify({ native: native.stdout.trim(), checks, reducedMotion: true, scope: 'Actual CSS/artwork in isolated browser harness; no APK or native lifecycle validation.' }, null, 2));
    console.log('Native backgrounds and stationary logo handoff passed at four viewport sizes; reduced motion passed.');
    await send('Browser.close', {}, false);
  } finally { socket?.close(); child.kill(); await new Promise(resolve => server.close(resolve)); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
