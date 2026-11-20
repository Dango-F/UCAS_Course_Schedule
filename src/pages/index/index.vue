<template>
  <view class="app-shell" :class="{ 'reduced-motion': store.reducedMotion }" @keydown="onImportKeydown">
    <LaunchScreen v-if="launchVisible" :ready="launchReady" :reduced-motion="store.reducedMotion" @finished="launchVisible = false" />
    <view class="desktop-caption"><AppIcon name="lake" :size="28" color="#527DA8" /><text>湖畔课表</text><text class="desktop-subtitle">让时间，清晰一点。</text></view>
    <view class="phone-canvas" :inert="canvasCovered || undefined" :aria-hidden="canvasCovered ? 'true' : undefined">
      <view class="timetable-pane" :class="{ 'inactive-pane': activeTab !== 0 }" :inert="activeTab !== 0 ? true : undefined" :aria-hidden="activeTab !== 0 ? 'true' : undefined">
        <view class="top-area" :class="{ 'is-reference-only': activeTab !== 0 }" :inert="activeTab !== 0 || (importSection !== 'home' && importPhase !== 'leaving') ? true : undefined" :aria-hidden="activeTab !== 0 || (importSection !== 'home' && importPhase !== 'leaving') ? 'true' : undefined">
          <view class="brand-row">
            <view class="brand-cluster">
              <view class="brand"><AppIcon name="lake" :size="23" color="#527DA8" /><text>湖畔课表</text><text v-if="store.isDemo" class="preview-badge">设计预览</text><view v-else class="save-status" :class="store.saveStatus.tone" :aria-label="store.saveStatus.description"><view class="status-light"/><text v-if="store.saveStatus.tone === 'alert'" class="status-alert-label">{{ store.saveStatus.label }}</text></view></view>
              <text class="semester-inline">{{ store.schedule.semester.name }}</text>
            </view>
            <view class="header-actions"><button class="import-icon" aria-label="从教务导入" @click="openImport()"><AppIcon name="plus" :size="22" color="#527DA8" /></button></view>
          </view>
          <view class="week-navigation">
            <button class="week-select" aria-label="选择教学周" @click="openWeekPicker"><text>第 {{ String(displayWeek).padStart(2, '0') }} 周</text><AppIcon name="down" :size="14" color="#527DA8" /></button>
            <button class="week-view-toggle" :aria-label="calendarView === 'grid' ? '切换到排列视图' : '切换到原始周视图'" :aria-pressed="calendarView === 'list'" @click="toggleCalendarView"><AppIcon :name="calendarView === 'grid' ? 'layout-columns' : 'layout-rows'" :size="19" color="#527DA8" /></button>
            <text class="week-range number">{{ weekRange }}</text>
            <view class="week-controls"><button v-if="displayWeek !== boundedCurrent" class="back-current" @click="goCurrentWeek"><text>回到本周</text></button><view class="week-arrow-controls"><button class="icon-button" aria-label="上一周" :disabled="displayWeek === 1" @click="stepWeek(-1)"><AppIcon name="left" :size="18" /></button><button class="icon-button" aria-label="下一周" :disabled="displayWeek === store.schedule.semester.weeks" @click="stepWeek(1)"><AppIcon name="right" :size="18" /></button></view></view>
          </view>
        </view>

        <!-- Release: V2 only. Comparison versions are preserved in the release backup. -->
        <CalendarNativeSwipeView :key="pagerEpoch" :week="store.week" :panels="nativePanels" :view-mode="calendarView"
          :reduced-motion="store.reducedMotion" :today-iso="todayISO" :focused-day-iso="focusedDayISO"
          :grid-add-dismissal="gridAddDismissal" :visible="activeTab === 0 && homeVisible"
          @week="store.setWeek($event)" @day="openDay" @group="openGroup" @grid-edit="openGridSlot"
          @empty="handleEmptyAction" @demo="showDemoSchedule" />
      </view>
      <TodayDashboard v-if="activeTab === 1" :inert="importSection !== 'home' && importPhase !== 'leaving' ? true : undefined" :date-iso="dashboardDateISO" :now="now" @course="showTodayDetail" />
      <SettingsDashboard ref="settingsDashboard" :active="activeTab === 2" :class="{ 'inactive-pane': activeTab !== 2 }" :aria-hidden="activeTab !== 2 ? 'true' : undefined"
        :inert="activeTab !== 2 || (importSection !== 'home' && importPhase !== 'leaving') ? true : undefined" :visible="homeVisible && activeTab === 2" @import="openImport" @detail-change="settingsPhase = $event" @update="showUpdate" />
      <GlassTestDashboard v-if="SHOW_DEVELOPER_TOOLS && activeTab === 3" :inert="importSection !== 'home' && importPhase !== 'leaving' ? true : undefined" />
      <!-- Same heading layout as the grid, measurable even in list/other tabs.
           Not a second visible timetable; excluded from focus/accessibility. -->
      <view class="navigation-anchor-heading" aria-hidden="true" inert>
        <CalendarDayHeading :month="Number(days[0].iso.slice(5,7))" :days="days" :today-iso="todayISO" :focused-day-iso="focusedDayISO" />
      </view>
      <LiquidGlassNavigation :week="store.week" :active-index="activeTab" :inert="navigationBlocked || undefined"
        :visible="activeTab !== 2 || settingsPhase !== 'open'" :reduced-motion="store.reducedMotion" @select="selectNavigation" />
      <SettingsSlide v-if="importSection !== 'home'" name="import" :epoch="importEpoch" :phase="importPhase"
        class="import-route" :exit-duration="IMPORT_ROUTE_EXIT_DURATION" @running="importRoute.viewStarted" @settled="importRoute.transitionEnd">
        <ImportDashboard ref="importDashboard" embedded :host-instance="pageInstance" @close="closeImport" />
      </SettingsSlide>
    </view>
    <view class="desktop-footer"><text>UCAS · LAKESIDE</text><text>版本 {{ installedVersion }}</text></view>

    <AppUpdateSheet v-if="presentedRelease" :open="panel === 'update'" :release="presentedRelease"
      :reduced-motion="store.reducedMotion" @dismiss="closeUpdate" />
    <BottomSheet :open="panel === 'detail'" title="课程详情" :motion-duration="150" :reduced-motion="store.reducedMotion" compact-header @close="closePanel">
      <CourseDetail v-if="selected" :tile="selected" :schedule="store.schedule" :week="selectedWeek" :demo="store.isDemo" :error="courseDeleteError"
        @edit="editSelected" @delete="deleteSelected" @weeks="openWeekPicker" />
    </BottomSheet>

    <BottomSheet :open="panel === 'weeks'" title="选择教学周" :reduced-motion="store.reducedMotion" @close="closePanel">
      <view class="week-sheet-heading"><text>{{ store.schedule.semester.name }}</text><text class="muted">共 {{ store.schedule.semester.weeks }} 周</text></view>
      <view class="week-grid" role="group" aria-label="教学周">
        <button v-for="week in store.schedule.semester.weeks" :key="week" class="week-option number"
          :class="{ selected: week === store.week, 'week-current': week === store.currentWeek }" :aria-pressed="week === store.week"
          :aria-label="`第 ${week} 周${week === store.currentWeek ? '，本周' : ''}`" @click="selectWeek(week)">
          <text>{{ String(week).padStart(2,'0') }}</text>
          <text v-if="week === store.currentWeek" class="week-option-label">本周</text>
        </button>
      </view>
      <view v-if="store.isDemo" class="sheet-note">示例学期从 {{ store.schedule.semester.monday }} 开始，正式导入时请核对起始日期。</view>
    </BottomSheet>

    <BottomSheet :open="panel === 'conflicts'" title="这个时段有课程冲突" :reduced-motion="store.reducedMotion" @close="closePanel"><text class="section-description">所有课程都保留了，点击查看各自的上课安排。</text><button v-for="tile in conflictTiles" :key="tile.id" class="conflict-item" @click="showDetail(tile)"><view class="conflict-item-mark" :class="tile.course.color"/><view><text>{{ tile.course.name }}</text><text class="muted">{{ tile.start }}–{{ tile.end }} 节 · {{ tile.meeting.location }}</text></view><AppIcon name="right" :size="18"/></button></BottomSheet>

    <BottomSheet :open="panel === 'grid-add'" :title="choosingCourse ? '选择补课课程' : '添加安排'" :motion-duration="150" :reduced-motion="store.reducedMotion"
      @close="closePanel" @closed="pendingSlot = undefined">
      <view v-if="pendingSlot" class="grid-slot-summary">第 {{ pendingSlot.week }} 周 · {{ courseDays[pendingSlot.day - 1] }} · 第 {{ compactNumbers(gridSections(pendingSlot)) }} 节</view>
      <template v-if="choosingCourse">
        <button v-for="course in makeupCourses" :key="course.id" class="grid-kind-choice" @click="beginGridEdit(pendingSlot, 'makeup', course.id)">
          <text>{{ course.name }}</text><text class="muted">{{ course.code || course.teacher }}</text>
        </button>
        <button class="grid-kind-choice" @click="choosingCourse = false">返回类型选择</button>
      </template>
      <template v-else>
        <button v-for="(label, kind) in meetingKindLabels" :key="kind" class="grid-kind-choice"
          :disabled="kind === 'makeup' && !makeupCourses.length" @click="kind === 'makeup' ? choosingCourse = true : beginGridEdit(pendingSlot, kind)">
          <text>{{ label }}</text><AppIcon name="right" :size="16" />
        </button>
      </template>
    </BottomSheet>
    <CourseEditor v-if="panel === 'edit' && editTarget" ref="courseEditor" :grid-edit="gridEdit" :schedule="store.schedule" :target="editTarget" :scope="editScope"
      :demo="store.isDemo" :reduced-motion="store.reducedMotion" :commit="store.applyCourseEdit" @close="closeEditor" @saved="onCourseSaved" />
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBackPress, onHide, onReady, onShow } from '@dcloudio/uni-app'
import LaunchScreen from '../../components/LaunchScreen.vue'
import { claimLaunchScreen, closeNativeLaunchScreen } from '../../services/launch-screen'
import AppIcon from '../../components/AppIcon.vue'
import BottomSheet from '../../components/BottomSheet.vue'
import AppUpdateSheet from '../../components/AppUpdateSheet.vue'
import { checkUpdate, dismissUpdate, installedVersion, mayRemind, updateForeground, type AppRelease } from '../../services/app-update'
import CourseDetail from '../../components/CourseDetail.vue'
import CourseEditor from '../../components/CourseEditor.vue'
import CalendarNativeSwipeView from '../../components/CalendarNativeSwipeView.vue'
import CalendarDayHeading from '../../components/CalendarDayHeading.vue'
import LiquidGlassNavigation from '../../components/LiquidGlassNavigation.vue'
import SettingsDashboard from '../../components/SettingsDashboard.vue'
import TodayDashboard from '../../components/TodayDashboard.vue'
import GlassTestDashboard from '../../components/GlassTestDashboard.vue'
import ImportDashboard from '../../components/ImportDashboard.vue'
import { createSettingsRoute, IMPORT_ROUTE_EXIT_DURATION, type SlidePhase } from '../../components/settings-route'
import SettingsSlide from '../../components/SettingsSlide.vue'
import { SHOW_DEVELOPER_TOOLS } from '../../components/navigation-items'
import type { WeekPanel } from '../../domain/calendar-view'
import { useScheduleStore } from '../../stores/schedule'
import { compactNumbers, meetingKindLabels, type MeetingKind, chinaDate, dateAt, hasTileConflict, layoutTiles, teachingWeek, tilesForWeek, type Schedule, type Tile } from '../../domain/schedule'
import type { DatedTile } from '../../domain/today'
import { gridSections, prepareGridEdit, type GridEdit, type GridSlot } from '../../domain/grid-edit'
import { courseDays, deleteCourseSchedule, type CourseDeleteScope, type CourseEditScope } from '../../domain/course-edit'
import { validWidgetDate } from '../../domain/widget'
import { pendingWidgetAction, refreshWidgetActions, takeWidgetAction } from '../../services/widget-sync'
const store = useScheduleStore()
let enableLaunchScreen = false
// #ifdef APP-PLUS
enableLaunchScreen = claimLaunchScreen()
// #endif
// #ifdef H5
// An explicit local preview; ordinary web users never get a blocking intro.
enableLaunchScreen = import.meta.env.DEV && new URLSearchParams(window.location.search).get('launchPreview') === '1'
// #endif
const launchVisible = ref(enableLaunchScreen)
const launchReady = ref(false)
onReady(() => { launchReady.value = true; if (!launchVisible.value) closeNativeLaunchScreen() })
onHide(() => { if (launchVisible.value) { launchVisible.value = false; closeNativeLaunchScreen() } })
const pageInstance = getCurrentInstance()
const panel = ref('')
const canvasCovered = computed(() => panel.value === 'edit' || panel.value === 'update')
const activeTab = ref<0 | 1 | 2 | 3>(0)
const settingsPhase = ref<SlidePhase>('idle')
const settingsDashboard = ref<InstanceType<typeof SettingsDashboard> | null>(null)
const importDashboard = ref<{ handleBackPress: () => boolean } | null>(null)
const importRoute = createSettingsRoute(() => store.reducedMotion, IMPORT_ROUTE_EXIT_DURATION)
const { section: importSection, phase: importPhase, epoch: importEpoch } = importRoute
const navigationBlocked = computed(() => (importSection.value !== 'home' && importPhase.value !== 'leaving')
  || (activeTab.value === 2 && (settingsPhase.value === 'entering' || settingsPhase.value === 'open')))
const calendarView = ref<'grid' | 'list'>('grid')
const selected = ref<Tile | null>(null)
const selectedWeek = ref(store.week)
const pendingSlot = ref<GridSlot>()
const choosingCourse = ref(false)
const gridEdit = ref<GridEdit>()
const gridAddDismissal = ref(0)
// The sheet retains its slot until its real exit ends. Keep the highlight
// behind the fading scrim for that same lifetime, including a quick reopen.
const gridAddActive = computed(() => !!pendingSlot.value
  || (panel.value === 'edit' && !!gridEdit.value && gridEdit.value.mode !== 'move'))
watch(gridAddActive, active => { if (!active) gridAddDismissal.value += 1 }, { flush: 'sync' })
const makeupCourses = computed(() => {
  const ids = new Set<string>()
  for (const meeting of store.schedule.meetings) {
    if (meeting.kind !== 'activity' && meeting.kind !== 'meeting') ids.add(meeting.courseId)
  }
  return store.schedule.courses.filter(course => ids.has(course.id))
})
const editTarget = computed(() => gridEdit.value?.target ?? (selected.value && { courseId: selected.value.course.id, meetingId: selected.value.meeting.id, week: selectedWeek.value }))
const editScope = ref<CourseEditScope>('course')
const courseEditor = ref<{ requestClose: () => void } | null>(null)
const courseDeleteError = ref('')
const conflictTiles = ref<Tile[]>([])
// Release always uses V2; legacy swipe-version storage is intentionally ignored.
const pagerEpoch = ref(0)
const focusedDayISO = ref('')
const dashboardDateOverride = ref('')
const now = ref(new Date())
const homeVisible = ref(true)
const presentedRelease = ref<AppRelease | null>(null)
const updateIdle = computed(() => launchReady.value && !launchVisible.value && homeVisible.value && !panel.value &&
  !pendingSlot.value && !pendingWidgetAction.value && importSection.value === 'home' && settingsPhase.value === 'idle')
let checkedForeground = 0
let pendingReminder: { foreground: number; release: AppRelease } | undefined
function showUpdate(release: AppRelease) {
  if (!homeVisible.value || panel.value || importSection.value !== 'home' || !updateForeground.value) return
  presentedRelease.value = release
  panel.value = 'update'
}
function closeUpdate(ignore: boolean) {
  if (panel.value !== 'update' || !presentedRelease.value) return
  dismissUpdate(presentedRelease.value, ignore)
  closePanel()
}
// Each foreground can start one check. If the user opens an editor or import
// while the request is running, deliver its result the next time the home UI is idle.
watch([updateForeground, updateIdle], async ([foreground]) => {
  if (!foreground) return
  if (checkedForeground !== foreground) {
    checkedForeground = foreground
    pendingReminder = undefined
    const result = await checkUpdate(false)
    if (updateForeground.value !== foreground || result.kind !== 'available') return
    pendingReminder = { foreground, release: result.release }
  }
  if (!updateIdle.value || pendingReminder?.foreground !== foreground) return
  const { release } = pendingReminder
  pendingReminder = undefined
  if (mayRemind(release)) showUpdate(release)
}, { immediate: true, flush: 'post' })
let clockTimer: ReturnType<typeof setInterval> | undefined
function stopClock(): void { if (clockTimer !== undefined) { clearInterval(clockTimer); clockTimer = undefined } }
onShow(() => { stopClock(); now.value = new Date(); homeVisible.value = true; refreshWidgetActions(); void store.reconcileWidgets(); clockTimer = setInterval(() => { now.value = new Date() }, 30_000) })
onHide(() => { homeVisible.value = false; stopClock() })
const todayISO = computed(() => chinaDate(now.value))
const dashboardDateISO = computed(() => dashboardDateOverride.value || todayISO.value)
const displayWeek = computed(() => store.week)
function daysForWeek(week: number) { return Array.from({length:7},(_,i) => { const iso = chinaDate(dateAt(store.schedule.semester.monday,week,i+1)); return {day:i+1,label:['一','二','三','四','五','六','日'][i],date:Number(iso.slice(8)),iso} }) }
const days = computed(() => daysForWeek(displayWeek.value))
const weekRange = computed(() => `${Number(days.value[0].iso.slice(5,7))}.${String(days.value[0].date).padStart(2,'0')} — ${Number(days.value[6].iso.slice(5,7))}.${String(days.value[6].date).padStart(2,'0')}`)
const boundedCurrent = computed(() => Math.min(store.schedule.semester.weeks,Math.max(1,store.currentWeek)))
type TileGroup = ReturnType<typeof layoutTiles>[number]
const weekPanelCache = new WeakMap<Schedule, Map<number, WeekPanel>>()
function getWeekPanel(week: number): WeekPanel {
  const schedule = store.schedule
  let cache = weekPanelCache.get(schedule)
  if (!cache) {
    cache = new Map<number, WeekPanel>()
    weekPanelCache.set(schedule, cache)
  }
  const cached = cache.get(week)
  if (cached) return cached
  const panelTiles = tilesForWeek(schedule, week)
  const panelDays = daysForWeek(week)
  const groups = layoutTiles(panelTiles)
  const groupsByDay = Array.from({ length: 7 }, () => [] as TileGroup[])
  for (const group of groups) groupsByDay[group.day - 1].push(group)
  const panel: WeekPanel = {
    week,
    month: Number(panelDays[0].iso.slice(5,7)),
    days: panelDays,
    tiles: panelTiles,
    groupsByDay
  }
  cache.set(week, panel)
  return panel
}
const nativePanels = computed(() => {
  // Keep five neighboring contents warm; the remaining swiper slots are empty.
  return Array.from({ length: store.schedule.semester.weeks }, (_, index) =>
    Math.abs(index + 1 - store.week) <= 2 ? getWeekPanel(index + 1) : null)
})
function groupConflict(group: ReturnType<typeof layoutTiles>[number]): boolean { return hasTileConflict(group.tiles) }
// V2's view controller suppresses post-swipe clicks before they reach these handlers.
function showDetail(tile:Tile, week = store.week) { courseDeleteError.value='';selected.value=tile;selectedWeek.value=week;panel.value='detail' }
function showTodayDetail(tile: DatedTile) {
  const week = teachingWeek(store.schedule.semester.monday, new Date(`${tile.actualDate}T12:00:00+08:00`))
  showDetail(tile, week)
}
function openGroup(group:ReturnType<typeof layoutTiles>[number]) { if(!groupConflict(group)) showDetail(group.tiles[0]); else { conflictTiles.value=group.tiles;panel.value='conflicts' } }
function closePanel() { panel.value = ''; gridEdit.value = undefined }
function closeEditor() { if (gridEdit.value) closePanel(); else panel.value = 'detail' }
function openGridSlot(slot: GridSlot) {
  if (panel.value || activeTab.value !== 0 || slot.week !== store.week) {
    if (!slot.tileId) gridAddDismissal.value += 1
    return
  }
  if (slot.tileId) { beginGridEdit(slot); return }
  pendingSlot.value = slot
  choosingCourse.value = false
  panel.value = 'grid-add'
}
function beginGridEdit(slot: GridSlot | undefined, kind?: MeetingKind, courseId?: string) {
  if (!slot) return
  try {
    gridEdit.value = prepareGridEdit(store.schedule, slot, kind, courseId)
    editScope.value = 'week'
    panel.value = 'edit'
  } catch (cause) {
    uni.showToast({ title: cause instanceof Error ? cause.message : '请选择有效时段', icon: 'none' })
  }
}
function openWeekPicker(): void { panel.value = 'weeks' }
function goCurrentWeek(): void { store.goCurrent() }
function stepWeek(direction: number): void { store.setWeek(store.week + direction) }
function selectWeek(week:number) { store.setWeek(week);panel.value='' }
function openDay(day: { iso: string }): void { focusedDayISO.value = day.iso; dashboardDateOverride.value = day.iso === todayISO.value ? '' : day.iso; activeTab.value = 1; panel.value = '' }
function openToday(): void { focusedDayISO.value = todayISO.value; dashboardDateOverride.value = ''; activeTab.value = 1; panel.value = '' }
function openSettings(): void { panel.value = ''; activeTab.value = 2 }
function toggleCalendarView(): void { calendarView.value = calendarView.value === 'grid' ? 'list' : 'grid' }
function openImport(): void {
  if (importSection.value !== 'home' && importPhase.value !== 'leaving') return
  panel.value = ''
  importRoute.open('preview')
}
function closeImport(): void { importRoute.back() }
function onImportKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || importSection.value === 'home') return
  event.preventDefault(); event.stopPropagation()
  if (!importDashboard.value?.handleBackPress()) closeImport()
}
function selectNavigation(index: number) {
  if (panel.value === 'edit') return
  if (navigationBlocked.value) return
  if (importPhase.value === 'leaving') importRoute.transitionEnd()
  if (activeTab.value === 2 && settingsPhase.value === 'leaving') settingsDashboard.value?.finishReturn()
  if (index === 0) { activeTab.value = 0; closePanel() }
  else if (index === 1) openToday()
  else if (index === 2) openSettings()
  else if (index === 3 && SHOW_DEVELOPER_TOOLS) { activeTab.value = 3; closePanel() }
}
function handleEmptyAction(): void { if (store.schedule.meetings.length === 0) openImport(); else store.goCurrent() }
function showDemoSchedule(): void { store.resetScenario('normal') }
// Editing replaces the data snapshot, while the swipe controller keeps its
// current week and scroll position. A new term or demo resets the track.
watch(() => store.schedule.semester, () => { pagerEpoch.value += 1 })
function editSelected(scope: CourseEditScope) {
  if (!editTarget.value) return
  editScope.value = scope
  panel.value = 'edit'
}
function onCourseSaved() {
  closePanel()
  uni.showToast({ title: store.isDemo ? '示例修改已应用' : '课程已保存', icon: 'none' })
}
function deleteSelected(scope: CourseDeleteScope) {
  if (!editTarget.value || panel.value !== 'detail') return
  courseDeleteError.value = ''
  try {
    const next = deleteCourseSchedule(store.schedule, editTarget.value, scope)
    if (!store.applyCourseEdit(next)) throw new Error('无法保存删除结果，请检查本地存储后重试。')
    closePanel()
    uni.showToast({ title: '已删除所选安排', icon: 'none' })
  } catch (cause) {
    courseDeleteError.value = cause instanceof Error ? cause.message : '删除失败，请重试。'
  }
}
onBackPress(() => {
  if (panel.value === 'update') { closeUpdate(false); return true }
  if (importSection.value !== 'home') { if (!importDashboard.value?.handleBackPress()) closeImport(); return true }
  if (panel.value === 'edit') { courseEditor.value?.requestClose(); return true }
  if (panel.value) { closePanel(); return true }
  if (activeTab.value === 2 && settingsDashboard.value?.goBack()) return true
  if (activeTab.value !== 0) { activeTab.value = 0; focusedDayISO.value = ''; dashboardDateOverride.value = ''; return true }
  return false
})
onUnmounted(importRoute.dispose)
watch(() => store.reducedMotion, reduced => { if (reduced) importRoute.disableMotion() })
const widgetRouteReady = ref(false)
onMounted(() => { widgetRouteReady.value = true; refreshWidgetActions(); void store.reconcileWidgets() })
watch([pendingWidgetAction, importSection, panel, widgetRouteReady, homeVisible], async () => {
  // Keep import and unsaved edit sessions alive; handle the action on return.
  if (!widgetRouteReady.value || !homeVisible.value || importSection.value !== 'home' || canvasCovered.value) return
  const action = takeWidgetAction()
  if (!action) return
  if (action.target === 'settings' || action.target === 'semester') {
    openSettings(); await nextTick()
    settingsDashboard.value?.openExternalSection(action.target === 'settings' ? 'widgets' : 'semester', action.widgetId)
  } else if (action.target === 'import') { activeTab.value = 0; openImport() }
  else if (action.target === 'calendar' || action.target === 'course') {
    // Older native bases may still send a course action. All widget course taps now open the timetable.
    const date = validWidgetDate(action.date) ? action.date : todayISO.value
    const week = teachingWeek(store.schedule.semester.monday, new Date(`${date}T12:00:00+08:00`))
    store.setWeek(Math.max(1, Math.min(store.schedule.semester.weeks, week)))
    focusedDayISO.value = date; dashboardDateOverride.value = ''
    activeTab.value = 0; closePanel()
  } else openDay({ iso: action.date })
}, { flush: 'post' })
</script>

<style scoped lang="scss">
@use '../../styles/status-light';
.app-shell { --calendar-motion-duration:.2s; --status-motion-duration:2.4s; --top-visual-gap:0px; height:100%; height:100dvh; display:flex; justify-content:center; background:#f6f8fc; overflow:hidden; overscroll-behavior:none; }
.app-shell.reduced-motion { --calendar-motion-duration:.01ms; --status-motion-duration:.01ms; }
.phone-canvas { --grid-heading-gap:12px; position:relative; width:100%; max-width:480px; height:100%; display:flex; flex-direction:column; background:#fff; overflow:hidden; }
.timetable-pane { position:absolute; inset:0; display:flex; flex-direction:column; }
.inactive-pane { visibility:hidden; clip-path:inset(50%); pointer-events:none; }
/* The hidden header remains measurable for the shared navigation anchor. */
.inactive-pane :deep(.calendar-native) { content-visibility:hidden; }
.import-route { position:absolute; inset:0; z-index:30; display:flex; min-height:0; flex-direction:column; overflow:hidden; background:#f6f8fc; }
.desktop-caption,.desktop-footer { display:none; }
.top-area { flex-shrink:0; padding:14px 22px 2px; padding-top:calc(var(--status-bar-height, 0px) + var(--top-visual-gap)); background:#f6f8fc; }
.top-area.is-reference-only .status-light,.top-area.is-reference-only .status-light::before,
.reduced-motion .status-light,.reduced-motion .status-light::before { animation:none; }
.navigation-anchor-heading { position:absolute; left:0; right:0; top:0; visibility:hidden; pointer-events:none; }
.brand-row,.brand,.brand-cluster,.header-actions,.week-navigation,.week-controls,.week-arrow-controls { display:flex; align-items:center; }
.brand-row { justify-content:space-between; gap:10px; }
.brand-cluster { min-width:0; flex:1; gap:6px; overflow:hidden; }
.brand { gap:8px; flex-shrink:0; font-size:14px; font-weight:600; letter-spacing:1px; }
.preview-badge { font-size:9px; font-weight:400; letter-spacing:.3px; color:#8295a7; border:1px solid #dfe7ef; border-radius:5px; padding:2px 5px; margin-left:1px; }
.save-status { min-height:22px; display:flex; align-items:center; flex-shrink:0; }
.save-status.alert .status-light { background:#cf625b; }
.status-alert-label { margin-left:5px; color:#b65a54; font-size:9px; font-weight:500; letter-spacing:.2px; white-space:nowrap; }
.semester-inline { min-width:0; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; color:#7c8b9b; font-size:10px; letter-spacing:.2px; }
.header-actions { position:relative; z-index:2; flex-shrink:0; margin-left:6px; gap:0; }
.icon-button { display:flex; align-items:center; justify-content:center; width:44px; height:44px; flex-shrink:0; }
.import-icon { width:44px; height:44px; display:flex; align-items:center; justify-content:center; background:transparent; border-radius:0; }
/* Reserve the extra space above the grid in CalendarDayHeading, including its
   navigation anchor copy. The list can start directly below the compact toolbar. */
.week-navigation { position:relative; z-index:1; top:2px; height:calc(42px - var(--grid-heading-gap)); margin-top:-2px; margin-bottom:-2px; gap:6px; align-items:center; pointer-events:none; }
.week-navigation button { pointer-events:auto; }
.week-select { display:flex; align-items:center; gap:7px; font-size:13px; font-weight:600; color:#527DA8; min-height:44px; white-space:nowrap; }
.week-view-toggle { width:40px; height:40px; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:transparent; border-radius:0; }
.week-range { min-width:0; flex-shrink:1; overflow:hidden; text-overflow:ellipsis; font-size:11px; color:#8a97a8; white-space:nowrap; }
.week-controls { margin-left:auto; flex-shrink:0; gap:2px; }
.week-arrow-controls { gap:0; }
.week-controls .icon-button { width:44px; }
.back-current { min-width:62px; min-height:44px; display:flex; align-items:center; justify-content:center; padding:0 8px; color:#527DA8; background:transparent; border-radius:0; font-size:10px; font-weight:500; white-space:nowrap; }
.blue { background:#e5eef8; color:#426c96; }
.teal { background:#e5f1ec; color:#4f7c6d; }
.purple { background:#eee9f6; color:#7a659b; }
.apricot { background:#faf0df; color:#a1814e; }
.week-sheet-heading { display:flex; justify-content:space-between; align-items:center; font-size:14px; margin-bottom:20px; }
.week-sheet-heading .muted { font-size:11px; }
.week-grid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); border-top:1px solid #e2eaf2; }
.week-option { position:relative; min-height:51px; display:flex; flex-direction:column; gap:2px; align-items:center; justify-content:center; border-bottom:1px solid #e2eaf2; color:#536b85; font-size:16px; }
.week-option-label { font-size:9px; }
.week-option.week-current { color:#315d89; }
.week-option.selected { color:#315d89; font-weight:700; }
.week-option.selected::before { content:''; position:absolute; bottom:4px; width:22px; height:2px; border-radius:1px; background:#426b8e; }
.sheet-note { font-size:11px; color:#60748a; margin-top:16px; line-height:1.8; }
.section-description { display:block; font-size:12px; color:#8898aa; line-height:1.8; margin:10px 0 18px; }
/* Comparison-only styles retained for the archived comparison UI.
.swipe-comparison { padding:20px 0; border-top:1px solid #edf1f5; font-size:13px; }
.swipe-version-options { display:flex; gap:10px; margin-top:14px; }
.swipe-version-options button { flex:1; min-width:0; min-height:58px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; border:1px solid #e7edf4; border-radius:10px; font-size:12px; color:#718096; }
.swipe-version-caption { font-size:10px; opacity:.75; white-space:nowrap; }
.swipe-version-options button.chosen { color:#527DA8; background:#edf3f8; border-color:#b6cbde; }
*/
.conflict-item { display:flex; align-items:center; gap:12px; width:100%; padding:18px 0; border-bottom:1px solid #edf1f5; text-align:left; }
.conflict-item-mark { width:5px; height:38px; border-radius:5px; }
.conflict-item>view:nth-child(2) { flex:1; }
.conflict-item text { display:block; line-height:1.7; font-size:14px; }
.conflict-item text.muted { font-size:11px; margin-top:5px; }
@media (max-width:374px) { .top-area { padding-left:16px; padding-right:16px; }.week-navigation { gap:3px; }.week-select { gap:4px; font-size:12px; }.week-view-toggle { width:38px; height:40px; }.week-range { font-size:9px; }.week-controls .icon-button { width:32px; }.back-current { min-width:44px; padding:0 4px; font-size:9px; }}
@media (min-width:600px) { .app-shell { padding:40px 0; background:radial-gradient(ellipse at 25% 20%,#edf3f9,transparent 65%),#edf1f5; position:relative; }.phone-canvas { width:390px; max-height:860px; border-radius:30px; border:1px solid #dae3ec; box-shadow:0 24px 80px #405e7712; }.top-area { padding-top:calc(var(--status-bar-height, 0px) + var(--top-visual-gap)); }.desktop-caption { position:absolute; left:calc(50% - 390px); top:94px; display:flex; flex-direction:column; gap:14px; font-size:19px; font-weight:600; letter-spacing:1px; }.desktop-subtitle { font-size:11px; font-weight:400; color:#8b9dae; margin-top:2px; letter-spacing:.5px; }.desktop-footer { display:flex; flex-direction:column; gap:7px; position:absolute; left:calc(50% + 233px); bottom:76px; color:#93a5b7; font-size:9px; letter-spacing:1px; } }
@media (min-width:600px) and (max-width:900px) { .desktop-caption,.desktop-footer { display:none; } }
.grid-slot-summary { padding:0 2px 12px; color:#5d7288; font-size:13px; }
.grid-kind-choice { display:flex; align-items:center; justify-content:space-between; gap:14px; width:100%; min-height:47px; padding:8px 4px; text-align:left; border-bottom:1px solid #e4ebf1; font-size:15px; }
.grid-kind-choice .muted { font-size:12px; }
</style>
