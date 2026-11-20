import type { Course, CourseColor, Meeting, Schedule } from './schedule'

export const courseColors: ReadonlyArray<{ value: CourseColor; label: string }> = [
  { value: 'blue', label: '湖蓝' }, { value: 'teal', label: '青绿' },
  { value: 'purple', label: '淡紫' }, { value: 'apricot', label: '杏色' },
]
export const courseDays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const
export type CourseEditScope = 'course' | 'week'
export type CourseDeleteScope = CourseEditScope | 'meeting'
export interface CourseEditTarget { courseId: string; meetingId: string; week: number }
export interface CourseDraft {
  name: string
  teacher: string
  exam: string
  credits: string
  color: CourseColor
  meetings: Meeting[]
}

function readTarget(schedule: Schedule, target: CourseEditTarget): { course: Course; meeting: Meeting } {
  const course = schedule.courses.find(item => item.id === target.courseId)
  const meeting = schedule.meetings.find(item => item.id === target.meetingId && item.courseId === target.courseId)
  if (!course || !meeting) throw new Error('这条上课安排已变更，请重新打开课程详情。')
  return { course, meeting }
}

function requireWeek(meeting: Meeting, week: number) {
  if (!meeting.weeks.includes(week)) throw new Error('这一周已没有这次上课安排。')
}

const sortedUnique = (values: number[]) => [...new Set(values)].sort((a, b) => a - b)

export function createCourseDraft(schedule: Schedule, target: CourseEditTarget, scope: CourseEditScope): CourseDraft {
  const { course, meeting } = readTarget(schedule, target)
  if (scope === 'week') requireWeek(meeting, target.week)
  const meetings = scope === 'course' ? schedule.meetings.filter(item => item.courseId === course.id) : [meeting]
  return {
    name: course.name, teacher: course.teacher, exam: course.exam ?? '', credits: course.credits === undefined ? '' : String(course.credits), color: course.color,
    meetings: meetings.map(item => ({ ...item, sections: sortedUnique(item.sections), weeks: scope === 'week' ? [target.week] : sortedUnique(item.weeks) })),
  }
}

export function nextCourseMeetingId(meetings: ReadonlyArray<Pick<Meeting, 'id'>>): string {
  const used = new Set(meetings.map(item => item.id))
  let number = 1
  while (used.has(`local-meeting-${number}`)) number += 1
  return `local-meeting-${number}`
}

function normalizeMeeting(draft: Meeting, schedule: Schedule, courseId: string, label: string, weeks = draft.weeks): Meeting {
  if (!Number.isInteger(draft.day) || draft.day < 1 || draft.day > 7) throw new Error(`${label}：请选择上课星期。`)
  const validSections = new Set(schedule.periods.map(period => period.section))
  if (!draft.sections.length || draft.sections.some(section => !validSections.has(section))) throw new Error(`${label}：请选择有效的上课节次。`)
  if (!weeks.length || weeks.some(week => !Number.isInteger(week) || week < 1 || week > schedule.semester.weeks)) throw new Error(`${label}：请选择学期内的教学周。`)
  return { ...draft, courseId, weeks: sortedUnique(weeks), sections: sortedUnique(draft.sections), location: draft.location.trim(), teacher: draft.teacher?.trim() || undefined, note: draft.note?.trim() || undefined }
}

function sameNumbers(before: number[], after: number[]) {
  return sortedUnique(before).join(',') === sortedUnique(after).join(',')
}

function checkCourseOverlaps(meetings: Meeting[], originals: Map<string, Meeting>) {
  // Allow already imported overlaps to remain when the user is only changing
  // course information. A new or moved slot must have a distinct time.
  const unchanged = ({ id, day, weeks, sections }: Meeting) => {
    const original = originals.get(id)
    return original?.day === day && weeks.every(week => original.weeks.includes(week)) && sameNumbers(original.sections, sections)
  }
  for (const [index, meeting] of meetings.entries()) {
    for (let other = 0; other < index; other++) {
      const earlier = meetings[other]
      if (meeting.day === earlier.day && meeting.weeks.some(week => earlier.weeks.includes(week)) &&
          meeting.sections.some(section => earlier.sections.includes(section)) && !(unchanged(meeting) && unchanged(earlier))) {
        throw new Error(`时段 ${other + 1} 和时段 ${index + 1} 有重复的上课时间，请调整周次、星期或节次。`)
      }
    }
  }
}

export function buildCourseEdit(schedule: Schedule, target: CourseEditTarget, scope: CourseEditScope, draft: CourseDraft): Schedule {
  const { course, meeting } = readTarget(schedule, target)
  const originals = new Map(schedule.meetings.filter(item => item.courseId === course.id).map(item => [item.id, item]))
  if (scope === 'week') {
    requireWeek(meeting, target.week)
    const source = draft.meetings[0]
    if (draft.meetings.length !== 1 || source.id !== meeting.id) throw new Error('请选择要修改的单周时段。')
    const edited = normalizeMeeting(source, schedule, course.id, `第 ${target.week} 周`, [target.week])
    const remaining = meeting.weeks.filter(week => week !== target.week)
    if (remaining.length) {
      edited.id = nextCourseMeetingId(schedule.meetings)
      originals.set(edited.id, meeting)
    }
    const replacement = remaining.length ? [{ ...meeting, weeks: remaining }, edited] : [edited]
    const meetings = schedule.meetings.flatMap(item => item === meeting ? replacement : [item])
    checkCourseOverlaps(meetings.filter(item => item.courseId === course.id), originals)
    return { ...schedule, meetings }
  }

  const name = draft.name.trim()
  if (!name) throw new Error('请填写课程名称。')
  const rawCredits = draft.credits.trim()
  const credits = rawCredits ? Number(rawCredits) : undefined
  if (credits !== undefined && (!/^\d+(?:\.\d{1,2})?$/.test(rawCredits) || credits > 100)) throw new Error('请输入 0–100 之间的学分，最多两位小数。')
  if (!draft.meetings.length) throw new Error('请为课程保留至少一个上课时段。')
  const usedIds = new Set(schedule.meetings.filter(item => item.courseId !== course.id).map(item => item.id))
  const replacement = draft.meetings.map((item, index) => {
    if (!item.id || usedIds.has(item.id)) throw new Error('上课时段已变更，请重新打开课程详情。')
    usedIds.add(item.id)
    return normalizeMeeting(item, schedule, course.id, `时段 ${index + 1}`)
  })
  checkCourseOverlaps(replacement, originals)
  // Keep the global relative order of unrelated slots, which can share cells.
  const meetings = schedule.meetings.flatMap(item => item === meeting ? replacement : item.courseId === course.id ? [] : [item])
  const courses = schedule.courses.map(item => item === course ? { ...course, name, teacher: draft.teacher.trim(), exam: draft.exam.trim() || undefined, credits, color: draft.color, edited: true } : item)
  return { ...schedule, courses, meetings }
}

export function deleteCourseSchedule(schedule: Schedule, target: CourseEditTarget, scope: CourseDeleteScope): Schedule {
  const { course, meeting } = readTarget(schedule, target)
  if (scope === 'week') requireWeek(meeting, target.week)
  const meetings = schedule.meetings.flatMap(item => {
    if (scope === 'course') return item.courseId === course.id ? [] : [item]
    if (item !== meeting) return [item]
    const weeks = scope === 'week' ? item.weeks.filter(week => week !== target.week) : []
    return weeks.length ? [{ ...item, weeks }] : []
  })
  const courses = meetings.some(item => item.courseId === course.id) ? schedule.courses : schedule.courses.filter(item => item !== course)
  return { ...schedule, courses, meetings }
}
