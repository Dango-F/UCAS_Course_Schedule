<template>
  <!-- Android binds renderjs to its owner's root element as soon as the owner mounts. -->
  <SheetBackdrop v-if="rendered" :class="{ 'no-motion': motionDisabled, closing }"
    :exit-epoch="closing ? closeEpoch : 0" @close="requestClose" @finished="finishClose">
    <view class="sheet" :class="{ 'compact-header': compactHeader }" role="dialog" aria-modal="true" :aria-label="title"
      :data-sheet-id="sheetId" :data-motion-duration="motionDuration" @click.stop @touchmove.stop>
      <view class="sheet-handle" />
      <view class="sheet-top"><text class="sheet-title">{{ title }}</text><button class="close-button" aria-label="关闭" @click="requestClose"><AppIcon name="close" /></button></view>
      <NativeScrollArea class="sheet-content"><slot /></NativeScrollArea>
    </view>
  </SheetBackdrop>
</template>
<script lang="ts">
import { defineComponent, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import SheetBackdrop from './SheetBackdrop.vue'
import NativeScrollArea from './NativeScrollArea.vue'
export default defineComponent({
  components: { AppIcon, SheetBackdrop, NativeScrollArea },
  props: {
    open: Boolean, title: { type: String, required: true }, reducedMotion: Boolean, compactHeader: Boolean,
    motionDuration: { type: Number, default: 250 }
  },
  emits: ['close', 'closed'],
  setup(props, { emit }) {
    const sheetId = `sheet-${Math.random().toString(36).slice(2)}`
    // Capture the motion preference when the sheet opens. Keeping this class
    // stable while the sheet is visible prevents CSS entrance animations from
    // restarting when the preference switch is tapped inside the sheet.
    const motionDisabled = ref(Boolean(props.reducedMotion))
    const rendered = ref(Boolean(props.open))
    const closing = ref(false)
    const closeEpoch = ref(0)
    function requestClose() { if (props.open) emit('close') }
    function finishClose(epoch: number) {
      if (epoch !== closeEpoch.value || props.open || !rendered.value) return
      rendered.value = false
      closing.value = false
      emit('closed')
    }
    watch(() => props.open, open => {
      if (open) {
        rendered.value = true
        closing.value = false
        motionDisabled.value = Boolean(props.reducedMotion)
        return
      }
      if (!rendered.value) return
      const epoch = ++closeEpoch.value
      if (motionDisabled.value) {
        finishClose(epoch)
        return
      }
      closing.value = true
    }, { flush: 'sync' })
// #ifdef H5
    let previousFocus: HTMLElement | null = null
    let focusLayout: ResizeObserver | undefined
    function handleKey(event: KeyboardEvent) {
      if (!props.open) return
      if (event.key === 'Escape') { event.preventDefault(); emit('close') }
      if (event.key === 'Tab') {
        const items = Array.from(document.querySelectorAll<HTMLElement>(`[data-sheet-id="${sheetId}"] uni-button, [data-sheet-id="${sheetId}"] input`))
        if (!items.length) return
        const first = items[0], last = items[items.length - 1]
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }
    }
    watch(() => props.open, async open => {
      if (open) {
        previousFocus = document.activeElement as HTMLElement
        await nextTick()
        if (!props.open) return
        const root = document.querySelector(`[data-sheet-id="${sheetId}"]`)
        root?.querySelectorAll<HTMLElement>('uni-button').forEach(el => { el.tabIndex = 0; el.setAttribute('role','button') })
        const close = root?.querySelector<HTMLElement>('.close-button')
        if (close && props.open) {
          const focusClose = () => {
            focusLayout?.disconnect()
            if (props.open && close.isConnected) close.focus({preventScroll:true})
          }
          if (typeof ResizeObserver === 'undefined') focusClose()
          else {
            focusLayout = new ResizeObserver(focusClose)
            focusLayout.observe(close)
          }
        }
        document.addEventListener('keydown', handleKey)
      } else {
        focusLayout?.disconnect()
        document.removeEventListener('keydown', handleKey)
        previousFocus?.focus({preventScroll:true})
      }
    })
    onBeforeUnmount(() => { focusLayout?.disconnect(); document.removeEventListener('keydown', handleKey) })
// #endif
    return { sheetId, rendered, closing, closeEpoch, motionDisabled, requestClose, finishClose }
  }
})
</script>
<style scoped lang="scss">
.sheet-backdrop { position: fixed; inset: 0; z-index: 100; contain: strict; display: flex; align-items: flex-end; justify-content: center; }
.sheet-backdrop :deep(.sheet-scrim) { position:absolute; inset:0; pointer-events:none; background:rgba(24,42,64,.28); }
.sheet-backdrop:not([data-sheet-driver]):not(.no-motion) { opacity:0; }
.sheet { position:relative; width: 100%; max-width: 480px; background: #fff; border-radius: 28px 28px 0 0; padding: 10px 24px calc(var(--sheet-bottom-gap, 24px) + env(safe-area-inset-bottom)); box-shadow: 0 -12px 60px #2030470c; }
.sheet-backdrop[data-sheet-driver="css"]:not(.no-motion) :deep(.sheet-scrim) { animation: fade-in var(--sheet-duration) ease both; }
.sheet-backdrop[data-sheet-driver="css"][data-exiting] :deep(.sheet-scrim) { animation: fade-out var(--sheet-duration) ease both; }
.sheet-backdrop[data-sheet-driver="css"]:not(.no-motion) .sheet { animation: enter var(--sheet-duration) var(--sheet-easing) both; }
.sheet-backdrop[data-sheet-driver="css"][data-exiting] .sheet { animation: exit var(--sheet-duration) var(--sheet-easing) both; }
.sheet-handle { width: 32px; height: 4px; background: #dce3eb; border-radius: 4px; margin: 0 auto 12px; }
.sheet-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.sheet.compact-header { padding-top: 6px; }
.compact-header .sheet-handle { margin-bottom: 2px; }
.compact-header .sheet-top { min-height: 36px; margin-bottom: 4px; }
/* The close target borrows the gaps around the shorter heading. */
.compact-header .close-button { margin-block: -4px; }
.compact-header .close-button:focus-visible { outline-offset: -2px; }
.sheet-title { font-size: 14px; color: #718096; }
.close-button { width: 44px; height: 44px; border-radius: 50%; background: #f6f8fc; display:flex; align-items:center; justify-content:center; }
.sheet-content { max-height: 70vh; }
.no-motion, .no-motion .sheet { animation: none; }
@media (prefers-reduced-motion:reduce) { .sheet-backdrop[data-sheet-driver="css"] { --sheet-duration:0ms !important; } }
@keyframes fade-in { from { opacity:var(--sheet-start-opacity,0); } to { opacity:1; } }
@keyframes fade-out { from { opacity:var(--sheet-start-opacity,1); } to { opacity:0; } }
@keyframes enter { from { transform:var(--sheet-start-transform,translate3d(0,100%,0)); opacity:1; } to { transform:translate3d(0,0,0); opacity:1; } }
@keyframes exit { from { transform:var(--sheet-start-transform,translate3d(0,0,0)); opacity:1; } to { transform:translate3d(0,100%,0); opacity:1; } }
</style>
