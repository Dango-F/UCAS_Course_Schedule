import { chinaDate, dateAt, hasTileConflict, isSchedule, layoutTiles, teachingWeek, tilesForWeek, type CourseColor, type Schedule, type Tile } from './schedule'
import { tileEndTimestamp, tileStartTimestamp, tilesForDate } from './today'

export type WidgetKind = 'large' | 'small'
export interface WidgetOptions { showTeachers: boolean; showLocation: boolean; showSections: boolean; opacity: number }
export interface WidgetInstance { id: number; kind: WidgetKind; options: WidgetOptions }
export type WidgetAvailability = 'ready' | 'unsupported' | 'native_missing' | 'providers_missing' | 'system_unsupported' | 'bridge_error'
export interface WidgetState {
  supported: boolean; pinSupported: boolean; revision: string; cacheState: string; instances: WidgetInstance[]
  availability?: WidgetAvailability; registeredKinds?: WidgetKind[]; packageName?: string; nativeVersion?: number
}
export interface WidgetPinResult { status: 'requested' | 'manual' | 'unavailable' | 'error'; reason?: string }
export interface WidgetOccurrence {
  id: string; courseId: string; meetingId: string; date: string; start: number; end: number
  startSection: number; endSection: number; startTime: string; endTime: string
  name: string; teacher: string; location: string; color: CourseColor; conflict: boolean
}
export interface WidgetSnapshot {
  version: 1; revision: string; generatedAt: number; timeZone: 'Asia/Shanghai'
  semester: { id: string; name: string; monday: string; weeks: number; confirmed: boolean; endDate: string } | null
  occurrences: WidgetOccurrence[]
}
export type WidgetTarget = 'today' | 'calendar' | 'course' | 'settings' | 'semester' | 'import'
export interface WidgetAction {
  eventId: string; target: WidgetTarget; widgetId: number; date: string
  semesterId?: string; courseId?: string; meetingId?: string; startSection?: number; endSection?: number
}

export function defaultWidgetOptions(kind: WidgetKind): WidgetOptions {
  return { showTeachers: true, showLocation: true, showSections: kind === 'large', opacity: 80 }
}
export function normalizeWidgetOptions(kind: WidgetKind, value: Partial<WidgetOptions>): WidgetOptions {
  const defaults = defaultWidgetOptions(kind)
  return { showTeachers: typeof value.showTeachers === 'boolean' ? value.showTeachers : defaults.showTeachers,
    showLocation: typeof value.showLocation === 'boolean' ? value.showLocation : defaults.showLocation,
    showSections: kind === 'large' && (typeof value.showSections === 'boolean' ? value.showSections : defaults.showSections),
    opacity: typeof value.opacity === 'number' && Number.isFinite(value.opacity) ? Math.max(60, Math.min(100, Math.round(value.opacity / 5) * 5)) : defaults.opacity }
}
function revisionOf(value: string): string {
  // A deterministic content fingerprint; generation time is deliberately excluded.
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619)
  return `v1-${(hash >>> 0).toString(16)}-${value.length}`
}
export function validWidgetDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + 'T12:00:00+08:00'))
    && chinaDate(new Date(value + 'T12:00:00+08:00')) === value
}
export function buildWidgetSnapshot(schedule: Schedule | null, now = Date.now()): WidgetSnapshot {
  if (schedule && (!isSchedule(schedule) || !validWidgetDate(schedule.semester.monday))) throw new Error('学期日期或课表数据无效')
  const semester = schedule ? { id: schedule.semester.id, name: schedule.semester.name, monday: schedule.semester.monday,
    weeks: schedule.semester.weeks, confirmed: schedule.semester.confirmed,
    endDate: chinaDate(dateAt(schedule.semester.monday, schedule.semester.weeks, 7)) } : null
  const occurrences: WidgetOccurrence[] = []
  if (schedule) for (let week = 1; week <= schedule.semester.weeks; week++) {
    const tiles = tilesForWeek(schedule, week)
    const conflicts = new Set(layoutTiles(tiles).filter(group => hasTileConflict(group.tiles)).flatMap(group => group.tiles.map(tile => tile.id)))
    for (const tile of tiles) {
      const date = chinaDate(dateAt(schedule.semester.monday, week, tile.meeting.day))
      const start = tileStartTimestamp(schedule, tile, date), end = tileEndTimestamp(schedule, tile, date)
      if (start === null || end === null || end <= start) throw new Error('课程起止时间无效，请重新同步课表')
      occurrences.push({ id: JSON.stringify([schedule.semester.id, date, tile.meeting.id, tile.start, tile.end]),
        courseId: tile.course.id, meetingId: tile.meeting.id, date, start, end,
        startSection: tile.start, endSection: tile.end,
        startTime: schedule.periods.find(period => period.section === tile.start)!.start,
        endTime: schedule.periods.find(period => period.section === tile.end)!.end,
        name: tile.course.name, teacher: tile.course.teacher, location: tile.meeting.location,
        color: tile.course.color, conflict: conflicts.has(tile.id) })
    }
  }
  occurrences.sort((a, b) => a.start - b.start || a.end - b.end || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const content = { version: 1 as const, timeZone: 'Asia/Shanghai' as const, semester, occurrences }
  return { ...content, revision: revisionOf(JSON.stringify(content)), generatedAt: now }
}
export function parseWidgetAction(raw: string | null): WidgetAction | null {
  if (!raw) return null
  try {
    const value = JSON.parse(raw) as WidgetAction
    if (!value || typeof value.eventId !== 'string' || !value.eventId || !['today', 'calendar', 'course', 'settings', 'semester', 'import'].includes(value.target)
      || !Number.isInteger(value.widgetId) || value.widgetId < 0 || typeof value.date !== 'string' || !validWidgetDate(value.date)) return null
    if (value.target === 'course' && (typeof value.semesterId !== 'string' || typeof value.courseId !== 'string' || typeof value.meetingId !== 'string'
      || !Number.isInteger(value.startSection) || !Number.isInteger(value.endSection) || value.startSection! < 1 || value.endSection! < value.startSection!)) return null
    return value
  } catch { return null }
}
export function resolveWidgetCourse(schedule: Schedule, action: WidgetAction): { tile: Tile; week: number } | null {
  if (action.target !== 'course' || action.semesterId !== schedule.semester.id || !validWidgetDate(action.date)) return null
  const tile = tilesForDate(schedule, action.date).find(item => item.course.id === action.courseId && item.meeting.id === action.meetingId
    && item.start === action.startSection && item.end === action.endSection)
  return tile ? { tile, week: teachingWeek(schedule.semester.monday, new Date(action.date + 'T12:00:00+08:00')) } : null
}
