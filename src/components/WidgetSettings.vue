<template>
  <view class="widget-settings" :class="{ quiet: store.reducedMotion }">
    <view v-if="state.supported && state.instances.length && state.courseRefreshNeedsPermission" class="course-refresh-permission">
      <text>系统可能延后刷新。允许「闹钟和提醒」可启用上下课精确定时。</text>
      <button @click="enableCourseRefresh">开启权限</button>
    </view>
    <view class="widget-showcase">
      <view class="style-heading">
        <view class="style-copy"><text class="style-title">今日课表 · 宽松版</text><text>当天全部课程，可滚动查看。</text></view>
        <button class="add-widget" role="button" tabindex="0" aria-label="添加宽松版小组件" title="添加宽松版小组件" :disabled="busy" @click="add('large')" @keydown.enter.prevent="add('large')" @keydown.space.prevent="add('large')"><AppIcon name="plus" :size="22" color="#426b8e" /></button>
      </view>
      <view class="widget-preview detailed-preview" aria-label="宽松版课表样式示意">
        <view class="detailed-header"><text>2026/10/12</text><text>明日 · 更新于16:00 ↻</text></view>
        <text class="detailed-subtitle">研一秋 · 第6周 · 周一</text>
        <view v-for="course in detailedPreviewCourses" :key="course.name" class="detailed-course" :class="{ ended: course.status === 'ended' }" :style="{ background: course.background }">
          <view class="detailed-times"><text>{{ course.start }}</text><text>{{ course.end }}</text></view>
          <view class="detailed-content">
            <view class="preview-title"><view class="preview-status"><view class="status-light" :class="{ 'is-ended': course.status === 'ended', 'is-pending': course.status === 'pending' }" /></view><text class="detailed-name">{{ course.name }}</text></view>
            <view class="detailed-meta"><text v-for="(part, partIndex) in visualMeta(course.meta)" :key="partIndex" :class="{ 'meta-hanzi': part.hanzi }">{{ part.text }}</text></view>
          </view>
        </view>
        <text class="detailed-footer">今日还有2堂课 ›</text>
      </view>
      <view class="style-heading compact-style-heading">
        <view class="style-copy compact-style-copy"><text class="style-title">当前课程 · 紧凑版</text><text>一行最多两堂，两行最多四堂；每增加一行，多显示两堂。</text></view>
        <button class="add-widget" role="button" tabindex="0" aria-label="添加紧凑版小组件" title="添加紧凑版小组件" :disabled="busy" @click="add('small')" @keydown.enter.prevent="add('small')" @keydown.space.prevent="add('small')"><AppIcon name="plus" :size="22" color="#426b8e" /></button>
      </view>
      <view v-for="size in previewSizes" :key="size.rows" class="widget-preview compact single-line" :class="{ 'four-line': size.rows === 2 }" :aria-label="size.rows === 1 ? '紧凑版一行两堂课程样式示意' : '紧凑版两行四堂课程样式示意'">
        <view class="single-topline">
          <view class="single-calendar"><text>10/12 周一</text><text>第6周</text></view>
          <view class="single-actions"><text class="single-remaining">余3堂</text><text class="single-refresh">更新于08:00 ↻</text></view>
        </view>
        <view class="single-course-list">
          <view v-if="size.rows === 1" class="single-one-top-gap" />
          <view v-if="size.rows === 2" class="single-edge-gap" />
          <template v-for="(course, index) in previewCourses.slice(0, size.count)" :key="course.name">
          <view v-if="size.rows === 2 && index > 0" class="single-course-gap" />
          <view class="single-course" :class="{ second: index === 1 }" :style="{ 'border-left-color': course.color }">
            <view><view class="preview-status"><view class="status-light" :class="{ 'is-pending': index > 0 }" /></view><text v-if="course.day" class="single-course-day">{{ course.day }}</text><text class="single-name">{{ course.name }}</text></view>
            <view v-if="size.rows === 2" class="single-line-gap" />
            <view class="single-meta"><text v-for="(part, partIndex) in visualMeta(course.meta)" :key="partIndex" :class="{ 'meta-hanzi': part.hanzi }">{{ part.text }}</text></view>
          </view>
          </template>
          <view v-if="size.rows === 2" class="single-edge-gap" />
          <view v-if="size.rows === 1" class="single-one-bottom-gap" />
        </view>
      </view>
    </view>

    <view v-if="state.supported" class="instance-section">
      <view class="instance-heading"><text class="style-title">桌面上的组件</text><button class="instance-refresh" :disabled="busy" aria-label="刷新组件列表" @click="reload"><AppIcon name="refresh" :size="20" color="#527da8" /></button></view>
      <text v-if="!state.instances.length" class="empty-instances">还没有添加小组件。</text>
      <view v-else class="instance-list" role="group" aria-label="选择桌面小组件">
        <button v-for="item in state.instances" :key="item.id" class="instance-item" :class="{ selected: selectedId === item.id }" role="button" tabindex="0" :aria-pressed="selectedId === item.id"
          @click="selectedId = item.id" @keydown.enter.prevent="selectedId = item.id" @keydown.space.prevent="selectedId = item.id">
          <text>{{ item.kind === 'large' ? '宽松版' : '紧凑版' }} · {{ item.id }}</text>
          <AppIcon v-if="selectedId === item.id" name="check" :size="17" color="#426b8e" />
        </button>
      </view>
      <view v-if="selected" class="instance-options">
        <text v-if="state.nextCourseRefresh" class="next-course-refresh">下次预约刷新 · {{ state.nextCourseRefresh }}</text>
        <button v-for="option in displayOptions" :key="option.key" class="option-row" role="switch" :aria-label="option.label" :aria-checked="selected.options[option.key]" :disabled="busy" @click="toggle(option.key)">
          <text>{{ option.label }}</text><view class="widget-switch" :class="{ on: selected.options[option.key] }"><view /></view>
        </button>
        <view class="opacity-row"><view><text>背景不透明度（共用）</text><text>{{ selected.options.opacity }}%</text></view><slider :value="selected.options.opacity" :min="60" :max="100" :step="5" activeColor="#527da8" backgroundColor="#e7edf4" :block-size="20" :disabled="busy" @change="changeOpacity" /></view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { useScheduleStore } from '../stores/schedule'
import { getWidgetState, openCourseRefreshSettings, requestPinWidget, updateWidgetOptions, widgetSyncStatus } from '../services/widget-sync'
import type { WidgetKind, WidgetOptions } from '../domain/widget'
import { widgetAvailabilityMessage, widgetPinFeedback, type WidgetNoticePayload } from '../domain/widget-guide'
function visualMeta(value: string): { text: string; hanzi: boolean }[] {
  return (value.match(/[㐀-鿿]+|[^㐀-鿿]+/g) || []).map(text => ({ text, hanzi: /^[㐀-鿿]/.test(text) }))
}
const previewSizes = [{ rows: 1, count: 2 }, { rows: 2, count: 4 }]
const detailedPreviewCourses = [
  { name: '学术写作', start: '15:25', end: '17:00', meta: '教二楼201 · 李志红', background: '#dcedea', status: 'active' },
  { name: '机器学习', start: '18:30', end: '21:00', meta: '教一楼207 · 周晓飞等', background: '#e7e1f2', status: 'pending' },
  { name: '人工智能原理', start: '08:30', end: '11:10', meta: '教二楼101 · 缪青海', background: '#eceef0', status: 'ended' },
]
const previewCourses = [
  { name: '学术写作', meta: '15:25–17:00 · 教二楼201 · 李志红', day: '', color: '#a89bc9' },
  { name: '机器学习', meta: '18:30–21:00 · 教一楼207 · 周晓飞等', day: '明日', color: '#78aaa0' },
  { name: '人工智能原理', meta: '08:30–11:10 · 教二楼101 · 缪青海', day: '10/14', color: '#7fa8d2' },
  { name: '学术英语', meta: '13:30–15:10 · 教二楼102 · 任课教师', day: '10/14', color: '#cea581' },
]
const props = defineProps<{ widgetId?: number; visible: boolean }>()
const emit = defineEmits<{ notice: [value: WidgetNoticePayload] }>()
const store = useScheduleStore()
const state = ref(getWidgetState())
const syncStatus = widgetSyncStatus
const selectedId = ref(props.widgetId)
const busy = ref(false)
const syncBusy = computed(() => busy.value || syncStatus.value.state === 'syncing')
const requested = ref<{ kind: WidgetKind; previousIds: number[] } | null>(null)
function deviceBrand(): string { try { return uni.getSystemInfoSync().brand || '' } catch { return '' } }
const selected = computed(() => state.value.instances.find(item => item.id === selectedId.value))
type DisplayOption = 'showTeachers' | 'showLocation' | 'showSections'
const displayOptions = computed<{ key: DisplayOption; label: string }[]>(() => [
  { key: 'showTeachers', label: '任课教师' }, { key: 'showLocation', label: '上课地点' },
  ...(selected.value?.kind === 'large' ? [{ key: 'showSections' as const, label: '上课节次' }] : []),
])
function reload(): void {
  state.value = getWidgetState()
  if (!state.value.instances.some(item => item.id === selectedId.value)) selectedId.value = state.value.instances[0]?.id
  if (requested.value && state.value.instances.some(item => item.kind === requested.value!.kind && !requested.value!.previousIds.includes(item.id))) {
    const kind = requested.value.kind
    requested.value = null
    emit('notice', { title: '已添加到桌面', message: `${kind === 'large' ? '宽松版' : '紧凑版'}小组件已就位。回到桌面即可查看。`, tone: 'success' })
  }
}
function enableCourseRefresh(): void {
  if (!openCourseRefreshSettings()) {
    emit('notice', { title: '无法打开系统设置', message: '请在系统设置的「闹钟和提醒」中允许湖畔课表。', tone: 'warning' })
  }
  reload()
}
function add(kind: WidgetKind): void {
  if (busy.value) return
  reload()
  requested.value = null
  busy.value = true
  try {
    // Ask while this foreground tap is active; cache synchronization must not delay the dialog.
    const result = requestPinWidget(kind)
    if (result.status === 'requested') {
      requested.value = { kind, previousIds: state.value.instances.map(item => item.id) }
      void store.reconcileWidgets()
    } else {
      const feedback = widgetPinFeedback(result, state.value, deviceBrand())
      emit('notice', { title: feedback.title, message: feedback.message, tone: result.status === 'manual' ? 'info' : 'warning' })
    }
  } finally { busy.value = false; reload() }
}
async function resync(): Promise<void> {
  if (syncBusy.value) return
  reload()
  if (!state.value.supported) {
    emit('notice', { title: '暂时无法同步', message: widgetAvailabilityMessage(state.value), tone: 'warning' })
    return
  }
  busy.value = true
  try {
    const previousStatus = syncStatus.value
    await store.reconcileWidgets(true)
    const status = syncStatus.value
    if (status === previousStatus) {
      emit('notice', { title: '未能同步', message: '未能读取已保存课表，请先在应用中确认课表。', tone: 'warning' })
      return
    }
    emit('notice', { title: status.state === 'error' ? '同步失败' : '同步完成', message: status.message, tone: status.state === 'error' ? 'warning' : 'success' })
  } catch {
    emit('notice', { title: '同步失败', message: '小组件同步失败，请稍后重试。', tone: 'warning' })
  } finally { busy.value = false; reload() }
}
async function save(options: Partial<WidgetOptions>): Promise<void> {
  if (!selected.value || busy.value) return
  const id = selected.value.id
  busy.value = true
  try { if (!await updateWidgetOptions(id, options)) emit('notice', { title: '设置未保存', message: '请检查小组件是否还在桌面上，然后重试。', tone: 'warning' }) }
  finally { busy.value = false; reload() }
}
function toggle(key: DisplayOption): void { if (selected.value) void save({ [key]: !selected.value.options[key] }) }
function changeOpacity(event: { detail: { value: number } }): void { void save({ opacity: event.detail.value }) }
watch(() => props.visible, visible => { if (visible) reload() })
watch(() => props.widgetId, id => { selectedId.value = id; reload() })
watch(() => syncStatus.value.at, () => { if (props.visible) reload() })
onMounted(reload)
defineExpose({ resync, syncBusy })
</script>

<style scoped lang="scss">
@use '../styles/status-light';
.widget-settings { display:flex; flex-direction:column; gap:22px; color:#203047; }
.course-refresh-permission { display:flex; align-items:center; flex-wrap:wrap; gap:6px 12px; padding:8px 12px; border-block:1px solid #e2eaf2; background:#edf4fa; color:#526b85; font-size:13px; }
.course-refresh-permission > text { flex:1 1 160px; }
.course-refresh-permission > button { min-height:44px; margin:0; padding:4px 8px; color:#345c84; background:transparent; font-size:13px; line-height:1.6; }
.course-refresh-permission > button::after { border:0; }
.next-course-refresh { display:block; padding:8px 0; color:#526b85; font-size:13px; }
.widget-showcase { display:flex; flex-direction:column; gap:12px; }
.widget-preview { padding:17px; background:linear-gradient(145deg,#edf4fa,#f4f8fc); border:1px solid #e2ebf4; border-radius:24px; display:flex; flex-direction:column; gap:8px; }
.preview-title { display:flex; align-items:center; gap:3px; min-width:0; line-height:1.25; }
.preview-status { display:flex; flex:0 0 19px; width:19px; height:19px; align-items:center; justify-content:center; transform:translateY(1px); }
.detailed-preview { gap:8px; }
.detailed-header { display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:13px; font-weight:600; }
.detailed-header > text:last-child { font-size:10px; font-weight:400; color:#71869d; }
.detailed-subtitle { margin-bottom:4px; font-size:11px; color:#637990; }
.detailed-course { display:flex; align-items:center; gap:10px; min-height:54px; padding:6px 10px; border-radius:14px; }
.detailed-times { display:flex; flex-shrink:0; flex-direction:column; gap:5px; font-size:11px; color:#637990; }
.detailed-content { flex:1; min-width:0; }
.detailed-name { font-size:13px; font-weight:600; min-width:0; }
.detailed-content .preview-status { flex-basis:6px; width:6px; }
.detailed-content .status-light { width:6px; height:6px; --status-halo-scale:#{status-light.halo-scale(6,5.1)}; }
.detailed-meta { margin-top:3px; color:#637990; font-size:11px; line-height:1.3; }
.detailed-course.ended .detailed-name { text-decoration:line-through; color:#8b949f; }
.detailed-footer { margin-top:3px; text-align:center; color:#71869d; font-size:11px; }
.quiet .status-light,.quiet .status-light::before { animation:none; }
.compact { border-left:5px solid #a89bc9; gap:5px; margin-top:13px; padding-top:10px; padding-bottom:10px; }
.meta-hanzi { font-size:94%; }
.single-line { border-left:0; flex-direction:column; gap:0; padding:2px 12px; margin-top:0; min-height:84px; }
.four-line { min-height:140px; padding-top:6px; padding-bottom:4px; }
.four-line .single-course-list { min-height:114px; max-height:154px; gap:0; }
.four-line .single-course { min-height:27px; flex:1 0 auto; gap:0; }
.four-line .single-course-gap { height:2px; min-height:2px; flex:1.1 0 2px; }
.four-line .single-line-gap { height:1px; min-height:1px; flex:1 0 1px; }
.four-line .single-edge-gap { height:0; flex:0.75 0 0; }
.single-topline { display:flex; align-items:center; min-height:16px; gap:5px; }
.single-calendar { display:flex; flex:1; min-width:0; align-items:center; gap:6px; font-size:9px; color:#71869d; white-space:nowrap; }
.single-calendar > text:first-child { font-size:10px; font-weight:600; color:#203047; }
.single-line:not(.four-line) .single-course-list { gap:0; }
.single-line:not(.four-line) .single-course.second { margin-top:2px; }
.single-one-top-gap { height:0; flex:1 0 0; }
.single-one-bottom-gap { height:0; flex:2 0 0; }
.single-course-list { padding-left:6px; display:flex; flex:1; flex-direction:column; justify-content:center; gap:2px; min-height:58px; }
.single-course { display:flex; min-width:0; flex-direction:column; gap:1px; border-left:3px solid #a89bc9; padding-left:7px; min-height:28px; }
.single-course.second { border-left-color:#78aaa0; }
.single-course > view { display:flex; align-items:center; gap:3px; min-width:0; }
.single-course .preview-status { flex-basis:5px; width:5px; height:14px; transform:translateY(1px); }
.single-course .status-light { width:5px; height:5px; --status-halo-scale:#{status-light.halo-scale(5,4.3)}; }
.single-course .single-name { line-height:1.17; flex:1; font-size:12px; font-weight:600; min-width:0; }
.single-course-day { flex-shrink:0; display:inline-flex; align-items:center; line-height:1.17; font-size:8.5px; color:#527da8; }
.single-course .single-meta { display:block; font-size:10px; color:#637990; line-height:1.17; }
.single-actions { display:flex; flex-shrink:0; align-items:center; gap:6px; color:#637990; font-size:9px; white-space:nowrap; }
.single-remaining { line-height:16px; }
.single-refresh { color:#71869d; font-size:9px; line-height:16px; }
.style-heading { display:flex; align-items:center; gap:8px; }
.style-copy { flex:1; min-width:0; display:flex; flex-direction:column; gap:6px; font-size:13px; color:#60748a; line-height:1.65; }
.compact-style-heading { margin-top:13px; }
.style-title { display:block; color:#203047; font-size:15px; font-weight:600; }
.add-widget { flex:0 0 44px; width:44px; height:44px; display:grid; place-items:center; }
.instance-section { display:flex; flex-direction:column; gap:13px; }
.instance-heading { display:flex; align-items:center; justify-content:space-between; }
.empty-instances { font-size:12px; color:#718096; line-height:1.7; }
.instance-refresh { display:flex; align-items:center; justify-content:flex-end; flex:0 0 44px; width:44px; height:44px; padding:0; margin:0; background:transparent; border:0; }
.instance-refresh::after { border:0; }
.instance-list,.instance-options { overflow:hidden; border-radius:var(--settings-group-radius,12px); background:#fff; }
.instance-item { display:flex; width:100%; min-height:44px; align-items:center; justify-content:space-between; padding:6px 12px; color:#536b85; font-size:13px; text-align:left; }
.instance-item + .instance-item { border-top:1px solid #e2eaf2; }
.instance-item:focus-visible,.option-row:focus-visible { outline-offset:-3px; }
.instance-item.selected { color:#315d89; font-weight:650; }
.instance-options { padding:0 12px; }
.option-row { display:flex; width:100%; align-items:center; justify-content:space-between; min-height:52px; font-size:14px; }
.option-row + .option-row { border-top:1px solid #e2eaf2; }
.widget-switch { width:42px; height:25px; border-radius:15px; background:#e3e9ef; padding:3px; transition:background-color .15s ease; }
.widget-switch > view { width:19px; height:19px; border-radius:50%; background:white; transition:transform .15s; }
.widget-switch.on { background:#527da8; }
.widget-switch.on > view { transform:translateX(17px); }
.opacity-row { border-top:1px solid #edf1f6; padding-top:16px; }
.opacity-row > view { display:flex; justify-content:space-between; font-size:13px; }
.opacity-row slider { margin:16px 0 4px; }
.quiet .widget-switch,.quiet .widget-switch > view { transition:none; }
@media(prefers-reduced-motion:reduce) { .widget-switch,.widget-switch > view { transition:none; } }
</style>
