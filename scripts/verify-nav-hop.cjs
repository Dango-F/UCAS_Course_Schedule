// Built-in Node/CDP smoke test; no extra browser package is required.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const dist = path.resolve('dist/build/h5');
const out = path.resolve('.artifacts/nav-hop');
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
    let port,endpoint;
    for (let i = 0; i < 100; i++) {
      try {
        [port,endpoint]=fs.readFileSync(portFile,'utf8').trim().split(/\r?\n/);
        if (port && endpoint) break;
      } catch (error) { if (!['ENOENT','EBUSY'].includes(error.code)) throw error; }
      await sleep(100);
    }
    assert.ok(port&&endpoint,'headless browser debugging port is ready');
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



    const click = s => evaluate('(()=>{if('+JSON.stringify(s)+'.includes("data-nav-index") && document.querySelector("#liquid-nav-root")?.dataset.navIdle==="true") document.querySelector(".glass-wake").click();document.querySelector('+JSON.stringify(s)+').click()})()');
    const shot = async name => {const {data}=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data,'base64'))};
    let touchCount=0;
    const touch=(type,x,y)=>{const number=++touchCount;return send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1}]}).catch(error=>{throw new Error('Touch '+number+' '+type+' at '+Math.round(x)+','+Math.round(y)+': '+error.message)})};
    const state=()=>evaluate("(()=>{const i=document.querySelector('#liquid-nav-root .glass-selection'),m=new DOMMatrix(getComputedStyle(i).transform);return{x:m.m41,lift:Number(document.querySelector('#liquid-nav-root').style.getPropertyValue('--glass-press')),sx:Number(i.style.getPropertyValue('--glass-stretch')),sy:Number(i.style.getPropertyValue('--glass-squeeze'))}})()");
    const idle=()=>evaluate("new Promise(resolve=>{let n=0;const o=new MutationObserver(r=>n+=r.length);o.observe(document.querySelector('#liquid-nav-root'),{subtree:true,attributes:true});setTimeout(()=>{o.disconnect();resolve(n)},200)})");
    const lightState=()=>evaluate("(()=>{const r=document.querySelector('#liquid-nav-root'),l=r.querySelector('.glass-light'),s=r.querySelector('.glass-selection'),b=r.querySelector('.glass-bar'),lr=l.getBoundingClientRect(),sr=s.getBoundingClientRect();return{x:lr.x+lr.width/2,y:lr.y+lr.height/2,selectorX:sr.x+sr.width/2,width:lr.width,barHeight:b.clientHeight,opacity:Number(getComputedStyle(l).opacity)}})()");
    const assertLightAt=async(x,y)=>{await evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');const l=await lightState();assert.ok(Math.abs(l.x-x)<1&&Math.abs(l.y-y)<1,'light follows the touched position: '+JSON.stringify({expected:{x,y},actual:l}));assert.ok(Math.abs(l.width-l.barHeight*2.1)<.1,'light size matches current bar');assert.ok(l.opacity>.9);};
    await waitFor("Boolean(document.querySelector('#liquid-nav-root[data-glass-renderer]'))");await sleep(150);
    if (process.argv.includes('--flow-wall-inertia-only')) {
      const actual='#liquid-nav-root',preview='#glass-material-preview .preview-lens-root';
      const settle=async(root,index)=>{await click(root+` [data-nav-index="${index}"]`);await sleep(950)};
      const sample=(root,index)=>evaluate(`new Promise(resolve=>{
        const r=document.querySelector(${JSON.stringify(root)}),s=r.querySelector('.glass-selection'),b=r.querySelector('.glass-bar'),frames=[],start=performance.now();
        r.querySelector('[data-nav-index="${index}"]').click();
        function read(){const face=s.firstElementChild,rect=face.getBoundingClientRect(),bar=b.getBoundingClientRect(),m=new DOMMatrix(getComputedStyle(s).transform),n=b.querySelectorAll('[data-nav-index]').length,tab=(bar.width-8)/n;
          frames.push({t:performance.now()-start,x:m.m41,sx:Number(s.style.getPropertyValue('--glass-stretch')),sy:Number(s.style.getPropertyValue('--glass-squeeze')),shift:parseFloat(s.style.getPropertyValue('--glass-flow-impact-x'))||0,
            center:rect.left+rect.width/2-bar.left-4,left:rect.left-bar.left-4,right:bar.right-4-rect.right,tab,n});
          if(performance.now()-start<1100)requestAnimationFrame(read);else resolve(frames)}requestAnimationFrame(read)
      })`);
      const assertWall=(frames,index)=>{
        const {tab,n}=frames[0],direction=index===0?-1:1,target=index*tab;
        assert.ok(frames.some(f=>f.sy>1.005&&direction*(f.x-target)<-.001),'wall elongation begins during incoming travel, not after rest');
        const crossing=frames.findIndex(f=>direction*(f.center-(index+.5)*tab)>=0);
        assert.ok(crossing>0&&crossing<frames.length-1,'visible capsule passes its normal center under incoming inertia');
        assert.ok(direction*(frames[crossing].center-frames[crossing-1].center)>.001&&direction*(frames[crossing+1].center-frames[crossing].center)>.001,
          'no stopped center frame followed by an intentional sideways shift');
        assert.ok(frames.some(f=>f.sx<.89&&f.sy>1.14),'wall preserves lighter narrowing and vertical elongation');
        const contact=frames.findIndex(f=>Math.abs(f.x-target)<.01);
        assert.ok(contact>=0&&frames[contact].sy>1.02,'deformation is already under way on arrival');
        assert.ok(frames.slice(contact).every(f=>Math.abs(index===0?f.left:f.right)<.1),'wall-facing edge stays pinned once contact is reached');
        assert.ok(frames.every(f=>f.x>=-.01&&f.x<=(n-1)*tab+.01&&f.shift===0),'no out-of-bounds travel or independent face translation');
        assert.ok(Math.abs(frames.at(-1).x-target)<.01&&frames.at(-1).sx===1&&frames.at(-1).sy===1,'wall recovers exactly to rest');
      };
      await click(actual+' [data-nav-index="2"]');await waitFor("Boolean(document.querySelector('[data-settings-entry=appearance]'))");
      await click('[data-settings-entry="appearance"]');await waitFor("document.querySelector('.settings-page')?.dataset.routePhase==='open'");
      await click('[data-nav-motion="flow"]');await sleep(150);
      await settle(preview,1);const previewLeft=await sample(preview,0);assertWall(previewLeft,0);
      await settle(preview,1);const previewLast=await evaluate("document.querySelectorAll('#glass-material-preview [data-nav-index]').length-1");
      const previewRight=await sample(preview,previewLast);assertWall(previewRight,previewLast);
      await click('.settings-back');await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
      await settle(actual,1);const left=await sample(actual,0);assertWall(left,0);
      const brake=await sample(actual,1),tab=brake[0].tab;
      assert.ok(brake.some(f=>f.x>tab*1.059)&&Math.abs(brake.at(-1).x-tab)<.1,'the successful middle-tab brake remains unchanged');
      const last=await evaluate("document.querySelectorAll('#liquid-nav-root [data-nav-index]').length-1");
      const right=await sample(actual,last);assertWall(right,last);
      assert.equal(await idle(),0,'flow wall stops writing at rest');
      await click('[data-settings-entry="appearance"]');await waitFor("document.querySelector('.settings-page')?.dataset.routePhase==='open'");
      await click('[data-q-elastic]');await waitFor("document.querySelector('[data-q-elastic]').getAttribute('aria-checked')==='false'");
      await click('.settings-back');await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
      await settle(actual,1);const off=await sample(actual,0);
      assert.ok(off.every(f=>f.sx===1&&f.sy===1&&f.shift===0),'Q off still has no deformation');
      assert.deepEqual(errors,[]);
      checks.push('real navigation and preview preserve incoming movement into both walls; compression starts before rest, without independent face translation',
        'wall edges remain pinned; lighter narrowing and vertical stretch recover in 125ms; middle-tab braking and Q-off behavior are unchanged');
      fs.writeFileSync(path.join(out,'flow-wall-inertia-report.json'),JSON.stringify({checks,errors,previewLeft,previewRight,left,right,brake,off},null,2));
      console.log(JSON.stringify({checks,errors,out},null,2));return;
    }
    if (process.argv.includes('--q-elastic-only') || process.argv.includes('--hop-inertia-only')) {
      const actual = '#liquid-nav-root', preview = '#glass-material-preview .preview-lens-root';
      const tabSize = root => evaluate(`(()=>{const b=document.querySelector(${JSON.stringify(root)}+' .glass-bar');return(b.clientWidth-8)/b.querySelectorAll('[data-nav-index]').length})()`);
      const sample = (root,index) => evaluate(`new Promise(resolve=>{
        const r=document.querySelector(${JSON.stringify(root)}),s=r.querySelector('.glass-selection'),frames=[];
        const start=performance.now();r.querySelector('[data-nav-index="${index}"]').click();
        function read(){const m=new DOMMatrix(getComputedStyle(s).transform),face=s.firstElementChild,after=getComputedStyle(face,'::after'),light=getComputedStyle(r.querySelector('.glass-light')),rect=face.getBoundingClientRect(),base=s.getBoundingClientRect();frames.push({t:performance.now()-start,x:m.m41,y:m.m42,sx:Number(s.style.getPropertyValue('--glass-stretch')),sy:Number(s.style.getPropertyValue('--glass-squeeze')),pressure:Number(r.style.getPropertyValue('--glass-press')),shadow:after.boxShadow,highlight:after.backgroundImage,highlightOpacity:Number(after.opacity),lightOpacity:Number(light.opacity),lightBackground:light.backgroundImage,restShadow:getComputedStyle(face).boxShadow,surfaceShadow:getComputedStyle(r.querySelector('.glass-surface')).boxShadow,filter:getComputedStyle(face).backdropFilter,centerOffset:(rect.left+rect.right-base.left-base.right)/2,shift:parseFloat(s.style.getPropertyValue('--glass-flow-impact-x'))||0});
          if(performance.now()-start<850)requestAnimationFrame(read);else resolve(frames)}requestAnimationFrame(read)
      })`);
      const settle = async (root,index) => { await click(root+` [data-nav-index="${index}"]`);await sleep(850) };
      const enter = async () => {
        await click(actual+' [data-nav-index="2"]');await sleep(400);await click('[data-settings-entry="appearance"]');
        await waitFor("document.querySelector('.settings-page')?.dataset.routePhase==='open'");
      };
      const leave = async () => {await click('.settings-back');await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");await settle(actual,0)};
      const toggle = async enabled => {
        await click('[data-q-elastic]');await waitFor(`document.querySelector('[data-q-elastic]')?.getAttribute('aria-checked')==='${enabled}'`);
      };
      const assertHopInertia = (frames,tab,direction) => {
        const crossing=frames.findIndex(f=>direction*(f.x-tab)>=0);
        assert.ok(crossing>0&&crossing<frames.length-1,'hop crosses the target during incoming travel');
        assert.ok(direction*(frames[crossing].x-frames[crossing-1].x)>.001,'hop has not parked before crossing');
        assert.ok(direction*(frames[crossing+1].x-frames[crossing].x)>.001,'hop keeps its incoming movement after crossing');
        const peak=Math.max(...frames.map(f=>direction*(f.x-tab)));
        assert.ok(peak>tab*.059&&peak<=tab*.0601,'hop shares the bounded 6% inertia curve with flow');
        assert.ok(frames.filter(f=>f.x/tab>=.5&&f.x/tab<=1.5).every(f=>Math.abs(f.centerOffset)<.1&&f.shift===0),
          'the interior face stays centered without an independent sideways shift');
        assert.ok(frames.some(f=>f.sx>1.11&&f.sy<.86),'hop keeps its lighter compression and faster recovery');
        assert.ok(Math.abs(frames.at(-1).x-tab)<.1&&frames.at(-1).sx===1&&frames.at(-1).sy===1,'hop settles exactly at the selected tab');
      };
      await enter();
      assert.equal(await evaluate("document.querySelector('[data-q-elastic]').getAttribute('aria-checked')"),'true');
      await toggle(false);
      await evaluate("document.querySelector('[data-q-elastic]').scrollIntoView({block:'center'})");await sleep(150);await shot('q-elastic-off');
      await settle(preview,0);
      const previewTab=await tabSize(preview),hopOff=await sample(preview,1);
      assert.ok(hopOff.some(f=>f.y<-4.5&&f.sy>1.3),'hop flight and inflation remain');
      assert.ok(hopOff.some(f=>f.lightOpacity>.5),'hop mode keeps its moving light when Q elasticity is off');
      assert.ok(hopOff.every(f=>f.sy>=.9999),'hop never performs landing compression when off');
      assert.ok(Math.abs(hopOff.at(-1).x-previewTab)<.1&&hopOff.at(-1).sy===1);
      await click('[data-nav-motion="flow"]');await sleep(100);await settle(preview,0);
      const previewFlowOff=await sample(preview,1);
      assert.ok(previewFlowOff.every(f=>f.x<=previewTab+.01&&f.sy===1&&f.sx===1),'preview keeps its dimensions with no braking overshoot when off');
      const previewLast=await evaluate(`document.querySelector(${JSON.stringify(preview)}).querySelectorAll('[data-nav-index]').length-1`);
      const previewWallOff=await sample(preview,previewLast);
      assert.ok(previewWallOff.every(f=>f.sy===1&&f.sx===1),'preview has no travel deformation or wall elongation when off');
      await leave();
      const realTab=await tabSize(actual),flowOff=await sample(actual,1);
      assert.ok(flowOff.every(f=>f.x<=realTab+.01&&f.sy===1&&f.sx===1),'real nav keeps its dimensions throughout movement when off');
      for (const frames of [previewFlowOff,previewWallOff,flowOff]) {
        assert.ok(frames.every(f=>f.shadow==='none'),
          'off removes both dark and white transient rim shadows throughout movement and arrival');
        assert.ok(frames.every(f=>f.lightOpacity===0),'off removes the broad flow halo throughout movement and arrival');
        assert.ok(frames.every(f=>f.lightBackground.includes('radial-gradient')),'the glass light material is retained for the enabled state');
        assert.ok(frames.every(f=>f.pressure===0&&f.highlightOpacity===0&&!f.filter.includes('url(')),
          'off removes automatic selector refraction and reflection during flow travel and arrival');
        assert.ok(frames.every(f=>f.highlight.includes('linear-gradient')),
          'the reflection material remains available for real finger presses');
        assert.ok(frames.every(f=>f.restShadow!=='none'&&f.surfaceShadow!=='none'),'resting selector and bar shadows remain');
      }
      await send('Page.reload');await waitFor("Boolean(document.querySelector('#liquid-nav-root[data-glass-renderer]'))");await sleep(150);await enter();
      assert.equal(await evaluate("document.querySelector('[data-q-elastic]').getAttribute('aria-checked')"),'false','off choice survives reload');
      await toggle(true);await click('[data-nav-motion="hop"]');await sleep(100);await settle(preview,0);
      const hopOn=await sample(preview,1);
      assert.ok(hopOn.some(f=>f.sy<.86),'reenabling restores hop compression');
      assertHopInertia(hopOn,previewTab,1);
      await settle(preview,previewLast);
      const previewHopLeft=await sample(preview,1);
      assertHopInertia(previewHopLeft,previewTab,-1);
      await evaluate("document.querySelector('[data-q-elastic]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))");
      await waitFor("document.querySelector('[data-q-elastic]').getAttribute('aria-checked')==='false'");
      await toggle(true);await click('[data-nav-motion="flow"]');await sleep(100);
      await evaluate("document.querySelector('[data-q-elastic]').scrollIntoView({block:'center'})");await sleep(150);await shot('q-elastic-on');
      await leave();
      const flowOn=await sample(actual,1);
      assert.ok(flowOn.some(f=>f.x>realTab*1.055),'reenabling restores real inertial braking');
      assert.ok(flowOn.some(f=>f.lightOpacity>.5),'reenabling restores the broad moving light');
      assert.ok(flowOn.some(f=>f.pressure>.5&&f.shadow!=='none'&&f.shadow.includes('inset')),'reenabling restores the original dynamic shadows');
      assert.equal(flowOff[0].restShadow,flowOn[0].restShadow,'resting selector shadows are unchanged');
      assert.equal(flowOff[0].surfaceShadow,flowOn[0].surfaceShadow,'bar surface shadows are unchanged');
      const last=await evaluate("document.querySelectorAll('#liquid-nav-root [data-nav-index]').length-1"),wallOn=await sample(actual,last);
      assert.ok(wallOn.some(f=>f.sy>1.14),'reenabling restores real wall elongation');
      await enter();await click('[data-nav-motion="hop"]');await sleep(100);await leave();
      const realHopRight=await sample(actual,1);
      assertHopInertia(realHopRight,realTab,1);
      await settle(actual,last);
      const realHopLeft=await sample(actual,1);
      assertHopInertia(realHopLeft,realTab,-1);
      assert.equal(errors.length,0,errors.join('\n'));
      checks.push('Q elastic defaults on, toggles immediately with pointer/keyboard and persists after reload',
        'real flow navigation and preview keep exact width/height; braking, wall elongation and hop landing squash are disabled while hop travel remains',
        'flow dynamic rim shadows and automatic selector optics are off at every frame, while resting glass and press materials remain',
        'the outer moving halo stays invisible in flow when off, and returns when enabled; hop light remains unchanged',
        'reenabling restores hop compression, inertial braking, wall impact and original dynamic shadows',
        'real hop navigation and settings preview preserve incoming movement in both directions, with no pause or independent face shift');
      const report={checks,errors,hopOff,previewFlowOff,previewWallOff,flowOff,hopOn,previewHopLeft,realHopRight,realHopLeft,flowOn,wallOn};
      fs.writeFileSync(path.join(out,'q-elastic-report.json'),JSON.stringify(report,null,2));
      console.log(JSON.stringify({output:out,checks,errors},null,2));return;
    }
    // Optional baseline comparison: disable only the new independent light.
    if(process.env.GLASS_TOUCH_LIGHT_OFF==='1') await evaluate("document.querySelector('#liquid-nav-root').dataset.glassTouchLight='off'");
    // Fresh hop startup: previously all three holds left the light at x=59.
    const freshBar=await evaluate("(()=>{const r=document.querySelector('#liquid-nav-root .glass-bar').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()");
    const tabCount=await evaluate("document.querySelectorAll('#liquid-nav-root [data-nav-index]').length");
    for(let i=0;i<tabCount;i++) {
      const px=freshBar.x+4+(i+.5)*(freshBar.w-8)/tabCount,py=freshBar.y+freshBar.h/2;
      await touch('touchStart',px,py);await sleep(430);await assertLightAt(px,py);
      await touch('touchMove',px+2,py+6);await sleep(50);await assertLightAt(px+2,py+6);
      await touch('touchCancel');await sleep(430);
    }
    await evaluate("window.defaultHopHeights=[];window.recordDefaultHop=true;window.captureDefaultHop=()=>{const i=document.querySelector('#liquid-nav-root .glass-selection');window.defaultHopHeights.push(new DOMMatrix(getComputedStyle(i).transform).m42);if(window.recordDefaultHop)requestAnimationFrame(window.captureDefaultHop)};requestAnimationFrame(window.captureDefaultHop)");
    await click('[data-nav-index="1"]');await sleep(380);
    await evaluate('window.recordDefaultHop=false');
    const defaultRise=await evaluate('Math.min(...window.defaultHopHeights)');
    assert.ok(defaultRise < -4.5 && defaultRise > -5.5,'the unconfigured hop peaks at 5px: '+defaultRise);
    await click('[data-nav-index="0"]');await sleep(380);
    checks.push('fresh hop mode tracks every held tab and sub-threshold/vertical finger movement');
    await click('[data-nav-index="2"]');await sleep(600);await click('[data-settings-entry="appearance"]');
    await waitFor("document.querySelector('.settings-page')?.dataset.routePhase==='open'");
    assert.equal(await evaluate("document.querySelector('[data-nav-motion=\"hop\"]').getAttribute('aria-pressed')"),'true');
    assert.equal(await evaluate("document.querySelector('.hop-height-slider').getAttribute('aria-valuenow')"),'5','hop peak defaults to 5px');
    const peakLayout=await evaluate("(()=>{const clarity=document.querySelector('.clarity-slider').getBoundingClientRect(),hop=document.querySelector('.hop-height-slider').getBoundingClientRect(),motion=document.querySelector('.navigation-motion-setting').getBoundingClientRect(),handle=document.querySelector('.hop-height-slider .uni-slider-handle').getBoundingClientRect(),bar=document.querySelector('#glass-material-preview .glass-bar');return{clarityBottom:clarity.bottom,hopTop:hop.top,hopBottom:hop.bottom,motionTop:motion.top,handleX:handle.x+handle.width/2,handleY:handle.y+handle.height/2,tab:(bar.clientWidth-8)/bar.querySelectorAll('[data-nav-index]').length}})()");
    assert.ok(peakLayout.clarityBottom<peakLayout.hopTop&&peakLayout.hopBottom<peakLayout.motionTop,'peak setting sits between glass clarity and navigation mode');
    await evaluate("window.previewHopXs=[];window.recordPreviewHop=true;window.capturePreviewHop=()=>{const i=document.querySelector('#glass-material-preview .glass-selection');window.previewHopXs.push(new DOMMatrix(getComputedStyle(i).transform).m41);if(window.recordPreviewHop)requestAnimationFrame(window.capturePreviewHop)};requestAnimationFrame(window.capturePreviewHop)");
    await touch('touchStart',peakLayout.handleX,peakLayout.handleY);
    await touch('touchMove',peakLayout.handleX+45,peakLayout.handleY);
    await sleep(100);
    assert.equal(await evaluate("Math.max(...window.previewHopXs)"),0,'dragging changes the value without playing the navigation preview');
    await touch('touchEnd');await sleep(1500);
    await evaluate('window.recordPreviewHop=false');
    const previewHopXs=await evaluate('window.previewHopXs');
    assert.ok(Math.max(...previewHopXs)>peakLayout.tab*1.8&&Math.abs(previewHopXs.at(-1))<1,'release previews exactly the left-right and right-left hops');
    checks.push('peak slider follows clarity; dragging does not preview, release plays left-to-right then right-to-left in the sample navigation');
    await evaluate("document.querySelector('.hop-height-slider').dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))");
    await waitFor("document.querySelector('.hop-height-slider').getAttribute('aria-valuenow')==='2'");
    await evaluate("document.querySelector('.hop-height-slider').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))");
    await waitFor("document.querySelector('.hop-height-slider').getAttribute('aria-valuenow')==='9'");
    await click('[data-nav-motion="hop"]');await sleep(150);
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').classList.contains('is-hop')"),true);
    await evaluate("document.querySelector('.settings-detail .settings-scroll .uni-scroll-view').scrollTop=240");await sleep(100);
    await shot('mode-setting');
    await click('.settings-back');await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
    await click('[data-nav-index="0"]');await sleep(450);
    const bar=await evaluate("(()=>{const r=document.querySelector('#liquid-nav-root .glass-bar').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()");
    const tab=(bar.width-8)/tabCount, x=i=>bar.x+4+(i+.5)*tab,y=bar.y+bar.height/2;
    await touch('touchStart',x(0),y);await sleep(250);
    const held=await state();assert.ok(held.sy>1.35&&held.sx>1.1,'long press visibly enlarges in both axes');
    const material=()=>evaluate("(()=>{const root=document.querySelector('#liquid-nav-root'),e=root.querySelector('.glass-selection > uni-view'),s=getComputedStyle(e),b=getComputedStyle(e,'::before'),a=getComputedStyle(e,'::after'),l=getComputedStyle(root.querySelector('.glass-light'));return{clear:root.classList.contains('is-material-clear'),filter:s.backdropFilter,background:s.backgroundColor,gradient:s.backgroundImage,tint:Number(b.opacity),highlight:a.backgroundImage,highlightOpacity:Number(a.opacity),light:l.backgroundImage,lightOpacity:Number(l.opacity),edge:a.boxShadow}})()");
    const assertClear=m=>{
      assert.equal(m.clear,true);assert.match(m.filter,/^brightness\(1\) url\(/);assert.equal(m.background,'rgba(0, 0, 0, 0)');assert.equal(m.tint,0);
      assert.match(m.gradient,/linear-gradient/,'original surface highlight remains');
      assert.match(m.highlight,/linear-gradient/,'pressed reflection remains');
      assert.match(m.light,/radial-gradient/,'moving light remains');
      assert.ok(m.highlightOpacity>.9&&m.lightOpacity>.9,'highlights are actually visible while held');
      const peakAlpha=gradient=>{const alphas=[...gradient.matchAll(/rgba\([^)]*,\s*([\d.]+)\)/g)].map(match=>Number(match[1]));assert.ok(alphas.length>0);return Math.max(...alphas)};
      assert.ok(peakAlpha(m.gradient)>0&&peakAlpha(m.gradient)<=.045,'active surface sheen remains but is at most 4% white');
      assert.ok(peakAlpha(m.highlight)>0&&peakAlpha(m.highlight)<=.065,'pressed reflection remains but is at most 6% white');
      assert.ok(peakAlpha(m.light)>0&&peakAlpha(m.light)<=.065,'tracked light remains but is at most 6% white');
      assert.notEqual(m.edge,'none');
    };
    assertClear(await material());
    const bounds=await evaluate("(()=>{const r=document.querySelector('#liquid-nav-root .glass-selection > uni-view').getBoundingClientRect();return{left:r.left,right:r.right}})()");
    assert.ok(bounds.left>=0&&bounds.right<=390,'edge capsule stays on screen');
    await shot('long-press');assert.equal(await idle(),0,'stationary hold stops writing frames');
    await touch('touchEnd');await sleep(240);assert.equal((await state()).sy,1);
    // Record real frames rather than only checking that a light gradient exists.
    await evaluate("window.lightFrames=[];window.lightRecording=true;window.recordLight=()=>{const root=document.querySelector('#liquid-nav-root'),l=root.querySelector('.glass-light').getBoundingClientRect(),s=root.querySelector('.glass-selection').getBoundingClientRect();window.lightFrames.push({light:l.x+l.width/2,selector:s.x+s.width/2});if(window.lightRecording)requestAnimationFrame(window.recordLight)};requestAnimationFrame(window.recordLight)");
    await evaluate("window.hopFrames=[];window.hopRecording=true;window.hopRead=()=>{const r=document.querySelector('#liquid-nav-root'),i=r.querySelector('.glass-selection'),e=i.querySelector('uni-view'),m=new DOMMatrix(getComputedStyle(i).transform);return{t:performance.now(),x:m.m41,y:m.m42,lift:Number(r.style.getPropertyValue('--glass-press')),sx:Number(i.style.getPropertyValue('--glass-stretch')),sy:Number(i.style.getPropertyValue('--glass-squeeze')),clear:r.classList.contains('is-material-clear'),filter:getComputedStyle(e).backdropFilter,tint:Number(getComputedStyle(e,'::before').opacity)}};window.recordHop=()=>{window.hopFrames.push(window.hopRead());if(window.hopRecording)requestAnimationFrame(window.recordHop)};requestAnimationFrame(window.recordHop)");
    await touch('touchStart',x(1),y);await touch('touchEnd');await sleep(170);await shot('mid-flight');
    await sleep(330);await shot('landing-squash');
    await sleep(420);await evaluate('window.hopRecording=false');
    const frames=await evaluate('window.hopFrames'), end=await state();
    await evaluate('window.lightRecording=false');
    const lightFrames=await evaluate('window.lightFrames');
    assert.ok(lightFrames.every(f=>Math.abs(f.light-f.selector)<1),'light follows selector throughout a centered tap hop');
    assert.ok(Math.max(...lightFrames.map(f=>f.light))-Math.min(...lightFrames.map(f=>f.light))>tab*.9,'light actually travels across the bar');
    assert.ok(Math.abs(end.x-tab)<.1);assert.equal(end.sy,1);assert.equal(end.lift,0);
    assert.ok(frames.some(f=>f.sy>1.28),'tap has visible inflation');
    assert.ok(frames.some(f=>f.y < -8),'the configured 9px peak rises well above the held 2px lift');
    assert.ok(Math.abs(frames.at(-1).y)<.1,'the capsule lands at its original height');
    const travelling=frames.filter(f=>f.x>.001&&f.x<end.x-.001);
    assert.ok(travelling.length>0);
    assert.ok(travelling.every(f=>f.tint>=0&&f.tint<=1),'tint remains bounded');
    assert.ok(travelling.some(f=>f.tint>0&&f.tint<1),'tint restores gradually during motion');
    assert.ok(travelling.some(f=>f.tint===0&&f.filter.includes('url(')),'middle of hop stays clear with its own lens');
    const landed=await material();assert.equal(landed.clear,false);assert.equal(landed.filter,'brightness(0.94) brightness(1)');
    const arrival=frames.findIndex(f=>f.x>=end.x);
    assert.ok(arrival>0&&arrival<frames.length-1);
    assert.ok(frames[arrival].x>frames[arrival-1].x+.001&&frames[arrival+1].x>frames[arrival].x+.001,
      'hop preserves incoming travel through the target instead of stopping then moving again');
    assert.ok(Math.max(...frames.map(f=>f.x))>end.x+tab*.059,'hop overshoots with incoming inertia');
    assert.ok(frames.slice(arrival).some(f=>f.sx>1.11&&f.sy<.86),'compression blends into the single inertial movement');
    assert.equal(frames.at(-1).sx,1,'landing rebound returns to the full resting width');
    const maxIndex=frames.reduce((best,f,i)=>f.lift>frames[best].lift?i:best,0);
    for(let i=maxIndex+1;i<frames.length;i++)assert.ok(frames[i].lift<=frames[i-1].lift+.03,'single shrinking phase, no second pulse');
    assert.equal(await idle(),0);
    checks.push('long press expands beyond bar height; tap passes the target continuously, widens and flattens, then recovers without idle writes');

    await click('[data-nav-index="2"]');await sleep(95);
    // Sample and retarget in one browser task. Separate CDP round trips can
    // include animation frames, which are not a discontinuity at retargeting.
    const reversal=await evaluate("(()=>{const read=()=>{const i=document.querySelector('#liquid-nav-root .glass-selection'),m=new DOMMatrix(getComputedStyle(i).transform);return{x:m.m41,y:m.m42,sy:Number(i.style.getPropertyValue('--glass-squeeze'))}};const before=read();document.querySelector('[data-nav-index=\"0\"]').click();return{before,after:read()}})()");
    assert.ok(Math.abs(reversal.before.x-reversal.after.x)<.01&&Math.abs(reversal.before.y-reversal.after.y)<.01&&Math.abs(reversal.before.sy-reversal.after.sy)<.0001,'reversal starts from the exact visible state: '+JSON.stringify(reversal));
    await sleep(980);assert.ok((await state()).x<.1);assert.equal((await state()).sy,1);
    await touch('touchStart',x(0),y);await sleep(200);
    for(let i=1;i<=5;i++){await touch('touchMove',x(0)+tab*i/5,y);await sleep(20);await assertLightAt(x(0)+tab*i/5,y)}
    await touch('touchCancel');await sleep(980);
    assert.ok((await state()).x<.1);assert.equal((await state()).sy,1);
    await touch('touchStart',x(2),y);await sleep(420);assert.ok((await state()).sy>1.35);
    await touch('touchEnd');await sleep(240);
    await waitFor("Boolean(document.querySelector('.settings-page'))");
    assert.equal((await state()).sy,1);
    checks.push('rapid retargeting preserves position/size, drag cancel returns to active tab, holding another tab and releasing navigates correctly');
    await click('[data-settings-entry="appearance"]');
    await click('[data-nav-motion="flow"]');await sleep(200);
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').classList.contains('is-hop')"),false);
    assert.equal(await evaluate("document.querySelectorAll('#liquid-nav-root filter').length"),2);
    await click('.settings-back');await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
    const flowInit=await lightState();assert.ok(Math.abs(flowInit.x-flowInit.selectorX)<1,'flow initializes light at current selector');
    await touch('touchStart',x(2),y);await sleep(350);assertClear(await material());
    await assertLightAt(x(2),y);
    await touch('touchCancel');await sleep(1100);
    assert.equal((await material()).clear,false);
    // Flow must regain its resting face while the pressure/shape tail is still
    // running, not hundreds of milliseconds after visual arrival.
    const sampleFlow=destination=>evaluate(`new Promise(resolve=>{
      const root=document.querySelector('#liquid-nav-root'), samples=[];
      if(root.dataset.navIdle==='true')document.querySelector('.glass-wake').click();
      const start=performance.now();
      document.querySelector('[data-nav-index="${destination}"]').click();
      function frame(){
        const i=root.querySelector('.glass-selection'), face=i.querySelector('uni-view');
        const r=face.getBoundingClientRect(),base=i.getBoundingClientRect();
        samples.push({t:performance.now()-start,x:new DOMMatrix(getComputedStyle(i).transform).m41,sx:Number(i.style.getPropertyValue('--glass-stretch')),sy:Number(i.style.getPropertyValue('--glass-squeeze')),shift:parseFloat(i.style.getPropertyValue('--glass-flow-impact-x'))||0,left:r.left-base.left,right:r.right-base.right,clear:root.classList.contains('is-material-clear'),pressure:Number(root.style.getPropertyValue('--glass-press')),filter:getComputedStyle(face).backdropFilter});
        if(performance.now()-start<1100)requestAnimationFrame(frame);else resolve(samples);
      }
      requestAnimationFrame(frame);
    })`);
    const flowWallRun=sampleFlow(0);
    await sleep(420);
    await shot('flow-wall-left');
    const flowFrames=await flowWallRun;
    const flowArrival=flowFrames.findIndex(f=>Math.abs(f.x)<=.5);
    assert.ok(flowArrival>=0);
    assert.equal(flowFrames[flowArrival].clear,false);
    assert.match(flowFrames[flowArrival].filter,/^brightness\(0\.94\) url\(/,'tint is restored while optical depth follows the remaining pressure');
    assert.equal(flowFrames.at(-1).filter,'brightness(0.94) brightness(1)','selector optics stop when the physical tail finishes');
    assert.ok(flowFrames[flowArrival].pressure>.1,'tint no longer waits for pressure to decay');
    const flowLanding=flowArrival;
    assert.ok(flowLanding>=0);
    assert.ok(flowFrames[flowLanding].sx<1&&flowFrames[flowLanding].sy>1.02,'impact is already under way on the visual arrival frame');
    const wallFrames=flowFrames.slice(flowLanding+1);
    assert.ok(wallFrames.some(f=>f.sx<.89&&f.sy>1.14),'wall impact narrows horizontally and grows vertically');
    assert.ok(wallFrames.every(f=>Math.abs(f.left)<.1),'left collision keeps the wall-facing edge pinned');
    const impactStart=flowFrames.findIndex(f=>f.sy>1.005);
    assert.ok(impactStart>0&&impactStart<flowArrival,'wall impact grows while the capsule is still approaching');
    assert.equal(flowFrames.at(-1).sx,1);assert.equal(flowFrames.at(-1).sy,1);
    assert.equal(await idle(),0,'flow landing stops writing frames when complete');
    checks.push('flow wall retains incoming travel and blends its rendered shape into impact before arrival');
    checks.push('wall elongation begins before parking; lighter amplitudes recover in 125ms');
    const rightBrakeRun=sampleFlow(1);
    await sleep(330);
    await shot('flow-brake-right');
    const flowBrakeRight=await rightBrakeRun;
    const assertBrakeOnset=(samples,direction)=>{
      const crossing=samples.findIndex(f=>direction*(f.x-tab)>=0);
      assert.ok(crossing>0&&crossing<samples.length-1,'the capsule actually passes the target');
      assert.ok((samples[crossing].x-samples[crossing-1].x)*direction>.01,'incoming movement continues through the target');
      assert.ok((samples[crossing+1].x-samples[crossing].x)*direction>.01,'no stopped frame followed by a deliberate second move');
      const peak=Math.max(...samples.map(f=>direction*(f.x-tab)));
      assert.ok(peak>tab*.055&&peak<tab*.065,'inertial overshoot stays within its 6% bound');
      assert.ok(samples.every(f=>f.shift===0),'the glass face has no independent lateral translation');
      assert.ok(Math.abs(samples.at(-1).x-tab)<.1,'the physical capsule returns exactly to its tab');
    };
    assertBrakeOnset(flowBrakeRight,1);
    assert.ok(flowBrakeRight.some(f=>f.x-tab>tab*.055&&f.sx>1.034),'rightward overshoot and deformation happen together');
    const rightWall=await sampleFlow(tabCount-1);
    assert.ok(rightWall.some(f=>f.sx<.89&&f.sy>1.14&&Math.abs(f.right)<.1),'right collision pins the right wall-facing edge: '+JSON.stringify({maxHeight:Math.max(...rightWall.map(f=>f.sy)),samples:rightWall.filter(f=>f.sy>1.1).slice(0,6)}));
    const leftBrakeRun=sampleFlow(1);
    await sleep(330);
    await shot('flow-brake-left');
    const flowBrakeLeft=await leftBrakeRun;
    assertBrakeOnset(flowBrakeLeft,-1);
    assert.ok(flowBrakeLeft.some(f=>tab-f.x>tab*.055&&f.sx>1.034),'leftward overshoot and deformation happen together');
    assert.equal(flowBrakeLeft.at(-1).shift,0);assert.equal(flowBrakeLeft.at(-1).sx,1);assert.equal(flowBrakeLeft.at(-1).sy,1);
    assert.equal(await idle(),0,'directional braking stops at rest');
    checks.push('flow pins both wall edges while growing vertically; middle-tab braking follows incoming direction and recovers without idle writes');
    checks.push('both braking directions retain incoming velocity, pass the target without parking first and recover with no independent face translation');
    fs.writeFileSync(path.join(out,'flow-impact-report.json'),JSON.stringify({checks,errors,flowFrames,rightWall,flowBrakeRight,flowBrakeLeft},null,2));
    if(process.argv.includes('--flow-impact-only')) {
      assert.deepEqual(errors,[]);
      console.log(JSON.stringify({checks,errors,out},null,2));
      await send('Browser.close',{},false);
      return;
    }
    await click('[data-nav-index="2"]');await sleep(600);
    checks.push('hop and flow holds: no grey tint/dimming; independent rim lens and soft highlights; tint restores gradually before arrival; resting brightness .94 and selector lens off');
    await click('[data-settings-entry="appearance"]');await waitFor("document.querySelector('.settings-page')?.dataset.routePhase==='open'");
    assert.equal(await evaluate("Boolean(document.querySelector('.hop-height-slider'))"),false,'flow hides the hop-only height control');
    await click('[data-nav-motion="hop"]');await sleep(100);
    assert.equal(await evaluate("document.querySelector('.hop-height-slider').getAttribute('aria-valuenow')"),'9','switching modes retains the chosen peak');
    await click('.settings-back');await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
    await touch('touchStart',x(0),y);await sleep(430);await assertLightAt(x(0),y);
    await touch('touchCancel');await sleep(980);
    const hopReset=await lightState();assert.ok(Math.abs(hopReset.x-hopReset.selectorX)<1,'cancel resets light with selector after flow-to-hop switch');
    assert.equal(await idle(),0,'light adds no idle animation loop');
    checks.push('light travels with hop, follows drag, resets on cancel and does not inherit stale flow position');
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await click('[data-nav-index="0"]');await sleep(80);
    assert.equal((await state()).sy,1);assert.equal((await state()).x,0);
    await send('Emulation.setEmulatedMedia',{features:[]});
    await evaluate('window.beforeHopReload=true');
    await send('Page.reload');await waitFor("!window.beforeHopReload && Boolean(document.querySelector('#liquid-nav-root.is-hop[data-glass-renderer] filter'))");
    assert.equal(await evaluate("document.querySelectorAll('#liquid-nav-root filter').length"),2);
    await click('[data-nav-index="2"]');await sleep(380);
    await click('[data-settings-entry="appearance"]');await waitFor("document.querySelector('.settings-page')?.dataset.routePhase==='open'");
    assert.equal(await evaluate("document.querySelector('.hop-height-slider').getAttribute('aria-valuenow')"),'9','the saved peak survives reload');
    await click('.settings-back');await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
    for(const width of [320,390,768]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await sleep(150);
      const r=await evaluate("(()=>{const bar=document.querySelector('#liquid-nav-root .glass-bar'),r=bar.getBoundingClientRect(),n=bar.querySelectorAll('[data-nav-index]').length;return{x:r.x+4+(r.width-8)*(n-.5)/n,y:r.y+r.height/2}})()");
      await touch('touchStart',r.x,r.y);await sleep(420);
      await assertLightAt(r.x,r.y);
      const b=await evaluate("(()=>{const r=document.querySelector('#liquid-nav-root .glass-selection > uni-view').getBoundingClientRect();return{left:r.left,right:r.right}})()");
      assert.ok(b.left>=0 && b.right<=width,'enlarged selector is inside viewport');
      await shot('held-right-'+width);
      await touch('touchCancel');await sleep(950);
    }
    checks.push('original mode retained, 2–9px hop peak persists, switching cleans up lens/listeners, reduced motion suppresses inflation, chosen mode survives reload');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,errors,held,frames,flowFrames,flowBrakeRight,flowBrakeLeft},null,2));
    console.log(JSON.stringify({checks,errors,out},null,2));await send('Browser.close',{},false);
  } finally {socket?.close();child.kill();server.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
