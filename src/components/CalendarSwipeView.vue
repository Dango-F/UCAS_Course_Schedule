<template>
  <view id="calendar-swipe-root" class="calendar-carousel"
    :class="{ dragging, transitioning, rebasing }"
    :data-week="renderConfig.week" :data-max-week="renderConfig.maxWeek"
    :data-reduced-motion="renderConfig.reducedMotion ? 'true' : 'false'"
    :data-state="transitioning || rebasing ? 'busy' : 'idle'">
    <slot />
  </view>
</template>

<script lang="ts">
export default {
  name: 'CalendarSwipeView',
  emits: ['swipe-axis', 'swipe-end', 'swipe-interrupt', 'swipe-settled'],
  props: {
    dragging: { type: Boolean, default: false },
    transitioning: { type: Boolean, default: false },
    rebasing: { type: Boolean, default: false },
    renderConfig: { type: Object, default: () => ({}) }
  },
  methods: {
    onRenderSwipeAxis(detail: unknown) { this.$emit('swipe-axis', detail) },
    onRenderSwipeEnd(detail: unknown) { this.$emit('swipe-end', detail) },
    onRenderSwipeInterrupt(detail: unknown) { this.$emit('swipe-interrupt', detail) },
    onRenderSwipeSettled(detail: unknown) { this.$emit('swipe-settled', detail) }
  }
}
</script>

<script module="swipeView" lang="renderjs">
import { createSwipeController } from './calendar-swipe-engine.js'
let controller
let readyTimer
export default {
  mounted() {
    controller?.destroy()
    clearTimeout(readyTimer)
    const owner = this
    const bind = (attempt = 0) => {
      const root = document.getElementById('calendar-swipe-root')
      if (!root?.querySelector('.calendar-track')) {
        if (attempt < 20) readyTimer = setTimeout(() => bind(attempt + 1), 16)
        return
      }
      controller = createSwipeController(root, (method, value) => {
        owner.$ownerInstance?.callMethod(method, value)
      })
    }
    bind()
  },
  beforeUnmount() {
    clearTimeout(readyTimer)
    controller?.destroy()
    controller = null
  }
}
</script>
