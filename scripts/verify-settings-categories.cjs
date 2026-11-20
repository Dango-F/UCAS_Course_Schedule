// Built-in Node/CDP smoke test; no extra browser package is required.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const dist = path.resolve(process.env.LAKESIDE_TEST_H5_DIR || 'dist/build/h5');
const out = path.resolve('.artifacts/settings-categories');
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
  const child = spawn(edge, ['--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-component-update', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
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
    const { targetInfos } = await send('Target.getTargets', {}, false);
    const { targetId } = targetInfos.find(target => target.type === 'page');
    ({ sessionId } = await send('Target.attachToTarget', { targetId, flatten: true }, false));
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.bringToFront');
    await send('Emulation.setFocusEmulationEnabled', { enabled:true });
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
    const tapPoint = selector => evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    const tap = async point => {
      await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y,id:1}]});
      await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    };
    const section = () => evaluate("document.querySelector('.settings-page')?.dataset.settingsSection");
    const assertNav = async (visible, inert = !visible) => {
      assert.equal(await evaluate("getComputedStyle(document.querySelector('#liquid-nav-root')).visibility"),visible?'visible':'hidden');
      assert.equal(await evaluate("document.querySelector('#liquid-nav-root').hasAttribute('inert')"),inert);
      assert.equal(await evaluate("document.querySelector('#liquid-nav-root .nav-item').tabIndex"),visible?0:-1);
      assert.equal(await evaluate("document.querySelector('#liquid-nav-root')===window.savedNav"),true,'same lens and anchor stay mounted');
    };
    const open = async name => {
      await click('[data-settings-entry="'+name+'"]');
      await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==="+JSON.stringify(name));
      await waitFor("getComputedStyle(document.querySelector('#liquid-nav-root')).visibility==='hidden'");
      await assertNav(false);
      await waitFor("document.querySelector('.settings-page')?.dataset.routePhase==='open'");
      const resting=await evaluate("(()=>{const e=document.querySelector('.settings-detail');return {active:e.getAnimations().filter(a=>a.playState==='running').length,x:new DOMMatrix(getComputedStyle(e).transform).m41}})()");
      assert.equal(resting.active,0,'the settled route has no running animation');
      assert.equal(resting.x,0,'the detail comes to rest at the viewport origin');
    };
    const back = async () => {await click('.settings-back');await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");assert.equal(await evaluate("Boolean(document.querySelector('.settings-detail'))"),false);await assertNav(true)};
    const shot = async name => {await sleep(650);const {data}=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data,'base64'))};
    await waitFor("Boolean(document.querySelector('#liquid-nav-root[data-glass-renderer]'))");
    await evaluate("window.savedNav=document.querySelector('#liquid-nav-root');true");
    if (process.argv.includes('--widgets-only')) {
      await click('[data-nav-index="2"]');
      await waitFor("Boolean(document.querySelector('#settings-entry-widgets'))");
      await open('appearance');
      const referenceTitleInset=await evaluate("document.querySelector('.detail-heading .settings-title').getBoundingClientRect().top-document.querySelector('.settings-detail .settings-content').getBoundingClientRect().top");
      await back();
      for (const width of [320,390,480]) {
        await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});
        await open('widgets');
        assert.equal(await evaluate("document.querySelectorAll('.widget-preview').length"),3);
        assert.equal(await evaluate("document.querySelector('[aria-label=\"宽松版课表样式示意\"]')!==null"),true,'large sample card is restored');
        assert.equal(await evaluate("document.querySelectorAll('.add-widget').length"),2);
        const help=await evaluate("(()=>{const b=document.querySelector('.widget-title-help'),i=b?.querySelector('.app-icon'),t=b?.previousElementSibling;const r=i?.getBoundingClientRect(),h=t?.getBoundingClientRect(),p=b?.closest('.settings-content').getBoundingClientRect(),c=document.querySelector('.widget-preview').getBoundingClientRect(),row=b?.parentElement.getBoundingClientRect();return {width:r?.width,height:r?.height,rightOfTitle:r?.left>=h?.right,titleGap:r?.left-h?.right,centerGap:r?.top+r?.height/2-h?.top-h?.height/2,spaceAbove:h?.top-p?.top,spaceBelow:c.top-h?.bottom,rowHeight:row?.height,titleHeight:h?.height,tapHeight:b?.getBoundingClientRect().height}})()");
        assert.equal(help.width,18,'help icon keeps its original width');
        assert.equal(help.height,18,'help icon keeps its original height');
        assert.equal(help.rightOfTitle,true,'manual help sits to the right of the page title');
        assert.ok(help.titleGap>=0 && help.titleGap<=8,'manual help sits immediately beside the title');
        assert.ok(Math.abs(help.centerGap)<1,'help icon vertically centers on the title');
        assert.ok(Math.abs(help.spaceAbove-referenceTitleInset)<1,'widget title matches other settings title spacing');
        assert.ok(Math.abs(help.rowHeight-help.titleHeight-5)<1,'title row retains only the standard title margin');
        assert.ok(help.tapHeight>=44,'help button keeps its tap target');
        const refresh=await evaluate("(()=>{const b=document.querySelector('.widget-title-refresh'),i=b.querySelector('.app-icon'),r=i.getBoundingClientRect(),p=b.closest('.detail-title-row').getBoundingClientRect();return{rightGap:p.right-r.right,tapWidth:b.getBoundingClientRect().width,tapHeight:b.getBoundingClientRect().height,icons:b.querySelectorAll('.app-icon').length,label:b.getAttribute('aria-label')}})()");
        assert.ok(Math.abs(refresh.rightGap)<1,'resync icon aligns to right edge of title row');
        assert.ok(refresh.tapWidth>=44 && refresh.tapHeight>=44,'resync keeps a 44px tap target');
        assert.equal(refresh.icons,1);assert.equal(refresh.label,'重新同步课表');
        assert.equal(await evaluate("document.querySelectorAll('.four-line .single-course').length"),4,'two-row preview shows four courses');
        const spacingCeiling=await evaluate("(()=>{const p=document.querySelector('.four-line'),body=p.querySelector('.single-course-list');const frames=[180,260,400].map(height=>{p.style.height=height+'px';const rows=[...p.querySelectorAll('.single-course')].map(row=>row.getBoundingClientRect()),b=body.getBoundingClientRect();return{height,bodyHeight:b.height,gaps:rows.slice(1).map((r,i)=>r.top-rows[i].bottom)}});p.style.height='';return frames})()");
        assert.ok(spacingCeiling.every(frame=>frame.bodyHeight<=154.2),'two-row preview course region has a height ceiling');
        assert.ok(spacingCeiling[1].gaps.every((gap,i)=>Math.abs(gap-spacingCeiling[2].gaps[i])<.2),'stretching above the ceiling leaves course gaps unchanged');
        assert.match(await evaluate("document.querySelector('.single-line:not(.four-line) .single-calendar').textContent"),/10\/12 周一.*第6周/);
        assert.match(await evaluate("document.querySelector('.single-line:not(.four-line) .single-actions').textContent"),/余3堂/);
        const compact = await evaluate("(()=>{const q=s=>document.querySelector('.single-line:not(.four-line) '+s),r=s=>q(s).getBoundingClientRect(),a=r('.single-course'),b=r('.single-course.second');return{courses:document.querySelectorAll('.single-line:not(.four-line) .single-course').length,header:q('.single-topline').textContent,first:q('.single-course').textContent,second:q('.single-course.second').textContent,gap:b.top-a.bottom,headerBottom:r('.single-topline').bottom,firstTop:a.top,name:getComputedStyle(q('.single-name')).fontSize,meta:getComputedStyle(q('.single-meta')).fontSize}})()");
        assert.equal(compact.courses,2,'one-row preview retains both course occurrences');
        assert.match(compact.header,/10\/12 周一.*第6周.*余3堂.*更新于08:00/,'header retains date, week, count and visible update time');
        assert.doesNotMatch(await evaluate("[...document.querySelectorAll('.single-topline')].map(header=>header.textContent).join(' ')"),/明日/,'compact headers no longer offer a tomorrow switch');
        assert.match(compact.first,/学术写作.*15:25–17:00 · 教二楼201 · 李志红/,'first course retains name, time, location and teacher');
        assert.match(compact.second,/明日.*机器学习.*18:30–21:00 · 教一楼207 · 周晓飞等/,'second course retains date and all course fields');
        assert.ok(compact.gap>=1.9 && compact.gap<=2.2,'two courses have a compact two-pixel gap');
        assert.ok(compact.firstTop>=compact.headerBottom,'course group clears header');
        assert.equal(compact.name,'12px');assert.equal(compact.meta,'10px');
        const hanzi=await evaluate("(()=>{const n=document.querySelector('.single-meta .meta-hanzi');return{size:parseFloat(getComputedStyle(n).fontSize),base:parseFloat(getComputedStyle(n.parentElement).fontSize)}})()");
        assert.ok(Math.abs(hanzi.size/hanzi.base-.94)<.002,'location and teacher Han text retain optical correction');
        const inset=await evaluate("(()=>{const p=document.querySelector('.single-line:not(.four-line)'),body=p.querySelector('.single-course-list'),header=p.querySelector('.single-topline'),row=p.querySelector('.single-course');return {shift:row.getBoundingClientRect().left-header.getBoundingClientRect().left,lampSize:getComputedStyle(row.querySelector('.status-light')).width}})()");
        assert.ok(Math.abs(inset.shift-6)<.2,'course region moves right without moving header');
        assert.equal(inset.lampSize,'5px','small widget preview lamps shrink');
        const lamps=await evaluate("(()=>{const nodes=[...document.querySelectorAll('.widget-preview .status-light')];return nodes.map(n=>({color:getComputedStyle(n).backgroundColor,animation:getComputedStyle(n).animationName,width:n.getBoundingClientRect().width}))})()");
        assert.ok(lamps.some(n=>n.color==='rgb(67, 168, 120)' && n.animation.includes('status-breathe')),'current lamp uses shared header breath');
        assert.ok(lamps.some(n=>n.color==='rgb(213, 170, 72)' && n.animation==='none'),'pending lamp is yellow');
        assert.doesNotMatch(await evaluate("document.querySelector('.single-course').textContent"),/进行中|已结束|下一节/);
        const alignment=await evaluate("(()=>{const dot=document.querySelector('.single-course .preview-status'),name=document.querySelector('.single-name'),d=dot.getBoundingClientRect(),n=name.getBoundingClientRect();return{offset:d.y+d.height/2-n.y-n.height/2,transform:getComputedStyle(dot).transform}})()");
        assert.ok(Math.abs(alignment.offset-1)<.3,'lamp gets a one-pixel downward optical adjustment without shifting the name');
        const leftAlignment=await evaluate("[...document.querySelectorAll('.widget-preview .single-course')].map(row=>{const lamp=row.querySelector('.status-light'),meta=row.querySelector('.single-meta');return lamp.getBoundingClientRect().left-meta.getBoundingClientRect().left})");
        assert.ok(leftAlignment.every(gap=>Math.abs(gap)<.5),'each lamp core aligns to the start of the course time');
        const nameGaps=await evaluate("[...document.querySelectorAll('.widget-preview .single-course')].map(row=>{const status=row.querySelector('.preview-status').getBoundingClientRect(),next=row.querySelector('.preview-status').nextElementSibling.getBoundingClientRect();return next.left-status.right})");
        assert.ok(nameGaps.every(gap=>Math.abs(gap-3)<.2),'lamp sits close to the course name or cross-day label');
        const dayCenters=await evaluate("[...document.querySelectorAll('.single-course-day')].map(day=>{const d=day.getBoundingClientRect(),n=day.parentElement.querySelector('.single-name').getBoundingClientRect();return d.top+d.height/2-n.top-n.height/2})");
        assert.ok(dayCenters.every(offset=>Math.abs(offset)<.2),'tomorrow labels vertically center on course names in both sizes');
        if (width === 390) {
          for (const [selector, name] of [['.detailed-preview','widget-detailed-preview'],['.single-line:not(.four-line)','widget-single-preview'],['.widget-preview.four-line','widget-double-preview']]) {
            await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center'});true`);
            await sleep(250);
            const clip = await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:2}})()`);
            const {data} = await send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true});
            fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data,'base64'));
          }
        }
        assert.equal(await evaluate("document.querySelector('.sync-card')===null"),true,'standalone synchronization card is removed');
        const layout=await evaluate("(()=>{const v=document.querySelector('.widget-settings'),r=v.getBoundingClientRect();return{width:r.width,scrollWidth:v.scrollWidth,buttons:[...v.querySelectorAll('.add-widget')].map(b=>b.getBoundingClientRect().height)}})()");
        assert.ok(layout.scrollWidth<=layout.width+1,'widget settings does not overflow at '+width);
        assert.ok(layout.buttons.every(height=>height>=44),'add buttons remain accessible');
        await click('.add-widget');
        assert.equal(await evaluate("document.querySelector('.widget-hint,.widget-help-actions,.widget-footnote')===null"),true,'redundant hints and standalone help actions are removed');
        await waitFor("Boolean(document.querySelector('.widget-toast'))");
        assert.match(await evaluate("document.querySelector('.widget-toast').textContent"),/安卓版/,'add failures are immediately visible');
        const toast=await evaluate("(()=>{const n=document.querySelector('.widget-toast'),r=n.getBoundingClientRect();return{height:r.height,y:r.y,bottom:r.bottom,viewport:innerHeight,events:getComputedStyle(n).pointerEvents,confirm:!!document.querySelector('.notice-confirm'),modal:!!document.querySelector('.widget-notice-backdrop')}})()");
        assert.ok(toast.height<85 && toast.y>toast.viewport*.7 && toast.bottom<toast.viewport,'small toast sits near bottom');
        assert.equal(toast.events,'none');assert.equal(toast.confirm,false);assert.equal(toast.modal,false);
        if(width===390) await shot('widget-add-toast');
        await waitFor("!document.querySelector('.widget-toast')");
        await click('.widget-title-refresh');
        await waitFor("Boolean(document.querySelector('.widget-toast'))");
        assert.match(await evaluate("document.querySelector('.widget-toast').textContent"),/安卓版/,'title refresh invokes synchronization and reports unavailable platform');
        await waitFor("!document.querySelector('.widget-toast')");
        await click('.widget-title-help');
        await waitFor("document.querySelector('.notice-title')?.textContent==='从桌面添加小组件'");
        assert.match(await evaluate("document.querySelector('.notice-copy').textContent"),/窗口小工具/);
        assert.doesNotMatch(await evaluate("document.querySelector('.notice-copy').textContent"),/经典小工具/);
        await click('.notice-dismiss');
        await waitFor("!document.querySelector('.widget-notice')");
        await evaluate("document.querySelectorAll('.settings-detail .settings-scroll .uni-scroll-view').forEach(n=>n.scrollTop=0);window.scrollTo(0,0);true");
        await sleep(200);
        await shot('widgets-'+width);
        await back();
      }
      assert.deepEqual(errors,[]);
      fs.writeFileSync(path.join(out,'widget-report.json'),JSON.stringify({widths:[320,390,480],referenceTitleInset,checks:['large sample restored; one-row/two-course and two-row/four-course previews retained','title spacing matches appearance settings','18px help icon vertically centered beside title','right-aligned title refresh invokes resync; standalone sync card removed','small nonblocking bottom toast automatically disappears without confirmation','manual guide remains available from help icon','shared header green breath and yellow status lamps without labels','Han glyph optical sizing and lamp center adjustment','one-row preview retains two stacked courses and a complete compact header','teacher summary follows location','44px add and refresh controls','no horizontal overflow','settings route and return'],errors},null,2));
      console.log('Widget settings browser checks passed at 320/390/480px. Screenshots: '+out);
      await send('Browser.close',{},false);
      return;
    }
    assert.equal(await evaluate("document.querySelector('.header-actions').children.length"),1);
    assert.equal(await evaluate("Boolean(document.querySelector('.header-actions .import-icon'))"),true);
    const navRect=()=>evaluate("(()=>{const r=document.querySelector('#liquid-nav-root').getBoundingClientRect();return [r.x,r.y,r.width,r.height]})()");
    const calendarNav=await navRect();
    // The actual scroll viewport must extend below the capsule, not end at a
    // padded footer. Verify this on a short screen where the old footer covered it.
    for(const height of [568,844]){
      await send('Emulation.setDeviceMetricsOverride',{width:390,height,deviceScaleFactor:1,mobile:true});
      for(const [index,page,scroll] of [[1,'.today-page','.today-scroll'],[2,'.settings-page','.settings-home .settings-scroll']]){
        await click('[data-nav-index="'+index+'"]');await waitFor('Boolean(document.querySelector('+JSON.stringify(page)+'))');await sleep(400);
        await assertNav(true);
        const layout=await evaluate(`(()=>{const p=document.querySelector(${JSON.stringify(page)}),s=document.querySelector(${JSON.stringify(scroll)}),v=s.querySelector('.uni-scroll-view'),r=document.querySelector('#liquid-nav-root');return{pageBottom:p.getBoundingClientRect().bottom,viewportBottom:v.getBoundingClientRect().bottom,navBottom:r.getBoundingClientRect().bottom,padding:getComputedStyle(s).paddingBottom,background:getComputedStyle(r).backgroundColor}})()`);
        assert.ok(Math.abs(layout.pageBottom-layout.viewportBottom)<1,'scroll content reaches page bottom');
        assert.ok(layout.viewportBottom>layout.navBottom,'content scrolls behind floating capsule');
        assert.equal(layout.padding,'0px');assert.equal(layout.background,'rgba(0, 0, 0, 0)');
        await shot('floating-'+index+'-'+height);
      }
    }
    assert.deepEqual(await navRect(),calendarNav,'same capsule size/position on all tabs');
    checks.push('top-right settings icon removed, plus retained; today/settings full-height scroll beneath the same transparent floating nav on short and regular screens');
    await sleep(100);await click('[data-nav-index="2"]');
    await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
    await sleep(650);
    const hasPreview=await evaluate("!!document.querySelector('[data-settings-entry=preview]')");
    assert.equal(await evaluate("document.querySelectorAll('[data-settings-entry]').length"),hasPreview?6:5);
    assert.equal(await evaluate("[...document.querySelectorAll('.directory-links')].every(group=>getComputedStyle(group).borderRadius==='12px' && getComputedStyle(group).overflow==='hidden')"),true,'the group owns the outside radius');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('#settings-entry-display'),'::before').borderTopWidth"),'1px','the adjoining rows share a fine divider');
    assert.equal(await evaluate("document.querySelector('.settings-home').querySelectorAll('.preference-row,.clarity-slider,.motion-stage,.scenario-grid').length"),0);
    await waitFor("document.querySelector('.settings-prepared')?.hasAttribute('inert')");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.settings-prepared')).visibility"),'hidden');
    assert.equal(await evaluate("document.querySelectorAll('.settings-prepared svg,.settings-prepared canvas').length"),0,'the prepared controls own no hidden glass renderer');
    await shot('home-390');
    await open('appearance');
    assert.equal(await evaluate("document.querySelectorAll('[aria-label=界面风格],[aria-label=设置页面切换]').length"),0);
    await click('#glass-material-preview [data-nav-index="2"]');
    await waitFor("document.querySelector('#glass-material-preview [aria-pressed=true]')?.dataset.navIndex==='2'");
    await back();
    await open('appearance');
    assert.equal(await evaluate("document.querySelector('#glass-material-preview [aria-pressed=true]')?.dataset.navIndex"),'0');
    assert.equal(await evaluate("document.querySelector('.settings-detail .scroll-viewport').scrollTop"),0);
    await back();
    await open('about');
    assert.equal(await evaluate("document.querySelector('.detail-heading .settings-title').textContent"),'关于湖畔课表');
    assert.match(await evaluate("document.querySelector('.about-maker').textContent"),/YukiDango/);
    const layers = await evaluate(`(async()=>{
      const detail=document.querySelector('.settings-detail'),nav=document.querySelector('#liquid-nav-root'),bar=nav.querySelector('.glass-bar');
      document.querySelector('.settings-back').click();await Promise.resolve();
      await new Promise(requestAnimationFrame);
      const animation=detail.getAnimations().find(a=>a.effect.getKeyframes().some(frame=>frame.transform));
      if(!animation)throw new Error('missing return transition');
      animation.pause();animation.currentTime=45;
      return{clip:getComputedStyle(detail).clipPath,detailZ:Number(getComputedStyle(detail).zIndex),navZ:Number(getComputedStyle(nav).zIndex),homeZ:Number(getComputedStyle(document.querySelector('.settings-home')).zIndex),shadow:getComputedStyle(detail).boxShadow};
    })()`);
    assert.equal(layers.clip,'none');
    assert.ok(layers.detailZ>layers.navZ&&layers.navZ>layers.homeZ,'detail above navigation above directory');
    assert.equal(layers.shadow,'none');
    const midReturn=await send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(out,'return-layering.png'),Buffer.from(midReturn.data,'base64'));
    await evaluate("document.querySelector('.settings-detail')?.getAnimations().forEach(a=>a.play())");
    await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
    checks.push('mid-return painting order: directory below navigation below sliding detail; no edge shadow');

    await evaluate("window.savedSettingsHome=document.querySelector('.settings-home')");
    await open('display');
    assert.equal(await evaluate("window.savedSettingsHome===document.querySelector('.settings-home')"),true,'directory is retained under the detail');
    assert.equal(await evaluate("document.querySelector('.settings-home').hasAttribute('inert')"),true);
    assert.equal(await evaluate("document.querySelectorAll('.preference-row').length"),3);
    assert.equal(await evaluate("document.querySelectorAll('.clarity-slider,.motion-stage').length"),0);
    await click('[aria-label="展示考核方式"]');
    assert.equal(await evaluate("document.querySelector('[aria-label=\"展示考核方式\"]').getAttribute('aria-checked')"),'false');
    await shot('display-390');
    const exit = await evaluate(`(async () => {
      const detail=document.querySelector('.settings-detail'), home=document.querySelector('.settings-home');
      const shadow=getComputedStyle(detail).boxShadow;
      const samples=[];
      window.settingsExitFrames=samples;
      function sample() {
        if (!detail.isConnected) return;
        samples.push({transform:getComputedStyle(detail).transform, shadow:getComputedStyle(detail).boxShadow});
        requestAnimationFrame(sample);
      }
      document.querySelector('.settings-back').click();
      await Promise.resolve();
      requestAnimationFrame(sample);
      return {retained:detail.isConnected, phase:document.querySelector('.settings-page').dataset.routePhase, shadow, homeRetained:home===window.savedSettingsHome};
    })()`);
    assert.equal(exit.retained,true,'detail stays mounted during exit');
    assert.equal(exit.phase,'leaving');
    await assertNav(true, false);
    assert.equal(exit.homeRetained,true);
    await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
    const exitFrames=await evaluate('window.settingsExitFrames');
    assert.ok(new Set(exitFrames.map(frame=>frame.transform)).size>2,'detail moves to the right during return');
    assert.ok(exitFrames.every(frame=>frame.shadow==='none'),'settings detail has no edge shadow throughout return');
    assert.equal(await evaluate("Boolean(document.querySelector('.settings-detail'))"),false);
    assert.equal(await evaluate("window.savedSettingsHome===document.querySelector('.settings-home')"),true);
    assert.equal(await evaluate("document.querySelector('.settings-home').hasAttribute('inert')"),false);
    checks.push('persistent directory, slide exit without edge shadow, detail unmounted after exit');
    await open('display');
    assert.equal(await evaluate("document.querySelector('[aria-label=\"展示考核方式\"]').getAttribute('aria-checked')"),'false','preference survives subpage navigation');
    await click('[aria-label="展示考核方式"]');
    await evaluate("document.querySelector('.settings-back').focus()");
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
    await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
    checks.push('grouped settings directory exposes only its entries; the inert prepared controls own no renderer; display switches and Escape work');

    await evaluate("document.querySelector('[data-settings-entry=\"appearance\"]').focus()");
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
    await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='appearance'");
    await waitFor("document.querySelectorAll('.preference-row').length===1");
    assert.equal(await evaluate("document.querySelectorAll('.preference-row').length"),1);
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.settings-page')).animationName"),'none','settings tab entry has no page animation');
    assert.equal(await evaluate("document.querySelector('.clarity-slider').getAttribute('aria-valuenow')"),'75');
    assert.equal(await evaluate("(() => { const card=document.querySelector('.settings-section .settings-card'), clarity=card.querySelector('.glass-clarity-setting'), motion=card.querySelector('[aria-label=\"减少动画\"]'); return Boolean(clarity && motion && (clarity.compareDocumentPosition(motion) & Node.DOCUMENT_POSITION_FOLLOWING)) })()"),true,'reduced motion follows glass clarity');
    await click('[aria-label="减少动画"]');
    assert.equal(await evaluate("document.querySelector('[aria-label=\"减少动画\"]').getAttribute('aria-checked')"),'true');
    await click('[aria-label="减少动画"]');
    await sleep(60);
    assert.equal(await evaluate("document.querySelector('.settings-page')?.dataset.settingsSection"),'appearance');
    assert.equal(await evaluate("getComputedStyle(document.querySelector('.settings-route')).animationName"),'none','toggling reduced motion does not run a page transition');
    await shot('appearance-390');
    await back();

    await open('semester');
    assert.equal(await evaluate("document.querySelectorAll('.semester-card,.import-button').length"),2);
    await shot('semester-390');
    await back();
    if (hasPreview) {
      await open('preview');
      assert.equal(await evaluate("document.querySelectorAll('.variant-option').length"),4);
      assert.equal(await evaluate("document.querySelectorAll('.scenario-option').length"),4);
      const speedAlignment = await evaluate("(() => { const row=document.querySelector('.motion-options .motion-option'), label=row.children[0].getBoundingClientRect(), picker=row.querySelector('.speed-picker').getBoundingClientRect(); return Math.abs(label.top+label.height/2-picker.top-picker.height/2) })()");
      assert.ok(speedAlignment < 1.5,'preview speed label and control are vertically centered');
      await click('.variant-option:nth-child(2)');await click('.finish-button');
      assert.equal(await evaluate("document.querySelector('.motion-status-title').textContent"),'读取完成');
      await shot('preview-390');
      await click('.finish-button');await click('.demo-button');
      await back();await sleep(3200);await open('preview');
      assert.equal(await evaluate("document.querySelector('.motion-status-title').textContent"),'正在读取课程信息','leaving cancels pending completion timer');
      assert.equal(await evaluate("document.querySelector('.variant-option:nth-child(2)').getAttribute('aria-pressed')"),'true');
      await click('.scenario-option:nth-child(2)');
      assert.equal(await evaluate("document.querySelector('.scenario-option:nth-child(2)').classList.contains('chosen')"),true);
      await click('.scenario-option:first-child');
      await back();
    }
    await open('about');
    assert.equal(await evaluate("Boolean(document.querySelector('.about-data'))"),true);
    await shot('about-390');await back();
    checks.push('appearance, semester/import entry, all four animation variants, demo scenes and about remain accessible; preview timer stops on exit');

    for(const width of [320,390,768]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:true});await sleep(200);
      assert.equal(await evaluate('document.documentElement.scrollWidth'),width);
      assert.equal(await evaluate("[...document.querySelectorAll('[data-settings-entry]')].every(e=>e.getBoundingClientRect().height>=44)"),true);
      await shot('home-'+width);
      await open('appearance');
      assert.ok(await evaluate("document.querySelector('.settings-back').getBoundingClientRect().height")>=44);
      assert.equal(await evaluate("document.querySelector('.settings-detail .settings-scroll .uni-scroll-view').scrollTop"),0);
      await shot('appearance-'+width);
      await back();
    }
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:560,deviceScaleFactor:1,mobile:true});
    await sleep(150);
    await evaluate("window.savedDirectoryScroll=[...document.querySelectorAll('.settings-home .uni-scroll-view')].find(e=>e.scrollHeight>e.clientHeight); window.savedDirectoryScroll.scrollTop=60");
    const directoryOffset = await evaluate('window.savedDirectoryScroll.scrollTop');
    assert.ok(directoryOffset > 0);
    await open('about'); await back();
    assert.equal(await evaluate('window.savedDirectoryScroll.isConnected && window.savedDirectoryScroll.scrollTop'),directoryOffset,'directory scrolling is retained');
    // Return while the entrance is still running, then press back again.
    await click('[data-settings-entry="display"]');
    await waitFor("document.querySelector('.settings-detail')?.getAnimations().some(a=>a.effect.getComputedTiming().progress>.05 && a.effect.getComputedTiming().progress<.97)");
    await evaluate("(()=>{const back=document.querySelector('.settings-back');back.click();back.click()})()");
    await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
    assert.equal(await evaluate("document.querySelectorAll('.settings-detail').length"),0);
    await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    await open('about'); await back();
    await send('Emulation.setEmulatedMedia',{features:[]});
    await open('appearance'); await click('[aria-label="减少动画"]'); await back();
    await open('about'); await back();
    await open('appearance'); await click('[aria-label="减少动画"]'); await back();
    checks.push('directory scroll retained; mid-entrance return and repeated back safe; system and app reduced-motion paths complete');
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
    const timing = await evaluate(`(async () => {
      async function measure(button) {
        document.querySelector(button).click();
        await new Promise(requestAnimationFrame);
        const detail=document.querySelector('.settings-detail');
        const animation=detail.getAnimations().find(a=>a.effect.getKeyframes().some(f=>f.transform));
        const timing=animation.effect.getComputedTiming(), shadow=getComputedStyle(detail).boxShadow, samples=[];
        function sample() {
          if (animation.playState!=='running') return;
          samples.push(new DOMMatrix(getComputedStyle(detail).transform).m41);
          requestAnimationFrame(sample);
        }
        sample();
        await animation.finished;
        return {duration:timing.duration, elapsed:timing.endTime, easing:timing.easing, shadow,samples};
      }
      const entry=await measure('[data-settings-entry="about"]');
      await new Promise(resolve=>requestAnimationFrame(resolve));
      return {entry,exit:await measure('.settings-back')};
    })()`);
    assert.equal(timing.entry.duration,340);
    assert.equal(timing.exit.duration,150);
    for (const motion of [timing.entry,timing.exit]) {
      assert.equal(motion.elapsed,motion.duration);
      assert.equal(motion.shadow,'none');
      assert.ok(new Set(motion.samples).size>2,'the surface moves through intermediate positions');
      assert.match(motion.easing,/cubic-bezier/);
    }
    assert.ok(timing.entry.samples.at(-1)<timing.entry.samples[0]);
    assert.ok(timing.exit.samples.at(-1)>timing.exit.samples[0]);
    checks.push('entry 340ms and return 150ms, verified against the running transform animations');
    await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
    await open('display');
    const appearanceTap=await tapPoint('[data-settings-entry="appearance"]');
    await click('.settings-back');
    await waitFor("document.querySelector('.settings-page')?.dataset.routePhase==='leaving'");
    assert.equal(await evaluate("document.querySelector('.settings-home').hasAttribute('inert')"),false,'exposed settings directory accepts taps during return');
    await tap(appearanceTap);
    await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='appearance'");
    await waitFor("document.querySelector('.settings-page')?.dataset.routePhase==='open'");
    await back();
    checks.push('physical touch on another settings item during return interrupts the old exit and opens the requested detail');
    await open('display');
    const navTap=await tapPoint('[data-nav-index="0"]');
    await click('.settings-back');
    await waitFor("document.querySelector('.settings-page')?.dataset.routePhase==='leaving'");
    assert.equal(await evaluate("document.querySelector('#liquid-nav-root').hasAttribute('inert')"),false,'exposed navigation accepts a return-time tap');
    await tap(navTap);
    await waitFor("document.querySelector('.settings-page')?.hasAttribute('inert') && getComputedStyle(document.querySelector('.settings-page')).visibility==='hidden' && !document.querySelector('.settings-detail')");
    assert.equal(await evaluate("document.querySelector('[data-nav-index=\"0\"]').getAttribute('aria-current')"),'page');
    assert.equal(await evaluate("document.querySelector('[data-nav-index=\"2\"]').getAttribute('aria-current')"),null);
    await click('[data-nav-index="2"]');
    await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
    checks.push('physical touch on return-time navigation changes both content and selected lens to the same tab');
    await open('display');await back();await click('[data-nav-index="0"]');await sleep(100);
    await click('[data-nav-index="2"]');await waitFor("document.querySelector('.settings-page')?.dataset.settingsSection==='home'");
    checks.push('320/390/768 layouts, 44px navigation targets, independent scroll position and tab reentry starts at settings home');
    checks.push('navigation hidden in settings detail; visible and actionable during return; no remounting lens');
    assert.deepEqual(errors,[]);
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({checks,timing,errors},null,2));
    console.log(JSON.stringify({checks,timing,errors,out},null,2));
    await send('Browser.close',{},false);
  } finally { socket?.close();child.kill();server.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
