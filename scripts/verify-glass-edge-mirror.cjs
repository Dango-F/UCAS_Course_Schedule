// Built-in Node/CDP smoke test; no extra browser package is required.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const dist = path.resolve('dist/build/h5');
const out = path.resolve('.artifacts/glass-video-rim');
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




    await waitFor("document.querySelector('#liquid-nav-root')?.dataset.glassRenderer==='svg-refraction'");
    const optics=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('src/components/glass-spectrum.js','utf8')).toString('base64'));
    const geometry=await evaluate("(()=>{const root=document.querySelector('#liquid-nav-root'),r=root.querySelector('.glass-surface').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}})()");
    const w=Math.round(geometry.width),h=Math.round(geometry.height),rim=Math.min(h/2,16,h*2/9),amount=Math.min(10,h*5/36);
    const fold=optics.mirrorFoldWidth(rim,amount);
    // Compare with the immediately previous 7px sharp fold, not older trials.
    const oldFold=Math.min(rim,amount,7),oldScale=2*amount*(2+.6+.2);
    const oldMaps=optics.SPECTRAL_SAMPLES.map(s=>{
      const data=new Uint8ClampedArray(w*h*4),radius=h/2,segment=w/2-radius;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const cx=x+.5-w/2,cy=y+.5-h/2,dx=cx-Math.max(-segment,Math.min(segment,cx));
        const length=Math.hypot(dx,cy),inside=radius-length;
        const delta=inside>0&&inside<oldFold?2*(oldFold-inside):0,i=(y*w+x)*4;
        const z=Math.max(0,oldFold-inside),l=Math.min(1,oldFold/2),ny=length?cy/length:0,compression=inside>0&&inside<oldFold?.6*(z+l*Math.expm1(-z/l))+.2*z**3/oldFold**2:0;
        data[i]=255*(.5-(length?delta*dx/length:0)/oldScale);data[i+1]=255*(.5-(delta*ny+compression*ny**3)/oldScale);data[i+2]=128;data[i+3]=255;
      }return Array.from(data);
    });
    const applyOld=()=>evaluate('('+(function(maps,w,h,scale){
      const filter=document.querySelector('svg[data-edge-mirror=true]'),images=filter.querySelectorAll('feImage');
      const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');
      maps.forEach((p,i)=>{const data=ctx.createImageData(w,h);data.data.set(p);ctx.putImageData(data,0,0);images[i].setAttribute('href',c.toDataURL())});
      filter.querySelectorAll('feDisplacementMap').forEach(e=>e.setAttribute('scale',scale));
    }).toString()+')('+JSON.stringify(oldMaps)+','+w+','+h+','+oldScale+')');
    const restoreWide=()=>evaluate("(()=>{const svg=document.querySelector('svg[data-edge-mirror=true]');svg.querySelectorAll('feImage').forEach((e,i)=>e.setAttribute('href',window.mirrorMaps[i]));svg.querySelectorAll('feDisplacementMap').forEach((e,i)=>e.setAttribute('scale',window.mirrorScales[i]))})()");
    assert.equal(await evaluate("document.querySelectorAll('#liquid-nav-root feDisplacementMap').length"),14);
    assert.equal(await evaluate("document.querySelectorAll('#liquid-nav-root feImage').length"),14);
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root svg[data-edge-mirror=true]')?.dataset.opticalMode"),'vertical-compressed-fold');
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root svg[data-edge-mirror=true]')?.dataset.depthEffect"),'false');
    assert.equal(await evaluate("document.querySelector('.glass-selection svg')?.dataset.edgeMirror"),'false');
    assert.equal(await evaluate("document.querySelector('.glass-selection svg')?.dataset.depthEffect"),'true');
    await evaluate(`(()=>{
      const root=document.querySelector('#liquid-nav-root');
      window.mirrorMaps=[...root.querySelector('svg[data-edge-mirror=true]').querySelectorAll('feImage')].map(e=>e.getAttribute('href'));
      window.mirrorScales=[...root.querySelector('svg[data-edge-mirror=true]').querySelectorAll('feDisplacementMap')].map(e=>e.getAttribute('scale'));
      const bg=document.createElement('div');bg.id='mirror-test-background';
      bg.style.cssText='position:absolute;inset:0;background:white;pointer-events:none;overflow:hidden';
      bg.innerHTML='<svg width="100%" height="56" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="test-ramp" x1="0" y1="0" x2="0" y2="1"><stop stop-color="black"/><stop offset="1" stop-color="white"/></linearGradient></defs><rect width="100%" height="56" fill="url(#test-ramp)"/></svg>';
      root.prepend(bg);
      root.querySelectorAll('.glass-edge,.glass-selection,.nav-item').forEach(e=>e.style.visibility='hidden');
      const surface=root.querySelector('.glass-surface');surface.style.background='transparent';surface.style.boxShadow='none';
    })()`);
    const shot=async name=>{
      await sleep(80);
      const {data}=await send('Page.captureScreenshot',{format:'png',clip:{...geometry,scale:1}});
      fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data,'base64'));return data;
    };
    const joinError=data=>evaluate('('+(async function(data,fold){
      const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
      const p=ctx.getImageData(0,0,c.width,c.height).data;let error=0,n=0;
      // Compression should vanish at the join, not across the whole outer face.
      for(let d=0;d<1;d++)for(let x=35;x<c.width-35;x++)for(let k=0;k<3;k++){
        error+=Math.abs(p[((fold-1-d)*c.width+x)*4+k]-p[((fold+d)*c.width+x)*4+k]);n++;
      }return error/n;
    }).toString()+')('+JSON.stringify(data)+','+fold+')');
    const gradient=await shot('ramp');
    const readRamp=data=>evaluate('('+(async function(data){
      const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
      const a=ctx.getImageData(0,0,c.width,c.height).data;
      return Array.from({length:12},(_,y)=>a[(y*c.width+Math.floor(c.width/2))*4]);
    }).toString()+')('+JSON.stringify(data)+')');
    const rampProfile=await readRamp(gradient);
    await applyOld();const oldRampProfile=await readRamp(await shot('ramp-narrow'));await restoreWide();
    const turn=row=>row.indexOf(Math.min(...row));
    assert.equal(fold,7,'requested 7px fold');
    assert.ok(Math.abs(turn(rampProfile)-(fold-1))<=1,'join follows the 7px fold');
    assert.ok(rampProfile[0]>rampProfile[1]&&rampProfile[1]>rampProfile[2]&&rampProfile[10]<rampProfile[11],'visible reversed sampling followed by upright center: '+rampProfile);
    for(let i=1;i<fold-1;i++) assert.ok(rampProfile[i-1]-rampProfile[i]>=3,'no stretched sampling plateau');
    // Average several rows: one-pixel quantization can make two local steps
    // equal despite different continuous slopes.
    const edgeSlope=(rampProfile[0]-rampProfile[3])/3;
    const joinSlope=(rampProfile[fold-3]-rampProfile[fold-1])/2;
    assert.ok(edgeSlope>joinSlope,'edge is more compressed than the join: '+JSON.stringify(rampProfile));
    // Extrapolate both faces to the shared boundary; scale tends to 1:1 there.
    const reflectedJoin=rampProfile[fold-1]+.5*(rampProfile[fold-1]-rampProfile[fold-2]);
    const originalJoin=rampProfile[fold]-.5*(rampProfile[fold+1]-rampProfile[fold]);
    // Each captured ramp row is quantized to a source pixel; unequal slopes
    // make extrapolation inexact. Allow one source-row grey step, not a gap.
    assert.ok(Math.abs(reflectedJoin-originalJoin)<=255/h,'both faces meet within one raster source pixel: '+JSON.stringify({rampProfile,reflectedJoin,originalJoin}));
    await evaluate(`(()=>{
      document.querySelector('#mirror-test-background').innerHTML='<svg width="100%" height="56" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="56" fill="#f5f8fb"/><g fill="#344456" font-family="sans-serif" font-size="12"><text x="30" y="11">镜像折射 ABCDEFG 课程表</text><text x="30" y="32">中心文字 · 保持通透清晰</text><text x="30" y="54">课程时间 08:30–10:10</text></g></svg>';
    })()`);
    const after=await shot('mirror');
    const textAdjacentRowDifference=await joinError(after);
    assert.ok(textAdjacentRowDifference<2.5,'text meets naturally at join');
    await applyOld();
    const before=await shot('original');
    const delta=await evaluate('('+(async function(a,b){
      const read=async s=>{const i=new Image();i.src='data:image/png;base64,'+s;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const ctx=c.getContext('2d');ctx.drawImage(i,0,0);return {w:i.width,h:i.height,p:ctx.getImageData(0,0,i.width,i.height).data}};
      const x=await read(a),y=await read(b);
      const region=(y0,y1)=>{let n=0,sum=0;for(let row=y0;row<y1;row++)for(let col=35;col<x.w-35;col++)for(let k=0;k<3;k++){sum+=Math.abs(x.p[(row*x.w+col)*4+k]-y.p[(row*x.w+col)*4+k]);n++}return sum/n};
      return {edge:region(0,10),center:region(20,36)};
    }).toString()+')('+JSON.stringify(after)+','+JSON.stringify(before)+')');
    assert.ok(delta.edge>1,'edge must visibly differ');assert.ok(delta.center<1,'center must stay visually unchanged within map quantization');
    await restoreWide();
    // Move one PNG stripe through the same live background. Count only each
    // version's reversed branch, excluding the ordinary upright image below it.
    await evaluate(`(async()=>{
      const bg=document.querySelector('#mirror-test-background'),c=document.createElement('canvas');c.width=80;c.height=4;
      const ctx=c.getContext('2d');ctx.fillStyle='#ef1838';ctx.fillRect(0,0,80,4);
      const img=new Image();img.id='passing-png';img.src=c.toDataURL();img.style.cssText='position:absolute;left:calc(50% - 40px);top:0;width:80px;height:4px';await img.decode();bg.replaceChildren(img);
    })()`);
    const passing={old:[],current:[]};
    for(const version of ['old','current']) {
      if(version==='old') await applyOld();else await restoreWide();
      const band=version==='old'?oldFold:fold;
      for(let position=0;position<=20;position++) {
        await evaluate("document.querySelector('#passing-png').style.transform='translateY("+position+"px)'");
        const data=await shot('passing-'+version+'-'+position);
        const signal=await evaluate('('+(async function(data,band){
          const img=new Image();img.src='data:image/png;base64,'+data;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
          const p=ctx.getImageData(0,0,c.width,c.height).data;let max=0,reflectedWidth=0,originalWidth=0;const reflected=[],original=[];
          for(let y=0;y<c.height;y++){
            let signal=0;for(let x=Math.floor(c.width/2)-4;x<Math.floor(c.width/2)+4;x++){const i=(y*c.width+x)*4;signal=Math.max(signal,p[i]-p[i+1])}
            if(y<Math.floor(band))max=Math.max(max,signal);
            if(signal>60){
              (y<Math.floor(band)?reflected:original).push(y+.5);
              let width=0;for(let x=35;x<c.width-35;x++){const i=(y*c.width+x)*4;if(p[i]-p[i+1]>60)width++}
              if(y<Math.floor(band))reflectedWidth=Math.max(reflectedWidth,width);else originalWidth=Math.max(originalWidth,width);
            }
          }return {signal:max,reflected,original,reflectedWidth,originalWidth};
        }).toString()+')('+JSON.stringify(data)+','+band+')');
        passing[version].push({position,...signal});
      }
    }
    const visible=frames=>frames.filter(f=>f.signal>60).map(f=>f.position),beforePositions=visible(passing.old),afterPositions=visible(passing.current);
    // The new curve reaches ~18.1px: a stripe starting at 14px is fully
    // inside its source range; farther stripes are intentionally clipped.
    const near=passing.current.find(f=>f.position===7),outer=passing.current.find(f=>f.position===14);
    assert.ok(near.reflected.length>=3,'near-join reflection stays full');
    assert.ok(outer.reflected.length<near.reflected.length,'image unfolds vertically as it approaches the join: '+JSON.stringify({near,outer}));
    for(const frame of passing.current.filter(f=>f.position>=7&&f.position<=14)){
      assert.equal(frame.original.length,4,'original image height is unchanged');
      assert.ok(frame.reflected.length>=1&&frame.reflected.length<=4,'4px stripe unfolds without stretching beyond original height: '+JSON.stringify(frame));
      assert.ok(Math.abs(frame.reflectedWidth-frame.originalWidth)<=2,'image width must not compress: '+JSON.stringify(frame));
    }
    // Use a real PNG <img>, not SVG text or CSS gradients. R encodes vertical
    // coordinates, G encodes distance from the end caps, B carries a texture.
    await evaluate(`(async()=>{
      document.querySelector('svg[data-edge-mirror=true]').querySelectorAll('feImage').forEach((e,i)=>e.setAttribute('href',window.mirrorMaps[i]));
      const bg=document.querySelector('#mirror-test-background'),c=document.createElement('canvas');
      c.width=${w};c.height=${h};const ctx=c.getContext('2d'),data=ctx.createImageData(c.width,c.height);
      for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){
        const i=(y*c.width+x)*4;
        // Keep channels away from clipping under the real saturate(1.5) pass.
        data.data[i]=80+100*y/(c.height-1);
        data.data[i+1]=70+50*Math.min(1,Math.min(x,c.width-1-x)/24);
        data.data[i+2]=110+10*Math.sin(x*.2)*Math.cos(y*.2);data.data[i+3]=255;
      }
      ctx.putImageData(data,0,0);const img=new Image();img.id='mirror-png-fixture';img.src=c.toDataURL('image/png');
      img.style.cssText='display:block;width:100%;height:100%';await img.decode();bg.replaceChildren(img);
      window.mirrorSurfaceFilter=document.querySelector('#liquid-nav-root .glass-surface').style.backdropFilter;
    })()`);
    const imageAfter=await shot('image-coordinates-mirror');
    await evaluate("document.querySelector('#liquid-nav-root .glass-surface').style.backdropFilter=window.mirrorSurfaceFilter.replace(/url\\([^)]*\\)/g,'')");
    const imageBefore=await shot('image-coordinates-plain');
    const imageResult=await evaluate('('+(async function(a,b){
      const read=async s=>{const img=new Image();img.src='data:image/png;base64,'+s;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);return {w:c.width,h:c.height,p:ctx.getImageData(0,0,c.width,c.height).data}};
      const mirrored=await read(a),plain=await read(b);
      const profiles=s=>{
        const pixel=(x,y,k)=>s.p[(y*s.w+x)*4+k],cx=Math.floor(s.w/2),cy=Math.floor(s.h/2);
        return {top:Array.from({length:10},(_,n)=>pixel(cx,n,0)),bottom:Array.from({length:10},(_,n)=>pixel(cx,s.h-1-n,0)),left:Array.from({length:10},(_,n)=>pixel(n,cy,1)),right:Array.from({length:10},(_,n)=>pixel(s.w-1-n,cy,1))};
      };
      let sum=0,n=0;for(let y=20;y<36;y++)for(let x=35;x<mirrored.w-35;x++)for(let k=0;k<3;k++){sum+=Math.abs(mirrored.p[(y*mirrored.w+x)*4+k]-plain.p[(y*mirrored.w+x)*4+k]);n++}
      return {mirrored:profiles(mirrored),plain:profiles(plain),centerDifference:sum/n};
    }).toString()+')('+JSON.stringify(imageAfter)+','+JSON.stringify(imageBefore)+')');
    for(const edge of ['top','bottom','left','right']) {
      const folded=imageResult.mirrored[edge],upright=imageResult.plain[edge];
      assert.ok((folded[2]-folded[0])*(upright[2]-upright[0])<0,'PNG sampling reverses at '+edge+': '+JSON.stringify(imageResult));
    }
    assert.ok(imageResult.centerDifference<1,'PNG center is not mirrored');
    await evaluate(`(async()=>{
      document.querySelector('#liquid-nav-root .glass-surface').style.backdropFilter=window.mirrorSurfaceFilter;
      const img=document.querySelector('#mirror-png-fixture'),c=document.createElement('canvas');c.width=${w};c.height=${h};
      const ctx=c.getContext('2d');ctx.fillStyle='#d3e9ed';ctx.fillRect(0,0,c.width,c.height);
      for(let x=-20;x<c.width;x+=36){ctx.fillStyle=x%72?'#537eaa':'#da9768';ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+26,0);ctx.lineTo(x+62,c.height);ctx.lineTo(x+36,c.height);ctx.fill()}
      ctx.fillStyle='#f7dea1';for(let x=20;x<c.width;x+=60){ctx.beginPath();ctx.arc(x,10,8,0,Math.PI*2);ctx.fill()}
      img.src=c.toDataURL('image/png');await img.decode();
    })()`);
    const texture=await shot('image-texture-mirror');
    const imageAdjacentRowDifference=await joinError(texture);
    assert.ok(imageAdjacentRowDifference<2.5,'image meets naturally at join');
    await applyOld();await shot('image-texture-narrow');await restoreWide();
    await evaluate("document.querySelector('#liquid-nav-root .glass-surface').style.backdropFilter=window.mirrorSurfaceFilter.replace(/url\\([^)]*\\)/g,'')");
    await shot('image-texture-plain');
    await evaluate("document.querySelector('#liquid-nav-root .glass-surface').style.backdropFilter=window.mirrorSurfaceFilter");
    await evaluate(`(()=>{
      const root=document.querySelector('#liquid-nav-root');
      root.querySelectorAll('.glass-edge,.glass-selection,.nav-item').forEach(e=>e.style.removeProperty('visibility'));
      root.querySelector('.glass-surface').style.removeProperty('background');root.querySelector('.glass-surface').style.removeProperty('box-shadow');
    })()`);
    await shot('image-navigation');
    // Video-guided temporal fixture: real PNG + upright text + blue pill
    // pass across the same live lens. Capture fractional-pixel motion, not
    // just a still image with content already placed inside the mirror band.
    await evaluate(`(async()=>{
      const bg=document.querySelector('#mirror-test-background');
      const png=document.querySelector('#mirror-png-fixture').src;
      bg.style.overflow='visible';
      bg.innerHTML='<div style="position:absolute;inset:-28px 0;background:#f6f8fa"></div><div id="video-rim-track" style="position:absolute;left:0;top:0;width:100%;height:56px;background:#fff;display:flex;align-items:center;gap:12px;padding:0 20px;box-sizing:border-box"><img src="'+png+'" style="width:40px;height:40px;border-radius:10px;object-fit:cover"/><div style="flex:1;font:12px sans-serif;color:#243349">课程图片 ABC<br/><span style="font-size:9px">文字与图片连续经过</span></div><div style="background:#2878f5;color:#fff;width:58px;height:24px;border-radius:12px;text-align:center;font:12px/24px sans-serif">打开</div></div>';
      await Promise.all([...bg.querySelectorAll('img')].map(img=>img.decode()));
      window.scrollMapEncodes=0;
      const encode=HTMLCanvasElement.prototype.toDataURL;
      window.startVideoEncodeCheck=()=>{HTMLCanvasElement.prototype.toDataURL=function(...args){window.scrollMapEncodes++;return encode.apply(this,args)}};
      window.stopVideoEncodeCheck=()=>{HTMLCanvasElement.prototype.toDataURL=encode};
    })()`);
    for(const version of ['old','current']){
      if(version==='old')await applyOld();else await restoreWide();
      await evaluate('window.startVideoEncodeCheck()');
      for(let frame=0;frame<65;frame++){
        await evaluate("document.querySelector('#video-rim-track').style.transform='translateY("+(-40+frame*.75)+"px)'");
        await sleep(20);
        const {data}=await send('Page.captureScreenshot',{format:'png',clip:{x:geometry.x,y:geometry.y-24,width:geometry.width,height:geometry.height+48,scale:2}});
        fs.writeFileSync(path.join(out,'motion-'+version+'-'+String(frame).padStart(3,'0')+'.png'),Buffer.from(data,'base64'));
      }
      await evaluate('window.stopVideoEncodeCheck()');
    }
    assert.equal(await evaluate('window.scrollMapEncodes'),0,'no map encoding during background motion');
    await evaluate(`(()=>{
      document.querySelector('svg[data-edge-mirror=true]').querySelectorAll('feImage').forEach((e,i)=>e.setAttribute('href',window.mirrorMaps[i]));
      document.querySelector('#mirror-test-background').remove();
      const root=document.querySelector('#liquid-nav-root');
      root.querySelectorAll('.glass-edge,.glass-selection,.nav-item').forEach(e=>e.style.removeProperty('visibility'));
      root.querySelector('.glass-surface').style.removeProperty('background');root.querySelector('.glass-surface').style.removeProperty('box-shadow');
      window.mapEncodes=0;const original=HTMLCanvasElement.prototype.toDataURL;HTMLCanvasElement.prototype.toDataURL=function(...args){window.mapEncodes++;return original.apply(this,args)};
    })()`);
    await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:geometry.x+w*.5,y:geometry.y+28,id:1}]});
    await sleep(400);
    await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:geometry.x+w*.7,y:geometry.y+28,id:1}]});
    await send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await sleep(500);
    assert.equal(await evaluate('window.mapEncodes'),0,'no map encodes during gestures');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({fold,oldFold,rampProfile,oldRampProfile,reflectedJoin,originalJoin,textAdjacentRowDifference,imageAdjacentRowDifference,delta,passing,imageResult,motion:{frames:65,step:.75,scale:2,encodeCount:0},checks:['same 14 samples and 14 maps','outer samples aligned, selector refraction retained','compressed outer rim and 1.5px rounded turn','4px PNG unfolds, width unchanged','7px curved fold without alpha crossfade','PNG, text and blue button captured in fractional-pixel motion','zero scroll/gesture encodes'],errors},null,2));
    console.log(JSON.stringify({fold,rampProfile,reflectedJoin,originalJoin,delta,errors,out},null,2));
    await send('Browser.close',{},false);
  } finally {socket?.close();child.kill();server.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
