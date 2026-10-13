<template>
  <view class="week-list-content" :data-week="weekPanel.week">
    <scroll-view :key="weekPanel.week" class="course-list-scroll" scroll-y :scroll-top="0">
      <view v-if="!weekPanel.tiles.length" class="empty-state">
        <view class="empty-art"><AppIcon name="lake" :size="48" color="#8CA9BF" /><view class="empty-line"/><view class="empty-line short"/></view>
        <text class="empty-title">{{ store.scenario === 'empty' ? '你的时间，等你来安排' : '这一周，暂时没有课' }}</text>
        <text class="empty-copy">{{ store.scenario === 'empty' ? '导入国科大课表，开启清晰有序的新学期。' : '试试切换教学周，或查看已有课程的上课周次。' }}</text>
        <button class="primary-button" :class="{ 'empty-return-current': store.scenario !== 'empty' }" @click="$emit('empty')">
          {{ store.scenario === 'empty' ? '从教务导入' : '回到本周' }}
          <AppIcon name="arrow" :size="18" :color="store.scenario === 'empty' ? 'white' : '#527DA8'" />
        </button>
        <button v-if="store.scenario === 'empty'" class="empty-demo" @click="$emit('demo')">先看看示例课表</button>
      </view>

      <view v-else class="course-list-body">
        <view v-for="day in visibleDays" :key="day.iso" class="list-day-section">
          <button class="list-day-heading" :class="{ today: day.iso === todayIso, focused: day.iso === focusedDayIso }"
            :aria-label="'查看周' + day.label + '，' + day.iso.slice(5) + '课程'" @click="$emit('day', day)">
            <view class="list-day-caption">
              <text class="list-day-name">周{{ day.label }}</text>
              <text class="list-day-date number">{{ day.iso.slice(5) }}</text>
              <text v-if="day.iso === todayIso" class="today-tag">今天</text>
            </view>
            <view class="day-divider" />
            <text class="day-course-count">{{ day.groups.length }} 个时段</text>
          </button>

          <view class="course-cards">
            <view v-for="group in day.groups" :key="group.group.tiles[0].id" class="course-group">
              <button v-for="card in group.cards" :key="card.tile.id" class="course-card"
                :class="[card.tile.course.color, { conflict: group.conflict }]"
                :aria-label="card.label"
                @click="$emit('group', group.group)">
                <view class="course-heading">
                  <text class="course-name">{{ card.tile.course.name }}</text>
                  <text v-if="group.conflict" class="conflict-tag">时段冲突</text>
                </view>
                <text class="course-time number">{{ card.start }} – {{ card.end }}</text>
                <view class="course-meta">
                  <text class="course-sections number">第 {{ card.sections }} 节</text>
                  <text class="meta-separator">·</text>
                  <text class="course-location">@{{ card.location }}</text>
                </view>
              </button>
            </view>
          </view>
        </view>
      </view>

      <view class="calendar-footer">
        <text>{{ store.isDemo ? '示例课程与作息 · 不代表真实教学安排' : '教务导入课表 · 已保存到此设备' }}</text>
        <view class="footer-logo" aria-label="湖畔课表"><AppIcon name="lake" :size="23" color="#8CA9BF" /></view>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import { useScheduleStore } from '../stores/schedule'
import type { layoutTiles } from '../domain/schedule'
import type { WeekPanel } from '../domain/calendar-view'
import { calendarListDays } from '../domain/calendar-list-view'

const props = defineProps<{ weekPanel: WeekPanel; todayIso: string; focusedDayIso: string }>()
defineEmits<{
  (event: 'day', day: WeekPanel['days'][number]): void
  (event: 'group', group: ReturnType<typeof layoutTiles>[number]): void
  (event: 'empty'): void
  (event: 'demo'): void
}>()

const store = useScheduleStore()
const visibleDays = computed(() => calendarListDays(props.weekPanel, store.schedule.periods))
</script>

<style scoped>
.week-list-content { width:100%; height:100%; display:flex; flex-direction:column; overflow:hidden; background:#f6f8fc; contain:layout paint style; }
.course-list-scroll { flex:1; min-height:0; height:0; background:#f6f8fc; touch-action:pan-y; }
.course-list-body { padding:12px 16px 6px; }
.list-day-section + .list-day-section { margin-top:15px; }
.list-day-heading { width:100%; min-height:32px; display:flex; align-items:center; gap:9px; padding:0 2px; margin-bottom:10px; text-align:left; background:transparent; }
.list-day-caption { display:flex; align-items:center; gap:7px; flex-shrink:0; }
.list-day-name { font-size:13px; font-weight:600; color:#527da8; white-space:nowrap; }
.list-day-date { font-size:11px; color:#8997a8; white-space:nowrap; }
.today-tag { padding:2px 5px; border-radius:5px; background:#e7eff7; color:#527da8; font-size:9px; line-height:1.2; white-space:nowrap; }
.list-day-heading.focused .list-day-date { color:#527da8; font-weight:600; }
.day-divider { height:1px; flex:1; min-width:8px; background:#e5ebf1; }
.day-course-count { flex-shrink:0; color:#a0adba; font-size:9px; white-space:nowrap; }
.course-cards { display:flex; flex-direction:column; gap:9px; }
.course-group { display:flex; flex-direction:column; gap:7px; }
.course-card { width:100%; min-height:88px; display:flex; flex-direction:column; align-items:stretch; gap:4px; padding:13px 15px 12px; border:1px solid #ffffffaa; border-radius:13px; text-align:left; box-shadow:0 2px 8px #3048600a; }
.course-heading { width:100%; display:flex; align-items:flex-start; gap:8px; }
.course-name { min-width:0; flex:1; font-size:17px; font-weight:600; line-height:1.42; letter-spacing:.1px; overflow-wrap:anywhere; }
.course-time { display:block; margin-top:1px; font-size:14px; font-weight:500; line-height:1.45; opacity:.88; white-space:nowrap; }
.course-meta { width:100%; display:flex; align-items:baseline; flex-wrap:wrap; gap:5px; font-size:11px; line-height:1.55; color:currentColor; opacity:.76; }
.course-sections { flex-shrink:0; white-space:nowrap; }
.meta-separator { opacity:.7; }
.course-location { min-width:0; overflow-wrap:anywhere; }
.conflict-tag { flex-shrink:0; padding:3px 6px; border-radius:6px; background:#ffffffb8; color:#986448; font-size:9px; line-height:1.2; }
.blue { background:#e5eef8; color:#426c96; }
.teal { background:#e5f1ec; color:#4f7c6d; }
.purple { background:#eee9f6; color:#7a659b; }
.apricot { background:#faf0df; color:#a1814e; }
.conflict { border:1px dashed #b18466; }
.calendar-footer { text-align:center; padding:22px 0 calc(104px + env(safe-area-inset-bottom)); color:#a3b0bd; font-size:9px; }
.footer-logo { display:flex; align-items:center; justify-content:center; margin-top:7px; opacity:.9; }
.empty-state { min-height:410px; padding:45px 30px; display:flex; flex-direction:column; align-items:center; text-align:center; }
.empty-art { width:106px; height:106px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:7px; margin-bottom:27px; }
.empty-line { height:2px; width:37px; background:#d6e2ec; border-radius:2px; }
.empty-line.short { width:25px; }
.empty-title { font-size:19px; font-weight:600; }
.empty-copy { margin:12px 0 25px; color:#8b9aaa; font-size:12px; line-height:1.8; }
.empty-return-current { min-height:48px !important; padding:0 12px !important; border-radius:0 !important; background:transparent !important; color:#527da8 !important; box-shadow:none !important; }
.empty-demo { min-height:44px; margin-top:10px; color:#718096; font-size:12px; }
@media (max-width:374px) {
  .course-list-body { padding-right:12px; padding-left:12px; }
  .course-card { padding-right:12px; padding-left:12px; }
  .course-name { font-size:16px; }
}
</style>
