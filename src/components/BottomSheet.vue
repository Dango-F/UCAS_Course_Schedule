<template>
  <view v-if="rendered" class="sheet-backdrop" :class="{ 'no-motion': motionDisabled, closing }" @click="$emit('close')" @touchmove.stop.prevent>
    <view class="sheet" role="dialog" aria-modal="true" :aria-label="title" :data-sheet-id="sheetId" @click.stop @touchmove.stop>
      <view class="sheet-handle" />
      <view class="sheet-top"><text class="sheet-title">{{ title }}</text><button class="close-button" aria-label="关闭" @click="$emit('close')"><AppIcon name="close" /></button></view>
      <scroll-view scroll-y class="sheet-content"><slot /></scroll-view>
    </view>
  </view>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
const props = defineProps<{ open: boolean; title: string; reducedMotion?: boolean }>()
const emit = defineEmits<{ close: [] }>()
const sheetId = `sheet-${Math.random().toString(36).slice(2)}`
// Capture the motion preference when the sheet opens. Keeping this class
// stable while the sheet is visible prevents CSS entrance animations from
// restarting when the preference switch is tapped inside the sheet.
const motionDisabled = ref(Boolean(props.reducedMotion))
const rendered = ref(Boolean(props.open))
const closing = ref(false)
let closeTimer: ReturnType<typeof setTimeout> | undefined
watch(() => props.open, open => {
  if (open) {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = undefined }
    rendered.value = true
    closing.value = false
    motionDisabled.value = Boolean(props.reducedMotion)
    return
  }
  if (!rendered.value) return
  if (motionDisabled.value) {
    rendered.value = false
    closing.value = false
    return
  }
  closing.value = true
  if (closeTimer) clearTimeout(closeTimer)
  closeTimer = setTimeout(() => {
    rendered.value = false
    closing.value = false
    closeTimer = undefined
  }, 270)
}, { flush: 'sync' })
onBeforeUnmount(() => { if (closeTimer) clearTimeout(closeTimer) })
// #ifdef H5
let previousFocus: HTMLElement | null = null
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
    const root = document.querySelector(`[data-sheet-id="${sheetId}"]`)
    root?.querySelectorAll<HTMLElement>('uni-button').forEach(el => { el.tabIndex = 0; el.setAttribute('role','button') })
    root?.querySelector<HTMLElement>('.close-button')?.focus({preventScroll:true})
    document.addEventListener('keydown', handleKey)
  } else {
    document.removeEventListener('keydown', handleKey)
    previousFocus?.focus({preventScroll:true})
  }
})
onBeforeUnmount(() => document.removeEventListener('keydown', handleKey))
// #endif
</script>
<style scoped lang="scss">
.sheet-backdrop { position: fixed; inset: 0; z-index: 100; background: rgba(24,42,64,.28); display: flex; align-items: flex-end; justify-content: center; animation: fade-in .25s ease both; }
.sheet-backdrop.closing { animation: fade-out .25s ease both; }
.sheet { width: 100%; max-width: 480px; background: #fff; border-radius: 28px 28px 0 0; padding: 10px 24px calc(24px + env(safe-area-inset-bottom)); box-shadow: 0 -12px 60px #2030470c; animation: enter .25s cubic-bezier(.22,.8,.3,1) both; }
.sheet-backdrop.closing .sheet { animation: exit .25s cubic-bezier(.7,0,.78,.2) both; }
.sheet-handle { width: 32px; height: 4px; background: #dce3eb; border-radius: 4px; margin: 0 auto 12px; }
.sheet-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.sheet-title { font-size: 14px; color: #718096; }
.close-button { width: 44px; height: 44px; border-radius: 50%; background: #f6f8fc; display:flex; align-items:center; justify-content:center; }
.sheet-content { max-height: 70vh; }
.no-motion, .no-motion .sheet { animation: none; }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes fade-out { from { opacity: 1; } to { opacity: 0; } }
@keyframes enter { from { transform: translate3d(0,100%,0); opacity: 1; } to { transform: translate3d(0,0,0); opacity: 1; } }
@keyframes exit { from { transform: translate3d(0,0,0); opacity: 1; } to { transform: translate3d(0,100%,0); opacity: 1; } }
</style>
