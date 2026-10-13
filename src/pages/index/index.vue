<template>
  <view class="app-shell" :class="{ 'reduced-motion': store.reducedMotion }" @keydown="onImportKeydown">
    <LaunchScreen v-if="launchVisible" :ready="launchReady" :reduced-motion="store.reducedMotion" @finished="launchVisible = false" />
    <view class="desktop-caption"><AppIcon name="lake" :size="28" color="#527DA8" /><text>湖畔课表</text><text class="desktop-subtitle">让时间，清晰一点。</text></view>
    <view class="phone-canvas">
      <view class="top-area" :class="{ 'is-reference-only': activeTab !== 0 }" :inert="activeTab !== 0 || (importSection !== 'home' && importPhase !== 'leaving') ? true : undefined" :aria-hidden="activeTab !== 0 || (importSection !== 'home' && importPhase !== 'leaving') ? 'true' : undefined">
        <view class="brand-row">
          <view class="brand-cluster">
            <view class="brand"><AppIcon name="lake" :size="23" color="#527DA8" /><text>湖畔课表</text><text v-if="store.isDemo" class="preview-badge">设计预览</text><view v-else class="save-status" :class="store.saveStatus.tone" :aria-label="store.saveStatus.description"><view class="status-light"/><text v-if="store.saveStatus.tone === 'alert'" class="status-alert-label">{{ store.saveStatus.label }}</text></view></view>
            <text class="semester-inline">{{ store.schedule.semester.name }}</text>
          </view>
          <view class="header-actions"><button class="import-icon" aria-label="从教务导入" @click="openImport('plus')"><AppIcon name="plus" :size="22" color="#527DA8" /></button></view>
        </view>
        <view class="week-navigation">
          <button class="week-select" aria-label="选择教学周" @click="openWeekPicker"><text>第 {{ String(displayWeek).padStart(2, '0') }} 周</text><AppIcon name="down" :size="14" color="#527DA8" /></button>
          <button class="week-view-toggle" :aria-label="calendarView === 'grid' ? '切换到排列视图' : '切换到原始周视图'" :aria-pressed="calendarView === 'list'" @click="toggleCalendarView"><AppIcon :name="calendarView === 'grid' ? 'layout-columns' : 'layout-rows'" :size="19" color="#527DA8" /></button>
          <text class="week-range number">{{ weekRange }}</text>
          <view class="week-controls"><button v-if="displayWeek !== boundedCurrent" class="back-current" @click="goCurrentWeek">回到本周</button><view class="week-arrow-controls"><button class="icon-button" aria-label="上一周" :disabled="displayWeek === 1" @click="stepWeek(-1)"><AppIcon name="left" :size="18" /></button><button class="icon-button" aria-label="下一周" :disabled="displayWeek === store.schedule.semester.weeks" @click="stepWeek(1)"><AppIcon name="right" :size="18" /></button></view></view>
        </view>
      </view>

      <TodayDashboard v-if="activeTab === 1" :inert="importSection !== 'home' && importPhase !== 'leaving' ? true : undefined" :date-iso="dashboardDateISO" :now="now" @course="showTodayDetail" />
      <SettingsDashboard v-if="activeTab === 2" ref="settingsDashboard" :inert="importSection !== 'home' && importPhase !== 'leaving' ? true : undefined" :visible="homeVisible" @import="openImport" @detail-change="onSettingsDetailChange" />
      <GlassTestDashboard v-if="SHOW_DEVELOPER_TOOLS && activeTab === 3" :inert="importSection !== 'home' && importPhase !== 'leaving' ? true : undefined" />
      <!-- Release: V2 only. Comparison versions are preserved in the release backup. -->
      <CalendarNativeSwipeView v-show="activeTab === 0" :key="pagerEpoch" :week="store.week" :panels="nativePanels" :view-mode="calendarView"
        :reduced-motion="store.reducedMotion" :today-iso="todayISO" :focused-day-iso="focusedDayISO"
        @week="store.setWeek($event)" @day="openDay" @group="openGroup"
        @empty="handleEmptyAction" @demo="showDemoSchedule" />
      <!-- Same heading layout as the grid, measurable even in list/other tabs.
           Not a second visible timetable; excluded from focus/accessibility. -->
      <view class="navigation-anchor-heading" aria-hidden="true" inert>
        <CalendarDayHeading :month="Number(days[0].iso.slice(5,7))" :days="days" :today-iso="todayISO" :focused-day-iso="focusedDayISO" />
      </view>
      <LiquidGlassNavigation :week="store.week" :active-index="activeTab" :inert="(importSection !== 'home' && importPhase !== 'leaving') || (activeTab === 2 && settingsDetailOpen && !settingsDetailLeaving) ? true : undefined"
        :visible="activeTab !== 2 || !settingsDetailOpen || settingsDetailLeaving" :reduced-motion="store.reducedMotion" @select="selectNavigation" />
      <view v-if="importSection !== 'home'" :key="importEpoch" class="import-route" :data-route-phase="importPhase" :data-motion="importMotion" :inert="importPhase === 'leaving' ? true : undefined"
        :class="{ 'slide-detail': importMotion === 'slide', 'card-morph': importMotion === 'card', 'page-zoom': importMotion === 'page', 'shape-page': importMotion === 'shape', 'detail-shown': importShown, 'route-moving': importPhase === 'entering' || importPhase === 'leaving', 'route-leaving': importPhase === 'leaving' }"
        :style="{ ...(importOriginStyle || {}), '--settings-route-duration': SETTINGS_ROUTE_DURATION + 'ms', '--settings-route-exit-duration': SETTINGS_ROUTE_EXIT_DURATION + 'ms' }" @transitionend="onImportTransitionEnd">
        <view class="import-morph-surface" aria-hidden="true" />
        <view v-if="importMotion === 'shape'" class="import-origin-plus" aria-hidden="true"><AppIcon name="plus" :size="22" color="#527DA8" /></view>
        <view class="import-detail-content"><ImportDashboard ref="importDashboard" embedded :host-instance="pageInstance" @close="closeImport" /></view>
      </view>
    </view>
    <view class="desktop-footer"><text>UCAS · LAKESIDE</text><text>关键页面视觉验收版 0.1</text></view>

    <BottomSheet :open="panel === 'detail'" title="课程详情" :reduced-motion="store.reducedMotion" @close="closePanel">
      <view v-if="selected" class="detail">
        <view class="course-label" :class="selected.course.color"><view class="color-dot"/>{{ selected.meeting.weeks.includes(selectedWeek) ? '本周有课' : '本周无课' }}<text class="detail-label-divider">·</text>{{ store.schedule.semester.name }}</view>
        <text class="detail-title">{{ selected.course.name }}</text><text class="detail-subtitle">{{ store.isDemo ? '示例课程' : '教务导入' }} · {{ store.schedule.semester.campus }}</text>
        <view class="detail-info"><view v-if="selected.course.isDegreeCourse !== undefined" class="info-row"><AppIcon name="check"/><text class="info-key">课程类型</text><text class="info-value">{{ selected.course.isDegreeCourse ? '学位课' : '非学位课' }}</text></view><view class="info-row"><AppIcon name="person"/><text class="info-key">任课教师</text><text class="info-value">{{ selected.course.teacher || '教师待确认' }}</text></view><view v-if="selected.course.exam" class="info-row"><AppIcon name="book"/><text class="info-key">考试方式</text><text class="info-value">{{ selected.course.exam }}</text></view><view class="info-row"><AppIcon name="pin"/><text class="info-key">上课地点</text><text class="info-value">{{ selected.meeting.location }}</text></view></view>
        <view class="detail-section-header"><text>上课安排</text><text>{{ selectedMeetings.length }} 个时段</text></view>
        <view v-for="meeting in selectedMeetings" :key="meeting.id" class="meeting-card"><view class="meeting-top"><text>{{ dayNames[meeting.day-1] }}</text><text class="number">{{ timeOf(meeting.sections[0]) }} – {{ endTime(meeting.sections[meeting.sections.length-1]) }}</text></view><text class="meeting-meta">第 {{ compactNumbers(meeting.sections) }} 节 · {{ meeting.location }}</text><text class="meeting-weeks">第 {{ compactNumbers(meeting.weeks) }} 周</text></view>
        <view class="detail-actions"><button class="secondary-button" @click="panel = 'weeks'">查看教学周</button><button class="primary-button" @click="editSelected"><AppIcon name="edit" :size="17" color="white"/>编辑课程</button></view>
      </view>
    </BottomSheet>

    <BottomSheet :open="panel === 'weeks'" title="选择教学周" :reduced-motion="store.reducedMotion" @close="closePanel"><view class="week-sheet-heading"><text>{{ store.schedule.semester.name }}</text><text class="muted">共 {{ store.schedule.semester.weeks }} 周</text></view><view class="week-grid"><button v-for="week in store.schedule.semester.weeks" :key="week" class="week-option number" :class="{ selected: week === store.week }" @click="selectWeek(week)"><text>{{ String(week).padStart(2,'0') }}</text><text class="week-option-label">{{ week === store.currentWeek ? '本周' : '周' }}</text></button></view><view class="sheet-note">示例学期起始日为 9 月 7 日；正式导入时需要确认。</view></BottomSheet>

    <BottomSheet :open="panel === 'conflicts'" title="这个时段有课程冲突" :reduced-motion="store.reducedMotion" @close="closePanel"><text class="section-description">所有课程都保留了，点击查看各自的上课安排。</text><button v-for="tile in conflictTiles" :key="tile.id" class="conflict-item" @click="showDetail(tile)"><view class="conflict-item-mark" :class="tile.course.color"/><view><text>{{ tile.course.name }}</text><text class="muted">{{ tile.start }}–{{ tile.end }} 节 · {{ tile.meeting.location }}</text></view><AppIcon name="right" :size="18"/></button></BottomSheet>

    <BottomSheet :open="panel === 'edit'" :title="store.isDemo ? '编辑示例课程' : '编辑课程'" :reduced-motion="store.reducedMotion" @close="panel = 'detail'"><view class="edit-form"><text class="field-label">课程名称</text><input v-model="draft.name" maxlength="80" aria-label="课程名称" class="field-input"/><text class="field-label">任课教师</text><input v-model="draft.teacher" maxlength="80" aria-label="任课教师" class="field-input"/><text v-if="draft.exam !== undefined" class="field-label">考试方式</text><input v-if="draft.exam !== undefined" v-model="draft.exam" maxlength="80" aria-label="考试方式" class="field-input"/><text class="field-label">当前时段地点</text><input v-model="draft.location" maxlength="80" aria-label="当前时段地点" class="field-input"/><text class="field-label">课程颜色</text><view class="color-options"><button v-for="color in colors" :key="color" :class="color" :aria-label="colorNames[color]" @click="draft.color = color"><AppIcon v-if="draft.color === color" name="check" :size="21" color="#203047"/></button></view><text class="edit-hint">{{ store.isDemo ? '本次修改仅用于体验预览，刷新后恢复示例数据。' : '修改会保存到此设备，重新打开 App 后仍会保留。' }}</text><text v-if="editError" class="edit-error">{{ editError }}</text><button class="primary-button" @click="saveEdit">保存修改</button></view></BottomSheet>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { onBackPress, onHide, onReady, onShow } from '@dcloudio/uni-app'
import LaunchScreen from '../../components/LaunchScreen.vue'
import { claimLaunchScreen, closeNativeLaunchScreen } from '../../services/launch-screen'
import AppIcon from '../../components/AppIcon.vue'
import BottomSheet from '../../components/BottomSheet.vue'
import CalendarNativeSwipeView from '../../components/CalendarNativeSwipeView.vue'
import CalendarDayHeading from '../../components/CalendarDayHeading.vue'
import LiquidGlassNavigation from '../../components/LiquidGlassNavigation.vue'
import SettingsDashboard from '../../components/SettingsDashboard.vue'
import TodayDashboard from '../../components/TodayDashboard.vue'
import GlassTestDashboard from '../../components/GlassTestDashboard.vue'
import ImportDashboard from '../../components/ImportDashboard.vue'
import { createSettingsRoute, SETTINGS_ROUTE_DURATION, SETTINGS_ROUTE_EXIT_DURATION } from '../../components/settings-route'
import { settingsCardMorphStyle, settingsPageZoomStyle, settingsCardPageStyle, type CardRect } from '../../components/settings-card-morph'
import { SHOW_DEVELOPER_TOOLS } from '../../components/navigation-items'
import type { WeekPanel } from '../../domain/calendar-view'
import { useScheduleStore } from '../../stores/schedule'
import { useAppearanceStore, type SettingsMotion } from '../../stores/appearance'
import { chinaDate, compactNumbers, dateAt, hasTileConflict, layoutTiles, teachingWeek, tilesForWeek, type CourseColor, type Schedule, type Tile } from '../../domain/schedule'
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
const appearance = useAppearanceStore()
const pageInstance = getCurrentInstance()
const panel = ref('')
const activeTab = ref<0 | 1 | 2 | 3>(0)
const settingsDetailOpen = ref(false)
const settingsDetailLeaving = ref(false)
function onSettingsDetailChange(open: boolean, leaving: boolean): void {
  settingsDetailOpen.value = open
  settingsDetailLeaving.value = leaving
}
const settingsDashboard = ref<InstanceType<typeof SettingsDashboard> | null>(null)
const importDashboard = ref<{ handleBackPress: () => boolean } | null>(null)
const importRoute = createSettingsRoute(() => store.reducedMotion, SETTINGS_ROUTE_EXIT_DURATION)
const { section: importSection, phase: importPhase, shown: importShown } = importRoute
const importEpoch = ref(0)
const importMotion = ref<SettingsMotion>('slide')
const importOriginStyle = ref<Record<string, string> | null>(null)
let pendingImportOpen = 0
const calendarView = ref<'grid' | 'list'>('grid')
const selected = ref<Tile | null>(null)
const selectedWeek = ref(store.week)
const conflictTiles = ref<Tile[]>([])
// Release always uses V2; legacy swipe-version storage is intentionally ignored.
const pagerEpoch = ref(0)
const focusedDayISO = ref('')
const dashboardDateOverride = ref('')
const dayNames = ['星期一','星期二','星期三','星期四','星期五','星期六','星期日']
const colors: CourseColor[] = ['blue','teal','purple','apricot']
const colorNames = { blue:'湖蓝', teal:'青绿', purple:'淡紫', apricot:'杏色' }
const now = ref(new Date())
const homeVisible = ref(true)
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
const panelCacheRevision = ref(0)
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
function invalidateWeekPanelCache(): void {
  weekPanelCache.delete(store.schedule)
  panelCacheRevision.value += 1
}
const nativePanels = computed(() => {
  panelCacheRevision.value
  // Keep five neighboring contents warm; the remaining swiper slots are empty.
  return Array.from({ length: store.schedule.semester.weeks }, (_, index) =>
    Math.abs(index + 1 - store.week) <= 2 ? getWeekPanel(index + 1) : null)
})
const selectedMeetings = computed(() => selected.value ? store.schedule.meetings.filter(m=>m.courseId === selected.value!.course.id).sort((a,b)=>a.day-b.day) : [])
function timeOf(section:number) { return store.schedule.periods.find(p=>p.section === section)?.start || '待确认' }
function endTime(section:number) { return store.schedule.periods.find(p=>p.section === section)?.end || '待确认' }
function groupConflict(group: ReturnType<typeof layoutTiles>[number]): boolean { return hasTileConflict(group.tiles) }
// V2's view controller suppresses post-swipe clicks before they reach these handlers.
function showDetail(tile:Tile, week = store.week) { selected.value=tile;selectedWeek.value=week;panel.value='detail' }
function showTodayDetail(tile:Tile) { showDetail(tile, teachingWeek(store.schedule.semester.monday, new Date(`${dashboardDateISO.value}T12:00:00+08:00`))) }
function openGroup(group:ReturnType<typeof layoutTiles>[number]) { if(!groupConflict(group)) showDetail(group.tiles[0]); else { conflictTiles.value=group.tiles;panel.value='conflicts' } }
function closePanel() { panel.value='' }
function openWeekPicker(): void { panel.value = 'weeks' }
function goCurrentWeek(): void { store.goCurrent() }
function stepWeek(direction: number): void { store.setWeek(store.week + direction) }
function selectWeek(week:number) { store.setWeek(week);panel.value='' }
function openDay(day: { iso: string }): void { focusedDayISO.value = day.iso; dashboardDateOverride.value = day.iso === todayISO.value ? '' : day.iso; activeTab.value = 1; panel.value = '' }
function openToday(): void { focusedDayISO.value = todayISO.value; dashboardDateOverride.value = ''; activeTab.value = 1; panel.value = '' }
function openSettings(): void { panel.value = ''; activeTab.value = 2 }
function toggleCalendarView(): void { calendarView.value = calendarView.value === 'grid' ? 'list' : 'grid' }
function readPlusOrigin(motion: Exclude<SettingsMotion, 'slide'>): Promise<Record<string, string> | null> {
  if (motion !== 'page' && typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && !CSS.supports('clip-path', 'inset(1px round 1px)')) return Promise.resolve(null)
  const styleFor = motion === 'card' ? settingsCardMorphStyle : motion === 'shape' ? settingsCardPageStyle : settingsPageZoomStyle
  if (typeof document !== 'undefined') {
    const canvas = document.querySelector('.phone-canvas')
    const plus = document.querySelector('.import-icon')
    if (canvas && plus) {
      const style = styleFor(canvas.getBoundingClientRect(), plus.getBoundingClientRect(), 'import')
      if (style) return Promise.resolve(style)
    }
  }
  return new Promise(resolve => {
    let settled = false
    let timer: ReturnType<typeof setTimeout>
    const finish = (style: Record<string, string> | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(style)
    }
    timer = setTimeout(() => finish(null), 220)
    try {
      const query = uni.createSelectorQuery().in(pageInstance?.proxy)
      query.select('.phone-canvas').boundingClientRect()
      query.select('.import-icon').boundingClientRect()
      query.exec((results: (CardRect | null)[]) => finish(styleFor(results?.[0] || null, results?.[1] || null, 'import')))
    } catch { finish(null) }
  })
}
function showImport(motion: SettingsMotion, style: Record<string, string> | null): void {
  importMotion.value = style ? motion : 'slide'
  importOriginStyle.value = style
  panel.value = ''
  if (importRoute.open('preview')) importEpoch.value += 1
}
function openImport(source: 'plus' | 'other' = 'other'): void {
  // Retired native page transition (kept for reference; do not enable alongside CSS):
  // uni.navigateTo({ url:'/pages/import/index', animationType:'pop-in', animationDuration:220 })
  if (importSection.value !== 'home' && importPhase.value !== 'leaving') return
  const request = ++pendingImportOpen
  const motion = source === 'plus' && !store.reducedMotion ? appearance.settingsMotion : 'slide'
  if (motion === 'slide') { showImport('slide', null); return }
  void readPlusOrigin(motion).then(style => {
    if (request !== pendingImportOpen || activeTab.value !== 0) return
    showImport(motion, style)
  })
}
function closeImport(): void {
  // uni.navigateBack({ animationType:'pop-out', animationDuration:220 })
  pendingImportOpen += 1
  importRoute.back()
}
function onImportKeydown(event: KeyboardEvent): void {
  if (event.key !== 'Escape' || importSection.value === 'home') return
  event.preventDefault(); event.stopPropagation()
  if (!importDashboard.value?.handleBackPress()) closeImport()
}
function onImportTransitionEnd(event: TransitionEvent): void {
  if (event.target !== event.currentTarget || (event.propertyName !== 'transform' && event.propertyName !== 'clip-path' && event.propertyName !== '-webkit-clip-path')) return
  importRoute.transitionEnd()
}
function selectNavigation(index: number) {
  if ((importSection.value !== 'home' && importPhase.value !== 'leaving') || (activeTab.value === 2 && settingsDetailOpen.value && !settingsDetailLeaving.value)) return
  if (importPhase.value === 'leaving') importRoute.transitionEnd()
  if (activeTab.value === 2 && settingsDetailLeaving.value) settingsDashboard.value?.finishReturn()
  if (index === 0) { activeTab.value = 0; closePanel() }
  else if (index === 1) openToday()
  else if (index === 2) openSettings()
  else if (index === 3 && SHOW_DEVELOPER_TOOLS) { activeTab.value = 3; closePanel() }
}
function handleEmptyAction(): void { if (store.scenario === 'empty') openImport(); else store.goCurrent() }
function showDemoSchedule(): void { store.resetScenario('normal') }
watch(() => store.schedule, () => { pagerEpoch.value += 1 })
const draft=ref({name:'',teacher:'',exam:undefined as string | undefined,location:'',color:'blue' as CourseColor})
const editError=ref('')
function editSelected() {if(!selected.value)return;draft.value={name:selected.value.course.name,teacher:selected.value.course.teacher,exam:selected.value.course.exam,location:selected.value.meeting.location,color:selected.value.course.color};editError.value='';panel.value='edit'}
function saveEdit() {if(!selected.value)return;if(!draft.value.name.trim()){editError.value='请填写课程名称';return}invalidateWeekPanelCache();const course=store.schedule.courses.find(c=>c.id===selected.value!.course.id)!;Object.assign(course,{name:draft.value.name.trim(),teacher:draft.value.teacher.trim(),...(draft.value.exam?.trim()?{exam:draft.value.exam.trim()}:{exam:undefined}),color:draft.value.color,edited:true});const meeting=store.schedule.meetings.find(m=>m.id===selected.value!.meeting.id)!;meeting.location=draft.value.location.trim();if(!store.isDemo&&!store.persistCurrent()){editError.value='修改已显示，但未能写入本地存储，请检查设备空间后重试。';return}panel.value='detail'}
onBackPress(()=>{if(importSection.value !== 'home'){if(importDashboard.value?.handleBackPress())return true;closeImport();return true}if(panel.value){closePanel();return true}if(activeTab.value===2&&settingsDashboard.value?.goBack())return true;if(activeTab.value!==0){activeTab.value=0;focusedDayISO.value='';dashboardDateOverride.value='';return true}return false})
onUnmounted(() => { pendingImportOpen += 1; importRoute.dispose() })
watch(() => store.reducedMotion, reduced => { if (reduced) importRoute.disableMotion() })
const widgetRouteReady = ref(false)
onMounted(() => { widgetRouteReady.value = true; refreshWidgetActions(); void store.reconcileWidgets() })
watch([pendingWidgetAction, importSection, panel, widgetRouteReady, homeVisible], async () => {
  // Keep import and unsaved edit sessions alive; handle the action on return.
  if (!widgetRouteReady.value || !homeVisible.value || importSection.value !== 'home' || panel.value === 'edit') return
  const action = takeWidgetAction()
  if (!action) return
  if (action.target === 'settings' || action.target === 'semester') {
    openSettings(); await nextTick()
    await settingsDashboard.value?.openExternalSection(action.target === 'settings' ? 'widgets' : 'semester', action.widgetId)
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

<style scoped src="../../components/settings-route.css"></style>
<style scoped lang="scss">
@use '../../styles/status-light';
.app-shell { --calendar-motion-duration:.2s; --status-motion-duration:2.4s; --top-visual-gap:0px; height:100%; height:100dvh; display:flex; justify-content:center; background:#f6f8fc; overflow:hidden; overscroll-behavior:none; }
.app-shell.reduced-motion { --calendar-motion-duration:.01ms; --status-motion-duration:.01ms; }
.phone-canvas { position:relative; width:100%; max-width:480px; height:100%; display:flex; flex-direction:column; background:#fff; overflow:hidden; }
.import-route { position:absolute; inset:0; z-index:30; display:flex; min-height:0; flex-direction:column; overflow:hidden; background:#f6f8fc; }
.import-detail-content { position:relative; z-index:1; display:flex; min-height:0; flex:1; flex-direction:column; }
.import-morph-surface { display:none; }
/* The plus uses the same four route geometries as Settings, with its own
   44px source instead of a settings card. */
.import-route.card-morph { clip-path:inset(var(--morph-top) var(--morph-right) var(--morph-bottom) var(--morph-left) round var(--morph-radius)); -webkit-clip-path:inset(var(--morph-top) var(--morph-right) var(--morph-bottom) var(--morph-left) round var(--morph-radius)); opacity:0; transition:clip-path var(--settings-route-duration) cubic-bezier(.22,.68,.36,1),opacity 80ms ease; }
.import-route.card-morph.detail-shown { clip-path:inset(0px 0px 0px 0px round 0px); -webkit-clip-path:inset(0px 0px 0px 0px round 0px); opacity:1; }
.import-route.card-morph.route-leaving { transition-duration:var(--settings-route-exit-duration),50ms; transition-delay:0ms,calc(var(--settings-route-exit-duration) - 50ms); pointer-events:none; }
.import-route.card-morph.route-moving { will-change:clip-path; }
.import-route.card-morph .import-morph-surface { position:absolute; inset:0; z-index:2; display:block; background:var(--morph-fill); pointer-events:none; opacity:1; transition:opacity 120ms ease; }
.import-route.card-morph.detail-shown .import-morph-surface { opacity:0; transition-delay:100ms; }
.import-route.card-morph.route-leaving .import-morph-surface { opacity:1; transition-delay:0ms; transition-duration:50ms; }
.import-route.card-morph .import-detail-content { opacity:0; transition:opacity 120ms ease; }
.import-route.card-morph.detail-shown .import-detail-content { opacity:1; transition-delay:100ms; }
.import-route.card-morph.route-leaving .import-detail-content { opacity:0; transition-delay:0ms; transition-duration:45ms; }
.import-route.page-zoom { transform-origin:0 0; transform:translate3d(var(--zoom-x),var(--zoom-y),0) scale(var(--zoom-scale)); border-radius:var(--zoom-radius); transition:transform var(--settings-route-duration) cubic-bezier(.4,0,.2,1),border-radius var(--settings-route-duration) cubic-bezier(.4,0,.2,1); }
.import-route.page-zoom.detail-shown { transform:translate3d(0,0,0) scale(1); border-radius:0; }
.import-route.page-zoom.route-leaving { transition-duration:var(--settings-route-exit-duration); pointer-events:none; }
.import-route.page-zoom.route-moving { will-change:transform; }
.import-route.page-zoom .import-detail-content { filter:blur(5px); transition:filter var(--settings-route-duration) cubic-bezier(.4,0,.2,1); }
.import-route.page-zoom.detail-shown .import-detail-content { filter:blur(0); }
.import-route.page-zoom.route-leaving .import-detail-content { transition-duration:var(--settings-route-exit-duration); }
.import-route.shape-page { clip-path:inset(var(--morph-top) var(--morph-right) var(--morph-bottom) var(--morph-left) round var(--morph-radius)); -webkit-clip-path:inset(var(--morph-top) var(--morph-right) var(--morph-bottom) var(--morph-left) round var(--morph-radius)); transition:clip-path var(--settings-route-duration) cubic-bezier(.4,0,.2,1); }
.import-route.shape-page.detail-shown { clip-path:inset(0px 0px 0px 0px round 0px); -webkit-clip-path:inset(0px 0px 0px 0px round 0px); }
.import-route.shape-page.route-leaving { transition-duration:var(--settings-route-exit-duration); pointer-events:none; }
.import-route.shape-page.route-moving { will-change:clip-path; }
.import-route.shape-page .import-morph-surface { position:absolute; inset:0; z-index:0; display:block; background:var(--morph-fill); pointer-events:none; opacity:1; transition:opacity var(--settings-route-duration) cubic-bezier(.4,0,.2,1); }
.import-route.shape-page.detail-shown .import-morph-surface { opacity:0; }
.import-route.shape-page.route-leaving .import-morph-surface { transition-duration:var(--settings-route-exit-duration); }
.import-origin-plus { position:absolute; z-index:2; top:var(--morph-top); left:var(--morph-left); width:calc(100% - var(--morph-left) - var(--morph-right)); height:calc(100% - var(--morph-top) - var(--morph-bottom)); box-sizing:border-box; display:flex; align-items:center; justify-content:center; border-radius:var(--morph-radius); background:var(--morph-fill); pointer-events:none; transition:top var(--settings-route-duration) cubic-bezier(.4,0,.2,1),left var(--settings-route-duration) cubic-bezier(.4,0,.2,1),width var(--settings-route-duration) cubic-bezier(.4,0,.2,1),height var(--settings-route-duration) cubic-bezier(.4,0,.2,1),border-radius var(--settings-route-duration) cubic-bezier(.4,0,.2,1); }
.import-route.shape-page.detail-shown .import-origin-plus { top:0; left:0; width:100%; height:100%; border-radius:0; opacity:0; }
.import-route.shape-page.route-moving.detail-shown .import-origin-plus { animation:import-source-handoff var(--settings-route-duration) linear both; }
.import-route.shape-page.route-leaving .import-origin-plus { transition-duration:var(--settings-route-exit-duration); animation:import-source-handoff var(--settings-route-exit-duration) linear reverse both; }
@keyframes import-source-handoff { 0% { filter:blur(0); opacity:1; } 42% { filter:blur(7px); opacity:1; } 58%,100% { filter:blur(8px); opacity:0; } }
.import-route.shape-page .import-detail-content { transform-origin:0 0; transform:translate3d(var(--zoom-x),var(--zoom-y),0) scale(var(--zoom-scale)); opacity:0; filter:blur(8px); transition:transform var(--settings-route-duration) cubic-bezier(.4,0,.2,1); }
.import-route.shape-page.detail-shown .import-detail-content { transform:translate3d(0,0,0) scale(1); opacity:1; filter:blur(0); }
.import-route.shape-page.route-moving.detail-shown .import-detail-content { animation:import-page-handoff var(--settings-route-duration) linear both; }
.import-route.shape-page.route-leaving .import-detail-content { transition-duration:var(--settings-route-exit-duration); animation:import-page-handoff var(--settings-route-exit-duration) linear reverse both; }
@keyframes import-page-handoff { 0%,42% { opacity:0; filter:blur(8px); } 58% { opacity:1; filter:blur(8px); } 100% { opacity:1; filter:blur(0); } }
.reduced-motion .import-route.card-morph,.reduced-motion .import-route.page-zoom,.reduced-motion .import-route.shape-page { transition:none !important; }
.reduced-motion .import-route .import-detail-content { animation:none !important; filter:none !important; opacity:1 !important; transition:none !important; }
.reduced-motion .import-route .import-origin-plus { display:none !important; }
@media (prefers-reduced-motion:reduce) {
  .import-route.card-morph,.import-route.page-zoom,.import-route.shape-page { transition-duration:.001ms !important; }
  .import-route.page-zoom .import-detail-content,.import-route.shape-page .import-detail-content { animation:none !important; filter:none !important; opacity:1 !important; transition:none !important; }
  .import-route.shape-page .import-origin-plus { display:none !important; }
  .import-route .import-morph-surface { transition:none !important; }
}
.desktop-caption,.desktop-footer { display:none; }
.top-area { flex-shrink:0; padding:14px 22px 6px; padding-top:calc(var(--status-bar-height, 0px) + var(--top-visual-gap)); background:#f6f8fc; }
.top-area.is-reference-only { position:absolute; left:0; right:0; top:0; visibility:hidden; pointer-events:none; }
.top-area.is-reference-only .status-light { animation:none; }
.navigation-anchor-heading { position:absolute; left:0; right:0; top:0; visibility:hidden; pointer-events:none; }
.brand-row,.brand,.brand-cluster,.header-actions,.week-navigation,.week-controls,.week-arrow-controls { display:flex; align-items:center; }
.brand-row { justify-content:space-between; gap:10px; }
.brand-cluster { min-width:0; flex:1; gap:6px; overflow:hidden; }
.brand { gap:8px; flex-shrink:0; font-size:14px; font-weight:600; letter-spacing:1px; }
.preview-badge { font-size:9px; font-weight:400; letter-spacing:.3px; color:#8295a7; border:1px solid #dfe7ef; border-radius:5px; padding:2px 5px; margin-left:1px; }
.save-status { min-height:22px; display:flex; align-items:center; flex-shrink:0; }
.save-status.alert .status-light { background:#cf625b; box-shadow:0 0 0 0 rgba(207,98,91,.28); animation-name:status-breathe-alert; }
.status-alert-label { margin-left:5px; color:#b65a54; font-size:9px; font-weight:500; letter-spacing:.2px; white-space:nowrap; }
.semester-inline { min-width:0; flex:1; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; color:#7c8b9b; font-size:10px; letter-spacing:.2px; }
.header-actions { flex-shrink:0; margin-left:6px; gap:0; }
.icon-button { display:flex; align-items:center; justify-content:center; width:44px; height:44px; flex-shrink:0; }
.import-icon { width:44px; height:44px; display:flex; align-items:center; justify-content:center; background:transparent; border-radius:0; }
.week-navigation { position:relative; top:2px; height:42px; min-height:42px; margin-top:-2px; margin-bottom:-2px; gap:6px; align-items:center; }
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
.course-label { display:inline-flex; align-items:center; gap:6px; font-size:10px; border-radius:6px; padding:6px 8px; }.color-dot { width:5px; height:5px; background:currentColor; border-radius:50%; }.detail-label-divider { opacity:.4; }
.detail-title { display:block; font-size:26px; line-height:1.5; letter-spacing:.3px; font-weight:650; margin:16px 0 6px; }.detail-subtitle { display:block; color:#8d9bab; font-size:11px; }
.detail-info { padding:15px 0; margin:14px 0 12px; border-top:1px solid #edf1f5; border-bottom:1px solid #edf1f5; }.info-row { display:flex; gap:10px; align-items:center; min-height:38px; }.info-key { font-size:11px; color:#8d9bab; white-space:nowrap; }.info-value { font-size:12px; margin-left:auto; text-align:right; }
.detail-section-header { display:flex; justify-content:space-between; margin:20px 0 12px; font-size:13px; font-weight:600; }.detail-section-header text:last-child { font-size:10px; color:#99a5b3; font-weight:400; }
.meeting-card { padding:14px; border:1px solid #e9eef4; border-radius:13px; margin-bottom:10px; background:#fbfcfe; }.meeting-top { display:flex; justify-content:space-between; font-size:12px; font-weight:600; }.meeting-top text:last-child { color:#527DA8; font-weight:500; }.meeting-meta,.meeting-weeks { display:block; margin-top:8px; font-size:11px; color:#8795a6; line-height:1.6; }.meeting-weeks { color:#527DA8; margin-top:5px; }
.detail-actions { display:flex; gap:10px; margin-top:22px; }.detail-actions button { flex:1; font-size:13px; }.detail-actions .secondary-button { color:#718096; }
.week-sheet-heading { display:flex; justify-content:space-between; align-items:center; font-size:14px; margin-bottom:20px; }.week-sheet-heading .muted { font-size:11px; }
.week-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; }.week-option { background:#f6f8fc; border:1px solid #edf1f6; border-radius:12px; min-height:58px; display:flex; flex-direction:column; gap:2px; align-items:center; justify-content:center; font-size:16px; }.week-option-label { font-size:9px; opacity:.65; }.week-option.selected { background:#527DA8; color:white; border-color:#527DA8; }.sheet-note { font-size:11px; color:#8999aa; margin-top:20px; line-height:1.8; }
.section-description { display:block; font-size:12px; color:#8898aa; line-height:1.8; margin:10px 0 18px; }
/* Comparison-only styles retained for the archived comparison UI.
.swipe-comparison { padding:20px 0; border-top:1px solid #edf1f5; font-size:13px; }
.swipe-version-options { display:flex; gap:10px; margin-top:14px; }
.swipe-version-options button { flex:1; min-width:0; min-height:58px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; border:1px solid #e7edf4; border-radius:10px; font-size:12px; color:#718096; }
.swipe-version-caption { font-size:10px; opacity:.75; white-space:nowrap; }
.swipe-version-options button.chosen { color:#527DA8; background:#edf3f8; border-color:#b6cbde; }
*/
.conflict-item { display:flex; align-items:center; gap:12px; width:100%; padding:18px 0; border-bottom:1px solid #edf1f5; text-align:left; }.conflict-item-mark { width:5px; height:38px; border-radius:5px; }.conflict-item>view:nth-child(2) { flex:1; }.conflict-item text { display:block; line-height:1.7; font-size:14px; }.conflict-item text.muted { font-size:11px; margin-top:5px; }
.field-label { display:block; font-size:11px; color:#8292a4; margin:14px 0 9px; }.field-input { border:1px solid #e3eaf2; border-radius:11px; background:#f8fafc; height:46px; padding:0 13px; font-size:14px; }.color-options { display:flex; gap:14px; margin:12px 0 20px; }.color-options button { width:44px; height:44px; border-radius:14px; display:flex; justify-content:center; align-items:center; }.edit-hint { display:block; font-size:11px; line-height:1.7; color:#91a0b1; margin:0 0 18px; }.edit-error { display:block; font-size:12px; color:#b35f50; margin-bottom:12px; }
@keyframes status-breathe-alert { 0%,100% { transform:scale(.88); opacity:.8; box-shadow:0 0 0 0 rgba(207,98,91,.3); } 50% { transform:scale(1); opacity:1; box-shadow:0 0 0 6px rgba(207,98,91,0); } }
@media (max-width:374px) { .top-area { padding-left:16px; padding-right:16px; }.week-navigation { gap:3px; }.week-select { gap:4px; font-size:12px; }.week-view-toggle { width:38px; height:40px; }.week-range { font-size:9px; }.week-controls .icon-button { width:32px; }.back-current { min-width:44px; padding:0 4px; font-size:9px; }}
@media (min-width:600px) { .app-shell { padding:40px 0; background:radial-gradient(ellipse at 25% 20%,#edf3f9,transparent 65%),#edf1f5; position:relative; }.phone-canvas { width:390px; max-height:860px; border-radius:30px; border:1px solid #dae3ec; box-shadow:0 24px 80px #405e7712; }.top-area { padding-top:calc(var(--status-bar-height, 0px) + var(--top-visual-gap)); }.desktop-caption { position:absolute; left:calc(50% - 390px); top:94px; display:flex; flex-direction:column; gap:14px; font-size:19px; font-weight:600; letter-spacing:1px; }.desktop-subtitle { font-size:11px; font-weight:400; color:#8b9dae; margin-top:2px; letter-spacing:.5px; }.desktop-footer { display:flex; flex-direction:column; gap:7px; position:absolute; left:calc(50% + 233px); bottom:76px; color:#93a5b7; font-size:9px; letter-spacing:1px; } }
@media (min-width:600px) and (max-width:900px) { .desktop-caption,.desktop-footer { display:none; } }
</style>
