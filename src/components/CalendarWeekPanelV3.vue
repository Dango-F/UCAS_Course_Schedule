<template>
  <view class="week-content" :data-week="weekPanel.week">
    <view class="calendar-heading">
      <view class="axis-heading"><text>{{ weekPanel.month }}月</text></view>
      <button v-for="day in weekPanel.days" :key="day.day" class="day-heading" :class="{ weekend: day.day > 5 }" :aria-label="`查看 ${Number(day.iso.slice(5, 7))} 月 ${day.date} 日的课程`" @click="$emit('day', day)">
        <text class="day-name">{{ day.label }}</text>
        <view class="day-date number" :class="{ today: day.iso === todayIso, focused: day.iso === focusedDayIso }">{{ day.date }}</view>
      </button>
    </view>
    <scroll-view :key="weekPanel.week" class="calendar-scroll" scroll-y :scroll-top="0">
      <view v-if="!weekPanel.tiles.length" class="empty-state"><view class="empty-art"><AppIcon name="lake" :size="48" color="#8CA9BF" /><view class="empty-line"/><view class="empty-line short"/></view><text class="empty-title">{{ store.scenario === 'empty' ? '你的时间，等你来安排' : '这一周，暂时没有课' }}</text><text class="empty-copy">{{ store.scenario === 'empty' ? '导入国科大课表，开启清晰有序的新学期。' : '试试切换教学周，或查看已有课程的上课周次。' }}</text><button class="primary-button" :class="{ 'empty-return-current': store.scenario !== 'empty' }" @click="$emit('empty')">{{ store.scenario === 'empty' ? '从教务导入' : '回到本周' }}<AppIcon name="arrow" :size="18" :color="store.scenario === 'empty' ? 'white' : '#527DA8'" /></button><button v-if="store.scenario === 'empty'" class="empty-demo" @click="$emit('demo')">先看看示例课表</button></view>
      <view v-else class="calendar-body">
        <view v-for="period in store.schedule.periods" :key="period.section" class="grid-row" :style="{ top: rowTop(period.section) + 'px' }"><view class="period-label"><text class="period-number number">{{ String(period.section).padStart(2,'0') }}</text><text class="period-time number">{{ period.start }}</text></view><view v-for="day in 7" :key="day" class="grid-cell" :class="{ weekend: day > 5 }" /></view>
        <view class="break-row" :style="{ top: 4 * rowHeight + 'px' }"><view class="break-dot"/><text>午间 · 慢下来，好好吃饭</text><view class="break-line"/></view>
        <view class="break-row" :style="{ top: 9 * rowHeight + breakHeight + 'px' }"><view class="break-dot"/><text>傍晚 · 留住一刻湖光</text><view class="break-line"/></view>
        <view class="course-layer">
          <view v-for="day in 7" :key="day" class="course-column">
            <button v-for="group in weekPanel.groupsByDay[day - 1]" :key="group.tiles[0].id" class="course-tile" :class="[group.tiles[0].course.color, { conflict: groupConflict(group), 'long-slot': group.end-group.start >= 2, 'single-slot': group.end === group.start }]" :style="tileStyle(group)" :aria-label="`${dayNames[day-1]} ${group.tiles[0].course.name}${store.showTeachers && teacherLabel(group.tiles) ? `，教师${teacherLabel(group.tiles)}` : ''}${examLabel(group.tiles) ? `，${examLabel(group.tiles)}` : ''}${store.showSections ? `，第${compactNumbers(group.tiles[0].meeting.sections)}节` : ''}${groupConflict(group) ? '，有课程冲突' : ''}`" @click="$emit('group', group)">
              <view v-if="group.tiles[0].course.isDegreeCourse === true" class="tile-accent"/><text class="tile-name">{{ group.tiles[0].course.name }}</text><text v-if="store.showTeachers && teacherLabel(group.tiles)" class="tile-teacher">{{ teacherLabel(group.tiles) }}</text><text v-if="examLabel(group.tiles)" class="tile-exam">{{ examLabel(group.tiles) }}</text><text v-if="groupConflict(group)" class="conflict-badge">{{ new Set(group.tiles.map(t => t.meeting.id)).size }} 门冲突</text><text v-else-if="store.showSections" class="tile-sections number">{{ group.start }}–{{ group.end }}节</text><view class="tile-location"><view v-for="entry in locationEntries(group.tiles)" :key="entry.key" class="tile-location-entry"><text v-if="entry.building" class="tile-location-building">{{ entry.building }}</text><text class="tile-location-room">{{ entry.building ? entry.room : entry.display }}</text></view></view>
            </button>
          </view>
        </view>
      </view>
      <view class="calendar-footer"><text>{{ store.isDemo ? '示例课程与作息 · 不代表真实教学安排' : '教务导入课表 · 已保存到此设备' }}</text><view class="footer-logo" aria-label="湖畔课表"><AppIcon name="lake" :size="23" color="#8CA9BF" /></view></view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { useScheduleStore } from '../stores/schedule'
import { compactNumbers, hasTileConflict, layoutTiles, type Tile } from '../domain/schedule'
import type { WeekPanel } from '../domain/calendar-view'
defineProps<{ weekPanel: WeekPanel; todayIso: string; focusedDayIso: string }>()
defineEmits(['day', 'group', 'empty', 'demo'])
const store = useScheduleStore()
const rowHeight = 60, breakHeight = 32
const dayNames = ['星期一','星期二','星期三','星期四','星期五','星期六','星期日']
type LocationEntry = { key: string; building?: string; room?: string; display: string }
function splitLocation(value: string): Omit<LocationEntry, 'key'> {
  const display = value.trim()
  const match = display.match(/^(.*?楼)\s*(?:[-·:：]\s*)?(.+)$/)
  if (match && match[1].trim() && match[2].trim()) return { building: match[1].trim(), room: match[2].trim(), display }
  return { display }
}
function locationEntries(tiles: Tile[]): LocationEntry[] {
  const seen = new Set<string>()
  const result: LocationEntry[] = []
  for (const tile of tiles) {
    const parts = splitLocation(tile.meeting.location)
    const key = `${parts.building || ''}|${parts.room || parts.display}`
    if (!parts.display || seen.has(key)) continue
    seen.add(key)
    result.push({ key, ...parts })
  }
  return result
}
function teacherLabel(tiles: Tile[]): string {
  return [...new Set(tiles.map(tile => tile.course.teacher.trim()).filter(Boolean))].join(' / ')
}
function examLabel(tiles: Tile[]): string {
  return [...new Set(tiles.map(tile => tile.course.exam?.trim()).filter(Boolean) as string[])].join(' / ')
}
function groupConflict(group: ReturnType<typeof layoutTiles>[number]): boolean { return hasTileConflict(group.tiles) }
function rowTop(section:number) { return (section-1)*rowHeight + (section>4?breakHeight:0) + (section>9?breakHeight:0) }
function tileStyle(group:ReturnType<typeof layoutTiles>[number]) { return {top:rowTop(group.start)+3+'px',height:rowTop(group.end)+rowHeight-rowTop(group.start)-6+'px'} }

</script>

<style scoped>
.week-content { width:100%; height:100%; display:flex; flex-direction:column; overflow:hidden; background:#fff; }
.calendar-heading { flex-shrink:0; display:flex; padding:12px 8px 10px 0; border-bottom:1px solid #edf1f5; background:white; touch-action:pan-y; }
.axis-heading { width:38px; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:9px; color:#94a0b0; }
.day-heading { flex:1; min-height:44px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; padding:0; background:transparent; }
.day-heading:active { background:#f5f8fb; }
.day-name { font-size:10px; color:#8290a3; }
.day-date { font-size:14px; font-weight:500; width:28px; height:28px; border-radius:10px; display:flex; align-items:center; justify-content:center; }
.day-date.today { background:#527DA8; color:white; }
.day-date.focused:not(.today) { color:#527DA8; background:#eef4fa; box-shadow:inset 0 0 0 1px #b8ccdf; }
.day-heading.weekend { color:#9eabb9; }
.calendar-scroll { flex:1; min-height:0; height:0; background:#fff; touch-action:pan-y; }
.calendar-body { position:relative; height:844px; margin-right:8px; }
.grid-row { height:60px; display:flex; position:absolute; width:100%; }
.period-label { width:38px; flex-shrink:0; text-align:center; display:flex; flex-direction:column; align-items:center; padding-top:11px; gap:3px; }
.period-number { font-size:11px; font-weight:500; color:#8392a4; }
.period-time { font-size:8px; color:#acb6c2; }
.grid-cell { flex:1; border-bottom:1px solid #f0f3f7; border-left:1px solid #f1f4f7; }
.grid-cell.weekend { background:#fafbfd; }
.break-row { position:absolute; left:46px; right:0; height:32px; display:flex; align-items:center; gap:7px; color:#a5b0bd; font-size:8px; letter-spacing:.5px; }
.break-dot { width:3px; height:3px; background:#bdcbd7; border-radius:50%; }
.break-line { height:1px; flex:1; background:#f0f3f7; margin-left:4px; }
.course-layer { position:absolute; left:38px; right:0; top:0; bottom:0; display:flex; pointer-events:none; }
.course-column { flex:1; min-width:0; position:relative; }
.course-tile { position:absolute; left:2px; right:2px; padding:6px 4px 7px; border-radius:7px; display:flex; flex-direction:column; align-items:center; text-align:center; overflow:hidden; pointer-events:auto; border:1px solid #fff6; }
.tile-accent { position:absolute; left:0; top:6px; width:2px; height:14px; background:currentColor; opacity:.42; border-radius:3px; }
.tile-name { width:100%; font-size:11px; font-weight:600; line-height:1.55; word-break:break-all; text-wrap:balance; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; flex-shrink:0; max-height:4.65em; }
.long-slot .tile-name { -webkit-line-clamp:5; max-height:7.75em; }
.tile-teacher { width:100%; font-size:8px; line-height:1.35; margin-top:3px; color:currentColor; opacity:.72; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex-shrink:0; }
.tile-exam { width:100%; font-size:7px; line-height:1.25; margin-top:2px; color:currentColor; opacity:.64; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex-shrink:0; }
.single-slot { padding-top:3px; padding-bottom:4px; }
.single-slot .tile-accent { top:4px; }
.single-slot .tile-name { font-size:10px; line-height:1.3; -webkit-line-clamp:1; max-height:1.3em; }
.single-slot .tile-teacher { font-size:7px; line-height:1.2; margin-top:1px; }
.single-slot .tile-exam { font-size:6px; line-height:1.2; margin-top:1px; }
.single-slot .tile-location { margin-top:auto; }
.single-slot .tile-location-building,.single-slot .tile-location-room { font-size:7px; line-height:1.2; }
.tile-location { width:100%; display:flex; flex-direction:column; align-items:center; gap:1px; font-size:8px; line-height:1.3; margin-top:auto; opacity:.78; word-break:break-all; flex-shrink:0; }
.tile-location-entry { width:100%; display:flex; flex-direction:column; align-items:center; min-width:0; }
.tile-location-building,.tile-location-room { width:100%; font-size:8px; line-height:1.3; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.tile-location-building { opacity:.78; }
.tile-location-room { opacity:1; }
.tile-sections { font-size:8px; opacity:.56; margin-top:3px; padding-top:0; white-space:nowrap; }
.blue { background:#e5eef8; color:#426c96; }
.teal { background:#e5f1ec; color:#4f7c6d; }
.purple { background:#eee9f6; color:#7a659b; }
.apricot { background:#faf0df; color:#a1814e; }
.conflict { border:1px dashed #b18466; }
.conflict-badge { font-size:8px; line-height:1.5; margin-top:auto; background:#ffffffb0; padding:2px; border-radius:3px; color:#986448; }
.calendar-footer { text-align:center; padding:22px 0 18px; color:#a3b0bd; font-size:9px; }
.footer-logo { display:flex; align-items:center; justify-content:center; margin-top:7px; opacity:.9; }
.empty-state { min-height:410px; padding:45px 30px; display:flex; flex-direction:column; align-items:center; text-align:center; }
.empty-art { width:106px; height:106px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:7px; margin-bottom:27px; }
.empty-line { height:2px; width:37px; background:#d6e2ec; border-radius:2px; }.empty-line.short { width:25px; }
.empty-title { font-size:19px; font-weight:600; }.empty-copy { font-size:12px; color:#8b9aaa; line-height:1.8; margin:12px 0 25px; }.empty-return-current { min-height:48px !important; padding:0 12px !important; border-radius:0 !important; background:transparent !important; color:#527DA8 !important; box-shadow:none !important; }.empty-demo { margin-top:10px; min-height:44px; color:#718096; font-size:12px; }

@media (max-width:374px) { .tile-name { font-size:10px; }.tile-location { font-size:8px; }.course-tile { left:.4px; right:.4px; padding-left:4px; padding-right:3px; } }
</style>
