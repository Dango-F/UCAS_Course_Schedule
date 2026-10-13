<template>
  <view class="navigation-motion-setting">
    <text class="motion-label">导航切换</text>
    <view class="motion-choices" role="group" aria-label="导航切换效果">
      <button v-for="item in choices" :key="item.value" role="button" tabindex="0" :data-nav-motion="item.value" :aria-pressed="appearance.navMotion === item.value" :class="{ selected:appearance.navMotion === item.value }" @click="appearance.setNavMotion(item.value)" @keydown.enter.prevent="appearance.setNavMotion(item.value)" @keydown.space.prevent="appearance.setNavMotion(item.value)">
        <view><text>{{ item.label }}</text><text v-if="appearance.navMotion === item.value" class="choice-check">✓</text></view><text class="choice-note">{{ item.note }}</text>
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
import { useAppearanceStore, type NavigationMotion } from '../stores/appearance'
const appearance = useAppearanceStore()
const choices: {value:NavigationMotion;label:string;note:string}[] = [
  {value:'flow',label:'流动',note:'原有效果 · 轻柔拉伸'},
  {value:'hop',label:'跃动',note:'按住鼓起 · 放大跃迁'}
]
</script>
<style scoped>
.navigation-motion-setting { padding:15px 14px; border-bottom:1px solid #eff2f6; }
.motion-label { color:#2e3d51; font-size:12px; font-weight:550; }
.motion-choices { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; margin-top:11px; }
.motion-choices button { padding:12px; text-align:left; border:1px solid #e3eaf2; border-radius:12px; min-height:68px; color:#33475e; }
.motion-choices button::after { border:0; }
.motion-choices button.selected { border-color:#a9c2d8; background:#edf4fa; }
.motion-choices button > view { display:flex; justify-content:space-between; font-size:12px; font-weight:550; }
.choice-check { color:#527da8; }
.choice-note { display:block; margin-top:5px; color:#8293a5; font-size:10px; line-height:1.5; }
.motion-choices button:focus-visible { outline:2px solid #527da8; outline-offset:2px; }
.motion-error { display:block; margin-top:8px; color:#976044; font-size:10px; }
.q-elastic-row { display:flex; align-items:center; justify-content:space-between; gap:14px; width:100%; min-height:54px; margin-top:12px; padding:10px 0 0; border-top:1px solid #eff2f6; text-align:left; }
.q-elastic-row::after { border:0; }
.q-elastic-copy { display:flex; min-width:0; flex-direction:column; gap:4px; }
.q-elastic-copy text:first-child { color:#2e3d51; font-size:12px; font-weight:550; }
.q-elastic-copy text:last-child { color:#97a4b2; font-size:9px; line-height:1.35; }
.q-elastic-switch { width:37px; height:22px; flex-shrink:0; padding:2px; border-radius:13px; background:#dfe5ec; transition:background .18s ease; }
.q-elastic-switch view { width:18px; height:18px; border-radius:50%; background:#fff; box-shadow:0 1px 3px #1d2b3b20; transition:transform .18s ease; }
.q-elastic-switch.on { background:#527da8; }.q-elastic-switch.on view { transform:translateX(15px); }
.q-elastic-row:focus-visible { outline:2px solid #527da8; outline-offset:2px; }
:global(.settings-page.reduced-motion .q-elastic-switch),:global(.settings-page.reduced-motion .q-elastic-switch view) { transition:none; }
@media (prefers-reduced-motion:reduce) { .q-elastic-switch,.q-elastic-switch view { transition:none; } }
</style>
