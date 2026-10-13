<template><view class="app-icon" :style="{ width: size + 'px', height: size + 'px', color }"><image :src="source" :style="{ width: size + 'px', height: size + 'px' }" /></view></template>
<script setup lang="ts">
import { computed } from 'vue'
const props = withDefaults(defineProps<{ name: string; size?: number; color?: string }>(), { size: 20, color: '#718096' })
const paths: Record<string,string> = {
  left:'<path d="m14 6-6 6 6 6"/>', right:'<path d="m10 6 6 6-6 6"/>', down:'<path d="m6 9 6 6 6-6"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', close:'<path d="m6 6 12 12M18 6 6 18"/>',
  refresh:'<path d="M20 7v5h-5M19.4 12a7.5 7.5 0 1 0-1.8 5"/>',
  grid:'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 10h16M10 10v10"/>',
  'layout-columns':'<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M12 5v14"/>',
  'layout-rows':'<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 12h16"/>',
  clock:'<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  pin:'<path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  person:'<circle cx="12" cy="8" r="3"/><path d="M5 20v-2a7 7 0 0 1 14 0v2"/>',
  book:'<path d="M12 5v15M12 6C8 3 4 4 3 5v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-2-1-6-2-9 1Z"/>',
  calendar:'<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4m8-4v4M4 10h16m-11 4h2m3 0h2m-7 3h2"/>',
  settings:'<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="white"/><circle cx="15" cy="17" r="3" fill="white"/>',
  edit:'<path d="m15 4 5 5M4 20l5-1L20 8a2 2 0 0 0-5-5L4 14Z"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  shield:'<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  check:'<path d="m5 12 4 4L19 6"/>', info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  motion:'<path d="M12 4a8 8 0 1 1-8 8"/><path d="M4 8v.01M7 5v.01"/>',
  lake:'<path d="m3 10 5-5 5 5 3-3 5 5M3 15c3-3 6 3 9 0s6 3 9 0M5 19c3-2 5 2 8 0s4 2 6 0"/>',
}
const source = computed(() => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${props.color}" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${paths[props.name] || paths.grid}</svg>`))
</script>
<style scoped>.app-icon { display: inline-flex; flex-shrink: 0; align-items: center; justify-content: center; }</style>
