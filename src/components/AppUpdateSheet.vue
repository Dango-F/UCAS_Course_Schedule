<template>
  <BottomSheet :open="open" title="应用更新" compact-header style="--sheet-bottom-gap: 6px"
    :reduced-motion="reducedMotion" @close="emit('dismiss', false)">
    <view v-if="release" class="release">
      <view class="release-heading">
        <view class="release-mark"><AppIcon name="lake" :size="28" color="#527da8" /></view>
        <view class="release-version">
          <text class="release-title">湖畔课表 {{ release.versionName }}</text>
          <text class="release-meta number">当前 {{ installedVersion }} · Android · {{ sizeLabel }}</text>
        </view>
      </view>
      <view v-if="highlights.length" class="release-notes">
        <text v-for="(line, i) in highlights" :key="i">{{ line }}</text>
      </view>
      <button class="primary-button" @click="download">前往 GitHub 下载<AppIcon name="arrow" :size="17" color="#ffffff" /></button>
      <view class="release-actions">
        <button @click="emit('dismiss', false)">明天提醒</button>
        <button @click="emit('dismiss', true)">跳过此版本</button>
      </view>
    </view>
  </BottomSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'
import BottomSheet from './BottomSheet.vue'
import { installedVersion, openReleasePage, type AppRelease } from '../services/app-update'

const props = defineProps<{ open: boolean; release: AppRelease | null; reducedMotion: boolean }>()
const emit = defineEmits<{ dismiss: [ignore: boolean] }>()
const sizeLabel = computed(() => ((props.release?.size || 0) / 1048576).toFixed(1) + ' MB')
// The sheet previews release notes. The complete formatted text is on the download page.
const highlights = computed(() => (props.release?.notes || '').split(/\r?\n/)
  .map(line => line.trim()).filter(line => line && !line.startsWith('#'))
  .slice(0, 3).map(line => line.replace(/^[-*+]\s+/, '').replace(/\*\*|__/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')))
function download() {
  if (!props.release) return
  openReleasePage(props.release)
  emit('dismiss', false)
}
</script>

<style scoped>
.release-heading { display:flex; align-items:center; gap:13px; margin:0 0 10px; }
.release-mark { display:grid; place-items:center; flex:none; width:50px; height:50px; border-radius:16px; background:#edf3f8; }
.release-version { display:grid; gap:2px; min-width:0; }
.release-title { color:#284460; font-size:21px; font-weight:650; line-height:1.3; overflow-wrap:anywhere; }
.release-meta { color:#61768b; font-size:12px; }
.release-notes { display:grid; gap:4px; padding:9px 16px; margin-bottom:10px; border-radius:12px; background:#f6f8fc; }
.release-notes text { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:2; overflow:hidden; overflow-wrap:anywhere; color:#435970; font-size:13px; line-height:1.5; }
.release .primary-button { width:100%; }
.release-actions { display:flex; gap:6px; margin-top:2px; }
.release-actions button { display:flex; align-items:center; justify-content:center; flex:1; min-height:44px; border-radius:12px; color:#536d86; font-size:13px; }
</style>
