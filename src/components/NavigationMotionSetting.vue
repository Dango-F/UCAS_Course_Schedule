<template>
  <view class="navigation-motion-setting">
    <text class="motion-label">导航切换</text>
    <view class="motion-choices choice-list" role="group" aria-label="导航切换效果">
      <button v-for="item in choices" :key="item.value" role="button" tabindex="0" :data-nav-motion="item.value" :aria-pressed="appearance.navMotion === item.value" :class="{ selected:appearance.navMotion === item.value }" @click="appearance.setNavMotion(item.value)" @keydown.enter.prevent="appearance.setNavMotion(item.value)" @keydown.space.prevent="appearance.setNavMotion(item.value)">
        <view class="choice-copy"><text class="choice-name">{{ item.label }}</text><text class="choice-note">{{ item.note }}</text></view>
        <view class="choice-check" aria-hidden="true"><AppIcon v-if="appearance.navMotion === item.value" name="check" :size="17" color="#426b8e" /></view>
      </button>
    </view>
    <text v-if="appearance.motionSaveError" class="motion-error" role="status">已切换，但保存失败，请重试。</text>
    <button class="q-elastic-row" role="switch" tabindex="0" data-q-elastic aria-label="Q弹动画" :aria-checked="appearance.qElastic"
      @click="appearance.setQElastic(!appearance.qElastic)" @keydown.enter.prevent="appearance.setQElastic(!appearance.qElastic)" @keydown.space.prevent="appearance.setQElastic(!appearance.qElastic)">
      <view class="q-elastic-copy"><text>Q弹动画</text><text>流动拉伸与刹车撞墙、跃动落地回弹</text></view>
      <view class="q-elastic-switch" :class="{ on:appearance.qElastic }" aria-hidden="true"><view /></view>
    </button>
    <text v-if="appearance.qElasticSaveError" class="motion-error" role="status">已生效，但保存失败，请重试。</text>
  </view>
</template>
<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { useAppearanceStore, type NavigationMotion } from '../stores/appearance'
const appearance = useAppearanceStore()
const choices: {value:NavigationMotion;label:string;note:string}[] = [
  {value:'flow',label:'流动',note:'原有效果 · 轻柔拉伸'},
  {value:'hop',label:'跃动',note:'按住鼓起 · 放大跃迁'}
]
</script>
<style scoped src="./settings-choice.css"></style>
<style scoped lang="scss">
.navigation-motion-setting { padding:12px 14px; border-bottom:1px solid #e2eaf2; }
.motion-label { display:block; color:#2e3d51; font-size:13px; font-weight:650; }
.motion-error { display:block; margin-top:8px; color:#976044; font-size:10px; }
.q-elastic-row { display:flex; align-items:center; justify-content:space-between; gap:14px; width:100%; min-height:54px; margin-top:12px; padding:10px 0 0; border-top:1px solid #eff2f6; text-align:left; }
.q-elastic-row::after { border:0; }
.q-elastic-copy { display:flex; min-width:0; flex-direction:column; gap:4px; }
.q-elastic-copy text:first-child { color:#2e3d51; font-size:13px; font-weight:600; }
.q-elastic-copy text:last-child { color:#60748a; font-size:11px; line-height:1.4; }
.q-elastic-switch { width:37px; height:22px; flex-shrink:0; padding:2px; border-radius:13px; background:#dfe5ec; transition:background .15s ease; }
.q-elastic-switch view { width:18px; height:18px; border-radius:50%; background:#fff; box-shadow:0 1px 3px #1d2b3b20; transition:transform .15s ease; }
.q-elastic-switch.on { background:#527da8; }
.q-elastic-switch.on view { transform:translateX(15px); }
.q-elastic-row:focus-visible { outline:2px solid #527da8; outline-offset:2px; }
:global(.settings-page.reduced-motion .q-elastic-switch),:global(.settings-page.reduced-motion .q-elastic-switch view) { transition:none; }
@media (prefers-reduced-motion:reduce) { .q-elastic-switch,.q-elastic-switch view { transition:none; } }
</style>
