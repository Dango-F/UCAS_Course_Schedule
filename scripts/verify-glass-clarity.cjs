// Built-in Node/CDP smoke test; no extra browser package is required.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const dist = path.resolve('dist/build/h5');
const out = path.resolve('.artifacts/glass-live-preview');
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
    const value = () => evaluate("Number(document.querySelector('.clarity-slider').getAttribute('aria-valuenow'))");
    const filter = () => evaluate("getComputedStyle(document.querySelector('#liquid-nav-root .glass-surface')).backdropFilter");
    const previewFilter = () => evaluate("getComputedStyle(document.querySelector('#glass-material-preview .glass-surface')).backdropFilter");
    const materialOnly = value => value.replace(/\s*url\([^)]*\)/,'');
    const shot = async (name,clip) => {
      const {data} = await send('Page.captureScreenshot',{format:'png',...(clip?{clip:{...clip,scale:1}}:{})});
      const buffer=Buffer.from(data,'base64');fs.writeFileSync(path.join(out,name+'.png'),buffer);return buffer;
    };
    const touch = (type,x,y) => send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1}]});
    const key = async (key,code,keyCode) => {
      await evaluate("document.querySelector('.clarity-slider').focus()");
      await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:keyCode});
      await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:keyCode});
      await sleep(120);
    };
    await waitFor("Boolean(document.querySelector('#liquid-nav-root[data-glass-renderer]'))");
    await sleep(100);
    // Tint must not change either the resting or pressed transparency, nor
    // the outer lens. Check effective alpha rather than opacity alone.
    const restingMaterial = await evaluate(`(() => {
      const root=document.querySelector('#liquid-nav-root'), surface=root.querySelector('.glass-surface'), selection=root.querySelector('.glass-selection > uni-view');
      const previous=root.style.getPropertyValue('--glass-material-progress');
      const samples=[0,.5,1].map(pressure=>{
        root.style.setProperty('--glass-material-progress',String(pressure));
        const tint=getComputedStyle(selection,'::before'), glass=getComputedStyle(surface);
        const channels=tint.backgroundColor.match(/[0-9.]+/g).map(Number);
        return {pressure,channels,opacity:Number(tint.opacity),selectionFilter:getComputedStyle(selection).backdropFilter,filter:glass.backdropFilter,surface:glass.backgroundColor};
      });
      if(previous)root.style.setProperty('--glass-material-progress',previous);else root.style.removeProperty('--glass-material-progress');
      return {samples,alpha:Number(getComputedStyle(root).getPropertyValue('--glass-selection-alpha'))};
    })()`);
    for (const sample of restingMaterial.samples) {
      assert.deepEqual(sample.channels.slice(0,3),[227,227,227]);
      assert.ok(Math.abs(sample.channels[3]-restingMaterial.alpha)<.003,'tint retains clarity alpha');
      assert.equal(sample.opacity,1,'whole-face tint remains stable during motion');
      assert.ok(sample.channels[3]*sample.opacity<.03,'no opaque resting fill');
      const brightness=Number(sample.selectionFilter.match(/brightness\(([0-9.]+)\)/)?.[1]);
      assert.ok(Math.abs(brightness-.94)<.0001,'pressure never raises the whole-face exposure');
    }
    assert.ok(restingMaterial.samples.every(sample=>sample.filter===restingMaterial.samples[0].filter && sample.surface===restingMaterial.samples[0].surface),'outer lens and transparency unchanged');
    await shot('resting-grey-navigation');
    checks.push('resting brightness .94, unchanged rest alpha and outer glass; no solid overlay');
    await click('[data-nav-index="2"]');
    await waitFor("Boolean(document.querySelector('[data-settings-entry=\"appearance\"]'))");
    await click('[data-settings-entry="appearance"]');
    await waitFor("Boolean(document.querySelector('.clarity-slider'))");
    await waitFor("Boolean(document.querySelector('#glass-material-preview [data-glass-renderer]'))");
    await sleep(650);
    assert.equal(await value(),100);
    assert.match(await filter(),/blur\(0\.2px\)/);
    assert.equal(materialOnly(await previewFilter()),materialOnly(await filter()));
    assert.equal(await evaluate("(()=>{const ids=[...document.querySelectorAll('filter')].map(e=>e.id);return ids.length===4&&new Set(ids).size===4})()"),true,'real and preview outer/selector filters must have unique ids');
    assert.equal(await evaluate("document.querySelector('.clarity-value').textContent.includes('%')"),false,'clarity is a visual level, not transmission percentage');
    await shot('settings-default');

    if(process.argv.includes('--touch-light-only')){
      const toggle='[data-glass-touch-light-setting]',preview='#glass-material-preview .preview-lens-root',actual='#liquid-nav-root';
      const light=selector=>evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}),l=r.querySelector('.glass-touch-light'),c=l.querySelector('canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let mass=0;for(let i=3;i<d.length;i+=4)mass+=d[i];return{alpha:Number(getComputedStyle(l).opacity),mass,press:Number(r.style.getPropertyValue('--glass-press')),filter:getComputedStyle(r.querySelector('.glass-surface')).backdropFilter,transform:r.querySelector('.glass-selection').style.transform}})()`);
      const hold=async selector=>{
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'})`);await sleep(150);
        const p=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector+' [data-nav-index="0"]')}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`);
        await touch('touchStart',p.x,p.y);await sleep(900);return light(selector);
      };
      const off=async()=>{await click(toggle);await waitFor(`document.querySelector('${toggle}').getAttribute('aria-checked')==='false'`);await sleep(100)};
      assert.equal(await evaluate(`document.querySelector('${toggle}').getAttribute('aria-checked')`),'true','light defaults on');
      const enabled=await hold(preview);assert.ok(enabled.alpha>.5&&enabled.mass>0,'preview actually renders the light while enabled');
      await off();const interrupted=await light(preview);
      assert.equal(interrupted.alpha,0,'switching off interrupts an active reflection immediately');assert.equal(interrupted.mass,0,'switching off clears the canvas');
      assert.ok(interrupted.press>.9,'switching off light preserves the held navigation shape');
      await touch('touchCancel');await sleep(500);
      const disabled=await hold(preview);assert.equal(disabled.alpha,0);assert.equal(disabled.mass,0);assert.ok(disabled.press>.9,'press animation still works without ribbon');
      await touch('touchCancel');
      await evaluate(`document.querySelector('${toggle}').scrollIntoView({block:'center'})`);await sleep(150);await shot('touch-light-off');
      await send('Page.reload');await waitFor("Boolean(document.querySelector('#liquid-nav-root .glass-touch-light[data-active]'))");await sleep(400);
      const restoredOff=await hold(actual);assert.equal(restoredOff.alpha,0,'main navigation restores off after reload');assert.equal(restoredOff.mass,0);assert.ok(restoredOff.press>.9);
      await touch('touchCancel');await sleep(500);
      await click(actual+' [data-nav-index="2"]');await waitFor("Boolean(document.querySelector('[data-settings-entry=\"appearance\"]'))");
      await click('[data-settings-entry="appearance"]');await waitFor(`Boolean(document.querySelector('${toggle}'))`);await sleep(650);
      assert.equal(await evaluate(`document.querySelector('${toggle}').getAttribute('aria-checked')`),'false','setting and preview restore off together');
      await evaluate(`document.querySelector('${toggle}').dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true}))`);
      await waitFor(`document.querySelector('${toggle}').getAttribute('aria-checked')==='true'`);await sleep(100);
      const restoredOn=await hold(preview);assert.ok(restoredOn.alpha>.5&&restoredOn.mass>0,'keyboard re-enable restores actual preview pixels');
      await touch('touchCancel');await sleep(500);
      await click('.settings-back');await waitFor("document.querySelector('.settings-page').dataset.settingsSection==='home'");await sleep(400);
      await click(actual+' [data-nav-index="0"]');await sleep(600);
      const mainOn=await hold(actual);assert.ok(mainOn.alpha>.5&&mainOn.mass>0,'main navigation shares the enabled setting');
      await touch('touchCancel');assert.deepEqual(errors,[]);
      const report={enabled,interrupted,disabled,restoredOff,restoredOn,mainOn,errors};
      fs.writeFileSync(path.join(out,'touch-light-setting-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
      await send('Browser.close',{},false);return;
    }

    // Observe the real platform slider while the finger is still down.
    await evaluate("window.clarityWrites=0;window.mapWrites=0;window.originalStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.includes('glass-clarity'))window.clarityWrites++;return window.originalStorageSet.call(this,k,v)};window.mapObserver=new MutationObserver(r=>window.mapWrites+=r.length);window.mapObserver.observe(document.querySelector('#liquid-nav-root > svg feImage'),{attributes:true});window.clarityMap=document.querySelector('#liquid-nav-root > svg feImage').getAttribute('href')");
    const drag=await evaluate("(()=>{const s=document.querySelector('.clarity-slider').getBoundingClientRect(),h=document.querySelector('.clarity-slider .uni-slider-handle').getBoundingClientRect();return{x:h.x+h.width/2,y:h.y+h.height/2,end:s.x+s.width*.25}})()");
    await touch('touchStart',drag.x,drag.y);
    for(let i=1;i<=8;i++){await sleep(25);await touch('touchMove',drag.x+(drag.end-drag.x)*i/8,drag.y)}
    await sleep(140);
    assert.ok(Math.abs(await value()-25)<=1,'real touch updates value before release');
    assert.ok(!/blur\(0\.2px\)/.test(await filter()),'material follows changing event');
    assert.equal(await evaluate('window.clarityWrites'),0,'no synchronous preference saves during dragging');
    assert.equal(await evaluate('window.mapWrites'),0,'no displacement map regeneration during dragging');
    await touch('touchEnd'); await sleep(180);
    assert.equal(await evaluate('window.clarityWrites'),1,'one save on release');
    assert.equal(materialOnly(await previewFilter()),materialOnly(await filter()),'sample and actual navigation track the same clarity');
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root > svg feImage').getAttribute('href')===window.clarityMap"),true);
    await shot('settings-dragged');
    checks.push('real finger drag previews before release, saves once after release, does not regenerate the displacement map');

    const compareButton=await evaluate("(()=>{const r=document.querySelector('.glass-compare').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
    const stage=await evaluate("(()=>{const r=document.querySelector('.preview-stage').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()");
    const currentPixels=await shot('sample-current',stage), actualFilter=await filter();
    const savedValue=await value();
    await touch('touchStart',compareButton.x,compareButton.y);await sleep(160);
    assert.equal(await evaluate("document.querySelector('#glass-material-preview').dataset.comparing"),'true');
    assert.match(await previewFilter(),/blur\(0\.2px\)/);
    assert.equal(await filter(),actualFilter,'comparison must not change the real navigation');
    assert.equal(await value(),savedValue,'comparison must not change the chosen preference');
    assert.equal(await evaluate('window.clarityWrites'),1,'comparison must not persist default');
    assert.ok(!currentPixels.equals(await shot('sample-default-comparison',stage)),'static sample backdrop visibly changes, excluding captions and controls');
    await touch('touchEnd');await sleep(100);
    assert.equal(materialOnly(await previewFilter()),materialOnly(actualFilter));
    await touch('touchStart',compareButton.x,compareButton.y);await touch('touchCancel');await sleep(100);
    assert.equal(await evaluate("document.querySelector('#glass-material-preview').dataset.comparing"),'false');
    await evaluate("document.querySelector('.glass-compare').focus()");
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});
    assert.match(await previewFilter(),/blur\(0\.2px\)/);
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});
    assert.equal(materialOnly(await previewFilter()),materialOnly(actualFilter));
    checks.push('live sample uses identical material, unique SVG ids, visible optical difference; held comparison restores on release/cancel/keyboard without saving or changing real nav');

    await key('Home','Home',36);
    assert.equal(await value(),0);assert.match(await filter(),/blur\(2\.4px\)/);
    await shot('settings-frosted');
    await send('Page.reload');
    await waitFor("Boolean(document.querySelector('.week-select'))");
    await waitFor("Boolean(document.querySelector('#liquid-nav-root[data-glass-renderer]'))");
    assert.match(await filter(),/blur\(2\.4px\)/,'zero restores on cold page load');
    await click('[data-nav-index="2"]');await waitFor("Boolean(document.querySelector('[data-settings-entry=\"appearance\"]'))");
    await click('[data-settings-entry="appearance"]');await waitFor("Boolean(document.querySelector('.clarity-slider'))");
    assert.equal(await value(),0);
    await key('End','End',35);
    assert.equal(await value(),100);assert.match(await filter(),/blur\(0\.2px\)/);
    await key('ArrowLeft','ArrowLeft',37);assert.equal(await value(),99);
    await key('PageDown','PageDown',34);assert.equal(await value(),89);
    await click('.clarity-reset');await sleep(120);
    assert.equal(await value(),100);assert.match(await filter(),/blur\(0\.2px\)/);
    checks.push('keyboard endpoints/steps, zero-value persistence across reload, restore default');

    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
    await sleep(100);await key('End','End',35);
    assert.equal(await value(),100);assert.equal(await filter(),'none');
    assert.equal(await previewFilter(),'none');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.preview-accessibility')).display"),'block');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#liquid-nav-root .glass-surface')).backgroundColor"),'rgb(248, 249, 252)');
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-contrast',value:'more'}]});
    await sleep(100);assert.equal(await filter(),'none');
    await send('Emulation.setEmulatedMedia',{features:[]});await sleep(120);
    assert.match(await filter(),/blur\(0\.2px\)/);
    await click('.clarity-reset');await sleep(120);
    checks.push('system reduced transparency and high contrast override the slider, user value resumes afterwards');

    for(const width of [320,374,375,390,768]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await sleep(250);
      const dimensions=await evaluate("(()=>{const read=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,width:r.width,height:r.height}};return {real:read('#liquid-nav-root .glass-bar'),preview:read('#glass-material-preview .glass-bar'),realSelection:read('#liquid-nav-root .glass-selection'),previewSelection:read('#glass-material-preview .glass-selection')}})()");
      assert.equal(dimensions.real.width,dimensions.preview.width,'real bar matches preview width');
      assert.equal(dimensions.real.height,dimensions.preview.height,'real bar matches preview height');
      assert.equal(dimensions.realSelection.width,dimensions.previewSelection.width,'resting selector width matches preview');
      assert.equal(dimensions.realSelection.height,dimensions.previewSelection.height,'resting selector height matches preview');
      assert.ok(Math.abs(dimensions.real.x*2+dimensions.real.width-width)<1,'real bar remains centered');
      assert.equal(await evaluate('document.documentElement.scrollWidth'),width);
      assert.ok(await evaluate("document.querySelector('.clarity-slider').getBoundingClientRect().height")>=44);
      assert.equal(await evaluate("getComputedStyle(document.querySelector('#liquid-nav-root .nav-item')).color"),'rgb(32, 33, 38)');
      await shot('settings-'+width);
    }
    await evaluate("document.activeElement?.blur()");
    const idle=await evaluate("new Promise(resolve=>{let n=0;const o=new MutationObserver(r=>n+=r.length);o.observe(document.querySelector('#liquid-nav-root'),{attributes:true,subtree:true});setTimeout(()=>{o.disconnect();resolve(n)},220)})");
    assert.equal(idle,0,'no permanent material update loop');
    const previewIdle=await evaluate("new Promise(resolve=>{let n=0;const o=new MutationObserver(r=>n+=r.length);o.observe(document.querySelector('#glass-material-preview'),{attributes:true,subtree:true});setTimeout(()=>{o.disconnect();resolve(n)},220)})");
    assert.equal(previewIdle,0,'static preview has no frame update loop');
    await click('.settings-back');await waitFor("document.querySelector('#glass-material-preview')===null");
    assert.equal(await evaluate("document.querySelector('#glass-material-preview')===null"),true);
    assert.equal(await evaluate("document.querySelectorAll('filter').length"),2,'preview SVG removed, leaving only outer and selector filters');
    await click('[data-settings-entry="appearance"]');
    await waitFor("Boolean(document.querySelector('#glass-material-preview [data-glass-renderer]'))");
    assert.equal(materialOnly(await previewFilter()),materialOnly(await filter()),'preview remounts with current preference');
    checks.push('preview respects system solid mode, stays idle, removes SVG on exit, remounts cleanly');
    checks.push('320/374/375/390/768 widths: real bar and resting selector match preview dimensions, centered; 44px slider hit area, unchanged contrast, no idle writes');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,errors},null,2));
    console.log(JSON.stringify({checks,errors,out},null,2));
    await send('Browser.close',{},false);
  } finally { socket?.close();child.kill();server.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
