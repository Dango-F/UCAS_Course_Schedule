// Built-in Node/CDP smoke test; no extra browser package is required.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const dist = path.resolve('dist/build/h5');
const out = path.resolve('.artifacts/nav-anchor-import');
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ucas-glass-nav-'));
  const edge = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const child = spawn(edge, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
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
      const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timed out: '+method));},20000);
      pending.set(id, { resolve:value=>{clearTimeout(timeout);resolve(value)}, reject:error=>{clearTimeout(timeout);reject(error)} });
      socket.send(JSON.stringify({ id, method, params, ...(attached && sessionId ? { sessionId } : {}) }));
    });
    const { targetInfos } = await send('Target.getTargets', {}, false);
    const { targetId } = targetInfos.find(target => target.type === 'page');
    ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }, false));
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.bringToFront');
    await send('Emulation.setFocusEmulationEnabled', { enabled:true });
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
    assert.equal(await evaluate('document.visibilityState'),'visible','measure foreground transitions');




    const click = selector => evaluate('document.querySelector('+JSON.stringify(selector)+').click()');
    const tapPoint = selector => evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    const tap = async point => {
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y,id:1}]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    };
    const shot = async name => { const {data}=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data,'base64')); };
    const navRect=()=>evaluate("(()=>{const root=document.querySelector('#liquid-nav-root'),r=root.getBoundingClientRect(),canvas=root.closest('.phone-canvas'),c=canvas.getBoundingClientRect();return{y:r.y,h:r.height,center:r.y+r.height/2,bottom:r.bottom,canvasBottom:c.y+canvas.clientTop+canvas.clientHeight,percent:root.style.getPropertyValue('--navigation-anchor-center')}})()");
    await waitFor("Boolean(document.querySelector('#liquid-nav-root').style.getPropertyValue('--navigation-anchor-center'))");
    const measurements=[];
    for(const [width,height,status] of [[390,844,0],[360,780,24],[412,915,32],[320,568,24],[768,390,0]]) {
      await click('#liquid-nav-root [data-nav-index="0"]');
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
      await evaluate("document.querySelector('.phone-canvas').style.setProperty('--status-bar-height','"+status+"px')");
      await sleep(350);
      const row=await evaluate("(()=>{const e=document.querySelector('.week-view-layer[data-calendar-view=\"active\"] .grid-row[data-section=\"9\"]'),r=e.getBoundingClientRect();return{center:r.y+r.height/2,height:r.height}})()");
      const base=await navRect();
      assert.equal(row.height,60,'never compress timetable rows');
      const expected=Math.min(row.center,base.canvasBottom-12-base.h/2);
      assert.ok(Math.abs(base.center-expected)<1,'ninth-period alignment or safe-bottom clamp: '+JSON.stringify({base,row,expected}));
      for(const tab of [1,2,0]) {
        await click('#liquid-nav-root [data-nav-index="'+tab+'"]');await sleep(400);
        const current=await navRect();
        assert.ok(Math.abs(current.y-base.y)<.1,'all three tabs share calendar anchor');
      }
      await evaluate("document.querySelectorAll('.calendar-scroll .uni-scroll-view').forEach(e=>e.scrollTop=120)");
      await sleep(150);assert.ok(Math.abs((await navRect()).y-base.y)<.1,'navigation does not chase scrolling timetable');
      await evaluate("document.querySelectorAll('.calendar-scroll .uni-scroll-view').forEach(e=>e.scrollTop=0)");
      await click('.week-view-toggle');await sleep(400);
      assert.ok(Math.abs((await navRect()).y-base.y)<.1,'list mode reuses grid anchor');
      await click('.week-view-toggle');await sleep(400);
      measurements.push({width,height,status,rowCenter:row.center,navCenter:base.center,percent:base.percent});
      await shot('anchor-'+width+'x'+height);
    }
    checks.push('ninth-period center, short-screen safe-bottom clamp, status bar offsets, identical three-tab/list positions, no scroll chasing');
    // Resize while another tab is selected: the calendar header stays measurable.
    await click('#liquid-nav-root [data-nav-index="2"]');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await sleep(350);const hiddenResize=await navRect();
    await click('#liquid-nav-root [data-nav-index="0"]');await sleep(1000);
    assert.ok(Math.abs((await navRect()).y-hiddenResize.y)<.1);
    const idle=await evaluate("new Promise(resolve=>{let count=0;const o=new MutationObserver(r=>count+=r.length);o.observe(document.querySelector('#liquid-nav-root'),{subtree:true,attributes:true});setTimeout(()=>{o.disconnect();resolve(count)},250)})");
    assert.equal(idle,0,'anchor needs no idle frame writes');
    checks.push('resizing on settings preserves the same position on return; no idle writes');

    // Fresh installs start with the slide; verify the existing import lifecycle.
    await send('Page.bringToFront');
    await waitFor("document.visibilityState==='visible'");
    await click('#liquid-nav-root [data-nav-index="2"]');await sleep(400);
    const clickAndReadMotion=(button,surface)=>evaluate(`(async()=>{
      document.querySelector(${JSON.stringify(button)}).click();await new Promise(requestAnimationFrame);
      const e=document.querySelector(${JSON.stringify(surface)});
      const animation=e.getAnimations().find(a=>a.effect.getKeyframes().some(f=>f.transform));
      const {duration,easing}=animation.effect.getTiming();
      return {duration,easing,shadow:getComputedStyle(e).boxShadow,phase:e.dataset.routePhase,retained:e.isConnected};
    })()`);
    const settingsSlide=await clickAndReadMotion('[data-settings-entry="appearance"]','.settings-detail');
    assert.equal(settingsSlide.duration,340);
    assert.equal(settingsSlide.shadow,'none');
    await waitFor("document.querySelector('.settings-page')?.dataset.routePhase==='open'");
    settingsSlide.exitDuration=(await clickAndReadMotion('.settings-back','.settings-detail')).duration;
    assert.equal(settingsSlide.exitDuration,150);
    await waitFor("!document.querySelector('.settings-detail')");
    await click('#liquid-nav-root [data-nav-index="0"]');await sleep(400);
    await waitFor("document.querySelector('#liquid-nav-root [aria-current=page]')?.dataset.navIndex==='0'");
    const originalUrl=await evaluate('location.href');
    await evaluate("window.retainedCalendar=document.querySelector('#calendar-native-root');window.importMotions=[];window.recordImport=true;function record(){const e=document.querySelector('.import-route');if(e){const s=getComputedStyle(e);window.importMotions.push({x:new DOMMatrix(s.transform).m41,phase:e.dataset.routePhase,shadow:s.boxShadow})}if(window.recordImport)requestAnimationFrame(record)}requestAnimationFrame(record)");
    const importMotion=await clickAndReadMotion('.import-icon','.import-route');
    await waitFor("document.querySelector('.import-route')?.dataset.routePhase==='open'");
    assert.equal(importMotion.duration,340);assert.equal(importMotion.easing,settingsSlide.easing);
    assert.equal(importMotion.shadow,'none','import page has no edge shadow');
    assert.equal(await evaluate('location.href'),originalUrl,'plus does not navigate to native/page-stack route');
    assert.equal(await evaluate("window.retainedCalendar===document.querySelector('#calendar-native-root')"),true);
    await shot('import-open');
    const leaving=await clickAndReadMotion('.import-route .back-button','.import-route');
    assert.equal(leaving.retained,true);assert.equal(leaving.phase,'leaving');
    importMotion.exitDuration=leaving.duration;
    assert.equal(importMotion.exitDuration,settingsSlide.exitDuration,'import and settings use the same return duration');
    assert.equal(await evaluate("document.querySelector('.top-area').hasAttribute('inert')"),false,'plus is actionable as import starts returning');
    await waitFor("!document.querySelector('.import-route')");
    await evaluate('window.recordImport=false');
    const frames=await evaluate('window.importMotions');
    assert.ok(frames.some(f=>f.phase==='entering'&&f.x>2&&f.x<380),'enters from the right');
    assert.ok(frames.some(f=>f.phase==='leaving'&&f.x>2&&f.x<380),'exits to the right before unmount');
    assert.ok(frames.every(f=>f.shadow==='none'),'both import directions remain shadow-free');
    assert.equal(await evaluate("window.retainedCalendar===document.querySelector('#calendar-native-root')"),true);
    // A physical tap during the return starts a new entry, even when the sliding surface is reused.
    const plusPoint=await tapPoint('.import-icon');
    await click('.import-icon');await waitFor("document.querySelector('.import-route')?.dataset.routePhase==='open'");
    const previousImportId=await evaluate("document.querySelector('.import-route').id");
    await click('.import-route .back-button');
    await waitFor("document.querySelector('.import-route')?.dataset.routePhase==='leaving'");
    await tap(plusPoint);
    await waitFor("document.querySelector('.import-route')?.dataset.routePhase==='open'");
    assert.notEqual(await evaluate("document.querySelector('.import-route').id"),previousImportId,'rapid reopen starts a new route epoch');
    assert.equal(await evaluate("document.querySelectorAll('.import-route').length"),1);
    await click('.import-route .back-button');await waitFor("!document.querySelector('.import-route')");
    checks.push('physical tap on plus during return reopens a single import page immediately');
    // Immediate dismissal and repeated open must not strand an offscreen panel.
    await evaluate("document.querySelector('.import-icon').click();document.querySelector('.import-icon').click()");
    await waitFor("Boolean(document.querySelector('.import-route .back-button'))");
    await click('.import-route .back-button');await waitFor("!document.querySelector('.import-route')");
    await click('.import-icon');await waitFor("document.querySelector('.import-route')?.dataset.routePhase==='open'");
    await evaluate("document.querySelector('.import-route .back-button').focus()");
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await waitFor("!document.querySelector('.import-route')");
    // Tapping the exposed tab while returning must finish import state first.
    const todayPoint=await tapPoint('#liquid-nav-root [data-nav-index="1"]');
    await click('.import-icon');await waitFor("document.querySelector('.import-route')?.dataset.routePhase==='open'");
    await click('.import-route .back-button');
    await waitFor("document.querySelector('.import-route')?.dataset.routePhase==='leaving'");
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').hasAttribute('inert')"),false);
    await tap(todayPoint);
    await waitFor("!document.querySelector('.import-route') && Boolean(document.querySelector('.today-page'))");
    assert.equal(await evaluate("document.querySelector('[data-nav-index=\"1\"]').getAttribute('aria-current')"),'page');
    await click('#liquid-nav-root [data-nav-index="0"]');
    checks.push('physical touch on navigation during import return keeps selected tab and page in sync');
    // Settings import retains the directory/detail beneath it too.
    await click('#liquid-nav-root [data-nav-index="2"]');await sleep(400);
    await click('[data-settings-entry="semester"]');await waitFor("document.querySelector('.settings-page')?.dataset.routePhase==='open'");
    await click('.semester-card .import-button');await waitFor("document.querySelector('.import-route')?.dataset.routePhase==='open'");
    assert.equal(await evaluate("document.querySelector('.import-route').classList.contains('slide-detail')"),true);
    await click('.import-route .back-button');await waitFor("!document.querySelector('.import-route')");
    assert.equal(await evaluate("document.querySelector('.settings-page').dataset.settingsSection"),'semester');
    checks.push('settings-origin import remains shadow-free; import and settings share 340ms entry and 150ms return, including rapid close/reopen and Escape');
    await click('.settings-back');await waitFor("!document.querySelector('.settings-detail')");
    await click('[data-settings-entry="appearance"]');await waitFor("document.querySelector('.settings-page')?.dataset.routePhase==='open'");
    await click('[aria-label="减少动画"]');
    await click('.settings-back');await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
    await click('#liquid-nav-root [data-nav-index="0"]');await sleep(100);
    await click('.import-icon');
    await waitFor("document.querySelector('.import-route')?.dataset.routePhase==='open'");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.import-route')).transitionDuration"),'0s');
    await click('.import-route .back-button');await waitFor("!document.querySelector('.import-route')");
    checks.push('app reduced-motion preference applies to import too');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({measurements,checks,errors,settingsSlide,importMotion},null,2));
    console.log(JSON.stringify({measurements,checks,errors,out},null,2));
    await send('Browser.close',{},false);
  } finally {socket?.close();child.kill();server.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
