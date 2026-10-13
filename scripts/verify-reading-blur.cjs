// Built-in Node/CDP smoke test; no extra browser package is required.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const dist = path.resolve('dist/build/h5');
const out = path.resolve('.artifacts/reading-blur');
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




    const { buildSync } = require('esbuild');
    const result=buildSync({entryPoints:['src/import/ucas.ts'],bundle:true,write:false,platform:'node',format:'cjs'});
    const mod={exports:{}};
    new Function('module','exports','require',result.outputFiles[0].text)(mod,mod.exports,require);
    const {createUcasProgressBlurScript:blur,createUcasProgressBlurHideScript:unblur,createUcasProgressOverlayScript:overlay,createUcasProgressOverlayHideScript:hide}=mod.exports;
    const progress={value:48,phase:'personal',label:'正在读取个人课表安排'};
    await send('Page.navigate',{url:'about:blank'});
    const {frameTree}=await send('Page.getFrameTree');
    await send('Page.setDocumentContent',{frameId:frameTree.frame.id,html:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#fff;color:#27374a;font:16px Arial}header{padding:24px;background:#175ca2;color:white}h2{padding:0 16px}table{width:100%;border-collapse:collapse}td,th{padding:18px 6px;border:1px solid #ced8e2;font-size:14px}th{background:#deedf9}tr:nth-child(even){background:#eaf3fb}</style></head><body><header>教务网站 · 本地模拟测试</header><h2>个人课表</h2><table><tr><th>课程</th><th>时间</th><th>教室</th></tr>${Array.from({length:12},(_,i)=>'<tr><td>课程示例 '+(i+1)+'</td><td>08:30–11:10</td><td>教一楼 208</td></tr>').join('')}</table></body></html>`});
    const shot=async name=>{const {data}=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data,'base64'))};
    await shot('website-before');
    const websitePixels=(await send('Page.captureScreenshot',{format:'png'})).data;
    await evaluate(blur());await evaluate(overlay(progress));await sleep(400);
    const read=()=>evaluate("(()=>{const v=document.querySelector('#__lakeside_progress_blur_v1__'),r=document.querySelector('#__lakeside_progress_overlay_v2__'),stage=r.querySelector('.lc-stage');return {blur:getComputedStyle(v).backdropFilter,stageFilter:getComputedStyle(stage).filter,stageBackdrop:getComputedStyle(stage).backdropFilter,veilDisplay:getComputedStyle(r.querySelector('.lc-veil')).display,above:Number(getComputedStyle(r).zIndex)>Number(getComputedStyle(v).zIndex),dots:r.querySelectorAll('.lc-dot').length,rows:document.querySelectorAll('tr').length}})()");
    const state=await read();
    assert.match(state.blur,/blur\(1.2px\)/);assert.equal(state.stageFilter,'none');assert.equal(state.stageBackdrop,'none');assert.equal(state.veilDisplay,'none');assert.equal(state.above,true);assert.equal(state.dots,18);assert.equal(state.rows,13);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#__lakeside_progress_blur_v1__')).backgroundColor"),'rgba(225, 237, 246, 0.02)');
    await shot('reading-fallback');
    await evaluate(blur());await evaluate(overlay(progress));
    assert.equal(await evaluate("document.querySelectorAll('#__lakeside_progress_blur_v1__').length"),1);
    await evaluate(overlay({...progress,value:100,phase:'complete',label:'课表读取完成'}));await sleep(1150);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.lc-check')).transitionDelay"),'0.9s');
    await shot('reading-complete');
    await evaluate(hide());await evaluate(unblur());await sleep(400);
    assert.equal(await evaluate("Boolean(document.querySelector('#__lakeside_progress_blur_v1__'))"),false);
    await shot('website-restored');
    checks.push('one light 1.2px website-local Gaussian backdrop with 2% tint, sharp 18-dot animation, unchanged .9s check delay, finish/cancel restores website');
    // Separate document models the native indicator sibling's rendering boundary.
    await evaluate(blur());
    const nativeHtml=fs.readFileSync('src/static/ucas-progress-overlay.html','utf8');
    await evaluate("(()=>{const f=document.createElement('iframe');f.id='indicator-frame';f.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483647;background:transparent';f.srcdoc="+JSON.stringify(nativeHtml)+";document.documentElement.appendChild(f)})()");
    await waitFor("Boolean(document.querySelector('#indicator-frame').contentDocument.querySelector('#__lakeside_progress_native_veil__'))");
    await evaluate("document.querySelector('#indicator-frame').contentWindow.eval("+JSON.stringify(overlay(progress))+")");await sleep(400);
    assert.equal(await evaluate("(()=>{const w=document.querySelector('#indicator-frame').contentWindow;return w.getComputedStyle(w.document.querySelector('.lc-veil')).display})()"),'none');
    assert.match(await evaluate("getComputedStyle(document.querySelector('#__lakeside_progress_blur_v1__')).backdropFilter"),/blur\(1.2px\)/);
    await shot('reading-separate-document');
    await evaluate("document.querySelector('#indicator-frame').remove()");
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#__lakeside_progress_blur_v1__')).backdropFilter"),'none');
    await evaluate(unblur());
    checks.push('separate-document indicator stays sharp, website owns blur; reduced-transparency fallback and cleanup verified');
    await send('Emulation.setEmulatedMedia',{features:[]});
    const startup=await send('Page.addScriptToEvaluateOnNewDocument',{source:blur()+`;window.blurFrameChecks=[];function sampleBlur(){var v=document.getElementById('__lakeside_progress_blur_v1__');window.blurFrameChecks.push(Boolean(v)&&getComputedStyle(v).backdropFilter!=='none');if(window.blurFrameChecks.length<30)requestAnimationFrame(sampleBlur);}requestAnimationFrame(sampleBlur);`});
    for(let i=0;i<3;i++){
      await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?refresh-blur=${i}`});
      await waitFor('window.blurFrameChecks?.length===30');
      assert.equal(await evaluate('window.blurFrameChecks.every(Boolean)'),true,'every sampled frame from document start stays blurred');
    }
    await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:startup.identifier});
    await evaluate(unblur());
    await evaluate("document.body.appendChild(document.createElement('span'))");await sleep(100);
    assert.equal(await evaluate("Boolean(document.querySelector('#__lakeside_progress_blur_v1__'))"),false,'observer does not resurrect blur after cancel');
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?refresh-blur=finished`});
    await waitFor("Boolean(document.querySelector('.week-select'))");
    assert.equal(await evaluate("Boolean(document.querySelector('#__lakeside_progress_blur_v1__'))"),false);
    checks.push('three real document navigations: blur present from first sampled frame; removal prevents reappearing after cancel or reload');
    // Regression for the real failure: the school renderer has NO native blur,
    // NO document-start injection, and repeatedly creates clear new documents.
    // The persistent sibling must cover it using a decoded website snapshot.
    await send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/?backdrop-regression`});
    await waitFor("Boolean(document.querySelector('.week-select'))");
    const shell=await send('Page.getFrameTree');
    await send('Page.setDocumentContent',{frameId:shell.frameTree.frame.id,html:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"></body>'});
    await evaluate("(()=>{window.surfaceAcks={};const site=document.createElement('iframe');site.id='school-frame';site.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0';site.srcdoc='<body style=\"background:white;color:black;font-size:40px\">CLEAR WEBSITE</body>';document.body.appendChild(site);const layer=document.createElement('iframe');layer.id='persistent-layer';layer.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;z-index:999;background:transparent';layer.src='/static/ucas-progress-overlay.html';document.body.appendChild(layer)})()");
    // Load the actual built HTML and relative asset, not a hand-injected helper.
    await waitFor("Boolean(document.querySelector('#persistent-layer').contentWindow.__lakesideReadingBackdrop)");
    const backdropSource=fs.readFileSync('src/static/ucas-reading-backdrop.js','utf8');
    const surfaceSet="window.__lakesideReadingBackdrop.set("+JSON.stringify('data:image/png;base64,'+websitePixels)+",'regression',1.2,.02,true)";
    await evaluate("(()=>{const w=document.querySelector('#persistent-layer').contentWindow;w.eval("+JSON.stringify(overlay(progress))+");w.eval("+JSON.stringify(surfaceSet)+")})()");
    await waitFor("Boolean(document.querySelector('#persistent-layer').contentDocument.querySelector('#__lakeside_reading_backdrop__ img')?.naturalWidth)");
    // Image display must work even before the native bridge/ACK is available.
    await sleep(100);
    assert.equal(await evaluate("Object.keys(window.surfaceAcks).length"),0);
    await evaluate("(()=>{const w=document.querySelector('#persistent-layer').contentWindow;w.previousPicture=w.document.querySelector('#__lakeside_reading_backdrop__ img');w.eval("+JSON.stringify(backdropSource+'\n;'+surfaceSet)+");w.plus={storage:{setItem:()=>{throw Error('bridge not ready')}}};w.document.dispatchEvent(new Event('plusready'));})()");
    assert.equal(await evaluate("(()=>{const w=document.querySelector('#persistent-layer').contentWindow;return w.previousPicture===w.document.querySelector('#__lakeside_reading_backdrop__ img')})()"),true);
    await evaluate("(()=>{const w=document.querySelector('#persistent-layer').contentWindow;w.plus={storage:{setItem:(k,v)=>window.surfaceAcks[k]=v}};w.document.dispatchEvent(new Event('plusready'))})()");
    await waitFor("window.surfaceAcks['__lakeside_backdrop_ready__:regression']==='ready'");
    const crop=()=>send('Page.captureScreenshot',{format:'png',clip:{x:0,y:0,width:110,height:120,scale:1}});
    const beforeRefresh=(await crop()).data;
    for(let i=0;i<3;i++){
      await evaluate("document.querySelector('#school-frame').srcdoc="+JSON.stringify('<body style="background:'+['red','blue','white'][i]+';font-size:40px">UNBLURRED RELOAD '+i+'</body>'));
      await sleep(100);
      assert.equal((await crop()).data,beforeRefresh,'persistent blurred pixels unchanged while clear website reloads underneath');
    }
    await shot('persistent-reading-refresh');
    assert.equal(await evaluate("document.querySelector('#persistent-layer').contentWindow.getComputedStyle(document.querySelector('#persistent-layer').contentDocument.querySelector('.lc-stage')).filter"),'none');
    await evaluate("document.querySelector('#persistent-layer').contentWindow.__lakesideReadingBackdrop.clear()");
    assert.equal(await evaluate("Boolean(document.querySelector('#persistent-layer').contentDocument.querySelector('#__lakeside_reading_backdrop__'))"),false);
    checks.push('persistent sibling screenshot pixels unchanged across three UNBLURRED website reloads; painted acknowledgement and cleanup verified; indicator stays sharp');
    // Model the manager's loaded-event replay after the local overlay reloads.
    await evaluate("(()=>{const f=document.querySelector('#persistent-layer');f.reloaded=false;f.onload=()=>f.reloaded=true;f.contentWindow.location.reload()})()");
    await waitFor("document.querySelector('#persistent-layer').reloaded && Boolean(document.querySelector('#persistent-layer').contentWindow.__lakesideReadingBackdrop)");
    await evaluate("document.querySelector('#persistent-layer').contentWindow.eval("+JSON.stringify(backdropSource+'\n;'+surfaceSet.replace(/,true\)$/,',false)'))+")");
    await waitFor("Boolean(document.querySelector('#persistent-layer').contentDocument.querySelector('#__lakeside_reading_backdrop__ img')?.naturalWidth)");
    assert.equal((await crop()).data,beforeRefresh,'reloaded overlay restores the same image without recapturing the changed website');
    // A retry already queued before timeout must not re-enable token writes.
    await evaluate("document.querySelector('#persistent-layer').contentWindow.eval("+JSON.stringify(surfaceSet)+")");
    await evaluate("(()=>{delete window.surfaceAcks['__lakeside_backdrop_ready__:regression'];const w=document.querySelector('#persistent-layer').contentWindow;w.plus={storage:{setItem:(k,v)=>window.surfaceAcks[k]=v}};w.document.dispatchEvent(new Event('plusready'));w.__lakesideReadingBackdrop.clear()})()");
    await sleep(100);
    assert.equal(await evaluate("Object.keys(window.surfaceAcks).length"),0,'replaying after confirmation timeout creates no late storage token');
    checks.push('actual built overlay HTML bootstraps helper; no/throwing/delayed bridge does not remove image; duplicate bootstrap preserves image identity; local reload restores identical pixels without a late ACK');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,state,errors},null,2));
    console.log(JSON.stringify({checks,state,errors,out},null,2));
    await send('Browser.close',{},false);
  } finally {socket?.close();child.kill();server.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
