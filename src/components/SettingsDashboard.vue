<template>
  <view class="settings-page" :class="{ 'reduced-motion': store.reducedMotion }" :data-settings-section="section"
    :data-route-phase="routePhase" :style="{ '--settings-route-duration': SETTINGS_ROUTE_DURATION + 'ms', '--settings-route-exit-duration': SETTINGS_ROUTE_EXIT_DURATION + 'ms' }" @keydown="handleKeydown">
      <view class="settings-route settings-home" :class="{ 'home-covered': section !== 'home' && routePhase !== 'leaving' }"
        :inert="section !== 'home' && routePhase !== 'leaving' ? true : undefined" :aria-hidden="section !== 'home' && routePhase !== 'leaving' ? 'true' : undefined">
        <scroll-view class="settings-scroll" scroll-y :show-scrollbar="false">
        <view class="settings-content">
      <view class="settings-heading">
        <text class="settings-eyebrow">湖畔课表 · PREFERENCES</text>
        <text class="settings-title">设置</text>
        <text class="settings-intro">把课表，调成习惯的样子。</text>
      </view>

      <view class="settings-directory">
        <button id="settings-entry-semester" role="button" tabindex="0" class="semester-entry" data-settings-entry="semester" @click="openSection('semester')" @keydown.enter.prevent="openSection('semester')" @keydown.space.prevent="openSection('semester')">
          <view class="entry-topline"><text>{{ store.isDemo ? '示例课表' : '我的学期' }}</text><AppIcon name="arrow" :size="19" color="#527da8"/></view>
          <text class="entry-semester-name">{{ store.schedule.semester.name }}</text>
          <view class="semester-miniature" aria-hidden="true"><view v-for="day in 7" :key="day"><view v-if="day !== 3 && day !== 7" /><view v-if="day === 2 || day === 5" /></view></view>
          <view class="entry-bottomline"><text>{{ store.schedule.courses.length }} 门课程 · {{ store.schedule.semester.weeks }} 个教学周</text><text>学期与导入</text></view>
        </button>

        <text class="directory-label">按你的习惯</text>
        <view class="preference-entries">
          <button id="settings-entry-display" role="button" tabindex="0" class="category-tile" data-settings-entry="display" @click="openSection('display')" @keydown.enter.prevent="openSection('display')" @keydown.space.prevent="openSection('display')">
            <view class="tile-topline"><AppIcon name="layout-rows" :size="24" color="#527da8"/><AppIcon name="right" :size="15" color="#93a5b8"/></view>
            <text class="category-title">课表显示</text><text class="category-description">教师、考核与节次</text>
            <text class="category-status">{{ displaySummary }}</text>
          </button>
          <button id="settings-entry-appearance" role="button" tabindex="0" class="category-tile appearance-entry" data-settings-entry="appearance" @click="openSection('appearance')" @keydown.enter.prevent="openSection('appearance')" @keydown.space.prevent="openSection('appearance')">
            <view class="tile-topline"><AppIcon name="settings" :size="24" color="#587f80"/><AppIcon name="right" :size="15" color="#93a5b8"/></view>
            <text class="category-title">外观与交互</text><text class="category-description">玻璃质感、动画节奏</text>
            <text class="category-status">{{ store.reducedMotion ? '减少动态' : '自然动态' }}</text>
          </button>
        </view>

        <text class="directory-label">探索与了解</text>
        <view class="directory-links">
          <button id="settings-entry-widgets" role="button" tabindex="0" class="directory-link" data-settings-entry="widgets" @click="openSection('widgets')" @keydown.enter.prevent="openSection('widgets')" @keydown.space.prevent="openSection('widgets')"><AppIcon name="layout-rows" :size="22" color="#527da8"/><view><text>桌面小组件</text><text>今日课表、当前课程，放在桌面上</text></view><AppIcon name="right" :size="16" color="#93a5b8"/></button>
          <button v-if="SHOW_DEVELOPER_TOOLS" id="settings-entry-preview" role="button" tabindex="0" class="directory-link" data-settings-entry="preview" @click="openSection('preview')" @keydown.enter.prevent="openSection('preview')" @keydown.space.prevent="openSection('preview')"><AppIcon name="motion" :size="22" color="#657b94"/><view><text>预览实验室</text><text>加载动效{{ store.isDemo ? '与课表示例' : '对比' }}，在这里试试</text></view><AppIcon name="right" :size="16" color="#93a5b8"/></button>
          <button id="settings-entry-about" role="button" tabindex="0" class="directory-link" data-settings-entry="about" @click="openSection('about')" @keydown.enter.prevent="openSection('about')" @keydown.space.prevent="openSection('about')"><AppIcon name="lake" :size="22" color="#657b94"/><view><text>关于湖畔课表</text><text>版本信息与本地数据说明</text></view><AppIcon name="right" :size="16" color="#93a5b8"/></button>
        </view>
        <text class="directory-footnote">湖畔课表 · 让时间，清晰一点。</text>
      </view>
        </view>
        </scroll-view>
      </view>

      <view v-if="section !== 'home'" :key="section" class="settings-route settings-detail is-detail"
        :class="{ 'card-morph': activeSettingsMotion === 'card', 'slide-detail': activeSettingsMotion === 'slide', 'page-zoom': activeSettingsMotion === 'page', 'shape-page': activeSettingsMotion === 'shape', 'detail-shown': detailShown, 'route-moving': routePhase === 'entering' || routePhase === 'leaving', 'route-leaving': routePhase === 'leaving' }"
        :style="routeOriginStyle || undefined" :inert="routePhase === 'leaving' ? true : undefined" @transitionend="onRouteTransitionEnd">
        <view class="settings-morph-surface" aria-hidden="true" />
        <view v-if="activeSettingsMotion === 'shape'" class="shape-source-card" :class="{ 'is-directory': section === 'preview' || section === 'about' || section === 'widgets', 'is-about': section === 'about' }" aria-hidden="true">
          <button v-if="section === 'semester'" tabindex="-1" class="semester-entry">
            <view class="entry-topline"><text>{{ store.isDemo ? '示例课表' : '我的学期' }}</text><AppIcon name="arrow" :size="19" color="#527da8"/></view>
            <text class="entry-semester-name">{{ store.schedule.semester.name }}</text>
            <view class="semester-miniature"><view v-for="day in 7" :key="day"><view v-if="day !== 3 && day !== 7" /><view v-if="day === 2 || day === 5" /></view></view>
            <view class="entry-bottomline"><text>{{ store.schedule.courses.length }} 门课程 · {{ store.schedule.semester.weeks }} 个教学周</text><text>学期与导入</text></view>
          </button>
          <button v-else-if="section === 'display'" tabindex="-1" class="category-tile">
            <view class="tile-topline"><AppIcon name="layout-rows" :size="24" color="#527da8"/><AppIcon name="right" :size="15" color="#93a5b8"/></view>
            <text class="category-title">课表显示</text><text class="category-description">教师、考核与节次</text><text class="category-status">{{ displaySummary }}</text>
          </button>
          <button v-else-if="section === 'appearance'" tabindex="-1" class="category-tile appearance-entry">
            <view class="tile-topline"><AppIcon name="settings" :size="24" color="#587f80"/><AppIcon name="right" :size="15" color="#93a5b8"/></view>
            <text class="category-title">外观与交互</text><text class="category-description">玻璃质感、动画节奏</text><text class="category-status">{{ store.reducedMotion ? '减少动态' : '自然动态' }}</text>
          </button>
          <button v-else-if="section === 'preview'" tabindex="-1" class="directory-link"><AppIcon name="motion" :size="22" color="#657b94"/><view><text>预览实验室</text><text>加载动效{{ store.isDemo ? '与课表示例' : '对比' }}，在这里试试</text></view><AppIcon name="right" :size="16" color="#93a5b8"/></button>
          <button v-else-if="section === 'about'" tabindex="-1" class="directory-link"><AppIcon name="lake" :size="22" color="#657b94"/><view><text>关于湖畔课表</text><text>版本信息与本地数据说明</text></view><AppIcon name="right" :size="16" color="#93a5b8"/></button>
          <button v-else-if="section === 'widgets'" tabindex="-1" class="directory-link"><AppIcon name="layout-rows" :size="22" color="#527da8"/><view><text>桌面小组件</text><text>今日课表、当前课程，放在桌面上</text></view><AppIcon name="right" :size="16" color="#93a5b8"/></button>
        </view>
        <view class="settings-detail-content">
        <view class="settings-subnav">
          <button role="button" tabindex="0" class="settings-back" aria-label="返回设置首页" @click="goBack" @keydown.enter.prevent="goBack" @keydown.space.prevent="goBack"><AppIcon name="left" :size="18" color="#527da8"/><text>设置</text></button>
          <text class="subnav-label">{{ sectionInfo.title }}</text><view class="subnav-spacer" aria-hidden="true" />
        </view>
        <scroll-view class="settings-scroll" scroll-y :show-scrollbar="false">
        <view class="settings-content" :class="{ 'widget-detail-content': section === 'widgets' }">
      <view class="detail-heading" :class="{ 'widget-detail-heading': section === 'widgets' }">
        <view class="detail-title-row">
          <text class="settings-title">{{ sectionInfo.title }}</text>
          <button v-if="section === 'widgets'" class="widget-title-help" aria-label="手动添加桌面小组件" @click="showWidgetManual"><AppIcon name="info" :size="18" color="#52718c" /></button>
          <button v-if="section === 'widgets'" class="widget-title-refresh" aria-label="重新同步课表" :disabled="!widgetSettingsRef || widgetSettingsRef.syncBusy" :aria-busy="widgetSettingsRef?.syncBusy || false" @click="widgetSettingsRef?.resync()"><AppIcon name="refresh" :size="20" color="#527da8" /></button>
        </view>
        <text v-if="section !== 'widgets'" class="settings-intro">{{ sectionInfo.description }}</text>
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
        <text class="detail-note">只调整课表上的显示内容，不会删除课程信息；完整信息仍可在课程详情查看。</text>
      </view>

      <view v-if="section === 'appearance'" class="settings-section">
        <view class="section-heading"><text class="section-title">界面体验</text></view>
        <view class="settings-card preference-card">
          <GlassClaritySetting />
          <NavigationMotionSetting />
          <NavigationVisibilitySetting />
          <SettingsMotionSetting />
          <button tabindex="0" class="preference-row" role="switch" aria-label="减少动画" :aria-checked="store.reducedMotion" @click="store.reducedMotion = !store.reducedMotion" @keydown.enter.prevent="store.reducedMotion = !store.reducedMotion" @keydown.space.prevent="store.reducedMotion = !store.reducedMotion">
            <view class="preference-copy"><text>减少动画</text><text class="preference-help">采用更安静、直接的切换效果</text></view><view class="setting-switch" :class="{ on: store.reducedMotion }"><view /></view>
          </button>
        </view>
        <text class="detail-note">通透度与切换效果会自动保存。系统开启减少透明度或增强对比度时，优先使用清晰的实色背景。</text>
      </view>

      <view v-if="section === 'semester'" class="settings-section">
        <view class="section-heading"><text class="section-title">当前学期</text><text class="section-note">课程与周次</text></view>
        <view class="semester-card">
          <view class="semester-title-row"><view class="semester-mark"><AppIcon name="calendar" :size="20" color="#527DA8" /></view><view class="semester-copy"><text class="semester-name">{{ store.schedule.semester.name }}</text><text class="semester-campus">{{ store.schedule.semester.campus }} · 研究生集中教学</text></view></view>
          <view class="semester-stats">
            <view><text class="stat-value number">{{ store.schedule.courses.length }}</text><text class="stat-label">{{ store.isDemo ? '示例课程' : '门课程' }}</text></view>
            <view><text class="stat-value number">{{ store.schedule.semester.weeks }}</text><text class="stat-label">教学周</text></view>
            <view><text class="stat-value number">{{ store.schedule.semester.monday.slice(5).replace('-', '.') }}</text><text class="stat-label">{{ store.isDemo ? '示例起始日' : '第一教学周' }}</text></view>
          </view>
          <text class="semester-note">{{ store.isDemo ? '示例学期用于检查页面显示；正式使用前请确认开学日期、教学周数与校区。' : '课表已保存在此设备。重新导入前会先展示读取结果供你确认。' }}</text>
          <button role="button" tabindex="0" class="import-button" @click="$emit('import')" @keydown.enter.prevent="$emit('import')" @keydown.space.prevent="$emit('import')">从教务导入<AppIcon name="arrow" :size="17" color="#ffffff" /></button>
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
          <view class="motion-meta"><text>{{ current.tag }} · {{ current.name }}</text><text>{{ quiet ? '减少动态' : slow ? '0.5× 慢放' : '1× 原速' }}</text></view>
        </view>

        <view class="variant-picker" role="group" aria-label="选择加载动画">
          <button role="button" tabindex="0" v-for="item in loadingVariants" :key="item.id" class="variant-option" :class="{ selected: selected === item.id }" :aria-pressed="selected === item.id" @click="selectVariant(item.id)" @keydown.enter.prevent="selectVariant(item.id)" @keydown.space.prevent="selectVariant(item.id)">
            <view class="variant-caption"><text>{{ item.tag }}</text><view class="selection-dot" /></view><text class="variant-name">{{ item.name }}</text>
          </button>
        </view>
        <text class="variant-description">{{ current.description }}</text>
        <view class="motion-actions">
          <button role="button" tabindex="0" class="demo-button" @click="playDemo" @keydown.enter.prevent="playDemo" @keydown.space.prevent="playDemo">{{ demoRunning ? '重新演示' : '完整演示' }}<AppIcon name="arrow" :size="16" color="#ffffff" /></button>
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
          <button role="button" tabindex="0" v-for="item in scenarios" :key="item.value" class="scenario-option" :class="{ chosen: store.scenario === item.value }" @click="store.resetScenario(item.value)" @keydown.enter.prevent="store.resetScenario(item.value)" @keydown.space.prevent="store.resetScenario(item.value)">
            <text>{{ item.label }}</text><AppIcon v-if="store.scenario === item.value" name="check" :size="17" color="#527DA8" />
          </button>
        </view>
      </view>

      <view v-if="section === 'about'" class="settings-section">
        <view class="about-card"><AppIcon name="lake" :size="42" color="#527da8"/><text class="about-name">湖畔课表</text><text class="about-tagline">让时间，清晰一点。</text><text class="about-maker">制作者 · YukiDango</text><text class="about-version">版本 0.1.0 · 非国科大官方应用</text></view>
        <view class="about-data"><AppIcon name="shield" :size="22" color="#587f80"/><view><text>数据留在你的设备</text><text>导入的课表、玻璃通透度和切换效果保存在本地。教师、考核、节次显示和减少动画设置在本次运行中生效。</text></view></view>
        <view class="settings-note"><AppIcon name="info" :size="17" color="#8093a8"/><text>{{ store.isDemo ? '当前使用示例课表，示例课程编辑只在本次预览中生效。请从「学期与导入」导入真实课表。' : '重新导入会先展示读取结果供你确认。请保管好设备上的课表数据。' }}</text></view>
      </view>
        </view>
        </scroll-view>
        </view>
      </view>
      <WidgetNotice :notice="widgetNotice" :reduced-motion="store.reducedMotion" @close="widgetNotice = null" />
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, onUnmounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import ImportLoadingPreview from './ImportLoadingPreview.vue'
import GlassClaritySetting from './GlassClaritySetting.vue'
import NavigationMotionSetting from './NavigationMotionSetting.vue'
import NavigationVisibilitySetting from './NavigationVisibilitySetting.vue'
import SettingsMotionSetting from './SettingsMotionSetting.vue'
import WidgetSettings from './WidgetSettings.vue'
import WidgetNotice from './WidgetNotice.vue'
import { widgetManualInstructions, type WidgetNoticePayload } from '../domain/widget-guide'
import { loadingVariants, type LoadingVariant } from './loading-preview'
import { useScheduleStore } from '../stores/schedule'
import { useAppearanceStore, type SettingsMotion } from '../stores/appearance'
import type { Scenario } from '../data/demo'
import { createSettingsRoute, SETTINGS_ROUTE_DURATION, SETTINGS_ROUTE_EXIT_DURATION, type SettingsSection } from './settings-route'
import { settingsCardMorphStyle, settingsPageZoomStyle, settingsCardPageStyle, type CardRect } from './settings-card-morph'
import { SHOW_DEVELOPER_TOOLS } from './navigation-items'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ import: []; 'detail-change': [open: boolean, leaving: boolean] }>()

const store = useScheduleStore()
const appearance = useAppearanceStore()
const instance = getCurrentInstance()
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
const { section, phase: routePhase, shown: detailShown } = route
const routeOriginStyle = ref<Record<string, string> | null>(null)
const activeSettingsMotion = ref<SettingsMotion>(appearance.settingsMotion)
let pendingOpen = 0
let motionChangeVersion = 0
let pendingMotionPreparation: Promise<void> | null = null
let pendingMotionCommit: Promise<void> | null = null
let pendingBack = false
function commitMotionFrame(): void {
  // A mode switched from slide has no clip-path history yet. Give the fully
  // open geometry one painted frame before asking it to collapse.
  const commit = new Promise<void>(resolve => {
    let done = false
    const finish = () => { if (!done) { done = true; clearTimeout(fallback); resolve() } }
    const fallback = setTimeout(finish, 100)
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(finish))
    else setTimeout(finish, 32)
  })
  pendingMotionCommit = commit
  void commit.then(() => { if (pendingMotionCommit === commit) pendingMotionCommit = null })
}
// Parent hit testing must update before a rapid tap reaches the navigation.
watch([section, routePhase], ([value, phase]) => emit('detail-change', value !== 'home', phase === 'leaving'), { immediate: true, flush: 'sync' })
const sections = {
  home: { title:'设置', description:'' },
  display: { title:'课表显示', description:'让每张课程卡片，只留下你需要的信息。' },
  appearance: { title:'外观与交互', description:'调一点通透，选一种舒服的切换节奏。' },
  semester: { title:'学期与导入', description:'查看当前学期，连接教务更新你的课表。' },
  widgets: { title:'桌面小组件', description:'不用打开 App，也能看见下一堂课。' },
  preview: { title:'预览实验室', description:'先试一试，再找到喜欢的节奏。' },
  about: { title:'关于湖畔课表', description:'一个轻巧的课表，陪你安排每一天。' }
}
const sectionInfo = computed(() => sections[section.value])
const displaySummary = computed(() => [store.showTeachers && '教师', store.showExams && '考核', store.showSections && '节次'].filter(Boolean).join(' · ') || '仅课程基本信息')
function readRouteOrigin(value: Exclude<SettingsSection, 'home'>, motion: Exclude<SettingsMotion, 'slide'>): Promise<Record<string, string> | null> {
  if (motion !== 'page' && typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && !CSS.supports('clip-path', 'inset(1px round 1px)')) return Promise.resolve(null)
  const styleFor = motion === 'card' ? settingsCardMorphStyle : motion === 'shape' ? settingsCardPageStyle : settingsPageZoomStyle
  // H5/App-Vue can read the current box without waiting for a layout bridge.
  if (typeof document !== 'undefined') {
    const page = document.querySelector('.settings-page')
    const card = document.getElementById(`settings-entry-${value}`)
    if (page && card) {
      const style = styleFor(page.getBoundingClientRect(), card.getBoundingClientRect(), value)
      if (style) return Promise.resolve(style)
    }
  }
  // The documented uni-app selector query covers App WebViews that do not
  // expose their DOM to the page's Vue execution context.
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
      const query = uni.createSelectorQuery().in(instance?.proxy)
      query.select('.settings-page').boundingClientRect()
      query.select(`#settings-entry-${value}`).boundingClientRect()
      query.exec((results: (CardRect | null)[]) => finish(styleFor(results?.[0] || null, results?.[1] || null, value)))
    } catch { finish(null) }
  })
}
// A choice made inside Appearance must also govern this page's next return.
// Keep the fully-open page visually stable while preparing the new origin.
watch([() => appearance.settingsMotion, section, routePhase, () => store.reducedMotion], ([motion, current, phase, reduced]) => {
  if (current !== 'appearance' || phase !== 'open') return
  const version = ++motionChangeVersion
  if (motion === 'slide' || reduced) {
    const changed = activeSettingsMotion.value !== 'slide'
    pendingMotionPreparation = null
    routeOriginStyle.value = null
    activeSettingsMotion.value = 'slide'
    if (changed) commitMotionFrame()
    return
  }
  const preparation = readRouteOrigin('appearance', motion).then(style => {
    if (version !== motionChangeVersion || section.value !== 'appearance' || routePhase.value !== 'open') return
    const nextMotion = style ? motion : 'slide'
    const changed = activeSettingsMotion.value !== nextMotion
    routeOriginStyle.value = style
    activeSettingsMotion.value = nextMotion
    if (changed) commitMotionFrame()
  })
  pendingMotionPreparation = preparation
  void preparation.finally(() => { if (pendingMotionPreparation === preparation) pendingMotionPreparation = null })
}, { flush: 'sync' })
async function openSection(value: Exclude<SettingsSection, 'home'>): Promise<void> {
  if (value === 'preview' && !SHOW_DEVELOPER_TOOLS) return
  if (section.value !== 'home' && routePhase.value !== 'leaving') return
  const request = ++pendingOpen
  const selectedMotion = appearance.settingsMotion
  const style = store.reducedMotion || selectedMotion === 'slide' ? null : await readRouteOrigin(value, selectedMotion)
  if (request !== pendingOpen) return
  routeOriginStyle.value = style
  // Other details keep their entry mode. Appearance can change its return
  // mode once fully open, so the freshly selected choice is immediately usable.
  activeSettingsMotion.value = style ? selectedMotion : 'slide'
  if (route.open(value)) cancelDemo()
}
function goBack(): boolean {
  if (widgetNotice.value) { const guide = widgetNotice.value.presentation === 'guide'; widgetNotice.value = null; if (guide) return true }
  if (section.value === 'home') return false
  pendingOpen += 1
  cancelDemo()
  if (section.value === 'appearance' && routePhase.value !== 'leaving' && (pendingMotionPreparation || pendingMotionCommit)) {
    if (!pendingBack) {
      pendingBack = true
      const returnWhenPrepared = () => {
        if (section.value !== 'appearance' || routePhase.value === 'leaving') { pendingBack = false; return }
        if (pendingMotionPreparation) { void pendingMotionPreparation.then(returnWhenPrepared); return }
        if (pendingMotionCommit) { void pendingMotionCommit.then(returnWhenPrepared); return }
        pendingBack = false
        route.back()
      }
      void (pendingMotionPreparation || pendingMotionCommit)!.then(returnWhenPrepared)
    }
    return true
  }
  pendingBack = false
  return route.back()
}
function finishReturn(): void {
  if (routePhase.value === 'leaving') route.transitionEnd()
}
function onRouteTransitionEnd(event: TransitionEvent) {
  if (event.target !== event.currentTarget || (event.propertyName !== 'transform' && event.propertyName !== 'clip-path' && event.propertyName !== '-webkit-clip-path')) return
  route.transitionEnd()
}
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && goBack()) { event.preventDefault(); event.stopPropagation() }
}
async function openExternalSection(value: 'widgets' | 'semester', id?: number): Promise<void> {
  widgetId.value = id
  pendingOpen += 1
  if (section.value !== 'home') { route.back(); route.transitionEnd() }
  await openSection(value)
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
watch(() => store.reducedMotion, reduced => { if (reduced) route.disableMotion() })
onUnmounted(() => {
  pendingOpen += 1
  motionChangeVersion += 1
  cancelDemo()
  route.dispose()
})
</script>

<style scoped src="./settings-route.css"></style>
<style scoped>
.settings-page { position:relative; flex:1; min-height:0; height:0; display:flex; flex-direction:column; overflow:hidden; background:#f6f8fc; color:#203047; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif; }
.settings-route { position:absolute; inset:0; z-index:1; display:flex; min-height:0; flex-direction:column; overflow:hidden; background:#f6f8fc; }
.settings-home.home-covered { pointer-events:none; }
/* Share the canvas stacking order: directory 1 < floating nav 20 < detail 25
   < import 30. Keep settings-page at z-index:auto (no enclosing stack). */
.settings-detail { z-index:25; }
/* The clicked card is the actual clipping rectangle, including its corner
   radius. Only this mask moves; the full-size detail content never scales. */
.settings-detail.card-morph { clip-path:inset(var(--morph-top) var(--morph-right) var(--morph-bottom) var(--morph-left) round var(--morph-radius)); -webkit-clip-path:inset(var(--morph-top) var(--morph-right) var(--morph-bottom) var(--morph-left) round var(--morph-radius)); opacity:0; transition:clip-path var(--settings-route-duration) cubic-bezier(.22,.68,.36,1),opacity 80ms ease; }
.settings-detail.card-morph.detail-shown { clip-path:inset(0px 0px 0px 0px round 0px); -webkit-clip-path:inset(0px 0px 0px 0px round 0px); opacity:1; }
.settings-detail.card-morph.route-leaving { transition-duration:var(--settings-route-exit-duration),50ms; transition-delay:0ms,calc(var(--settings-route-exit-duration) - 50ms); pointer-events:none; }
.settings-detail.card-morph.route-moving { will-change:clip-path; }
/* One uniform scale keeps the miniature and the full page at the same
   aspect ratio; text grows with the page rather than stretching into place. */
.settings-detail.page-zoom { transform-origin:0 0; transform:translate3d(var(--zoom-x),var(--zoom-y),0) scale(var(--zoom-scale)); border-radius:var(--zoom-radius); transition:transform var(--settings-route-duration) cubic-bezier(.4,0,.2,1),border-radius var(--settings-route-duration) cubic-bezier(.4,0,.2,1); }
.settings-detail.page-zoom.detail-shown { transform:translate3d(0,0,0) scale(1,1); border-radius:0; }
.settings-detail.page-zoom.route-leaving { transition-duration:var(--settings-route-exit-duration); pointer-events:none; }
.settings-detail.page-zoom.route-moving { will-change:transform; }
.page-zoom .settings-detail-content { filter:blur(5px); transition:filter var(--settings-route-duration) cubic-bezier(.4,0,.2,1); }
.page-zoom.detail-shown .settings-detail-content { filter:blur(0); }
.page-zoom.route-leaving .settings-detail-content { transition-duration:var(--settings-route-exit-duration); }
/* One continuous outline expansion: the original card blurs into the
   pre-rendered destination at the midpoint, and reverses on return. */
.settings-detail.shape-page { clip-path:inset(var(--morph-top) var(--morph-right) var(--morph-bottom) var(--morph-left) round var(--morph-radius)); -webkit-clip-path:inset(var(--morph-top) var(--morph-right) var(--morph-bottom) var(--morph-left) round var(--morph-radius)); transition:clip-path var(--settings-route-duration) cubic-bezier(.4,0,.2,1); }
.settings-detail.shape-page.detail-shown { clip-path:inset(0px 0px 0px 0px round 0px); -webkit-clip-path:inset(0px 0px 0px 0px round 0px); }
.settings-detail.shape-page.route-leaving { transition-duration:var(--settings-route-exit-duration); pointer-events:none; }
.settings-detail.shape-page.route-moving { will-change:clip-path; }
.shape-page .settings-morph-surface { position:absolute; inset:0; z-index:0; display:block; background:var(--morph-fill); pointer-events:none; opacity:1; transition:opacity var(--settings-route-duration) cubic-bezier(.4,0,.2,1); }
.shape-page.detail-shown .settings-morph-surface { opacity:0; }
.shape-page.route-leaving .settings-morph-surface { transition-duration:var(--settings-route-exit-duration); }
.shape-source-card { position:absolute; z-index:2; top:var(--morph-top); left:var(--morph-left); width:calc(100% - var(--morph-left) - var(--morph-right)); height:calc(100% - var(--morph-top) - var(--morph-bottom)); box-sizing:border-box; overflow:hidden; border-radius:var(--morph-radius); pointer-events:none; background:var(--morph-fill); transition:top var(--settings-route-duration) cubic-bezier(.4,0,.2,1),left var(--settings-route-duration) cubic-bezier(.4,0,.2,1),width var(--settings-route-duration) cubic-bezier(.4,0,.2,1),height var(--settings-route-duration) cubic-bezier(.4,0,.2,1),border-radius var(--settings-route-duration) cubic-bezier(.4,0,.2,1); }
.shape-source-card > button { box-sizing:border-box; width:100%; height:100%; }
/* The origin is the row button, not its padded directory-links parent. */
.shape-source-card.is-directory { padding:0; border:0; }
.shape-source-card.is-directory .directory-link { min-height:0; }
.shape-source-card.is-about .directory-link { border-top:1px solid #edf1f5; }
.shape-page.detail-shown .shape-source-card { top:0; left:0; width:100%; height:100%; border-radius:0; opacity:0; }
.shape-page.route-moving.detail-shown .shape-source-card { animation:shape-source-handoff var(--settings-route-duration) linear both; }
.shape-page.route-leaving .shape-source-card { transition-duration:var(--settings-route-exit-duration); animation:shape-source-handoff var(--settings-route-exit-duration) linear reverse both; }
@keyframes shape-source-handoff {
  0% { filter:blur(0); opacity:1; }
  42% { filter:blur(7px); opacity:1; }
  58%,100% { filter:blur(8px); opacity:0; }
}
.shape-page .settings-detail-content { transform-origin:0 0; transform:translate3d(var(--zoom-x),var(--zoom-y),0) scale(var(--zoom-scale)); opacity:0; filter:blur(8px); transition:transform var(--settings-route-duration) cubic-bezier(.4,0,.2,1); }
.shape-page.detail-shown .settings-detail-content { transform:translate3d(0,0,0) scale(1); opacity:1; filter:blur(0); }
.shape-page.route-moving.detail-shown .settings-detail-content { animation:shape-page-handoff var(--settings-route-duration) linear both; }
.shape-page.route-leaving .settings-detail-content { transition-duration:var(--settings-route-exit-duration); animation:shape-page-handoff var(--settings-route-exit-duration) linear reverse both; }
@keyframes shape-page-handoff {
  0%,42% { opacity:0; filter:blur(8px); }
  58% { opacity:1; filter:blur(8px); }
  100% { opacity:1; filter:blur(0); }
}
.settings-detail-content { position:relative; z-index:1; display:flex; min-height:0; flex:1; flex-direction:column; }
.settings-morph-surface { display:none; }
.card-morph .settings-morph-surface { position:absolute; inset:0; z-index:2; display:block; background:var(--morph-fill); pointer-events:none; opacity:1; transition:opacity 120ms ease; }
.card-morph.detail-shown .settings-morph-surface { opacity:0; transition-delay:100ms; }
.card-morph.route-leaving .settings-morph-surface { opacity:1; transition-delay:0ms; transition-duration:50ms; }
.card-morph .settings-detail-content { opacity:0; transition:opacity 120ms ease; }
.card-morph.detail-shown .settings-detail-content { opacity:1; transition-delay:100ms; }
.card-morph.route-leaving .settings-detail-content { opacity:0; transition-delay:0ms; transition-duration:45ms; }
.settings-page.reduced-motion .card-morph,.settings-page.reduced-motion .card-morph .settings-morph-surface,.settings-page.reduced-motion .card-morph .settings-detail-content,.settings-page.reduced-motion .page-zoom,.settings-page.reduced-motion .page-zoom .settings-detail-content,.settings-page.reduced-motion .shape-page,.settings-page.reduced-motion .shape-page .settings-detail-content,.settings-page.reduced-motion .shape-page .settings-morph-surface { transition:none !important; filter:none !important; }
.settings-page.reduced-motion .shape-page .shape-source-card { display:none !important; }
.settings-page.reduced-motion .shape-page .settings-detail-content { animation:none !important; opacity:1 !important; }
@media (prefers-reduced-motion:reduce) { .settings-detail.card-morph,.card-morph .settings-morph-surface,.card-morph .settings-detail-content { transition:none !important; } .settings-detail.page-zoom,.settings-detail.shape-page { transition-duration:.001ms !important; } .page-zoom .settings-detail-content,.shape-page .settings-detail-content { filter:none !important; transition:none !important; } .shape-page .settings-morph-surface { transition:none !important; } .shape-page .shape-source-card { display:none !important; } .shape-page .settings-detail-content { animation:none !important; opacity:1 !important; } }
.settings-scroll { flex:1; min-height:0; height:100%; }
/* Like the timetable, let content scroll beneath the shared floating nav. */
.settings-content { box-sizing:border-box; padding:calc(var(--status-bar-height, 0px) + 16px) 22px calc(100px + env(safe-area-inset-bottom)); }
.settings-heading { margin:0 2px 22px; }
.settings-eyebrow { color:#8297ad; font-size:9px; font-weight:550; letter-spacing:1.8px; }
.settings-title { display:block; margin-top:5px; color:#203047; font-size:27px; line-height:1.25; font-weight:650; letter-spacing:.2px; }
.settings-intro { display:block; margin-top:7px; color:#8493a5; font-size:11px; line-height:1.6; }
.settings-subnav { flex-shrink:0; display:flex; align-items:center; justify-content:space-between; padding:calc(var(--status-bar-height,0px) + 6px) 16px 5px; border-bottom:1px solid #e9eef4; }
.settings-back { display:flex; align-items:center; gap:3px; min-height:44px; min-width:64px; color:#527da8; font-size:12px; border-radius:12px; margin:0; }
.settings-back::after { border:0; }
.subnav-label { color:#6c7f94; font-size:11px; font-weight:550; }
.subnav-spacer { width:64px; }
.is-detail .settings-content { padding-top:19px; padding-bottom:calc(24px + env(safe-area-inset-bottom)); }
.detail-heading { margin:0 2px 25px; }
.widget-detail-heading { margin-bottom:8px; }
.detail-title-row { display:flex; align-items:flex-end; gap:6px; }
/* Keep the 44px tap target while letting the title row occupy only 30px. */
.widget-title-help { display:flex; align-items:center; justify-content:flex-start; flex-shrink:0; box-sizing:border-box; width:44px; height:44px; padding:0; margin:-7px 0; background:transparent; border:0; }
.widget-title-help::after { border:0; }
.widget-title-refresh { display:flex; align-items:center; justify-content:flex-end; flex-shrink:0; box-sizing:border-box; width:44px; height:44px; padding:0; margin:-7px 0 -7px auto; background:transparent; border:0; }
.widget-title-refresh::after { border:0; }
.detail-heading .settings-title { font-size:24px; }
.detail-note { display:block; margin:13px 5px; color:#8292a4; font-size:11px; line-height:1.8; }
.semester-entry { width:100%; display:block; padding:17px 18px 15px; border:1px solid #dce7f2; border-radius:21px; background:linear-gradient(125deg,#edf4fa,#f9fbfe); text-align:left; }
.semester-entry::after,.category-tile::after,.directory-link::after { border:0; }
.entry-topline,.entry-bottomline,.tile-topline { display:flex; align-items:center; justify-content:space-between; gap:8px; }
.entry-topline { color:#6c88a4; font-size:10px; }
.entry-semester-name { display:block; margin-top:7px; color:#284460; font-size:19px; line-height:1.4; font-weight:600; }
.semester-miniature { display:flex; gap:5px; height:31px; margin:16px 0 13px; }
.semester-miniature > view { flex:1; display:flex; align-items:flex-start; gap:3px; padding:3px; border-left:1px solid #d7e3ee; }
.semester-miniature > view > view { flex:1; height:18px; border-radius:3px; background:#b3cadf80; }
.semester-miniature > view:nth-child(even) > view { margin-top:7px; background:#adcac680; }
.semester-miniature > view > view + view { height:10px; }
.entry-bottomline { color:#66809a; font-size:10px; line-height:1.5; }
.entry-bottomline text:last-child { font-weight:550; color:#527da8; }
.directory-label { display:block; margin:23px 3px 10px; color:#7c8da0; font-size:11px; font-weight:550; }
.preference-entries { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:11px; }
.category-tile { min-width:0; padding:16px 14px 14px; border:1px solid #e3eaf2; border-radius:19px; background:#fff; text-align:left; }
.appearance-entry { background:#f3f8f7; border-color:#e0eae7; }
.category-title { display:block; margin-top:17px; color:#293d54; font-size:14px; font-weight:600; line-height:1.4; }
.category-description { display:block; margin-top:5px; color:#8393a4; font-size:10px; line-height:1.5; }
.category-status { display:block; margin-top:13px; color:#647e98; font-size:10px; line-height:1.5; }
.appearance-entry .category-status { color:#698a83; }
.directory-links { padding:0 15px; background:#fff; border:1px solid #e3eaf2; border-radius:19px; }
.directory-link { display:flex; align-items:center; gap:12px; width:100%; min-height:71px; text-align:left; }
.directory-link + .directory-link { border-top:1px solid #edf1f5; }
.directory-link > view:nth-child(2) { flex:1; min-width:0; display:flex; flex-direction:column; gap:5px; }
.directory-link text:first-child { color:#32465e; font-size:13px; font-weight:550; }
.directory-link text:last-child { color:#8a99aa; font-size:10px; line-height:1.5; }
.directory-footnote { display:block; margin:22px 0 3px; color:#99a8b8; text-align:center; font-size:10px; }
.about-card { display:flex; flex-direction:column; align-items:center; padding:30px 14px; border:1px solid #e0e9f2; border-radius:22px; background:linear-gradient(160deg,#edf4fa,#fff); }
.about-name { margin-top:15px; color:#284460; font-size:21px; font-weight:600; }
.about-tagline { margin-top:8px; color:#738aa0; font-size:12px; }
.about-maker { margin-top:18px; color:#657e98; font-size:11px; font-weight:550; }
.about-version { margin-top:8px; color:#8b9caf; font-size:10px; }
.about-data { display:flex; align-items:flex-start; gap:12px; margin:23px 4px; }
.about-data > view:last-child { display:flex; flex-direction:column; gap:7px; }
.about-data text:first-child { color:#32465e; font-size:13px; font-weight:550; }
.about-data text:last-child { color:#8292a4; font-size:11px; line-height:1.8; }
.settings-section { margin-bottom:21px; }
.section-heading { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin:0 2px 9px; }
.section-title { color:#29394e; font-size:15px; font-weight:650; }
.section-note { color:#9aa7b5; font-size:9px; white-space:nowrap; }
.settings-card,.semester-card,.motion-options { overflow:hidden; border:1px solid #e7edf4; border-radius:17px; background:#fff; }
.preference-row { width:100%; min-height:59px; display:flex; align-items:center; justify-content:space-between; gap:14px; padding:10px 14px; border:0; background:#fff; text-align:left; }
.preference-row::after,.scenario-option::after,.import-button::after,.demo-button::after,.finish-button::after,.motion-option::after { border:0; }
.preference-row + .preference-row { border-top:1px solid #eff2f6; }
.preference-copy { display:flex; min-width:0; flex-direction:column; gap:4px; }
.preference-copy text:first-child { color:#2e3d51; font-size:12px; font-weight:550; }
.preference-help { color:#97a4b2; font-size:9px; line-height:1.35; }
.setting-switch { width:37px; height:22px; flex-shrink:0; padding:2px; border-radius:13px; background:#dfe5ec; transition:background .18s ease; }
.setting-switch view { width:18px; height:18px; border-radius:50%; background:#fff; box-shadow:0 1px 3px #1d2b3b20; transition:transform .18s ease; }
.setting-switch.on { background:#527da8; }.setting-switch.on view { transform:translateX(15px); }
.semester-card { padding:15px; }
.semester-title-row { display:flex; align-items:center; gap:11px; }
.semester-mark { width:38px; height:38px; flex-shrink:0; display:flex; align-items:center; justify-content:center; border-radius:12px; background:#eaf1f8; }
.semester-copy { display:flex; min-width:0; flex-direction:column; gap:4px; }
.semester-name { overflow:hidden; color:#26374b; font-size:14px; font-weight:650; text-overflow:ellipsis; white-space:nowrap; }
.semester-campus { color:#8796a8; font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.semester-stats { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); margin:15px 0 12px; padding:12px 0; border-top:1px solid #edf1f5; border-bottom:1px solid #edf1f5; }
.semester-stats view { display:flex; min-width:0; flex-direction:column; align-items:center; gap:4px; }
.semester-stats view + view { border-left:1px solid #edf1f5; }
.stat-value { color:#344b64; font-size:16px; font-weight:600; }
.stat-label { color:#98a5b3; font-size:9px; }
.semester-note { display:block; color:#8797a9; font-size:10px; line-height:1.7; }
.import-button { min-height:40px; display:flex; align-items:center; justify-content:center; gap:8px; margin-top:13px; border-radius:12px; background:#527da8; color:#fff; font-size:11px; font-weight:550; }
.scenario-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; }
.scenario-option { min-height:42px; display:flex; align-items:center; justify-content:space-between; padding:0 12px; border:1px solid #e6edf4; border-radius:12px; background:#fff; color:#63758a; text-align:left; font-size:10px; }
.scenario-option.chosen { border-color:#bad0e3; background:#edf4fa; color:#527da8; }
.motion-section { margin-top:4px; }
.motion-intro { display:block; margin:0 2px 10px; color:#8696a8; font-size:10px; line-height:1.6; }
.motion-stage { position:relative; height:190px; display:flex; align-items:center; justify-content:center; overflow:hidden; isolation:isolate; border:1px solid #e7edf4; border-radius:19px; background:#fff; }
.motion-status { position:relative; display:flex; flex-direction:column; align-items:center; margin-top:-10px; }
.motion-status-title { color:#29394d; font-size:12px; font-weight:550; }
.motion-status-note { margin-top:5px; color:#909cab; font-size:9px; }
.motion-meta { position:absolute; right:15px; bottom:12px; left:15px; display:flex; justify-content:space-between; gap:8px; color:#94a1af; font-size:9px; font-variant-numeric:tabular-nums; }
.motion-context { position:absolute; inset:0; padding:15px; opacity:.2; filter:blur(2px); pointer-events:none; }
.context-title { font-size:10px; }.context-rule { height:1px; margin:8px 0; background:#a5adb9; }
.context-row { display:flex; height:28px; gap:7px; margin-top:6px; }.context-row view { flex:1; border-radius:4px; background:#cad9e3; }.context-row:nth-child(odd) view:nth-child(2) { background:transparent; }
.with-context .motion-status { padding:0 10px 9px; border-radius:17px; background:rgba(255,255,255,.88); }
.variant-picker { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin-top:12px; }
.variant-option { min-width:0; padding:10px 11px; border:1px solid #e6ebf1; border-radius:12px; background:#ffffff80; text-align:left; }
.variant-option.selected { border-color:#9db8d1; background:#f4f8fc; box-shadow:inset 0 0 0 .5px #9db8d1; }
.variant-caption { display:flex; align-items:center; justify-content:space-between; color:#8e9baa; font-size:9px; }
.selection-dot { width:6px; height:6px; border-radius:50%; background:transparent; }.variant-option.selected .selection-dot { background:#527da8; }
.variant-name { display:block; margin-top:4px; overflow:hidden; color:#384b60; font-size:11px; font-weight:550; text-overflow:ellipsis; white-space:nowrap; }
.variant-description { display:block; min-height:30px; padding:9px 2px 0; color:#8796a6; font-size:9px; line-height:1.6; }
.motion-actions { display:flex; gap:8px; margin-top:10px; }
.demo-button,.finish-button { flex:1; min-height:40px; display:flex; align-items:center; justify-content:center; gap:7px; border-radius:12px; font-size:10px; font-weight:550; }
.demo-button { background:#203047; color:#fff; }.finish-button { border:1px solid #e3e9ef; background:#fff; color:#52657a; }
.demo-hint { display:block; margin:7px 0 13px; color:#9ba6b3; text-align:center; font-size:9px; }
.motion-options { padding:0 13px; border-radius:14px; }
.motion-option { width:100%; min-height:43px; display:flex; align-items:center; justify-content:space-between; border:0; background:transparent; color:#52657a; text-align:left; font-size:10px; }
.motion-option + .motion-option { border-top:1px solid #eff2f6; }
.motion-option .setting-switch { transform:scale(.9); transform-origin:right center; }
.speed-picker { height:33px; box-sizing:border-box; display:flex; align-items:center; gap:2px; padding:3px; border-radius:8px; background:#f0f3f6; }
.speed-picker button { min-width:45px; height:27px; min-height:27px; display:flex; align-items:center; justify-content:center; box-sizing:border-box; margin:0; padding:0 6px; line-height:1; border-radius:6px; color:#8593a2; font-size:9px; }.speed-picker button.active { background:#fff; color:#33475d; box-shadow:0 1px 3px #20304712; }
.motion-footnote { display:block; margin:10px 3px 0; color:#99a5b2; font-size:9px; line-height:1.7; }
.settings-note { display:flex; align-items:flex-start; gap:8px; margin:5px 2px 17px; color:#8796a6; font-size:9px; line-height:1.65; }
.about-mark { display:flex; flex-direction:column; align-items:center; gap:7px; padding:3px 0 7px; color:#53677e; font-size:11px; }
.about-mark text:last-child { color:#9aa6b3; font-size:9px; }
.settings-page button:focus-visible { outline:2px solid #527da8; outline-offset:2px; }
.settings-page button:active { opacity:.78; }
.settings-page .setting-switch view { transition:transform .18s ease; }
.settings-page.reduced-motion .setting-switch,.settings-page.reduced-motion .setting-switch view { transition:none !important; }
@media (max-width:374px) { .settings-content { padding-left:16px; padding-right:16px; }.settings-title { font-size:25px; }.semester-card { padding:13px; }.semester-campus { font-size:9px; }.preference-row { padding-left:12px; padding-right:12px; } }
@media (prefers-reduced-motion:reduce) { .settings-page * { scroll-behavior:auto !important; }.setting-switch,.setting-switch view { transition:none !important; } }
</style>
