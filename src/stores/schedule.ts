import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { demoPeriods, makeDemo, type Scenario } from '../data/demo'
import { isSchedule, teachingWeek, tilesForWeek, type Schedule } from '../domain/schedule'
import { syncSavedWidgetSchedule } from '../services/widget-sync'

const STORAGE_KEY = 'lakeside:schedule:v1'
type StorageReadState = 'missing' | 'valid' | 'invalid'

let initialStorageState: StorageReadState = 'missing'

function readStoredSchedule(): Schedule | null {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    if (raw === null || raw === undefined || raw === '') {
      initialStorageState = 'missing'
      return null
    }
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!isSchedule(value)) {
      initialStorageState = 'invalid'
      return null
    }
    // Keep schedules saved by earlier previews aligned with the current UCAS
    // 13-period timetable. Periods are not user-editable in this version.
    initialStorageState = 'valid'
    return { ...value, periods: demoPeriods.map(period => ({ ...period })) }
  } catch {
    initialStorageState = 'invalid'
    return null
  }
}

function writeStoredSchedule(schedule: Schedule): boolean {
  try {
    uni.setStorageSync(STORAGE_KEY, JSON.stringify(schedule))
    return true
  } catch {
    return false
  }
}

export const useScheduleStore = defineStore('schedule', () => {
  const storedSchedule = readStoredSchedule()
  const schedule = ref<Schedule>(storedSchedule || makeDemo('normal'))
  const scenario = ref<Scenario>('normal')
  const isDemo = ref(!storedSchedule)
  const storageIssue = ref(initialStorageState === 'invalid')
  const week = ref(1)
  const reducedMotion = ref(false)
  // Controls whether the timetable cards include the teacher line. Keep it
  // enabled by default so existing imported schedules retain their current
  // presentation until the user changes the preference.
  const showTeachers = ref(true)
  // Match the existing session-scoped display preferences. Hiding this line
  // must not remove the assessment metadata from course details or storage.
  const showExams = ref(true)
  // Keep the timetable cards compact by default. Full section details remain
  // available in the course detail sheet.
  const showSections = ref(false)
  const currentWeek = computed(() => teachingWeek(schedule.value.semester.monday, new Date()))
  const tiles = computed(() => tilesForWeek(schedule.value, week.value))
  const saveStatus = computed(() => {
    if (storageIssue.value) return { tone: 'alert' as const, label: '保存异常', description: '课表最近一次本地保存失败，请打开设置后重新导入或保存。' }
    if (isDemo.value) return { tone: 'alert' as const, label: '未保存', description: '当前为示例课表，尚未保存真实教务课表。' }
    if (!schedule.value.semester.confirmed) return { tone: 'alert' as const, label: '待确认', description: '学期信息尚未确认，请打开设置核对学期起始日。' }
    if (!schedule.value.courses.length || !schedule.value.meetings.length) return { tone: 'alert' as const, label: '数据异常', description: '课表缺少课程或上课安排，请重新从教务导入。' }
    if (!schedule.value.importedAt || Number.isNaN(Date.parse(schedule.value.importedAt))) return { tone: 'alert' as const, label: '数据异常', description: '课表导入时间无效，请重新从教务导入。' }
    if (schedule.value.meetings.some(meeting => !schedule.value.courses.some(course => course.id === meeting.courseId))) return { tone: 'alert' as const, label: '数据异常', description: '课表存在无对应课程的上课安排，请重新从教务导入。' }
    return { tone: 'healthy' as const, label: '已保存', description: '课表已正常保存到此设备。' }
  })
  function currentWeekFor(value: Schedule): number { return Math.min(value.semester.weeks, Math.max(1, teachingWeek(value.semester.monday, new Date()))) }
  week.value = currentWeekFor(schedule.value)
  function setWeek(value: number) { week.value = Math.min(schedule.value.semester.weeks, Math.max(1, value)) }
  function resetScenario(value: Scenario) { scenario.value = value; isDemo.value = true; schedule.value = makeDemo(value); week.value = currentWeekFor(schedule.value) }
  function goCurrent() { setWeek(currentWeek.value) }
  function replaceSchedule(value: Schedule): boolean {
    if (!isSchedule(value)) { storageIssue.value = true; return false }
    if (!writeStoredSchedule(value)) { storageIssue.value = true; return false }
    schedule.value = value
    isDemo.value = false
    storageIssue.value = false
    scenario.value = 'normal'
    week.value = currentWeekFor(value)
    void syncSavedWidgetSchedule(value)
    return true
  }
  function persistCurrent(): boolean {
    if (isDemo.value) return false
    const ok = writeStoredSchedule(schedule.value)
    storageIssue.value = !ok
    if (ok) void syncSavedWidgetSchedule(schedule.value)
    return ok
  }
  function reconcileWidgets(force = false): Promise<void> {
    const saved = readStoredSchedule()
    // A corrupt primary store must not silently overwrite a previously valid native cache.
    if (!saved && initialStorageState === 'invalid') return Promise.resolve()
    return syncSavedWidgetSchedule(saved, force)
  }
  return { schedule, scenario, isDemo, week, reducedMotion, showTeachers, showExams, showSections, currentWeek, tiles, saveStatus, setWeek, resetScenario, goCurrent, replaceSchedule, persistCurrent, reconcileWidgets }
})
