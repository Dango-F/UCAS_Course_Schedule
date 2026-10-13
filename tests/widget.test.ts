import { describe, expect, it } from 'vitest'
import { makeDemo } from '../src/data/demo'
import { buildWidgetSnapshot, defaultWidgetOptions, normalizeWidgetOptions, parseWidgetAction, resolveWidgetCourse, validWidgetDate } from '../src/domain/widget'

describe('桌面小组件课表快照', () => {
  it('展开整学期，而不是仅导出今天；日期固定为北京时间', () => {
    const snapshot = buildWidgetSnapshot(makeDemo('normal'), 1)
    expect(snapshot.timeZone).toBe('Asia/Shanghai')
    expect(new Set(snapshot.occurrences.map(item => item.date)).size).toBeGreaterThan(20)
    expect(snapshot.occurrences.find(item => item.date === '2026-09-07')).toMatchObject({ name: '矩阵分析', startTime: '08:30' })
    expect(snapshot.occurrences.every(item => item.start < item.end)).toBe(true)
    expect(new Set(snapshot.occurrences.map(item => item.id)).size).toBe(snapshot.occurrences.length)
  })
  it('内容修订标识不受生成时间影响，但修改教师、地点和学期会改变标识', () => {
    const schedule = makeDemo('normal')
    const first = buildWidgetSnapshot(schedule, 1)
    expect(buildWidgetSnapshot(schedule, 2).revision).toBe(first.revision)
    schedule.courses[0].teacher = '新教师'
    expect(buildWidgetSnapshot(schedule).revision).not.toBe(first.revision)
  })
  it('严格沿用指定周次并把不连续节次拆成独立时段', () => {
    const schedule = makeDemo('normal')
    schedule.meetings = [{ id: 'split', courseId: schedule.courses[0].id, day: 1, sections: [1, 2, 7, 8], weeks: [1, 3], location: '教室' }]
    const snapshot = buildWidgetSnapshot(schedule)
    expect(snapshot.occurrences).toHaveLength(4)
    expect(snapshot.occurrences.map(item => [item.date, item.startSection, item.endSection])).toEqual([
      ['2026-08-31', 1, 2], ['2026-08-31', 7, 8], ['2026-09-14', 1, 2], ['2026-09-14', 7, 8],
    ])
  })
  it('保留冲突课程，沿用同名课程不误报冲突的规则', () => {
    const schedule = makeDemo('normal')
    schedule.meetings = schedule.courses.slice(0, 2).map((course, i) => ({ id: 'overlap-' + i, courseId: course.id, day: 1, sections: [1, 2], weeks: [1], location: '' }))
    expect(buildWidgetSnapshot(schedule).occurrences.every(item => item.conflict)).toBe(true)
    schedule.courses[1].name = schedule.courses[0].name
    expect(buildWidgetSnapshot(schedule).occurrences.every(item => !item.conflict)).toBe(true)
  })
  it('快照不持有可变课表引用，无课表可显式同步未导入状态', () => {
    const schedule = makeDemo('normal')
    const snapshot = buildWidgetSnapshot(schedule)
    const name = snapshot.occurrences[0].name
    schedule.courses.forEach(item => { item.name = '已修改' })
    expect(snapshot.occurrences[0].name).toBe(name)
    expect(buildWidgetSnapshot(null)).toMatchObject({ semester: null, occurrences: [] })
  })
  it('拒绝无效日期和无法显示的课程时间，不导出半份课表', () => {
    expect(validWidgetDate('2026-02-30')).toBe(false)
    const schedule = makeDemo('normal')
    schedule.periods[0].start = '25:00'
    expect(() => buildWidgetSnapshot(schedule)).toThrow('时间无效')
    schedule.semester.monday = 'wrong'
    expect(() => buildWidgetSnapshot(schedule)).toThrow('学期日期')
  })
})
describe('小组件设置与跳转', () => {
  it('两种尺寸有不同默认值，透明度与节次符合约定', () => {
    expect(defaultWidgetOptions('small')).toEqual({ showTeachers: true, showLocation: true, showSections: false, opacity: 80 })
    expect(normalizeWidgetOptions('small', { opacity: 2, showSections: true })).toMatchObject({ opacity: 60, showSections: false })
    expect(normalizeWidgetOptions('large', { opacity: 92 })).toMatchObject({ opacity: 90, showSections: true })
  })
  it('精确定位日期、学期、meeting 和连续时段', () => {
    const schedule = makeDemo('normal'), row = buildWidgetSnapshot(schedule).occurrences[0]
    const action = parseWidgetAction(JSON.stringify({ eventId: 'click', target: 'course', widgetId: 3, date: row.date,
      semesterId: schedule.semester.id, courseId: row.courseId, meetingId: row.meetingId, startSection: row.startSection, endSection: row.endSection }))!
    expect(resolveWidgetCourse(schedule, action)).toMatchObject({ week: 1, tile: { meeting: { id: row.meetingId } } })
    expect(resolveWidgetCourse(schedule, { ...action, semesterId: 'reimported' })).toBeNull()
    expect(resolveWidgetCourse(schedule, { ...action, endSection: 19 })).toBeNull()
    schedule.meetings = []
    expect(resolveWidgetCourse(schedule, action)).toBeNull()
  })
  it('拒绝损坏和不完整的点击参数', () => {
    expect(parseWidgetAction('{')).toBeNull()
    expect(parseWidgetAction(JSON.stringify({ eventId: 'x', target: 'course', widgetId: 1, date: '2026-09-07' }))).toBeNull()
    expect(parseWidgetAction(JSON.stringify({ eventId: 'x', target: 'today', widgetId: 1, date: '2026-02-30' }))).toBeNull()
  })
})
