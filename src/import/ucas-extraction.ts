export type UcasExtractionAction = 'personal' | 'detail' | 'course-meta' | 'auto'

export interface UcasExtractionConfig {
  storageKey: string
  kind: string
  action?: UcasExtractionAction
  detailOrigin?: string
  fallbackName?: string
}

/**
 * Read one authenticated document and return a small, versioned packet through
 * the temporary HTML5+ bridge. HTML, cookies and form fields stay in the
 * school WebView; only the fields needed by the app cross the bridge.
 */
export function createCurrentUcasExtractionScript(config: UcasExtractionConfig): string {
  const action = config.action || (config.fallbackName ? 'detail' : 'auto')
  const detailOrigin = config.detailOrigin || 'https://xkcts.ucas.ac.cn:8443'
  return String.raw`;(function () {
  var KEY = ${JSON.stringify(config.storageKey)};
  var KIND = ${JSON.stringify(config.kind)};
  var ACTION = ${JSON.stringify(action)};
  var DETAIL_ORIGIN = ${JSON.stringify(detailOrigin)};
  var COURSE_ORIGIN = 'https://xkgo.ucas.ac.cn:3000';
  var PERSONAL_ROUTE = '/course/personSchedule';
  var SELECTED_ROUTE = '/courseManage/selectedCourse';
  var FALLBACK_NAME = ${JSON.stringify(config.fallbackName || '')};
  var STATUS_ID = '__lakeside-ucas-import-status__';
  var PATH = String(location.pathname || '').toLowerCase();
  if (ACTION === 'auto') {
    if (/coursetime/.test(PATH)) ACTION = 'detail';
    else if (PATH.indexOf(SELECTED_ROUTE.toLowerCase()) >= 0 || PATH.indexOf('/coursemanage/main') >= 0) ACTION = 'course-meta';
    else ACTION = 'personal';
  }
  var RUN_KEY = '__lakeside_ucas_reader_' + ACTION;
  if (window[RUN_KEY] === true) return;
  window[RUN_KEY] = true;

  function clean(value, fallback, max) {
    var text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
    return (text || fallback || '').slice(0, max || 160);
  }
  function normalized(value) { return clean(value, '', 180).replace(/[：:\s]/g, '').toLowerCase(); }
  function uniqueNumbers(values) {
    var out = [];
    for (var i = 0; i < values.length; i++) if (out.indexOf(values[i]) < 0) out.push(values[i]);
    return out.sort(function (a, b) { return a - b; });
  }
  function bridgeReady() { return Boolean(window.plus && window.plus.storage && typeof window.plus.storage.setItem === 'function'); }
  function hostName() { try { return String(location.hostname || new URL(location.href).hostname || '').toLowerCase(); } catch (_) { return ''; } }
  function isCourseHost() { var host = hostName(); return host === 'xkgo.ucas.ac.cn' || host === 'xkgodj.ucas.ac.cn'; }
  function showStatus(message, failed) {
    try {
      var node = document.getElementById(STATUS_ID);
      if (!node) {
        node = document.createElement('div');
        node.id = STATUS_ID;
        node.style.cssText = 'position:fixed!important;right:16px!important;bottom:16px!important;z-index:2147483647!important;max-width:320px!important;padding:10px 13px!important;border-radius:10px!important;background:#203047!important;color:#fff!important;font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;box-shadow:0 8px 24px rgba(32,48,71,.28)!important;pointer-events:none!important;';
        (document.body || document.documentElement).appendChild(node);
      }
      node.textContent = message;
      node.style.background = failed ? '#9c5c52' : '#203047';
    } catch (_) {}
  }
  function emit(status, message, extra) {
    if (message) showStatus(message, status === 'error');
    try {
      if (!bridgeReady()) return false;
      var packet = { kind: KIND, version: 1, status: status, message: message || '' };
      extra = extra || {};
      for (var key in extra) if (Object.prototype.hasOwnProperty.call(extra, key)) packet[key] = extra[key];
      window.plus.storage.setItem(KEY, JSON.stringify(packet));
      return true;
    } catch (_) { return false; }
    finally { if (status === 'complete' || status === 'detail-links' || status === 'course-meta' || status === 'error') window[RUN_KEY] = false; }
  }
  function waitForBridge(run) {
    var started = false, attempts = 0;
    function attempt() {
      if (started) return;
      if (!bridgeReady()) { if (attempts++ < 100) setTimeout(attempt, 150); return; }
      started = true;
      Promise.resolve().then(run).catch(function () { emit('error', '读取过程中出现问题，请返回教务课程页面后重试。'); });
    }
    document.addEventListener('plusready', attempt, false);
    attempt();
  }
  function numberList(value, max) {
    var text = clean(value, '', 500), odd = text.indexOf('单') >= 0, even = text.indexOf('双') >= 0;
    var pieces = text.match(/\d+\s*(?:[-~～至—–]\s*\d+)?/g) || [], values = [];
    for (var i = 0; i < pieces.length; i++) {
      var match = pieces[i].match(/(\d+)\s*(?:[-~～至—–]\s*(\d+))?/);
      if (!match) continue;
      var start = Number(match[1]), end = Number(match[2] || match[1]);
      if (start < 1 || end < start || end > max) continue;
      for (var n = start; n <= end; n++) if ((!odd || n % 2 === 1) && (!even || n % 2 === 0)) values.push(n);
    }
    return uniqueNumbers(values);
  }
  function weekday(value) {
    var match = String(value || '').match(/(?:星期|周|礼拜)\s*([一二三四五六日天])/);
    return match ? ({ '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 7, '天': 7 }[match[1]] || 0) : 0;
  }
  function sections(value) {
    var text = clean(value, '', 400), index = text.search(/[一二三四五六日天]/), tail = index >= 0 ? text.slice(index + 1) : text;
    var list = numberList(tail, 13);
    return list.length ? list : numberList(text, 13);
  }
  function timeValue(value) { var day = weekday(value), list = sections(value); return day && list.length ? { day: day, sections: list } : null; }
  function weeks(value) { return numberList(value, 30); }
  function cells(row) {
    var nodes = row.querySelectorAll('th, td'), values = [];
    for (var i = 0; i < nodes.length; i++) values.push(clean(nodes[i].innerText || nodes[i].textContent, '', 220));
    return values;
  }
  function place(value) {
    var text = clean(value, '地点待确认', 120).replace(/^(?:上课)?(?:地点|教室|场地)\s*[:：]?\s*/i, '').replace(/[。；;，,]+$/, '').trim();
    return !text || /^(?:-|—|——|暂无|未安排|待定|地点待确认)$/i.test(text) ? '地点待确认' : text;
  }
  function looksLocation(value) {
    var text = clean(value, '', 120);
    if (!text || timeValue(text) || /(?:第\s*\d|单周|双周)/.test(text)) return false;
    if (/^(?:课程名称|课程编码|课程代码|开课周|星期节次|教室|考试方式|主讲教师|首席教授)$/i.test(normalized(text))) return false;
    if (/学院$/.test(text)) return false;
    return /(?:教|楼|栋|室|校区|实验|机房|馆|中心|院|体育|报告厅|阶梯|会议|园|线上|腾讯|ZOOM|网络)/i.test(text) || (/\d{2,}/.test(text) && /[^\d\s]/.test(text));
  }
  function addMeeting(target, value) {
    if (!value || !value.sections || !value.weeks || !value.sections.length || !value.weeks.length) return;
    for (var i = 0; i < target.length; i++) {
      var item = target[i];
      if (item.day === value.day && item.sections.join(',') === value.sections.join(',') && item.weeks.join(',') === value.weeks.join(',')) {
        if (place(item.location) === '地点待确认' && place(value.location) !== '地点待确认') item.location = place(value.location);
        return;
      }
    }
    target.push({ day: value.day, sections: uniqueNumbers(value.sections), weeks: uniqueNumbers(value.weeks), location: place(value.location) });
  }
  function meetingFromValues(values) {
    var time = null, weekValues = [], timeIndex = -1, weekIndex = -1;
    for (var i = 0; i < values.length; i++) {
      if (!time) { time = timeValue(values[i]); if (time) timeIndex = i; }
      if (!weekValues.length && /(?:周|单双)/.test(values[i])) { weekValues = weeks(values[i]); if (weekValues.length) weekIndex = i; }
    }
    if (!time || !weekValues.length) return null;
    var location = '';
    for (var candidateIndex = 0; candidateIndex < values.length; candidateIndex++) {
      var candidate = clean(values[candidateIndex], '', 120);
      if (candidateIndex !== timeIndex && candidateIndex !== weekIndex && looksLocation(candidate)) { location = candidate; break; }
    }
    return { day: time.day, sections: time.sections, weeks: weekValues, location: place(location) };
  }
  function usefulName(value) {
    var text = clean(value, '', 120);
    return Boolean(text && /[\u4e00-\u9fffA-Za-z]/.test(text) && !/^(?:序号|课程名称|课程名|课程编码|课程代码|开课单位|课程属性|培养层次|所属学科\/?专业|课时\/?学分|限选|已选|开课周|星期节次|教室|授课方式|考试方式|首席教授|主讲教师|助教|教学|学位课)$/.test(text));
  }
  function courseName(values, row) {
    if (values.length >= 12 && usefulName(values[3])) return values[3];
    var anchors = row.querySelectorAll('a');
    for (var i = 0; i < anchors.length; i++) { var text = clean(anchors[i].innerText || anchors[i].textContent, '', 100); if (usefulName(text)) return text; }
    return '';
  }
  function courseCode(values, row) {
    var pattern = /^(?=.*\d)(?=.*[A-Za-z])[A-Za-z0-9][A-Za-z0-9-]{7,}$/;
    for (var i = 0; i < values.length; i++) if (pattern.test(clean(values[i], '', 80))) return clean(values[i], '', 80);
    try { var match = String(row.outerHTML || '').match(/(?:courseCode|course-code|courseId|course_id|courseid|课程编码|课程代码)[^\dA-Za-z]*([\dA-Za-z-]{8,})/i); if (match && pattern.test(match[1])) return match[1]; } catch (_) {}
    return '';
  }
  function addCourse(target, value) {
    if (!value || !value.name || !value.meetings || !value.meetings.length) return;
    var existing = null;
    for (var i = 0; i < target.length; i++) if (target[i].name === value.name && (!value.code || !target[i].code || target[i].code === value.code)) { existing = target[i]; break; }
    if (!existing) { existing = { name: value.name, teacher: '教师待确认', meetings: [] }; if (value.code) existing.code = value.code; target.push(existing); }
    if (!existing.code && value.code) existing.code = value.code;
    for (var j = 0; j < value.meetings.length; j++) addMeeting(existing.meetings, value.meetings[j]);
  }
  function coursesFromRows(doc) {
    var rows = doc.querySelectorAll('tr'), courses = [], previous = '';
    for (var i = 0; i < rows.length; i++) {
      var values = cells(rows[i]), meeting = meetingFromValues(values), name = courseName(values, rows[i]) || previous;
      if (!meeting || !name) continue;
      var code = courseCode(values, rows[i]), item = { name: name, teacher: '教师待确认', meetings: [meeting] };
      if (code) item.code = code;
      addCourse(courses, item); previous = name;
    }
    return courses;
  }
  function detailId(raw) {
    var text = String(raw || '').replace(/&amp;/gi, '&').replace(/\\\//g, '/');
    try { if (/%(?:2f|3a|3d|27|22|3f)/i.test(text)) text = decodeURIComponent(text); } catch (_) {}
    var match = text.match(/(?:^|[^\d])(?:course\/coursetime|coursetime)[^\d]{0,40}(\d{3,})/i);
    if (!match) match = text.match(/(?:course(?:Time)?Id|course_id|courseid|coursetimeid)[\\/\s:=?'"-]*(\d{3,})/i);
    return match ? match[1] : '';
  }
  function safeDetailUrl(raw, base) {
    var id = detailId(raw); if (!id) return '';
    var direct = String(DETAIL_ORIGIN || '').replace(/\/$/, '') + '/course/coursetime/' + id, navigation = '';
    try {
      var candidate = new URL(String(raw || '').trim(), base), origin = candidate.origin.toLowerCase();
      if ((origin === 'https://xkcts.ucas.ac.cn:8443' || origin === 'https://jwxk.ucas.ac.cn') && /^\/course\/coursetime\/\d+\/?$/i.test(candidate.pathname) && detailId(candidate.pathname) === id) direct = candidate.href;
      else if (origin === 'https://sep.ucas.ac.cn' && /^\/portal\/site\//i.test(candidate.pathname)) navigation = candidate.href;
    } catch (_) {}
    return { url: direct, navigationUrl: navigation && navigation !== direct ? navigation : '' };
  }
  function detailLinks(doc, base) {
    var nodes = [], selectors = ['a[href], a', '[data-href]', '[data-url]', '[onclick]'];
    for (var s = 0; s < selectors.length; s++) { var list = doc.querySelectorAll(selectors[s]); for (var n = 0; n < list.length; n++) if (nodes.indexOf(list[n]) < 0) nodes.push(list[n]); }
    var links = [], seen = {};
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i], raw = '', found = null, attrs = ['href', 'data-href', 'data-url', 'data-link', 'onclick'];
      for (var a = 0; a < attrs.length && !found; a++) {
        var candidate = '';
        try { candidate = node.getAttribute(attrs[a]) || ''; } catch (_) {}
        if (!candidate) continue;
        var candidateFound = safeDetailUrl(candidate, base);
        if (candidateFound) { raw = candidate; found = candidateFound; }
      }
      if (!found) { try { raw = String(node.outerHTML || ''); } catch (_) {} found = safeDetailUrl(raw, base); }
      if (!found || seen[found.url]) continue;
      seen[found.url] = true;
      var record = { url: found.url, label: clean(node.innerText || node.textContent, '课程详情', 100) };
      if (found.navigationUrl) record.navigationUrl = found.navigationUrl;
      links.push(record);
    }
    return links;
  }
  function fieldValues(doc, labels) {
    var values = [];
    function add(value) { var text = clean(value, '', 180); if (text && values.indexOf(text) < 0) values.push(text); }
    var rows = doc.querySelectorAll('tr');
    for (var i = 0; i < rows.length; i++) { var row = cells(rows[i]); for (var j = 0; j < labels.length; j++) if (normalized(row[0]) === normalized(labels[j])) add(row.slice(1).join(' ')); }
    var body = String(doc.body && (doc.body.innerText || doc.body.textContent) || '').split(/\n+/);
    for (var lineIndex = 0; lineIndex < body.length; lineIndex++) {
      var line = clean(body[lineIndex], '', 260);
      for (var labelIndex = 0; labelIndex < labels.length; labelIndex++) { var offset = line.indexOf(labels[labelIndex]); if (offset >= 0) add(line.slice(offset + labels[labelIndex].length).replace(/^\s*[:：]?\s*/, '')); }
    }
    return values;
  }
  function field(doc, labels) { return fieldValues(doc, labels)[0] || ''; }
  function detailFields(doc) {
    var specs = [{ kind: 'time', labels: ['上课时间', '课程时间'] }, { kind: 'location', labels: ['上课地点', '地点', '教室', '场地'] }, { kind: 'weeks', labels: ['上课周次', '上课周', '周次'] }], result = [];
    function add(kind, value) { var text = clean(value, '', 220); if (text && !specs.some(function (spec) { return spec.labels.some(function (label) { return normalized(text) === normalized(label); }); })) result.push({ kind: kind, value: text }); }
    var rows = doc.querySelectorAll('tr');
    for (var r = 0; r < rows.length; r++) {
      var values = cells(rows[r]), first = values[0] || '';
      for (var s = 0; s < specs.length; s++) {
        var spec = specs[s], firstText = normalized(first), matched = false;
        for (var l = 0; l < spec.labels.length; l++) if (firstText.indexOf(normalized(spec.labels[l])) === 0) { matched = true; var rest = first.slice(spec.labels[l].length).replace(/^\s*[:：]?\s*/, ''); if (rest) add(spec.kind, rest); for (var v = 1; v < values.length; v++) add(spec.kind, values[v]); break; }
        if (matched) break;
      }
    }
    if (!result.length) {
      var body = String(doc.body && (doc.body.innerText || doc.body.textContent) || '').split(/\n+/);
      for (var b = 0; b < body.length; b++) for (var bs = 0; bs < specs.length; bs++) for (var bl = 0; bl < specs[bs].labels.length; bl++) { var offset = body[b].indexOf(specs[bs].labels[bl]); if (offset >= 0) add(specs[bs].kind, body[b].slice(offset + specs[bs].labels[bl].length).replace(/^\s*[:：]?\s*/, '')); }
    }
    return result;
  }
  function splitTimes(value) { var text = clean(value, '', 220), chunks = text.split(/(?=(?:星期|周|礼拜)\s*[一二三四五六日天])/).filter(Boolean); return chunks.length ? chunks : [text]; }
  function detailMeetingGroups(doc) {
    var fields = detailFields(doc), groups = [], current = null, cursor = { location: 0, weeks: 0 };
    function newGroup() { current = { time: '', location: '', weeks: '' }; groups.push(current); return current; }
    function assign(kind, value) { var target = null; for (var i = cursor[kind]; i < groups.length; i++) if (!groups[i][kind]) { target = groups[i]; cursor[kind] = i + 1; break; } if (!target) target = current || newGroup(); target[kind] = value; }
    for (var i = 0; i < fields.length; i++) { if (fields[i].kind === 'time') { var times = splitTimes(fields[i].value); for (var t = 0; t < times.length; t++) { if (current && (current.time || current.location || current.weeks)) current = null; newGroup().time = times[t]; } } else assign(fields[i].kind, fields[i].value); }
    ['location', 'weeks'].forEach(function (kind) { var values = fields.filter(function (item) { return item.kind === kind; }); if (values.length === 1 && groups.length > 1) for (var i = 0; i < groups.length; i++) if (!groups[i][kind]) groups[i][kind] = values[0].value; });
    return groups;
  }
  function parseDetail(doc) {
    var name = field(doc, ['课程名称', '课程名']);
    if (!name) { var title = doc.querySelector('.course-name, .courseName, .mc-title, h1, h2, h3'); name = clean(title && (title.innerText || title.textContent), FALLBACK_NAME || '当前课程', 100); }
    var code = field(doc, ['课程编码', '课程代码', '课程号']), meetings = [], groups = detailMeetingGroups(doc);
    for (var i = 0; i < groups.length; i++) { var time = timeValue(groups[i].time), list = weeks(groups[i].weeks); if (time && list.length) addMeeting(meetings, { day: time.day, sections: time.sections, weeks: list, location: place(groups[i].location) }); }
    if (!meetings.length) { var rows = doc.querySelectorAll('tr'); for (var r = 0; r < rows.length; r++) addMeeting(meetings, meetingFromValues(cells(rows[r]))); }
    var parsed = { name: name, teacher: '教师待确认', meetings: meetings }; if (code) parsed.code = code; return parsed;
  }

  function usefulMetaName(value) {
    var text = clean(value, '', 120);
    return Boolean(text && /[\u4e00-\u9fffA-Za-z]/.test(text) && !/^(?:序号|课程名称|课程名|课程编码|课程代码|开课单位|课程属性|培养层次|所属学科\/?专业|课时\/?学分|限选|已选|开课周|星期节次|教室|授课方式|考试方式|首席教授|主讲教师|助教|教学|学位课|是否学位课|删除)$/.test(text));
  }
  function usefulMetaTeacher(value) {
    var text = clean(value, '', 100).replace(/\s+/g, '');
    return Boolean(text && /[\u4e00-\u9fffA-Za-z]/.test(text) && !/^(?:主讲教师|授课教师|任课教师|首席教授|教师|暂无|未安排|待定|请选择|无|-|—|——)$/.test(text));
  }
  function metaDegree(value) { var text = clean(value, '', 40).replace(/\s+/g, ''); if (/^是/.test(text)) return true; if (/^否/.test(text)) return false; return undefined; }
  function metaHeader(values) {
    var header = { name: -1, code: -1, teacher: -1, degree: -1, exam: -1 };
    for (var i = 0; i < values.length; i++) {
      var key = normalized(values[i]);
      if (header.name < 0 && /课程名称|课程名/.test(key)) header.name = i;
      if (header.code < 0 && /课程编码|课程代码|课程号/.test(key)) header.code = i;
      if (header.teacher < 0 && /主讲教师|授课教师|任课教师|首席教授/.test(key)) header.teacher = i;
      if (header.degree < 0 && /学位课|是否学位/.test(key)) header.degree = i;
      if (header.exam < 0 && /考试方式/.test(key)) header.exam = i;
    }
    return header.name >= 0 && (header.code >= 0 || header.teacher >= 0 || header.degree >= 0 || header.exam >= 0) ? header : null;
  }
  function addMeta(target, value) {
    if (!value || !value.name) return;
    var key = value.code ? 'code:' + normalized(value.code) : 'name:' + normalized(value.name), existing = null;
    for (var i = 0; i < target.length; i++) if ((target[i].code ? 'code:' + normalized(target[i].code) : 'name:' + normalized(target[i].name)) === key) { existing = target[i]; break; }
    if (!existing) { target.push(value); return; }
    if (!existing.code && value.code) existing.code = value.code;
    if (!existing.teacher && value.teacher) existing.teacher = value.teacher;
    if (existing.isDegreeCourse === undefined && value.isDegreeCourse !== undefined) existing.isDegreeCourse = value.isDegreeCourse;
    if (!existing.exam && value.exam) existing.exam = value.exam;
  }
  function courseMetaRows(doc) {
    var tables = doc.querySelectorAll('table'), records = [];
    for (var t = 0; t < tables.length; t++) {
      var rows = tables[t].querySelectorAll('tr'), header = null;
      for (var h = 0; h < rows.length; h++) { header = metaHeader(cells(rows[h])); if (header) { header.row = h; break; } }
      if (!header) continue;
      for (var r = header.row + 1; r < rows.length; r++) {
        var values = cells(rows[r]), name = clean(values[header.name], '', 120);
        if (!usefulMetaName(name)) { var anchors = rows[r].querySelectorAll('a'); for (var a = 0; a < anchors.length && !usefulMetaName(name); a++) name = clean(anchors[a].innerText || anchors[a].textContent, '', 120); }
        if (!usefulMetaName(name)) continue;
        var record = { name: name };
        if (header.code >= 0 && clean(values[header.code], '', 80)) record.code = clean(values[header.code], '', 80);
        if (header.teacher >= 0 && usefulMetaTeacher(values[header.teacher])) record.teacher = clean(values[header.teacher], '', 100);
        if (header.degree >= 0) { var degree = metaDegree(values[header.degree]); if (degree !== undefined) record.isDegreeCourse = degree; }
        if (header.exam >= 0) { var exam = clean(values[header.exam], '', 80); if (exam && !/^(?:考试方式|暂无|未安排|待定|请选择|无|-|—|——)$/.test(exam)) record.exam = exam; }
        addMeta(records, record);
      }
    }
    return records;
  }
  function isBadResponse(response, html) { return !response || !response.ok || /sep\.ucas\.ac\.cn/i.test(String(response.url || '')) || /会话已失效|身份已改变|请重新登录|登录失效|认证失效|登录失败/.test(clean(html, '', 3000)); }
  async function fetchMetaPages() {
    if (typeof fetch !== 'function' || typeof DOMParser !== 'function') return [];
    var records = [], routes = [], currentPath = String(location.pathname || '') + String(location.search || '');
    if (/^\/courseManage\/main(?:-[A-Za-z0-9]+)?(?:[/?#]|$)/i.test(currentPath) || /^\/courseManage\/selectedCourse(?:[/?#]|$)/i.test(currentPath)) routes.push(currentPath);
    routes.push(SELECTED_ROUTE, '/courseManage/main');
    routes = routes.filter(function (route, index) { return routes.indexOf(route) === index; });
    for (var i = 0; i < routes.length; i++) {
      try {
        var response = await fetch(routes[i], { credentials: 'include', cache: 'no-store' }), html = await response.text();
        if (isBadResponse(response, html)) continue;
        var parsed = new DOMParser().parseFromString(html, 'text/html'), found = courseMetaRows(parsed);
        for (var f = 0; f < found.length; f++) addMeta(records, found[f]);
        if (records.length) break;
      } catch (_) {}
    }
    return records;
  }
  var metaAttempts = 0;
  async function runCourseMeta() {
    if (!isCourseHost()) { emit('course-meta', '当前不是选课系统页面，未读取课程信息。', { courseMeta: [], failures: ['选课系统页面未打开'] }); return; }
    emit('progress', '正在读取选修课程中的课程代码、教师和考试信息…');
    var records = courseMetaRows(document);
    if (!records.length) records = await fetchMetaPages();
    if (!records.length && metaAttempts++ < 24) { setTimeout(runCourseMeta, 500); return; }
    var failures = [];
    for (var i = 0; i < records.length; i++) {
      var missing = [];
      if (!records[i].code) missing.push('课程代码');
      if (!records[i].teacher) missing.push('主讲教师');
      if (records[i].isDegreeCourse === undefined) missing.push('是否学位课');
      if (!records[i].exam) missing.push('考试方式');
      if (missing.length) failures.push('课程「' + records[i].name + '」：未读取' + missing.join('、'));
    }
    emit('course-meta', records.length ? '已读取 ' + records.length + ' 门课程的课程信息。' : '未找到选修课程列表，请确认页面已加载完成。', { courseMeta: records, failures: failures });
  }
  async function runPersonal() {
    if (!isCourseHost()) { emit('error', '请先从 SEP 进入国科大选课系统，并打开个人课表页面。'); return; }
    emit('progress', '正在读取个人课表中的上课安排…');
    var courses = coursesFromRows(document), links = detailLinks(document, location.href);
    if (links.length) { emit('detail-links', '已找到 ' + links.length + ' 个课程详情，正在读取上课安排…', { courses: courses, failures: [], detailLinks: links }); return; }
    if (courses.length) { emit('complete', '已读取个人课表。', { courses: courses, failures: [] }); return; }
    emit('error', '没有找到课程详情链接，请先打开个人课表并点击课程后重试。');
  }
  async function runDetail() {
    if (hostName() !== 'xkcts.ucas.ac.cn' && hostName() !== 'jwxk.ucas.ac.cn') { emit('error', '当前不是课程时间地点页面。'); return; }
    emit('progress', '正在读取课程时间、地点和周次…');
    var course = parseDetail(document);
    if (course.name && course.meetings.length) emit('complete', '已读取课程详情。', { courses: [course], failures: [] });
    else emit('error', '课程详情页未读到完整的时间、地点或周次。');
  }
  function run() { if (ACTION === 'detail') return runDetail(); if (ACTION === 'course-meta') return runCourseMeta(); return runPersonal(); }
  waitForBridge(run);
})();`
}

/** Follow an intermediate SEP page when a course-time link uses a portal URL. */
export function createCurrentUcasPortalHandoffScript(config: Omit<UcasExtractionConfig, 'action'>): string {
  const detailOrigin = (config.detailOrigin || 'https://xkcts.ucas.ac.cn:8443').replace(/\/$/, '')
  return String.raw`;(function () {
  function isSep() { try { return location.origin.toLowerCase() === 'https://sep.ucas.ac.cn'; } catch (_) { return false; } }
  if (!isSep() || window.__lakesideUcasPortalGuard) return;
  window.__lakesideUcasPortalGuard = true;
  var KEY = ${JSON.stringify(config.storageKey)}, KIND = ${JSON.stringify(config.kind)};
  var DETAIL_ORIGIN = ${JSON.stringify(detailOrigin)}, COURSE_ORIGIN = /^\/portal\/site\/524\//i.test(location.pathname) ? 'https://xkgodj.ucas.ac.cn' : 'https://xkgo.ucas.ac.cn:3000';
  function blocked(url) { return /https:\/\/(?:xkgo\.ucas\.ac\.cn:3000|xkgodj\.ucas\.ac\.cn)\/user\/logout(?:[/?#]|$)/i.test(String(url || '')); }
  function guardLogout() {
    try {
      var NativeXHR = window.XMLHttpRequest, proto = NativeXHR && NativeXHR.prototype;
      if (proto && !proto.__lakesideLogoutGuard) {
        var nativeOpen = proto.open, nativeSend = proto.send;
        proto.open = function (method, url) { this.__lakesideLogoutBlocked = blocked(url); if (this.__lakesideLogoutBlocked) return nativeOpen.call(this, method, '/__lakeside_logout_blocked__'); return nativeOpen.apply(this, arguments); };
        proto.send = function () { if (this.__lakesideLogoutBlocked) { try { this.abort(); } catch (_) {} return; } return nativeSend.apply(this, arguments); };
        proto.__lakesideLogoutGuard = true;
      }
    } catch (_) {}
    try {
      var nativeFetch = window.fetch;
      if (typeof nativeFetch === 'function' && !nativeFetch.__lakesideLogoutGuard) {
        var guardedFetch = function (input) { var url = typeof input === 'string' ? input : input && input.url; if (blocked(url)) { var Ctor = window.Response || (typeof Response !== 'undefined' ? Response : null); return Ctor ? Promise.resolve(new Ctor('', { status: 204 })) : Promise.resolve({ ok: true, status: 204, text: function () { return Promise.resolve(''); } }); } return nativeFetch.apply(window, arguments); };
        guardedFetch.__lakesideLogoutGuard = true; window.fetch = guardedFetch;
      }
    } catch (_) {}
  }
  function emit(message) { try { if (window.plus && window.plus.storage) window.plus.storage.setItem(KEY, JSON.stringify({ kind: KIND, version: 1, status: 'progress', message: message })); } catch (_) {} }
  function target(raw) {
    try {
      var text = String(raw || '').replace(/&amp;/gi, '&').replace(/\\\//g, '/').trim(); if (!text) return '';
      if (/^(?:\/|\.\/|\.\.\/)course\/coursetime\/\d+(?:[/?#]|$)/i.test(text)) return DETAIL_ORIGIN + '/' + text.replace(/^(?:\/|\.\/|\.\.\/)+/, '');
      if (/^(?:\/|\.\/|\.\.\/)course(?:Manage)?(?:[/?#]|$)/i.test(text)) return COURSE_ORIGIN + '/' + text.replace(/^(?:\/|\.\/|\.\.\/)+/, '');
      var url = new URL(text, location.href), origin = url.origin.toLowerCase(), path = url.pathname + url.search + url.hash;
      if (origin === 'https://sep.ucas.ac.cn' && /^\/portal\/site\//i.test(url.pathname)) return url.href;
      if ((origin === 'https://xkgo.ucas.ac.cn:3000' || origin === 'https://xkgodj.ucas.ac.cn') && /^\/(?:courseManage(?:[/?#]|$)|course\/personSchedule(?:[/?#]|$))/i.test(path)) return url.href;
      if (origin === DETAIL_ORIGIN.toLowerCase() && /^\/(?:login|main|redirect|course\/coursetime\/\d+)(?:[/?#]|$)/i.test(path)) return url.href;
    } catch (_) {}
    return '';
  }
  function guardOpen() {
    try { var nativeOpen = window.open; if (typeof nativeOpen !== 'function' || nativeOpen.__lakesidePortalGuard) return; var guardedOpen = function (raw) { var next = target(raw); if (next) { emit('正在通过当前窗口打开课程页面…'); try { location.href = next; } catch (_) {} return null; } return nativeOpen.apply(window, arguments); }; guardedOpen.__lakesidePortalGuard = true; window.open = guardedOpen; } catch (_) {}
  }
  function run() {
    guardLogout(); guardOpen();
    var metas = document.querySelectorAll('meta[http-equiv="refresh"], meta[http-equiv="Refresh"]'), raw = '';
    for (var i = 0; i < metas.length && !raw; i++) { var content = metas[i].getAttribute('content') || '', match = content.match(/url\s*=\s*(.+)$/i); if (match) raw = match[1].replace(/^['"]|['"]$/g, '').trim(); }
    if (!raw) { var markup = String(document.documentElement && document.documentElement.innerHTML || ''), found = markup.match(/https?:\/\/[^'"\s<>]*(?:xkcts\.ucas\.ac\.cn[^'"\s<>]*|course\/coursetime\/\d+[^'"\s<>]*)/i); raw = found ? found[0] : ''; }
    var next = target(raw); if (next) { emit('正在完成教务页面跳转…'); try { location.replace(next); } catch (_) { location.href = next; } }
  }
  guardLogout(); guardOpen(); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, false); else run();
})();`
}
