<template>
  <view id="calendar-native-root" class="calendar-native"
    :motion-config="motionConfig" :change:motion-config="nativeSwipe.configure">
    <!-- Fixed chronological slots, not a recycled/rebased three-panel track.
         Only the view controller owns transform; Vue never writes its position. -->
    <view class="week-track">
      <view v-for="(weekPanel, index) in panels" :key="index" class="week-page"
        :style="{ left: `${index * 100}%` }">
        <view v-if="weekPanel && preparedViews[weekPanel.week]" class="week-panel-content"
          :data-week="weekPanel.week" :data-calendar-panel="preparedViews[weekPanel.week].active === viewMode ? 'ready' : 'pending'">
          <view v-if="preparedViews[weekPanel.week].grid" v-show="preparedViews[weekPanel.week].active === 'grid'"
            class="week-view-layer" :data-calendar-view="preparedViews[weekPanel.week].active === 'grid' ? 'active' : 'cached'">
            <CalendarWeekPanel :key="weekPanel.week"
              :week-panel="weekPanel" :today-iso="todayIso" :focused-day-iso="focusedDayIso"
              @day="$emit('day', $event)" @group="$emit('group', $event)"
              @empty="$emit('empty')" @demo="$emit('demo')" />
          </view>
          <view v-if="preparedViews[weekPanel.week].list" v-show="preparedViews[weekPanel.week].active === 'list'"
            class="week-view-layer" :data-calendar-view="preparedViews[weekPanel.week].active === 'list' ? 'active' : 'cached'">
            <CalendarWeekList :key="weekPanel.week"
              :week-panel="weekPanel" :today-iso="todayIso" :focused-day-iso="focusedDayIso"
              @day="$emit('day', $event)" @group="$emit('group', $event)"
              @empty="$emit('empty')" @demo="$emit('demo')" />
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script lang="ts">
import { defineComponent, onBeforeUnmount, ref, shallowRef, watch, type PropType } from 'vue'
import CalendarWeekPanel from './CalendarWeekPanel.vue'
import CalendarWeekList from './CalendarWeekList.vue'
import type { WeekPanel } from '../domain/calendar-view'
import { createCalendarViewPreparation, type PreparedWeekViews } from './calendar-view-preparation'
export default defineComponent({
  components: { CalendarWeekPanel, CalendarWeekList },
  props: {
    week: { type: Number, required: true },
    panels: { type: Array as PropType<(WeekPanel | null)[]>, required: true },
    viewMode: { type: String as PropType<'grid' | 'list'>, default: 'grid' },
    reducedMotion: Boolean,
    todayIso: { type: String, required: true },
    focusedDayIso: { type: String, required: true }
  },
  emits: ['week', 'day', 'group', 'empty', 'demo'],
  setup(props, { emit }) {
    const preparedViews = shallowRef<PreparedWeekViews>({})
    const preparation = createCalendarViewPreparation(views => { preparedViews.value = views })
    watch(() => [props.week, props.viewMode, props.panels], () => {
      preparation.sync(props.week, props.viewMode, props.panels.filter((panel): panel is WeekPanel => panel !== null).map(panel => panel.week))
    }, { immediate: true })
    onBeforeUnmount(() => preparation.dispose())
    let lastReported = props.week
    const motionConfig = ref({ week: props.week, maxWeek: props.panels.length, reducedMotion: props.reducedMotion, revision: 0 })
    watch(() => [props.week, props.panels.length, props.reducedMotion], () => {
      const previous = motionConfig.value
      // Own target acknowledgements must not cancel a newer view-layer gesture.
      if (props.week === lastReported && props.panels.length === previous.maxWeek && props.reducedMotion === previous.reducedMotion) return
      lastReported = props.week
      motionConfig.value = { week: props.week, maxWeek: props.panels.length, reducedMotion: props.reducedMotion, revision: previous.revision + 1 }
    })
    function acceptWeek(detail: { week: number; revision: number }) {
      if (detail.revision !== motionConfig.value.revision || !Number.isInteger(detail.week) || detail.week < 1 || detail.week > props.panels.length) return
      lastReported = detail.week
      emit('week', detail.week)
    }
    return { motionConfig, acceptWeek, preparedViews }
  },
  methods: {
    onViewWeekTarget(detail: { week: number; revision: number }) { this.acceptWeek(detail) }
  }
})
</script>

<script module="nativeSwipe" lang="renderjs">
import { createStableWeekController } from './stable-week-motion.js'
let controller, config, readyTimer
export default {
  mounted() {
    controller?.destroy()
    controller = null
    clearTimeout(readyTimer)
    const owner = this
    const bind = (attempt = 0) => {
      const root = document.getElementById('calendar-native-root')
      if (!root?.querySelector('.week-track') || !config) {
        if (attempt < 30) readyTimer = setTimeout(() => bind(attempt + 1), 16)
        return
      }
      controller = createStableWeekController(root, config, detail => owner.$ownerInstance?.callMethod('onViewWeekTarget', detail))
    }
    bind()
  },
  beforeUnmount() {
    clearTimeout(readyTimer)
    controller?.destroy()
    controller = null
    config = null
  },
  methods: {
    configure(value) {
      if (!value) return
      config = value
      controller?.configure(value)
    }
  }
}
</script>

<style scoped>
.calendar-native { position:relative; flex:1; min-height:0; height:0; overflow:hidden; background:#fff; touch-action:pan-y; }
.week-track { position:absolute; inset:0; width:100%; height:100%; will-change:transform; }
.week-page { position:absolute; top:0; width:100%; height:100%; contain:layout paint style; }
.week-panel-content,.week-view-layer { width:100%; height:100%; }
/* Pending neighbours retain their outgoing view until their replacement is
   mounted. The controller admits only a contiguous range of ready panels. */
</style>
