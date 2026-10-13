<template>
  <view v-if="visible" class="launch-screen" :class="{ 'is-playing': playing, 'is-leaving': leaving, 'is-quiet': quiet }" role="status" aria-label="湖畔课表正在启动" @touchmove.stop.prevent>
    <view class="launch-hero">
      <view class="launch-water" aria-hidden="true"><view /><view /></view>
      <image class="launch-hero-art" src="/static/splash/launch-hero.png" mode="aspectFit" aria-label="湖畔课表，让时间，清晰一点。" @load="settleHero" @error="settleHero" />
    </view>
    <image class="launch-school" src="/static/splash/launch-school.png" mode="aspectFit" aria-label="中国科学院大学。非官方课表应用。" @load="settleSchool" @error="settleSchool" />
  </view>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { closeNativeLaunchScreen } from '../services/launch-screen'

const props = defineProps<{ ready: boolean; reducedMotion: boolean }>()
const emit = defineEmits<{ (event: 'finished'): void }>()
const visible = ref(true)
const playing = ref(false)
const leaving = ref(false)
const heroSettled = ref(false)
const schoolSettled = ref(false)
const systemQuiet = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
const quiet = computed(() => props.reducedMotion || systemQuiet)
let started = false
let disposed = false
const timers = new Set<ReturnType<typeof setTimeout>>()
function later(callback: () => void, delay: number): void {
  const timer = setTimeout(() => { timers.delete(timer); if (!disposed) callback() }, delay)
  timers.add(timer)
}
function finish(): void {
  if (!visible.value) return
  timers.forEach(clearTimeout); timers.clear()
  closeNativeLaunchScreen()
  visible.value = false
  emit('finished')
}
function settleHero(): void { heroSettled.value = true }
function settleSchool(): void { schoolSettled.value = true }
async function start(): Promise<void> {
  if (started || !props.ready || !heroSettled.value || !schoolSettled.value) return
  started = true
  await nextTick()
  // Give the native WebView a frame to paint both assets before removing splash.
  later(() => {
    closeNativeLaunchScreen()
    playing.value = true
    if (quiet.value) { finish(); return }
    later(() => { leaving.value = true }, 600)
    later(finish, 820)
  }, 32)
}
watch([() => props.ready, heroSettled, schoolSettled], () => { void start() }, { immediate: true, flush: 'post' })
watch(quiet, reduced => { if (reduced && started) finish() })
onMounted(() => { later(finish, 1800) })
onUnmounted(() => { disposed = true; timers.forEach(clearTimeout); timers.clear(); closeNativeLaunchScreen() })
</script>

<style scoped lang="scss">
.launch-screen { position:fixed; top:0; right:0; bottom:0; left:0; z-index:10000; overflow:hidden; background:#f6f8fc; opacity:1; transition:opacity 220ms cubic-bezier(.2,0,.2,1); }
.launch-screen.is-leaving { opacity:0; pointer-events:none; }
.launch-hero { position:absolute; width:220px; height:172px; top:18%; top:max(32px,18%); left:50%; transform:translateX(-50%); }
.launch-hero-art { position:relative; display:block; width:220px; height:172px; }
.launch-school { position:absolute; bottom:8%; bottom:max(32px,8%); left:50%; transform:translateX(-50%); width:128px; height:48px; }
.launch-water { position:absolute; left:70px; top:8px; width:80px; height:80px; }
.launch-water > view { position:absolute; top:0; right:0; bottom:0; left:0; border:1px solid rgba(82,125,168,.15); border-radius:18px; opacity:0; }
.launch-hero-art,.launch-school { opacity:0; }
.is-playing .launch-hero-art,.is-playing .launch-school { animation:launch-reveal 180ms ease-out both; }
.is-playing .launch-water > view { animation:launch-ripple 400ms cubic-bezier(.2,.6,.25,1) both; }
.is-playing .launch-water > view { animation-delay:180ms; }
.is-playing .launch-water > view:last-child { animation-delay:280ms; }
@keyframes launch-ripple { 0% { transform:scale(.9); opacity:0; } 25% { opacity:.65; } 100% { transform:scale(1.28); opacity:0; } }
@keyframes launch-reveal { from { opacity:0; } to { opacity:1; } }
.is-quiet,.is-quiet * { animation:none !important; transition:none !important; }
.is-quiet .launch-hero-art,.is-quiet .launch-school { opacity:1; }
@media (max-height:430px) { .launch-hero { top:12px; transform:translateX(-50%) scale(.62); transform-origin:top center; }.launch-school { bottom:12px; width:80px; height:30px; } }
@media (prefers-reduced-motion:reduce) { .launch-screen,.launch-screen * { animation:none !important; transition:none !important; }.launch-hero-art,.launch-school { opacity:1; } }
</style>
