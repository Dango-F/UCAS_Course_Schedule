<template>
  <view class="calendar-heading">
    <view class="axis-heading"><text>{{ month }}月</text></view>
    <button v-for="day in days" :key="day.day" class="day-heading" :class="{ weekend: day.day > 5 }" :aria-label="`查看 ${Number(day.iso.slice(5, 7))} 月 ${day.date} 日的课程`" @click="$emit('day', day)">
      <text class="day-name">{{ day.label }}</text>
      <view class="day-date number" :class="{ today: day.iso === todayIso, focused: day.iso === focusedDayIso }">{{ day.date }}</view>
    </button>
  </view>
</template>

<script setup lang="ts">
import type { WeekPanel } from '../domain/calendar-view'
defineProps<{ month:number; days:WeekPanel['days']; todayIso:string; focusedDayIso:string }>()
defineEmits(['day'])
</script>

<style scoped>
.calendar-heading { flex-shrink:0; display:flex; padding:12px 8px 10px 0; border-bottom:1px solid #edf1f5; background:white; touch-action:pan-y; }
.axis-heading { width:38px; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:9px; color:#94a0b0; }
.day-heading { flex:1; min-height:44px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:5px; padding:0; background:transparent; }
.day-heading:active { background:#f5f8fb; }
.day-name { font-size:10px; color:#8290a3; }
.day-date { font-size:14px; font-weight:500; width:28px; height:28px; border-radius:10px; display:flex; align-items:center; justify-content:center; }
.day-date.today { background:#527DA8; color:white; }
.day-date.focused:not(.today) { color:#527DA8; background:#eef4fa; box-shadow:inset 0 0 0 1px #b8ccdf; }
.day-heading.weekend { color:#9eabb9; }
</style>
