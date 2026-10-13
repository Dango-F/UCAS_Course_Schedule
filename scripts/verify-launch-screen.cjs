// Real local H5 development preview of the shared Vue launch component.
// This checks composition and lifecycle, not Android's system startup window.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const out = path.resolve('.artifacts/launch-screen');
  fs.mkdirSync(out, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lakeside-launch-'));
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
    const pending = new Map(), errors = [], checks = [], layouts = [], lifecycles = [];
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const job = pending.get(message.id);
        if (job) { pending.delete(message.id); message.error ? job.reject(message.error) : job.resolve(message.result); }
      } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      else if (message.method === 'Fetch.requestPaused') {
        void send('Fetch.failRequest', { requestId: message.params.requestId, errorReason: 'Failed' }).catch(() => {});
      }
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
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor = async expression => {
      for (let n = 0; n < 400; n++) { if (await evaluate(expression)) return; await sleep(25); }
      fs.writeFileSync(path.join(out, 'failure.json'), JSON.stringify(await evaluate(`({expression:${JSON.stringify(expression)},url:location.href,frames:window.launchFrames,html:document.body.innerHTML.slice(0,6000)})`),null,2));
      throw new Error(`Timed out: ${expression}`);
    };
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.launchFrames=[];
      new MutationObserver(()=>{
        const s=document.querySelector('.launch-screen');
        const state=s?(s.classList.contains('is-leaving')?'leaving':s.classList.contains('is-playing')?'playing':'waiting'):'gone';
        if(window.launchFrames.at(-1)?.state!==state) window.launchFrames.push({state,at:performance.now()});
      }).observe(document,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    ` });
    const origin = process.env.LAUNCH_PREVIEW_URL || 'http://127.0.0.1:5173/';
    // Warm the compiler without introducing an animation for ordinary H5 users.
    await send('Page.navigate', { url: origin });
    await waitFor(`Boolean(document.querySelector('.week-select'))`);
    assert.equal(await evaluate(`Boolean(document.querySelector('.launch-screen'))`), false);
    checks.push('normal H5 has no blocking intro');

    for (const [width, height] of [[320,568], [390,844], [480,960], [844,390]]) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
      await send('Page.navigate', { url: `${origin}?launchPreview=1` });
      await waitFor(`Boolean(document.querySelector('.launch-screen.is-playing'))`);
      const layout = await evaluate(`(()=>{
        const box=q=>{const r=document.querySelector(q).getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom}};
        return {width:innerWidth,height:innerHeight,screen:box('.launch-screen'),hero:box('.launch-hero-art'),school:box('.launch-school'),background:getComputedStyle(document.querySelector('.launch-screen')).backgroundColor};
      })()`);
      assert.equal(layout.screen.w, width); assert.equal(layout.screen.h, height);
      assert.ok(layout.hero.x >= 0 && layout.hero.x + layout.hero.w <= width, 'hero fits width');
      assert.ok(layout.hero.bottom < layout.school.y, 'brand groups have separate space');
      assert.ok(layout.school.bottom <= height - 10, 'school mark clears screen edge');
      assert.equal(layout.background, 'rgb(246, 248, 252)');
      const animation = await evaluate(`({water:getComputedStyle(document.querySelector('.launch-water > uni-view')).animationName,hero:getComputedStyle(document.querySelector('.launch-hero-art')).animationName})`);
      assert.match(animation.water, /launch-ripple/);
      assert.match(animation.hero, /launch-reveal/);
      layouts.push(layout);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(out, `launch-${width}.png`), Buffer.from(shot.data, 'base64'));
      await waitFor(`!document.querySelector('.launch-screen')`);
      const frames = await evaluate('window.launchFrames');
      const playing = frames.find(frame => frame.state === 'playing');
      const leaving = frames.find(frame => frame.state === 'leaving');
      const gone = frames.find(frame => frame.state === 'gone' && frame.at > playing?.at);
      assert.ok(playing && leaving && gone, 'animation plays, fades and is removed');
      assert.ok(gone.at - playing.at < 1300, 'no prolonged animation');
      lifecycles.push({width, frames});
    }
    checks.push('320/390/480px portrait and short landscape fit without overlap; one bounded animation');

    await send('Emulation.setEmulatedMedia', { features: [{name:'prefers-reduced-motion',value:'reduce'}] });
    await send('Page.navigate', { url: `${origin}?launchPreview=1` });
    await waitFor(`Boolean(document.querySelector('.week-select')) && !document.querySelector('.launch-screen')`);
    const quietFrames = await evaluate('window.launchFrames');
    assert.ok(!quietFrames.some(frame => frame.state === 'leaving'), 'reduced motion skips the fade');
    checks.push('system reduced motion skips animated hold/fade');
    await send('Emulation.setEmulatedMedia', { features: [] });
    // Image-only interception: Vite may preload dependencies with the same URL.
    // Blocking every resource type would test page-module failure instead.
    await send('Fetch.enable', { patterns: [{urlPattern:'*launch-hero.png*',resourceType:'Image'}, {urlPattern:'*launch-school.png*',resourceType:'Image'}] });
    await send('Page.navigate', { url: `${origin}?launchPreview=1` });
    await waitFor(`Boolean(document.querySelector('.week-select')) && !document.querySelector('.launch-screen')`);
    checks.push('failed launch images do not trap the homepage');
    assert.deepEqual(errors, []);
    const failure = path.join(out,'failure.json');
    if (fs.existsSync(failure)) fs.unlinkSync(failure);
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,layouts,lifecycles,quietFrames,errors},null,2));
    console.log(JSON.stringify({checks,errors,out},null,2));
    await send('Browser.close', {}, false);
  } finally { socket?.close(); child.kill(); }
}
main().catch(error => { console.error(error); process.exitCode=1; });
