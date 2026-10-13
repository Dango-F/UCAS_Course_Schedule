<template>
  <view id="glass-material-preview" class="material-preview" data-comparing="false" :preview-config="previewConfig" :change:preview-config="glassPreview.configure">
    <view class="preview-stage">
      <view class="sample-days"><text>一</text><text>二</text><text>三</text></view>
      <view class="sample-grid">
        <view class="sample-course sample-blue"><text class="sample-title">矩阵分析</text><text>08:30–10:10</text><text class="sample-teacher">李老师 · 教一201</text><text>闭卷考试</text></view>
        <view class="sample-course sample-teal"><text class="sample-title">学术英语</text><text>10:30–12:10</text><text class="sample-teacher">王老师 · 教二105</text><text>课程论文</text></view>
        <view class="sample-course sample-purple"><text class="sample-title">机器学习</text><text>13:30–15:10</text><text class="sample-teacher">陈老师 · 教一208</text><text>课堂展示</text></view>
      </view>
      <view class="preview-lens-root">
        <view class="glass-bar" :style="{ '--glass-tab-count':items.length }" role="group" aria-label="玻璃交互示例，不切换页面">
          <view class="glass-surface" aria-hidden="true"/><view class="glass-edge" aria-hidden="true"><view class="glass-light"/></view><view class="glass-selection" aria-hidden="true"><view><view class="glass-touch-light"><view class="glass-touch-sheen"/></view></view></view>
          <button v-for="(item,index) in items" :key="item.label" class="nav-item" :data-nav-index="index" :aria-pressed="index === 0 ? 'true' : 'false'" :aria-label="`体验${item.label}动画`" :class="{ active:index === 0 }"><AppIcon :name="item.icon" :size="25" color="#202126"/><text>{{ item.label }}</text></button>
        </view>
      </view>
    </view>
    <view class="preview-compare-row">
      <button class="glass-compare" role="button" tabindex="0" aria-pressed="false" :aria-label="`按住对比默认通透度${defaultClarity}，松开恢复当前值`"><text class="preview-current">按住对比默认</text><text class="preview-default">松开回到当前</text></button>
    </view>
    <text class="preview-accessibility">系统增强对比度或减少透明度已开启，玻璃优先显示为实色。</text>
  </view>
</template>

<script lang="ts">
import { computed, defineComponent } from 'vue'
import AppIcon from './AppIcon.vue'
import { DEFAULT_GLASS_CLARITY } from '../domain/glass-material'
import { useAppearanceStore } from '../stores/appearance'
import { useScheduleStore } from '../stores/schedule'
import { NAVIGATION_ITEMS } from './navigation-items'
export default defineComponent({
  components:{ AppIcon },
  props:{ clarity:{ type:Number, default:DEFAULT_GLASS_CLARITY }, hopPreviewRun:{ type:Number, default:0 }, hopPreviewStop:{ type:Number, default:0 } },
  setup(props) {
    const appearance = useAppearanceStore()
    const schedule = useScheduleStore()
    return { defaultClarity:DEFAULT_GLASS_CLARITY, previewConfig:computed(() => ({clarity:props.clarity,touchLight:appearance.glassTouchLight,navMotion:appearance.navMotion,qElastic:appearance.qElastic,hopPeak:appearance.navHopPeak,hopPreviewRun:props.hopPreviewRun,hopPreviewStop:props.hopPreviewStop,reducedMotion:schedule.reducedMotion})), items:NAVIGATION_ITEMS }
  }
})
</script>

<script module="glassPreview" lang="renderjs">
import { createGlassPreview } from './glass-preview.js'
export default {
  mounted() {
    const bind = (attempt = 0) => {
      const root = document.getElementById('glass-material-preview')
      if (!root?.querySelector('.glass-surface') || !this.previewValue) {
        if (attempt < 30) this.previewTimer = setTimeout(() => bind(attempt + 1), 16)
        return
      }
      this.previewController = createGlassPreview(root, this.previewValue)
    }
    bind()
  },
  beforeUnmount() { clearTimeout(this.previewTimer); this.previewController?.destroy(); this.previewController = null },
  methods:{ configure(value) { if (!value) return; this.previewValue = value; this.previewController?.configure(value) } }
}
</script>

<style scoped src="./glass-navigation.css"></style>
<style scoped>
.material-preview { margin-top:14px; }
.preview-stage { position:relative; height:176px; overflow:hidden; border:1px solid #e3eaf2; border-radius:16px; background:#f9fbfe; }
.sample-days { display:flex; height:27px; align-items:center; text-align:center; border-bottom:1px solid #e3eaf2; color:#8395aa; font-size:10px; }
.sample-days text { flex:1; }
.sample-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:8px; padding:8px; height:149px; background-image:linear-gradient(#dce6f180 1px,transparent 1px),linear-gradient(90deg,#dce6f180 1px,transparent 1px); background-size:100% 37px,33.333% 100%; }
.sample-course { display:flex; min-width:0; flex-direction:column; gap:7px; padding:9px 5px; height:125px; border-left:2px solid; border-radius:6px; font-size:9px; line-height:1.5; }
.sample-course text { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sample-title { font-size:12px; font-weight:600; }
.sample-teacher { margin-top:15px; }
.sample-blue { color:#4975a1; background:#dceaf7; border-color:#97b8d7; }
.sample-teal { color:#427f74; background:#dcefe8; border-color:#8abdaf; }
.sample-purple { color:#786498; background:#eae3f3; border-color:#b6a4ce; }
.preview-lens-root { position:absolute; z-index:1; left:8px; right:8px; top:83px; height:56px; pointer-events:none; }
.preview-lens-root .glass-bar { pointer-events:auto; }
.preview-lens-root .nav-item { font-size:10px; }
.preview-compare-row { display:flex; align-items:center; justify-content:flex-end; gap:5px; margin-top:3px; }
.glass-compare { display:flex; align-items:center; justify-content:center; flex-shrink:0; min-height:44px; margin:0; padding:0 8px; border-radius:9px; color:#527da8; font-size:10px; line-height:1.3; background:transparent; touch-action:none; user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; }
.glass-compare::after { border:0; }
.glass-compare:focus-visible { outline:2px solid #527da8; outline-offset:-2px; }
.preview-default { display:none; }
[data-comparing="true"] .preview-current { display:none; }
[data-comparing="true"] .preview-default { display:inline; }
[data-comparing="true"] .glass-compare { background:#edf4fa; }
.preview-accessibility { display:none; color:#8292a4; font-size:10px; line-height:1.6; margin:0 0 9px; }
@media (prefers-reduced-transparency:reduce),(prefers-contrast:more) { .preview-accessibility { display:block; } }
</style>
