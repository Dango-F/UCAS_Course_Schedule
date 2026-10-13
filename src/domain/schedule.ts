export type CourseColor = 'blue' | 'teal' | 'purple' | 'apricot'
export interface Course { id: string; name: string; code?: string; teacher: string; isDegreeCourse?: boolean; exam?: string; color: CourseColor; origin: 'demo' | 'manual' | 'ucas'; edited?: boolean }
export interface Meeting { id: string; courseId: string; day: number; sections: number[]; weeks: number[]; location: string }
export interface Period { section: number; start: string; end: string }
export interface Semester { id: string; name: string; monday: string; weeks: number; campus: string; confirmed: boolean }
export interface Schedule { version: 1; semester: Semester; courses: Course[]; meetings: Meeting[]; periods: Period[]; importedAt?: string }
export interface Tile { id: string; meeting: Meeting; course: Course; start: number; end: number }

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function positiveNumbers(value: unknown, max: number): value is number[] { return Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'number' && Number.isInteger(item) && item >= 1 && item <= max) }

/** Lightweight validation before reading a locally persisted schedule. */
export function isSchedule(value: unknown): value is Schedule {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.semester) || !Array.isArray(value.courses) || !Array.isArray(value.meetings) || !Array.isArray(value.periods)) return false
  const semester = value.semester
  if (typeof semester.id !== 'string' || typeof semester.name !== 'string' || typeof semester.monday !== 'string' || typeof semester.weeks !== 'number' || typeof semester.campus !== 'string' || typeof semester.confirmed !== 'boolean') return false
  if (!Number.isInteger(semester.weeks) || semester.weeks < 1 || semester.weeks > 30) return false
  const courseIds = new Set<string>()
  for (const course of value.courses) {
    if (!isRecord(course) || typeof course.id !== 'string' || !course.id || typeof course.name !== 'string' || (course.code !== undefined && typeof course.code !== 'string') || typeof course.teacher !== 'string' || (course.isDegreeCourse !== undefined && typeof course.isDegreeCourse !== 'boolean') || (course.exam !== undefined && typeof course.exam !== 'string') || !['blue', 'teal', 'purple', 'apricot'].includes(String(course.color)) || !['demo', 'manual', 'ucas'].includes(String(course.origin))) return false
    if (courseIds.has(course.id)) return false
    courseIds.add(course.id)
  }
  for (const meeting of value.meetings) {
    if (!isRecord(meeting) || typeof meeting.id !== 'string' || !courseIds.has(String(meeting.courseId)) || typeof meeting.day !== 'number' || !Number.isInteger(meeting.day) || meeting.day < 1 || meeting.day > 7 || !positiveNumbers(meeting.sections, 20) || !positiveNumbers(meeting.weeks, 30) || typeof meeting.location !== 'string') return false
  }
  return value.periods.every(period => isRecord(period) && typeof period.section === 'number' && Number.isInteger(period.section) && period.section >= 1 && typeof period.start === 'string' && typeof period.end === 'string')
}

export function parseNumbers(value: string, max: number): number[] {
  const normalized = value.replace(/第|周|节|[()（）]/g, '').replace(/[，、；;]/g, ',').replace(/[~～—–至]/g, '-').trim()
  const odd = normalized.includes('单'), even = normalized.includes('双')
  if (odd && even) throw new Error('请分别填写单周与双周安排')
  const expression = normalized.replace(/单|双/g, '').trim()
  if (!expression) throw new Error('请填写数字或范围，例如 1-8,10')
  const numbers = new Set<number>()
  for (const token of expression.split(',')) {
    const match = token.trim().match(/^(\d+)\s*(?:-\s*(\d+))?$/)
    if (!match) throw new Error('格式应为 1-8,10 这样的数字或范围')
    const start = Number(match[1]), end = Number(match[2] || match[1])
    if (start < 1 || end > max || start > end) throw new Error(`范围应在 1–${max} 之间`)
    for (let n = start; n <= end; n++) if ((!odd || n % 2 === 1) && (!even || n % 2 === 0)) numbers.add(n)
  }
  if (!numbers.size) throw new Error('没有有效的周次或节次')
  return [...numbers].sort((a, b) => a - b)
}
export function compactNumbers(values: number[]) {
  const sorted = [...new Set(values)].sort((a, b) => a - b)
  const result: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]; let end = start
    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) end = sorted[++i]
    result.push(start === end ? `${start}` : `${start}–${end}`)
  }
  return result.join('、')
}
export function dateAt(monday: string, week: number, day: number) {
  const date = new Date(`${monday}T12:00:00+08:00`)
  return new Date(date.getTime() + ((week - 1) * 7 + day - 1) * 86400000)
}
export function chinaDate(date: Date) { return new Date(date.getTime() + 8 * 3600000).toISOString().slice(0, 10) }
export function teachingWeek(monday: string, now: Date) { return Math.floor((Date.parse(chinaDate(now)) - Date.parse(monday)) / (7 * 86400000)) + 1 }
export function tilesForWeek(schedule: Schedule, week: number): Tile[] {
  const tiles: Tile[] = []
  for (const meeting of schedule.meetings.filter(m => m.weeks.includes(week))) {
    const course = schedule.courses.find(c => c.id === meeting.courseId)
    if (!course) continue
    const sections = [...new Set(meeting.sections)].sort((a, b) => a - b)
    for (let i = 0; i < sections.length; i++) {
      const start = sections[i]; let end = start
      while (i + 1 < sections.length && sections[i + 1] === end + 1) end = sections[++i]
      tiles.push({ id: `${meeting.id}-${start}`, meeting, course, start, end })
    }
  }
  return tiles
}

/** Courses with the same displayed name are one course family for conflict
 * purposes. UCAS can expose separate codes/rows for different arrangements;
 * those rows should not produce a false “两门课程冲突” badge. */
export function courseFamilyKey(course: Pick<Course, 'name'>): string {
  return course.name.replace(/\s+/g, '').toLocaleLowerCase()
}

export function hasTileConflict(tiles: Tile[]): boolean {
  return tiles.length > 1 && new Set(tiles.map(tile => courseFamilyKey(tile.course))).size > 1
}

export function layoutTiles(tiles: Tile[]) {
  const groups: { day: number; start: number; end: number; tiles: Tile[] }[] = []
  for (let day = 1; day <= 7; day++) {
    const sorted = tiles.filter(t => t.meeting.day === day).sort((a,b) => a.start - b.start)
    let current: typeof groups[number] | undefined
    for (const tile of sorted) {
      if (current && tile.start <= current.end) { current.tiles.push(tile); current.end = Math.max(current.end, tile.end) }
      else { current = { day, start: tile.start, end: tile.end, tiles: [tile] }; groups.push(current) }
    }
  }
  return groups
}
