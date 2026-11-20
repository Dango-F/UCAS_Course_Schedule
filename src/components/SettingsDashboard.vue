<template>
  <view class="settings-page" :class="{ 'reduced-motion': store.reducedMotion }" :data-settings-section="section"
    :data-route-phase="routePhase" @keydown="handleKeydown">
      <view class="settings-route settings-home" :class="{ 'home-covered': section !== 'home' && routePhase !== 'leaving' }"
        :inert="section !== 'home' && routePhase !== 'leaving' ? true : undefined" :aria-hidden="section !== 'home' && routePhase !== 'leaving' ? 'true' : undefined">
        <NativeScrollArea class="settings-scroll" hide-scrollbar :reset-when-hidden="!active">
        <view class="settings-content">
          <view class="settings-heading">
            <AppIcon name="lake" :size="25" color="#426b8e" />
            <text class="settings-title">设置</text>
          </view>
          <view v-for="group in directoryGroups" :key="group.label" class="directory-group">
            <text class="directory-label">{{ group.label }}</text>
            <view class="directory-links">
              <SettingsEntry v-for="item in group.entries" :id="'settings-entry-' + item" :key="item"
                v-bind="directoryEntries[item]" :data-settings-entry="item" role="button" tabindex="0"
                @touchstart.passive="prepareOnIntent(item)" @mouseenter="prepareOnIntent(item)" @focus="prepareOnIntent(item)"
                @click="openSection(item)" @keydown.enter.prevent="openSection(item)" @keydown.space.prevent="openSection(item)" />
            </view>
          </view>
        </view>
        </NativeScrollArea>
      </view>

      <SettingsSlide v-if="displayedSection !== 'home'" :key="displayedSection" name="settings" :epoch="routeEpoch" :phase="routePhase"
        class="settings-route is-detail" :class="section === 'home' ? 'settings-prepared' : 'settings-detail'" :exit-duration="SETTINGS_ROUTE_EXIT_DURATION" @running="route.viewStarted" @settled="route.transitionEnd">
        <view class="settings-subnav">
          <button role="button" tabindex="0" class="settings-back" :aria-label="backLabel" :title="backLabel" @click="goBack" @keydown.enter.prevent="goBack" @keydown.space.prevent="goBack">
            <AppIcon name="left" :size="21" color="#426b8e" />
          </button>
          <text class="subnav-label">{{ sectionInfo.title }}</text>
        </view>
        <NativeScrollArea class="settings-scroll" hide-scrollbar :reset-when-hidden="section === 'home'">
        <view class="settings-content" :class="{ 'widget-detail-content': section === 'widgets' }">
      <view class="detail-heading" :class="{ 'widget-detail-heading': section === 'widgets' }">
        <view class="detail-title-row">
          <text class="settings-title">{{ sectionInfo.title }}</text>
          <button v-if="section === 'widgets'" class="widget-title-help" aria-label="手动添加桌面小组件" @click="showWidgetManual"><AppIcon name="info" :size="18" color="#52718c" /></button>
          <button v-if="section === 'widgets'" class="widget-title-refresh" aria-label="重新同步课表" :disabled="!widgetSettingsRef || widgetSettingsRef.syncBusy" :aria-busy="widgetSettingsRef?.syncBusy || false" @click="widgetSettingsRef?.resync()"><AppIcon name="refresh" :size="20" color="#527da8" /></button>
        </view>
        <text v-if="section !== 'widgets' && sectionInfo.description" class="settings-intro">{{ sectionInfo.description }}</text>
      </view>

      <WidgetSettings v-if="section === 'widgets'" ref="widgetSettingsRef" :widget-id="widgetId" :visible="visible && routePhase !== 'leaving'" @notice="showWidgetNotice" />

      <view v-if="section === 'display'" class="settings-section">
        <view class="section-heading"><text class="section-title">课程卡片</text></view>
        <view class="settings-card preference-card">
          <button tabindex="0" class="preference-row" role="switch" aria-label="展示任课教师" :aria-checked="store.showTeachers" @click="store.showTeachers = !store.showTeachers" @keydown.enter.prevent="store.showTeachers = !store.showTeachers" @keydown.space.prevent="store.showTeachers = !store.showTeachers">
            <view class="preference-copy"><text>任课教师</text><text class="preference-help">在课表课程中显示教师姓名</text></view><view class="setting-switch" :class="{ on: store.showTeachers }"><view /></view>
          </button>
          <button tabindex="0" class="preference-row" role="switch" aria-label="展示考核方式" :aria-checked="store.showExams" @click="store.showExams = !store.showExams" @keydown.enter.prevent="store.showExams = !store.showExams" @keydown.space.prevent="store.showExams = !store.showExams">
            <view class="preference-copy"><text>考核方式</text><text class="preference-help">显示考试、论文等考核信息</text></view><view class="setting-switch" :class="{ on: store.showExams }"><view /></view>
          </button>
          <button tabindex="0" class="preference-row" role="switch" aria-label="展示上课节次" :aria-checked="store.showSections" @click="store.showSections = !store.showSections" @keydown.enter.prevent="store.showSections = !store.showSections" @keydown.space.prevent="store.showSections = !store.showSections">
            <view class="preference-copy"><text>上课节次</text><text class="preference-help">在课程卡片上显示第几节</text></view><view class="setting-switch" :class="{ on: store.showSections }"><view /></view>
          </button>
        </view>
        <text class="detail-note">完整课程信息可在课程详情查看。</text>
      </view>

      <view v-if="displayedSection === 'appearance'" class="settings-section">
        <view class="section-heading"><text class="section-title">界面体验</text></view>
        <view class="settings-card preference-card">
          <GlassClaritySetting :preview-active="section === 'appearance'" :prepare-preview="preparedParts >= 3" />
          <NavigationMotionSetting v-if="section === 'appearance' || preparedParts >= 2" />
          <NavigationVisibilitySetting v-if="section === 'appearance' || preparedParts >= 4" />
          <button tabindex="0" class="preference-row" role="switch" aria-label="减少动画" :aria-checked="store.reducedMotion" @click="store.reducedMotion = !store.reducedMotion" @keydown.enter.prevent="store.reducedMotion = !store.reducedMotion" @keydown.space.prevent="store.reducedMotion = !store.reducedMotion">
            <view class="preference-copy"><text>减少动画</text><text class="preference-help">采用更安静、直接的切换效果</text></view><view class="setting-switch" :class="{ on: store.reducedMotion }"><view /></view>
          </button>
        </view>
        <text class="detail-note">通透度与切换效果会自动保存。系统开启减少透明度或增强对比度时，优先使用清晰的实色背景。</text>
      </view>

      <view v-if="section === 'semester'" class="settings-section">
        <view class="section-heading semester-heading">
          <text class="section-title">当前学期</text>
          <view v-if="semesterEditing" class="semester-actions">
            <button class="semester-action semester-cancel" role="button" tabindex="0" @click="resetSemester" @keydown.enter.prevent="resetSemester" @keydown.space.prevent="resetSemester">取消</button>
            <button class="semester-action semester-save" role="button" tabindex="0" :disabled="!semesterDirty" @click="saveSemester" @keydown.enter.prevent="saveSemester" @keydown.space.prevent="saveSemester">保存</button>
          </view>
          <button v-else class="semester-action semester-edit" role="button" tabindex="0" aria-label="编辑学期设置" @click="startSemesterEdit" @keydown.enter.prevent="startSemesterEdit" @keydown.space.prevent="startSemesterEdit">
            <AppIcon name="edit" :size="14" color="#426b8e" /><text>编辑</text>
          </button>
        </view>
        <view class="semester-card" :class="{ 'with-import': !semesterEditing }">
          <view class="semester-title-row">
            <view class="semester-mark"><AppIcon name="calendar" :size="20" color="#527DA8" /></view>
            <view class="semester-copy"><text class="semester-name">{{ store.schedule.semester.name }}</text><text class="semester-campus">{{ store.schedule.semester.campus }} · 研究生集中教学</text></view>
            <text class="semester-course-count number">{{ store.schedule.courses.length }} 门{{ store.isDemo ? '示例' : '' }}课程</text>
          </view>
          <view class="semester-fields">
            <button v-if="semesterEditing" class="semester-field semester-date-toggle" role="button" tabindex="0" :aria-expanded="calendarOpen" @click="toggleCalendar" @keydown.enter.prevent="toggleCalendar" @keydown.space.prevent="toggleCalendar">
              <text>第一教学周周一</text>
              <view class="semester-field-value number"><text>{{ semesterMonday }}</text><AppIcon :name="calendarOpen ? 'down' : 'right'" :size="15" color="#527da8" /></view>
            </button>
            <view v-else class="semester-field"><text>第一教学周周一</text><text class="number">{{ store.schedule.semester.monday }}</text></view>
            <SemesterWeekCalendar v-if="semesterEditing && calendarOpen" :monday="semesterMonday" @select="selectSemesterWeek" />
            <view class="semester-field semester-total">
              <text>教学周总数</text>
              <view v-if="semesterEditing" class="semester-field-value">
                <input v-model="semesterWeeks" class="semester-weeks-input number" type="number" maxlength="2"
                  :placeholder="`1–${MAX_TEACHING_WEEKS}`" aria-label="教学周总数" @blur="finishWeekInput" />
                <text>周</text>
              </view>
              <text v-else class="number">{{ store.schedule.semester.weeks }} 周</text>
            </view>
          </view>
          <text v-if="semesterError" class="semester-error" role="alert">{{ semesterError }}</text>
          <text v-if="store.isDemo" class="semester-help">示例学期的修改仅在本次使用期间生效。</text>
          <button v-if="!semesterEditing" role="button" tabindex="0" class="import-button" @click="$emit('import')" @keydown.enter.prevent="$emit('import')" @keydown.space.prevent="$emit('import')">从教务导入<AppIcon name="right" :size="17" color="#426b8e" /></button>
        </view>
      </view>

      <view v-if="section === 'preview'" class="settings-section motion-section">
        <view class="section-heading"><text class="section-title">动效预览</text><text class="section-note">仅供对比预览</text></view>
        <text class="motion-intro">挑一种读取节奏，看看课程载入完成时的反馈。</text>
        <view class="motion-stage with-context">
          <view class="motion-context" aria-hidden="true">
            <text class="context-title">个人课表</text><view class="context-rule" />
            <view v-for="row in 4" :key="row" class="context-row"><view /><view /><view /></view>
          </view>
          <view class="motion-status" role="status" aria-live="polite" :aria-label="complete ? '预览：读取完成' : '预览：正在读取课程信息'">
            <ImportLoadingPreview :key="replayKey" :variant="selected" :complete="complete" :slow="slow" :reduced-motion="quiet" :paused="!visible || routePhase === 'leaving'" />
            <text class="motion-status-title">{{ complete ? '读取完成' : '正在读取课程信息' }}</text>
            <text class="motion-status-note">{{ complete ? '课程已就绪，接下来核对课表' : '正在整理本学期的安排' }}</text>
          </view>
          <view class="motion-meta"><text>{{ quiet ? '减少动态' : slow ? '0.5× 慢放' : '1× 原速' }}</text></view>
        </view>

        <view class="variant-picker" role="group" aria-label="选择加载动画">
          <button role="button" tabindex="0" v-for="item in loadingVariants" :key="item.id" class="variant-option" :class="{ selected: selected === item.id }" :aria-pressed="selected === item.id" @click="selectVariant(item.id)" @keydown.enter.prevent="selectVariant(item.id)" @keydown.space.prevent="selectVariant(item.id)">
            <text class="variant-name">{{ item.name }}</text>
            <AppIcon v-if="selected === item.id" name="check" :size="17" color="#426b8e" />
          </button>
        </view>
        <text class="variant-description">{{ current.description }}</text>
        <view class="motion-actions">
          <button role="button" tabindex="0" class="demo-button" @click="playDemo" @keydown.enter.prevent="playDemo" @keydown.space.prevent="playDemo">{{ demoRunning ? '重新演示' : '完整演示' }}</button>
          <button role="button" tabindex="0" class="finish-button" @click="complete ? restart() : finish()" @keydown.enter.prevent="complete ? restart() : finish()" @keydown.space.prevent="complete ? restart() : finish()">{{ complete ? '重新转圈' : '立即完成' }}</button>
        </view>
        <text class="demo-hint">完整演示会先读取 3 秒，再播放完成反馈。</text>
        <view class="motion-options">
          <view class="motion-option"><text>播放速度</text><view class="speed-picker" role="group" aria-label="播放速度"><button tabindex="0" :class="{ active: !slow }" :aria-pressed="!slow" @click="setSlow(false)" @keydown.enter.prevent="setSlow(false)" @keydown.space.prevent="setSlow(false)">原速</button><button tabindex="0" :class="{ active: slow }" :aria-pressed="slow" @click="setSlow(true)" @keydown.enter.prevent="setSlow(true)" @keydown.space.prevent="setSlow(true)">慢放</button></view></view>
        </view>
        <text class="motion-footnote">动效预览不会读取教务数据，也不会改变实际导入动画。</text>
      </view>

      <view v-if="section === 'preview' && store.isDemo" class="settings-section">
        <view class="section-heading"><text class="section-title">示例场景</text><text class="section-note">用于页面预览</text></view>
        <view class="scenario-grid">
          <button role="button" tabindex="0" v-for="item in scenarios" :key="item.value" class="scenario-option" :class="{ chosen: store.scenario === item.value }" :aria-pressed="store.scenario === item.value" @click="store.resetScenario(item.value)" @keydown.enter.prevent="store.resetScenario(item.value)" @keydown.space.prevent="store.resetScenario(item.value)">
            <text>{{ item.label }}</text><AppIcon v-if="store.scenario === item.value" name="check" :size="17" color="#527DA8" />
          </button>
        </view>
      </view>

      <view v-if="section === 'about'" class="settings-section">
        <view class="about-card"><AppIcon name="lake" :size="42" color="#527da8"/><text class="about-name">湖畔课表</text><text class="about-tagline">让时间，清晰一点。</text><text class="about-maker">制作者 · YukiDango</text><text class="about-version">版本 {{ installedVersion }} · 非国科大官方应用</text></view>
        <view v-if="androidUpdates" class="directory-links update-links">
          <SettingsEntry v-if="availableUpdate" icon="lake" :label="'发现新版本 ' + availableUpdate.versionName"
            description="查看更新内容与下载方式" @click="emit('update', availableUpdate)" />
          <SettingsEntry icon="refresh" :label="checkingUpdate ? '正在检查更新…' : '检查更新'"
            :description="updateMessage || '每天首次联网打开或回到前台时检查'" :aria-busy="checkingUpdate" @click="checkManually" />
        </view>
        <view class="about-data"><AppIcon name="shield" :size="22" color="#587f80"/><view><text>数据留在你的设备</text><text>导入的课表、玻璃通透度和切换效果保存在本地。教师、考核、节次显示和减少动画设置在本次运行中生效。</text></view></view>
        <view class="settings-note"><AppIcon name="info" :size="17" color="#8093a8"/><text>{{ store.isDemo ? '当前使用示例课表，示例课程编辑只在本次预览中生效。请从「学期与导入」导入真实课表。' : '重新导入会先展示读取结果供你确认。请保管好设备上的课表数据。' }}</text></view>
      </view>
        </view>
        </NativeScrollArea>
      </SettingsSlide>
      <WidgetNotice :notice="widgetNotice" :reduced-motion="store.reducedMotion" @close="widgetNotice = null" />
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import SemesterWeekCalendar from './SemesterWeekCalendar.vue'
import SettingsEntry from './SettingsEntry.vue'
import NativeScrollArea from './NativeScrollArea.vue'
import ImportLoadingPreview from './ImportLoadingPreview.vue'
import GlassClaritySetting from './GlassClaritySetting.vue'
import NavigationMotionSetting from './NavigationMotionSetting.vue'
import NavigationVisibilitySetting from './NavigationVisibilitySetting.vue'
import WidgetSettings from './WidgetSettings.vue'
import WidgetNotice from './WidgetNotice.vue'
import { widgetManualInstructions, type WidgetNoticePayload } from '../domain/widget-guide'
import { MAX_TEACHING_WEEKS } from '../domain/schedule'
import { loadingVariants, type LoadingVariant } from './loading-preview'
import { useScheduleStore } from '../stores/schedule'
import { androidUpdates, availableUpdate, checkingUpdate, checkUpdate, installedVersion, type AppRelease } from '../services/app-update'
import type { Scenario } from '../data/demo'
import { createSettingsRoute, SETTINGS_ROUTE_EXIT_DURATION, type SettingsSection, type SlidePhase } from './settings-route'
import SettingsSlide from './SettingsSlide.vue'
import { SHOW_DEVELOPER_TOOLS } from './navigation-items'

const props = defineProps<{ visible: boolean; active: boolean }>()
const emit = defineEmits<{ import: []; 'detail-change': [phase: SlidePhase]; update: [release: AppRelease] }>()

const store = useScheduleStore()
const widgetId = ref<number | undefined>()
const widgetSettingsRef = ref<InstanceType<typeof WidgetSettings> | null>(null)
const widgetNotice = ref<WidgetNoticePayload | null>(null)
function showWidgetNotice(value: WidgetNoticePayload): void { widgetNotice.value = value }
function showWidgetManual(): void {
  let brand = ''
  try { brand = uni.getSystemInfoSync().brand || '' } catch { /* Generic instructions when device information is unavailable. */ }
  showWidgetNotice({ title: '从桌面添加小组件', message: widgetManualInstructions(brand), tone: 'info', presentation: 'guide' })
}
const route = createSettingsRoute(() => store.reducedMotion, SETTINGS_ROUTE_EXIT_DURATION)
const { section, phase: routePhase, epoch: routeEpoch } = route
const updateMessage = ref('')
let manualCheck = 0
watch([section, () => props.visible], () => { manualCheck++; updateMessage.value = '' })
async function checkManually() {
  const request = ++manualCheck
  updateMessage.value = ''
  const result = await checkUpdate(true)
  if (request !== manualCheck || !props.visible || section.value !== 'about' || routePhase.value === 'leaving') return
  if (result.kind === 'available') emit('update', result.release)
  else updateMessage.value = result.kind === 'error' ? result.message : '当前已是最新版本'
}
// Parent hit testing must update before a rapid tap reaches the navigation.
watch(routePhase, phase => emit('detail-change', phase), { immediate: true, flush: 'sync' })
const sections = {
  home: { title:'设置', description:'' },
  display: { title:'课表显示', description:'选择在课程卡片上显示的信息。' },
  appearance: { title:'外观与交互', description:'调整玻璃质感、导航栏和切换动画。' },
  semester: { title:'学期与导入', description:'' },
  widgets: { title:'桌面小组件', description:'不用打开 App，也能看见下一堂课。' },
  preview: { title:'预览实验室', description:'对比加载动画与示例课表。' },
  about: { title:'关于湖畔课表', description:'' }
}
// Prepare one likely destination after the tab's landing animation. The
// directory remains interactive and the parked preview owns no glass renderer.
const appearanceReady = ref(false)
const preparedParts = ref(0)
let prepareTimer: ReturnType<typeof setTimeout> | undefined
let prepareIdle: number | undefined
function cancelPreparation() {
  clearTimeout(prepareTimer)
  if (prepareIdle !== undefined && typeof cancelIdleCallback === 'function') cancelIdleCallback(prepareIdle)
  prepareIdle = undefined
}
watch([() => props.visible, section], ([visible, page]) => {
  cancelPreparation()
  if (!visible || (page !== 'home' && page !== 'appearance')) {
    appearanceReady.value = false
    preparedParts.value = 0
    return
  }
  if (page === 'appearance') { appearanceReady.value = true; preparedParts.value = 4; return }
  if (appearanceReady.value) return
  const prepare = () => {
    if (!props.visible || section.value !== 'home') return
    appearanceReady.value = true
    preparedParts.value++
    // Give the browser a rendering opportunity between groups of new text.
    if (preparedParts.value < 4) prepareTimer = setTimeout(whenIdle, 20)
  }
  function whenIdle() {
    if (typeof requestIdleCallback === 'function') prepareIdle = requestIdleCallback(prepare)
    else prepare()
  }
  prepareTimer = setTimeout(whenIdle, 480)
}, { immediate:true })
const displayedSection = computed(() => section.value === 'home' && appearanceReady.value ? 'appearance' : section.value)
const sectionInfo = computed(() => sections[displayedSection.value])
function prepareOnIntent(item: SettingsSection) {
  if (item !== 'appearance' || preparedParts.value === 4 || !props.visible || section.value !== 'home') return
  cancelPreparation()
  appearanceReady.value = true
  preparedParts.value = 4
}
const semesterEditing = ref(false)
const calendarOpen = ref(false)
const semesterMonday = ref(store.schedule.semester.monday)
const semesterWeeks = ref(String(store.schedule.semester.weeks))
const semesterError = ref('')
const semesterDirty = computed(() => {
  const { monday, weeks, confirmed } = store.schedule.semester
  return semesterMonday.value !== monday || Number(semesterWeeks.value) !== weeks || (!store.isDemo && !confirmed)
})
function resetSemester(): void {
  semesterEditing.value = false
  calendarOpen.value = false
  semesterMonday.value = store.schedule.semester.monday
  semesterWeeks.value = String(store.schedule.semester.weeks)
  semesterError.value = ''
}
function startSemesterEdit(): void {
  resetSemester()
  semesterEditing.value = true
}
function toggleCalendar(): void { calendarOpen.value = !calendarOpen.value }
function selectSemesterWeek(monday: string): void {
  semesterMonday.value = monday
  calendarOpen.value = false
}
function finishWeekInput(event: { detail: unknown }): void {
  // uni-input throttles v-model updates. A quick tap on Save needs the final value.
  const detail = event.detail
  if (detail && typeof detail === 'object' && 'value' in detail && typeof detail.value === 'string') {
    semesterWeeks.value = detail.value
  }
}
watch([routeEpoch, () => store.schedule.semester], resetSemester)
watch([semesterMonday, semesterWeeks], () => { semesterError.value = '' })
function saveSemester(): void {
  if (!semesterEditing.value || !semesterDirty.value) return
  semesterError.value = ''
  try {
    if (!store.updateSemesterTiming(semesterMonday.value, Number(semesterWeeks.value))) {
      semesterError.value = '学期设置保存失败，请重试。'
      return
    }
    resetSemester()
    uni.showToast({ title: store.isDemo ? '已更新示例学期' : '学期设置已保存', icon: 'none' })
  } catch (cause) {
    semesterError.value = cause instanceof Error ? cause.message : '学期设置保存失败，请重试。'
  }
}
const displaySummary = computed(() => [store.showTeachers && '教师', store.showExams && '考核', store.showSections && '节次'].filter(Boolean).join(' · ') || '基本信息')
const directoryEntries = computed(() => ({
  semester: { label: sections.semester.title, description: store.schedule.semester.name, icon: 'calendar', value: store.isDemo ? '示例课表' : undefined },
  display: { label: sections.display.title, description: '教师、考核与节次', icon: 'layout-rows', value: displaySummary.value },
  appearance: { label: sections.appearance.title, description: '玻璃质感与动画', icon: 'settings', value: store.reducedMotion ? '减少动态' : undefined },
  widgets: { label: sections.widgets.title, description: '查看样式并添加小组件', icon: 'grid' },
  preview: { label: sections.preview.title, description: store.isDemo ? '加载动效与示例课表' : '加载动效对比', icon: 'motion' },
  about: { label: sections.about.title, description: '版本、制作者与本地数据', icon: 'lake', value: availableUpdate.value ? '有新版本' : undefined }
}))
const directoryGroups: { label: string; entries: Exclude<SettingsSection, 'home'>[] }[] = [
  { label: '课表', entries: ['semester', 'display'] },
  { label: '使用体验', entries: ['appearance', 'widgets'] },
  { label: '应用', entries: SHOW_DEVELOPER_TOOLS ? ['preview', 'about'] : ['about'] }
]
function openSection(value: Exclude<SettingsSection, 'home'>): void {
  if (value === 'preview' && !SHOW_DEVELOPER_TOOLS) return
  if (route.open(value)) cancelDemo()
}
const backLabel = computed(() => calendarOpen.value ? '收起日历' : semesterEditing.value ? '取消编辑学期' : '返回设置首页')
function goBack(): boolean {
  if (section.value === 'semester' && semesterEditing.value) {
    if (calendarOpen.value) calendarOpen.value = false
    else resetSemester()
    return true
  }
  if (widgetNotice.value) { const guide = widgetNotice.value.presentation === 'guide'; widgetNotice.value = null; if (guide) return true }
  if (section.value === 'home') return false
  cancelDemo()
  return route.back()
}
function finishReturn(): void {
  if (routePhase.value === 'leaving') route.transitionEnd()
}
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && goBack()) { event.preventDefault(); event.stopPropagation() }
}
function openExternalSection(value: 'widgets' | 'semester', id?: number): void {
  widgetId.value = id
  if (section.value !== 'home') { route.back(); route.transitionEnd() }
  openSection(value)
}
defineExpose({ goBack, finishReturn, openExternalSection })
const scenarios: { value: Scenario; label: string }[] = [
  { value: 'normal', label: '日常课表' },
  { value: 'dense', label: '密集课表' },
  { value: 'conflict', label: '课程冲突' },
  { value: 'empty', label: '空课表' },
]
const selected = ref<LoadingVariant>('original')
const current = computed(() => loadingVariants.find(item => item.id === selected.value)!)
const complete = ref(false)
const slow = ref(false)
const quiet = computed(() => store.reducedMotion)
const replayKey = ref(0)
const demoRunning = ref(false)
let demoTimer: ReturnType<typeof setTimeout> | undefined

function cancelDemo(): void {
  if (demoTimer !== undefined) clearTimeout(demoTimer)
  demoTimer = undefined
  demoRunning.value = false
}
function restart(): void { cancelDemo(); complete.value = false; replayKey.value += 1 }
function selectVariant(id: LoadingVariant): void { selected.value = id; restart() }
function setSlow(value: boolean): void { slow.value = value; restart() }
function finish(): void { cancelDemo(); complete.value = true }
function playDemo(): void {
  restart()
  demoRunning.value = true
  demoTimer = setTimeout(finish, 3000)
}

watch(() => props.visible, isVisible => { if (!isVisible) { cancelDemo(); widgetNotice.value = null } })
watch(() => props.active, active => {
  if (active) return
  if (section.value !== 'home') { route.back(); route.transitionEnd() }
  widgetId.value = undefined
  selected.value = 'original'
  slow.value = complete.value = false
  resetSemester()
})
watch(() => store.reducedMotion, reduced => { if (reduced) route.disableMotion() })
onUnmounted(() => {
  cancelPreparation()
  cancelDemo()
  route.dispose()
})
</script>

<style scoped lang="scss">
.settings-page { position:absolute; inset:0; display:flex; flex-direction:column; overflow:hidden; background:#f6f8fc; color:#203047; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif; }
.settings-route { position:absolute; inset:0; z-index:1; display:flex; min-height:0; flex-direction:column; overflow:hidden; background:#f6f8fc; }
.settings-home.home-covered { pointer-events:none; }
/* Share the canvas stacking order: directory 1 < floating nav 20 < detail 25
   < import 30. Keep settings-page at z-index:auto (no enclosing stack). */
.settings-detail,.settings-prepared { z-index:25; contain:layout; }
.settings-prepared { visibility:hidden; pointer-events:none; }
.settings-scroll { flex:1; min-height:0; height:100%; }
/* Like the timetable, let content scroll beneath the shared floating nav. */
.settings-content { box-sizing:border-box; padding:calc(var(--status-bar-height, 0px) + 16px) 22px calc(100px + env(safe-area-inset-bottom)); }
.settings-subnav {
  --settings-back-width:44px;
  flex-shrink:0;
  display:grid;
  grid-template-columns:var(--settings-back-width) minmax(0,1fr) var(--settings-back-width);
  align-items:center;
  padding:calc(var(--status-bar-height,0px) + 6px) 8px 5px;
  border-bottom:1px solid #e2eaf2;
}
.subnav-label { color:#203047; font-size:13px; font-weight:650; text-align:center; }
.settings-heading { display:flex; align-items:center; gap:9px; margin:4px 2px 24px; }
.settings-title { display:block; margin-top:5px; color:#203047; font-size:29px; line-height:1.25; font-weight:700; }
.settings-heading .settings-title { margin-top:0; }
.settings-intro { display:block; margin-top:7px; color:#60748a; font-size:12px; line-height:1.6; }
.settings-back { width:44px; min-height:44px; display:grid; place-items:center; }
.settings-back::after { border:0; }
.is-detail .settings-content { padding-top:19px; padding-bottom:calc(24px + env(safe-area-inset-bottom)); }
.detail-heading { margin:0 2px 20px; }
.widget-detail-heading { margin-bottom:8px; }
.detail-title-row { display:flex; align-items:flex-end; gap:6px; }
/* Keep the 44px tap target while letting the title row occupy only 30px. */
.widget-title-help { display:flex; align-items:center; justify-content:flex-start; flex-shrink:0; box-sizing:border-box; width:44px; height:44px; padding:0; margin:-7px 0; background:transparent; border:0; }
.widget-title-help::after { border:0; }
.widget-title-refresh { display:flex; align-items:center; justify-content:flex-end; flex-shrink:0; box-sizing:border-box; width:44px; height:44px; padding:0; margin:-7px 0 -7px auto; background:transparent; border:0; }
.widget-title-refresh::after { border:0; }
.detail-heading .settings-title { font-size:24px; }
.detail-note { display:block; margin:13px 5px; color:#8292a4; font-size:11px; line-height:1.8; }
.directory-group + .directory-group { margin-top:18px; }
.directory-label { display:block; margin:0 2px 8px; color:#526b85; font-size:12px; font-weight:620; }
.directory-links,.about-card,.settings-card,.semester-card,.motion-options,.scenario-grid,.variant-picker {
  overflow:hidden;
  border-radius:12px;
  background:#fff;
}
.directory-links > .directory-link + .directory-link::before {
  content:'';
  position:absolute;
  inset:0 0 auto 44px;
  border-top:1px solid #e2eaf2;
}
.about-card { display:flex; flex-direction:column; align-items:center; padding:24px 14px; }
.about-name { margin-top:15px; color:#284460; font-size:21px; font-weight:600; }
.about-tagline { margin-top:8px; color:#738aa0; font-size:12px; }
.about-maker { margin-top:18px; color:#657e98; font-size:11px; font-weight:550; }
.about-version { margin-top:8px; color:#8b9caf; font-size:10px; }
.update-links { margin-top:12px; }
.about-data { display:flex; align-items:flex-start; gap:12px; margin:23px 4px; }
.about-data > view:last-child { display:flex; flex-direction:column; gap:7px; }
.about-data text:first-child { color:#32465e; font-size:13px; font-weight:550; }
.about-data text:last-child { color:#8292a4; font-size:11px; line-height:1.8; }
.settings-section { margin-bottom:21px; }
.section-heading { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin:0 2px 9px; }
.section-title { color:#29394e; font-size:15px; font-weight:650; }
.section-note { color:#9aa7b5; font-size:9px; white-space:nowrap; }
.preference-row { width:100%; min-height:54px; display:flex; align-items:center; justify-content:space-between; gap:14px; padding:8px 14px; border:0; background:#fff; text-align:left; }
.preference-row::after,.scenario-option::after,.semester-save::after,.import-button::after,.demo-button::after,.finish-button::after,.motion-option::after { border:0; }
.preference-row + .preference-row { border-top:1px solid #eff2f6; }
.preference-copy { display:flex; min-width:0; flex-direction:column; gap:4px; }
.preference-copy text:first-child { color:#2e3d51; font-size:13px; font-weight:600; }
.preference-help { color:#60748a; font-size:11px; line-height:1.4; }
.setting-switch { width:37px; height:22px; flex-shrink:0; padding:2px; border-radius:13px; background:#dfe5ec; transition:background .15s ease; }
.setting-switch view { width:18px; height:18px; border-radius:50%; background:#fff; box-shadow:0 1px 3px #1d2b3b20; transition:transform .15s ease; }
.setting-switch.on { background:#527da8; }
.setting-switch.on view { transform:translateX(15px); }
.semester-card { padding:15px; }
.semester-card.with-import { padding-bottom:0; }
.semester-title-row { display:flex; align-items:center; gap:11px; }
.semester-mark { width:28px; height:38px; flex-shrink:0; display:flex; align-items:center; justify-content:center; }
.semester-copy { display:flex; flex:1; min-width:0; flex-direction:column; gap:4px; }
.semester-name { overflow:hidden; color:#26374b; font-size:14px; font-weight:650; text-overflow:ellipsis; white-space:nowrap; }
.semester-campus { color:#8796a8; font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.semester-course-count { color:#60748a; font-size:11px; white-space:nowrap; }
.semester-fields { margin-top:12px; border-top:1px solid #e2eaf2; border-bottom:1px solid #e2eaf2; }
.semester-heading { align-items:center; min-height:44px; margin-top:-9px; margin-bottom:2px; }
.semester-actions { display:flex; align-items:center; gap:8px; }
.semester-heading .semester-action { min-height:44px; min-width:44px; display:flex; align-items:center; justify-content:center; gap:6px; color:#315d89; font-size:13px; font-weight:600; }
.semester-heading .semester-cancel { color:#627487; font-weight:400; }
.semester-heading .semester-save[disabled] { color:#97a4b2; background:transparent; }
.semester-field { display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:48px; color:#2e3d51; font-size:13px; }
.semester-field-value { display:flex; align-items:center; gap:5px; color:#315d89; }
.semester-fields .semester-date-toggle { width:100%; font-size:13px; color:#2e3d51; }
.semester-total { border-top:1px solid #eff2f6; }
.semester-weeks-input { width:48px; min-height:32px; border-radius:10px; background:#eef3f8; text-align:center; font-size:14px; }
.semester-error,.semester-help { display:block; margin-top:8px; color:#60748a; font-size:11px; line-height:1.6; }
.semester-error { color:#a04443; }
.import-button { min-height:55px; display:flex; width:100%; align-items:center; justify-content:space-between; gap:8px; border-top:1px solid #e2eaf2; color:#315d89; font-size:13px; font-weight:650; text-align:left; }
.scenario-option,.variant-option { min-height:44px; width:100%; display:flex; align-items:center; gap:8px; padding:0 12px; color:#344b64; text-align:left; font-size:12px; }
.scenario-option + .scenario-option,.variant-option + .variant-option { border-top:1px solid #e2eaf2; }
.scenario-option { justify-content:space-between; }
.scenario-option.chosen,.variant-option.selected .variant-name { color:#315d89; font-weight:650; }
.motion-section { margin-top:4px; }
.motion-intro { display:block; margin:0 2px 10px; color:#8696a8; font-size:10px; line-height:1.6; }
.motion-stage { position:relative; height:190px; display:flex; align-items:center; justify-content:center; overflow:hidden; isolation:isolate; border:1px solid #e7edf4; border-radius:19px; background:#fff; }
.motion-status { position:relative; display:flex; flex-direction:column; align-items:center; margin-top:-10px; }
.motion-status-title { color:#29394d; font-size:12px; font-weight:550; }
.motion-status-note { margin-top:5px; color:#909cab; font-size:9px; }
.motion-meta { position:absolute; right:15px; bottom:12px; color:#94a1af; font-size:9px; font-variant-numeric:tabular-nums; }
.motion-context { position:absolute; inset:0; padding:15px; opacity:.2; filter:blur(2px); pointer-events:none; }
.context-title { font-size:10px; }
.context-rule { height:1px; margin:8px 0; background:#a5adb9; }
.context-row { display:flex; height:28px; gap:7px; margin-top:6px; }
.context-row view { flex:1; border-radius:4px; background:#cad9e3; }
.context-row:nth-child(odd) view:nth-child(2) { background:transparent; }
.with-context .motion-status { padding:0 10px 9px; border-radius:17px; background:rgba(255,255,255,.88); }
.variant-picker { margin-top:12px; }
.variant-option { display:flex; min-width:0; min-height:44px; align-items:center; justify-content:space-between; gap:6px; text-align:left; }
.variant-name { flex:1; min-width:0; }
.variant-description { display:block; min-height:30px; padding:9px 2px 0; color:#60748a; font-size:11px; line-height:1.6; }
.motion-actions { display:flex; gap:8px; margin-top:10px; }
.demo-button,.finish-button { flex:1; min-height:44px; display:grid; place-items:center; color:#315d89; font-size:12px; font-weight:650; }
.finish-button { border-left:1px solid #e2eaf2; }
.demo-hint { display:block; margin:7px 0 13px; color:#9ba6b3; text-align:center; font-size:9px; }
.motion-options { padding:0 13px; }
.motion-option { width:100%; min-height:43px; display:flex; align-items:center; justify-content:space-between; border:0; background:transparent; color:#52657a; text-align:left; font-size:10px; }
.motion-option + .motion-option { border-top:1px solid #eff2f6; }
.motion-option .setting-switch { transform:scale(.9); transform-origin:right center; }
.speed-picker { display:flex; align-items:center; gap:3px; }
.speed-picker button { min-width:44px; min-height:44px; display:grid; place-items:center; color:#60748a; font-size:11px; }
.speed-picker button.active { color:#315d89; font-weight:650; text-decoration:underline; text-underline-offset:5px; }
.motion-footnote { display:block; margin:10px 3px 0; color:#99a5b2; font-size:9px; line-height:1.7; }
.settings-note { display:flex; align-items:flex-start; gap:8px; margin:5px 2px 17px; color:#8796a6; font-size:9px; line-height:1.65; }
.about-mark { display:flex; flex-direction:column; align-items:center; gap:7px; padding:3px 0 7px; color:#53677e; font-size:11px; }
.about-mark text:last-child { color:#9aa6b3; font-size:9px; }
.settings-page button:focus-visible { outline:2px solid #527da8; outline-offset:2px; }
.settings-page .directory-link:focus-visible,.settings-page .preference-row:focus-visible,
.settings-page .scenario-option:focus-visible,.settings-page .variant-option:focus-visible { outline-offset:-3px; }
.settings-page button:active { opacity:.78; }
.settings-page .setting-switch view { transition:transform .15s ease; }
.settings-page.reduced-motion .setting-switch,.settings-page.reduced-motion .setting-switch view { transition:none !important; }
@media (max-width:374px) { .settings-content { padding-left:16px; padding-right:16px; }.settings-title { font-size:25px; }.semester-card { padding:13px; }.semester-campus { font-size:9px; } }
@media (max-width:374px) { .directory-links > .directory-link + .directory-link::before { left:39px; } }
@media (prefers-reduced-motion:reduce) { .settings-page * { scroll-behavior:auto !important; }.setting-switch,.setting-switch view { transition:none !important; } }
</style>
