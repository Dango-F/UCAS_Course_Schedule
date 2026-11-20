<template>
  <view class="week-calendar" role="group" aria-label="选择第一教学周">
    <view class="month-bar">
      <view class="month-heading" aria-live="polite">
        <text class="month-year number">{{ year }} 年</text>
        <text class="month-title">{{ month + 1 }} 月</text>
      </view>
      <view class="month-arrows">
        <button class="month-arrow" role="button" tabindex="0" aria-label="上个月" @click="changeMonth(-1)" @keydown.enter.prevent="changeMonth(-1)" @keydown.space.prevent="changeMonth(-1)">
          <AppIcon name="left" :size="16" color="#426b8e" />
        </button>
        <button class="month-arrow" role="button" tabindex="0" aria-label="下个月" @click="changeMonth(1)" @keydown.enter.prevent="changeMonth(1)" @keydown.space.prevent="changeMonth(1)">
          <AppIcon name="right" :size="16" color="#426b8e" />
        </button>
      </view>
    </view>
    <view class="weekdays" aria-hidden="true"><text v-for="day in weekdays" :key="day">{{ day }}</text></view>
    <button v-for="week in weeks" :key="week[0]" class="calendar-week" role="button" tabindex="0"
      :class="{ selected: week[0] === monday }" :aria-pressed="week[0] === monday" :aria-label="`选择 ${week[0]} 开始的一周`"
      @click="emit('select', week[0])" @keydown.enter.prevent="emit('select', week[0])" @keydown.space.prevent="emit('select', week[0])">
      <text v-for="(date, index) in week" :key="date" class="calendar-day number"
        :class="{ outside: date.slice(0, 7) !== monthKey, 'week-start': index === 0 }">{{ Number(date.slice(-2)) }}</text>
    </button>
    <text class="calendar-hint">点选一周，以该周周一为起始日</text>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { chinaDate, dateAt, isMonday } from '../domain/schedule'
import AppIcon from './AppIcon.vue'

const props = defineProps<{ monday: string }>()
const emit = defineEmits<{ select: [monday: string] }>()
const weekdays = ['一', '二', '三', '四', '五', '六', '日']
const initial = isMonday(props.monday) ? props.monday : chinaDate(new Date())
const first = ref(new Date(initial.slice(0, 7) + '-01T00:00:00Z'))
const year = computed(() => first.value.getUTCFullYear())
const month = computed(() => first.value.getUTCMonth())
const monthKey = computed(() => first.value.toISOString().slice(0, 7))
const weeks = computed(() => {
  const offset = (first.value.getUTCDay() + 6) % 7
  const lastDay = new Date(Date.UTC(year.value, month.value + 1, 0)).getUTCDate()
  const firstMonday = chinaDate(dateAt(monthKey.value + '-01', 1, 1 - offset))
  return Array.from({ length: Math.ceil((offset + lastDay) / 7) }, (_, row) =>
    weekdays.map((_, column) => chinaDate(dateAt(firstMonday, row + 1, column + 1))))
})
function changeMonth(delta: number): void {
  first.value = new Date(Date.UTC(year.value, month.value + delta, 1))
}
</script>

<style scoped>
.week-calendar {
  box-sizing:border-box;
  width:100%;
  max-width:420px;
  margin:0 auto 12px;
  padding:12px 8px 10px;
  border-radius:22px;
  background:#f1f5f9;
  color:#2e435b;
}
.month-bar,.month-arrows { display:flex; align-items:center; }
.month-bar { justify-content:space-between; margin:0 4px 8px 8px; }
.month-heading { display:flex; flex-direction:column; }
.month-year,.weekdays,.calendar-hint { color:#60748a; font-size:11px; }
.month-title { font-size:21px; font-weight:650; line-height:1.25; }
.month-arrows .month-arrow { display:grid; width:44px; height:44px; place-items:center; background:radial-gradient(circle, #fff 50%, transparent 52%); }
.weekdays,.week-calendar .calendar-week { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); align-items:center; justify-items:center; text-align:center; }
.weekdays { margin-bottom:3px; }
.week-calendar .calendar-week { width:100%; min-height:40px; border-radius:24px; color:#2e435b; font-size:14px; }
.calendar-day { display:grid; place-items:center; width:30px; height:30px; }
.calendar-day.outside { color:#79899b; }
.week-calendar .calendar-week.selected { background:#dbe8f3; color:#315d89; }
.calendar-week.selected .week-start { border-radius:50%; background:#426b8e; color:#fff; font-weight:650; }
.calendar-week:active { background:#e2ebf3; }
.week-calendar button:focus-visible { outline:2px solid #527da8; outline-offset:-2px; }
.calendar-hint { display:block; margin:6px 8px 0; line-height:1.5; }
</style>
