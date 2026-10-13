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
      const timeout=setTimeout(()=>{pending.delete(id);reject(new Error('CDP timed out: '+method));},20000);
      pending.set(id, { resolve:value=>{clearTimeout(timeout);resolve(value)}, reject:error=>{clearTimeout(timeout);reject(error)} });
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
      await click('[data-nav-index="0"]');
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
      await evaluate("document.querySelector('.phone-canvas').style.setProperty('--status-bar-height','"+status+"px')");
      await sleep(350);
      const row=await evaluate("(()=>{const e=document.querySelector('.week-view-layer[data-calendar-view=\"active\"] .grid-row[data-section=\"9\"]'),r=e.getBoundingClientRect();return{center:r.y+r.height/2,height:r.height}})()");
      const base=await navRect();
      assert.equal(row.height,60,'never compress timetable rows');
      const expected=Math.min(row.center,base.canvasBottom-12-base.h/2);
      assert.ok(Math.abs(base.center-expected)<1,'ninth-period alignment or safe-bottom clamp: '+JSON.stringify({base,row,expected}));
      for(const tab of [1,2,0]) {
        await click('[data-nav-index="'+tab+'"]');await sleep(400);
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
    await click('[data-nav-index="2"]');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    await sleep(350);const hiddenResize=await navRect();
    await click('[data-nav-index="0"]');await sleep(400);
    assert.ok(Math.abs((await navRect()).y-hiddenResize.y)<.1);
    const idle=await evaluate("new Promise(resolve=>{let count=0;const o=new MutationObserver(r=>count+=r.length);o.observe(document.querySelector('#liquid-nav-root'),{subtree:true,attributes:true});setTimeout(()=>{o.disconnect();resolve(count)},250)})");
    assert.equal(idle,0,'anchor needs no idle frame writes');
    checks.push('resizing on settings preserves the same position on return; no idle writes');

    // Fresh installs start with the slide; verify the existing import lifecycle.
    await click('[data-nav-index="2"]');await sleep(400);
    await click('[data-settings-entry="appearance"]');
    await waitFor("document.querySelector('.settings-page')?.dataset.routePhase==='open'");
    const settingsMotion=await evaluate("(()=>{const s=getComputedStyle(document.querySelector('.settings-detail'));return{duration:s.transitionDuration,property:s.transitionProperty,easing:s.transitionTimingFunction,shadow:s.boxShadow}})()");
    assert.equal(settingsMotion.property,'transform');
    assert.equal(settingsMotion.shadow,'none');
    await click('.settings-back');await sleep(550);
    await click('[data-nav-index="0"]');await sleep(400);
    const originalUrl=await evaluate('location.href');
    await evaluate("window.retainedCalendar=document.querySelector('#calendar-native-root');window.importMotions=[];window.recordImport=true;function record(){const e=document.querySelector('.import-route');if(e){const s=getComputedStyle(e);window.importMotions.push({x:new DOMMatrix(s.transform).m41,phase:e.dataset.routePhase,shadow:s.boxShadow})}if(window.recordImport)requestAnimationFrame(record)}requestAnimationFrame(record)");
    await click('.import-icon');
    await waitFor("document.querySelector('.import-route')?.dataset.routePhase==='open'");
    const importMotion=await evaluate("(()=>{const s=getComputedStyle(document.querySelector('.import-route'));return{duration:s.transitionDuration,property:s.transitionProperty,easing:s.transitionTimingFunction,shadow:s.boxShadow}})()");
    assert.equal(importMotion.duration,'0.34s');assert.equal(importMotion.property,'transform');
    assert.equal(importMotion.shadow,'none','import page has no edge shadow');
    assert.equal(await evaluate('location.href'),originalUrl,'plus does not navigate to native/page-stack route');
    assert.equal(await evaluate("window.retainedCalendar===document.querySelector('#calendar-native-root')"),true);
    await shot('import-open');
    const leaving=await evaluate("(()=>{const e=document.querySelector('.import-route');document.querySelector('.import-route .back-button').click();return new Promise(resolve=>queueMicrotask(()=>resolve({retained:e===document.querySelector('.import-route'),phase:e.dataset.routePhase})))})()");
    assert.equal(leaving.retained,true);assert.equal(leaving.phase,'leaving');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.import-route')).transitionDuration"),'0.2s','import return matches settings return');
    assert.equal(await evaluate("document.querySelector('.top-area').hasAttribute('inert')"),false,'plus is actionable as import starts returning');
    await waitFor("!document.querySelector('.import-route')");
    await evaluate('window.recordImport=false');
    const frames=await evaluate('window.importMotions');
    assert.ok(frames.some(f=>f.phase==='entering'&&f.x>2&&f.x<380),'enters from the right');
    assert.ok(frames.some(f=>f.phase==='leaving'&&f.x>2&&f.x<380),'exits to the right before unmount');
    assert.ok(frames.every(f=>f.shadow==='none'),'both import directions remain shadow-free');
    assert.equal(await evaluate("window.retainedCalendar===document.querySelector('#calendar-native-root')"),true);
    // A physical tap during the return must open a fresh import instance.
    const plusPoint=await tapPoint('.import-icon');
    await click('.import-icon');await waitFor("document.querySelector('.import-route')?.dataset.routePhase==='open'");
    await evaluate("window.previousImportRoute=document.querySelector('.import-route')");
    await click('.import-route .back-button');
    await waitFor("document.querySelector('.import-route')?.dataset.routePhase==='leaving'");
    await tap(plusPoint);
    await waitFor("document.querySelector('.import-route')?.dataset.routePhase==='open'");
    assert.equal(await evaluate("window.previousImportRoute!==document.querySelector('.import-route')"),true,'rapid reopen replaces the exiting instance');
    assert.equal(await evaluate("document.querySelectorAll('.import-route').length"),1);
    await click('.import-route .back-button');await waitFor("!document.querySelector('.import-route')");
    checks.push('physical tap on plus during return opens one fresh import page without waiting for the old exit');
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
    const todayPoint=await tapPoint('[data-nav-index="1"]');
    await click('.import-icon');await waitFor("document.querySelector('.import-route')?.dataset.routePhase==='open'");
    await click('.import-route .back-button');
    await waitFor("document.querySelector('.import-route')?.dataset.routePhase==='leaving'");
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').hasAttribute('inert')"),false);
    await tap(todayPoint);
    await waitFor("!document.querySelector('.import-route') && Boolean(document.querySelector('.today-page'))");
    assert.equal(await evaluate("document.querySelector('[data-nav-index=\"1\"]').getAttribute('aria-current')"),'page');
    await click('[data-nav-index="0"]');
    checks.push('physical touch on navigation during import return keeps selected tab and page in sync');
    for(const [mode,routeClass,property] of [['card','card-morph','clip-path, opacity'],['page','page-zoom','transform, border-radius'],['shape','shape-page','clip-path']]){
      await click('[data-nav-index="2"]');await sleep(100);
      await click('[data-settings-entry="appearance"]');await waitFor("document.querySelector('.settings-page')?.dataset.routePhase==='open'");
      await click('[data-settings-motion="'+mode+'"]');
      await waitFor("document.querySelector('.settings-detail')?.classList.contains('"+routeClass+"')");
      await click('.settings-back');await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
      await click('[data-nav-index="0"]');
      const source=await evaluate("(()=>{const p=document.querySelector('.phone-canvas').getBoundingClientRect(),b=document.querySelector('.import-icon').getBoundingClientRect();return{left:b.left-p.left,top:b.top-p.top,right:p.right-b.right,bottom:p.bottom-b.bottom,width:b.width,height:b.height,pageWidth:p.width,pageHeight:p.height}})()");
      await click('.import-icon');
      await waitFor("document.querySelector('.import-route')?.classList.contains('detail-shown')");
      await sleep(85);
      const midway=await evaluate("(()=>{const d=document.querySelector('.import-route'),s=getComputedStyle(d),r=d.getBoundingClientRect();return{phase:d.dataset.routePhase,clip:s.clipPath,width:r.width,source:!!d.querySelector('.import-origin-plus')}})()");
      assert.equal(midway.phase,'entering',mode+' still animates after the click');
      if(mode==='page')assert.ok(midway.width>source.pageWidth*source.height/source.pageHeight+2 && midway.width<source.pageWidth-2,'page zoom has a real intermediate scale');
      else {
        const inset=midway.clip.match(/^inset\([\d.]+px [\d.]+px ([\d.]+)px/);
        assert.ok(inset && Number(inset[1])>2 && Number(inset[1])<source.bottom-2,'the '+mode+' clip opens progressively from the plus');
      }
      await waitFor("document.querySelector('.import-route')?.dataset.routePhase==='open'");
      const actual=await evaluate("(()=>{const d=document.querySelector('.import-route'),s=getComputedStyle(d);return{mode:d.dataset.motion,card:d.classList.contains('card-morph'),page:d.classList.contains('page-zoom'),shape:d.classList.contains('shape-page'),property:s.transitionProperty,shadow:s.boxShadow,left:parseFloat(d.style.getPropertyValue('--morph-left')),top:parseFloat(d.style.getPropertyValue('--morph-top')),scale:parseFloat(d.style.getPropertyValue('--zoom-scale')),content:!!d.querySelector('.import-page'),source:!!d.querySelector('.import-origin-plus')}})()");
      assert.equal(actual.mode,mode);
      assert.equal(actual.property,property);
      assert.equal(actual.shadow,'none');
      assert.equal(actual.content,true,'the import page remains mounted for '+mode);
      if(mode!=='page'){
        assert.ok(Math.abs(actual.left-source.left)<1 && Math.abs(actual.top-source.top)<1,'the '+mode+' origin is the real plus button');
      }
      if(mode==='page')assert.ok(Math.abs(actual.scale-Math.min(source.width/source.pageWidth,source.height/source.pageHeight))<.005);
      if(mode==='shape')assert.equal(actual.source,true,'shape mode preserves the plus during the blurred handoff');
      await shot('import-'+mode+'-open');
      await click('.import-route .back-button');
      await waitFor("document.querySelector('.import-route')?.dataset.routePhase==='leaving'");
      assert.equal(await evaluate("document.querySelector('.import-route').dataset.motion"),mode,'the '+mode+' return uses the entry mode');
      await waitFor("!document.querySelector('.import-route')");
    }
    checks.push('calendar plus applies saved card, uniform page zoom, and blurred shape-to-page on entry and return while preserving import content');
    // Settings import retains the directory/detail beneath it too.
    await click('[data-nav-index="2"]');await sleep(400);
    await click('[data-settings-entry="semester"]');await waitFor("document.querySelector('.settings-page')?.dataset.routePhase==='open'");
    await click('.semester-card .import-button');await waitFor("document.querySelector('.import-route')?.dataset.routePhase==='open'");
    assert.equal(await evaluate("document.querySelector('.import-route').dataset.motion"),'slide','settings import keeps its existing slide transition');
    await click('.import-route .back-button');await waitFor("!document.querySelector('.import-route')");
    assert.equal(await evaluate("document.querySelector('.settings-page').dataset.settingsSection"),'semester');
    checks.push('settings-origin import remains shadow-free; import keeps 340ms entry, 200ms return, rapid close/reopen, Escape and settings import return');
    await click('.settings-back');await sleep(550);
    await click('[data-settings-entry="appearance"]');await waitFor("document.querySelector('.settings-page')?.dataset.routePhase==='open'");
    await click('.settings-motion-setting + .preference-row');
    await click('.settings-back');await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
    await click('[data-nav-index="0"]');await sleep(100);
    await click('.import-icon');
    await waitFor("document.querySelector('.import-route')?.dataset.routePhase==='open'");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.import-route')).transitionDuration"),'0s');
    await click('.import-route .back-button');await waitFor("!document.querySelector('.import-route')");
    checks.push('app reduced-motion preference applies to import too');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({measurements,checks,errors,settingsMotion,importMotion},null,2));
    console.log(JSON.stringify({measurements,checks,errors,out},null,2));
    await send('Browser.close',{},false);
  } finally {socket?.close();child.kill();server.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
