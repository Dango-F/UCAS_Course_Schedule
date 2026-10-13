// Real application + isolated headless Edge, no browser dependencies.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const out=path.resolve('.artifacts/glass-adaptive'),dist=path.resolve('dist/build/h5');
async function main(){
  fs.mkdirSync(out,{recursive:true});
  const server=http.createServer((req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/adaptive-module.js'){res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync('src/components/glass-adaptive.js'));return}
    let file=path.resolve(dist,'.'+decodeURIComponent(url.pathname));
    if(file!==dist&&!file.startsWith(dist+path.sep)){res.writeHead(403).end();return}
    if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(dist,'index.html');
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg'})[path.extname(file)]||'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ucas-adaptive-'));
  const child=spawn(process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'});
  let socket;
  try{
    const portFile=path.join(profile,'DevToolsActivePort');
    for(let i=0;i<100&&!fs.existsSync(portFile);i++)await sleep(100);
    const [port,endpoint]=fs.readFileSync(portFile,'utf8').trim().split(/\r?\n/);
    socket=new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j});
    let seq=0,sessionId;const pending=new Map(),errors=[];
    socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result)}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text)};
    const send=(method,params={},attached=true)=>new Promise((resolve,reject)=>{const id=++seq,t=setTimeout(()=>{pending.delete(id);reject(new Error(method+' timeout'))},20000);pending.set(id,{resolve:v=>{clearTimeout(t);resolve(v)},reject:e=>{clearTimeout(t);reject(e)}});socket.send(JSON.stringify({id,method,params,...(attached&&sessionId?{sessionId}:{})}))});
    const {targetId}=await send('Target.createTarget',{url:'about:blank'},false);({sessionId}=await send('Target.attachToTarget',{targetId,flatten:true},false));
    await send('Runtime.enable');await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
    const wait=async expression=>{for(let i=0;i<80;i++){if(await evaluate(expression))return;await sleep(60)}throw new Error('Timeout '+expression+' '+JSON.stringify({errors,root:await evaluate("document.querySelector('#liquid-nav-root')?.outerHTML.slice(0,1200)"),support:await evaluate("CSS.supports('backdrop-filter','blur(1px)')")}))};
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
    await wait("document.querySelector('#liquid-nav-root')?.dataset.glassBackdropTone==='light'");
    const state=()=>evaluate(`(()=>{const r=document.querySelector('#liquid-nav-root');return {tone:r.dataset.glassBackdropTone,items:[...r.querySelectorAll('.nav-item')].map(e=>({tone:e.dataset.glassBackdropTone,color:getComputedStyle(e).color,icon:getComputedStyle(e.querySelector('.app-icon')).filter})),surface:getComputedStyle(r.querySelector('.glass-surface')).backgroundColor,filter:r.querySelector('.glass-surface').style.backdropFilter}})()`);
    const settleColors=()=>evaluate("Promise.all(document.querySelector('#liquid-nav-root').getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{})))");
    const shot=async name=>{await settleColors();const {data}=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data,'base64'))};
    // Vue applies persisted clarity after the lens mounts; let that baseline
    // and its colour transition settle before comparing restoration.
    await sleep(600);
    const initial=await state();
    await evaluate(`(()=>{
      const r=document.querySelector('#liquid-nav-root'),bg=document.createElement('div');bg.id='adaptive-fixture';bg.style.cssText='position:absolute;inset:0;z-index:19;background:#111722;overflow:auto';r.parentElement.insertBefore(bg,r);
      window.adaptiveHitReads=0;const hit=document.elementsFromPoint.bind(document);document.elementsFromPoint=(...a)=>{window.adaptiveHitReads++;return hit(...a)};
      window.adaptiveCanvasReads=0;const read=CanvasRenderingContext2D.prototype.getImageData;CanvasRenderingContext2D.prototype.getImageData=function(...a){window.adaptiveCanvasReads++;return read.apply(this,a)};
    })()`);
    await wait("document.querySelector('#liquid-nav-root').dataset.glassBackdropTone==='dark'");await shot('dark');const dark=await state();
    assert.ok(dark.items.every(i=>i.tone==='dark'&&i.color==='rgb(245, 247, 252)'&&i.icon.includes('invert(1)')),JSON.stringify(dark));
    assert.ok(dark.surface.startsWith('rgba(20, 25, 34,'),dark.surface);assert.equal(dark.filter,initial.filter);
    await evaluate("document.querySelector('#adaptive-fixture').style.background='#fff'");
    await wait("document.querySelector('#liquid-nav-root').dataset.glassBackdropTone==='light'");await shot('light');const light=await state();
    assert.ok(light.items.every(i=>i.tone==='light'&&i.color==='rgb(32, 33, 38)'&&i.icon==='none'));
    assert.equal(light.surface,initial.surface);
    // Mixed background: each column adapts rather than averaging away one
    // dark patch and making its label unreadable.
    await evaluate("document.querySelector('#adaptive-fixture').innerHTML='<div style=\"display:flex;height:100%\"><div style=\"flex:1;background:#101720\"></div><div style=\"flex:1;background:white\"></div><div style=\"flex:1;background:white\"></div><div style=\"flex:1;background:#101720\"></div></div>'");
    await wait("[...document.querySelectorAll('#liquid-nav-root .nav-item')].map(e=>e.dataset.glassBackdropTone).join(',')==='dark,light,light,dark'");await shot('mixed');
    // A local PNG with black and white halves proves local pixel sampling,
    // rather than deriving image contrast from its parent or file name.
    await evaluate(`(async()=>{
      const c=document.createElement('canvas');c.width=200;c.height=100;const ctx=c.getContext('2d');ctx.fillStyle='#101722';ctx.fillRect(0,0,100,100);ctx.fillStyle='#fff';ctx.fillRect(100,0,100,100);
      const img=new Image();img.src=c.toDataURL();img.style.cssText='display:block;width:100%;height:100%;object-fit:fill';await img.decode();document.querySelector('#adaptive-fixture').replaceChildren(img);
    })()`);
    await wait("document.querySelector('#liquid-nav-root .nav-item').dataset.glassBackdropTone==='dark'&&[...document.querySelectorAll('#liquid-nav-root .nav-item')].at(-1).dataset.glassBackdropTone==='light'");await shot('image');
    const imageReads=await evaluate('window.adaptiveCanvasReads');assert.ok(imageReads>=1);
    await sleep(450);const idleStart=await evaluate('window.adaptiveHitReads');await sleep(600);assert.equal(await evaluate('window.adaptiveHitReads'),idleStart,'no idle polling');
    await evaluate("document.querySelector('#adaptive-fixture').dispatchEvent(new Event('scroll'))");await sleep(220);assert.equal(await evaluate('window.adaptiveCanvasReads'),imageReads,'cached PNG not decoded on scroll');
    // Actual scroll moves alternating backgrounds through a fixed bar.
    await evaluate("const f=document.querySelector('#adaptive-fixture');f.innerHTML='<div style=\"height:900px;background:#111722\"></div><div style=\"height:1800px;background:#fff\"></div>';f.scrollTop=0");
    await wait("document.querySelector('#liquid-nav-root').dataset.glassBackdropTone==='dark'");
    await evaluate("document.querySelector('#adaptive-fixture').scrollTop=1000");
    await wait("document.querySelector('#liquid-nav-root').dataset.glassBackdropTone==='light'");
    await evaluate("document.querySelector('#adaptive-fixture').scrollTop=0");
    await wait("document.querySelector('#liquid-nav-root').dataset.glassBackdropTone==='dark'");
    await evaluate(`(()=>{const f=document.querySelector('#adaptive-fixture'),c=document.createElement('canvas');c.width=c.height=16;c.getContext('2d').fillRect(0,0,16,16);c.style.cssText='width:100%;height:100%;display:block';f.replaceChildren(c);f.style.background='#fff'})()`);
    await sleep(350);assert.equal((await state()).tone,'dark','unsupported canvas retains last known tone');
    await evaluate("document.querySelector('#adaptive-fixture').replaceChildren();document.querySelector('#adaptive-fixture').style.background='#111722'");
    await evaluate("document.querySelector('#liquid-nav-root').dataset.glassAdaptive='off'");
    await wait("!document.querySelector('#liquid-nav-root').dataset.glassBackdropTone");await settleColors();assert.equal((await state()).surface,initial.surface,'disabled returns original material');
    await evaluate("delete document.querySelector('#liquid-nav-root').dataset.glassAdaptive");await wait("document.querySelector('#liquid-nav-root').dataset.glassBackdropTone==='dark'");
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
    await wait("!document.querySelector('#liquid-nav-root').dataset.glassBackdropTone");assert.equal((await state()).items[0].color,'rgb(32, 33, 38)');
    await send('Emulation.setEmulatedMedia',{features:[]});await wait("document.querySelector('#liquid-nav-root').dataset.glassBackdropTone==='dark'");
    // Module lifecycle can also be checked independently of route controllers.
    const lifecycle=await evaluate(`(async()=>{
      const {createGlassBackdropAdaptation}=await import('/adaptive-module.js');const r=document.createElement('div');r.style.cssText='position:fixed;top:100px;left:20px;width:200px;height:56px';r.innerHTML='<div class="glass-surface" style="width:200px;height:56px"></div><button class="nav-item">test</button>';document.body.append(r);
      const a=createGlassBackdropAdaptation(r);await new Promise(r=>setTimeout(r,230));a.destroy();const count=a.stats().checks;r.style.left='30px';window.dispatchEvent(new Event('resize'));await new Promise(r=>setTimeout(r,230));const result={before:count,after:a.stats().checks,tone:r.dataset.glassBackdropTone};r.remove();return result;
    })()`);
    assert.equal(lifecycle.before,lifecycle.after);assert.equal(lifecycle.tone,undefined);
    // Exercise the new page through its actual navigation, not injected
    // fixtures: shortcuts, shipped photos, scrolling and fourth-tab geometry.
    await evaluate("document.querySelector('#adaptive-fixture').remove();document.querySelector('#liquid-nav-root [data-nav-index=\"3\"]').click()");
    await wait("Boolean(document.querySelector('.glass-test-page'))");
    await wait("[...document.querySelectorAll('.lab-photo img')].length===2&&[...document.querySelectorAll('.lab-photo img')].every(i=>i.complete&&i.naturalWidth>0)");
    await sleep(450);
    const pageCases=[];
    for(const [id,expected] of [['light','light,light,light,light'],['dark','dark,dark,dark,dark'],['mixed','light,light,dark,dark']]) {
      await evaluate(`document.querySelector('[data-lab-jump="glass-lab-${id}"]').click()`);
      await wait(`[...document.querySelectorAll('#liquid-nav-root .nav-item')].map(e=>e.dataset.glassBackdropTone).join(',')===${JSON.stringify(expected)}`);
      await shot('page-'+id);pageCases.push({section:id,...await state()});
    }
    await evaluate("document.querySelector('[data-lab-jump=\"glass-lab-photos\"]').click()");await sleep(350);await shot('page-photos');
    const photoReads=await evaluate('window.adaptiveCanvasReads');assert.ok(photoReads>imageReads,'packaged photographs are read locally');
    await evaluate(`(()=>{const s=[...document.querySelectorAll('.lab-scroll *')].find(e=>e.scrollHeight>e.clientHeight&&getComputedStyle(e).overflowY==='auto'),photo=document.querySelector('[data-lab-photo="night"]'),bar=document.querySelector('#liquid-nav-root .glass-bar');s.scrollTop+=photo.getBoundingClientRect().top+180-(bar.getBoundingClientRect().top+28)})()`);
    await sleep(450);await shot('page-night');pageCases.push({section:'night',...await state()});
    for(const width of [320,390,768]) {
      await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await sleep(250);
      const geometry=await evaluate(`(()=>{const r=document.querySelector('#liquid-nav-root'),bar=r.querySelector('.glass-bar'),selector=r.querySelector('.glass-selection'),items=[...r.querySelectorAll('.nav-item')];const b=bar.getBoundingClientRect(),s=selector.getBoundingClientRect(),active=items[3].getBoundingClientRect();return{count:items.length,width:s.width,target:(bar.clientWidth-8)/items.length,center:s.left+s.width/2,activeCenter:active.left+active.width/2,overflow:document.querySelector('.glass-test-page').scrollWidth>document.querySelector('.glass-test-page').clientWidth}})()`);
      assert.equal(geometry.count,4);assert.ok(Math.abs(geometry.width-geometry.target)<1);assert.ok(Math.abs(geometry.center-geometry.activeCenter)<1);assert.equal(geometry.overflow,false);
    }
    await evaluate("document.querySelector('[data-lab-jump=\"glass-lab-type\"]').click()");
    await wait("[...document.querySelectorAll('.lab-scroll *')].some(e=>e.scrollTop>0)");await shot('page-type');
    await evaluate("document.querySelector('#liquid-nav-root [data-nav-index=\"0\"]').click()");await wait("!document.querySelector('.glass-test-page')");
    assert.deepEqual(errors,[]);
    const report={initial,dark,light,imageReads,idleStart,lifecycle,pageCases,photoReads,errors,checks:['light/dark real backgrounds','per-item mixed contrast','actual PNG local pixels + cache','actual scroll transition','unsupported canvas retains last tone','no idle polling','disable restores baseline','accessibility override','destroy stops work','actual test page: shortcuts + local photos + mixed contrast','fourth tab geometry at 320/390/768 + exit']};
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks,errors,out},null,2));
    await send('Browser.close',{},false);
  }finally{socket?.close();child.kill();server.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
