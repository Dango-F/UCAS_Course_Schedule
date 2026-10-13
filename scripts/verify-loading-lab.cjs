// Built-in Node/CDP smoke test; no extra browser package is required.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const dist = path.resolve('dist/build/h5');
const out = path.resolve('.artifacts/loading-lab');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const server = http.createServer((req, res) => {
    let file = path.resolve(dist, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(dist + path.sep) && file !== dist) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ucas-loading-lab-'));
  const edge = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const child = spawn(edge, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
    const [port, endpoint] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
    socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let seq = 0, sessionId;
    const pending = new Map(), errors = [], checks = [];
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const job = pending.get(message.id);
        if (job) { pending.delete(message.id); message.error ? job.reject(message.error) : job.resolve(message.result); }
      } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text + ': ' + (message.params.exceptionDetails.exception?.description || ''));
    };
    const send = (method, params = {}, attached = true) => new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
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
      for (let i = 0; i < 140; i++) { if (await evaluate(expression)) return; await sleep(50); }
      throw new Error('Timed out: ' + expression);
    };
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    await waitFor(`Boolean(document.querySelector('.week-select'))`);

    const click = async selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const openPreview = async () => {
      if (!await evaluate("Boolean(document.querySelector('.settings-page'))")) await click('[data-nav-index="2"]');
      await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
      await click('[data-settings-entry="preview"]');
      await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='preview'");
      await waitFor(`Boolean(document.querySelector('.motion-section .loading-preview'))`);
      if (await evaluate("Boolean(document.querySelector('.loading-preview.is-complete'))")) await click('.finish-button');
      await waitFor("!document.querySelector('.loading-preview.is-complete')");
    };
    const shot = async name => {
      const { data } = await send('Page.captureScreenshot', { format:'png' });
      fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(data, 'base64'));
    };
    // uni-app may lazily create its own statistics UUID after page navigation.
    // Exclude only that framework key; still detect every user/app data write.
    const savedData = () => evaluate(`JSON.stringify(Object.fromEntries(Object.keys(localStorage).filter(key=>key!=='__DC_STAT_UUID').sort().map(key=>[key,localStorage.getItem(key)])))`);
    const savedBefore = await savedData();
    await openPreview();
    assert.equal(await evaluate(`document.querySelectorAll('.variant-option').length`), 4);
    const speedAlignment = await evaluate(`(() => { const row=document.querySelector('.motion-options .motion-option'), label=row.children[0].getBoundingClientRect(), picker=row.querySelector('.speed-picker').getBoundingClientRect(); return Math.abs(label.top+label.height/2-picker.top-picker.height/2) })()`);
    assert.ok(speedAlignment < 1.5, 'speed label and segmented control are vertically centered in the row');
    for (const [index, id] of ['original','arc','ticks','orbit'].entries()) {
      await click(`.variant-option:nth-child(${index + 1})`);
      await waitFor(`Boolean(document.querySelector('.loading-preview.lp-${id}'))`);
      assert.equal(await evaluate(`document.querySelectorAll('.loading-preview').length`), 1);
      await sleep(150);
      const movingSelector = id === 'original' ? '.lp-dot' : id === 'ticks' ? '.lp-tick' : '.lp-moving';
      const sample = () => evaluate(`(() => { const s=getComputedStyle(document.querySelector('${movingSelector}')); return [s.opacity,s.transform,s.animationDuration] })()`);
      const before = await sample();
      await sleep(260);
      const after = await sample();
      if (JSON.stringify(before) === JSON.stringify(after)) {
        console.log(await evaluate(`({ before: ${JSON.stringify(before)}, after: ${JSON.stringify(after)}, visibility:document.visibilityState, root:document.querySelector('.loading-preview').outerHTML, css:getComputedStyle(document.querySelector('${movingSelector}')).cssText, animations:document.getAnimations().map(a=>({name:a.animationName,playState:a.playState,currentTime:a.currentTime})), reduced:matchMedia('(prefers-reduced-motion:reduce)').matches })`));
        await shot(id + '-failed');
      }
      assert.notDeepEqual(before, after, id + ' animates');
      await shot(id + '-loading');
      assert.equal(await evaluate(`new Promise(resolve => { let count=0; const observer=new MutationObserver(records=>count+=records.length); observer.observe(document.querySelector('.loading-preview'),{subtree:true,attributes:true,childList:true}); setTimeout(()=>{observer.disconnect();resolve(count)},250) })`), 0, 'no frame-by-frame DOM writes');
      await click('.finish-button');
      await waitFor(`Boolean(document.querySelector('.loading-preview.is-complete'))`);
      if (id !== 'original') {
        const timing = await evaluate(`(() => { const s=getComputedStyle(document.querySelector('.lp-check')); return {duration:s.transitionDuration,delay:s.transitionDelay} })()`);
        assert.equal(timing.duration, '0.5s, 0.15s');
        assert.equal(timing.delay.split(',')[0].trim(), {arc:'1.5s',ticks:'0.3s',orbit:'1.9s'}[id]);
      } else {
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('.lp-ring')).transitionDuration`), '0.5s, 0.2s');
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('.lp-ring')).transitionDelay`), '0.22s, 0.22s');
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('.lp-check')).transitionDelay.split(',')[0].trim()`), '0.9s');
        assert.equal(await evaluate(`getComputedStyle(document.querySelector('.lp-check')).transitionDuration`), '0.9s, 0.2s');
      }
      if (id !== 'ticks' && id !== 'original') {
          const ringTiming = await evaluate(`(() => { const s=getComputedStyle(document.querySelector('.lp-ring')); return [s.transitionDuration,s.transitionTimingFunction] })()`);
          assert.equal(ringTiming[0].split(',')[0].trim(), before[2], 'drawing the circle takes exactly one loading revolution');
          assert.ok(ringTiming[1].startsWith(id === 'orbit' ? 'cubic-bezier(0.4, 0.18, 0.35, 1)' : 'linear'), 'ring follows the loading turn speed curve');
          await sleep(450);
          const midway = await evaluate(`parseFloat(getComputedStyle(document.querySelector('.lp-ring')).strokeDashoffset)`);
          assert.ok(midway > 0 && midway < 245.044, 'circle is visibly tracing its full turn');
          assert.equal(await evaluate(`getComputedStyle(document.querySelector('.lp-check')).opacity`), '0', 'check stays hidden while the circle is being drawn');
      }
      await waitFor(`getComputedStyle(document.querySelector('.lp-check')).strokeDashoffset === '0px'`);
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.lp-check')).strokeDashoffset`), '0px');
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.lp-check')).opacity`), '1');
      await shot(id + '-complete');
      await click('.finish-button');
      await waitFor(`!document.querySelector('.loading-preview.is-complete')`);
    }
    checks.push('four distinct CSS-driven animations, completion strokes, replay and zero per-frame DOM mutations');
    await click('.variant-option:nth-child(2)');
    await click('.speed-picker > :nth-child(2)');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.lp-moving')).animationDuration`), '2.8s');
    await click('.demo-button');
    await sleep(1000);
    assert.equal(await evaluate(`Boolean(document.querySelector('.loading-preview.is-complete'))`), false);
    await waitFor(`Boolean(document.querySelector('.loading-preview.is-complete'))`);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.lp-ring')).transitionDuration.split(',')[0].trim()`), '2.8s', 'half-speed ring also takes one revolution');
    await waitFor(`getComputedStyle(document.querySelector('.lp-check')).strokeDashoffset === '0px'`);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.lp-check')).strokeDashoffset`), '0px');
    await click('.demo-button');
    await sleep(150);
    await click('.variant-option:nth-child(3)');
    await sleep(3100);
    assert.equal(await evaluate(`Boolean(document.querySelector('.loading-preview.is-complete'))`), false, 'switch cancels pending completion');
    checks.push('vertically centered speed control, half-speed preview, timed full demo and stale timer cancellation');
    await click('[aria-label="课表背景"]');
    await waitFor(`Boolean(document.querySelector('.motion-context'))`);
    await click('[aria-label="预览减少动态"]');
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.lp-tick')).animationName`), 'none');
    await click('.finish-button');
    await sleep(100);
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('.lp-check')).strokeDashoffset`), '0px');
    await click('[aria-label="预览减少动态"]');
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    for (let i=1;i<=4;i++) {
      await click(`.variant-option:nth-child(${i})`);
      await sleep(80);
      assert.equal(await evaluate(`[...document.querySelectorAll('.loading-preview *')].every(e=>getComputedStyle(e).animationName==='none')`),true);
      await click('.finish-button');
      await sleep(80);
      assert.equal(await evaluate(`getComputedStyle(document.querySelector('.lp-check')).strokeDashoffset`),'0px');
    }
    await send('Emulation.setEmulatedMedia',{features:[]});
    checks.push('background preview, local/system reduced motion, immediately visible success');
    for (const width of [320,390,768]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
      await sleep(100);
      assert.equal(await evaluate('document.documentElement.scrollWidth'),width);
      assert.equal(await evaluate(`[...document.querySelectorAll('.variant-option')].every(e=>e.getBoundingClientRect().height>=44)`),true);
      await shot('layout-' + width);
    }
    assert.equal(await savedData(),savedBefore, 'preview never writes real settings or timetable');
    await click('.settings-back');
    await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
    await openPreview();
    assert.equal(await evaluate(`Boolean(document.querySelector('.loading-preview.is-complete'))`),false);
    await click('.demo-button');
    await click('.settings-back');
    await sleep(3200);
    await openPreview();
    assert.equal(await evaluate(`Boolean(document.querySelector('.loading-preview.is-complete'))`),false);
    checks.push('320/390/768px layouts, untouched user data, navigation and timer cleanup');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'report.json'), JSON.stringify({checks,errors},null,2));
    console.log(JSON.stringify({checks,errors,out},null,2));
    await send('Browser.close',{},false);
  } finally {
    socket?.close();
    child.kill();
    server.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
