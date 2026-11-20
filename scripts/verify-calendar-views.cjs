// Run after build:h5. Uses an isolated Edge profile, never the user's browser data.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const dist = path.resolve('dist/build/h5');
  const out = path.resolve('.artifacts/calendar-views');
  fs.mkdirSync(out, { recursive: true });
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    let file = path.resolve(dist, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
    if (!file.startsWith(dist + path.sep)) { res.writeHead(403).end(); return; }
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
    res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ucas-calendar-views-'));
  const child = spawn(process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  let socket;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
    assert.ok(fs.existsSync(portFile), 'Edge remote debugging did not start');
    const [port, endpoint] = fs.readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
    socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let sequence = 0, sessionId;
    const pending = new Map(), errors = [], checks = [];
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const job = pending.get(message.id);
        if (job) { pending.delete(message.id); message.error ? job.reject(message.error) : job.resolve(message.result); }
      } else if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    };
    const send = (method, params = {}, attached = true) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('CDP timed out: ' + method)); }, 15000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
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
      for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await sleep(50); }
      throw new Error('Timed out: ' + expression);
    };
    const click = selector => evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    const ready = mode => waitFor(`document.querySelectorAll('[data-calendar-panel="ready"]').length === 5 && [...document.querySelectorAll('[data-calendar-panel="ready"]')].every(p => p.querySelector('[data-calendar-view="active"] .${mode === 'grid' ? 'week-content' : 'week-list-content'}'))`);
    const week = () => evaluate("Number(document.querySelector('.week-select').textContent.match(/\\d+/)[0])");
    const screenshot = async name => {
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(shot.data, 'base64'));
      return shot.data;
    };
    async function checkCardPixels(png, weekNumber) {
      const list = document.querySelector('.week-panel-content[data-week="' + weekNumber + '"] .week-list-layer');
      const viewport = list.getBoundingClientRect();
      const navTop = document.querySelector('#liquid-nav-root').getBoundingClientRect().top;
      const frame = new Image();
      frame.src = 'data:image/png;base64,' + png;
      await frame.decode();
      const canvas = document.createElement('canvas');
      canvas.width = innerWidth;
      canvas.height = innerHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
      let checked = 0;
      for (const card of list.querySelectorAll('.course-card')) {
        const r = card.getBoundingClientRect(), style = getComputedStyle(card);
        const top = Math.max(r.top + 10, viewport.top + 2);
        const bottom = Math.min(r.bottom - 10, viewport.bottom - 2, navTop - 2);
        if (bottom - top < 8) continue;
        const rgb = style.backgroundColor.match(/\d+/g).slice(0, 3).map(Number);
        let matches = 0;
        for (const x of [.72, .81, .90]) {
          for (const y of [.2, .5, .8]) {
            const pixel = ctx.getImageData(Math.floor(r.left + r.width * x), Math.floor(top + (bottom - top) * y), 1, 1).data;
            if (rgb.every((channel, i) => Math.abs(pixel[i] - channel) <= 5)) matches++;
          }
        }
        if (style.visibility !== 'visible' || matches < 4) throw Error('Course card missing from screenshot: ' + card.textContent.trim());
        checked++;
      }
      return checked;
    }
    const verifyListScreenshot = async (name, weekNumber) => {
      const png = await screenshot(name);
      assert.ok(await evaluate(`(${checkCardPixels})(${JSON.stringify(png)}, ${weekNumber})`) > 0, 'checked on-screen course cards');
    };
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/index.html#/pages/index/index` });
    await waitFor("Boolean(document.querySelector('.week-view-toggle'))");
    await click('.week-select');
    await waitFor("Boolean(document.querySelector('.week-option'))");
    await click('.week-option:nth-child(3)'); await ready('grid');
    assert.equal(await week(), 3);
    async function toggleAndTrace(weekNumber) {
      const panel = document.querySelector('.week-panel-content[data-week="' + weekNumber + '"]');
      const grid = panel.querySelector('.week-grid-layer');
      const opening = grid?.dataset.calendarView === 'active';
      const destination = (opening ? '.week-list-layer' : '.week-grid-layer') + '[data-calendar-view="active"]';
      const distant = [...document.querySelectorAll('.week-panel-content')].filter(other =>
        Math.abs(Number(other.dataset.week) - weekNumber) > 1 && !other.querySelector(destination));
      const samples = [];
      let visible, delays, duration;
      document.querySelector('.week-view-toggle').click();
      const deadline = performance.now() + 2000;
      do {
        await new Promise(requestAnimationFrame);
        if (!panel.hasAttribute('data-list-animating')) {
          if (samples.length) break;
          continue;
        }
        const list = panel.querySelector('.week-list-layer');
        const calendar = panel.querySelector('.week-grid-layer');
        if (distant.some(other => other.querySelector(destination))) throw Error('Distant week prepared during motion');
        if ([calendar, list].some(el => !el.getClientRects().length || getComputedStyle(el).visibility !== 'visible')) throw Error('Unpainted layer during switch');
        if (calendar.inert !== opening || list.inert === opening) throw Error('Inactive content is interactive');
        if (!visible) {
          const viewport = list.getBoundingClientRect();
          visible = [...list.querySelectorAll('.course-card')].filter(card => {
            const bounds = card.getBoundingClientRect();
            const intersects = bounds.bottom > viewport.top && bounds.top < viewport.bottom;
            if (intersects !== (card.getAnimations().length === 1)) throw Error('Expected exactly the visible cards to animate');
            return intersects;
          });
          const intervals = Math.max(0, visible.length - 1);
          const spread = Math.min(intervals * 26, 130);
          const total = visible.length ? 120 + spread : 70;
          const surface = list.getAnimations()[0].effect;
          duration = surface.getTiming().duration;
          if (duration !== total || Math.abs(surface.getKeyframes()[1].computedOffset * total - 70) > .01) {
            throw Error('Unexpected total duration or surface fade');
          }
          delays = visible.map((card, index) => {
            const effect = card.getAnimations()[0].effect, timing = effect.getTiming();
            const frames = effect.getKeyframes(), arrived = frames.findIndex(frame => Number(frame.opacity) === 1);
            if (timing.duration !== total || timing.endDelay || timing.direction !== (opening ? 'normal' : 'reverse') || arrived < 1) throw Error('Unexpected card timing');
            const start = frames[arrived - 1].computedOffset * timing.duration;
            const expectedStart = intervals ? index * spread / intervals : 0;
            if (Math.abs(start - expectedStart) > .01 || Math.abs(frames[arrived].computedOffset * timing.duration - start - 120) > .01) {
              throw Error('Unexpected card stagger or travel time');
            }
            return start;
          });
        }
        samples.push(visible.map(card => {
          const style = getComputedStyle(card), transform = new DOMMatrixReadOnly(style.transform);
          if (Math.abs(transform.m42) > .01) throw Error('Card moved vertically');
          return { x:transform.m41, opacity:Number(style.opacity) };
        }));
      } while (performance.now() < deadline);
      const layers = [...panel.querySelectorAll('.week-view-layer')];
      const settled = !panel.hasAttribute('data-list-animating') && layers.every(layer =>
        layer.dataset.calendarView === 'active'
          ? layer.getClientRects().length > 0 && getComputedStyle(layer).visibility === 'visible'
          : layer.getClientRects().length === 0);
      const afterMotion = performance.now() + 600;
      while (distant.some(other => !other.querySelector(destination)) && performance.now() < afterMotion) await new Promise(requestAnimationFrame);
      if (distant.some(other => !other.querySelector(destination))) throw Error('Distant weeks did not resume on completion');
      return { opening, samples, delays, settled, duration };
    }
    const verifyToggle = async (opening, weekNumber = 3, empty = false) => {
      const trace = await evaluate(`(${toggleAndTrace})(${weekNumber})`);
      assert.equal(trace.opening, opening);
      assert.ok(trace.settled && trace.samples.length >= 2, 'painted intermediate frames and settled on target');
      if (empty) { assert.deepEqual(trace.delays, []); return; }
      assert.ok(trace.delays.length >= 2 && trace.delays[0] === 0);
      assert.ok(trace.delays.every((ms, i) => !i || ms > trace.delays[i-1]), 'cards are individually staggered across day boundaries');
      assert.ok(trace.samples.some(row => row[0].x - row.at(-1).x > 8 && row[0].opacity - row.at(-1).opacity > .15),
        'upper cards appear ahead of lower ones and stay visible longer on close');
      const first = trace.samples[0], last = trace.samples.at(-1);
      assert.ok(first.some((card, i) => (last[i].x - card.x) * (opening ? 1 : -1) > 8), 'horizontal motion follows toggle direction');
      return trace.duration;
    };
    await evaluate("window.savedGrid = document.querySelector('.week-panel-content[data-week=\"3\"] .week-content'); window.savedGridScroll = [...window.savedGrid.querySelectorAll('.uni-scroll-view')].find(e => e.scrollHeight > e.clientHeight); window.savedGridScroll.scrollTop = 120");
    assert.equal(await evaluate('window.savedGridScroll.scrollTop'), 120);
    assert.equal(await verifyToggle(true), 250, 'dense week opens in 250 ms'); await ready('list');
    assert.equal(await evaluate("document.querySelectorAll('.week-content,.week-list-content').length"), 6);
    await evaluate("window.savedList = document.querySelector('.week-panel-content[data-week=\"3\"] .week-list-content')");
    await verifyListScreenshot('list', 3);
    await evaluate("window.savedListScroll = window.savedList.querySelector('.scroll-viewport'); window.savedListScroll.scrollTop = window.savedListScroll.scrollHeight");
    const savedListTop = await evaluate('window.savedListScroll.scrollTop');
    assert.ok(savedListTop > 100, 'exercise the stagger in a previously scrolled list');
    await verifyToggle(false); await ready('grid');
    assert.equal(await evaluate("window.savedGrid === document.querySelector('.week-panel-content[data-week=\"3\"] .week-content')"), true);
    assert.equal(await evaluate('window.savedGridScroll.scrollTop'), 120);
    await screenshot('grid');
    await verifyToggle(true); await ready('list');
    assert.equal(await evaluate("window.savedList === document.querySelector('.week-panel-content[data-week=\"3\"] .week-list-content')"), true);
    assert.equal(await evaluate('window.savedListScroll.scrollTop'), savedListTop);
    await verifyListScreenshot('list-reopened', 3);
    checks.push('visible cards slide in reading order and paint their course colors on first open and at the saved scroll offset; grid/list DOM reused; maximum six mounted views');
    async function reverseDuringClose() {
      const list = document.querySelector('.week-panel-content[data-week="3"] .week-list-layer');
      const toggle = document.querySelector('.week-view-toggle');
      toggle.click();
      const deadline = performance.now() + 1500;
      while (performance.now() < deadline) {
        await new Promise(requestAnimationFrame);
        const [surface] = list.getAnimations();
        if (!surface) continue;
        const total = surface.effect.getComputedTiming().endTime;
        if (surface.currentTime > total * .7 || surface.currentTime < total * .3) continue;
        const before = surface.currentTime, effects = list.getAnimations({subtree:true});
        const frame = surface.timeline.currentTime;
        toggle.click();
        await new Promise(requestAnimationFrame);
        const resumed = list.getAnimations({subtree:true});
        const reused = effects.length > 1 && effects.length === resumed.length && effects.every(effect => resumed.includes(effect));
        if (!reused) return false;
        await surface.ready;
        // A busy frame can advance by more than a quarter of the shorter animation.
        // A continuous reversal can travel only as far as the timeline has advanced.
        const elapsed = surface.timeline.currentTime - frame;
        return surface.playbackRate < 0 && Math.abs(surface.currentTime - before) <= elapsed + 1;
      }
      return false;
    }
    assert.ok(await evaluate(`(${reverseDuringClose})()`), 'a mid-flight reversal keeps the original card animations and their displayed progress');
    await waitFor("!document.querySelector('[data-list-animating]')");
    async function interruptSwitch(interruption) {
      const panel = document.querySelector('.week-panel-content[data-week="3"]');
      const list = panel.querySelector('.week-list-layer');
      document.querySelector('.week-view-toggle').click();
      const deadline = performance.now() + 1000;
      while (!list.getAnimations().length && performance.now() < deadline) await new Promise(requestAnimationFrame);
      const [surface] = list.getAnimations();
      if (!surface) throw Error('Expected a running list transition');
      if (interruption === 'cancel') surface.cancel();
      else for (const effect of list.getAnimations({ subtree: true })) effect.pause();

      while (panel.hasAttribute('data-list-animating') && performance.now() < deadline) await new Promise(requestAnimationFrame);
      const cards = [...list.querySelectorAll('.course-card')];
      return {
        view: list.dataset.calendarView,
        listHasBox: list.getClientRects().length > 0,
        transparentCards: cards.filter(card => Number(getComputedStyle(card).opacity) < 1).length,
        remainingEffects: list.getAnimations({ subtree: true }).length,
        animating: panel.hasAttribute('data-list-animating')
      };
    }
    for (const [interruption, view] of [['cancel', 'cached'], ['pause', 'active']]) {
      const state = await evaluate(`(${interruptSwitch})(${JSON.stringify(interruption)})`);
      assert.deepEqual(state, { view, listHasBox: view === 'active',
        transparentCards: 0, remainingEffects: 0, animating: false }, 'interrupted ' + interruption + ' must settle on the selected view');
    }
    checks.push('cancelled and stalled transitions restore every course card and release the outgoing layer');
    await evaluate('window.savedListScroll.scrollTop = 0');
    assert.equal(await verifyToggle(false), 250, 'dense week closes in 250 ms'); await ready('grid');
    checks.push('dense week reaches 250 ms in both directions');
    await click('.week-view-toggle');
    await waitFor("Boolean(document.querySelector('[data-list-animating]'))");
    await click('#liquid-nav-root [data-nav-index="1"]');
    await waitFor("document.querySelector('#calendar-native-root').dataset.visible === 'false'");
    assert.ok(await evaluate("!document.querySelector('[data-list-animating],[data-list-preparing]')"), 'leaving the timetable releases its transition');
    await click('#liquid-nav-root [data-nav-index="0"]');
    await waitFor("document.querySelector('#calendar-native-root').dataset.visible === 'true'");
    await click('.week-view-toggle'); await ready('grid');
    const { targetId: otherTab } = await send('Target.createTarget', { url: 'about:blank', background: true }, false);
    await click('.week-view-toggle');
    await waitFor("Boolean(document.querySelector('[data-list-animating]'))");
    await send('Target.activateTarget', { targetId: otherTab }, false);
    await send('Page.setWebLifecycleState', { state: 'frozen' });
    await send('Page.setWebLifecycleState', { state: 'active' });
    // Thawing resumes JS; activating the tab separately restores document visibility.
    await send('Target.activateTarget', { targetId }, false);
    await send('Target.closeTarget', { targetId: otherTab }, false);
    await waitFor("!document.hidden && !document.querySelector('[data-list-animating],[data-list-preparing]')");
    await evaluate("(async () => { for (let i = 0; i < 10; i++) { document.querySelector('.week-view-toggle').click(); await new Promise(r => setTimeout(r, 8)); } })()");
    await ready('list');
    await waitFor("!document.querySelector('[data-list-animating],[data-list-preparing]')");
    assert.ok(await evaluate(`(() => {
      const list = document.querySelector('.week-panel-content[data-week="3"] .week-list-layer');
      const cards = [...list.querySelectorAll('.course-card')];
      return cards.length > 0 && !list.inert && getComputedStyle(list).opacity === '1' && cards.every(card => {
        const style = getComputedStyle(card);
        return style.visibility === 'visible' && style.opacity === '1' && style.transform === 'none';
      });
    })()`), 'all courses are visible at rest after returning to the timetable and repeatedly reversing the switch');
    await verifyListScreenshot('list-after-interruptions', 3);
    checks.push('course cards are visible in the screenshot after a tab change, page freeze/resume and rapid reversals');
    assert.equal(await evaluate("document.querySelectorAll('.week-content,.week-list-content').length"), 6);
    const swipe = async (from, to) => {
      await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from, y: 350 }] });
      for (let i = 1; i <= 8; i++) {
        await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from + (to - from) * i / 8, y: 350 }] });
        await sleep(16);
      }
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await sleep(400);
    };
    await swipe(320, 70); assert.equal(await week(), 4);
    await ready('list');
    await swipe(70, 320); assert.equal(await week(), 3);
    await ready('list');
    assert.ok(await evaluate("document.querySelectorAll('.week-content,.week-list-content').length") <= 6);
    await click('.week-view-toggle');
    await waitFor("Boolean(document.querySelector('.week-panel-content[data-week=\"3\"][data-list-animating]'))");
    await swipe(320, 70); assert.equal(await week(), 4);
    checks.push('rapid toggles settle on final mode; list swipes both directions; swiping during a switch reaches the adjacent week; distant weeks resume after motion; cache remains bounded');
    await send('Emulation.setEmulatedMedia', { features:[{name:'prefers-reduced-motion',value:'reduce'}] });
    await click('.week-view-toggle');
    await waitFor("Boolean(document.querySelector('.week-panel-content[data-week=\"4\"] .week-list-layer[data-calendar-view=\"active\"]'))");
    assert.ok(await evaluate(`(() => {
      const list = document.querySelector('.week-panel-content[data-week="4"] .week-list-layer');
      return !list.getAnimations({subtree:true}).length && getComputedStyle(list).visibility === 'visible';
    })()`), 'reduced motion switches directly to the list');
    await send('Emulation.setEmulatedMedia', { features:[] });
    await click('.week-select');
    await waitFor("Boolean(document.querySelector('.week-option'))");
    await click('.week-option:nth-child(17)'); await ready('list');
    await verifyToggle(false, 17, true); await ready('grid');
    checks.push('first reveal and reverse keep both layers painted; only the target accepts input; reduced motion skips the transition; an empty week crossfades');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ checks, errors }, null, 2));
    console.log(JSON.stringify({ checks, errors, out }, null, 2));
    await send('Browser.close', {}, false);
  } finally { socket?.close(); child.kill(); server.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
