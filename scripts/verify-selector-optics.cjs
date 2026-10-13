// Built-in Node/CDP smoke test; no extra browser package is required.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const dist = path.resolve('dist/build/h5');
const out = path.resolve('.artifacts/selector-optics');
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



    const results=[];
    const touch=(type,x,y)=>send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchCancel'?[]:[{x,y,id:1}]});
    const shot=async(name,clip)=>{
      const {data}=await send('Page.captureScreenshot',{format:'png',clip:{...clip,scale:1}});
      fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data,'base64'));
      return data;
    };
    const compare=(a,b)=>evaluate('('+ (async function(a,b) {
      const read=async s=>{
        const i=new Image();i.src='data:image/png;base64,'+s;await i.decode();
        const c=document.createElement('canvas');c.width=i.width;c.height=i.height;
        const ctx=c.getContext('2d');ctx.drawImage(i,0,0);
        return {w:i.width,h:i.height,p:ctx.getImageData(0,0,i.width,i.height).data};
      };
      const x=await read(a),y=await read(b);
      const region=(y0,y1)=>{
        let sum=0,n=0;
        for(let row=Math.ceil(x.h*y0);row<Math.floor(x.h*y1);row++)
          for(let col=Math.ceil(x.w*.4);col<Math.floor(x.w*.6);col++)
            for(let k=0;k<3;k++){sum+=Math.abs(x.p[(row*x.w+col)*4+k]-y.p[(row*x.w+col)*4+k]);n++}
        return sum/n;
      };
      return {center:region(.35,.65),edge:(region(.02,.23)+region(.77,.98))/2};
    }).toString()+')('+JSON.stringify(a)+','+JSON.stringify(b)+')');
    await waitFor("Boolean(document.querySelector('#liquid-nav-root.is-hop filter'))");
    await evaluate(`(()=>{
      const root=document.querySelector('#liquid-nav-root');
      root.querySelectorAll('.glass-surface,.glass-edge,.nav-item').forEach(e=>e.style.visibility='hidden');
      const fixture=document.createElement('div');fixture.id='selector-optical-fixture';
      fixture.style.cssText='position:absolute;inset:0;z-index:19;pointer-events:none;background:repeating-linear-gradient(0deg,#f4c463 0 1px,#3479ae 1px 2px)';
      root.closest('.phone-canvas').appendChild(fixture);
      window.encodedMaps=0;const original=HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL=function(...args){window.encodedMaps++;return original.apply(this,args)};
    })()`);
    for(const [width,dpr] of [[320,1],[390,1],[390,2]]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:dpr,mobile:true});
      await sleep(250);
      const point=await evaluate("(()=>{const r=document.querySelector('#liquid-nav-root .glass-bar').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
      const encodes=await evaluate('window.encodedMaps');
      await touch('touchStart',point.x,point.y);await sleep(450);
      const geometry=await evaluate(`(()=>{
        const root=document.querySelector('#liquid-nav-root'),s=root.querySelector('.glass-selection'),face=s.firstElementChild;
        const r=face.getBoundingClientRect(),d=s.querySelector('feDisplacementMap');
        return {clip:{x:r.x,y:r.y,width:r.width,height:r.height},scale:d.getAttribute('scale'),
          filter:getComputedStyle(face).backdropFilter,mode:s.dataset.glassRenderer,
          map:s.querySelector('feImage').getAttribute('href')};
      })()`);
      assert.equal(geometry.mode,'svg-refraction');
      assert.match(geometry.filter,/url\(/);
      assert.equal(Number(geometry.scale),10);
      const a=await shot(width+'-'+dpr+'-lens',geometry.clip);
      await evaluate("document.querySelectorAll('.glass-selection feDisplacementMap').forEach(node=>node.setAttribute('scale','0'))");
      await sleep(100);
      const b=await shot(width+'-'+dpr+'-zero',geometry.clip);
      const diff=await compare(a,b);
      console.log(JSON.stringify({geometry:{...geometry,map:undefined},diff}));
      assert.ok(diff.edge>1.5,'selector edge really refracts live background: '+JSON.stringify(diff));
      assert.ok(diff.center<1.5,'selector interior stays clear: '+JSON.stringify(diff));
      assert.equal(await evaluate('window.encodedMaps'),encodes,'hold does not re-encode map');
      assert.equal(await evaluate("document.querySelector('.glass-selection feImage').getAttribute('href')"),geometry.map);
      await touch('touchCancel');await sleep(450);
      const resting=await evaluate("(()=>{const s=document.querySelector('.glass-selection');return{mode:s.dataset.glassRenderer,filter:getComputedStyle(s.firstElementChild).backdropFilter}})()");
      assert.equal(resting.mode,'inactive');
      assert.ok(!resting.filter.includes('url('),'resting selector has no second refraction pass');
      assert.equal(await evaluate('window.encodedMaps'),encodes,'release reuses cached map');
      results.push({width,dpr,diff,resting});
    }
    // Accessibility disables both lenses, not only the original outer lens.
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
    await sleep(100);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.glass-selection').firstElementChild).backdropFilter"),'none');
    assert.equal(await evaluate("document.querySelector('.glass-selection').dataset.glassRenderer"),'opaque');
    await send('Emulation.setEmulatedMedia',{features:[]});
    // Force the existing engine gate closed in a fresh document to test fallback.
    await send('Emulation.setUserAgentOverride',{userAgent:'Mozilla/5.0 AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'});
    await send('Page.reload');await sleep(500);
    await waitFor("document.querySelector('#liquid-nav-root')?.dataset.glassRenderer==='blur-fallback'");
    const fallbackPoint=await evaluate("(()=>{const r=document.querySelector('.glass-bar').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await touch('touchStart',fallbackPoint.x,fallbackPoint.y);await sleep(450);
    assert.ok(!(await evaluate("getComputedStyle(document.querySelector('.glass-selection').firstElementChild).backdropFilter")).includes('url('));
    await touch('touchCancel');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({results,errors},null,2));
    console.log(JSON.stringify({results,errors,out},null,2));
    await send('Browser.close',{},false);
  } finally {socket?.close();child.kill();server.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
