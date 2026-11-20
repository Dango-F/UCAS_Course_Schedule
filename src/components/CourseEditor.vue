<template>
  <view class="course-editor-stage" :motion-quiet="reducedMotion" :change:motion-quiet="editorView.enter">
    <view id="course-editor" class="course-editor" role="dialog" aria-modal="true" aria-label="编辑课程" :class="{ 'course-editor-quiet': reducedMotion }" @keydown="handleKey">
      <view class="editor-header">
        <button class="editor-back" role="button" tabindex="0" :aria-label="gridEdit ? '返回课表' : '返回课程详情'" @click="requestClose"><AppIcon name="left" :size="21" color="#527da8" /></button>
        <view class="editor-heading">
          <text class="editor-title">{{ gridEdit ? gridTitle : scope === 'course' ? '编辑课程' : '调整这次上课' }}</text>
          <text class="editor-scope">{{ !gridEdit && scope === 'course' ? '整门课程 · 所有上课时段' : `第 ${target.week} 周 · 仅这一组安排` }}</text>
        </view>
        <button class="editor-save" role="button" tabindex="0" :disabled="!dirty" @click="save">保存</button>
      </view>
      <text v-if="error" class="editor-error" role="alert">{{ error }}</text>

      <scroll-view scroll-y class="editor-scroll" :scroll-into-view="scrollTarget">
        <view class="editor-body">
          <view class="editor-course-banner" :class="draft.color">
            <text class="editor-semester">{{ schedule.semester.name }}</text>
            <text class="editor-course-name">{{ draft.name.trim() || gridTitle || '课程名称' }}</text>
          </view>

          <template v-if="adjustmentRows.length">
            <text class="editor-section-title">调整前后对比</text>
            <view class="editor-card editor-comparison" role="table" aria-label="调整前后对比">
              <view class="editor-comparison-row editor-comparison-head" role="row">
                <text role="columnheader">项目</text><text role="columnheader">调整前</text><text role="columnheader">调整后</text>
              </view>
              <view v-for="row in adjustmentRows" :key="row.label" class="editor-comparison-row" role="row">
                <text class="editor-comparison-label" role="rowheader">{{ row.label }}</text>
                <text class="editor-comparison-before" role="cell">{{ row.before }}</text>
                <text :class="{ 'editor-comparison-changed': row.before !== row.after }" role="cell">{{ row.after }}</text>
              </view>
            </view>
          </template>

          <template v-if="scope === 'course' || gridEdit?.mode === 'new'">
            <text class="editor-section-title">{{ eventKind || '课程' }}资料</text>
            <view class="editor-card editor-fields">
              <view class="editor-field"><text>{{ nameLabel }}</text><input v-model="draft.name" :aria-label="nameLabel" maxlength="160" :placeholder="'输入' + nameLabel" :cursor-spacing="22" /></view>
              <view class="editor-field"><text>{{ eventKind ? '负责人' : '默认教师' }}</text><input v-model="draft.teacher" :aria-label="eventKind ? '负责人' : '默认教师'" maxlength="160" placeholder="选填" :cursor-spacing="22" /></view>
              <view v-if="!eventKind" class="editor-field"><text>考核方式</text><input v-model="draft.exam" aria-label="考核方式" maxlength="120" placeholder="选填" :cursor-spacing="22" /></view>
              <view v-if="!eventKind" class="editor-field"><text>学分</text><input v-model="draft.credits" type="digit" aria-label="学分" maxlength="6" placeholder="选填" :cursor-spacing="22" /></view>
              <view class="editor-field editor-colors">
                <text>课表颜色</text>
                <view class="editor-swatches" role="group" aria-label="课表颜色">
                  <button v-for="color in courseColors" :key="color.value" class="editor-swatch" role="button" tabindex="0" :class="[color.value, { chosen: draft.color === color.value }]" :aria-label="color.label" :aria-pressed="draft.color === color.value" @click="draft.color = color.value">
                    <AppIcon v-if="draft.color === color.value" name="check" :size="16" color="#233954" />
                  </button>
                </view>
              </view>
            </view>
          </template>

          <view class="editor-section-heading">
            <text class="editor-section-title">上课时段</text>
            <button v-if="scope === 'course'" class="editor-add" role="button" tabindex="0" @click="addMeeting()"><AppIcon name="plus" :size="15" color="#527da8" />添加时段</button>
          </view>
          <view v-for="(meeting, index) in draft.meetings" :id="'editor-meeting-' + index" :key="meeting.id" class="editor-card editor-meeting" :class="{ expanded: activeId === meeting.id }">
            <button class="editor-meeting-summary" role="button" tabindex="0" :aria-expanded="activeId === meeting.id" :aria-label="`时段 ${index + 1}，${slotSummary(meeting)}`" @click="openMeeting(meeting.id)">
              <view class="editor-day-stamp"><text>{{ courseDays[meeting.day - 1] }}</text><text v-if="meeting.kind">{{ meetingKindLabels[meeting.kind] }}</text><text v-else>时段 {{ index + 1 }}</text></view>
              <view class="editor-meeting-label">
                <text>{{ meeting.sections.length ? `第 ${compactNumbers(meeting.sections)} 节` : '待选节次' }}</text>
                <text>{{ meeting.weeks.length ? `第 ${compactNumbers(meeting.weeks)} 周` : '待选周次' }}<template v-if="meeting.location"> · {{ meeting.location }}</template></text>
              </view>
              <AppIcon :name="activeId === meeting.id ? 'down' : 'right'" :size="17" color="#527da8" />
            </button>
            <view v-if="activeId === meeting.id" class="editor-meeting-body">
              <view class="editor-choice-block">
                <text class="editor-label">星期</text>
                <view class="editor-day-grid" role="group" aria-label="星期">
                  <button v-for="(day, dayIndex) in courseDays" :key="day" class="editor-chip" role="button" tabindex="0" :class="{ chosen: meeting.day === dayIndex + 1 }" :aria-pressed="meeting.day === dayIndex + 1" @click="meeting.day = dayIndex + 1">{{ day }}</button>
                </view>
              </view>

              <button class="editor-choice-row" role="button" tabindex="0" :aria-expanded="picker === 'sections'" @click="togglePicker('sections')">
                <AppIcon name="clock" :size="17" color="#527da8" /><text>节次</text><text class="editor-choice-value">{{ meeting.sections.length ? compactNumbers(meeting.sections) + ' 节' : '请选择' }}</text><AppIcon :name="picker === 'sections' ? 'down' : 'right'" :size="15" />
              </button>
              <view v-if="picker === 'sections'" class="editor-option-panel">
                <view class="editor-option-grid" role="group" aria-label="上课节次">
                  <button v-for="period in schedule.periods" :key="period.section" class="editor-chip" role="button" tabindex="0" :aria-label="`第 ${period.section} 节`" :aria-pressed="meeting.sections.includes(period.section)" :class="{ chosen: meeting.sections.includes(period.section) }" @click="meeting.sections = toggleNumber(meeting.sections, period.section)">{{ period.section }}</button>
                </view>
              </view>
              <text v-if="meeting.sections.length" class="editor-time number">{{ meetingTimeLabel(schedule.periods, meeting.sections) }}</text>

              <template v-if="scope === 'course'">
                <button class="editor-choice-row" role="button" tabindex="0" :aria-expanded="picker === 'weeks'" @click="togglePicker('weeks')">
                  <AppIcon name="calendar" :size="17" color="#527da8" /><text>教学周</text><text class="editor-choice-value">{{ meeting.weeks.length ? compactNumbers(meeting.weeks) + ' 周' : '请选择' }}</text><AppIcon :name="picker === 'weeks' ? 'down' : 'right'" :size="15" />
                </button>
                <view v-if="picker === 'weeks'" class="editor-option-panel">
                  <view class="editor-week-tools"><button v-for="option in weekPresets" :key="option.label" role="button" tabindex="0" class="editor-preset" @click="meeting.weeks = option.weeks">{{ option.label }}</button></view>
                  <view class="editor-option-grid" role="group" aria-label="教学周">
                    <button v-for="week in allWeeks" :key="week" class="editor-chip" role="button" tabindex="0" :aria-label="`第 ${week} 周`" :aria-pressed="meeting.weeks.includes(week)" :class="{ chosen: meeting.weeks.includes(week) }" @click="meeting.weeks = toggleNumber(meeting.weeks, week)">{{ week }}</button>
                  </view>
                </view>
              </template>

              <view class="editor-fields editor-meeting-fields">
                <view class="editor-field"><text>{{ eventKind ? '地点' : '教室' }}</text><input v-model="meeting.location" :aria-label="`时段 ${index + 1} 教室`" maxlength="120" placeholder="地点待确认" :cursor-spacing="22" /></view>
                <view class="editor-field"><text>{{ eventKind ? '本次负责人' : '时段教师' }}</text><input v-model="meeting.teacher" :aria-label="`时段 ${index + 1} 教师`" maxlength="160" :placeholder="draft.teacher || '沿用课程教师'" :cursor-spacing="22" /></view>
                <view class="editor-note-field"><text>备注</text><textarea v-model="meeting.note" :aria-label="`时段 ${index + 1} 备注`" maxlength="240" placeholder="补课、换教室等提醒" auto-height :cursor-spacing="24" /></view>
              </view>
              <view v-if="scope === 'course'" class="editor-meeting-actions">
                <button class="editor-utility" role="button" tabindex="0" aria-label="复制时段" title="复制时段" @click="addMeeting(meeting)">
                  <AppIcon name="copy" :size="19" color="#315d89" />
                </button>
                <button class="editor-utility" role="button" tabindex="0" aria-label="移除此时段" title="移除此时段" :disabled="draft.meetings.length < 2" @click="removeMeeting(index)">
                  <AppIcon name="trash" :size="19" color="#a04443" />
                </button>
              </view>
            </view>
          </view>
          <text v-if="demo" class="editor-preview-note">当前是示例课表，修改仅在本次使用期间有效。</text>
        </view>
      </scroll-view>

    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { buildCourseEdit, courseColors, courseDays, createCourseDraft, nextCourseMeetingId, type CourseEditScope, type CourseEditTarget } from '../domain/course-edit'
import { chinaDate, compactNumbers, dateAt, meetingTimeLabel, meetingKindLabels, type Meeting, type Schedule } from '../domain/schedule'

import { gridSections, type GridEdit } from '../domain/grid-edit'

const props = defineProps<{ schedule: Schedule; target: CourseEditTarget; scope: CourseEditScope; gridEdit?: GridEdit; demo: boolean; reducedMotion: boolean; commit: (schedule: Schedule) => boolean }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const sourceSchedule = props.gridEdit?.schedule ?? props.schedule
const liveSchedule = props.schedule
const draft = ref(createCourseDraft(sourceSchedule, props.target, props.scope))
const initial = JSON.stringify(draft.value)
const grid = props.gridEdit
const kind = draft.value.meetings[0]?.kind
const eventKind = kind === 'meeting' || kind === 'activity' ? meetingKindLabels[kind] : ''
const originalAdjustment = props.scope === 'week' && (!grid || grid.mode === 'move')
  ? describeAdjustment(draft.value.meetings[0]) : null
if (grid) {
  draft.value.meetings[0].day = grid.slot.day
  draft.value.meetings[0].sections = gridSections(grid.slot)
}
const adjustmentRows = computed(() => {
  if (!originalAdjustment) return []
  return describeAdjustment(draft.value.meetings[0]).map(({ label, value }, index) => ({
    label, before: originalAdjustment[index].value, after: value,
  }))
})
const nameLabel = (eventKind || '课程') + '名称'
const gridTitle = grid?.mode === 'move' ? '调整这次上课' : kind ? '添加' + meetingKindLabels[kind] : ''
const dirty = computed(() => Boolean(grid && grid.mode !== 'move') || JSON.stringify(draft.value) !== initial)
const activeId = ref(props.target.meetingId)
const picker = ref<'weeks' | 'sections' | null>(null)
const scrollTarget = ref('')
const error = ref('')
watch(draft, () => { error.value = '' }, { deep: true })
let confirming = false
const allWeeks = Array.from({ length: sourceSchedule.semester.weeks }, (_, index) => index + 1)
const weekPresets = [
  { label: '全选', weeks: allWeeks }, { label: '单周', weeks: allWeeks.filter(week => week % 2 === 1) },
  { label: '双周', weeks: allWeeks.filter(week => week % 2 === 0) }, { label: '清空', weeks: [] },
]

function describeAdjustment(meeting: Meeting) {
  const date = chinaDate(dateAt(sourceSchedule.semester.monday, props.target.week, meeting.day))
  const sections = meeting.sections
  return [
    { label: '日期', value: `${courseDays[meeting.day - 1]} · ${date.slice(5).replace('-', '/')}` },
    { label: '节次', value: sections.length ? `第 ${compactNumbers(sections)} 节\n${meetingTimeLabel(sourceSchedule.periods, sections)}` : '待选节次' },
    { label: eventKind ? '地点' : '教室', value: meeting.location.trim() || '未填写' },
    { label: eventKind ? '负责人' : '教师', value: meeting.teacher?.trim() || draft.value.teacher.trim() || '未填写' },
    { label: '备注', value: meeting.note?.trim() || '无备注' },
  ]
}

function openMeeting(id: string) { activeId.value = activeId.value === id ? '' : id; picker.value = null }
function togglePicker(value: 'weeks' | 'sections') { picker.value = picker.value === value ? null : value }
function toggleNumber(values: number[], value: number): number[] {
  return values.includes(value) ? values.filter(item => item !== value) : [...values, value].sort((a, b) => a - b)
}
function slotSummary(meeting: Meeting): string {
  return `${courseDays[meeting.day - 1]}，${meeting.sections.length ? '第 ' + compactNumbers(meeting.sections) + ' 节' : '待选节次'}`
}
async function addMeeting(source?: Meeting) {
  const id = nextCourseMeetingId([...sourceSchedule.meetings, ...draft.value.meetings])
  const anchor = sourceSchedule.meetings.find(item => item.id === props.target.meetingId)!
  const current = draft.value.meetings.find(item => item.id === activeId.value)
    ?? draft.value.meetings.find(item => item.id === anchor.id)
  const entry: Meeting = source
    ? { ...source, id, sections: [...source.sections], weeks: [...source.weeks] }
    : { id, courseId: props.target.courseId, day: anchor.day, sections: [], weeks: [props.target.week], location: current?.location ?? anchor.location }
  const index = source ? draft.value.meetings.indexOf(source) + 1 : draft.value.meetings.length
  draft.value.meetings.splice(index, 0, entry)
  activeId.value = id
  picker.value = 'sections'
  error.value = ''
  scrollTarget.value = ''
  await nextTick()
  scrollTarget.value = 'editor-meeting-' + index
}
function removeMeeting(index: number) {
  if (draft.value.meetings.length <= 1) return
  draft.value.meetings.splice(index, 1)
  activeId.value = draft.value.meetings[Math.min(index, draft.value.meetings.length - 1)].id
  picker.value = null
  error.value = ''
}
function requestClose() {
  if (confirming) return
  if (!dirty.value) { emit('close'); return }
  confirming = true
  uni.showModal({ title: '放弃未保存的修改？', content: grid ? '确认后会返回课表。' : '确认后会返回课程详情。', cancelText: '继续编辑', confirmText: '放弃修改',
    confirmColor: '#a04443', success: result => { if (result.confirm) emit('close') }, complete: () => { confirming = false } })
}
function save() {
  error.value = ''
  try {
    if (props.schedule !== liveSchedule) throw new Error('课表已更新，请关闭编辑页后重新打开。')
    const next = buildCourseEdit(sourceSchedule, props.target, grid?.mode === 'new' ? 'course' : props.scope, draft.value)
    if (!props.commit(next)) throw new Error('课表保存失败，修改仍在编辑页。请检查本地存储后重试。')
    emit('saved')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '课表保存失败，请重试。'
  }
}
function handleKey(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); requestClose(); return }
  // #ifdef H5
  if (event.key !== 'Tab') return
  const root = document.getElementById('course-editor')
  const focusable = Array.from(root?.querySelectorAll<HTMLElement>('[tabindex="0"], input, textarea') || [])
    .filter(node => node.getClientRects().length > 0 && !node.matches(':disabled,[disabled],[aria-disabled="true"]'))
  const first = focusable[0], last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  // #endif
}
onMounted(async () => {
  // #ifdef H5
  await nextTick()
  document.querySelector<HTMLElement>('#course-editor .editor-back')?.focus({ preventScroll: true })
  // #endif
})
defineExpose({ requestClose })
</script>

<script lang="ts">
export default {}
</script>
<script module="editorView" lang="renderjs">
import { SURFACE_ENTER_EASING } from './surface-motion.js'
export default {
  beforeUnmount() {
    this.reduce?.removeEventListener?.('change', this.onPreference)
    this.reveal?.cancel()
  },
  methods: {
    enter(quiet, previous, owner, instance) {
      const stage = instance.$el
      const editor = stage.querySelector('.course-editor')
      if (!editor?.animate) {
        stage.style.setProperty('--editor-easing', SURFACE_ENTER_EASING)
        stage.dataset.editorDriver = 'css'
        return
      }
      stage.dataset.editorDriver = 'native'
      if (!this.reduce) {
        this.reduce = stage.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)')
        this.onPreference = event => { if (event.matches) this.reveal?.finish() }
        this.reduce.addEventListener?.('change', this.onPreference)
      }
      if (quiet || this.reduce.matches) { this.reveal?.cancel(); return }
      if (this.reveal || previous === true) return
      this.reveal = editor.animate([{ transform:'translate3d(14px,0,0)' }, { transform:'translate3d(0,0,0)' }],
        { duration:200, easing:SURFACE_ENTER_EASING })
    }
  }
}
</script>

<style scoped lang="scss">
.course-editor-stage { position:fixed; inset:0; z-index:110; display:flex; justify-content:center; background:#20304722; }
.course-editor { --editor-divider:#e2eaf4; --editor-action:#315d89; width:100%; max-width:480px; min-height:0; display:flex; flex-direction:column; overflow:hidden; color:#203047; background:#f6f8fc; transform:translate3d(0,0,0); }
.course-editor-stage:not([data-editor-driver]) .course-editor:not(.course-editor-quiet) { transform:translate3d(14px,0,0); }
.course-editor-stage[data-editor-driver="css"] .course-editor:not(.course-editor-quiet) { animation:editor-reveal .2s var(--editor-easing) both; }
.course-editor-quiet { animation:none; }
@keyframes editor-reveal { from { transform:translate3d(14px,0,0); } to { transform:translate3d(0,0,0); } }
.editor-header { flex:none; display:flex; align-items:center; gap:8px; padding:calc(10px + var(--status-bar-height,0px)) 16px 11px 8px; border-bottom:1px solid var(--editor-divider); }
.editor-back,.editor-utility { width:44px; height:44px; flex:none; display:grid; place-items:center; }
.editor-heading { min-width:0; }
.editor-title,.editor-scope { display:block; }
.editor-title { font-size:20px; font-weight:730; line-height:1.25; }
.editor-scope { margin-top:4px; font-size:11px; color:#62788f; }
.editor-save { flex:none; display:grid; place-items:center; min-width:44px; min-height:44px; margin-left:auto; color:var(--editor-action); font-size:14px; font-weight:690; }
.editor-error { display:block; padding:8px 16px; color:#a04443; background:#faeeed; font-size:12px; line-height:1.5; }
.editor-scroll { height:0; min-height:0; flex:1; }
.editor-body { padding:16px 16px calc(24px + env(safe-area-inset-bottom,0px)); }
.editor-course-banner { display:grid; gap:4px; padding:2px 0 2px 12px; border-left:3px solid currentColor; }
.editor-course-banner.blue { color:#315a86; }
.editor-course-banner.teal { color:#336d64; }
.editor-course-banner.purple { color:#674f8f; }
.editor-course-banner.apricot { color:#8b5a35; }
.editor-semester { font-size:10px; font-weight:600; }
.editor-course-name { color:#203047; font-size:17px; font-weight:720; line-height:1.4; overflow-wrap:anywhere; }
.editor-section-title { display:block; font-size:13px; font-weight:710; color:#344e69; margin:21px 0 8px; }
.editor-comparison { padding:0 12px; border-block:1px solid #e2eaf4; background:#fff; }
.editor-comparison-row { display:grid; grid-template-columns:46px repeat(2,minmax(0,1fr)); gap:8px; padding:7px 0; font-size:12px; line-height:1.5; }
.editor-comparison-row + .editor-comparison-row { border-top:1px solid #edf1f6; }
.editor-comparison-row text { min-width:0; white-space:pre-wrap; overflow-wrap:anywhere; }
.editor-comparison-head { color:#344e69; font-weight:650; }
.editor-comparison-label,.editor-comparison-before { color:#61758b; }
.editor-comparison-changed { color:#315d89; font-weight:650; }
.editor-section-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:12px; }
.editor-section-heading .editor-section-title { margin:0; }
.editor-add { display:flex; align-items:center; gap:5px; min-height:44px; font-size:13px; color:var(--editor-action); font-weight:680; }
.editor-fields,.editor-meeting { background:#fff; border-top:1px solid var(--editor-divider); }
.editor-fields { padding:0 12px; }
.editor-field { min-height:47px; display:grid; grid-template-columns:75px minmax(0,1fr); align-items:center; gap:8px; border-bottom:1px solid #edf1f6; }
.editor-field:last-child { border-bottom:0; }
.editor-field > text,.editor-note-field > text { color:#4e637d; font-size:12px; }
.editor-field input { width:100%; min-width:0; height:44px; font-size:14px; text-align:right; color:#203047; }
.editor-swatches { display:flex; gap:2px; justify-content:flex-end; }
.editor-swatch { width:34px; height:44px; display:grid; place-items:center; position:relative; isolation:isolate; background:transparent; }
.editor-swatch::before { content:''; position:absolute; z-index:-1; width:24px; height:24px; border-radius:50%; background:var(--swatch); }
.editor-swatch.blue { --swatch:#c9dff8; }
.editor-swatch.teal { --swatch:#c9e9e1; }
.editor-swatch.purple { --swatch:#ded2f4; }
.editor-swatch.apricot { --swatch:#f2d8bf; }
.editor-swatch.chosen::before { box-shadow:0 0 0 1.5px #7895b4; }
.editor-meeting-summary { display:flex; width:100%; min-width:0; min-height:62px; padding:8px 12px; gap:14px; align-items:center; text-align:left; color:inherit; }
.editor-day-stamp { width:40px; flex:none; display:grid; gap:3px; color:var(--editor-action); font-size:13px; font-weight:700; }
.editor-day-stamp text:last-child { font-size:10px; font-weight:500; color:#59758f; }
.editor-meeting-label { min-width:0; flex:1; display:grid; gap:3px; }
.editor-meeting-label text:first-child { font-size:14px; font-weight:670; }
.editor-meeting-label text:last-child { font-size:11px; color:#61758b; overflow-wrap:anywhere; }
.editor-meeting-body { margin:0 12px; padding:10px 0 6px; border-top:1px solid #eaf0f7; }
.editor-label { display:block; color:#4e637d; font-size:12px; margin-bottom:6px; }
.editor-day-grid,.editor-option-grid { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); }
.editor-option-grid { grid-template-columns:repeat(6,minmax(0,1fr)); }
.editor-chip { position:relative; display:grid; place-items:center; min-height:44px; color:#526b84; font-size:12px; }
.editor-chip.chosen { color:var(--editor-action); font-weight:730; }
.editor-chip.chosen::before { content:''; position:absolute; inset:auto 20% 5px; height:2px; border-radius:1px; background:currentColor; }
.editor-choice-row { display:flex; align-items:center; min-height:44px; width:100%; gap:7px; text-align:left; color:#344e69; font-size:13px; border-top:1px solid #edf1f6; }
.editor-choice-block { margin-bottom:9px; }
.editor-choice-value { flex:1; text-align:right; min-width:0; color:#53769b; overflow-wrap:anywhere; }
.editor-option-panel { padding:2px 0 9px; }
.editor-time { display:block; padding:0 0 8px 24px; color:#5f7790; font-size:11px; }
.editor-week-tools { display:flex; border-bottom:1px solid #edf1f6; }
.editor-preset { flex:1; display:grid; place-items:center; min-height:44px; color:var(--editor-action); font-size:12px; font-weight:650; }
.editor-meeting-fields { padding:0; border-top:1px solid #edf1f6; }
.editor-note-field { display:grid; grid-template-columns:75px minmax(0,1fr); align-items:start; gap:8px; padding:11px 0; }
.editor-note-field textarea { width:100%; min-height:33px; color:#203047; font-size:13px; line-height:1.5; text-align:right; }
.editor-meeting-actions { display:flex; justify-content:flex-end; border-top:1px solid #edf1f6; padding-top:3px; }
.editor-utility[disabled] { opacity:.4; }
.editor-preview-note { display:block; color:#63788d; font-size:11px; line-height:1.6; margin-top:12px; }
@media (min-width:600px) { .course-editor-stage { padding:40px 0; }.course-editor { max-width:390px; max-height:860px; border-radius:29px; } }
</style>
