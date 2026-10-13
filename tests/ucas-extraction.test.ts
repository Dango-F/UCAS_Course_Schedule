import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { createCurrentUcasExtractionScript, createCurrentUcasPortalHandoffScript } from '../src/import/ucas-extraction'
import { createUcasExtractionScript } from '../src/import/ucas'

const courseOrigin = 'https://xkgo.ucas.ac.cn:3000'
const detailOrigin = 'https://xkcts.ucas.ac.cn:8443'

function cell(text: string, header = false) {
  return { innerText: text, textContent: text, querySelectorAll: (selector: string) => selector === 'a' ? [] : [], ...(header ? { tagName: 'TH' } : {}) }
}

function row(values: string[], anchors: Record<number, string> = {}) {
  const cells = values.map((value, index) => ({ ...cell(value), querySelectorAll: (selector: string) => selector === 'a' && anchors[index] ? [{ innerText: anchors[index], textContent: anchors[index] }] : [] }))
  return { querySelectorAll: (selector: string) => selector === 'th, td' ? cells : selector === 'a' ? Object.values(anchors).map(value => ({ innerText: value, textContent: value })) : [], innerText: values.join(' '), textContent: values.join(' ') }
}

function link(text: string, attrs: Record<string, string>) {
  return {
    innerText: text,
    textContent: text,
    getAttribute: (name: string) => attrs[name] || '',
    querySelectorAll: () => [],
  }
}

function documentFor(tableRows: ReturnType<typeof row>[]) {
  const table = { querySelectorAll: (selector: string) => selector === 'tr' ? tableRows : [] }
  const body = { innerText: '', textContent: '', appendChild() {} }
  return {
    body,
    documentElement: { ...body, innerHTML: '' },
    querySelectorAll: (selector: string) => selector === 'table' ? [table] : [],
    querySelector: () => null,
    getElementById: () => null,
    createElement: () => ({ style: {}, textContent: '' }),
    addEventListener() {},
  }
}

function runScript(script: string, document: Record<string, unknown>, pathname: string, fetch?: unknown, origin = courseOrigin): Promise<Map<string, string>> {
  const values = new Map<string, string>()
  const context: Record<string, any> = {
    window: { plus: { storage: { setItem(key: string, value: string) { values.set(key, value) } } } },
    document,
    location: { origin, hostname: new URL(origin).hostname, pathname, href: `${origin}${pathname}` },
    URL,
    Promise,
    setTimeout,
    clearTimeout,
    console: { info() {}, warn() {}, error() {} },
  }
  if (fetch) {
    context.fetch = fetch
    context.DOMParser = class { parseFromString() { return document } }
  }
  runInNewContext(script, context)
  return new Promise(resolve => setTimeout(() => resolve(values), 25))
}

describe('选修课程页面元数据读取', () => {
  it('读取课程代码、主讲教师、学位课和考试方式，并保留非学位课', async () => {
    const document = documentFor([
      row(['课程编码', '课程名称', '学位课', '考试方式', '主讲教师']),
      row(['180080070100M1004H', '抽象代数II', '是 修改', '闭卷笔试', '杨君涛']),
      row(['180087120100MX048H', '智慧物流', '否', '课程开卷', '兰舒琳']),
    ])
    const script = createCurrentUcasExtractionScript({ storageKey: 'meta', kind: 'lakeside-ucas-import', action: 'course-meta' })
    const values = await runScript(script, document, '/courseManage/main-202628009029003')
    const packet = JSON.parse(values.get('meta') || '{}')
    expect(packet.status).toBe('course-meta')
    expect(packet.courseMeta).toEqual([
      { name: '抽象代数II', code: '180080070100M1004H', teacher: '杨君涛', isDegreeCourse: true, exam: '闭卷笔试' },
      { name: '智慧物流', code: '180087120100MX048H', teacher: '兰舒琳', isDegreeCourse: false, exam: '课程开卷' },
    ])
    expect(packet.failures).toEqual([])
  })

  it('脚本在个人课表页面也会查询同源选修课程表', async () => {
    const rows = [row(['课程编码', '课程名称', '学位课', '考试方式', '主讲教师']), row(['CODE-1', '自然语言处理', '否', '读书报告', '张老师'])]
    const html = '<html><body>课程编码 课程名称 学位课 考试方式 主讲教师</body></html>'
    const fetch = async () => ({ ok: true, url: `${courseOrigin}/courseManage/selectedCourse`, text: async () => html })
    // The parser only needs a DOMParser-like object for fetched documents. The
    // test documents the same-origin fallback contract without network access.
    const document = documentFor(rows)
    const script = createCurrentUcasExtractionScript({ storageKey: 'meta-personal', kind: 'lakeside-ucas-import', action: 'course-meta' })
    const values = await runScript(script, document, '/course/personSchedule', fetch)
    const packet = JSON.parse(values.get('meta-personal') || '{}')
    expect(packet.status).toBe('course-meta')
    expect(packet.courseMeta[0].name).toBe('自然语言处理')
  })

  it('新选课域名 xkgodj 的已选课程也能启动读取', async () => {
    const document = documentFor([
      row(['课程编码', '课程名称', '学位课', '考试方式', '主讲教师']),
      row(['CODE-2', '人工智能导论', '是', '闭卷', '李老师']),
    ])
    const script = createCurrentUcasExtractionScript({ storageKey: 'new-host-meta', kind: 'lakeside-ucas-import', action: 'course-meta' })
    const values = await runScript(script, document, '/courseManage/selectedCourse', undefined, 'https://xkgodj.ucas.ac.cn')
    const packet = JSON.parse(values.get('new-host-meta') || '{}')
    expect(packet.status).toBe('course-meta')
    expect(packet.courseMeta[0].name).toBe('人工智能导论')
  })

  it('个人课表链接即使 href 是 void 也能从 onclick 找到课程详情', async () => {
    const detailLink = link('自然语言处理', { href: 'javascript:void(0)', onclick: "showCourseTime('314218')" })
    const document = {
      ...documentFor([]),
      querySelectorAll: (selector: string) => selector === 'table' ? [] : selector === 'a[href], a' || selector === 'a' ? [detailLink] : [],
    }
    const script = createCurrentUcasExtractionScript({ storageKey: 'personal-links', kind: 'lakeside-ucas-import', action: 'personal' })
    const values = await runScript(script, document, '/course/personSchedule')
    const packet = JSON.parse(values.get('personal-links') || '{}')
    expect(packet.status).toBe('detail-links')
    expect(packet.detailLinks).toEqual([{ url: `${detailOrigin}/course/coursetime/314218`, label: '自然语言处理' }])
  })

  it('xkgodj 个人课表使用 jwxk 详情地址，不再拼出旧 xkcts 地址', async () => {
    const detailLink = link('自然语言处理', { href: 'javascript:void(0)', onclick: "showCourseTime('315921')" })
    const document = { ...documentFor([]), querySelectorAll: (selector: string) => selector === 'table' ? [] : selector === 'a[href], a' || selector === 'a' ? [detailLink] : [] }
    const script = createUcasExtractionScript('new-detail-links', '', 'https://xkgodj.ucas.ac.cn/course/personSchedule')
    const values = await runScript(script, document, '/course/personSchedule', undefined, 'https://xkgodj.ucas.ac.cn')
    const packet = JSON.parse(values.get('new-detail-links') || '{}')
    expect(packet.status).toBe('detail-links')
    expect(packet.detailLinks[0].url).toBe('https://jwxk.ucas.ac.cn/course/coursetime/315921')
  })

  it('学校页面提供的真实 jwxk 详情地址优先于拼接地址', async () => {
    const detailLink = link('自然语言处理', { href: 'https://jwxk.ucas.ac.cn/course/coursetime/315921?locale=zh_CN' })
    const document = { ...documentFor([]), querySelectorAll: (selector: string) => selector === 'table' ? [] : selector === 'a[href], a' || selector === 'a' ? [detailLink] : [] }
    const script = createUcasExtractionScript('real-detail-link', '', 'https://xkgodj.ucas.ac.cn/course/personSchedule')
    const values = await runScript(script, document, '/course/personSchedule', undefined, 'https://xkgodj.ucas.ac.cn')
    const packet = JSON.parse(values.get('real-detail-link') || '{}')
    expect(packet.detailLinks[0].url).toBe('https://jwxk.ucas.ac.cn/course/coursetime/315921?locale=zh_CN')
  })

  it('保留个人课表和课程详情读取入口，且不包含旧的跨站课程表链路', () => {
    const personal = createCurrentUcasExtractionScript({ storageKey: 'personal', kind: 'lakeside-ucas-import', action: 'personal' })
    const detail = createCurrentUcasExtractionScript({ storageKey: 'detail', kind: 'lakeside-ucas-import', action: 'detail', fallbackName: '自然语言处理' })
    const portal = createCurrentUcasPortalHandoffScript({ storageKey: 'portal', kind: 'lakeside-ucas-import' })
    expect(() => new Function(personal)).not.toThrow()
    expect(() => new Function(detail)).not.toThrow()
    expect(() => new Function(portal)).not.toThrow()
    expect(personal).toContain('detail-links')
    expect(detail).toContain('coursetime')
    expect(personal).not.toContain('termSchedule')
    expect(personal).not.toContain('term-teachers')
    expect(personal).not.toContain('document.cookie')
    expect(personal).not.toMatch(/password/i)
    expect(portal).toContain('/user\\/logout')
  })
})
