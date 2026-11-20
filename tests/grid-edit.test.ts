import { describe, expect, it } from 'vitest'
import { makeDemo } from '../src/data/demo'
import { buildCourseEdit, createCourseDraft } from '../src/domain/course-edit'
import { gridSections, prepareGridEdit, type GridEdit } from '../src/domain/grid-edit'
import { isSchedule, tilesForWeek } from '../src/domain/schedule'
import { buildWidgetSnapshot } from '../src/domain/widget'

function save(edit: GridEdit, name?: string) {
  const draft = createCourseDraft(edit.schedule, edit.target, 'week')
  Object.assign(draft.meetings[0], { day: edit.slot.day, sections: gridSections(edit.slot) })
  if (name) draft.name = name
  return buildCourseEdit(edit.schedule, edit.target, edit.mode === 'new' ? 'course' : 'week', draft)
}

describe('周课表长按编辑', () => {
  const slot = { week: 2, day: 6, start: 3, end: 4 }
  it('补课归属原课，详情与桌面可区分，取消草稿不写入课表', () => {
    const source = makeDemo('normal')
    const before = JSON.stringify(source)
    const edit = prepareGridEdit(source, slot, 'makeup', 'math')
    const saved = save(edit)
    expect(saved.courses).toBe(source.courses)
    expect(saved.meetings.find(m => m.id === edit.target.meetingId)).toMatchObject({ courseId: 'math', kind: 'makeup', weeks: [2], sections: [3, 4] })
    expect(buildWidgetSnapshot(saved).occurrences.find(o => o.meetingId === edit.target.meetingId)?.name).toContain('补课')
    expect(JSON.stringify(source)).toBe(before)
    expect(isSchedule(JSON.parse(JSON.stringify(saved)))).toBe(true)
    expect(() => save(prepareGridEdit(source, { ...slot, day: 1, start: 1, end: 2 }, 'makeup', 'math'))).toThrow('重复')
  })
  it.each(['temporary', 'meeting', 'activity'] as const)('为 %s 创建一次独立安排', kind => {
    const source = makeDemo('normal')
    const edit = prepareGridEdit(source, slot, kind)
    const saved = save(edit, '新增安排')
    const tile = tilesForWeek(saved, slot.week).find(t => t.meeting.id === edit.target.meetingId)!
    expect(tile).toMatchObject({ course: { origin: 'manual', name: '新增安排' }, meeting: { kind, weeks: [2] }, start: 3, end: 4 })
    expect(tilesForWeek(saved, 1).some(t => t.course.id === tile.course.id)).toBe(false)
  })
  it('只移动当前周按住的连续时段，保留同日另一段和其他周的安排', () => {
    const source = makeDemo('normal')
    source.meetings[0].sections = [1, 2, 7, 8]
    const saved = save(prepareGridEdit(source, { ...slot, tileId: 'm1-7' }))
    const math = (week: number) => tilesForWeek(saved, week).filter(t => t.course.id === 'math')
    expect(math(2).filter(t => t.meeting.day === 1).map(t => t.start)).toEqual([1])
    expect(math(2).find(t => t.meeting.day === 6)).toMatchObject({ start: 3, end: 4 })
    expect(math(3).filter(t => t.meeting.day === 1).map(t => t.start)).toEqual([1, 7])
    expect(isSchedule(saved)).toBe(true)
    expect(new Set(saved.meetings.map(m => m.id)).size).toBe(saved.meetings.length)
  })
})
