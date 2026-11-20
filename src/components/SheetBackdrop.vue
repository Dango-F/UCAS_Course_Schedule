<template>
  <view class="sheet-backdrop" :exit-epoch="exitEpoch" :change:exit-epoch="sheetView.setExit"
    @click="$emit('close')" @touchmove.stop.prevent>
    <view class="sheet-scrim" aria-hidden="true" />
    <slot />
  </view>
</template>
<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  props: { exitEpoch: { type: Number, required: true } },
  emits: ['close', 'finished'],
  methods: {
    finishClose(epoch: number) { this.$emit('finished', epoch) }
  }
})
</script>
<script module="sheetView" lang="renderjs">
import { createSurfaceMotion, SURFACE_ENTER_EASING, SURFACE_EXIT_EASING } from './surface-motion.js'

function ignoreExitClick(event) { event.stopPropagation() }
function remainingDuration(full, closing, offset, opacity) {
  // Panel translation and scrim opacity use different easings. Give them one
  // finish time, long enough for the one farther from its destination.
  const remaining = closing ? Math.max(1 - offset, opacity) : Math.max(offset, 1 - opacity)
  return full * Math.max(0, Math.min(1, remaining))
}
export default {
  mounted() {
    if (this.$el && this.$ownerInstance && this.sheetEpoch == null) this.setExit(0, null, this.$ownerInstance, this)
  },
  beforeUnmount() {
    this.reduce?.removeEventListener?.('change', this.onPreference)
    this.waitForSheet?.disconnect()
    this.sheetSlide?.cancel()
    this.shade?.cancel()
    clearTimeout(this.exitFallback)
  },
  methods: {
    setExit(epoch, previous, owner, instance) {
      const backdrop = instance.$el
      const sheet = backdrop?.querySelector?.('.sheet')
      const scrim = backdrop?.querySelector?.('.sheet-scrim')
      if (!backdrop?.querySelector || this.sheetEpoch === epoch) return
      this.waitForSheet?.disconnect()
      if (!sheet || !scrim) {
        this.waitForSheet = new MutationObserver(() => this.setExit(epoch, previous, owner, instance))
        this.waitForSheet.observe(backdrop, {childList:true, subtree:true})
        return
      }
      this.sheetEpoch = epoch
      if (!this.reduce) {
        this.reduce = backdrop.ownerDocument.defaultView.matchMedia('(prefers-reduced-motion: reduce)')
        this.onPreference = event => {
          if (!event.matches) return
          this.shade?.finish()
          this.sheetSlide?.finish()
          this.cssFinish?.()
        }
        this.reduce.addEventListener?.('change', this.onPreference)
      }
      const fullDuration = this.reduce.matches || backdrop.classList.contains('no-motion') ? 0 : Number(sheet.dataset.motionDuration)
      const easing = epoch ? SURFACE_EXIT_EASING : SURFACE_ENTER_EASING
      if (sheet.animate) {
        if (!this.sheetSlide) {
          this.sheetSlide = createSurfaceMotion(sheet, 'transform', y => `translate3d(0,${y*100}%,0)`, 1)
          this.shade = createSurfaceMotion(scrim, 'opacity', String, 0)
        }
        backdrop.dataset.sheetDriver = 'native'
        if (epoch) {
          backdrop.dataset.exiting = String(epoch)
          backdrop.addEventListener('click', ignoreExitClick, true)
        } else {
          backdrop.removeAttribute('data-exiting')
          backdrop.removeEventListener('click', ignoreExitClick, true)
        }
        const duration = remainingDuration(fullDuration, epoch, this.sheetSlide.value(), this.shade.value())
        let pending = 2
        const finished = () => {
          if (--pending === 0 && epoch && backdrop.isConnected && this.sheetEpoch === epoch) owner.callMethod('finishClose', epoch)
        }
        this.shade.play(epoch ? 0 : 1, duration, 'ease', finished)
        this.sheetSlide.play(epoch ? 1 : 0, duration, easing, finished)
        return
      }
      clearTimeout(this.exitFallback)
      sheet.onanimationend = null
      this.cssFinish = null
      let duration = fullDuration
      // A tap or a reopen can interrupt the other animation between two frames.
      if (backdrop.dataset.sheetDriver === 'css') {
        const opacity = getComputedStyle(scrim).opacity
        const transform = getComputedStyle(sheet).transform
        if (Number(opacity) > 0 && Number(opacity) < 1) {
          const rect = sheet.getBoundingClientRect()
          if (rect.height) {
            const offset = 1 - (backdrop.getBoundingClientRect().bottom - rect.top) / rect.height
            duration = remainingDuration(fullDuration, epoch, offset, Number(opacity))
          }
        }
        scrim.style.setProperty('--sheet-start-opacity', opacity)
        sheet.style.setProperty('--sheet-start-transform', transform)
      }
      backdrop.style.setProperty('--sheet-duration', duration + 'ms')
      backdrop.style.setProperty('--sheet-easing', easing)
      backdrop.dataset.sheetDriver = 'css'
      if (epoch && !duration) { owner.callMethod('finishClose', epoch); return }
      if (!epoch) {
        backdrop.removeEventListener('click', ignoreExitClick, true)
        backdrop.removeAttribute('data-exiting')
        return
      }
      backdrop.dataset.exiting = String(epoch)
      backdrop.addEventListener('click', ignoreExitClick, true)
      const finish = () => {
        if (backdrop.isConnected === false || backdrop.dataset.exiting !== String(epoch)) return
        clearTimeout(this.exitFallback)
        sheet.onanimationend = null
        this.cssFinish = null
        owner.callMethod('finishClose', epoch)
      }
      this.cssFinish = finish
      sheet.onanimationend = event => {
        if (event.target === sheet && event.animationName.startsWith('exit')) finish()
      }
      // Some WebViews drop animationend in the background. If the view is
      // still animating on resume, wait for its timeline before removing it.
      this.exitFallback = setTimeout(() => {
        const exit = sheet.getAnimations?.().find(animation => animation.animationName?.startsWith('exit'))
        if (exit?.finished) exit.finished.then(finish, finish)
        else finish()
      }, 1500)
    }
  }
}
</script>
