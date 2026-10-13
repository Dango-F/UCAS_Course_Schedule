// Built-in Node/CDP smoke test; no extra browser package is required.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const dist = path.resolve('dist/build/h5');
const out = path.resolve('.artifacts/swipe-ab');
// The release has no switcher. --compare is only for an archived comparison build.
const comparisonMode = process.argv.includes('--compare');
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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ucas-swipe-ab-'));
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
      pending.set(id, { resolve, reject });
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
      for (let i = 0; i < 80; i++) { if (await evaluate(expression)) return; await sleep(50); }
      throw new Error('Timed out: ' + expression);
    };
    await send('Page.navigate', { url: `http://127.0.0.1:${server.address().port}/` });
    await waitFor(`Boolean(document.querySelector('.week-select'))`);
    const shownWeek = () => evaluate(`Number(document.querySelector('.week-select').textContent.match(/[0-9]+/)[0])`);
    async function chooseWeek(week) {
      await evaluate(`document.querySelector('.week-select').click()`);
      await waitFor(`Boolean(document.querySelectorAll('.week-option')[${week - 1}])`);
      await evaluate(`document.querySelectorAll('.week-option')[${week - 1}].click()`);
      await waitFor(`!document.querySelector('.sheet-backdrop')`);
      await sleep(80);
    }
    async function chooseVersion(version) {
      if (!comparisonMode) {
        assert.equal(version, 2, 'release only allows version two');
        await waitFor(`Boolean(document.querySelector('#calendar-native-root'))`);
        return;
      }
      await evaluate(`document.querySelector('[aria-label="预览设置"],[aria-label="课表设置"]').click()`);
      await waitFor(`document.querySelectorAll('.swipe-version-options > *').length === 3`);
      await evaluate(`document.querySelectorAll('.swipe-version-options > *')[${version - 1}].click(); document.querySelector('.sheet-backdrop .close-button').click()`);
      await waitFor(`Boolean(document.querySelector('${version === 1 ? '#calendar-swipe-root' : version === 2 ? '#calendar-native-root' : '#calendar-native-v3-root'}'))`);
      await waitFor(`!document.querySelector('.sheet-backdrop')`);
      await sleep(100);
    }
    let y;
    const touch = (type, x) => send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1 }] });
    async function swipe(from, to, steps = 6, delay = 12) {
      await touch('touchStart', from);
      for (let i = 1; i <= steps; i++) { await sleep(delay); await touch('touchMove', from + (to - from) * i / steps); }
      await touch('touchEnd');
    }
    const profileName = process.argv.find(arg => arg.startsWith('--profile='))?.split('=')[1];
    if (profileName) {
      assert.match(profileName, /^[a-z0-9-]+$/i);
      await chooseVersion(2);
      await evaluate(`document.querySelector('[aria-label="预览设置"],[aria-label="课表设置"]').click()`);
      await waitFor(`document.querySelectorAll('.scenario-option').length > 0`);
      await evaluate(`Array.from(document.querySelectorAll('.scenario-option')).find(el => el.textContent.includes('密集课表')).click()`);
      await waitFor(`!document.querySelector('.sheet-backdrop')`);
      await chooseWeek(5);
      await send('Emulation.setCPUThrottlingRate', { rate: 4 });
      await send('Performance.enable');
      y = await evaluate(`document.querySelector('.calendar-native').getBoundingClientRect().top + 120`);
      const metrics = async () => Object.fromEntries((await send('Performance.getMetrics')).metrics.map(item => [item.name, item.value]));
      const phases = [];
      for (const phase of ['held-drag', 'continuous-turns']) {
        await evaluate(`(() => {
          window.profileFrames = []; window.profileRunning = true; window.profileLast = 0;
          window.profileMutations = { added: 0, removed: 0 };
          window.profileObserver = new MutationObserver(records => records.forEach(record => {
            window.profileMutations.added += record.addedNodes.length;
            window.profileMutations.removed += record.removedNodes.length;
          }));
          window.profileObserver.observe(document.querySelector('.calendar-native'), { childList: true, subtree: true });
          function frame(t) { if (window.profileLast) window.profileFrames.push(t - window.profileLast); window.profileLast = t; if(window.profileRunning) requestAnimationFrame(frame); }
          requestAnimationFrame(frame);
        })()`);
        const before = await metrics();
        if (phase === 'held-drag') {
          await touch('touchStart', 280);
          for (let cycle = 0; cycle < 3; cycle++) {
            for (let i = 1; i <= 15; i++) { await touch('touchMove', 280 - i * 10); await sleep(8); }
            for (let i = 14; i >= 0; i--) { await touch('touchMove', 280 - i * 10); await sleep(8); }
          }
          await touch('touchEnd'); await sleep(300);
        } else {
          for (let i = 0; i < 6; i++) { await swipe(290, 90, 6, 10); await sleep(130); }
          await sleep(500);
        }
        const after = await metrics();
        const browser = await evaluate(`(() => {
          window.profileRunning = false; window.profileObserver.disconnect();
          const frames = window.profileFrames.sort((a,b) => a-b);
          return { frames: frames.length, p95FrameMs: frames[Math.floor(frames.length*.95)], framesOver25ms: frames.filter(t=>t>25).length,
            mutations: window.profileMutations, elements: document.querySelector('.calendar-native').querySelectorAll('*').length,
            mountedWeeks: document.querySelectorAll('.calendar-native .week-content').length };
        })()`);
        const delta = Object.fromEntries(['LayoutCount','RecalcStyleCount','LayoutDuration','RecalcStyleDuration','ScriptDuration','TaskDuration'].map(name => [name, after[name]-before[name]]));
        phases.push({ phase, ...browser, delta });
      }
      const report = { profileName, cpuThrottle: 4, phases, errors, note: 'Desktop headless H5 diagnostics, not Android frame-rate measurements' };
      fs.writeFileSync(path.join(out, `profile-${profileName}.json`), JSON.stringify(report, null, 2));
      console.log(JSON.stringify(report, null, 2));
      await send('Browser.close', {}, false);
      return;
    }
    await waitFor(`Boolean(document.querySelector('#calendar-native-root'))`);
    checks.push(comparisonMode ? 'version two is the default on a fresh install' : 'release always mounts version two');
    const settleTimings = {};
    for (const version of comparisonMode ? [1, 2, 3] : [2]) {
      await chooseVersion(version);
      await chooseWeek(3);
      if (version !== 1) {
        const gridCells = await evaluate(`document.querySelector('.calendar-native .week-content[data-week="3"]').querySelectorAll('.grid-cell').length`);
        assert.equal(gridCells, version === 3 ? 91 : 0, `v${version} retains its own course-grid rendering`);
      }
      y = await evaluate(`document.querySelector('${version === 1 ? '.calendar-carousel' : '.calendar-native'}').getBoundingClientRect().top + 120`);
      await evaluate(`window.swipeInversions = []; window.sampleSwipe = true; (function scan() {
        const dates = Array.from(document.querySelectorAll('.day-heading')).map(el => ({ rect: el.getBoundingClientRect(), label: el.getAttribute('aria-label') })).filter(item => item.rect.left + item.rect.width / 2 > 0 && item.rect.left + item.rect.width / 2 < 390 && item.rect.width > 0).sort((a,b) => a.rect.left - b.rect.left).map(item => { const m = item.label.match(/查看 (\\d+) 月 (\\d+) 日/); return m ? Number(m[1]) * 31 + Number(m[2]) : 0 });
        if (dates.some((date, i) => i > 0 && date <= dates[i-1])) window.swipeInversions.push(dates);
        if (window.sampleSwipe) requestAnimationFrame(scan);
      })()`);
      // Measure the track's actual remaining motion after touchend.
      // This samples only release, not the finger-following phase.
      if (version !== 1) await evaluate(`(() => {
        const root = document.querySelector('.calendar-native');
        const frame = root.querySelector('.week-track, .uni-swiper-slide-frame');
        const width = root.getBoundingClientRect().width;
        root.addEventListener('touchend', () => {
          const start = performance.now(); window.measuredSettleMs = null;
          function sample() {
            const offset = new DOMMatrixReadOnly(getComputedStyle(frame).transform).m41;
            if (Math.abs(offset + 3 * width) < 0.1) window.measuredSettleMs = performance.now() - start;
            else if (performance.now() - start < 1000) requestAnimationFrame(sample);
          }
          requestAnimationFrame(sample);
        }, { once: true, capture: true });
      })()`);
      await swipe(280, 110); await sleep(450);
      if (version !== 1) {
        settleTimings[version] = await evaluate('window.measuredSettleMs');
        assert.ok(Number.isFinite(settleTimings[version]) && settleTimings[version] > 0, `v${version} release animation reached its destination`);
      }
      if (await shownWeek() !== 4) console.log(await evaluate(`({week:document.querySelector('.week-select').textContent, root:document.querySelector('#calendar-swipe-root')?.outerHTML.slice(0,1200), hit:document.elementFromPoint(280, ${y})?.outerHTML.slice(0,250)})`), errors);
      assert.equal(await shownWeek(), 4, `v${version} forward`);
      await swipe(90, 260); await sleep(450);
      assert.equal(await shownWeek(), 3, `v${version} backward`);
      await swipe(280, 270, 4, 30); await sleep(350);
      assert.equal(await shownWeek(), 3, `v${version} small return`);
      if (version === 1) {
        const x = await evaluate(`new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.calendar-track')).transform).m41`);
        assert.ok(Math.abs(x + 390) < 1, 'v1 small return centered');
      }
      // A second finger-down arrives during the preceding release animation.
      await swipe(290, 180, 4, 10); await sleep(45);
      await touch('touchStart', 280);
      const before = await evaluate(`Array.from(document.querySelectorAll('.day-heading')).map(e => e.getBoundingClientRect().left)`);
      await touch('touchMove', 230); await sleep(20);
      const after = await evaluate(`Array.from(document.querySelectorAll('.day-heading')).map(e => e.getBoundingClientRect().left)`);
      assert.ok(after.some((x, i) => Math.abs(x - before[i]) > 10), `v${version} second gesture moves while settling`);
      await touch('touchEnd'); await sleep(500);
      for (let i = 0; i < 4; i++) { await swipe(290, 90, 4, 8); await sleep(100); }
      await sleep(600);
      assert.ok(await shownWeek() >= 5, `v${version} continuous swipes advance`);
      await evaluate(`window.sampleSwipe = false`);
      assert.deepEqual(await evaluate('window.swipeInversions'), [], `v${version} chronological dates every sampled frame`);
      if (version !== 1) {
        await chooseWeek(3);
        // Check every release, not just the final week after a long wait: the
        // old test could pass despite headings/cache stalling every two weeks.
        for (let i = 0; i < 8; i++) {
          await swipe(340, 40, 5, 8); await sleep(55);
          const expected = 4 + i;
          assert.equal(await shownWeek(), expected, `v${version} release ${i + 1} promptly publishes its week`);
          const heading = await evaluate(`(() => {
            const day = document.querySelector('.week-content[data-week="${expected}"] .day-heading');
            const parts = day.getAttribute('aria-label').match(/查看 (\\d+) 月 (\\d+) 日/);
            return { month: document.querySelector('.month-title').textContent.trim(), expectedMonth: ['一','二','三','四','五','六','七','八','九','十','十一','十二'][Number(parts[1])-1] + '月',
              range: document.querySelector('.week-range').textContent.trim(), start: Number(parts[1]) + '.' + parts[2].padStart(2, '0'),
              prepared: [...document.querySelectorAll('.calendar-native .week-content')].map(el => Number(el.dataset.week)) };
          })()`);
          assert.equal(heading.month, heading.expectedMonth, `v${version} release ${i + 1} month matches week across month boundaries`);
          assert.ok(heading.range.startsWith(heading.start), `v${version} release ${i + 1} date range matches week`);
          assert.ok(heading.prepared.includes(expected + 2), `v${version} release ${i + 1} prepares two weeks ahead without waiting for settle`);
        }
        await sleep(450);
        assert.equal(await shownWeek(), 11, `v${version} repeated interruptions retain the last target`);
        for (let i = 0; i < 8; i++) {
          await swipe(40, 340, 5, 8); await sleep(55);
          assert.equal(await shownWeek(), 10 - i, `v${version} reverse release ${i + 1} promptly publishes its week`);
        }
        await sleep(350);
        await chooseWeek(3);
        // Slow deliberate drag: CSS still owns release. Far-page preparation
        // may advance, but neither of the two visible weeks may be rebuilt.
        await touch('touchStart', 310);
        for (let i = 1; i <= 16; i++) { await touch('touchMove', 310 - i * 15); await sleep(20); }
        await sleep(120);
        await evaluate(`(() => {
          const root = document.querySelector('.calendar-native');
          window.slowRelease = { styleWrites: 0, visibleChanges: 0 };
          window.visibleReleasePanels = [3, 4].map(week => root.querySelector('.week-content[data-week="' + week + '"]'));
          window.slowObserver = new MutationObserver(records => {
            if (root.getAttribute('data-motion-phase') !== 'settling') return;
            for (const record of records) {
              if (record.type === 'attributes' && record.target.classList.contains('week-track')) window.slowRelease.styleWrites++;
              if (window.visibleReleasePanels.some(panel => panel.contains(record.target))) window.slowRelease.visibleChanges += record.addedNodes.length + record.removedNodes.length;
            }
          });
          window.slowObserver.observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
        })()`);
        await touch('touchEnd'); await sleep(55);
        assert.equal(await shownWeek(), 4, `v${version} slow release also updates headings without waiting for the endpoint`);
        assert.match(await evaluate(`document.querySelector('.week-track').style.transition`), /cubic-bezier/, `v${version} uses compositor CSS settling`);
        await sleep(350);
        const release = await evaluate(`window.slowObserver.disconnect(); ({ ...window.slowRelease, visibleRetained: window.visibleReleasePanels.every(panel => panel.isConnected) })`);
        assert.ok(release.styleWrites <= 3, `v${version} does not write the transform every release frame`);
        assert.equal(release.visibleChanges, 0, `v${version} preserves visible course DOM while preparing distant weeks`);
        assert.ok(release.visibleRetained, `v${version} does not replace either visible week during CSS settling`);
        assert.equal(await shownWeek(), 4, `v${version} slow deliberate drag arrives at next week`);
        await touch('touchStart', 90); await touch('touchMove', 95); await sleep(120); await touch('touchEnd'); await sleep(350);
        assert.equal(await shownWeek(), 4, `v${version} tiny slow return stays on the same week`);
        const centered = await evaluate(`new DOMMatrixReadOnly(getComputedStyle(document.querySelector('.week-track')).transform).m41`);
        assert.ok(Math.abs(centered + 3 * 390) < 1, `v${version} tiny return completely centers the track`);
        checks.push(`v${version}: 8 forward and 8 reverse uniform rapid releases, per-release week/month/date-range updates and preload progress, CSS settling preserves visible course DOM, tiny slow return`);
      }
      // Returning to an already visited week must not reveal an old scroll offset.
      await chooseWeek(3);
      if (version !== 1) await evaluate(`window.retainedWeekPanel = document.querySelector('.calendar-native .week-content[data-week="3"]')`);
      await evaluate(`(() => { const visible = Array.from(document.querySelectorAll('.calendar-scroll .uni-scroll-view')).filter(e => { const r=e.getBoundingClientRect(); return r.left >= 0 && r.left < 20 && e.scrollHeight>e.clientHeight }); visible.forEach(e => e.scrollTop=e.scrollHeight) })()`);
      await sleep(100);
      await swipe(290, 90); await sleep(450);
      if (version !== 1) assert.equal(await evaluate(`document.querySelector('.calendar-native .week-content[data-week="3"]') === window.retainedWeekPanel`), true, `v${version} retains departed week DOM when resetting scroll`);
      await touch('touchStart', 90); await touch('touchMove', 220); await sleep(30);
      const incomingScroll = await evaluate(`Array.from(document.querySelectorAll('.calendar-scroll .uni-scroll-view')).filter(e => { const r=e.getBoundingClientRect(); return r.right > 0 && r.left < 0 && e.scrollHeight>e.clientHeight }).map(e => e.scrollTop)`);
      assert.ok(incomingScroll.length > 0 && incomingScroll.every(top => top < 1), `v${version} previous week prepared at top`);
      await touch('touchEnd'); await sleep(450);
      const screenshot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(out, comparisonMode ? `version-${version}.png` : 'release-v2.png'), Buffer.from(screenshot.data, 'base64'));
      await chooseWeek(1);
      await swipe(100, 280); await sleep(400);
      assert.equal(await shownWeek(), 1, `v${version} first week boundary`);
      await chooseWeek(3);
      await touch('touchStart', 280); await touch('touchMove', 180); await touch('touchCancel'); await sleep(400);
      assert.equal(await shownWeek(), 3, `v${version} cancelled gesture`);
      await evaluate(`document.querySelector('.week-select').click()`);
      await waitFor(`document.querySelectorAll('.week-option').length > 0`);
      const lastWeek = await evaluate(`document.querySelectorAll('.week-option').length`);
      await evaluate(`Array.from(document.querySelectorAll('.week-option')).at(-1).click()`);
      await waitFor(`!document.querySelector('.sheet-backdrop')`);
      await swipe(280, 90); await sleep(400);
      assert.equal(await shownWeek(), lastWeek, `v${version} last week boundary`);
      checks.push(`v${version}: forward/back, small return, animation interruption, repeated swipes, chronological dates, scroll reset, semester boundaries, touchcancel`);
    }
    if (comparisonMode) {
      // All three modes preserve selection, and their controllers unmount cleanly.
      await send('Page.reload');
      await waitFor(`Boolean(document.querySelector('#calendar-native-v3-root'))`);
      for (const version of [1, 2, 3, 2]) {
        await chooseVersion(version);
        await chooseWeek(3);
        await swipe(280, 110); await sleep(400);
        assert.equal(await shownWeek(), 4, `v${version} still swipes after mode switches`);
      }
      checks.push('version three persists after reload; repeated switching among all three remains functional');
    } else {
      for (const legacyVersion of [1, 3]) {
        // Same numeric storage encoding used by uni.setStorageSync on H5.
        await evaluate(`localStorage.setItem('lakeside:swipe-version:v2-performance', JSON.stringify({type:'number', data:${legacyVersion}}))`);
        await send('Page.reload');
        await waitFor(`Boolean(document.querySelector('#calendar-native-root'))`);
        assert.equal(await evaluate(`Boolean(document.querySelector('#calendar-swipe-root, #calendar-native-v3-root'))`), false, 'legacy alternative is never mounted');
        await evaluate(`document.querySelector('[aria-label="预览设置"],[aria-label="课表设置"]').click()`);
        await waitFor(`Boolean(document.querySelector('.sheet-backdrop'))`);
        assert.equal(await evaluate(`Boolean(document.querySelector('.swipe-comparison, .swipe-version-options'))`), false, 'comparison UI is absent, not just visually hidden');
        assert.equal(await evaluate(`document.querySelectorAll('.preference-row').length`), 4, 'teacher, assessment, section and reduced-motion settings are present');
        await evaluate(`document.querySelector('.sheet-backdrop .close-button').click()`);
        await waitFor(`!document.querySelector('.sheet-backdrop')`);
        await chooseWeek(3);
        await swipe(280, 110); await sleep(400);
        assert.equal(await shownWeek(), 4, `legacy v${legacyVersion} preference cannot override the release pager`);
      }
      await chooseWeek(3);
      await evaluate(`window.examSample = document.querySelector('.week-content[data-week="3"] .tile-exam').textContent; window.teacherCount = document.querySelectorAll('.tile-teacher').length`);
      await evaluate(`document.querySelector('[aria-label="预览设置"],[aria-label="课表设置"]').click()`);
      await waitFor(`Boolean(document.querySelector('[aria-label="展示考核方式"]'))`);
      assert.equal(await evaluate(`document.querySelector('[aria-label="展示考核方式"]').getAttribute('aria-checked')`), 'true', 'assessments are shown by default');
      await evaluate(`document.querySelector('[aria-label="展示考核方式"]').click()`);
      await waitFor(`!document.querySelector('.tile-exam')`);
      assert.equal(await evaluate(`document.querySelector('[aria-label="展示考核方式"]').getAttribute('aria-checked')`), 'false', 'assessment switch reflects the hidden state');
      assert.equal(await evaluate(`document.querySelectorAll('.tile-teacher').length === window.teacherCount`), true, 'hiding assessments leaves teacher display unchanged');
      assert.equal(await evaluate(`[...document.querySelectorAll('.course-tile')].some(card => card.getAttribute('aria-label').includes(window.examSample))`), false, 'hidden assessment is also omitted from card accessibility labels');
      await evaluate(`document.querySelector('.sheet-backdrop .close-button').click()`);
      await waitFor(`!document.querySelector('.sheet-backdrop')`);
      await chooseWeek(4);
      assert.equal(await evaluate(`document.querySelectorAll('.tile-exam').length`), 0, 'assessment preference also applies to newly loaded weeks');
      await chooseWeek(3);
      await evaluate(`document.querySelector('.week-content[data-week="3"] .course-tile').click()`);
      await waitFor(`Boolean(document.querySelector('.detail-title'))`);
      assert.equal(await evaluate(`document.querySelector('.detail-info').textContent.includes(window.examSample)`), true, 'full course details retain assessment information');
      await evaluate(`document.querySelector('.sheet-backdrop .close-button').click()`);
      await waitFor(`!document.querySelector('.sheet-backdrop')`);
      await evaluate(`document.querySelector('.week-content[data-week="3"] .day-heading').click()`);
      await waitFor(`Boolean(document.querySelector('.today-heading'))`);
      await evaluate(`document.querySelector('.sheet-backdrop .close-button').click()`);
      await waitFor(`!document.querySelector('.sheet-backdrop')`);
      checks.push('release ignores saved v1/v3 choices; settings have no comparison UI; course details and day views still work');
      await evaluate(`document.querySelector('[aria-label="预览设置"],[aria-label="课表设置"]').click()`);
      await waitFor(`Boolean(document.querySelector('[aria-label="展示考核方式"]'))`);
      await evaluate(`document.querySelector('[aria-label="展示考核方式"]').click()`);
      await waitFor(`Boolean(document.querySelector('.week-content[data-week="3"] .tile-exam'))`);
      assert.equal(await evaluate(`document.querySelector('.week-content[data-week="3"] .tile-exam').textContent === window.examSample`), true, 'turning assessment display back on restores its original text');
      await evaluate(`document.querySelector('.sheet-backdrop .close-button').click()`);
      await waitFor(`!document.querySelector('.sheet-backdrop')`);
      checks.push('assessment display: default on, live toggle, accessibility labels, newly loaded weeks, details preserved and display restored');
    }
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(out, comparisonMode ? 'report.json' : 'report-release.json'), JSON.stringify({ checks, settleTimings, errors }, null, 2));
    console.log(JSON.stringify({ checks, settleTimings, errors, out }, null, 2));
    await send('Browser.close', {}, false);
  } finally {
    socket?.close();
    child.kill();
    server.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
