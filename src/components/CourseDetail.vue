<template>
  <view class="course-detail">
    <view class="detail-banner" :class="tile.course.color">
      <text class="detail-kicker">{{ demo ? '示例课程' : tile.course.origin === 'ucas' ? '教务课程' : '手动课程' }} · {{ schedule.semester.name }}</text>
      <text class="detail-title">{{ tile.course.name }}</text>
      <text v-if="courseFacts" class="detail-facts">{{ courseFacts }}</text>
    </view>

    <view v-if="action === 'delete'" class="detail-remove">
      <text class="detail-section-title">删除范围</text>
      <view role="group" aria-label="删除范围">
        <button v-for="option in deleteOptions" :key="option.scope" class="detail-scope-row" role="button" tabindex="0" :class="{ selected: deleteScope === option.scope }" :aria-pressed="deleteScope === option.scope" @click="deleteScope = option.scope">
          <view><text>{{ option.label }}</text><text>{{ option.description }}</text></view>
          <AppIcon v-if="deleteScope === option.scope" name="check" :size="18" color="#a04443" />
        </button>
      </view>
      <text v-if="error" class="detail-error" role="alert">{{ error }}</text>
      <view class="detail-remove-actions">
        <button class="detail-button" role="button" tabindex="0" @click="action = 'none'">取消</button>
        <button class="detail-button detail-confirm" role="button" tabindex="0" @click="$emit('delete', deleteScope)">确认删除</button>
      </view>
    </view>

    <template v-else>
      <view class="detail-slot" aria-label="选中的上课安排">
        <view class="detail-slot-heading"><text>第 {{ week }} 周 · {{ courseDays[tile.meeting.day - 1] }}{{ tile.meeting.kind ? ' · ' + meetingKindLabels[tile.meeting.kind] : '' }}</text><text class="number">{{ meetingTimeLabel(schedule.periods, tile.meeting.sections) }}</text></view>
        <view class="detail-meta-row"><AppIcon name="pin" :size="17"/><text>{{ tile.meeting.location || '地点待确认' }}</text><text class="detail-slot-sections">第 {{ compactNumbers(tile.meeting.sections) }} 节</text></view>
        <view class="detail-meta-row"><AppIcon name="person" :size="17"/><text>{{ tile.course.teacher || '教师待确认' }}</text></view>
        <view v-if="tile.meeting.note" class="detail-note"><text>备注</text><text>{{ tile.meeting.note }}</text></view>
        <button v-if="tile.meeting.weeks.includes(week)" class="detail-week-edit" role="button" tabindex="0" @click="$emit('edit', 'week')">仅改第 {{ week }} 周 <AppIcon name="right" :size="14" color="#527da8" /></button>
      </view>

      <view class="detail-actions" role="group" aria-label="课程操作">
        <button class="detail-edit" role="button" tabindex="0" @click="$emit('edit', 'course')">
          <AppIcon name="edit" :size="17" color="#315d89" />编辑课程
        </button>
        <view class="detail-utilities">
          <button class="detail-utility" role="button" tabindex="0" aria-label="复制课程" title="复制课程" :aria-expanded="action === 'copy'" @click="action = action === 'copy' ? 'none' : 'copy'">
            <AppIcon name="copy" :size="19" color="#315d89" />
          </button>
          <button class="detail-utility detail-danger" role="button" tabindex="0" aria-label="删除课程" title="删除课程" @click="openDelete">
            <AppIcon name="trash" :size="19" color="#a04443" />
          </button>
        </view>
      </view>
      <view v-if="action === 'copy'" class="detail-copy-options" role="group" aria-label="选择复制内容">
        <button class="detail-button" role="button" tabindex="0" @click="copy(false)">复制课程名称<AppIcon name="right" :size="14" /></button>
        <button class="detail-button" role="button" tabindex="0" @click="copy(true)">复制完整课程<AppIcon name="right" :size="14" /></button>
      </view>

      <view class="detail-meetings-heading"><text class="detail-section-title">全部时段 <text class="detail-count">{{ meetings.length }} 组</text></text><button class="detail-week-edit" role="button" tabindex="0" @click="$emit('weeks')">查看教学周<AppIcon name="right" :size="14" color="#527da8" /></button></view>
      <view class="detail-meetings">
        <view v-for="meeting in meetings" :key="meeting.id" class="meeting-card" :class="{ 'meeting-current': meeting.id === tile.meeting.id }">
          <view class="meeting-top"><text><template v-if="meeting.kind">{{ meetingKindLabels[meeting.kind] }} · </template>{{ courseDays[meeting.day - 1] }} · 第 {{ compactNumbers(meeting.sections) }} 节</text><text class="number">{{ meetingTimeLabel(schedule.periods, meeting.sections) }}</text></view>
          <text class="meeting-meta">第 {{ compactNumbers(meeting.weeks) }} 周{{ meeting.location ? ' · ' + meeting.location : '' }}</text>
          <text v-if="meeting.teacher || meeting.note" class="meeting-extra">{{ [meeting.teacher, meeting.note].filter(Boolean).join(' · ') }}</text>
        </view>
      </view>
    </template>
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { courseDays, type CourseDeleteScope, type CourseEditScope } from '../domain/course-edit'
import { meetingKindLabels, compactNumbers, meetingTimeLabel, type Schedule, type Tile } from '../domain/schedule'

const props = defineProps<{ tile: Tile; schedule: Schedule; week: number; demo: boolean; error: string }>()
defineEmits<{ edit: [scope: CourseEditScope]; delete: [scope: CourseDeleteScope]; weeks: [] }>()
const action = ref<'none' | 'copy' | 'delete'>('none')
const deleteScope = ref<CourseDeleteScope>('week')
watch(() => [props.tile.id, props.week], () => { action.value = 'none' })
const course = computed(() => props.schedule.courses.find(item => item.id === props.tile.course.id) || props.tile.course)
const courseFacts = computed(() => [
  course.value.isDegreeCourse === undefined ? '' : course.value.isDegreeCourse ? '学位课' : '非学位课',
  course.value.credits === undefined ? '' : `${course.value.credits} 学分`,
  course.value.exam,
].filter(Boolean).join(' · '))
const meetings = computed(() => props.schedule.meetings.filter(item => item.courseId === course.value.id)
  .sort((a, b) => a.day - b.day || Math.min(...a.sections) - Math.min(...b.sections)))
const deleteOptions = computed(() => {
  const { meeting } = props.tile
  const options: Array<{ scope: CourseDeleteScope; label: string; description: string }> = []
  if (meeting.weeks.includes(props.week)) options.push({ scope: 'week', label: `仅第 ${props.week} 周这次`, description: `${courseDays[meeting.day - 1]} · 第 ${compactNumbers(meeting.sections)} 节` })
  options.push({ scope: 'meeting', label: '整个上课时段', description: `${courseDays[meeting.day - 1]} · 第 ${compactNumbers(meeting.weeks)} 周` })
  options.push({ scope: 'course', label: '整门课程', description: `删除这门课的全部 ${meetings.value.length} 组时段` })
  return options
})
function openDelete() {
  deleteScope.value = deleteOptions.value[0].scope
  action.value = 'delete'
}
function copy(full: boolean) {
  const lines = [course.value.name]
  if (full) {
    if (courseFacts.value) lines.push(courseFacts.value)
    for (const meeting of meetings.value) {
      const timing = `${courseDays[meeting.day - 1]} · 第 ${compactNumbers(meeting.weeks)} 周 · 第 ${compactNumbers(meeting.sections)} 节`
      lines.push([meeting.kind && meetingKindLabels[meeting.kind], timing, meetingTimeLabel(props.schedule.periods, meeting.sections), meeting.location, meeting.teacher || course.value.teacher, meeting.note].filter(Boolean).join(' · '))
    }
  }
  uni.setClipboardData({ data: lines.join('\n'), showToast: false,
    success: () => { action.value = 'none'; uni.showToast({ title: full ? '课程信息已复制' : '课程名称已复制', icon: 'none' }) },
    fail: () => uni.showToast({ title: '无法写入剪贴板', icon: 'none' }) })
}
</script>

<style scoped lang="scss">
.course-detail { --detail-divider:#e2eaf4; --detail-action:#315d89; --detail-danger:#a04443; }
.detail-banner { display:grid; gap:6px; padding:2px 0 2px 12px; border-left:3px solid currentColor; }
.detail-banner.blue { color:#315a86; }
.detail-banner.teal { color:#336d64; }
.detail-banner.purple { color:#674f8f; }
.detail-banner.apricot { color:#8b5a35; }
.detail-kicker,.detail-facts { font-size:11px; line-height:1.45; }
.detail-title { color:#203047; font-size:22px; font-weight:740; line-height:1.3; overflow-wrap:anywhere; }
.detail-slot { margin-top:16px; padding:12px 0 0; border-top:1px solid var(--detail-divider); }
.detail-slot-heading { display:flex; gap:4px 8px; justify-content:space-between; align-items:baseline; flex-wrap:wrap; color:#315a86; font-size:13px; font-weight:670; padding-bottom:8px; }
.detail-slot-heading .number { font-size:12px; font-weight:570; }
.detail-meta-row { display:flex; gap:8px; align-items:center; min-height:32px; font-size:13px; overflow-wrap:anywhere; }
.detail-slot-sections { margin-left:auto; color:#627891; font-size:11px; text-align:right; }
.detail-note { display:grid; grid-template-columns:32px 1fr; gap:4px; font-size:12px; color:#536985; line-height:1.5; margin:5px 0; overflow-wrap:anywhere; }
.detail-note text:last-child { white-space:pre-wrap; }
.detail-week-edit { display:flex; align-items:center; gap:3px; min-height:44px; color:var(--detail-action); font-size:12px; }
.detail-slot .detail-week-edit { margin-left:auto; }
.detail-actions { display:flex; align-items:center; justify-content:space-between; gap:8px; min-height:54px; border-block:1px solid var(--detail-divider); }
.detail-edit,.detail-utility,.detail-button { display:flex; align-items:center; min-height:44px; color:var(--detail-action); }
.detail-edit { gap:7px; font-size:14px; font-weight:690; white-space:nowrap; }
.detail-utilities { display:flex; align-items:center; }
.detail-utilities::before { content:''; height:18px; margin-right:5px; border-left:1px solid var(--detail-divider); }
.detail-utility { width:44px; justify-content:center; }
.detail-danger { color:var(--detail-danger); }
.detail-copy-options { padding-left:24px; border-bottom:1px solid var(--detail-divider); }
.detail-copy-options .detail-button { justify-content:space-between; width:100%; text-align:left; }
.detail-copy-options .detail-button + .detail-button { border-top:1px solid var(--detail-divider); }
.detail-button { justify-content:center; font-size:13px; }
.detail-meetings-heading { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-top:5px; }
.detail-section-title { color:#344e69; font-size:13px; font-weight:690; }
.detail-count { margin-left:4px; color:#637b94; font-size:11px; font-weight:500; }
.meeting-card { position:relative; border-top:1px solid var(--detail-divider); padding:10px 0 10px 12px; }
.meeting-current::before { content:''; position:absolute; left:0; top:15px; width:5px; height:5px; border-radius:50%; background:var(--detail-action); }
.meeting-current .meeting-top { color:var(--detail-action); }
.meeting-top { display:flex; justify-content:space-between; align-items:baseline; flex-wrap:wrap; gap:3px 8px; font-size:12px; font-weight:600; }
.meeting-top .number,.meeting-meta,.meeting-extra { color:#58728e; font-size:11px; }
.meeting-meta,.meeting-extra { display:block; line-height:1.5; margin-top:3px; overflow-wrap:anywhere; }
.detail-remove { margin-top:18px; }
.detail-remove .detail-section-title { display:block; margin-bottom:7px; }
.detail-scope-row { display:flex; width:100%; text-align:left; justify-content:space-between; gap:8px; align-items:center; min-height:53px; padding:8px 0; border-top:1px solid var(--detail-divider); }
.detail-scope-row text { display:block; font-size:13px; font-weight:620; line-height:1.4; }
.detail-scope-row text + text { color:#68788d; font-size:11px; font-weight:450; }
.detail-scope-row.selected { color:var(--detail-danger); }
.detail-remove-actions { display:flex; justify-content:space-between; gap:8px; border-top:1px solid var(--detail-divider); padding-top:4px; }
.detail-remove-actions .detail-button { min-width:44px; }
.detail-confirm { color:var(--detail-danger); font-weight:690; }
.detail-error { display:block; margin:6px 0; color:var(--detail-danger); font-size:12px; }
@media (max-width:360px) { .detail-title { font-size:20px; } }
</style>
