<template>
  <button class="directory-link">
    <AppIcon :name="icon" :size="21" color="#426b8e" />
    <view class="entry-copy">
      <text class="entry-label">{{ label }}</text>
      <text class="entry-description">{{ description }}</text>
    </view>
    <text v-if="value" class="entry-value">{{ value }}</text>
    <AppIcon name="right" :size="15" color="#738da5" />
  </button>
</template>

<script setup lang="ts">
import AppIcon from './AppIcon.vue'

defineProps<{ icon: string; label: string; description: string; value?: string }>()
</script>

<style scoped>
.directory-link { position:relative; display:flex; align-items:center; width:100%; min-height:63px; gap:11px; padding:10px 12px; background:#fff; text-align:left; }
.directory-link::after { border:0; }
.entry-copy { flex:1; min-width:0; display:grid; gap:4px; }
.entry-label { color:#203047; font-size:14px; font-weight:650; line-height:1.35; }
.entry-description,.entry-value { color:#5d738b; font-size:11px; line-height:1.45; overflow-wrap:anywhere; }
.entry-value { max-width:32%; text-align:right; }
@media (max-width:374px) { .directory-link { gap:8px; padding-inline:10px; } }
</style>
