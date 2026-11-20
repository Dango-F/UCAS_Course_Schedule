<template>
  <view :id="name + '-slide-' + epoch" class="slide-detail" :data-route-phase="phase"
    :class="{ 'route-moving': phase === 'entering' || phase === 'leaving', 'route-leaving': phase === 'leaving' }"
    :style="{ '--settings-route-duration': SETTINGS_ROUTE_DURATION + 'ms', '--settings-route-exit-duration': exitDuration + 'ms' }"
    :inert="phase === 'leaving' || phase === 'idle' ? true : undefined" :aria-hidden="phase === 'idle' ? 'true' : undefined"
    :slide-motion="{ phase, epoch, enterDuration: SETTINGS_ROUTE_DURATION, exitDuration }" :change:slide-motion="slideView.prepare"
    @transitionend.self="onTransitionEnd">
    <slot />
  </view>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue'
import { SETTINGS_ROUTE_DURATION, type SlidePhase } from './settings-route'

export default defineComponent({
  props: {
    name: { type: String, required: true },
    epoch: { type: Number, required: true },
    phase: { type: String as PropType<SlidePhase>, required: true },
    exitDuration: { type: Number, required: true }
  },
  emits: ['settled', 'running'],
  methods: {
    viewStarted(state: { epoch: number; phase: SlidePhase }) { this.$emit('running', state.epoch, state.phase) },
    viewFinished(state: { epoch: number; phase: SlidePhase }) { this.$emit('settled', state.epoch, state.phase) }
  },
  setup(props, { emit }) {
    function onTransitionEnd(event: TransitionEvent) {
      // uni-app forwards element ids and datasets on both sides of the view bridge.
      // Only the surface's own transform can settle this route.
      const target = event.target as HTMLElement | null
      if (target?.id !== props.name + '-slide-' + props.epoch || target.dataset?.routePhase !== props.phase) return
      if (event.propertyName && event.propertyName !== 'transform') return
      emit('settled', props.epoch, props.phase)
    }
    return { SETTINGS_ROUTE_DURATION, onTransitionEnd }
  }
})
</script>

<script module="slideView" lang="renderjs">
import { createSurfaceMotion, SURFACE_ENTER_EASING, SURFACE_EXIT_EASING } from './surface-motion.js'

export default {
  beforeUnmount() { this.reduce?.removeEventListener?.('change', this.onPreference); this.slide?.cancel() },
  methods: {
    prepare(state, previous, owner, instance) {
      if (!state) return
      const { phase, epoch, enterDuration, exitDuration } = state
      const surface = instance.$el
      const leaving = phase === 'leaving'
      const easing = leaving ? SURFACE_EXIT_EASING : SURFACE_ENTER_EASING
      if (surface.animate) {
        if (this.slide && previous?.phase === phase && previous.epoch === epoch) return
        if (!this.slide) {
          this.slide = createSurfaceMotion(surface, 'transform', x => `translate3d(${x*100}%,0,0)`, 1)
          this.reduce = surface.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)')
          this.onPreference = event => { if (event.matches) this.slide.finish() }
          this.reduce.addEventListener?.('change', this.onPreference)
        }
        surface.dataset.slideDriver = 'native'
        if (phase === 'idle') {
          this.slide.play(1, 0)
          delete surface.dataset.slideReady
          return
        }
        if (phase === 'open') { this.slide.play(0, 0); return }
        if (phase !== 'entering' && phase !== 'leaving') return
        const quiet = surface.closest('.reduced-motion') || this.reduce.matches
        const target = leaving ? 1 : 0
        const remaining = Math.abs(target - this.slide.value())
        const duration = quiet ? 0 : remaining * (leaving ? exitDuration : enterDuration)
        if (!leaving) surface.dataset.slideReady = 'true'
        owner.callMethod('viewStarted', {epoch, phase})
        this.slide.play(target, duration, easing, () => {
          if (surface.isConnected) owner.callMethod('viewFinished', {epoch, phase})
        })
        return
      }
      if (phase === 'entering' || leaving) surface.style.setProperty('--slide-easing', easing)
      if (phase === 'idle') delete surface.dataset.slideReady
      if (phase !== 'entering') return
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (surface.isConnected && surface.dataset.routePhase === 'entering') surface.dataset.slideReady = 'true'
      }))
    }
  }
}
</script>

<style scoped>
.slide-detail { transform:translate3d(100%,0,0); transition:transform var(--settings-route-duration) var(--slide-easing,ease); }
.slide-detail[data-route-phase="entering"][data-slide-ready="true"],.slide-detail[data-route-phase="open"] { transform:translate3d(0,0,0); }
.slide-detail[data-slide-driver="native"] { transition:none; }
.slide-detail[data-route-phase="open"]:not([data-slide-ready="true"]) { transition:none; }
.slide-detail.route-moving { will-change:transform; }
.slide-detail.route-leaving { pointer-events:none; transition-duration:var(--settings-route-exit-duration); }
.reduced-motion .slide-detail { transition:none !important; }
@media (prefers-reduced-motion:reduce) { .slide-detail { transition-duration:.001ms !important; } }
</style>
