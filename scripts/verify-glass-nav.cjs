// Built-in Node/CDP smoke test; no extra browser package is required.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const dist = path.resolve('dist/build/h5');
const out = path.resolve('.artifacts/glass-nav-clear');
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


    const root = '#liquid-nav-root';
    const visible = () => evaluate("getComputedStyle(document.querySelector('.glass-bar')).visibility==='visible'&&getComputedStyle(document.querySelector('.glass-bar')).opacity==='1'");
    const click = async selector => {
      if(selector.includes('data-nav-index')) await evaluate("if(document.querySelector('#liquid-nav-root').dataset.navIdle==='true') document.querySelector('.glass-wake').click()");
      return evaluate('document.querySelector('+JSON.stringify(selector)+').click()');
    };
    const shot = async (name, clip) => {
      const result = await send('Page.captureScreenshot',{format:'png',...(clip?{clip:{...clip,scale:1}}:{})});
      const buffer=Buffer.from(result.data,'base64');
      fs.writeFileSync(path.join(out,name+'.png'),buffer); return buffer;
    };
    // Compare decoded pixels, not PNG byte encodings. Keep assertions scalar:
    // Node's pretty-diff of two large image buffers can itself exhaust memory.
    const pixelDifference = (a,b) => evaluate(`(async()=>{
      const read=async src=>{const image=new Image();image.src=src;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,c.width,c.height).data};
      const a=await read('data:image/png;base64,${a.toString('base64')}'),b=await read('data:image/png;base64,${b.toString('base64')}');
      let sum=0,changed=0;for(let i=0;i<a.length;i+=4){let max=0;for(let k=0;k<3;k++){const d=Math.abs(a[i+k]-b[i+k]);sum+=d;max=Math.max(max,d)}if(max>8)changed++}
      return {mean:sum/(a.length/4*3),changedFraction:changed/(a.length/4)};
    })()`);
    const box = selector => evaluate('(()=>{const r=document.querySelector('+JSON.stringify(selector)+').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()');
    const xPosition = () => evaluate("new DOMMatrix(getComputedStyle(document.querySelector('.glass-selection')).transform).m41");
    const touch = (type,x,y) => send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1}]});
    const idleWrites = () => evaluate("new Promise(resolve=>{let n=0;const o=new MutationObserver(r=>n+=r.length);o.observe(document.querySelector('#liquid-nav-root'),{subtree:true,attributes:true});setTimeout(()=>{o.disconnect();resolve(n)},180)})");
    await waitFor("Boolean(document.querySelector('#liquid-nav-root[data-glass-renderer]'))");
    assert.equal(await evaluate("document.querySelectorAll('.glass-bar .nav-item').length"),3);
    await waitFor("getComputedStyle(document.querySelector('.glass-bar')).visibility==='visible'&&getComputedStyle(document.querySelector('.glass-bar')).opacity==='1'");
    await sleep(1500);assert.equal(await visible(),true,'default fixed navigation stays visible');
    await click('[data-nav-index="2"]');await waitFor("Boolean(document.querySelector('[data-settings-entry=\"appearance\"]'))");
    await click('[data-settings-entry="appearance"]');await waitFor("Boolean(document.querySelector('[data-nav-visibility=\"auto\"]'))");
    await click('[data-nav-visibility="auto"]');await click('.settings-back');
    await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");await click('[data-nav-index="0"]');
    await sleep(1800);
    assert.equal(await visible(),false,'navigation hides after idle');
    assert.equal(await evaluate("document.querySelector('.glass-bar').getAttribute('aria-hidden')"),'true');
    assert.equal((await box('.glass-bar')).height,56);
    assert.equal(await evaluate("document.querySelector('.glass-bar').inert"),true);
    assert.equal(await evaluate("document.querySelectorAll('.glass-wake').length"),1,'wake affordance remains available');
    assert.equal(await evaluate("document.querySelector('.nav-item.active').getAttribute('data-nav-index')"),'0');
    assert.equal(await idleWrites(),0,'idle navigation does no frame writes');
    await click('.glass-wake');await sleep(250);
    const renderer=await evaluate("document.querySelector('#liquid-nav-root').dataset.glassRenderer");
    assert.equal(renderer,'svg-refraction');
    const material=await evaluate("(()=>{const s=getComputedStyle(document.querySelector('.glass-surface')),selection=document.querySelector('.glass-selection > uni-view, .glass-selection > view');return {filter:s.backdropFilter,surface:s.backgroundColor,selectionImage:getComputedStyle(selection).backgroundImage,selection:getComputedStyle(selection,'::before').backgroundColor,foreground:getComputedStyle(document.querySelector('.nav-item')).color}})()");
    assert.match(material.filter,/blur\(0\.2px\)/,'view-layer inline filter uses the clear blur too');
    assert.equal(material.surface,'rgba(250, 250, 252, 0.02)');
    assert.match(material.selectionImage,/linear-gradient/,'selection capsule keeps its translucent gradient surface');
    assert.match(material.selectionImage,/255, 255, 255/,'selection capsule gradient keeps the original white tint');
    assert.equal(material.selection,'rgba(227, 227, 227, 0.024)');
    assert.equal(material.foreground,'rgb(32, 33, 38)');
    checks.push('default 100 material: 0.2px blur, 2% surface veil, original white translucent selection gradient with E3E3E3 tint, graphite foreground');
    const lensImage=await evaluate("document.querySelector('#liquid-nav-root > svg feImage').getAttribute('href')");
    assert.ok(Math.abs(await evaluate("Number(document.querySelector('#liquid-nav-root > svg feDisplacementMap').getAttribute('scale'))")-56*20/36)<.001);
    await shot('resident-course');
    checks.push('three tabs, compact 56px geometry, idle hide and accessible wake, no idle frame loop');

    // This script covers the legacy flow controller. The product default is
    // now hop, so opt into flow before exercising its spring-specific gesture
    // assertions; the dedicated nav-hop script covers the default mode.
    await click('[data-nav-index="2"]');
    await waitFor("Boolean(document.querySelector('[data-settings-entry=\"appearance\"]'))");
    await click('[data-settings-entry="appearance"]');
    await waitFor("Boolean(document.querySelector('[data-nav-motion=\"flow\"]'))");
    await click('[data-nav-motion="flow"]');
    await sleep(120);
    // Detail pages intentionally hide/inert the shared navigation. Return to
    // the settings root before testing physical touches on the legacy mode.
    await click('.settings-back');
    await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
    await click('[data-nav-index="0"]');
    await sleep(450);

    // Retarget an in-flight spring. .click() also covers keyboard activation.
    await click('[data-nav-index="2"]'); await sleep(55);
    const before=await xPosition();
    await click('[data-nav-index="0"]');
    assert.ok(Math.abs((await xPosition())-before)<25,'reversal does not teleport to a tab');
    await sleep(750);
    assert.ok(Math.abs(await xPosition())<.1);
    assert.equal(await idleWrites(),0,'settling stops exactly');
    const nav=await box('.glass-bar'), tab=(nav.width-8)/3, y=nav.y+nav.height/2;
    const cx=i=>nav.x+4+(i+.5)*tab;
    await touch('touchStart',nav.x+4+tab*.8,y);
    await sleep(60);
    await touch('touchMove',nav.x+4+tab*.8+30,y+3); await sleep(40);
    assert.ok(Math.abs((await xPosition())-30)<2,'off-center grab remains exactly under the finger');
    assert.ok(await evaluate("Number(document.querySelector('#liquid-nav-root').style.getPropertyValue('--glass-press'))")>0);
    await shot('pressed-glass');
    await sleep(650);
    assert.equal(await idleWrites(),0,'holding a stationary finger needs no loop');
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root > svg feImage').getAttribute('href')"),lensImage);
    await touch('touchCancel'); await sleep(700);
    assert.ok(Math.abs(await xPosition())<.1);
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').style.getPropertyValue('--glass-press')"),'0.0000');
    // Capture the very first post-release frame from inside the event task.
    await touch('touchStart',nav.x+4+tab*.8,y-8);await sleep(150);
    await touch('touchMove',nav.x+4+tab*.8+20,y-8);await sleep(25);
    await evaluate("window.releaseFrames=new Promise(resolve=>document.addEventListener('pointerup',()=>{const read=()=>({light:new DOMMatrix(getComputedStyle(document.querySelector('.glass-light')).transform).m41,stretch:Number(document.querySelector('.glass-selection').style.getPropertyValue('--glass-stretch'))});const before=read();requestAnimationFrame(()=>resolve({before,after:read()}))},{once:true,capture:true}));void 0");
    await touch('touchEnd');
    const releaseFrames=await evaluate('window.releaseFrames');
    assert.ok(Math.abs(releaseFrames.before.light-releaseFrames.after.light)<8,'light returns continuously from last contact');
    assert.ok(Math.abs(releaseFrames.before.stretch-releaseFrames.after.stretch)<.015,'shape does not snap at release');
    await sleep(850);
    assert.equal(await idleWrites(),0,'release shape/light settle without a permanent loop');
    checks.push('interruptible settling, accurate grab, shared press progress, stationary relaxation and cancellation');

    await touch('touchStart',cx(0),y);
    for(let i=1;i<=6;i++){await sleep(16);await touch('touchMove',cx(0)+tab*i/6,y);}
    await touch('touchEnd');
    await waitFor("Boolean(document.querySelector('.today-page'))");
    // This fresh physical tap must not be swallowed by the drag click guard.
    await touch('touchStart',cx(2),y); await touch('touchEnd');
    await waitFor("Boolean(document.querySelector('.settings-page'))");
    await sleep(700);
    assert.ok(Math.abs((await xPosition())-2*tab)<.1);
    assert.equal(await visible(),true);
    await shot('resident-settings');
    await click('[data-nav-index="1"]'); await sleep(700); await shot('resident-today');
    await click('[data-nav-index="0"]'); await sleep(700);
    // Leaving vertically cancels rather than activating another page.
    await touch('touchStart',cx(1),y);
    await touch('touchMove',cx(1),y-100); await touch('touchEnd');
    await sleep(700);
    assert.equal(await evaluate("Boolean(document.querySelector('.today-page'))"),false);
    assert.ok(Math.abs(await xPosition())<.1);
    checks.push('real three-tab navigation, fast post-drag tap, vertical exit cancellation, continuous release light/shape');

    // Modal activity does not disable idle hiding; wake before keyboard testing.
    await click('.week-select'); await waitFor("Boolean(document.querySelector('.sheet-backdrop'))");
    assert.equal(await visible(),true);
    assert.equal(await evaluate("document.querySelector('.glass-bar').inert"),false);
    await click('.sheet-backdrop .close-button'); await sleep(1500);
    assert.equal(await visible(),false);
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
    await click('.glass-wake');await sleep(250);
    await evaluate("document.querySelector('[data-nav-index=\"1\"]').focus()");
    await sleep(1400);
    assert.equal(await visible(),true);
    await evaluate("document.activeElement.blur()");
    await sleep(1550);
    assert.equal(await visible(),false,'focus exit resumes automatic hiding');
    checks.push('keyboard focus keeps navigation available, focus exit resumes hiding');

    // Only intentional vertical scroll wakes navigation; inertia extends its life.
    const calendar=await box('.calendar-native');
    await touch('touchStart',310,calendar.y+180);
    for(let i=1;i<=6;i++){await sleep(16);await touch('touchMove',310-i*32,calendar.y+180);}
    await touch('touchEnd'); await sleep(500);
    assert.equal(await visible(),false,'horizontal week swipe does not reveal the bar');
    await touch('touchStart',190,calendar.y+350);
    for(let i=1;i<=6;i++){await sleep(20);await touch('touchMove',190,calendar.y+350-i*18);}
    await touch('touchEnd'); await sleep(700);
    assert.equal(await visible(),true,'vertical scrolling keeps the bar visible');
    assert.equal(await idleWrites(),0,'scrolling does not mutate glass optics');
    await sleep(1800);
    assert.equal(await visible(),false,'bar hides after vertical inertia ends');
    await evaluate("document.querySelectorAll('.uni-scroll-view').forEach(e=>{if(e.scrollHeight>e.clientHeight)e.scrollTop=20})");await sleep(200);
    assert.equal(await visible(),false,'programmatic scroll resets do not wake the bar');
    checks.push('vertical-only visibility, inertia and idle hiding, programmatic scroll ignored');

    // Find a real course crossing the nav, independent of the current date.
    await click('.week-select'); await waitFor("document.querySelectorAll('.week-option').length>2");
    await click('.week-option:nth-child(3)'); await sleep(500);
    await click('.glass-wake');await sleep(250);
    let courseClip=null;
    for(let top=0;top<=400&&!courseClip;top+=40){
      await evaluate("document.querySelectorAll('.week-content[data-week=\"3\"] .uni-scroll-view').forEach(e=>{if(e.scrollHeight>e.clientHeight)e.scrollTop="+top+"})");
      await sleep(80);
      courseClip=await evaluate("(()=>{const b=document.querySelector('.glass-bar').getBoundingClientRect();const tile=[...document.querySelectorAll('.week-content[data-week=\"3\"] .course-tile')].find(e=>{const r=e.getBoundingClientRect();return r.left>b.left+35&&r.right<b.right-35&&r.bottom>b.top+20&&r.top<b.bottom-20});if(!tile)return null;window.proofTile=tile;window.proofStyle=tile.getAttribute('style');const r=tile.getBoundingClientRect();return{x:r.x+6,y:Math.max(b.y+6,r.y+6),width:r.width-12,height:Math.min(b.bottom-6,r.bottom-6)-Math.max(b.y+6,r.y+6)}})()");
    }
    assert.ok(courseClip&&courseClip.height>0);
    await shot('course-backdrop');
    // Same course, scroll position and optics: only restore the previous coatings
    // and blur temporarily for an honest before/after visual comparison.
    await evaluate("(()=>{const s=document.createElement('style');s.id='previous-glass-material';s.textContent='.glass-surface { background:rgba(250,250,252,.19) !important; backdrop-filter:'+document.querySelector('.glass-surface').style.backdropFilter.replace('blur(0.2px)','blur(1.94px)')+' !important; } .glass-selection > uni-view,.glass-selection > view { background:linear-gradient(155deg,#ffffff30,#ffffff00 55%) !important; } .glass-selection > uni-view::before,.glass-selection > view::before { background:rgba(52,53,65,.085) !important; }';document.head.appendChild(s)})()");
    await sleep(180); await shot('course-backdrop-before');
    await evaluate("document.querySelector('#previous-glass-material').remove()");
    await sleep(180);
    const normal=await shot('course-through-glass',courseClip);
    await evaluate("window.proofTile.style.background='#128c72'");
    assert.ok(!normal.equals(await shot('course-tint-proof',courseClip)),'real course color affects glass pixels');
    await evaluate("window.proofTile.setAttribute('style',window.proofStyle)");
    await evaluate("(()=>{const e=document.createElement('div');e.id='glass-test-stripes';e.style.cssText='position:absolute;inset:0;background:repeating-linear-gradient(90deg,#f4c463 0 6px,#3479ae 6px 12px);z-index:19;pointer-events:none';document.querySelector('.phone-canvas').appendChild(e)})()");
    await sleep(350);
    const clip=await box('.glass-surface'), refracted=await shot('refraction-proof',clip);
    const baseline=await pixelDifference(refracted,await shot('refraction-stable',clip));
    assert.ok(baseline.mean<.5&&baseline.changedFraction<.02,'static fixture is stable within edge rasterization noise: '+JSON.stringify(baseline));
    await evaluate("window.glassFilter=document.querySelector('.glass-surface').style.backdropFilter;document.querySelector('.glass-surface').style.backdropFilter=window.glassFilter.replace(/\\s*url\\([^)]*\\)/,'')");
    await sleep(150);
    const opticalDifference=await pixelDifference(refracted,await shot('blur-comparison',clip));
    assert.ok(opticalDifference.mean>Math.max(.5,baseline.mean*5),'lens changes substantially more than baseline noise: '+JSON.stringify(opticalDifference));
    await evaluate("document.querySelector('.glass-surface').style.backdropFilter=window.glassFilter;document.querySelector('#glass-test-stripes').remove()");
    checks.push('actual scroll-view backdrop sampled, static SVG displacement versus identical blur-only control');

    for(const width of [320,390,768]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true}); await sleep(300);
      assert.equal(await evaluate('document.documentElement.scrollWidth'),width);
      assert.equal(await evaluate("[...document.querySelectorAll('.glass-bar .nav-item')].every(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44})"),true);
      await shot('layout-'+width);
    }
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'},{name:'prefers-reduced-transparency',value:'reduce'}]});
    await click('[data-nav-index="2"]'); await sleep(100);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.glass-surface')).backdropFilter"),'none');
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').dataset.glassRenderer"),'opaque');
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').style.getPropertyValue('--glass-press')"),'0.0000');
    await shot('accessible-solid');
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-contrast',value:'more'}]}); await sleep(100);
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').dataset.glassRenderer"),'opaque');
    await send('Emulation.setEmulatedMedia',{features:[]}); await sleep(100);
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').dataset.glassRenderer"),'svg-refraction');
    checks.push('320/390/768 layouts, 48px targets, reduced motion/transparency and high contrast');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,errors,renderer,material,baseline,opticalDifference},null,2));
    console.log(JSON.stringify({checks,errors,renderer,out},null,2));
    await send('Browser.close',{},false);
  } finally {
    socket?.close();child.kill();server.close();
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
