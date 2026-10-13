<template>
  <view class="settings-motion-setting">
    <text class="motion-label">设置页面切换</text>
    <view class="motion-choices" role="group" aria-label="设置页面切换效果">
      <button v-for="item in choices" :key="item.value" role="button" tabindex="0" :data-settings-motion="item.value" :aria-pressed="appearance.settingsMotion === item.value" :class="{ selected: appearance.settingsMotion === item.value }" @click="appearance.setSettingsMotion(item.value)" @keydown.enter.prevent="appearance.setSettingsMotion(item.value)" @keydown.space.prevent="appearance.setSettingsMotion(item.value)">
        <view><text>{{ item.label }}</text><text v-if="appearance.settingsMotion === item.value" class="choice-check">✓</text></view><text class="choice-note">{{ item.note }}</text>
      </button>
    </view>
    <text v-if="appearance.settingsMotionSaveError" class="motion-error" role="status">已切换，但保存失败，请重试。</text>
  </view>
</template>
<script setup lang="ts">
import { useAppearanceStore, type SettingsMotion } from '../stores/appearance'
const appearance = useAppearanceStore()
const choices: { value: SettingsMotion; label: string; note: string }[] = [
  { value: 'slide', label: '右侧滑入', note: '从右侧进入、返回' },
  { value: 'card', label: '卡片展开', note: '从卡片展开、收回' },
  { value: 'page', label: '整页缩放', note: '等比例放大、缩回' },
  { value: 'shape', label: '卡片变页', note: '沿原卡片轮廓展开' }
]
</script>
<style scoped>
.settings-motion-setting { padding:15px 14px; border-bottom:1px solid #eff2f6; }
.motion-label { color:#2e3d51; font-size:12px; font-weight:550; }
.motion-choices { display:flex; flex-wrap:wrap; gap:9px; margin-top:11px; }
.motion-choices button { box-sizing:border-box; flex:0 0 calc(50% - 4.5px); width:calc(50% - 4.5px); min-width:0; min-height:68px; margin:0; padding:12px; text-align:left; border:1px solid #e3eaf2; border-radius:12px; color:#33475e; }
.motion-choices button::after { border:0; }
.motion-choices button.selected { border-color:#a9c2d8; background:#edf4fa; }
.motion-choices button > view { display:flex; justify-content:space-between; font-size:12px; font-weight:550; }
.choice-check { color:#527da8; }
.choice-note { display:block; margin-top:5px; color:#8293a5; font-size:10px; line-height:1.5; }
.motion-choices button:focus-visible { outline:2px solid #527da8; outline-offset:2px; }
.motion-error { display:block; margin-top:8px; color:#976044; font-size:10px; }
</style>
