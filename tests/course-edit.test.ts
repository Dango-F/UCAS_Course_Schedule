import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { makeDemo } from '../src/data/demo'
import { buildCourseEdit, createCourseDraft, deleteCourseSchedule, nextCourseMeetingId } from '../src/domain/course-edit'
import { isSchedule, meetingTimeLabel, tilesForWeek, type Schedule } from '../src/domain/schedule'
import { buildWidgetSnapshot } from '../src/domain/widget'
import { syncSavedWidgetSchedule } from '../src/services/widget-sync'
import { useScheduleStore } from '../src/stores/schedule'

vi.mock('../src/services/widget-sync', () => ({ syncSavedWidgetSchedule: vi.fn(() => Promise.resolve()) }))
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks() })

const target = { courseId: 'math', meetingId: 'm1', week: 2 }

describe('课程编辑记录', () => {
  it('修改单周时拆分原时段，其他周和课程默认教师继续保留', () => {
    const schedule = makeDemo('normal')
    const before = JSON.stringify(schedule)
    const draft = createCourseDraft(schedule, target, 'week')
    expect(draft.meetings[0].weeks).toEqual([2])
    draft.meetings[0].day = 7
    draft.meetings[0].sections = [4, 2, 2]
    draft.meetings[0].teacher = ' 代课教师 '
    draft.meetings[0].location = ' 新教室 '
    draft.meetings[0].note = ' 仅本周调整 '
    const next = buildCourseEdit(schedule, target, 'week', draft)
    expect(isSchedule(next)).toBe(true)
    expect(JSON.stringify(schedule)).toBe(before)
    expect(next.courses).toBe(schedule.courses)
    expect(next.meetings.find(meeting => meeting.id === 'm1')?.weeks).not.toContain(2)
    expect(tilesForWeek(next, 1).find(tile => tile.meeting.id === 'm1')?.course.teacher).toBe(schedule.courses[0].teacher)
    const changed = tilesForWeek(next, 2).filter(tile => tile.meeting.note === '仅本周调整')
    expect(changed.map(tile => tile.start)).toEqual([2, 4])
    expect(changed[0]).toMatchObject({ course: { teacher: '代课教师' }, meeting: { day: 7, location: '新教室', weeks: [2] } })
    expect(buildWidgetSnapshot(next).occurrences.filter(row => row.meetingId === changed[0].meeting.id).map(row => row.teacher)).toEqual(['代课教师', '代课教师'])
    expect(meetingTimeLabel(next.periods, [2, 4])).toBe('09:20–10:05 · 11:15–12:00')
  })

  it('现有单周安排保留 ID，防止刷新后关联时段丢失', () => {
    const schedule = makeDemo('normal')
    schedule.meetings.find(meeting => meeting.id === 'm1')!.weeks = [2]
    const draft = createCourseDraft(schedule, target, 'week')
    draft.meetings[0].location = '新教室'
    expect(buildCourseEdit(schedule, target, 'week', draft).meetings.find(meeting => meeting.id === 'm1')).toMatchObject({ location: '新教室', weeks: [2] })
  })

  it('整门课程可增删时段，同步课程资料并保留独立的周次和节次', () => {
    const schedule = makeDemo('normal')
    const draft = createCourseDraft(schedule, target, 'course')
    Object.assign(draft, { name: ' 矩阵进阶 ', credits: '2.5', teacher: '默认教师', exam: '', color: 'teal' })
    draft.meetings.splice(1, 1)
    draft.meetings.push({ ...draft.meetings[0], id: nextCourseMeetingId(schedule.meetings), day: 6, weeks: [4, 2, 2], sections: [7, 6] })
    const next = buildCourseEdit(schedule, target, 'course', draft)
    expect(next.courses[0]).toMatchObject({ name: '矩阵进阶', credits: 2.5, exam: undefined, color: 'teal', edited: true })
    expect(next.meetings.filter(meeting => meeting.courseId === 'math').map(meeting => meeting.id)).toEqual(['m1', 'local-meeting-1'])
    expect(tilesForWeek(next, 2).find(tile => tile.meeting.day === 6)).toMatchObject({ course: { teacher: '默认教师' }, start: 6, end: 7 })
    expect(tilesForWeek(next, 3).some(tile => tile.meeting.day === 6)).toBe(false)
    expect(isSchedule(JSON.parse(JSON.stringify(next)))).toBe(true)
  })

  it('阻止复制出重复安排、无效节次和空周次，并允许仅修改旧课的数据', () => {
    const schedule = makeDemo('normal')
    const draft = createCourseDraft(schedule, target, 'course')
    draft.meetings.push({ ...draft.meetings[0], id: 'copy' })
    expect(() => buildCourseEdit(schedule, target, 'course', draft)).toThrow('重复的上课时间')
    draft.meetings.pop()
    draft.meetings[0].sections = [14]
    expect(() => buildCourseEdit(schedule, target, 'course', draft)).toThrow('上课节次')
    draft.meetings[0].sections = [1]
    draft.meetings[0].weeks = []
    expect(() => buildCourseEdit(schedule, target, 'course', draft)).toThrow('教学周')
    schedule.meetings.push({ ...schedule.meetings[0], id: 'imported-overlap' })
    const existing = createCourseDraft(schedule, target, 'course')
    existing.name = '调整课程名'
    expect(buildCourseEdit(schedule, target, 'course', existing).courses[0].name).toBe('调整课程名')
  })

  it('按单周、时段或整门课删除，孤立课程在最后一个时段移除后清理', () => {
    const schedule = makeDemo('normal')
    const single = deleteCourseSchedule(schedule, target, 'week')
    expect(single.meetings.find(meeting => meeting.id === 'm1')?.weeks).not.toContain(2)
    expect(single.meetings.find(meeting => meeting.id === 'm5')?.weeks).toContain(2)
    const meeting = deleteCourseSchedule(schedule, target, 'meeting')
    expect(meeting.meetings.some(item => item.id === 'm1')).toBe(false)
    expect(meeting.courses.some(item => item.id === 'math')).toBe(true)
    const all = deleteCourseSchedule(meeting, { ...target, meetingId: 'm5' }, 'course')
    expect(all.courses.some(item => item.id === 'math')).toBe(false)
    expect(all.meetings.some(item => item.courseId === 'math')).toBe(false)
    expect(all.meetings.some(item => item.courseId === 'ml')).toBe(true)
  })
})

describe('课程编辑保存', () => {
  function fixture(persisted: boolean) {
    let saved = persisted ? JSON.stringify(makeDemo('normal')) : ''
    const write = vi.fn((_key: string, data: string) => { saved = data })
    vi.stubGlobal('uni', { getStorageSync: () => saved, setStorageSync: write })
    setActivePinia(createPinia())
    const store = useScheduleStore()
    store.setWeek(2)
    return { store, write, saved: () => JSON.parse(saved) as Schedule }
  }

  it('写入失败保留当前课表，重试成功后同步小组件并保持当前周', () => {
    const { store, write, saved } = fixture(true)
    const before = store.schedule
    const draft = createCourseDraft(before, target, 'course')
    draft.name = '矩阵进阶'
    const next = buildCourseEdit(before, target, 'course', draft)
    write.mockImplementationOnce(() => { throw Error('disk full') })
    expect(store.applyCourseEdit(next)).toBe(false)
    expect(store.schedule).toBe(before)
    expect(saved().courses[0].name).toBe('矩阵分析')
    expect(syncSavedWidgetSchedule).not.toHaveBeenCalled()
    expect(store.applyCourseEdit(next)).toBe(true)
    expect(saved().courses[0].name).toBe('矩阵进阶')
    expect(store.week).toBe(2)
    expect(syncSavedWidgetSchedule).toHaveBeenCalledOnce()
    setActivePinia(createPinia())
    expect(useScheduleStore().schedule.courses[0].name).toBe('矩阵进阶')
  })

  it('示例课表修改只更新当前会话', () => {
    const { store, write } = fixture(false)
    const next = deleteCourseSchedule(store.schedule, target, 'course')
    expect(store.applyCourseEdit(next)).toBe(true)
    expect(store.schedule.courses.some(item => item.id === 'math')).toBe(false)
    expect(store.isDemo).toBe(true)
    expect(write).not.toHaveBeenCalled()
    expect(syncSavedWidgetSchedule).not.toHaveBeenCalled()
  })
})
