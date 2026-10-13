// Built-in Node/CDP smoke test; no extra browser package is required.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const dist = path.resolve('dist/build/h5');
const out = path.resolve('.artifacts/glass-optics-clear');
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
    // Isolate optical correctness from the navigation's idle/press animations.
    await evaluate("(()=>{document.querySelector('.glass-bar').style.cssText='opacity:1;visibility:visible;transform:none;transition:none';document.querySelectorAll('.nav-item,.glass-selection,.glass-edge').forEach(e=>e.style.visibility='hidden');const e=document.createElement('div');e.id='optics-fixture';e.style.cssText='position:absolute;inset:0;z-index:19;pointer-events:none';document.querySelector('.phone-canvas').appendChild(e)})()");
    const capture=async(name,clip)=>{await sleep(180);const data=(await send('Page.captureScreenshot',{format:'png',clip:{...clip,scale:1}})).data;fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data,'base64'));return data};
    const compare=async(a,b,width,height,axis)=>evaluate('(async()=>{const read=async s=>{const i=new Image();i.src=s;await i.decode();const c=document.createElement("canvas");c.width=i.width;c.height=i.height;const x=c.getContext("2d");x.drawImage(i,0,0);return{w:i.width,p:x.getImageData(0,0,i.width,i.height).data}};const a=await read('+JSON.stringify('data:image/png;base64,'+a)+'),b=await read('+JSON.stringify('data:image/png;base64,'+b)+');const w='+width+',h='+height+',ratio=a.w/w;const region=(x0,y0,x1,y1,shift=0)=>{let sum=0,n=0;for(let y=Math.ceil(y0*ratio);y<Math.floor(y1*ratio);y++)for(let x=Math.ceil(x0*ratio);x<Math.floor(x1*ratio);x++)for(let k=0;k<3;k++){const bx=x+'+(axis==='x'?'Math.round(shift*ratio)':'0')+',by=y+'+(axis==='y'?'Math.round(shift*ratio)':'0')+';sum+=Math.abs(a.p[(y*a.w+x)*4+k]-b.p[(by*b.w+bx)*4+k]);n++}return sum/n};const offsets=[-2,-1,0,1,2].map(shift=>({shift,mean:region(70,19,w-70,h-19,shift)}));return {center:region(70,19,w-70,h-19),edge:'+ (axis==='x'?'(region(2,22,11,h-22)+region(w-11,22,w-2,h-22))/2':'(region(70,2,w-70,11)+region(70,h-11,w-70,h-2))/2')+',bestCenterOffset:offsets.sort((a,b)=>a.mean-b.mean)[0].shift}})()');
    for (const [width,dpr] of [[320,1],[390,1],[390,2]]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:dpr,mobile:true});await sleep(400);
      const geometry=await evaluate("(()=>{const s=document.querySelector('.glass-surface'),r=s.getBoundingClientRect(),m=document.querySelector('#liquid-nav-root > svg feImage'),f=document.querySelector('#liquid-nav-root > svg filter'),d=document.querySelector('#liquid-nav-root > svg feDisplacementMap');return{clip:{x:r.x,y:r.y,width:r.width,height:r.height},filter:s.style.backdropFilter,scale:d.getAttribute('scale'),mapWidth:m.getAttribute('width'),mapHeight:m.getAttribute('height'),units:f.getAttribute('filterUnits')}})()");
      assert.equal(geometry.mapWidth,String(Math.round(geometry.clip.width)));
      assert.equal(geometry.mapHeight,String(Math.round(geometry.clip.height)));
      assert.equal(geometry.units,'userSpaceOnUse');
      for (const axis of ['x','y']) {
        const tag=width+'-'+dpr+'-'+axis;
        await evaluate("document.querySelector('#optics-fixture').style.background='repeating-linear-gradient("+(axis==='x'?'90':'0')+"deg,#f4c463 0 6px,#3479ae 6px 12px)'");
        await evaluate("document.querySelector('.glass-surface').style.backdropFilter="+JSON.stringify(geometry.filter));
        await evaluate("document.querySelector('#liquid-nav-root > svg feDisplacementMap').setAttribute('scale',"+JSON.stringify(geometry.scale)+")");
        const lens=await capture(tag+'-lens',geometry.clip);
        await evaluate("document.querySelector('#liquid-nav-root > svg feDisplacementMap').setAttribute('scale','0')");
        const zero=await capture(tag+'-zero',geometry.clip);
        await evaluate("document.querySelector('.glass-surface').style.backdropFilter="+JSON.stringify(geometry.filter.replace(/\s*url\([^)]*\)/,'')));
        const blur=await capture(tag+'-blur',geometry.clip);
        const neutral=await compare(zero,blur,geometry.clip.width,geometry.clip.height,axis);
        const optical=await compare(lens,blur,geometry.clip.width,geometry.clip.height,axis);
        console.log(tag,JSON.stringify({neutral,optical}));
        assert.ok(neutral.center<1.5 && neutral.edge<1.5,'zero displacement equals blur');
        assert.equal(optical.bestCenterOffset,0,'interior does not translate');
        assert.ok(optical.center<1.5,'interior stays optically neutral');
        assert.ok(optical.edge>1.5,'edges, not the whole panel, bend the backdrop');
        results.push({width,dpr,axis,neutral,optical});
      }
      await evaluate("document.querySelector('#liquid-nav-root > svg feDisplacementMap').setAttribute('scale',"+JSON.stringify(geometry.scale)+");document.querySelector('.glass-surface').style.backdropFilter="+JSON.stringify(geometry.filter));
    }
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({results,errors},null,2));
    await send('Browser.close',{},false);
  } finally { socket?.close(); child.kill(); server.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
