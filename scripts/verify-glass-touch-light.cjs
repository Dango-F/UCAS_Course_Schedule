// Exercise real native scrolling and held navigation in the built H5 app.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const {spawn}=require('node:child_process'),assert=require('node:assert/strict');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const out=path.resolve('.artifacts/glass-touch-light'),dist=path.resolve('dist/build/h5');
async function main(){
  fs.mkdirSync(out,{recursive:true});
  const server=http.createServer((req,res)=>{
    let file=path.resolve(dist,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
    if(file!==dist&&!file.startsWith(dist+path.sep)){res.writeHead(403).end();return}
    if(!fs.existsSync(file)||fs.statSync(file).isDirectory())file=path.join(dist,'index.html');
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png'})[path.extname(file)]||'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'ucas-touch-light-'));
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
    await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:2});
    const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
    const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await sleep(50)}throw new Error('Timeout '+expression)};
    const touch=(type,x,y)=>send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1}]});
    const state=()=>evaluate(`(()=>{const r=document.querySelector('#liquid-nav-root'),l=r.querySelector('.glass-touch-light'),s=l.querySelector('.glass-touch-sheen'),c=s.querySelector('canvas'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let hash=0,bright=0,dark=0,mass=0,cy=0;for(let i=0;i<d.length;i+=4){const a=d[i+3];hash=(hash*31+a)>>>0;mass+=a;cy+=a*Math.floor(i/4/c.width);if(a>5){if(d[i]>180)bright++;else dark++}}const face=r.querySelector('.glass-selection').firstElementChild;return{alpha:Number(getComputedStyle(l).opacity),active:l.dataset.active,effect:l.dataset.effect,transform:s.style.transform,background:getComputedStyle(s).backgroundImage,mask:getComputedStyle(l).maskImage,field:{width:c.width,height:c.height,hash,bright,dark,mass,cy:mass?cy/mass:0},selected:r.querySelector('[aria-current="page"]').dataset.navIndex,filter:r.querySelector('.glass-surface').style.backdropFilter,face:{filter:getComputedStyle(face).backdropFilter,tintOpacity:getComputedStyle(face,'::before').opacity,press:r.style.getPropertyValue('--glass-press'),material:r.style.getPropertyValue('--glass-material-progress')}}})()`);
    const tone=()=>evaluate("(()=>{const r=document.querySelector('#liquid-nav-root');return r.querySelector('.nav-item[aria-current=\"page\"]')?.dataset.glassBackdropTone||r.dataset.glassBackdropTone})()");
    const shot=async name=>{const {data}=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data,'base64'))};
    // Developer-only test tab is intentionally omitted in production builds.
    // Set GLASS_TEST_URL to the H5 dev server when that gate is enabled.
    if(process.env.GLASS_NAV_MOTION==='flow')await send('Page.addScriptToEvaluateOnNewDocument',{source:"localStorage.setItem('lakeside:nav-motion:v1',JSON.stringify({type:'string',data:'flow'}))"});
    await send('Page.navigate',{url:process.env.GLASS_TEST_URL||`http://127.0.0.1:${server.address().port}/`});
    await wait("Boolean(document.querySelector('#liquid-nav-root .glass-touch-light[data-active]'))");
    const hasLab=await evaluate("Boolean(document.querySelector('#liquid-nav-root [data-nav-index=\"3\"]'))");
    if(hasLab){
      await evaluate("document.querySelector('#liquid-nav-root [data-nav-index=\"3\"]').click()");
    }else{
      // Production intentionally has no developer tab. Insert an ephemeral
      // native scrolling backdrop below the real, unchanged navigation.
      await evaluate(`(()=>{
        const p=document.createElement('div');p.className='glass-test-page';
        p.style.cssText='position:absolute;inset:0;z-index:10;display:flex;flex-direction:column;background:white';
        p.innerHTML='<div style="padding:24px;flex-shrink:0"><b>触摸光影 · 回归样本</b><br/><button data-lab-jump="glass-lab-light">浅色</button><button data-lab-jump="glass-lab-dark">深色</button></div><div class="lab-scroll" style="flex:1;min-height:0;overflow-y:auto;touch-action:pan-y"><section id="glass-lab-light" style="height:760px;padding:28px;background:#fff;color:#25374a;box-sizing:border-box"><h1>清晰，透过光。</h1><p>课程文字 · ABCDEFG · 0123456789</p><div style="margin-top:120px;background:linear-gradient(90deg,#e6eef8,#efd8ce);height:90px"></div></section><section id="glass-lab-dark" style="height:1100px;padding:28px;background:#132133;color:#edf4fb;box-sizing:border-box"><h1>光落在边缘。</h1><p>深色背景 · 白色文字</p><div style="margin-top:120px;border:1px solid #a8bbd0;border-radius:50%;width:160px;height:160px"></div></section></div>';
        p.querySelectorAll('[data-lab-jump]').forEach(b=>b.onclick=()=>{p.querySelector('.lab-scroll').scrollTop=b.dataset.labJump==='glass-lab-dark'?760:0});
        document.querySelector('.phone-canvas').append(p);
      })()`);
    }
    await wait("Boolean(document.querySelector('.glass-test-page'))");await sleep(750);
    // Observe the actual composited face, independently of the moving ribbon.
    // Canvas-alpha checks alone miss whitening in the backdrop/material stack.
    if(process.env.GLASS_FACE_ONLY){
      await evaluate(`(()=>{
        const r=document.querySelector('#liquid-nav-root');r.dataset.glassAdaptive='off';
        const p=document.querySelector('.glass-test-page');p.style.background='#b8c0ca';
        p.querySelector('.lab-scroll').style.visibility='hidden';
        r.querySelector('.glass-touch-light').style.visibility='hidden';
        r.querySelectorAll('.nav-item').forEach(b=>b.style.opacity='0');
      })()`);
      await sleep(300);
      const face=async name=>{
        const style=await evaluate(`(()=>{
          const r=document.querySelector('#liquid-nav-root'),s=r.querySelector('.glass-selection').firstElementChild,g=getComputedStyle(s),b=getComputedStyle(s,'::before'),a=getComputedStyle(s,'::after'),box=s.getBoundingClientRect();
          return{material:r.style.getPropertyValue('--glass-material-progress'),press:r.style.getPropertyValue('--glass-press'),filter:g.backdropFilter,tint:b.backgroundColor,tintOpacity:b.opacity,reflection:a.backgroundImage,renderer:s.parentElement.dataset.glassRenderer,box:{x:box.x,y:box.y,width:box.width,height:box.height}};
        })()`);
        const {data}=await send('Page.captureScreenshot',{format:'png',clip:{...style.box,scale:1}});
        fs.writeFileSync(path.join(out,'face-'+name+'.png'),Buffer.from(data,'base64'));
        const pixels=await evaluate(`new Promise((resolve,reject)=>{
          const i=new Image();i.onerror=reject;i.onload=()=>{
            const c=document.createElement('canvas');c.width=i.width;c.height=i.height;
            const ctx=c.getContext('2d');ctx.drawImage(i,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;
            let sum=0,n=0,white=0;
            for(let y=Math.ceil(c.height*.35);y<c.height*.65;y++)for(let x=Math.ceil(c.width*.2);x<c.width*.8;x++){
              const j=(y*c.width+x)*4,l=.2126*d[j]+.7152*d[j+1]+.0722*d[j+2];sum+=l;n++;if(l>235)white++;
            }resolve({luminance:sum/n,whiteFraction:white/n});
          };i.src='data:image/png;base64,${data}';
        })`);
        return {...style,...pixels};
      };
      const center=await evaluate(`(()=>{const b=document.querySelector('#liquid-nav-root [aria-current="page"]').getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`);
      const resting=await face('rest');
      await touch('touchStart',center.x,center.y);await sleep(650);
      const held=await face('held');
      await evaluate("window.dispatchEvent(new Event('resize'))");await sleep(50);
      const resized=await face('resize');
      await touch('touchCancel');await sleep(1200);
      const released=await face('release');
      const report={resting,held,resized,released,errors};
      report.motion=await evaluate("document.querySelector('#liquid-nav-root').classList.contains('is-hop')?'hop':'flow'");
      fs.writeFileSync(path.join(out,'face-report-'+report.motion+'.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
      if(!process.env.GLASS_FACE_BASELINE){
        assert.ok(Number(held.press)>.9,'hold reached full optical pressure');
        assert.ok(Math.abs(held.luminance-resting.luminance)<2,'press does not brighten the entire face');
        assert.ok(Math.abs(resized.luminance-held.luminance)<2,'same-size resize does not flash the face');
        assert.ok(Number(resized.press)>.9,'same-size resize preserves contact');
        assert.equal(held.filter,resting.filter,'optical filter stays attached across contact');
        assert.equal(released.filter,resting.filter,'optical filter stays attached on release');
        assert.deepEqual(errors,[]);
        if(process.env.GLASS_NAV_MOTION)assert.equal(report.motion,process.env.GLASS_NAV_MOTION,'requested navigation mode is actually running');
      }
      await send('Browser.close',{},false);return;
    }
    const resting=await state();assert.equal(resting.alpha,0);await shot('resting');
    assert.equal(resting.effect,'wide-ribbon-v12','built app actually installed fixed-bitmap, smooth-clock wide ribbon');
    assert.equal(resting.background,'none','no river stripe texture is applied');
    assert.ok(resting.field.width<=160&&resting.field.height===48,'local computation stays bounded');
    assert.equal(resting.field.mass,0);
    await evaluate("window.touchLightEncodes=0;const encode=HTMLCanvasElement.prototype.toDataURL;HTMLCanvasElement.prototype.toDataURL=function(...a){window.touchLightEncodes++;return encode.apply(this,a)}");
    // Scroll on the page, away from the bar. Native pan cancels pointer events;
    // the light must keep following the continuing passive touch sequence.
    await touch('touchStart',150,570);
    const pageFrames=[];
    for(const y of [550,520,480,430,380,330]){await touch('touchMove',150,y);await sleep(32);pageFrames.push(await state())}
    await shot('page-swipe-up');
    assert.ok(pageFrames.some(f=>f.alpha>.2),'page scrolling activates the selector light: '+JSON.stringify(pageFrames));
    assert.ok(new Set(pageFrames.map(f=>f.field.hash)).size>3,'local light field evolves while held');
    assert.ok(pageFrames.some(f=>f.field.bright>10&&f.field.dark>10),'actual pixels contain broad light and shade');
    assert.ok(pageFrames.every(f=>!f.transform),'not implemented by translating a static pattern');
    assert.ok(pageFrames.every(f=>f.selected===resting.selected),'page scroll never changes selected tab');
    assert.ok(await evaluate("[...document.querySelectorAll('.lab-scroll,.lab-scroll *')].some(e=>e.scrollTop>0)"),'native vertical scrolling remains functional');
    for(const y of [350,380,420,470]){await touch('touchMove',150,y);await sleep(32)}
    const reversed=await state();await shot('page-reverse');assert.notEqual(reversed.field.hash,pageFrames.at(-1).field.hash);
    // Infrequent moves used to restart a 140ms brightness pulse. New opacity
    // must remain constant through those gaps, not just look right at events.
    await sleep(220);const sparseFrames=[];
    for(const y of [480,495,510]){await touch('touchMove',150,y);await sleep(180);sparseFrames.push(await state());await shot('river-gap-'+y)}
    assert.ok(sparseFrames.every(f=>Math.abs(f.alpha-.58)<.003),'layer brightness does not pulse with sparse touch events');
    const propagation=[];
    // Stop sending motion, but keep the same contact: the wave must travel on
    // locally, rather than freeze like a dragged picture or instantly vanish.
    for(let i=0;i<4;i++){await sleep(110);propagation.push(await state());await shot('propagation-'+i)}
    assert.ok(new Set(propagation.map(f=>f.field.hash)).size===4,'wave continues propagating without new moves');
    // Cross several former 2-second lifetimes with the same contact: no
    // periodic extinction/re-emission, even without further touchmove events.
    const heldContinuity=[];
    for(let i=0;i<12;i++){await sleep(250);heldContinuity.push(await state())}
    assert.ok(heldContinuity.every(f=>f.alpha>.57&&f.field.mass>1000),'held reflection never fades between old emission cycles');
    const masses=heldContinuity.map(f=>f.field.mass);
    assert.ok(Math.max(...masses)/Math.min(...masses)<1.03,'total visible light stays stable as contours flow');
    assert.ok(new Set(heldContinuity.map(f=>f.field.hash)).size>8,'held reflection keeps drifting rather than freezing');
    const centers=heldContinuity.map(f=>f.field.cy);
    assert.ok(Math.max(...centers)-Math.min(...centers)>.5,'reflection changes position across its smooth round trip');
    const consecutive=await evaluate(`new Promise(resolve=>{
      const layer=document.querySelector('#liquid-nav-root .glass-touch-light');
      const c=layer.querySelector('canvas'),ctx=c.getContext('2d'),frames=[];
      function sample(){const d=ctx.getImageData(0,0,c.width,c.height).data;let mass=0;for(let i=3;i<d.length;i+=4)mass+=d[i];frames.push({mass,alpha:Number(layer.style.opacity)});if(frames.length<120)requestAnimationFrame(sample);else resolve(frames)}
      requestAnimationFrame(sample);
    })`);
    const consecutiveMass=consecutive.map(f=>f.mass);
    assert.ok(consecutive.every(f=>f.alpha>.57&&f.mass>1000),'no one-frame blank during continuous rendering');
    assert.ok(Math.max(...consecutiveMass)/Math.min(...consecutiveMass)<1.03,'consecutive frames do not pulse as the crest flows');
    const movingFrames=[];
    for(let i=0;i<32;i++){
      await touch('touchMove',150,450+Math.sin(i*.24)*55);await sleep(24);
      movingFrames.push(await state());
    }
    assert.ok(movingFrames.every(f=>f.alpha>.57&&f.field.mass>1000),'repeated native touchmove never clears the ribbon');
    assert.ok([...pageFrames,...movingFrames].every(f=>f.face.filter===resting.face.filter&&f.face.tintOpacity==='1'),'native scroll keeps whole-face exposure, tint and optical pipeline stable');
    const movingMass=movingFrames.map(f=>f.field.mass);
    assert.ok(Math.max(...movingMass)/Math.min(...movingMass)<1.03,'native scrolling preserves stable ribbon energy');
    // Simulate a busy render thread while holding the same gesture. Compare
    // actual composited luminance, not just alpha totals, across recovery.
    const stalledFrame=await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>{
      const c=document.querySelector('#liquid-nav-root .glass-touch-light canvas'),ctx=c.getContext('2d');
      const before=ctx.getImageData(0,0,c.width,c.height).data;
      const until=performance.now()+900;while(performance.now()<until){}
      requestAnimationFrame(()=>{
        const after=ctx.getImageData(0,0,c.width,c.height).data;let maxDelta=0,mass=0;
        for(let i=0;i<after.length;i+=4){mass+=after[i+3];for(const bg of [30,255]){
          const a=(before[i+1]-bg)*before[i+3]/255*.58,b=(after[i+1]-bg)*after[i+3]/255*.58;
          maxDelta=Math.max(maxDelta,Math.abs(a-b));
        }}resolve({maxDelta,mass});
      });
    }))`);
    assert.ok(stalledFrame.mass>1000&&stalledFrame.maxDelta<4,'a missed frame does not jump the ribbon forward: '+JSON.stringify(stalledFrame));
    const retouch=[];
    for(let i=0;i<3;i++){
      await touch('touchEnd');await sleep(90);retouch.push(await state());
      await touch('touchStart',150,510);await touch('touchMove',150,490);await sleep(100);retouch.push(await state());
    }
    assert.ok(retouch.every(f=>f.alpha>.57&&f.field.mass>Math.min(...consecutiveMass)*.8),'quick re-touch resumes without a brightness restart: '+JSON.stringify(retouch.map(f=>({alpha:f.alpha,mass:f.field.mass,active:f.active}))));
    await touch('touchEnd');await sleep(2900);assert.equal((await state()).alpha,0,'finite wisps dissipate after release');
    assert.equal(await evaluate('window.touchLightEncodes'),0,'motion never rebuilds optical maps');
    const idleWrites=await evaluate("new Promise(resolve=>{let n=0;const o=new MutationObserver(r=>n+=r.length);o.observe(document.querySelector('#liquid-nav-root .glass-touch-light'),{subtree:true,attributes:true});setTimeout(()=>{o.disconnect();resolve(n)},300)})");assert.equal(idleWrites,0);
    // Long press is also supported, and direct drag changes the same layer.
    await evaluate("document.querySelector('[data-lab-jump=\"glass-lab-light\"]').click()");await sleep(300);
    const bar=await evaluate("(()=>{const r=document.querySelector('#liquid-nav-root .glass-bar').getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()");
    const count=await evaluate("document.querySelectorAll('#liquid-nav-root [data-nav-index]').length");
    const x=bar.x+4+(bar.w-8)*(count-.5)/count,y=bar.y+bar.h/2;
    assert.equal(await tone(),'light','actual backdrop adapter reports the white fixture');
    await touch('touchStart',x,y);await sleep(120);
    const entryFrame=await state();
    assert.ok(entryFrame.field.mass>0&&entryFrame.field.cy>entryFrame.field.height*.72,'navigation highlight first enters from the lower rim');
    await shot('edge-entry-light');
    await sleep(330);const held=await state();assert.ok(held.alpha>=.27);
    await evaluate("window.dispatchEvent(new Event('resize'))");
    const afterResize=await state();
    assert.ok(afterResize.alpha>=held.alpha*.9&&afterResize.field.mass>0,'viewport resize must not extinguish the held highlight: '+JSON.stringify({before:held.alpha,after:afterResize.alpha,mass:afterResize.field.mass}));
    assert.equal(afterResize.face.press,held.face.press,'unchanged viewport notifications keep optical pressure');
    assert.equal(afterResize.face.filter,held.face.filter,'unchanged viewport notifications keep the backdrop pipeline');
    await evaluate("window.lightBitmapWrites=0;window.lightBitmapObserver=new MutationObserver(r=>window.lightBitmapWrites+=r.length);window.lightBitmapObserver.observe(document.querySelector('#liquid-nav-root .glass-touch-light canvas'),{attributes:true,attributeFilter:['width','height']});document.querySelector('#liquid-nav-root .glass-touch-sheen').style.width='108%';new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))");
    const resizedBitmap=await state();assert.equal(resizedBitmap.field.width,held.field.width);assert.ok(resizedBitmap.field.mass>0,'CSS resizing keeps the bitmap and its light history intact');
    await evaluate("document.querySelector('#liquid-nav-root .glass-touch-sheen').style.removeProperty('width')");
    assert.equal(await evaluate('window.lightBitmapObserver.disconnect();window.lightBitmapWrites'),0,'resizing never reallocates the light bitmap');
    await shot('held-light');
    for(const dx of [-8,-18,-30,-45]){await touch('touchMove',x+dx,y-4);await sleep(35)}
    const dragged=await state();assert.ok(dragged.alpha>.35);assert.notEqual(dragged.field.hash,held.field.hash);await shot('nav-drag');
    await touch('touchCancel');await sleep(2900);assert.equal((await state()).alpha,0);
    assert.equal(dragged.background,'none','old stripe texture is not active');
    assert.equal(dragged.mask,'none','light covers the center, not just the rim');
    // Dark backgrounds retain the same moving bright/dark pair.
    await evaluate("document.querySelector('[data-lab-jump=\"glass-lab-dark\"]').click()");await sleep(400);
    assert.equal(await tone(),'dark','actual backdrop adapter reports the dark fixture');
    await touch('touchStart',x,y);await touch('touchMove',x-18,y+4);await sleep(700);await shot('held-dark');
    // Change the real backdrop during the same contact. The adaptive material
    // must not restart or clear the live light field when its tone changes.
    await evaluate("document.querySelector('[data-lab-jump=\"glass-lab-light\"]').click()");
    const toneFrames=[];
    for(let i=0;i<6;i++){await sleep(60);toneFrames.push(await state())}
    assert.equal(await tone(),'light');
    assert.ok(toneFrames.every(f=>f.alpha>.57&&f.field.mass>0),'live tone transitions never extinguish or restart the light');
    await touch('touchCancel');await sleep(2900);
    await evaluate("document.querySelector('[data-lab-jump=\"glass-lab-dark\"]').click()");await sleep(400);
    await evaluate("document.querySelector('#liquid-nav-root').dataset.glassTouchLight='off'");
    await touch('touchStart',x,y);await touch('touchMove',x-15,y);await sleep(130);assert.equal((await state()).alpha,0);await shot('disabled-dark');await touch('touchCancel');
    await evaluate("delete document.querySelector('#liquid-nav-root').dataset.glassTouchLight");
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await touch('touchStart',150,500);await touch('touchMove',150,410);await sleep(100);assert.equal((await state()).alpha,0);await touch('touchEnd');
    await send('Emulation.setEmulatedMedia',{features:[]});
    assert.deepEqual(errors,[]);
    const report={resting,propagation,sparseFrames,held,afterResize,resizedBitmap,dragged,pageFrames,reversed,idleWrites,errors,checks:['new local surface field applied, no stripe texture','viewport and bitmap resize preserve visible light','stable layer brightness across sparse touches','local propagation continues between input events','native page scroll + reverse','no tab change on page scroll','held and dragged selector','finite release/cancel + idle stop','no optical map encoding during motion','light/dark visual samples','independent disable','reduced motion']};
    report.entryFrame=entryFrame;report.toneFrames=toneFrames;report.heldContinuity=heldContinuity;report.consecutive=consecutive;report.retouch=retouch;report.checks.push('real light/dark backgrounds do not interrupt held light','continuous drift across former emission lifetimes','120 consecutive frames have stable light energy','quick retouch preserves reflection','highlight enters from rim before spreading inside');
    report.movingFrames=movingFrames;report.stalledFrame=stalledFrame;report.checks.push('continuous native touchmove preserves the light','900ms thread stall has no phase leap','CSS resizing performs zero bitmap allocations');
    report.checks.push('whole-face exposure and tint stay stable through native scrolling','same-size resize retains optical pressure and backdrop pipeline');
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({checks:report.checks,errors,out},null,2));
    await send('Browser.close',{},false);
  }finally{socket?.close();child.kill();server.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
