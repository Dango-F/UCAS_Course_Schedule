import { demoPeriods } from '../data/demo'
import type { Course, CourseColor, Meeting, Schedule } from '../domain/schedule'
import { createCurrentUcasExtractionScript, createCurrentUcasPortalHandoffScript } from './ucas-extraction'

/** Exact UCAS origins used by the authenticated WebView. */
export const UCAS_SEP_LOGIN_URL = 'https://sep.ucas.ac.cn/'
export const UCAS_SEP_HOME_URL = 'https://sep.ucas.ac.cn/sepCard/card'
export const UCAS_COURSE_ORIGIN = 'https://xkgo.ucas.ac.cn:3000'
export const UCAS_COURSE_ALTERNATE_ORIGIN = 'https://xkgodj.ucas.ac.cn'
export const UCAS_COURSE_DETAIL_ORIGIN = 'https://xkcts.ucas.ac.cn:8443'
export const UCAS_COURSE_ALTERNATE_DETAIL_ORIGIN = 'https://jwxk.ucas.ac.cn'
export const UCAS_COURSE_MAIN_URL = `${UCAS_COURSE_ORIGIN}/courseManage/main`
export const UCAS_PERSON_SCHEDULE_URL = `${UCAS_COURSE_ORIGIN}/course/personSchedule`
export const UCAS_SELECTED_COURSE_URL = `${UCAS_COURSE_ORIGIN}/courseManage/selectedCourse`
export const UCAS_COURSE_SITE_ORIGINS = [UCAS_COURSE_ORIGIN, UCAS_COURSE_ALTERNATE_ORIGIN] as const
export const UCAS_COURSE_DETAIL_ORIGINS = [UCAS_COURSE_DETAIL_ORIGIN, UCAS_COURSE_ALTERNATE_DETAIL_ORIGIN] as const
export const UCAS_COURSE_ORIGINS = [...UCAS_COURSE_SITE_ORIGINS, ...UCAS_COURSE_DETAIL_ORIGINS] as const

export function detailOriginForCoursePage(value: string): string {
  return isUcasCourseSiteUrl(value) && /^https:\/\/xkgodj\.ucas\.ac\.cn(?:[/?#]|$)/i.test(value)
    ? UCAS_COURSE_ALTERNATE_DETAIL_ORIGIN
    : UCAS_COURSE_DETAIL_ORIGIN
}

export const UCAS_IMPORT_KIND = 'lakeside-ucas-import'
export const UCAS_IMPORT_VERSION = 1
export const UCAS_IMPORT_HANDOFF_KEY = '__lakeside_ucas_import_v1__'
const MAX_SECTIONS = 13
const MAX_WEEKS = 30
const courseColors: CourseColor[] = ['blue', 'teal', 'purple', 'apricot']

export interface UcasImportedMeeting {
  day: number
  sections: number[]
  weeks: number[]
  location: string
}

export interface UcasCourseMeta {
  name: string
  /** Extracted for identity/merge; course code is stored but not shown on cards yet. */
  code?: string
  teacher?: string
  isDegreeCourse?: boolean
  exam?: string
}

export interface UcasImportedCourse {
  name: string
  code?: string
  teacher: string
  isDegreeCourse?: boolean
  exam?: string
  meetings: UcasImportedMeeting[]
}

export interface UcasDetailLink {
  url: string
  label: string
  /** Optional original SEP handoff URL used to establish the detail session. */
  navigationUrl?: string
}

export interface UcasImportPayload {
  kind: typeof UCAS_IMPORT_KIND
  version: typeof UCAS_IMPORT_VERSION
  status: 'progress' | 'course-meta' | 'detail-links' | 'complete' | 'error'
  message?: string
  courses?: UcasImportedCourse[]
  courseMeta?: UcasCourseMeta[]
  failures?: string[]
  warnings?: string[]
  detailLinks?: UcasDetailLink[]
}

export interface ValidatedUcasImport {
  courses: UcasImportedCourse[]
  failures: string[]
  warnings?: string[]
}

export type UcasImportValidation =
  | { ok: true; value: ValidatedUcasImport }
  | { ok: false; message: string }

export interface BuildScheduleOptions {
  monday: string
  semesterName: string
  semesterWeeks: number
  campus: string
  now?: Date
}

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanText(value: unknown, fallback = '', max = 120): string {
  if (typeof value !== 'string') return fallback
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || fallback
}

function cleanFailures(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(item => cleanText(item, '', 180)).filter(Boolean))].slice(0, 100)
}

function validNumbers(value: unknown, max: number): number[] | null {
  if (!Array.isArray(value) || !value.length) return null
  if (!value.every(item => typeof item === 'number' && Number.isInteger(item) && item >= 1 && item <= max)) return null
  return [...new Set(value)].sort((a, b) => a - b)
}

function validMeeting(value: unknown): UcasImportedMeeting | null {
  if (!isRecord(value)) return null
  const sections = validNumbers(value.sections, MAX_SECTIONS)
  const weeks = validNumbers(value.weeks, MAX_WEEKS)
  const day = value.day
  if (typeof day !== 'number' || !Number.isInteger(day) || day < 1 || day > 7 || !sections || !weeks) return null
  return { day, sections, weeks, location: cleanText(value.location, '地点待确认', 120) }
}

function meetingKey(value: Pick<UcasImportedMeeting, 'day' | 'sections' | 'weeks'>): string {
  return `${value.day}|${value.sections.join(',')}|${value.weeks.join(',')}`
}

function locationKey(value: string): string {
  return cleanText(value, '', 120).replace(/[\s\u00a0·,，、;；:：()（）[\]{}]/g, '').toLocaleLowerCase()
}

function unknownLocation(value: string): boolean {
  const key = locationKey(value)
  return !key || ['地点待确认', '待确认', '暂无', '未安排', '待定', '-'].includes(key)
}

function cloneMeeting(value: UcasImportedMeeting): UcasImportedMeeting {
  return { day: value.day, sections: [...value.sections], weeks: [...value.weeks], location: value.location }
}

function cloneCourse(value: UcasImportedCourse): UcasImportedCourse {
  return {
    name: value.name,
    ...(value.code ? { code: value.code } : {}),
    teacher: value.teacher,
    ...(value.isDegreeCourse !== undefined ? { isDegreeCourse: value.isDegreeCourse } : {}),
    ...(value.exam ? { exam: value.exam } : {}),
    meetings: value.meetings.map(cloneMeeting),
  }
}

function teacherPlaceholder(value: string): boolean {
  const normalized = value.replace(/\s+/g, '').toLocaleLowerCase()
  return !normalized || /^(?:教师待确认|待确认|暂无|未知|未安排|待定|请选择|主讲教师|授课教师|任课教师|首席教授|教师|无|是|否|有|没有|-|—|——)$/.test(normalized)
}

function examPlaceholder(value: string): boolean {
  const normalized = value.replace(/\s+/g, '').toLocaleLowerCase()
  return !normalized || /^(?:考试方式|待确认|暂无|未知|未安排|待定|请选择|无|-|—|——)$/.test(normalized)
}

function parseDegree(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return undefined
  const normalized = value.replace(/\s+/g, '')
  if (/^是/.test(normalized)) return true
  if (/^否/.test(normalized)) return false
  return undefined
}

function courseNameKey(value: string): string { return cleanText(value, '', 120).replace(/\s+/g, '').toLocaleLowerCase() }
function courseCodeKey(value: string | undefined): string { return cleanText(value, '', 80).replace(/[\s-]/g, '').toLocaleLowerCase() }

/** Validate metadata rows from the xkgo selected-course table. */
export function validateUcasCourseMeta(value: unknown): UcasCourseMeta[] {
  if (!Array.isArray(value)) return []
  const result: UcasCourseMeta[] = []
  for (const raw of value.slice(0, 300)) {
    if (!isRecord(raw)) continue
    const name = cleanText(raw.name, '', 120)
    if (!name) continue
    const code = cleanText(raw.code, '', 80)
    const teacher = cleanText(raw.teacher, '', 100)
    const exam = cleanText(raw.exam, '', 80)
    const degree = parseDegree(raw.isDegreeCourse !== undefined ? raw.isDegreeCourse : raw.isDegree !== undefined ? raw.isDegree : raw.degree)
    const normalizedTeacher = teacher && !teacherPlaceholder(teacher) ? teacher : undefined
    const normalizedExam = exam && !examPlaceholder(exam) ? exam : undefined
    const incoming: UcasCourseMeta = {
      name,
      ...(code ? { code } : {}),
      ...(normalizedTeacher ? { teacher: normalizedTeacher } : {}),
      ...(degree !== undefined ? { isDegreeCourse: degree } : {}),
      ...(normalizedExam ? { exam: normalizedExam } : {}),
    }
    const key = code ? `code:${courseCodeKey(code)}` : `name:${courseNameKey(name)}`
    const existing = result.find(item => (item.code ? `code:${courseCodeKey(item.code)}` : `name:${courseNameKey(item.name)}`) === key)
    if (!existing) result.push(incoming)
    else {
      if (!existing.code && incoming.code) existing.code = incoming.code
      if (!existing.teacher && incoming.teacher) existing.teacher = incoming.teacher
      if (existing.isDegreeCourse === undefined && incoming.isDegreeCourse !== undefined) existing.isDegreeCourse = incoming.isDegreeCourse
      if (!existing.exam && incoming.exam) existing.exam = incoming.exam
    }
  }
  return result
}

/**
 * Merge metadata with arrangements. A code is the strongest identity. A name
 * is used only when it maps to one course, so same-name/different-code rows are
 * never assigned a teacher by guesswork.
 */
export function mergeUcasCourseMetadata(input: UcasImportedCourse[], metadata: unknown): UcasImportedCourse[] {
  const courses = input.map(cloneCourse)
  const records = validateUcasCourseMeta(metadata)
  for (const meta of records) {
    let matches = meta.code
      ? courses.filter(course => courseCodeKey(course.code) === courseCodeKey(meta.code) && courseNameKey(course.name) === courseNameKey(meta.name))
      : courses.filter(course => courseNameKey(course.name) === courseNameKey(meta.name))
    if (!matches.length && meta.code) matches = courses.filter(course => courseCodeKey(course.code) === courseCodeKey(meta.code))
    // Detail pages often omit the course code. If there is exactly one
    // arrangement with this name and it has no other code, assigning the
    // metadata is safe; multiple same-name arrangements remain unresolved.
    if (!matches.length && meta.code) {
      const nameMatches = courses.filter(course => courseNameKey(course.name) === courseNameKey(meta.name) && !course.code)
      if (nameMatches.length === 1) matches = nameMatches
    }
    let course = matches.length === 1 ? matches[0] : undefined
    if (!course && !matches.length) {
      course = { name: meta.name, ...(meta.code ? { code: meta.code } : {}), teacher: meta.teacher || '教师待确认', ...(meta.isDegreeCourse !== undefined ? { isDegreeCourse: meta.isDegreeCourse } : {}), ...(meta.exam ? { exam: meta.exam } : {}), meetings: [] }
      courses.push(course)
    }
    if (!course) continue
    if (!course.code && meta.code) course.code = meta.code
    if (teacherPlaceholder(course.teacher) && meta.teacher) course.teacher = meta.teacher
    if (course.isDegreeCourse === undefined && meta.isDegreeCourse !== undefined) course.isDegreeCourse = meta.isDegreeCourse
    if (examPlaceholder(course.exam || '') && meta.exam) course.exam = meta.exam
  }
  return courses
}

/** Keep multiple detail pages for one coded course together. */
export function mergeUcasImportedCourses(input: UcasImportedCourse[]): UcasImportedCourse[] {
  const courses: UcasImportedCourse[] = []
  for (const raw of input) {
    const name = cleanText(raw?.name, '', 100)
    const code = cleanText(raw?.code, '', 80)
    const teacher = cleanText(raw?.teacher, '教师待确认', 100)
    const meetings = (Array.isArray(raw?.meetings) ? raw.meetings : []).map(validMeeting).filter((item): item is UcasImportedMeeting => Boolean(item))
    if (!name || !meetings.length) continue
    const nameKey = courseNameKey(name), codeKey = courseCodeKey(code)
    let course = courses.find(item => {
      if (courseNameKey(item.name) !== nameKey) return false
      const itemCode = courseCodeKey(item.code)
      if (codeKey || itemCode) return Boolean(codeKey && itemCode && codeKey === itemCode)
      return teacherPlaceholder(item.teacher) || teacherPlaceholder(teacher) || item.teacher === teacher
    })
    if (!course) {
      course = { name, ...(code ? { code } : {}), teacher, ...(raw.isDegreeCourse !== undefined ? { isDegreeCourse: raw.isDegreeCourse } : {}), ...(raw.exam ? { exam: cleanText(raw.exam, '', 80) || undefined } : {}), meetings: [] }
      courses.push(course)
    }
    if (!course.code && code) course.code = code
    if (course.teacher && teacherPlaceholder(course.teacher) && !teacherPlaceholder(teacher)) course.teacher = teacher
    if (course.isDegreeCourse === undefined && raw.isDegreeCourse !== undefined) course.isDegreeCourse = raw.isDegreeCourse
    if (!course.exam && raw.exam) course.exam = cleanText(raw.exam, '', 80) || undefined
    for (const meeting of meetings) {
      const existing = course.meetings.find(item => meetingKey(item) === meetingKey(meeting))
      if (!existing) course.meetings.push(cloneMeeting(meeting))
      else if (unknownLocation(existing.location) && !unknownLocation(meeting.location)) existing.location = meeting.location
    }
  }
  return courses
}

/** Keep only strict course-time URLs before native navigation. */
export function isUcasCourseDetailUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && UCAS_COURSE_DETAIL_ORIGINS.includes(url.origin.toLowerCase() as typeof UCAS_COURSE_DETAIL_ORIGINS[number]) && /^\/course\/coursetime\/\d+\/?$/.test(url.pathname)
  } catch {
    return /^https:\/\/(?:xkcts\.ucas\.ac\.cn:8443|jwxk\.ucas\.ac\.cn)\/course\/coursetime\/\d+(?:[/?#]|$)/i.test(value)
  }
}

/** Validate data received from the native page. Invalid entries never reach storage. */
export function validateUcasImportPayload(value: unknown): UcasImportValidation {
  if (!isRecord(value) || value.kind !== UCAS_IMPORT_KIND || value.version !== UCAS_IMPORT_VERSION || value.status !== 'complete') return { ok: false, message: '读取结果来源不正确，请重新打开教务课程页面后再试。' }
  if (!Array.isArray(value.courses)) return { ok: false, message: '教务页面没有返回课程列表。' }
  const failures = cleanFailures(value.failures), courses: UcasImportedCourse[] = []
  for (let index = 0; index < Math.min(value.courses.length, 300); index += 1) {
    const rawCourse = value.courses[index]
    if (!isRecord(rawCourse)) { failures.push(`第 ${index + 1} 个课程项目格式不完整`); continue }
    const name = cleanText(rawCourse.name, '', 100)
    const code = cleanText(rawCourse.code, '', 80)
    const teacher = cleanText(rawCourse.teacher, '教师待确认', 100)
    const exam = cleanText(rawCourse.exam, '', 80)
    const isDegreeCourse = typeof rawCourse.isDegreeCourse === 'boolean' ? rawCourse.isDegreeCourse : undefined
    const meetings = (Array.isArray(rawCourse.meetings) ? rawCourse.meetings : []).map(validMeeting).filter((item): item is UcasImportedMeeting => Boolean(item))
    const uniqueMeetings: UcasImportedMeeting[] = []
    for (const meeting of meetings) {
      const existing = uniqueMeetings.find(item => meetingKey(item) === meetingKey(meeting))
      if (!existing) uniqueMeetings.push(meeting)
      else if (unknownLocation(existing.location) && !unknownLocation(meeting.location)) existing.location = meeting.location
    }
    if (!name || !uniqueMeetings.length) { failures.push(`${name || `第 ${index + 1} 个课程`}未读取到完整上课安排`); continue }
    courses.push({ name, ...(code ? { code } : {}), teacher, ...(isDegreeCourse !== undefined ? { isDegreeCourse } : {}), ...(exam && !examPlaceholder(exam) ? { exam } : {}), meetings: uniqueMeetings })
  }
  if (!courses.length) return { ok: false, message: '没有读到可保存的课程。请确认已打开课程页面。' }
  const warnings = cleanFailures(value.warnings)
  return { ok: true, value: { courses, failures: [...new Set(failures)].slice(0, 100), ...(warnings.length ? { warnings } : {}) } }
}

function isMonday(value: string): boolean {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return false
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day && date.getUTCDay() === 1
}

export function buildScheduleFromUcasImport(imported: ValidatedUcasImport, options: BuildScheduleOptions): Schedule {
  const monday = cleanText(options.monday, '', 10), name = cleanText(options.semesterName, '', 60), campus = cleanText(options.campus, '', 60), weeks = options.semesterWeeks
  if (!isMonday(monday)) throw new Error('第一教学周起始日应填写为周一，例如 2026-08-31。')
  if (!name) throw new Error('请填写学期名称。')
  if (!campus) throw new Error('请填写校区。')
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_WEEKS) throw new Error(`教学周数应在 1–${MAX_WEEKS} 之间。`)
  const courses: Course[] = [], meetings: Meeting[] = []
  let meetingIndex = 0
  imported.courses.forEach((course, courseIndex) => {
    const courseId = `ucas-course-${courseIndex + 1}`
    courses.push({ id: courseId, name: course.name, ...(course.code ? { code: course.code } : {}), teacher: course.teacher, ...(course.isDegreeCourse !== undefined ? { isDegreeCourse: course.isDegreeCourse } : {}), ...(course.exam ? { exam: course.exam } : {}), color: courseColors[courseIndex % courseColors.length], origin: 'ucas' })
    course.meetings.forEach(meeting => {
      if (meeting.weeks.some(week => week > weeks)) throw new Error(`“${course.name}”包含第 ${Math.max(...meeting.weeks)} 周，请先把教学周数调整为足够的数值。`)
      meetingIndex += 1
      meetings.push({ id: `ucas-meeting-${meetingIndex}`, courseId, day: meeting.day, sections: [...meeting.sections], weeks: [...meeting.weeks], location: meeting.location })
    })
  })
  return { version: 1, semester: { id: `ucas-${monday}-${(options.now || new Date()).getTime()}`, name, monday, weeks, campus, confirmed: true }, courses, meetings, periods: demoPeriods.map(period => ({ ...period })), importedAt: (options.now || new Date()).toISOString() }
}

export function isUcasCourseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:') return false
    const origin = url.origin.toLowerCase(), path = decodeURIComponent(url.pathname)
    if (UCAS_COURSE_SITE_ORIGINS.includes(origin as typeof UCAS_COURSE_SITE_ORIGINS[number])) return /^\/(?:courseManage\/main(?:-[A-Za-z0-9]+)?|courseManage\/selectedCourse|course\/personSchedule)(?:;[^/?#]*)?\/?$/i.test(path)
    if (UCAS_COURSE_DETAIL_ORIGINS.includes(origin as typeof UCAS_COURSE_DETAIL_ORIGINS[number])) return /^\/(?:login|main|redirect|course\/coursetime\/\d+)(?:;[^/?#]*)?\/?$/i.test(path)
    return false
  } catch {
    return /^https:\/\/xkgo\.ucas\.ac\.cn:3000\/courseManage\/main(?:-[A-Za-z0-9]+)?(?:;[^/?#]*)?(?:[/?#]|$)/i.test(value)
      || /^https:\/\/xkgo\.ucas\.ac\.cn:3000\/courseManage\/selectedCourse(?:;[^/?#]*)?(?:[/?#]|$)/i.test(value)
      || /^https:\/\/xkgo\.ucas\.ac\.cn:3000\/course\/personSchedule(?:;[^/?#]*)?(?:[/?#]|$)/i.test(value)
      || /^https:\/\/xkgodj\.ucas\.ac\.cn\/(?:courseManage\/(?:main(?:-[A-Za-z0-9]+)?|selectedCourse)|course\/personSchedule)(?:;[^/?#]*)?(?:[/?#]|$)/i.test(value)
      || /^https:\/\/xkcts\.ucas\.ac\.cn:8443\/(?:login|main|redirect|course\/coursetime\/\d+)(?:;[^/?#]*)?(?:[/?#]|$)/i.test(value)
      || /^https:\/\/jwxk\.ucas\.ac\.cn\/(?:login|main|redirect|course\/coursetime\/\d+)(?:;[^/?#]*)?(?:[/?#]|$)/i.test(value)
  }
}

/** The school may change client-side routes without changing the trusted course-system origin. */
export function isUcasCourseSiteUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && UCAS_COURSE_SITE_ORIGINS.includes(url.origin.toLowerCase() as typeof UCAS_COURSE_SITE_ORIGINS[number])
  } catch { return /^https:\/\/(?:xkgo\.ucas\.ac\.cn:3000|xkgodj\.ucas\.ac\.cn)(?:[/?#]|$)/i.test(value) }
}

interface NativeStorage { getItem(key: string): string | null | undefined; removeItem(key: string): void }
function nativeStorage(): NativeStorage | undefined { return (globalThis as typeof globalThis & { plus?: { storage?: NativeStorage } }).plus?.storage }
export function clearNativeImportHandoff(): void { try { nativeStorage()?.removeItem(UCAS_IMPORT_HANDOFF_KEY) } catch { /* bridge may not be ready */ } }
export function readNativeImportHandoff(): unknown | undefined { try { const raw = nativeStorage()?.getItem(UCAS_IMPORT_HANDOFF_KEY); return raw ? JSON.parse(raw) : undefined } catch { return undefined } }
export function nativeImportHandoffAvailable(): boolean { return Boolean(nativeStorage()) }

/** Run on xkgo's current selected-course page and read course metadata. */
export function createUcasCourseMetaExtractionScript(storageKey = UCAS_IMPORT_HANDOFF_KEY): string {
  return createCurrentUcasExtractionScript({ storageKey, kind: UCAS_IMPORT_KIND, action: 'course-meta', detailOrigin: UCAS_COURSE_DETAIL_ORIGIN })
}

/** Run on the authenticated personal schedule or a course-time detail page. */
export function createUcasExtractionScript(storageKey = UCAS_IMPORT_HANDOFF_KEY, fallbackName = '', sourceUrl = ''): string {
  return createCurrentUcasExtractionScript({ storageKey, kind: UCAS_IMPORT_KIND, action: fallbackName ? 'detail' : 'personal', detailOrigin: detailOriginForCoursePage(sourceUrl), fallbackName })
}

export type UcasProgressOverlayPhase = 'starting' | 'metadata' | 'personal' | 'detail' | 'finishing' | 'complete'

export interface UcasProgressOverlayState {
  value: number
  phase: UcasProgressOverlayPhase
  label: string
  /** Mirrors the app preference so the native page overlay can stay quiet when requested. */
  reducedMotion?: boolean
}

/** Inject the quiet, payment-style spinner used while the page is being read. */
export function createUcasProgressOverlayScript(state: UcasProgressOverlayState): string {
  const label = cleanText(state.label, '正在读取课表…', 180)
  const phase = state.phase
  return `;(function(){try{var state=${JSON.stringify({ phase, label, reducedMotion: Boolean(state.reducedMotion) })};var ROOT_ID='__lakeside_progress_overlay_v2__',STYLE_ID='__lakeside_progress_overlay_style_v2__',circumference=245.044;var style=document.getElementById(STYLE_ID);if(!style){style=document.createElement('style');style.id=STYLE_ID;style.textContent='#'+ROOT_ID+'{position:fixed;inset:0;z-index:2147483646;display:grid;place-items:center;pointer-events:none;visibility:hidden;opacity:0;background:transparent;-webkit-backdrop-filter:none;backdrop-filter:none;transition:opacity .34s cubic-bezier(.22,1,.36,1),visibility 0s linear .34s}#'+ROOT_ID+'.is-visible{visibility:visible;opacity:1;transition-delay:0s}#'+ROOT_ID+' .lc-veil{display:none!important;position:fixed;inset:0;z-index:0;pointer-events:none;background:rgba(225,237,246,.08);-webkit-backdrop-filter:blur(2.5px) saturate(.97);backdrop-filter:blur(2.5px) saturate(.97)}#'+ROOT_ID+' .lc-stage{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;gap:8px}#'+ROOT_ID+' .lc-orb{width:112px;height:112px;position:relative;display:grid;place-items:center;background:transparent}#'+ROOT_ID+' svg{width:92px;height:92px;overflow:visible}#'+ROOT_ID+' .lc-dot{fill:#527da8;opacity:.18;transform-box:fill-box;transform-origin:center;will-change:transform,opacity;animation:lc-dot-pulse 1.45s ease-in-out infinite}#'+ROOT_ID+'.lc-complete .lc-dot{fill:#5a9f7d;opacity:1;animation:lc-dot-impact 1.5s cubic-bezier(.22,1,.36,1) forwards}#'+ROOT_ID+' .lc-complete-ring{fill:none;stroke:#5a9f7d;stroke-width:5;stroke-linecap:round;stroke-dasharray:'+circumference+';stroke-dashoffset:'+circumference+';opacity:0;transition:stroke-dashoffset .5s cubic-bezier(.22,1,.36,1) .22s,opacity .2s ease .22s}#'+ROOT_ID+' .lc-check{fill:none;stroke:#5a9f7d;stroke-width:5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:60;stroke-dashoffset:60;opacity:0;transition:stroke-dashoffset .9s cubic-bezier(.22,1,.36,1),opacity .2s ease}#'+ROOT_ID+'.lc-complete .lc-complete-ring{opacity:1;stroke-dashoffset:0}#'+ROOT_ID+'.lc-complete .lc-check{opacity:1;stroke-dashoffset:0;transition-delay:.9s}#'+ROOT_ID+' .lc-caption{min-height:18px;text-align:center;text-shadow:0 1px 9px rgba(255,255,255,.8)}#'+ROOT_ID+' .lc-kicker{color:#7892a7;font:700 9px/1.1 -apple-system,BlinkMacSystemFont,"SF Pro Display","PingFang SC",sans-serif;letter-spacing:1.2px}#'+ROOT_ID+' .lc-label{max-width:240px;margin-top:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#5d7990;font:600 11px/1.35 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}#'+ROOT_ID+'.lc-reduced-motion.lc-complete .lc-dot{opacity:0;animation:none}#'+ROOT_ID+'.lc-reduced-motion,#'+ROOT_ID+'.lc-reduced-motion *{animation:none!important;transition:none!important}#'+ROOT_ID+'.lc-reduced-transparency{background:transparent;-webkit-backdrop-filter:none;backdrop-filter:none}#'+ROOT_ID+'.lc-reduced-transparency .lc-veil{background:rgba(239,246,251,.74);-webkit-backdrop-filter:none;backdrop-filter:none}#'+ROOT_ID+'.lc-reduced-transparency .lc-orb{background:transparent}@keyframes lc-dot-pulse{0%,100%{opacity:.18;transform:scale(.72)}40%{opacity:1;transform:scale(1.18)}}@keyframes lc-dot-impact{0%{opacity:1;transform:scale(1)}42%{opacity:1;transform:translate(var(--dx),var(--dy)) scale(1.14)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) scale(.22)}}@media(prefers-reduced-motion:reduce){#'+ROOT_ID+' *{animation:none!important;transition:none!important}}@media(prefers-reduced-transparency:reduce){#'+ROOT_ID+'{background:transparent;-webkit-backdrop-filter:none;backdrop-filter:none}#'+ROOT_ID+' .lc-veil{background:rgba(239,246,251,.74);-webkit-backdrop-filter:none;backdrop-filter:none}#'+ROOT_ID+' .lc-orb{background:transparent}}';(document.head||document.documentElement).appendChild(style)}var root=document.getElementById(ROOT_ID);if(!root){root=document.createElement('div');root.id=ROOT_ID;root.setAttribute('role','status');root.setAttribute('aria-live','polite');root.innerHTML='<div class="lc-veil" data-native-veil></div><div class="lc-stage"><div class="lc-orb"><svg viewBox="0 0 120 120" aria-hidden="true"><g data-dots></g><circle class="lc-complete-ring" data-complete-ring cx="60" cy="60" r="39" transform="rotate(-90 60 60)"/><path class="lc-check" data-check d="M44 60 L53 69 L75 48"/></svg></div><div class="lc-caption"><div class="lc-label" data-label>正在读取</div></div></div>';(document.body||document.documentElement).appendChild(root)}var preveil=document.getElementById('__lakeside_progress_native_veil__');if(preveil)preveil.style.display='none';var complete=state.phase==='complete',dots=root.querySelector('[data-dots]');if(dots&&!dots.childNodes.length){for(var i=0;i<18;i++){var dot=document.createElementNS('http://www.w3.org/2000/svg','circle'),angle=(Math.PI*2*i/18)-Math.PI/2;dot.setAttribute('class','lc-dot');dot.setAttribute('cx',String(60+39*Math.cos(angle)));dot.setAttribute('cy',String(60+39*Math.sin(angle)));dot.setAttribute('r','2.7');dot.style.animationDelay=String(i*(1.45/18)-1.45)+'s';dots.appendChild(dot)}}if(dots){var progressDots=dots.querySelectorAll('.lc-dot');for(var j=0;j<progressDots.length;j++){var progressDot=progressDots[j],impactAngle=(Math.PI*2*j/18)-Math.PI/2;if(complete){progressDot.style.setProperty('--dx',String(8*Math.cos(impactAngle))+'px');progressDot.style.setProperty('--dy',String(8*Math.sin(impactAngle))+'px');progressDot.style.animationDelay=String(j*.012)+'s'}else{progressDot.style.animationDelay=String(j*(1.45/18)-1.45)+'s';progressDot.style.removeProperty('--dx');progressDot.style.removeProperty('--dy')}}}var labelNode=root.querySelector('[data-label]'),kicker=root.querySelector('[data-kicker]'),phaseLabels={starting:'连接教务',metadata:'课程信息',personal:'上课安排',detail:'课程详情',finishing:'整理结果',complete:'读取完成'};if(labelNode)labelNode.textContent=state.label;if(kicker)kicker.textContent=phaseLabels[state.phase]||'读取课表';root.setAttribute('aria-label',complete?'课表读取完成':state.label||'正在读取课表');root.classList.toggle('is-visible',true);root.classList.toggle('lc-complete',complete);root.classList.toggle('lc-reduced-motion',Boolean(state.reducedMotion)||(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches));root.classList.toggle('lc-reduced-transparency',!!(window.matchMedia&&window.matchMedia('(prefers-reduced-transparency: reduce)').matches))}catch(_){}})();`
}

/** Website-local Gaussian blur; the sibling indicator remains transparent and sharp. */
export const UCAS_PROGRESS_BLUR_PX = 1.2
export const UCAS_PROGRESS_VEIL_ALPHA = .02

export function createUcasProgressBlurScript(): string {
  return `;(function(){try{
    if(window.top!==window.self)return;
    if(window.__lakesideReadingBlur){window.__lakesideReadingBlur.update();return;}
    var ROOT_ID='__lakeside_progress_blur_v1__',STYLE_ID='__lakeside_progress_blur_style_v2__';
    var observer=null,stopped=false;
    function update(){
    if(stopped||!document.documentElement)return;
    var style=document.getElementById(STYLE_ID);
    if(!style){
      style=document.createElement('style');style.id=STYLE_ID;
      style.textContent='#'+ROOT_ID+'{position:fixed;inset:0;z-index:2147483645;pointer-events:none;background:rgba(225,237,246,${UCAS_PROGRESS_VEIL_ALPHA});-webkit-backdrop-filter:blur(var(--lc-reading-blur,${UCAS_PROGRESS_BLUR_PX}px)) saturate(.97);backdrop-filter:blur(var(--lc-reading-blur,${UCAS_PROGRESS_BLUR_PX}px)) saturate(.97)}@media(prefers-reduced-transparency:reduce){#'+ROOT_ID+'{background:rgba(239,246,251,.74);-webkit-backdrop-filter:none;backdrop-filter:none}}';
      (document.head||document.documentElement).appendChild(style);
    }
    var root=document.getElementById(ROOT_ID);
    if(!root){
      root=document.createElement('div');root.id=ROOT_ID;root.setAttribute('aria-hidden','true');
      document.documentElement.appendChild(root);
    }
    // Desktop-mode pages are zoomed out; keep the visual blur radius consistent.
    var scale=window.visualViewport&&window.visualViewport.scale||1;
    root.style.setProperty('--lc-reading-blur',String(${UCAS_PROGRESS_BLUR_PX}/Math.max(.1,scale))+'px');
    root.style.display='block';
    }
    function stop(){stopped=true;if(observer)observer.disconnect();if(window.visualViewport&&window.visualViewport.removeEventListener)window.visualViewport.removeEventListener('resize',update);var root=document.getElementById(ROOT_ID);if(root)root.remove();delete window.__lakesideReadingBlur;}
    window.__lakesideReadingBlur={update:update,stop:stop};
    // Document-start may precede <html>. Observe parser insertion before paint,
    // and repair a removed veil without polling or changing website content.
    if(typeof MutationObserver!=='undefined'){observer=new MutationObserver(function(){if(!document.getElementById(ROOT_ID)||!document.getElementById(STYLE_ID))update();});observer.observe(document,{childList:true,subtree:true});}
    if(window.visualViewport&&window.visualViewport.addEventListener)window.visualViewport.addEventListener('resize',update);
    update();
  }catch(_){}})();`
}

/** Remove the light page veil when reading is cancelled or finished. */
export function createUcasProgressBlurHideScript(): string {
  return `;(function(){try{if(window.__lakesideReadingBlur){window.__lakesideReadingBlur.stop();return;}var root=document.getElementById('__lakeside_progress_blur_v1__');if(root)root.remove()}catch(_){}})();`
}

/** Remove the page-local progress overlay when the native browser closes. */
export function createUcasProgressOverlayHideScript(): string {
  return `;(function(){try{var preveil=document.getElementById('__lakeside_progress_native_veil__');if(preveil)preveil.style.display='block';var root=document.getElementById('__lakeside_progress_overlay_v2__')||document.getElementById('__lakeside_progress_overlay_v1__');if(root)root.classList.remove('is-visible')}catch(_){}})();`
}

export function createUcasPortalHandoffScript(storageKey = UCAS_IMPORT_HANDOFF_KEY): string {
  return createCurrentUcasPortalHandoffScript({ storageKey, kind: UCAS_IMPORT_KIND, detailOrigin: UCAS_COURSE_DETAIL_ORIGIN })
}

export function validateUcasDetailLinks(value: unknown): UcasDetailLink[] {
  if (!Array.isArray(value)) return []
  const links: UcasDetailLink[] = [], seen = new Set<string>()
  for (const rawLink of value.slice(0, 200)) {
    if (!isRecord(rawLink)) continue
    const rawUrl = cleanText(rawLink.url, '', 300)
    if (!rawUrl || !isUcasCourseDetailUrl(rawUrl)) continue
    let url = rawUrl
    try { url = new URL(rawUrl).href } catch { /* strict predicate already checked fallback */ }
    if (seen.has(url)) continue
    seen.add(url)
    const navigationRaw = cleanText(rawLink.navigationUrl, '', 500)
    let navigationUrl = ''
    if (navigationRaw) {
      try {
        const navigation = new URL(navigationRaw), target = navigation.searchParams.get('sepToUrl') || navigation.searchParams.get('toUrl') || ''
        const isPortal = navigation.protocol === 'https:' && navigation.origin.toLowerCase() === 'https://sep.ucas.ac.cn' && /^\/portal\/site\//.test(navigation.pathname)
        const isDetail = navigation.protocol === 'https:' && UCAS_COURSE_ORIGINS.includes(navigation.origin.toLowerCase() as typeof UCAS_COURSE_ORIGINS[number]) && /^\/course\/coursetime\/\d+\/?$/.test(navigation.pathname)
        const isDetailLogin = navigation.protocol === 'https:' && UCAS_COURSE_DETAIL_ORIGINS.includes(navigation.origin.toLowerCase() as typeof UCAS_COURSE_DETAIL_ORIGINS[number]) && /^\/(?:login|main)\/?$/.test(navigation.pathname) && navigation.searchParams.has('Identity') && /\/course\/coursetime\/\d+/.test(target)
        if (isPortal || isDetail || isDetailLogin) navigationUrl = navigation.href
      } catch { /* optional navigation falls back to direct detail */ }
    }
    const link: UcasDetailLink = { url, label: cleanText(rawLink.label, '课程详情', 100) }
    if (navigationUrl && navigationUrl !== url) link.navigationUrl = navigationUrl
    links.push(link)
  }
  return links
}
