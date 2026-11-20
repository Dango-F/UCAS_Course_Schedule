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
    const pressedScale=26,restingScale=pressedScale/2;
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
      const region=(y0,y1,x0=.4,x1=.6)=>{
        let sum=0,n=0;
        for(let row=Math.ceil(x.h*y0);row<Math.floor(x.h*y1);row++)
          for(let col=Math.ceil(x.w*x0);col<Math.floor(x.w*x1);col++)
            for(let k=0;k<3;k++){sum+=Math.abs(x.p[(row*x.w+col)*4+k]-y.p[(row*x.w+col)*4+k]);n++}
        return sum/n;
      };
      return {center:region(.35,.65),edge:(region(.3,.7,.02,.14)+region(.3,.7,.86,.98))/2,mean:region(0,1,0,1)};
    }).toString()+')('+JSON.stringify(a)+','+JSON.stringify(b)+')');
    await waitFor("Boolean(document.querySelector('#liquid-nav-root.is-hop filter'))");
    await evaluate(`(()=>{
      const root=document.querySelector('#liquid-nav-root');
      root.querySelectorAll('.glass-surface,.glass-edge,.glass-touch-light,.nav-item').forEach(e=>e.style.visibility='hidden');
      const fixture=document.createElement('div');fixture.id='selector-optical-fixture';
      fixture.style.cssText='position:absolute;inset:0;z-index:19;pointer-events:none;background:repeating-linear-gradient(55deg,#f4c463 0 3px,#3479ae 3px 6px)';
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
      assert.equal(Number(geometry.scale),pressedScale);
      const a=await shot(width+'-'+dpr+'-lens',geometry.clip);
      await evaluate("document.querySelectorAll('.glass-selection feDisplacementMap').forEach(node=>node.setAttribute('scale','0'))");
      await sleep(100);
      const b=await shot(width+'-'+dpr+'-zero',geometry.clip);
      const diff=await compare(a,b);
      console.log(JSON.stringify({geometry:{...geometry,map:undefined},diff}));
      assert.ok(diff.edge>1.5,'selector edge really refracts live background: '+JSON.stringify(diff));
      // Restrict the center comparison to the original, unfiltered pixels.
      assert.ok(diff.center<6&&diff.center<diff.edge*.2,'selector interior stays clear: '+JSON.stringify(diff));
      assert.equal(await evaluate('window.encodedMaps'),encodes,'hold does not re-encode map');
      assert.equal(await evaluate("document.querySelector('.glass-selection feImage').getAttribute('href')"),geometry.map);
      await touch('touchCancel');await sleep(450);
      const resting=await evaluate("(()=>{const s=document.querySelector('.glass-selection');return{mode:s.dataset.glassRenderer,filter:getComputedStyle(s.firstElementChild).backdropFilter,scale:Number(s.querySelector('feDisplacementMap').getAttribute('scale'))}})()");
      assert.equal(resting.mode,'svg-refraction');
      assert.match(resting.filter,/url\(/);
      assert.equal(resting.scale,restingScale,'resting selector retains a weaker rim');
      assert.equal(await evaluate('window.encodedMaps'),encodes,'release reuses cached map');
      results.push({width,dpr,diff,resting});
    }
    // Freeze a mid-crossing frame on a flat backdrop. With a real glyph
    // under the rim, changing only its SVG scale must alter the glyph pixels.
    const iconFrame=await evaluate(`(()=>{
      const root=document.querySelector('#liquid-nav-root'),s=root.querySelector('.glass-selection');
      root.querySelectorAll('.nav-item').forEach(item=>item.style.removeProperty('visibility'));
      document.querySelector('#selector-optical-fixture').style.background='#fff';
      const item=root.querySelector('[data-nav-index="1"]'),r=item.querySelector('.app-icon').getBoundingClientRect();
      const face=s.firstElementChild.getBoundingClientRect();
      const current=new DOMMatrix(getComputedStyle(s).transform).m41;
      const center=r.left+r.width/2;
      const transform=s.style.transform;
      s.style.transform='translate3d('+(current+center+2-face.right)+'px,0,0)';
      return {clip:{x:r.x,y:r.y,width:r.width,height:r.height},transform,
        centeredTransform:'translate3d('+(current+center-face.left-face.width/2)+'px,0,0)'};
    })()`);
    const iconLens=await shot('glyph-crossing-lens',iconFrame.clip);
    if (process.argv.includes('--edge-sweep')) {
      // Render the same physical positions at native and 4x resolution. Use an
      // integer CSS crop so all four reference pixels align to one output pixel.
      const crop={x:Math.floor(iconFrame.clip.x),y:Math.floor(iconFrame.clip.y),width:27,height:27};
      const frames=[];
      for(const dpr of [1,2,4]) {
        await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:dpr,mobile:true});
        await sleep(300);
        const sweep=[];
        for(const inset of [-4,-2,0,2,4]) {
          await evaluate(`(()=>{
            const s=document.querySelector('#liquid-nav-root .glass-selection'),face=s.firstElementChild;
            const icon=document.querySelector('#liquid-nav-root [data-nav-index="1"] .app-icon').getBoundingClientRect();
            const x=new DOMMatrix(getComputedStyle(s).transform).m41;
            s.style.transform='translate3d('+(x+icon.left+icon.width/2+${inset}-face.getBoundingClientRect().right)+'px,0,0)';
            s.querySelectorAll('feDisplacementMap').forEach(node=>node.setAttribute('scale','26'));
          })()`);
          sweep.push(await shot('sweep-'+dpr+'-'+inset,crop));
        }
        frames.push(sweep);
      }
      const errorsByDpr=await evaluate('('+ (async function(frames){
        const decode=async source=>{
          const image=new Image();image.src='data:image/png;base64,'+source;await image.decode();
          const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
          const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
          return ctx.getImageData(0,0,image.width,image.height);
        };
        const results=[];
        for(const [row,dpr] of [1,2].entries()){
          let error=0,n=0;
          for(let i=0;i<frames[row].length;i++){
            const low=await decode(frames[row][i]),high=await decode(frames[2][i]);
            const ratio=high.width/low.width;
            if(ratio!==4/dpr) throw new Error('Unaligned reference');
            for(let y=0;y<low.height;y++)for(let x=0;x<low.width;x++)for(let c=0;c<3;c++){
              let sum=0;
              for(let sy=0;sy<ratio;sy++)for(let sx=0;sx<ratio;sx++)
                sum+=high.data[4*((y*ratio+sy)*high.width+x*ratio+sx)+c];
              error+=Math.abs(low.data[4*(y*low.width+x)+c]-sum/(ratio*ratio));n++;
            }
          }
          results.push(error/n);
        }
        return results;
      }).toString()+')('+JSON.stringify(frames)+')');
      console.log(JSON.stringify({errorsByDpr,errors}));
      assert.deepEqual(errors,[]);
      await send('Browser.close',{},false);return;
    }
    const lensNodes = '#liquid-nav-root .glass-selection feDisplacementMap';
    assert.equal(await evaluate("document.querySelectorAll('#liquid-nav-root feGaussianBlur').length"),0);
    const sampleInputs=await evaluate(`(() => {
      const nodes=[...document.querySelectorAll('${lensNodes}')];
      const inputs=nodes.map(node=>node.getAttribute('in2'));
      nodes.forEach(node=>node.setAttribute('in2',inputs[3]));
      return inputs;
    })()`);
    assert.equal(sampleInputs.length,7,'the selector uses the complete spectral graph');
    const monochrome=await shot('glyph-crossing-no-dispersion',iconFrame.clip);
    const dispersionDiff=await compare(iconLens,monochrome);
    assert.ok(dispersionDiff.mean>.05,'dispersion reaches the actual glyph: '+JSON.stringify(dispersionDiff));
    await evaluate(`document.querySelectorAll('${lensNodes}').forEach((node,index)=>node.setAttribute('in2',${JSON.stringify(sampleInputs)}[index]))`);
    await evaluate("document.querySelectorAll('#liquid-nav-root .glass-selection feDisplacementMap').forEach(node=>node.setAttribute('scale','0'))");
    const iconZero=await shot('glyph-crossing-zero',iconFrame.clip);
    const iconDiff=await compare(iconLens,iconZero);
    assert.ok(iconDiff.mean>.25,'selector refracts actual navigation glyphs: '+JSON.stringify(iconDiff));
    await evaluate(`(()=>{
      const s=document.querySelector('#liquid-nav-root .glass-selection');
      s.style.transform=${JSON.stringify(iconFrame.centeredTransform)};
      s.querySelectorAll('feDisplacementMap').forEach(node=>node.setAttribute('scale','${pressedScale}'));
    })()`);
    const centeredLens=await shot('glyph-centered-lens',iconFrame.clip);
    await evaluate("document.querySelectorAll('#liquid-nav-root .glass-selection feDisplacementMap').forEach(node=>node.setAttribute('scale','0'))");
    const centeredZero=await shot('glyph-centered-zero',iconFrame.clip);
    const centeredDiff=await compare(centeredLens,centeredZero);
    assert.ok(centeredDiff.center<3 && centeredDiff.mean<1,'the centered glyph stays clear including its top stroke: '+JSON.stringify(centeredDiff));
    await evaluate(`(()=>{
      const s=document.querySelector('#liquid-nav-root .glass-selection');
      s.style.transform=${JSON.stringify(iconFrame.transform)};
      s.querySelectorAll('feDisplacementMap').forEach(node=>node.setAttribute('scale','${restingScale}'));
      document.querySelector('#selector-optical-fixture').remove();
    })()`);
    // Accessibility disables both lenses, not only the original outer lens.
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
    await waitFor("document.querySelector('.glass-selection').dataset.glassRenderer==='opaque'");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.glass-selection').firstElementChild).backdropFilter"),'none');
    assert.equal(await evaluate("document.querySelector('.glass-selection').dataset.glassRenderer"),'opaque');
    await send('Emulation.setEmulatedMedia',{features:[]});
    // Force the existing engine gate closed in a fresh document to test fallback.
    await send('Emulation.setUserAgentOverride',{userAgent:'Mozilla/5.0 AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'});
    await send('Page.reload');await sleep(500);
    await waitFor("document.querySelector('#liquid-nav-root')?.dataset.glassRenderer==='blur-fallback'");
    const fallbackFilter=await evaluate("getComputedStyle(document.querySelector('#liquid-nav-root .glass-surface')).backdropFilter");
    assert.match(fallbackFilter,/blur\(0\.71px\)/);
    assert.doesNotMatch(fallbackFilter,/url\(/);
    const fallbackPoint=await evaluate("(()=>{const r=document.querySelector('.glass-bar').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await touch('touchStart',fallbackPoint.x,fallbackPoint.y);await sleep(450);
    assert.ok(!(await evaluate("getComputedStyle(document.querySelector('.glass-selection').firstElementChild).backdropFilter")).includes('url('));
    await touch('touchCancel');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({results,iconDiff,dispersionDiff,centeredDiff,errors},null,2));
    console.log(JSON.stringify({results,iconDiff,dispersionDiff,centeredDiff,errors,out},null,2));
    await send('Browser.close',{},false);
  } finally {socket?.close();child.kill();server.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
