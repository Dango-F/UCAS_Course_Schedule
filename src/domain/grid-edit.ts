import { nextCourseMeetingId, type CourseEditTarget } from './course-edit'
import { tilesForWeek, type Course, type Meeting, type MeetingKind, type Schedule } from './schedule'

export interface GridSlot { week: number; day: number; start: number; end: number; tileId?: string }
export interface GridEdit {
  schedule: Schedule
  target: CourseEditTarget
  slot: GridSlot
  mode: 'new' | 'makeup' | 'move'
}

export function gridSections(slot: GridSlot) {
  return Array.from({ length: slot.end - slot.start + 1 }, (_, i) => slot.start + i)
}

// Stage the selected occurrence for the editor. Only its Save button writes the store.
export function prepareGridEdit(source: Schedule, slot: GridSlot, kind?: MeetingKind, courseId?: string): GridEdit {
  if (![slot.week, slot.day, slot.start, slot.end].every(Number.isInteger) ||
      slot.week < 1 || slot.week > source.semester.weeks || slot.day < 1 || slot.day > 7 ||
      slot.start < 1 || slot.end < slot.start || slot.end > Math.max(...source.periods.map(p => p.section)) ||
      !gridSections(slot).every(n => source.periods.some(p => p.section === n))) throw new Error('请选择有效的课表时段。')
  const week = slot.week
  const nextId = () => nextCourseMeetingId(source.meetings)
  if (slot.tileId) {
    const tile = tilesForWeek(source, week).find(item => item.id === slot.tileId)
    if (!tile) throw new Error('这次安排已更新，请重新选择。')
    const original = tile.meeting
    let schedule = source
    let meetingId = original.id
    const otherSections = original.sections.filter(n => n < tile.start || n > tile.end)
    if (otherSections.length) {
      const otherWeeks = original.weeks.filter(n => n !== week)
      const retained: Meeting[] = []
      if (otherWeeks.length) retained.push({ ...original, weeks: otherWeeks })
      retained.push({ ...original, id: otherWeeks.length ? nextId() : original.id, weeks: [week], sections: otherSections })
      meetingId = nextCourseMeetingId([...source.meetings, ...retained])
      retained.push({ ...original, id: meetingId, weeks: [week], sections: original.sections.filter(n => n >= tile.start && n <= tile.end) })
      schedule = { ...source, meetings: source.meetings.flatMap(m => m === original ? retained : [m]) }
    }
    return { schedule, target: { courseId: original.courseId, meetingId, week }, slot, mode: 'move' }
  }
  if (!kind) throw new Error('请选择安排类型。')
  let course: Course | undefined
  let courses = source.courses
  if (kind === 'makeup') {
    course = courses.find(c => c.id === courseId)
    if (!course) throw new Error('请选择需要补课的课程。')
  } else {
    let n = 1
    while (courses.some(c => c.id === 'local-course-' + n)) n++
    course = { id: 'local-course-' + n, name: '', teacher: '', color: kind === 'activity' ? 'teal' : kind === 'meeting' ? 'purple' : 'blue', origin: 'manual' }
    courses = [...courses, course]
  }
  const meeting: Meeting = { id: nextId(), courseId: course.id, kind, day: slot.day, weeks: [week], sections: [], location: '' }
  return { schedule: { ...source, courses, meetings: [...source.meetings, meeting] },
    target: { courseId: course.id, meetingId: meeting.id, week }, slot, mode: kind === 'makeup' ? 'makeup' : 'new' }
}
