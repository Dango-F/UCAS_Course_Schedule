<template>
  <view class="import-page" :class="{ embedded }">
    <view class="import-header">
      <button class="back-button" role="button" tabindex="0" aria-label="返回上一页" @click="goBack" @keydown.enter.prevent="goBack" @keydown.space.prevent="goBack"><AppIcon name="left" /></button>
      <text>{{ stage === 'preview' ? '核对并保存' : '从国科大教务导入' }}</text>
      <view class="header-spacer" />
    </view>

    <view class="import-scroll-region" :style="{ visibility: browserOpen ? 'hidden' : 'visible', opacity: browserOpen ? 0 : 1, pointerEvents: browserOpen ? 'none' : 'auto' }">
    <scroll-view class="import-scroll" scroll-y>
      <view v-if="stage === 'intro'" class="import-content intro-content">
        <view class="import-art"><AppIcon name="lake" :size="52" color="#527DA8" /><view class="art-divider" /><text>UCAS · LAKESIDE</text></view>
        <text class="import-title">新学期，从这里开始</text>
        <text class="import-subtitle">在学校网页完成登录，课表只保存到你的手机。</text>

        <view class="steps">
          <view v-for="(step, index) in steps" :key="step.title" class="step">
            <view class="step-number number">{{ index + 1 }}</view>
            <view><text class="step-title">{{ step.title }}</text><text class="step-description">{{ step.description }}</text></view>
          </view>
        </view>

        <view class="privacy-note"><AppIcon name="shield" :size="20" color="#6E9684" /><text>密码、Cookie 和完整教务网页不会保存，也不会发送到服务器。</text></view>
        <view class="status-note"><AppIcon name="info" :size="18" /><text>{{ platformNote }}</text></view>
        <!-- #ifdef APP-PLUS -->
        <view class="display-mode-card">
          <view><text class="display-mode-title">学校网页显示</text><text class="display-mode-copy">默认手机模式；个人课表入口不便操作时，再切换电脑模式。</text></view>
          <view class="display-mode-options"><button :class="{ active: displayMode === 'mobile' }" @click="displayMode = 'mobile'"><text>手机模式</text><text>适合小屏</text></button><button :class="{ active: displayMode === 'desktop' }" @click="displayMode = 'desktop'"><text>电脑模式</text><text>完整菜单</text></button></view>
        </view>
        <!-- #endif -->
        <button v-if="isApp" class="primary-button" @click="startLogin">打开学校登录页<AppIcon name="arrow" color="white" :size="18" /></button>
        <button v-else class="primary-button" @click="goBack">返回课表预览<AppIcon name="arrow" color="white" :size="18" /></button>
        <text class="import-footer">个人开发 · 非国科大官方应用</text>
      </view>

      <view v-else class="import-content preview-content">
        <view class="review-mark"><view class="review-icon"><AppIcon name="check" :size="24" color="#527DA8" /></view><view><text class="review-eyebrow">读取完成</text><text class="review-title">先核对，再保存</text></view></view>
        <text class="review-copy">下面是本次从教务页面读取的结构化课程安排。确认后才会替换手机中已保存的课表。</text>

        <view class="import-summary">
          <view><text class="number">{{ courseCount }}</text><text>门课程</text></view>
          <view><text class="number">{{ meetingCount }}</text><text>个上课时段</text></view>
          <view><text class="number">{{ importedMaxWeek }}</text><text>最晚教学周</text></view>
        </view>

        <view class="preview-section">
          <view class="section-heading"><text>读取到的课程</text><text>{{ courseCount }} 门</text></view>
          <view v-for="(course, index) in previewCourses" :key="`${course.code || course.name}|${index}`" class="course-preview-row"><view class="course-preview-dot" /><view><text>{{ course.name }}</text><text>{{ course.teacher || '教师待确认' }} · {{ course.isDegreeCourse === true ? '学位课' : course.isDegreeCourse === false ? '非学位课' : '学位类型待确认' }}{{ course.exam ? ' · ' + course.exam : ' · 考试方式待确认' }} · {{ course.meetings.length }} 个时段</text></view></view>
        </view>

        <view v-if="importResult?.failures.length" class="partial-note"><AppIcon name="info" :size="18" color="#A1814E" /><view><text>有 {{ importResult.failures.length }} 项课程信息未完整读取</text><text v-for="failure in importResult.failures" :key="failure">{{ failure }}</text></view></view>
        <view v-if="importResult?.warnings?.length" class="partial-warning"><AppIcon name="info" :size="18" color="#527DA8" /><view><text>补查说明</text><text v-for="warning in importResult.warnings" :key="warning">{{ warning }}</text></view></view>

        <view class="form-section">
          <text class="section-heading standalone">确认学期设置</text>
          <text class="form-hint">第一教学周的起始日必须是周一。教务页面通常不能稳定提供这一日期，请按学校校历核对。</text>
          <text class="field-label">学期名称</text><input v-model="semesterName" class="field-input" maxlength="60" aria-label="学期名称" />
          <text class="field-label">第一教学周周一</text><input v-model="semesterMonday" class="field-input number" maxlength="10" placeholder="2026-08-31" aria-label="第一教学周周一" />
          <text class="field-label">教学周数</text><input v-model="semesterWeeks" class="field-input number" type="number" maxlength="2" aria-label="教学周数" />
          <text class="field-label">校区</text><input v-model="campus" class="field-input" maxlength="60" aria-label="校区" />
          <text v-if="saveError" class="save-error">{{ saveError }}</text>
        </view>

        <view class="save-note"><AppIcon name="shield" :size="18" color="#6E9684" /><text>确认保存后，课程会以本地 JSON 数据保存；登录会话不会保存。</text></view>
        <button class="primary-button" @click="savePreview">确认并保存到手机<AppIcon name="check" :size="18" color="white" /></button>
        <button class="retry-button" @click="backToIntro">放弃本次结果，重新读取</button>
      </view>
    </scroll-view>
    </view>

    <!-- #ifdef APP-PLUS -->
    <web-view v-if="webviewMounted" :src="browserSrc" :webview-styles="browserWebviewStyles" @error="onWebError" />
    <view class="native-browser-bar" :style="{ opacity: browserOpen ? 1 : 0, pointerEvents: browserOpen ? 'auto' : 'none' }">
      <view class="browser-message"><view class="browser-status-dot" :class="{ reading }" /><text>{{ browserMessage }}</text></view>
      <view class="browser-control-row"><view class="browser-mode-switch"><button :class="{ active: displayMode === 'mobile' }" :disabled="modeChanging" @tap.stop="switchDisplayMode('mobile')">手机</button><button :class="{ active: displayMode === 'desktop' }" :disabled="modeChanging" @tap.stop="switchDisplayMode('desktop')">电脑</button></view><view class="browser-actions"><button class="native-cancel" :disabled="modeChanging" @click="finishLogin">结束</button><button class="native-read" :disabled="reading || modeChanging" @click="readSchedule">{{ reading ? '读取中' : '读取当前课表' }}</button></view></view>
    </view>
    <!-- #endif -->
  </view>
</template>



<script setup lang="ts">
import { computed, getCurrentInstance, onUnmounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'
import { useScheduleStore } from '../stores/schedule'
import {
  buildScheduleFromUcasImport,
  clearNativeImportHandoff,
  createUcasProgressBlurHideScript,
  createUcasProgressBlurScript,
  createUcasProgressOverlayHideScript,
  createUcasProgressOverlayScript,
  isUcasCourseDetailUrl,
  isUcasCourseSiteUrl,
  isUcasCourseUrl,
  UCAS_SEP_LOGIN_URL,
  type UcasProgressOverlayState,
  type ValidatedUcasImport,
} from '../import/ucas'
import { createUcasImportSession, type UcasImportSession, type UcasImportWebview } from '../import/ucas-import-session'
import { UcasWebviewManager } from '../import/ucas-webview'

const props = defineProps<{ embedded?: boolean; hostInstance?: unknown }>()
const emit = defineEmits<{ close: [] }>()
const embedded = computed(() => Boolean(props.embedded))
const store = useScheduleStore()
const instance = props.hostInstance || getCurrentInstance()
const isApp = ref(false)
const browserOpen = ref(false)
const webviewMounted = ref(false)
const reading = ref(false)
const modeChanging = ref(false)
const displayMode = ref<'desktop' | 'mobile'>('mobile')
const stage = ref<'intro' | 'preview'>('intro')
const importResult = ref<ValidatedUcasImport | null>(null)
const webError = ref('')
const readingStatus = ref('在教务中打开“选修课程”或“个人课表”，然后点击读取。')
const importProgress = ref<UcasProgressOverlayState>({ value: 0, phase: 'starting', label: '准备开始读取' })
const saveError = ref('')
const loginUrl = ref(UCAS_SEP_LOGIN_URL)
const browserSrc = ref(UCAS_SEP_LOGIN_URL)
const importHeaderTopSpacing = 12
let webTop = '60px'
let webBottom = '92px'

/* #ifdef APP-PLUS */
isApp.value = true
const nativeSystemInfo = uni.getSystemInfoSync() as unknown as { statusBarHeight?: number; safeAreaInsets?: { bottom?: number } }
webTop = String((nativeSystemInfo.statusBarHeight || 0) + 60 + importHeaderTopSpacing) + 'px'
webBottom = String(92 + (nativeSystemInfo.safeAreaInsets?.bottom || 0)) + 'px'
/* #endif */

const browserWebviewStyles = { top: webTop, bottom: webBottom, left: '0px', right: '0px', opacity: 1, scalable: false, softinputMode: 'adjustResize' }
const platformNote = isApp.value
  ? '请在 App 内完成 SEP 登录，并从选课系统打开“选修课程”或“个人课表”。读取前可以先核对登录状态。'
  : '网页预览不接入学校登录。真实导入需要在 HBuilderX 运行到 Android 手机后验证。'
const steps = [
  { title: '登录学校教务', description: '在内置学校网页完成 SEP 登录和必要验证，进入选课系统。' },
  { title: '读取课程信息', description: '从选修课程表读取课程代码、主讲教师、学位课和考试方式。' },
  { title: '读取上课安排', description: '从个人课表和课程详情读取地点、星期、节次和周次。' },
  { title: '核对后保存到手机', description: '确认结果与学期起始周；断网和重启后仍可查看。' },
]
const courseCount = computed(() => importResult.value?.courses.length || 0)
const meetingCount = computed(() => importResult.value?.courses.reduce((total, course) => total + course.meetings.length, 0) || 0)
const importedMaxWeek = computed(() => {
  let maxWeek = 0
  for (const course of importResult.value?.courses || []) for (const meeting of course.meetings) for (const week of meeting.weeks) maxWeek = Math.max(maxWeek, week)
  return maxWeek
})
const previewCourses = computed(() => importResult.value?.courses || [])
const browserMessage = computed(() => webError.value || (reading.value ? readingStatus.value : '在教务中打开“选修课程”或“个人课表”，然后点击读取。'))
const now = new Date()
const DEFAULT_SEMESTER_MONDAY = '2026-08-31'
const semesterMonday = ref(DEFAULT_SEMESTER_MONDAY)
const semesterName = ref(defaultSemesterName(now))
const semesterWeeks = ref('20')
const campus = ref('雁栖湖校区')
let webviewManager: UcasWebviewManager | null = null
let importSession: UcasImportSession | null = null
let disposeTimer: ReturnType<typeof setTimeout> | undefined
let modeTimer: ReturnType<typeof setTimeout> | undefined

function localISO(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return String(year) + '-' + month + '-' + day
}
function mondayFor(date: Date): string {
  const copy = new Date(date)
  copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7))
  return localISO(copy)
}
function defaultSemesterName(date: Date): string {
  return String(date.getFullYear()) + ' ' + (date.getMonth() >= 6 ? '秋季' : '春季') + '学期'
}
function isPersonalSchedulePage(value: string): boolean {
  try {
    const url = new URL(value)
    return isUcasCourseSiteUrl(value) && /^\/course\/personSchedule(?:;[^/?#]*)?\/?$/i.test(decodeURIComponent(url.pathname))
  } catch { return /^https:\/\/(?:xkgo\.ucas\.ac\.cn:3000|xkgodj\.ucas\.ac\.cn)\/course\/personSchedule(?:[/?#]|$)/i.test(value) }
}
function isSelectedCoursePage(value: string): boolean {
  try {
    const url = new URL(value)
    return isUcasCourseSiteUrl(value) && /^\/courseManage\/selectedCourse(?:;[^/?#]*)?\/?$/i.test(decodeURIComponent(url.pathname))
  } catch { return /^https:\/\/(?:xkgo\.ucas\.ac\.cn:3000|xkgodj\.ucas\.ac\.cn)\/courseManage\/selectedCourse(?:[/?#]|$)/i.test(value) }
}
function isCourseEntryPage(value: string): boolean {
  return isUcasCourseSiteUrl(value)
}
function isSepPage(value: string): boolean {
  try { const url = new URL(value); return url.protocol === 'https:' && url.origin.toLowerCase() === 'https://sep.ucas.ac.cn' } catch { return /^https:\/\/sep\.ucas\.ac\.cn(?:[/?#]|$)/i.test(value) }
}
function isSepPortalPage(value: string): boolean {
  try { const url = new URL(value); return isSepPage(value) && /^\/portal\/site\//i.test(url.pathname) } catch { return /^https:\/\/sep\.ucas\.ac\.cn\/portal\/site\//i.test(value) }
}
function isBrowserUrl(value: string): boolean { return isUcasCourseSiteUrl(value) || isUcasCourseUrl(value) || isSepPage(value) }
function desktopViewportScript(): string {
  return ';(function(){try{var c="width=1200, initial-scale=0.32, minimum-scale=0.25, maximum-scale=5, user-scalable=yes",v=document.querySelector("meta[name=viewport]"),h=document.head||document.getElementsByTagName("head")[0];if(!v&&h){v=document.createElement("meta");v.name="viewport";h.appendChild(v)}if(v)v.setAttribute("content",c)}catch(_){}})();'
}
function currentWebview(): UcasImportWebview | null { return webviewManager?.current() || null }
function progressOverlayScript(progress: UcasProgressOverlayState = importProgress.value): string {
  return createUcasProgressOverlayScript({ ...progress, reducedMotion: store.reducedMotion })
}
function showPageProgressVeil(webview: UcasImportWebview | null = currentWebview()): void {
  if (!webview?.evalJS) return
  try { webview.evalJS(createUcasProgressBlurScript()) } catch { /* the document may be replacing itself */ }
}
function hidePageProgressVeil(webview: UcasImportWebview | null = currentWebview()): void {
  if (!webview?.evalJS) return
  try {
    webview.evalJS(createUcasProgressBlurHideScript())
    webview.evalJS(createUcasProgressOverlayHideScript())
  } catch { /* the document may already be gone */ }
}
function showProgressOverlay(webview: UcasImportWebview | null = currentWebview(), progress: UcasProgressOverlayState = importProgress.value): void {
  const script = progressOverlayScript(progress)
  const nativeOverlay = webviewManager?.setProgressOverlay(script) ?? false
  // The manager owns persistent native blur / document-start injection; the
  // ordinary page-local fallback is only used without a manager.
  if (webviewManager) webviewManager.setReadingBlur(true, webview)
  else showPageProgressVeil(webview)
  if (nativeOverlay) {
    // Remove only a previous fallback indicator; retain the website blur.
    try { webview?.evalJS?.(createUcasProgressOverlayHideScript()) } catch { /* document may be navigating */ }
  } else {
    if (webview?.evalJS) {
      try { webview.evalJS(script) } catch { /* the document may be replacing itself */ }
    }
  }
}
function hideProgressOverlay(webview: UcasImportWebview | null = currentWebview()): void {
  webviewManager?.setReadingBlur(false)
  webviewManager?.hideProgressOverlay(createUcasProgressOverlayHideScript())
  // Clear every visited child, including a hidden page that may later be reused.
  for (const child of new Set([webview, ...(webviewManager?.list() || [])])) hidePageProgressVeil(child)
}
function safelyUpdateReadingEffect(update: () => void): void {
  try { update() } catch { /* visual effects are optional and must not stop timetable reading */ }
}
function showImportError(message: string): void {
  const previous = webError.value
  webError.value = message
  if (message && message !== previous && browserOpen.value) uni.showModal({ title: '无法读取课表', content: message, showCancel: false })
}
function releaseBrowserWebview(): void {
  browserOpen.value = false
  if (disposeTimer) clearTimeout(disposeTimer)
  webviewManager?.hideAll()
  disposeTimer = setTimeout(() => {
    disposeTimer = undefined
    if (browserOpen.value || reading.value) return
    webviewMounted.value = false
    webviewManager?.release()
  }, 360)
}
function initializeServices(): void {
  if (webviewManager || !instance) return
  webviewManager = new UcasWebviewManager({
    instance,
    top: webTop,
    bottom: webBottom,
    isOpen: () => browserOpen.value,
    mode: () => displayMode.value,
    phase: () => importSession?.currentPhase || null,
    hasDetail: () => Boolean(importSession?.hasActiveDetail),
    isBrowserUrl,
    isPersonalUrl: isPersonalSchedulePage,
    isSelectedUrl: isSelectedCoursePage,
    isEntryUrl: isCourseEntryPage,
    isDetailUrl: isUcasCourseDetailUrl,
    isPortalUrl: isSepPortalPage,
    onLoading: (webview) => {
      if (reading.value) safelyUpdateReadingEffect(() => showProgressOverlay(webview))
      if (displayMode.value === 'desktop') {
        try { webview.evalJS?.(desktopViewportScript()) } catch { /* the document may be replacing itself */ }
      }
    },
    onLoaded: (webview) => {
      if (reading.value) safelyUpdateReadingEffect(() => showProgressOverlay(webview))
      importSession?.handleLoaded(webview)
    },
  })
  importSession = createUcasImportSession({
    getWebview: currentWebview,
    isCourseUrl: url => isUcasCourseSiteUrl(url) || isUcasCourseUrl(url),
    isPersonalSchedulePage,
    isSelectedCoursePage,
    isCourseEntryPage,
    isSepPage,
    isSepPortalPage,
    installPortalDocumentStartScript: () => webviewManager?.scheduleSetup(),
    removePortalDocumentStartScript: () => { /* preloads stay installed for following documents */ },
    clearHandoff: clearNativeImportHandoff,
    readHandoff: () => {
      try {
        const storage = (globalThis as typeof globalThis & { plus?: { storage?: { getItem?: (key: string) => string | null } } }).plus?.storage
        const raw = storage?.getItem?.('__lakeside_ucas_import_v1__')
        return raw ? JSON.parse(raw) : undefined
      } catch { return undefined }
    },
    handoffAvailable: () => Boolean((globalThis as typeof globalThis & { plus?: { storage?: unknown } }).plus?.storage),
    prepareReadingSurface: webview => webviewManager?.prepareReadingSurface(webview) ?? Promise.resolve(false),
    setReading: value => {
      reading.value = value
      if (value) {
        importProgress.value = { value: 0, phase: 'starting', label: '准备开始读取' }
        safelyUpdateReadingEffect(() => showProgressOverlay())
      }
      else safelyUpdateReadingEffect(() => hideProgressOverlay())
    },
    setProgress: value => {
      importProgress.value = value
      if (reading.value) safelyUpdateReadingEffect(() => showProgressOverlay(undefined, value))
    },
    setStatus: value => { readingStatus.value = value },
    setError: showImportError,
    onResult: result => {
      importResult.value = result
      saveError.value = ''
      stage.value = 'preview'
      releaseBrowserWebview()
    },
  })
}
function startLogin(): void {
  initializeServices()
  importSession?.cancel()
  importResult.value = null
  saveError.value = ''
  webError.value = ''
  loginUrl.value = UCAS_SEP_LOGIN_URL
  browserSrc.value = UCAS_SEP_LOGIN_URL
  if (disposeTimer) clearTimeout(disposeTimer)
  webviewMounted.value = true
  browserOpen.value = true
  webviewManager?.open()
}
function finishLogin(): void {
  modeChanging.value = false
  if (modeTimer) clearTimeout(modeTimer)
  importSession?.cancel()
  webError.value = ''
  readingStatus.value = '在教务中打开“选修课程”或“个人课表”，然后点击读取。'
  browserOpen.value = false
  webviewManager?.hideAll()
  if (disposeTimer) clearTimeout(disposeTimer)
  disposeTimer = setTimeout(() => {
    disposeTimer = undefined
    if (browserOpen.value) return
    webviewMounted.value = false
    webviewManager?.release()
    webviewManager?.restoreUserAgent()
    browserSrc.value = UCAS_SEP_LOGIN_URL
  }, 360)
}
function onWebError(): void {
  if (reading.value) importSession?.handleWebError()
  else if (browserOpen.value) webError.value = '学校页面加载失败，请检查网络后重新打开。'
}
function switchDisplayMode(mode: 'desktop' | 'mobile'): void {
  if (modeChanging.value) return
  if (reading.value) { uni.showToast({ title: '课程读取中，请完成后再切换显示模式', icon: 'none' }); return }
  if (displayMode.value === mode) return
  modeChanging.value = true
  displayMode.value = mode
  webError.value = ''
  const ok = webviewManager?.setMode(mode, true) ?? false
  if (!ok) webError.value = '无法切换学校网页显示模式，请重新打开导入页面。'
  if (modeTimer) clearTimeout(modeTimer)
  modeTimer = setTimeout(() => { modeTimer = undefined; modeChanging.value = false }, 450)
}
function readSchedule(): void {
  webError.value = ''
  readingStatus.value = '正在检查教务页面…'
  try {
    initializeServices()
    if (!importSession) { showImportError('读取服务尚未初始化，请关闭导入页面后重新打开。'); return }
    importSession.start()
  } catch {
    safelyUpdateReadingEffect(() => importSession?.cancel())
    showImportError('读取启动失败，请关闭导入页面后重试。')
  }
}
function savePreview(): void {
  if (!importResult.value) return
  saveError.value = ''
  try {
    const schedule = buildScheduleFromUcasImport(importResult.value, {
      monday: semesterMonday.value,
      semesterName: semesterName.value,
      semesterWeeks: Number(semesterWeeks.value),
      campus: campus.value,
    })
    if (!store.replaceSchedule(schedule)) { saveError.value = '无法写入手机本地存储。请检查设备存储空间后重试。'; return }
    uni.showToast({ title: '课表已保存', icon: 'success' })
    setTimeout(() => { webviewManager?.release(); webviewManager?.restoreUserAgent(); uni.reLaunch({ url: '/pages/index/index' }) }, 350)
  } catch (error) { saveError.value = error instanceof Error ? error.message : '学期设置有误，请检查后重试。' }
}
function backToIntro(): void { importResult.value = null; saveError.value = ''; stage.value = 'intro' }
function handleBackPress(): boolean {
  if (browserOpen.value) { finishLogin(); return true }
  if (stage.value === 'preview') { backToIntro(); return true }
  if (embedded.value) { emit('close'); return true }
  return false
}
function goBack(): void { if (!handleBackPress()) emit('close') }
defineExpose({ handleBackPress, goBack })
initializeServices()
onUnmounted(() => {
  importSession?.cancel()
  webviewManager?.release()
  webviewManager?.restoreUserAgent()
  if (disposeTimer) clearTimeout(disposeTimer)
  if (modeTimer) clearTimeout(modeTimer)
})
</script>
<style scoped lang="scss">
.import-page { height:100%; height:100dvh; max-width:480px; margin:0 auto; display:flex; flex-direction:column; background:#f6f8fc; padding-top:calc(12px + var(--status-bar-height, 0px)); position:relative; }
.import-page.embedded { height:100%; max-width:none; margin:0; }
.import-header { height:60px; flex-shrink:0; display:flex; align-items:center; justify-content:space-between; padding:0 16px; font-size:14px; font-weight:600; letter-spacing:.2px; }
.back-button,.header-spacer { width:44px; height:44px; display:flex; align-items:center; justify-content:center; }
.import-scroll-region { flex:1; min-height:0; position:relative; overflow:hidden; }
.import-scroll { position:absolute; top:0; right:0; bottom:0; left:0; width:100%; height:100%; }
.import-content { padding:30px 28px calc(32px + env(safe-area-inset-bottom)); min-height:100%; }
.intro-content { display:flex; flex-direction:column; padding-top:2px; }
.import-art { width:100%; height:auto; margin:0 auto 10px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; }
.art-divider { height:1px; width:36px; background:#d0deeb; }.import-art text { font-size:7px; letter-spacing:1.2px; color:#89a0b5; }
.import-title { display:block; font-size:24px; font-weight:650; text-align:center; }.import-subtitle { display:block; margin-top:8px; color:#8b9aaa; font-size:12px; line-height:1.7; text-align:center; }
.steps { margin:22px 0 16px; }.step { display:flex; gap:12px; margin-bottom:16px; }.step-number { width:28px; height:28px; border:1px solid #dfe8f1; border-radius:9px; color:#527DA8; font-size:12px; display:flex; align-items:center; justify-content:center; flex-shrink:0; background:#fff; }.step-title { font-size:14px; font-weight:600; line-height:28px; }.step-description { display:block; color:#8899aa; font-size:11px; line-height:1.7; margin-top:2px; }
.privacy-note,.status-note,.partial-note,.save-note { display:flex; gap:10px; align-items:flex-start; padding:12px; border-radius:12px; font-size:11px; line-height:1.7; margin-bottom:10px; }.privacy-note { background:#eaf2ee; color:#6b8c7d; }.status-note { border:1px solid #e2e9f1; color:#8999aa; margin-bottom:16px; }.privacy-note .app-icon,.status-note .app-icon,.partial-note .app-icon,.save-note .app-icon { margin-top:2px; }
.display-mode-card { margin:-6px 0 14px; padding:12px; border:1px solid #dce7f0; border-radius:14px; background:#edf3f8; }.display-mode-title { display:block; color:#526f8c; font-size:12px; font-weight:600; }.display-mode-copy { display:block; margin-top:4px; color:#8093a5; font-size:10px; line-height:1.7; }.display-mode-options { display:flex; gap:8px; margin-top:10px; }.display-mode-options button { flex:1; min-height:48px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; border:1px solid #dce5ee !important; border-radius:10px; color:#8494a5; background:#ffffffa8 !important; font-size:11px; }.display-mode-options button text:last-child { font-size:9px; opacity:.75; }.display-mode-options button.active { color:#ffffff; border-color:#527DA8 !important; background:#527DA8 !important; }
.import-footer { display:block; text-align:center; font-size:10px; color:#a0adbb; margin-top:14px; }
.review-mark { display:flex; align-items:center; gap:13px; margin:4px 0 15px; }.review-icon { width:44px; height:44px; display:flex; justify-content:center; align-items:center; border-radius:15px; background:#e7eff7; }.review-eyebrow { display:block; color:#527DA8; font-size:10px; letter-spacing:.8px; }.review-title { display:block; margin-top:4px; font-size:21px; font-weight:650; }.review-copy { display:block; font-size:12px; color:#7f90a2; line-height:1.8; }
.import-summary { display:flex; justify-content:space-between; padding:19px 8px; margin:21px 0; border-top:1px solid #e6edf4; border-bottom:1px solid #e6edf4; }.import-summary view { display:flex; flex:1; flex-direction:column; align-items:center; gap:7px; border-right:1px solid #edf1f5; }.import-summary view:last-child { border:0; }.import-summary text:first-child { font-size:22px; color:#527DA8; font-weight:600; }.import-summary text:last-child { font-size:9px; color:#8c9aaa; }
.preview-section,.form-section { margin-top:24px; }.section-heading { display:flex; justify-content:space-between; align-items:center; font-size:13px; font-weight:600; margin-bottom:12px; }.section-heading text:last-child { color:#91a0b1; font-size:10px; font-weight:400; }.section-heading.standalone { display:block; margin-bottom:9px; }
.course-preview-row { display:flex; align-items:center; gap:10px; padding:12px 0; border-bottom:1px solid #edf1f5; }.course-preview-dot { width:6px; height:6px; flex-shrink:0; border-radius:50%; background:#8aacc8; }.course-preview-row>view:last-child { min-width:0; }.course-preview-row text { display:block; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; font-size:12px; }.course-preview-row text:last-child { margin-top:4px; color:#8d9baa; font-size:10px; }.more-courses { display:block; padding-top:12px; font-size:10px; color:#8798a9; }
.partial-note { margin-top:20px; background:#fbf3e5; color:#94734d; }.partial-warning { margin-top:10px; background:#edf4fa; color:#607d98; }.partial-note>view,.partial-warning>view { min-width:0; flex:1; }.partial-note text,.partial-warning text { display:block; font-size:10px; line-height:1.65; white-space:normal; overflow-wrap:anywhere; }.partial-note text:first-child,.partial-warning text:first-child { font-size:11px; margin-bottom:4px; font-weight:600; }
.form-hint { display:block; font-size:10px; color:#8a99a9; line-height:1.8; margin-bottom:16px; }.field-label { display:block; font-size:11px; color:#8292a4; margin:15px 0 8px; }.field-input { width:100%; height:46px; border:1px solid #e3eaf2; border-radius:11px; background:#fff; padding:0 13px; font-size:14px; }.save-error { display:block; color:#b35f50; font-size:11px; line-height:1.7; margin-top:14px; }
.save-note { margin:25px 0 14px; background:#eaf2ee; color:#6b8c7d; }.retry-button { width:100%; min-height:44px; margin-top:7px; color:#718096; font-size:12px; }
.native-browser-bar { position:fixed; z-index:2; left:0; right:0; bottom:0; min-height:calc(92px + env(safe-area-inset-bottom)); display:flex; flex-direction:column; justify-content:flex-start; gap:8px; padding:10px 16px calc(10px + env(safe-area-inset-bottom)); background:#ffffff; border-top:1px solid #e5edf4; box-shadow:0 -8px 24px #45627a0c; }.browser-message { display:flex; align-items:center; gap:8px; min-height:21px; color:#778899; font-size:10px; line-height:1.5; }.browser-status-dot { width:6px; height:6px; border-radius:50%; background:#9db4c8; flex-shrink:0; }.browser-status-dot.reading { background:#527DA8; animation:pulse 1.1s ease-in-out infinite; }.browser-control-row,.browser-actions,.browser-mode-switch { display:flex; align-items:center; }.browser-control-row { gap:8px; min-height:42px; }.browser-mode-switch { flex-shrink:0; gap:2px; padding:2px; border-radius:12px; background:#edf2f7; }.browser-mode-switch button { width:42px; height:38px; display:flex; align-items:center; justify-content:center; border-radius:10px; color:#7b8d9f; font-size:10px; line-height:1; }.browser-mode-switch button.active { color:#527DA8; background:#ffffff; box-shadow:0 1px 4px #44617614; }.browser-actions { flex:1; align-self:stretch; gap:8px; }.browser-actions button { min-height:42px; display:flex !important; align-items:center !important; justify-content:center !important; border-radius:12px; font-size:12px; line-height:1 !important; }.native-cancel { width:58px; color:#718096; border:1px solid #e5ecf3 !important; }.native-read { flex:1; background:#527DA8 !important; color:white; font-weight:600; }
@keyframes pulse { 50% { transform:scale(1.6); opacity:.4; } }
.import-page.embedded .native-browser-bar { position:absolute; }
@media (min-width:600px) { .import-page { border-left:1px solid #dfe7ef; border-right:1px solid #dfe7ef; } }
</style>
