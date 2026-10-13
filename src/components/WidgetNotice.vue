<template>
  <view v-if="rendered && displayedNotice && !guide" class="widget-toast" :class="{ closing, quiet: reducedMotion }" role="status" aria-live="polite" :aria-label="displayedNotice.title"><text>{{ toastText }}</text></view>
  <view v-else-if="rendered && displayedNotice" class="widget-notice-backdrop" :class="{ closing, quiet: reducedMotion }" @click="$emit('close')" @touchmove.stop.prevent>
    <view class="widget-notice" role="dialog" aria-modal="true" :aria-label="displayedNotice.title" @click.stop @touchmove.stop>
      <button class="notice-dismiss" aria-label="关闭添加方法" @click="$emit('close')">×</button>
      <text class="notice-title">{{ displayedNotice.title }}</text>
      <view class="notice-copy"><text v-for="(paragraph, index) in paragraphs" :key="index">{{ paragraph }}</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { widgetToastText, type WidgetNoticePayload } from '../domain/widget-guide'

const props = defineProps<{ notice: WidgetNoticePayload | null; reducedMotion: boolean }>()
const emit = defineEmits<{ close: [] }>()
const rendered = ref(false)
const displayedNotice = ref<WidgetNoticePayload | null>(null)
const closing = ref(false)
const guide = computed(() => displayedNotice.value?.presentation === 'guide')
const paragraphs = computed(() => displayedNotice.value?.message.split(/\n\s*\n/).filter(Boolean) || [])
const toastText = computed(() => displayedNotice.value ? widgetToastText(displayedNotice.value) : '')
let closeTimer: ReturnType<typeof setTimeout> | undefined
let autoTimer: ReturnType<typeof setTimeout> | undefined
function clearTimers(): void {
  if (closeTimer) clearTimeout(closeTimer)
  if (autoTimer) clearTimeout(autoTimer)
  closeTimer = autoTimer = undefined
}
watch(() => props.notice, notice => {
  clearTimers()
  if (notice) {
    displayedNotice.value = notice; rendered.value = true; closing.value = false
    if (notice.presentation !== 'guide') autoTimer = setTimeout(() => { autoTimer = undefined; emit('close') }, 1600)
    return
  }
  if (!rendered.value) return
  if (props.reducedMotion) { rendered.value = false; displayedNotice.value = null; return }
  closing.value = true
  closeTimer = setTimeout(() => { rendered.value = false; displayedNotice.value = null; closing.value = false; closeTimer = undefined }, 180)
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(clearTimers)
</script>

<style scoped>
.widget-toast { position:fixed; z-index:100; left:50%; bottom:28px; bottom:calc(28px + env(safe-area-inset-bottom)); transform:translateX(-50%); box-sizing:border-box; width:max-content; max-width:calc(100% - 48px); padding:10px 18px; border:0; border-radius:24px; background:rgba(238,240,243,.9); color:#394758; box-shadow:0 3px 12px #2030470d; font-size:13px; line-height:1.5; text-align:center; pointer-events:none; animation:toast-in .18s ease both; }
.widget-toast.closing { animation:toast-out .18s ease both; }
.widget-toast text { display:block; max-width:310px; }
.widget-notice-backdrop { position:absolute; inset:0; z-index:80; display:flex; align-items:center; justify-content:center; box-sizing:border-box; padding:24px; background:rgba(24,42,64,.27); animation:guide-in .18s ease both; }
.widget-notice-backdrop.closing { animation:guide-out .18s ease both; pointer-events:none; }
.widget-notice { position:relative; box-sizing:border-box; width:100%; max-width:350px; padding:28px 24px 24px; border:1px solid #e2ebf4; border-radius:24px; background:#f8fbfd; box-shadow:0 22px 68px rgba(31,57,83,.16); }
.notice-dismiss { position:absolute; top:3px; right:3px; display:flex; align-items:center; justify-content:center; width:44px; height:44px; font-size:24px; color:#71869d; background:transparent; border:0; }
.notice-dismiss::after { border:0; }
.notice-title { display:block; padding-right:18px; color:#203047; font-size:18px; font-weight:600; line-height:1.4; }
.notice-copy { display:flex; flex-direction:column; gap:9px; max-height:42vh; overflow-y:auto; margin-top:14px; }
.notice-copy text { display:block; color:#65788b; font-size:13px; line-height:1.65; white-space:pre-line; }
.quiet,.quiet * { animation:none !important; }
@media (prefers-reduced-motion:reduce) { .widget-toast,.widget-notice-backdrop { animation:none !important; } }
@keyframes toast-in { from { opacity:0; margin-bottom:-5px; } to { opacity:1; margin-bottom:0; } }
@keyframes toast-out { to { opacity:0; margin-bottom:-4px; } }
@keyframes guide-in { from { opacity:0; } to { opacity:1; } }
@keyframes guide-out { to { opacity:0; } }
</style>
