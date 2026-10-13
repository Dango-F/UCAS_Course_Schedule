<template>
  <view class="navigation-visibility-setting">
    <text class="visibility-label">导航栏显示</text>
    <view class="visibility-choices" role="group" aria-label="导航栏显示方式">
      <button v-for="item in choices" :key="item.value" tabindex="0" :data-nav-visibility="item.value"
        :aria-pressed="appearance.navVisibility === item.value" :class="{ selected:appearance.navVisibility === item.value }"
        @click="appearance.setNavVisibility(item.value)" @keydown.enter.prevent="appearance.setNavVisibility(item.value)" @keydown.space.prevent="appearance.setNavVisibility(item.value)">
        <view><text>{{ item.label }}</text><text v-if="appearance.navVisibility === item.value" class="choice-check">✓</text></view>
        <text class="choice-note">{{ item.note }}</text>
      </button>
    </view>
    <text v-if="appearance.visibilitySaveError" class="visibility-error" role="status">已切换，但保存失败，请重试。</text>
  </view>
</template>
<script setup lang="ts">
import { useAppearanceStore, type NavigationVisibility } from '../stores/appearance'
const appearance = useAppearanceStore()
const choices: {value:NavigationVisibility;label:string;note:string}[] = [
  {value:'fixed',label:'固定显示',note:'始终保留导航栏'},
  {value:'auto',label:'自动隐藏',note:'上下滚动时出现，停下后隐藏'}
]
</script>
<style scoped>
.navigation-visibility-setting { padding:15px 14px; border-bottom:1px solid #eff2f6; }
.visibility-label { color:#2e3d51; font-size:12px; font-weight:550; }
.visibility-choices { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; margin-top:11px; }
.visibility-choices button { padding:12px; text-align:left; border:1px solid #e3eaf2; border-radius:12px; min-height:68px; color:#33475e; }
.visibility-choices button::after { border:0; }
.visibility-choices button.selected { border-color:#a9c2d8; background:#edf4fa; }
.visibility-choices button > view { display:flex; justify-content:space-between; font-size:12px; font-weight:550; }
.choice-check { color:#527da8; }
.choice-note { display:block; margin-top:5px; color:#8293a5; font-size:10px; line-height:1.5; }
.visibility-choices button:focus-visible { outline:2px solid #527da8; outline-offset:2px; }
.visibility-error { display:block; margin-top:8px; color:#976044; font-size:10px; }
</style>
