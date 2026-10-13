<template>
  <view class="glass-clarity-setting">
    <view class="clarity-heading">
      <view class="clarity-copy"><text>玻璃通透度</text></view>
      <text class="clarity-value number" aria-hidden="true">{{ appearance.glassClarity }}</text>
    </view>
    <GlassMaterialPreview :clarity="appearance.glassClarity" :hop-preview-run="hopPreviewRun" :hop-preview-stop="hopPreviewStop" />
    <slider class="clarity-slider" :value="appearance.glassClarity" :min="0" :max="100" :step="1"
      active-color="#527da8" background-color="#e7edf4" block-color="#ffffff" :block-size="22"
      role="slider" tabindex="0" aria-label="玻璃通透度"
      :aria-valuemin="0" :aria-valuemax="100" :aria-valuenow="appearance.glassClarity"
      :aria-valuetext="`通透度 ${appearance.glassClarity}，向右更清透`"
      @changing="preview" @change="commit" @keydown="onKeydown" />
    <view class="clarity-scale" aria-hidden="true"><text>柔雾</text><text>均衡</text><text>清透</text></view>
    <view class="clarity-footer"><text>调节档位，并非实际透光率</text><button class="clarity-reset" role="button" tabindex="0" aria-label="恢复默认玻璃通透度" @click="appearance.saveClarity(DEFAULT_GLASS_CLARITY)" @keydown.enter.prevent="appearance.saveClarity(DEFAULT_GLASS_CLARITY)" @keydown.space.prevent="appearance.saveClarity(DEFAULT_GLASS_CLARITY)">恢复默认</button></view>
    <text v-if="appearance.saveError" class="clarity-error" role="status">已预览，但保存失败；请再次调节重试。</text>
    <button class="touch-light-row" role="switch" tabindex="0" data-glass-touch-light-setting aria-label="滑块光影" :aria-checked="appearance.glassTouchLight"
      @click="appearance.setGlassTouchLight(!appearance.glassTouchLight)" @keydown.enter.prevent="appearance.setGlassTouchLight(!appearance.glassTouchLight)" @keydown.space.prevent="appearance.setGlassTouchLight(!appearance.glassTouchLight)">
      <view class="touch-light-copy"><text>滑块光影</text><text>滑动、长按时的飘带高光</text></view>
      <view class="touch-light-switch" :class="{ on:appearance.glassTouchLight }" aria-hidden="true"><view /></view>
    </button>
    <text v-if="appearance.touchLightSaveError" class="clarity-error" role="status">已生效，但保存失败，请重试。</text>
    <view v-if="appearance.navMotion === 'hop'" class="hop-height-setting">
      <view class="hop-height-heading"><text>跃动峰值抬升</text><text class="hop-height-value number">{{ appearance.navHopPeak }} px</text></view>
      <text class="hop-height-help">松手后，上方导航将从左到右、再从右到左演示</text>
      <slider class="hop-height-slider" :value="appearance.navHopPeak" :min="MIN_HOP_PEAK" :max="MAX_HOP_PEAK" :step="1"
        active-color="#527da8" background-color="#e7edf4" block-color="#ffffff" :block-size="22"
        role="slider" tabindex="0" aria-label="跃动峰值抬升"
        :aria-valuemin="MIN_HOP_PEAK" :aria-valuemax="MAX_HOP_PEAK" :aria-valuenow="appearance.navHopPeak"
        :aria-valuetext="`最高抬升 ${appearance.navHopPeak} 像素`"
        @touchstart="beginPeakAdjustment" @mousedown="beginPeakAdjustment"
        @changing="previewPeak" @change="commitPeak" @keydown="onPeakKeydown" @keyup="onPeakKeyup" />
      <view class="hop-height-footer"><text>轻微 · 2 px</text><button class="hop-height-reset" aria-label="恢复默认跃动高度" @click="resetPeak" @keydown.enter.prevent="resetPeak" @keydown.space.prevent="resetPeak">恢复默认</button><text>明显 · 9 px</text></view>
      <text v-if="appearance.hopPeakSaveError" class="clarity-error" role="status">已调整，但保存失败；请再次调节重试。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { useAppearanceStore } from '../stores/appearance'
import { DEFAULT_GLASS_CLARITY } from '../domain/glass-material'
import { DEFAULT_HOP_PEAK, MIN_HOP_PEAK, MAX_HOP_PEAK } from '../domain/navigation-hop'
import GlassMaterialPreview from './GlassMaterialPreview.vue'

const appearance = useAppearanceStore()
const hopPreviewRun = ref(0)
const hopPreviewStop = ref(0)
let peakDragging = false
let peakKeyPending = false
type SliderEvent = { detail: { value: number } }
function preview(event: SliderEvent) { appearance.previewClarity(event.detail.value) }
function commit(event: SliderEvent) { appearance.saveClarity(event.detail.value) }
function beginPeakAdjustment() {
  if (peakDragging) return
  peakDragging = true
  hopPreviewStop.value += 1
}
function previewPeak(event: SliderEvent) {
  beginPeakAdjustment()
  appearance.previewHopPeak(event.detail.value)
}
function commitPeak(event: SliderEvent) {
  peakDragging = false
  appearance.saveHopPeak(event.detail.value)
  hopPreviewRun.value += 1
}
function resetPeak() {
  peakDragging = false
  appearance.saveHopPeak(DEFAULT_HOP_PEAK)
  hopPreviewRun.value += 1
}
const peakKeys = ['ArrowRight','ArrowUp','ArrowLeft','ArrowDown','Home','End','PageUp','PageDown']
function onPeakKeydown(event: KeyboardEvent) {
  const value = appearance.navHopPeak
  const keys: Record<string, number> = { ArrowRight:value + 1, ArrowUp:value + 1, ArrowLeft:value - 1, ArrowDown:value - 1, Home:MIN_HOP_PEAK, End:MAX_HOP_PEAK, PageUp:value + 2, PageDown:value - 2 }
  if (!(event.key in keys)) return
  event.preventDefault()
  peakKeyPending = true
  appearance.saveHopPeak(keys[event.key])
}
function onPeakKeyup(event: KeyboardEvent) {
  if (!peakKeyPending || !peakKeys.includes(event.key)) return
  peakKeyPending = false
  hopPreviewRun.value += 1
}
function onKeydown(event: KeyboardEvent) {
  const value = appearance.glassClarity
  const keys: Record<string, number> = { ArrowRight:value + 1, ArrowUp:value + 1, ArrowLeft:value - 1, ArrowDown:value - 1, Home:0, End:100, PageUp:value + 10, PageDown:value - 10 }
  if (!(event.key in keys)) return
  event.preventDefault()
  appearance.saveClarity(keys[event.key])
}
// Preserve the last preview if navigation interrupts an unfinished drag.
onUnmounted(() => { appearance.saveClarity(); appearance.saveHopPeak() })
</script>

<style scoped>
.glass-clarity-setting { padding:14px 14px 5px; border-bottom:1px solid #eff2f6; }
.clarity-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.clarity-copy { display:flex; flex-direction:column; gap:4px; color:#2e3d51; font-size:12px; font-weight:550; }
.clarity-value { color:#527da8; font-size:13px; font-weight:600; font-variant-numeric:tabular-nums; }
.clarity-slider { margin:5px 12px 0; border-radius:8px; }
.clarity-slider :deep(.uni-slider-tap-area) { padding:21px 0; }
.clarity-slider :deep(.uni-slider-handle) { width:44px; height:44px; margin-left:-22px; margin-top:-22px; }
.clarity-footer { display:flex; align-items:center; justify-content:space-between; color:#8796a8; font-size:10px; }
.clarity-scale { display:flex; justify-content:space-between; margin:0 12px 3px; color:#8796a8; font-size:10px; }
.clarity-reset { min-height:44px; display:flex; align-items:center; justify-content:center; margin:0; padding:0 14px; color:#527da8; background:transparent; font-size:10px; line-height:1.3; border-radius:8px; }
.clarity-reset::after { border:0; }
.clarity-slider:focus-visible,.clarity-reset:focus-visible { outline:2px solid #527da8; outline-offset:2px; }
.clarity-error { display:block; margin-bottom:9px; color:#976044; font-size:10px; line-height:1.5; }
.touch-light-row { display:flex; align-items:center; justify-content:space-between; gap:14px; width:100%; min-height:54px; margin:4px 0 0; padding:10px 0; border-top:1px solid #eff2f6; text-align:left; }
.touch-light-row::after { border:0; }
.touch-light-copy { display:flex; min-width:0; flex-direction:column; gap:4px; }
.touch-light-copy text:first-child { color:#2e3d51; font-size:12px; font-weight:550; }
.touch-light-copy text:last-child { color:#97a4b2; font-size:9px; line-height:1.35; }
.touch-light-switch { width:37px; height:22px; flex-shrink:0; padding:2px; border-radius:13px; background:#dfe5ec; transition:background .18s ease; }
.touch-light-switch view { width:18px; height:18px; border-radius:50%; background:#fff; box-shadow:0 1px 3px #1d2b3b20; transition:transform .18s ease; }
.touch-light-switch.on { background:#527da8; }.touch-light-switch.on view { transform:translateX(15px); }
.touch-light-row:focus-visible { outline:2px solid #527da8; outline-offset:2px; }
:global(.settings-page.reduced-motion .touch-light-switch),:global(.settings-page.reduced-motion .touch-light-switch view) { transition:none; }
@media (prefers-reduced-motion:reduce) { .touch-light-switch,.touch-light-switch view { transition:none; } }
.hop-height-setting { margin-top:8px; padding-top:14px; border-top:1px solid #eff2f6; }
.hop-height-heading { display:flex; align-items:center; justify-content:space-between; color:#2e3d51; font-size:12px; font-weight:550; }
.hop-height-value { color:#527da8; font-size:13px; font-weight:600; font-variant-numeric:tabular-nums; }
.hop-height-help { display:block; margin-top:4px; color:#8293a5; font-size:10px; line-height:1.5; }
.hop-height-slider { margin:7px 12px 0; border-radius:8px; }
.hop-height-slider :deep(.uni-slider-tap-area) { padding:21px 0; }
.hop-height-slider :deep(.uni-slider-handle) { width:44px; height:44px; margin-left:-22px; margin-top:-22px; }
.hop-height-footer { display:flex; align-items:center; justify-content:space-between; margin:0 0 1px; color:#8796a8; font-size:10px; }
.hop-height-reset { min-height:44px; display:flex; align-items:center; justify-content:center; margin:0; padding:0 8px; color:#527da8; background:transparent; font-size:10px; line-height:1.3; }
.hop-height-reset::after { border:0; }
.hop-height-slider:focus-visible,.hop-height-reset:focus-visible { outline:2px solid #527da8; outline-offset:2px; }
</style>
