<template>
  <view class="loading-preview" :class="[`lp-${variant}`, { 'is-complete': complete, 'is-quiet': reducedMotion, 'is-paused': paused }]"
    :style="{ '--lp-speed': slow ? 2 : 1 }" aria-hidden="true">
    <view class="lp-art" v-html="loadingMarkup[variant]" />
  </view>
</template>

<script setup lang="ts">
import { loadingMarkup, type LoadingVariant } from './loading-preview'
withDefaults(defineProps<{
  variant: LoadingVariant
  complete?: boolean
  reducedMotion?: boolean
  paused?: boolean
  slow?: boolean
}>(), { complete: false, reducedMotion: false, paused: false, slow: false })
</script>

<!-- uni-app scopes component styles even without the scoped attribute.
     Deep selectors reach the trusted SVG inserted through v-html. -->
<style scoped>
.loading-preview { --lp-cycle:1.4s; --lp-turn-ease:linear; --lp-ring-start:0s; width:112px; height:112px; display:flex; align-items:center; justify-content:center; color:#1d1d1f; }
.loading-preview.lp-original { --lp-cycle:1.45s; --lp-ring-start:.22s; }
.loading-preview.lp-orbit { --lp-cycle:1.8s; --lp-turn-ease:cubic-bezier(.4,.18,.35,1); }
.loading-preview :deep(.lp-art) { width:92px; height:92px; position:relative; }
.loading-preview :deep(svg) { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
.loading-preview :deep(.lp-moving) { position:absolute; inset:0; animation:lp-rotate calc(var(--lp-cycle) * var(--lp-speed)) var(--lp-turn-ease) infinite; will-change:transform; }
.loading-preview :deep(.lp-track), .loading-preview :deep(.lp-ring), .loading-preview :deep(.lp-arc), .loading-preview :deep(.lp-orbit), .loading-preview :deep(.lp-check), .loading-preview :deep(.lp-tick) { fill:none; stroke:currentColor; stroke-width:2.8; stroke-linecap:round; stroke-linejoin:round; }
.loading-preview :deep(.lp-track) { opacity:.08; }
.loading-preview :deep(.lp-ring) { stroke-dasharray:245.044; stroke-dashoffset:245.044; opacity:0; transition:stroke-dashoffset calc(var(--lp-cycle) * var(--lp-speed)) var(--lp-turn-ease), opacity calc(.18s * var(--lp-speed)); }
/* Spend time visibly tracing the full circle, not waiting on an already
   finished ring. Then leave 100ms of rest before a concise check stroke. */
.loading-preview :deep(.lp-check) { stroke-dasharray:60; stroke-dashoffset:60; opacity:0; transition:stroke-dashoffset calc(.5s * var(--lp-speed)) cubic-bezier(.4,0,.2,1), opacity calc(.15s * var(--lp-speed)); transition-delay:calc((var(--lp-cycle) + var(--lp-ring-start) + .1s) * var(--lp-speed)); }
.loading-preview :deep(.lp-arc) { stroke-dasharray:76 245.044; }
.loading-preview.is-complete :deep(.lp-ring), .loading-preview.is-complete :deep(.lp-check) { stroke-dashoffset:0; opacity:1; }
.loading-preview :deep(.lp-moving), .loading-preview :deep(.lp-ticks) { transition:opacity calc(.2s * var(--lp-speed)) ease; }
.loading-preview.is-complete :deep(.lp-moving), .loading-preview.is-complete :deep(.lp-ticks) { opacity:0; }
.loading-preview.is-complete :deep(.lp-moving) { animation-play-state:paused; }
.loading-preview :deep(.lp-tick) { stroke-width:3.8; opacity:.14; animation:lp-tick-fade calc(1s * var(--lp-speed)) linear infinite; animation-delay:calc(var(--tick-delay) * var(--lp-speed)); }
.loading-preview.lp-ticks :deep(.lp-check) { stroke-width:3.4; transition-delay:calc(.3s * var(--lp-speed)); }
.loading-preview.lp-orbit :deep(.lp-moving) { animation-name:lp-orbit-turn; }
.loading-preview :deep(.lp-orbit) { stroke-dasharray:82 245.044; }
.loading-preview :deep(.lp-orbit-secondary) { opacity:.32; }

/* Match production: the brightness peak travels one circle in --lp-cycle. */
.loading-preview.lp-original :deep(.lp-dot) { fill:#527da8; opacity:.18; transform-box:fill-box; transform-origin:center; will-change:transform,opacity; animation:lp-dot-pulse calc(var(--lp-cycle) * var(--lp-speed)) ease-in-out infinite; animation-delay:calc(var(--pulse-delay) * var(--lp-speed)); }
.loading-preview.lp-original.is-complete :deep(.lp-dot) { fill:#5a9f7d; opacity:1; animation:lp-dot-impact calc(1.5s * var(--lp-speed)) cubic-bezier(.22,1,.36,1) forwards; animation-delay:calc(var(--finish-delay) * var(--lp-speed)); }
.loading-preview.lp-original :deep(.lp-ring) { stroke:#5a9f7d; stroke-width:5; transition:stroke-dashoffset calc(.5s * var(--lp-speed)) cubic-bezier(.22,1,.36,1) calc(.22s * var(--lp-speed)), opacity calc(.2s * var(--lp-speed)) ease calc(.22s * var(--lp-speed)); }
.loading-preview.lp-original :deep(.lp-check) { stroke:#5a9f7d; stroke-width:5; transition:stroke-dashoffset calc(.9s * var(--lp-speed)) cubic-bezier(.22,1,.36,1), opacity calc(.2s * var(--lp-speed)) ease; }
.loading-preview.lp-original.is-complete :deep(.lp-check) { transition-delay:calc(.9s * var(--lp-speed)); }

@keyframes lp-rotate { to { transform:rotate(360deg); } }
@keyframes lp-orbit-turn { from { transform:rotate(-90deg); } to { transform:rotate(270deg); } }
@keyframes lp-tick-fade { 0% { opacity:1; } 100% { opacity:.14; } }
@keyframes lp-dot-pulse { 0%,100% { opacity:.18; transform:scale(.72); } 40% { opacity:1; transform:scale(1.18); } }
@keyframes lp-dot-impact { 0% { opacity:1; transform:scale(1); } 42% { opacity:1; transform:translate(var(--dx),var(--dy)) scale(1.14); } 100% { opacity:0; transform:translate(var(--dx),var(--dy)) scale(.22); } }
.loading-preview.is-paused :deep(*), .loading-preview.is-quiet :deep(*) { animation-play-state:paused !important; }
.loading-preview.is-quiet :deep(*) { animation:none !important; transition:none !important; }
.loading-preview.is-quiet.is-complete :deep(.lp-dot) { opacity:0; }
.loading-preview.is-quiet :deep(.lp-tick) { opacity:.5; }
@media (prefers-reduced-motion:reduce) {
  .loading-preview :deep(*) { animation:none !important; transition:none !important; }
  .loading-preview.is-complete :deep(.lp-dot) { opacity:0 !important; }
  .loading-preview :deep(.lp-tick) { opacity:.5; }
}
</style>
