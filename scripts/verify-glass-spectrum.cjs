// Built-in Node/CDP smoke test; no extra browser package is required.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const dist = path.resolve('dist/build/h5');
const out = path.resolve('.artifacts/glass-spectrum');
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




    const optics=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('src/components/glass-spectrum.js','utf8')).toString('base64'));
    const maps=(depth,disperse)=>optics.SPECTRAL_SAMPLES.map(sample=>Array.from(optics.createOpticalMap(300,56,12,8,depth,disperse?sample.offset:0,true)));
    const graph=optics.spectralFilterPrimitives();
    const results=await evaluate('('+ (async function(graph,mapSets) {
      const encode=p=>{
        const c=document.createElement('canvas');c.width=300;c.height=56;
        const ctx=c.getContext('2d'),d=ctx.createImageData(300,56);d.data.set(p);ctx.putImageData(d,0,0);
        return c.toDataURL();
      };
      async function render(maps,source,filter=true) {
        const parsed=new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="56"><defs><filter id="f" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" width="300" height="56" color-interpolation-filters="sRGB">'+graph+'</filter></defs><g'+(filter?' filter="url(#f)"':'')+'>'+source+'</g></svg>','image/svg+xml');
        parsed.querySelectorAll('feImage').forEach((e,i)=>{e.setAttribute('width','300');e.setAttribute('height','56');e.setAttribute('href',encode(maps[i]))});
        parsed.querySelectorAll('feDisplacementMap').forEach(e=>e.setAttribute('scale','32'));
        const img=new Image();img.src='data:image/svg+xml;base64,'+btoa(new XMLSerializer().serializeToString(parsed));await img.decode();
        const c=document.createElement('canvas');c.width=300;c.height=56;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
        return {pixels:Array.from(ctx.getImageData(0,0,300,56).data),image:c.toDataURL()};
      }
      const solid=[];
      for(const alpha of [1,.5,.2]) {
        const source='<rect width="300" height="56" fill="rgb(70,130,210)" opacity="'+alpha+'"/>';
        const a=await render(mapSets[0],source),b=await render(mapSets[0],source,false),i=(28*300+150)*4;
        solid.push({alpha,actual:a.pixels.slice(i,i+4),expected:b.pixels.slice(i,i+4)});
      }
      let source='<rect width="300" height="56" fill="white"/>';
      for(let x=0;x<300;x+=6) source+='<rect x="'+x+'" width="3" height="56" fill="black"/>';
      const full=await render(mapSets[0],source),plain=await render(mapSets[1],source),noDepth=await render(mapSets[2],source);
      const difference=(a,b)=>{let sum=0,n=0;for(let y=1;y<11;y++)for(let x=35;x<265;x++)for(let k=0;k<3;k++){sum+=Math.abs(a.pixels[(y*300+x)*4+k]-b.pixels[(y*300+x)*4+k]);n++}return sum/n};
      let chroma=0;for(let y=1;y<11;y++)for(let x=35;x<265;x++){const i=(y*300+x)*4;chroma+=Math.max(...full.pixels.slice(i,i+3))-Math.min(...full.pixels.slice(i,i+3))}
      return {solid,dispersionDifference:difference(full,plain),depthDifference:difference(full,noDepth),chroma:chroma/(230*10),images:{full:full.image,noDispersion:plain.image,noDepth:noDepth.image}};
    }).toString()+')('+JSON.stringify(graph)+','+JSON.stringify([maps(true,true),maps(true,false),maps(false,true)])+')');
    console.log(JSON.stringify({...results,images:undefined},null,2));
    // Canvas unpremultiplies 8-bit pixels: one premultiplied level becomes five
    // RGB levels at alpha .2. Compare in the compositing domain, not inflated RGB.
    for(const result of results.solid) result.actual.forEach((v,i)=>assert.ok(Math.abs(v-result.expected[i])*(i===3?1:result.alpha)<=1.1,'preserve solid premultiplied RGBA: '+JSON.stringify(result)));
    assert.ok(results.dispersionDifference>2,'dispersion changes sampled colors');
    assert.ok(results.depthDifference>2,'depth changes actual sampling direction');
    assert.ok(results.chroma>3,'gray background develops spectral separation');
    for(const [name,data] of Object.entries(results.images)) fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data.split(',')[1],'base64'));
    delete results.images;

    await waitFor("document.querySelector('#liquid-nav-root')?.dataset.glassRenderer==='svg-refraction'");
    assert.equal(await evaluate("document.querySelectorAll('#liquid-nav-root feDisplacementMap').length"),14);
    await sleep(1500);
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').dataset.navIdle"),'false','default fixed navigation stays visible');
    await evaluate("document.querySelector('#liquid-nav-root [data-nav-index=\"2\"]').click()");
    await waitFor("Boolean(document.querySelector('[data-settings-entry=\"appearance\"]'))");
    await evaluate("document.querySelector('[data-settings-entry=\"appearance\"]').click()");
    await waitFor("Boolean(document.querySelector('[data-nav-visibility=\"auto\"]'))");
    assert.equal(await evaluate("document.querySelector('[data-nav-visibility=\"fixed\"]').getAttribute('aria-pressed')"),'true');
    await evaluate("document.querySelector('[data-nav-visibility=\"auto\"]').click()");
    await evaluate("window.__spectrumBeforeReload=true");
    await send('Page.reload');
    await waitFor("!window.__spectrumBeforeReload && document.querySelector('#liquid-nav-root[data-glass-renderer]')?.dataset.navIdle !== undefined");
    await sleep(1450);
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').dataset.navIdle"),'true');
    // A horizontal gesture must not wake the bar.
    await evaluate("(()=>{const c=document.querySelector('.phone-canvas');c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,isPrimary:true,pointerId:1,clientX:180,clientY:300}));document.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:80,clientY:304}));document.dispatchEvent(new PointerEvent('pointerup',{pointerId:1}))})()");
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').dataset.navIdle"),'true');
    await evaluate("(()=>{const c=document.querySelector('.phone-canvas');c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,isPrimary:true,pointerId:1,clientX:180,clientY:300}));document.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:181,clientY:240}))})()");
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').dataset.navIdle"),'false');
    await evaluate("document.dispatchEvent(new PointerEvent('pointerup',{pointerId:1}))");
    await sleep(1450);
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').dataset.navIdle"),'true');
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:185,y:450,id:1}]});
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:185,y:400,id:1}]});await sleep(50);
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:185,y:350,id:1}]});
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').dataset.navIdle"),'false','real vertical touch reveals navigation');
    await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(2000);
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').dataset.navIdle"),'true','inertia eventually settles and hides');
    await evaluate("document.querySelector('.glass-wake').click()");
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').dataset.navIdle"),'false');
    await evaluate("document.querySelector('#liquid-nav-root [data-nav-index=\"2\"]').click()");
    await waitFor("Boolean(document.querySelector('[data-settings-entry=\"appearance\"]'))");
    await evaluate("document.querySelector('[data-settings-entry=\"appearance\"]').click()");
    await waitFor("Boolean(document.querySelector('#glass-material-preview .preview-lens-root filter'))");
    await evaluate("document.querySelector('#glass-material-preview [data-nav-index=\"1\"]').click()");
    await sleep(450);
    assert.equal(await evaluate("document.querySelector('#glass-material-preview [data-nav-index=\"1\"]').classList.contains('active')"),true);
    assert.ok(await evaluate("Boolean(document.querySelector('.settings-page'))"),'sample selection does not leave settings');
    const screenshot=await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(out,'interactive-preview.png'),Buffer.from(screenshot.data,'base64'));
    await evaluate("document.querySelector('[data-nav-visibility=\"fixed\"]').click()");
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').dataset.navigationHidden"),'true','fixed does not cover settings details');
    await evaluate("document.querySelector('.settings-back').click()");
    await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
    await sleep(1700);
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').dataset.navIdle"),'false','switch back to fixed clears auto-hide');
    await evaluate("window.__spectrumBeforeReload=true");
    await send('Page.reload');await waitFor("!window.__spectrumBeforeReload && document.querySelector('#liquid-nav-root[data-glass-renderer]')?.dataset.navIdle !== undefined");await sleep(1700);
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').dataset.navIdle"),'false','fixed choice persists after reload');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({results,checks:['14 physical samples','default fixed visibility','auto and fixed choices persist after reload','vertical-only reveal','idle hide','wake control','interactive preview stays on page','fixed preference respects hidden detail routes'],errors},null,2));
    console.log('Browser spectrum, visibility and preview checks passed: '+out);
    await send('Browser.close',{},false);
  } finally {socket?.close();child.kill();server.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
