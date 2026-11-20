<template>
  <view class="navigation-visibility-setting">
    <text class="visibility-label">导航栏显示</text>
    <view class="visibility-choices choice-list" role="group" aria-label="导航栏显示方式">
      <button v-for="item in choices" :key="item.value" tabindex="0" :data-nav-visibility="item.value"
        :aria-pressed="appearance.navVisibility === item.value" :class="{ selected:appearance.navVisibility === item.value }"
        @click="appearance.setNavVisibility(item.value)" @keydown.enter.prevent="appearance.setNavVisibility(item.value)" @keydown.space.prevent="appearance.setNavVisibility(item.value)">
        <view class="choice-copy"><text class="choice-name">{{ item.label }}</text><text class="choice-note">{{ item.note }}</text></view>
        <view class="choice-check" aria-hidden="true"><AppIcon v-if="appearance.navVisibility === item.value" name="check" :size="17" color="#426b8e" /></view>
      </button>
    </view>
    <text v-if="appearance.visibilitySaveError" class="visibility-error" role="status">已切换，但保存失败，请重试。</text>
  </view>
</template>
<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { useAppearanceStore, type NavigationVisibility } from '../stores/appearance'
const appearance = useAppearanceStore()
const choices: {value:NavigationVisibility;label:string;note:string}[] = [
  {value:'fixed',label:'固定显示',note:'始终保留导航栏'},
  {value:'auto',label:'自动隐藏',note:'上下滚动时出现，停下后隐藏'}
]
</script>
<style scoped src="./settings-choice.css"></style>
<style scoped lang="scss">
.navigation-visibility-setting { padding:12px 14px; border-bottom:1px solid #e2eaf2; }
.visibility-label { display:block; color:#2e3d51; font-size:13px; font-weight:650; }
.visibility-error { display:block; margin-top:8px; color:#976044; font-size:10px; }
</style>
