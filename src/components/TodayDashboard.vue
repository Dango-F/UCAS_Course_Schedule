<template>
  <view class="today-page">
    <scroll-view class="today-scroll" scroll-y :show-scrollbar="false">
      <view class="today-content">
      <view class="today-date-row">
        <view class="week-pill">{{ weekLabel }}</view>
        <view class="date-copy">
          <text class="date-title number">{{ dateLabel }}</text>
          <text class="date-caption">{{ monthEnglish }} · {{ weekdayLabel }}</text>
        </view>
      </view>

      <view v-if="heroTile" class="overview-card" role="button" @click="$emit('course', heroTile)">
        <view class="overview-topline">
          <view class="overview-label"><view class="overview-dot" :class="{ live: currentTile }"/><text>{{ heroLabel }}</text></view>
          <view class="overview-time"><AppIcon name="clock" :size="15" color="#527DA8"/><text class="number">{{ dateHint(heroTile.actualDate) }}{{ timeOf(heroTile.start) }} – {{ endTime(heroTile.end) }}</text></view>
        </view>
        <text class="overview-course">{{ heroTile.course.name }}</text>
        <view class="overview-info">
          <view><AppIcon name="pin" :size="17" color="#6F8EAC"/><text>{{ heroTile.meeting.location || '地点待确认' }}</text></view>
          <view><AppIcon name="person" :size="17" color="#6F8EAC"/><text>{{ heroTile.course.teacher || '教师待确认' }}</text></view>
        </view>

        <view v-if="currentTile && upcomingTile" class="next-preview">
          <view class="next-preview-divider"/>
          <view class="next-preview-copy">
            <text class="next-preview-label">下一节课</text>
            <text class="next-preview-name">{{ upcomingTile.course.name }}</text>
          </view>
          <text class="next-preview-time number">{{ dateHint(upcomingTile.actualDate) }}{{ timeOf(upcomingTile.start) }}</text>
        </view>
      </view>
      <view v-else class="overview-card overview-empty">
        <view class="overview-label"><AppIcon name="lake" :size="17" color="#527DA8"/><text>{{ isSelectedToday ? '今天没有待上的课程' : '当天没有安排课程' }}</text></view>
        <text class="overview-empty-copy">{{ isSelectedToday ? '留一点时间，给自己。' : '这一天可以按自己的节奏来。' }}</text>
      </view>

      <view class="day-section">
        <view class="section-heading">
          <view class="section-title-group"><text class="section-title">{{ isSelectedToday ? '今日课程' : '当天课程' }}</text><text class="section-count">共 {{ todayRows.length }} 节</text></view>
          <text class="section-date number">{{ shortDate(dateIso) }}</text>
        </view>
        <text v-if="todayRows.length === 0" class="section-empty">没有安排课程</text>
        <button v-for="tile in todayRows" :key="tile.id" class="course-row" :class="{ completed: hasEnded(tile), ongoing: isCurrent(tile) }" @click="$emit('course', tile)">
          <view class="course-stripe" :class="tile.course.color"/>
          <view class="course-copy">
            <text class="course-name">{{ tile.course.name }}</text>
            <text class="course-meta number">{{ timeOf(tile.start) }} – {{ endTime(tile.end) }} · {{ tile.meeting.location || '地点待确认' }}</text>
          </view>
          <view class="course-trailing">
            <text v-if="isCurrent(tile)" class="ongoing-label">进行中</text>
            <text v-else class="section-badge">{{ tile.end - tile.start + 1 }} 节</text>
          </view>
        </button>
      </view>

      <view class="day-section tomorrow-section">
        <view class="section-heading">
          <view class="section-title-group"><text class="section-title">{{ isSelectedToday ? '明日课程' : '次日课程' }}</text><text class="section-count">共 {{ tomorrowTiles.length }} 节</text></view>
          <text class="section-date number">{{ shortDate(tomorrowIso) }}</text>
        </view>
        <text v-if="tomorrowTiles.length === 0" class="section-empty">没有安排课程</text>
        <button v-for="tile in tomorrowTiles" :key="tile.id" class="course-row" @click="$emit('course', tile)">
          <view class="course-stripe" :class="tile.course.color"/>
          <view class="course-copy">
            <text class="course-name">{{ tile.course.name }}</text>
            <text class="course-meta number">{{ timeOf(tile.start) }} – {{ endTime(tile.end) }} · {{ tile.meeting.location || '地点待确认' }}</text>
          </view>
          <view class="course-trailing"><text class="section-badge">{{ tile.end - tile.start + 1 }} 节</text></view>
        </button>
      </view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { useScheduleStore } from '../stores/schedule'
import { chinaDate, teachingWeek, type Tile } from '../domain/schedule'
import { currentTileOnDate, nextUpcomingTile, tilesForDate, tileHasEnded, type DatedTile } from '../domain/today'

const props = defineProps<{ dateIso: string; now: Date }>()
defineEmits<{ course: [tile: Tile] }>()

const store = useScheduleStore()
const actualToday = computed(() => chinaDate(props.now))
const isSelectedToday = computed(() => props.dateIso === actualToday.value)
const dayTiles = computed(() => tilesForDate(store.schedule, props.dateIso))
const tomorrowIso = computed(() => chinaDate(new Date(Date.parse(`${props.dateIso}T12:00:00+08:00`) + 86400000)))
const tomorrowTiles = computed(() => tilesForDate(store.schedule, tomorrowIso.value))
const currentTile = computed(() => isSelectedToday.value ? currentTileOnDate(store.schedule, props.dateIso, props.now) : null)
const upcomingTile = computed(() => {
  if (!isSelectedToday.value) return null
  const next = nextUpcomingTile(store.schedule, props.now)
  return next?.actualDate === props.dateIso ? next : null
})
const heroTile = computed<DatedTile | null>(() => currentTile.value ?? (isSelectedToday.value ? upcomingTile.value : dayTiles.value[0] ?? null))
const heroLabel = computed(() => currentTile.value ? '正在上课' : isSelectedToday.value ? '下一节课' : '当天安排')

function hasEnded(tile: DatedTile): boolean { return tileHasEnded(store.schedule, tile, props.now) }
function isCurrent(tile: DatedTile): boolean { return currentTile.value?.id === tile.id }
const todayRows = computed(() => [...dayTiles.value].sort((a, b) => {
  const completedDifference = Number(hasEnded(b)) - Number(hasEnded(a))
  return completedDifference || a.start - b.start
}))

const selectedWeek = computed(() => teachingWeek(store.schedule.semester.monday, new Date(`${props.dateIso}T12:00:00+08:00`)))
const weekLabel = computed(() => selectedWeek.value >= 1 && selectedWeek.value <= store.schedule.semester.weeks ? `第 ${String(selectedWeek.value).padStart(2, '0')} 周` : '非教学周')
const weekdayLabel = computed(() => {
  const weekday = new Date(`${props.dateIso}T00:00:00Z`).getUTCDay()
  return `星期${['日', '一', '二', '三', '四', '五', '六'][weekday]}`
})
const dateLabel = computed(() => {
  const [year, month, day] = props.dateIso.split('-').map(Number)
  return `${year}年${month}月${day}日`
})
const monthEnglish = computed(() => ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER'][Number(props.dateIso.slice(5, 7)) - 1] || '')

function timeOf(section: number): string { return store.schedule.periods.find(period => period.section === section)?.start || '待确认' }
function endTime(section: number): string { return store.schedule.periods.find(period => period.section === section)?.end || '待确认' }
function shortDate(date: string): string { return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日` }
function dateHint(date: string): string { return date === props.dateIso ? '' : `${shortDate(date)} · ` }

</script>

<style scoped>
.today-page { flex:1; min-height:0; height:0; display:flex; background:#f6f8fc; overflow:hidden; }
.today-scroll { flex:1; min-height:0; height:100%; }
/* Keep the scroll viewport full-height, as on the timetable: content passes
   behind the shared floating capsule; only the content owns the end spacing. */
.today-content { box-sizing:border-box; padding:calc(var(--status-bar-height, 0px) + 12px) 22px calc(96px + env(safe-area-inset-bottom)); }
.today-date-row { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:15px; }
.week-pill { flex-shrink:0; padding:8px 13px; border-radius:12px; background:#e4eef9; color:#3978b5; font-size:13px; font-weight:600; letter-spacing:.2px; }
.date-copy { display:flex; min-width:0; flex-direction:column; align-items:flex-end; gap:3px; }
.date-title { font-size:17px; font-weight:650; letter-spacing:.2px; white-space:nowrap; }
.date-caption { color:#91a0b1; font-size:9px; letter-spacing:1px; white-space:nowrap; }
.overview-card { padding:17px 17px 16px; border:1px solid #e1ebf5; border-radius:22px; background:linear-gradient(145deg,#edf5ff,#f2f6ff 72%,#f4f2fc); box-shadow:0 7px 20px #527da80b; }
.overview-card[role="button"] { width:100%; text-align:left; }
.overview-topline,.overview-label,.overview-time,.overview-info,.section-heading,.section-title-group,.course-row,.course-copy,.course-trailing,.next-preview { display:flex; align-items:center; }
.overview-topline { justify-content:space-between; gap:8px; }
.overview-label { min-width:0; gap:7px; color:#527da8; font-size:11px; font-weight:550; }
.overview-dot { width:7px; height:7px; flex-shrink:0; border-radius:50%; background:#7ca4ca; }
.overview-dot.live { background:#3e9a76; box-shadow:0 0 0 4px #3e9a7618; }
.overview-time { flex-shrink:0; gap:6px; padding:7px 9px; border-radius:10px; background:#ffffffb8; color:#253b55; font-size:12px; font-weight:600; white-space:nowrap; }
.overview-course { display:block; margin:15px 0 11px; color:#202f46; font-size:23px; line-height:1.32; font-weight:650; letter-spacing:.1px; overflow-wrap:anywhere; }
.overview-info { flex-direction:column; align-items:flex-start; gap:8px; color:#536b84; }
.overview-info view { display:flex; min-width:0; align-items:center; gap:8px; }
.overview-info text { overflow:hidden; font-size:12px; text-overflow:ellipsis; white-space:nowrap; }
.overview-empty { min-height:104px; display:flex; flex-direction:column; align-items:flex-start; justify-content:center; gap:12px; }
.overview-empty-copy { color:#7c8b9b; font-size:13px; }
.next-preview { gap:12px; margin-top:15px; padding-top:13px; border-top:1px solid #dce7f1; }
.next-preview-copy { display:flex; min-width:0; flex:1; flex-direction:column; gap:3px; }
.next-preview-label { color:#8192a5; font-size:9px; }
.next-preview-name { overflow:hidden; color:#354a63; font-size:13px; font-weight:550; text-overflow:ellipsis; white-space:nowrap; }
.next-preview-time { flex-shrink:0; color:#70869d; font-size:11px; white-space:nowrap; }
.day-section { margin-top:21px; }
.tomorrow-section { margin-top:19px; }
.section-heading { justify-content:space-between; gap:8px; margin-bottom:10px; }
.section-title-group { min-width:0; gap:9px; }
.section-title { color:#26364a; font-size:16px; font-weight:650; }
.section-count,.section-date { color:#9aa6b4; font-size:10px; white-space:nowrap; }
.section-empty { display:block; padding:14px 2px; color:#9aa6b4; font-size:12px; }
.course-row { position:relative; width:100%; min-height:70px; gap:11px; margin:0 0 9px; padding:11px 12px; border:1px solid #e8edf3; border-radius:15px; background:#fff; box-shadow:0 2px 7px #24364b08; text-align:left; }
.course-row::after { border:0; }
.course-stripe { width:4px; height:39px; flex-shrink:0; border-radius:4px; }
.course-stripe.blue { background:#79a2cd; }.course-stripe.teal { background:#77ab98; }.course-stripe.purple { background:#a28bc0; }.course-stripe.apricot { background:#d5b071; }
.course-copy { min-width:0; flex:1; flex-direction:column; align-items:flex-start; gap:5px; }
.course-name { display:block; max-width:100%; overflow:hidden; color:#29374a; font-size:14px; line-height:1.35; font-weight:550; text-overflow:ellipsis; white-space:nowrap; }
.course-meta { display:block; max-width:100%; overflow:hidden; color:#91a0b0; font-size:10px; line-height:1.3; text-overflow:ellipsis; white-space:nowrap; }
.course-trailing { flex-shrink:0; flex-direction:column; justify-content:center; gap:5px; }
.section-badge { padding:5px 8px; border-radius:9px; background:#eff4fa; color:#6c8299; font-size:10px; white-space:nowrap; }
.ongoing-label { color:#438b70; font-size:9px; white-space:nowrap; }
.course-row.completed { opacity:.52; }
.course-row.completed .course-name,.course-row.completed .course-meta { text-decoration:line-through; }
.course-row.ongoing { border-color:#c9dded; background:#fbfdff; }
@media (max-width:374px) {
  .today-content { padding-left:16px; padding-right:16px; }
  .overview-card { padding:15px 14px; }
  .overview-course { font-size:21px; }
  .overview-time { gap:4px; padding:7px; font-size:10px; }
  .course-row { gap:8px; padding-left:10px; padding-right:10px; }
  .course-name { font-size:13px; }
  .course-meta { font-size:9px; }
}
</style>
