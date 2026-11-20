<template>
  <view id="calendar-native-root" class="calendar-native"
    :data-view-mode="viewMode" :data-current-week="week" :data-view-revision="viewRevision"
    :data-quiet="reducedMotion" :data-visible="visible ? 'true' : 'false'"
    :grid-add-dismissal="gridAddDismissal" :change:grid-add-dismissal="nativeSwipe.dismissGridAdd"
    :motion-config="motionConfig" :change:motion-config="nativeSwipe.configure">
    <!-- Fixed chronological slots, not a recycled/rebased three-panel track.
         Only the view controller owns transform; Vue never writes its position. -->
    <view class="week-track">
      <view v-for="(weekPanel, index) in panels" :key="index" class="week-page"
        :style="{ left: `${index * 100}%` }">
        <view v-if="weekPanel && preparedViews[weekPanel.week]" class="week-panel-content"
          :data-week="weekPanel.week" :data-calendar-panel="preparedViews[weekPanel.week].active === viewMode ? 'ready' : 'pending'">
          <view v-if="preparedViews[weekPanel.week].grid" class="week-view-layer week-grid-layer"
            :inert="preparedViews[weekPanel.week].active !== 'grid' || undefined"
            :aria-hidden="preparedViews[weekPanel.week].active !== 'grid' ? 'true' : undefined"
            :data-calendar-view="preparedViews[weekPanel.week].active === 'grid' ? 'active' : 'cached'">
            <CalendarWeekPanel :key="weekPanel.week"
              :week-panel="weekPanel" :today-iso="todayIso" :focused-day-iso="focusedDayIso"
              @day="$emit('day', $event)" @group="$emit('group', $event)"
              @empty="$emit('empty')" @demo="$emit('demo')" />
          </view>
          <view v-if="preparedViews[weekPanel.week].list" class="week-view-layer week-list-layer"
            :inert="preparedViews[weekPanel.week].active !== 'list' || undefined"
            :aria-hidden="preparedViews[weekPanel.week].active !== 'list' ? 'true' : undefined"
            :data-calendar-view="preparedViews[weekPanel.week].active === 'list' ? 'active' : 'cached'">
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
import type { GridSlot } from '../domain/grid-edit'
import type { WeekPanel } from '../domain/calendar-view'
import { createCalendarViewPreparation, type PreparedWeekViews } from './calendar-view-preparation'
export default defineComponent({
  components: { CalendarWeekPanel, CalendarWeekList },
  props: {
    week: { type: Number, required: true },
    panels: { type: Array as PropType<(WeekPanel | null)[]>, required: true },
    viewMode: { type: String as PropType<'grid' | 'list'>, default: 'grid' },
    gridAddDismissal: { type: Number, default: 0 },
    visible: { type: Boolean, default: true },
    reducedMotion: Boolean,
    todayIso: { type: String, required: true },
    focusedDayIso: { type: String, required: true }
  },
  emits: ['grid-edit', 'week', 'day', 'group', 'empty', 'demo'],
  setup(props, { emit }) {
    const preparedViews = shallowRef<PreparedWeekViews>({})
    const viewRevision = ref(0)
    const preparation = createCalendarViewPreparation(views => { preparedViews.value = views })
    watch([() => props.week, () => props.viewMode, () => props.panels, () => props.reducedMotion], ([week, mode, panels, quiet]) => {
      const available = panels.filter((panel): panel is WeekPanel => panel !== null).map(panel => panel.week)
      viewRevision.value = preparation.sync(week, mode, available, !quiet)
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
    return { motionConfig, acceptWeek, preparedViews, viewRevision, onListMotionSettled: preparation.settle }
  },
  methods: {
    onGridEdit(slot: GridSlot) { this.$emit('grid-edit', slot) },
    onViewWeekTarget(detail: { week: number; revision: number }) { this.acceptWeek(detail) }
  }
})
</script>

<script module="nativeSwipe" lang="renderjs">
import { createStableWeekController } from './stable-week-motion.js'
import { observeCalendarListMotion } from './calendar-list-motion.js'
let controller, config, readyTimer, stopListMotion
export default {
  mounted() {
    controller?.destroy()
    stopListMotion?.()
    controller = null
    clearTimeout(readyTimer)
    const owner = this
    const bind = (attempt = 0) => {
      const root = document.getElementById('calendar-native-root')
      if (!root?.querySelector('.week-track') || !config) {
        if (attempt < 30) readyTimer = setTimeout(() => bind(attempt + 1), 16)
        return
      }
      controller = createStableWeekController(root, config, detail => owner.$ownerInstance?.callMethod('onViewWeekTarget', detail),
        slot => owner.$ownerInstance?.callMethod('onGridEdit', slot))
      stopListMotion = observeCalendarListMotion(root, change => owner.$ownerInstance?.callMethod('onListMotionSettled', change))
    }
    bind()
  },
  beforeUnmount() {
    clearTimeout(readyTimer)
    controller?.destroy()
    stopListMotion?.()
    stopListMotion = null
    controller = null
    config = null
  },
  methods: {
    dismissGridAdd() { controller?.dismissGridAdd() },
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
.week-panel-content { position:relative; width:100%; height:100%; }
.week-view-layer { position:absolute; inset:0; }
/* Hide the cached layer as a unit. Android WebView 99 can retain inherited
   visibility:hidden on previously animated cards after their layer reopens. */
.week-view-layer[data-calendar-view="cached"] { display:none; pointer-events:none; }
.week-panel-content[data-list-animating] > .week-view-layer { display:block; }
.week-panel-content[data-list-animating] > .week-list-layer[data-calendar-view="cached"] { opacity:0; }
/* A cold view can arrive in a later App WebView patch. Keep the source painted until then. */
.week-panel-content[data-list-preparing="list"] > .week-grid-layer,
.week-panel-content[data-list-preparing="grid"] > .week-list-layer { display:block; }
.week-panel-content[data-list-preparing="list"] > .week-list-layer,
.week-panel-content[data-list-preparing="grid"] > .week-grid-layer { display:none; }
/* Pending neighbours retain their outgoing view until their replacement is
   mounted. The controller admits only a contiguous range of ready panels. */
.calendar-native :deep(.calendar-body) { -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
.calendar-native :deep(.grid-drag-selection) { position:absolute; z-index:4; width:calc(100% / 7 - 2px); min-width:0; box-sizing:border-box; border:2px solid #527da8; border-radius:8px; display:flex; flex-direction:column; align-items:stretch; background:#edf5fc; color:#315d89; pointer-events:auto; touch-action:none; box-shadow:0 2px 8px #36557230; }
.calendar-native :deep(.grid-drag-selection.is-pending) { pointer-events:none; }
.calendar-native :deep(.grid-drag-selection [data-grid-action]) { appearance:none; border:0; background:transparent; color:inherit; font:inherit; margin:0; padding:0; cursor:pointer; }
.calendar-native :deep(.grid-drag-selection .grid-drag-handle) { flex:0 0 13px; font-size:15px; line-height:13px; }
.calendar-native :deep(.grid-drag-selection .grid-drag-edit) { flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; font-size:11px; line-height:13px; font-weight:600; }
.calendar-native :deep(.grid-drag-caption) { font-size:9px; font-weight:400; }
.calendar-native :deep(.grid-drag-choices) { width:calc(100% / 7); z-index:5; height:auto!important; min-height:54px; }
.calendar-native :deep(.grid-drag-selection .grid-drag-choice) { background:#edf5fc; font-size:10px; line-height:1.3; padding:6px 2px; border-bottom:1px solid #c1d2e2; }
</style>
