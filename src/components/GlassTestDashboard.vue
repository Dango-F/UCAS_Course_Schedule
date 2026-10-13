<template>
  <view class="glass-test-page">
    <view class="lab-header">
      <view class="lab-heading"><text class="lab-title">玻璃测试</text><text class="lab-hint">上下滑动，让背景经过导航栏</text></view>
      <view class="lab-shortcuts" role="group" aria-label="选择测试背景">
        <button v-for="section in shortcuts" :key="section.id" :data-lab-jump="section.id" @click="jumpTo(section.id)">{{ section.label }}</button>
      </view>
    </view>
    <scroll-view class="lab-scroll" scroll-y :show-scrollbar="false" :scroll-into-view="scrollTarget" :scroll-with-animation="false">
      <view id="glass-lab-light" class="lab-panel lab-light" data-lab-section="light">
        <view class="panel-heading"><text>浅色背景</text><text class="panel-meta">纸白 · 雾蓝</text></view>
        <text class="specimen-title">清晰，透过光。</text>
        <text class="specimen-copy">矩阵分析　学术英语　机器学习</text>
        <view class="light-swatches"><view/><view/><view/></view>
        <view class="type-lines"><text>湖畔课表 · 09:30</text><text>ABCDEFGHIJKLMN</text><text>0123456789 / 08:30—10:10</text></view>
      </view>
      <view id="glass-lab-dark" class="lab-panel lab-dark" data-lab-section="dark">
        <view class="panel-heading"><text>深色背景</text><text class="panel-meta">墨蓝 · 夜色</text></view>
        <text class="specimen-title">光落在边缘。</text>
        <text class="specimen-copy">白色文字，细线与深色图形</text>
        <view class="orbit-mark" aria-hidden="true"><view/><view/><view/></view>
        <view class="type-lines"><text>科研方法与学术写作</text><text>LAKESIDE / AFTER DARK</text><text>14:00—15:40　教一 201</text></view>
      </view>
      <view id="glass-lab-mixed" class="lab-mixed" data-lab-section="mixed">
        <view class="mixed-light"><text class="mixed-label">明暗交界</text><text class="mixed-title">浅</text><text>WHITE<br/>湖畔课表</text></view>
        <view class="mixed-dark"><text class="mixed-label">同一条导航</text><text class="mixed-title">深</text><text>DARK<br/>湖畔课表</text></view>
      </view>
      <view id="glass-lab-photos" class="photo-group" data-lab-section="photos">
        <view class="photo-caption"><text>照片背景</text><text>云层与雪山</text></view>
        <view class="photo-frame photo-day" data-lab-photo="day">
          <image class="lab-photo" src="/static/glass-lab/cloud-mountains.jpg" mode="aspectFill" aria-label="明亮云层与雪山的航天摄影" @error="dayImageFailed = true" />
          <text v-if="dayImageFailed" class="photo-error">照片未能加载</text>
        </view>
        <view class="photo-caption caption-dark"><text>照片背景</text><text>地球与夜空</text></view>
        <view class="photo-frame photo-night" data-lab-photo="night">
          <image class="lab-photo" src="/static/glass-lab/night-earth.jpg" mode="aspectFill" aria-label="深色夜空与地球大气层的航天摄影" @error="nightImageFailed = true" />
          <text v-if="nightImageFailed" class="photo-error">照片未能加载</text>
        </view>
        <view class="photo-credit"><text>摄影：NASA / ISS Crew Earth Observations</text></view>
      </view>
      <view id="glass-lab-type" class="lab-panel lab-type" data-lab-section="type">
        <view class="panel-heading"><text>文字与细线</text><text class="panel-meta">大小 · 中英 · 疏密</text></view>
        <text class="type-display">湖畔</text>
        <text class="type-medium">时间与光的交界</text>
        <view class="ruler-lines" aria-hidden="true"><view v-for="line in 6" :key="line"/></view>
        <text class="type-small">从原像到倒像，观察字形经过边缘时的压缩与展开。</text>
        <text class="type-alphabet">Aa Bb Cc Dd Ee Ff Gg</text>
        <text class="type-digits">08:30　09:45　12:10</text>
        <view class="dense-type"><text v-for="line in 5" :key="line">湖畔课表　矩阵分析　学术英语　机器学习</text></view>
      </view>
      <view class="lab-end"><text>回到顶部，再看一遍</text><button @click="jumpTo('glass-lab-light')" aria-label="回到测试页顶部">↑</button></view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { nextTick, ref } from 'vue'
const scrollTarget = ref('')
const dayImageFailed = ref(false)
const nightImageFailed = ref(false)
const shortcuts = [
  { id:'glass-lab-light', label:'浅色' },
  { id:'glass-lab-dark', label:'深色' },
  { id:'glass-lab-mixed', label:'交界' },
  { id:'glass-lab-photos', label:'照片' },
  { id:'glass-lab-type', label:'文字' }
]
async function jumpTo(id: string) {
  // Re-selecting the same shortcut must still return to that section.
  scrollTarget.value = ''
  await nextTick()
  scrollTarget.value = id
}
</script>

<style scoped>
.glass-test-page { --lab-sample-height:calc(100vh - 116px - var(--status-bar-height,0px)); --lab-sample-height:calc(100dvh - 116px - var(--status-bar-height,0px)); flex:1; height:0; min-height:0; display:flex; flex-direction:column; overflow:hidden; background:#fff; }
.lab-header { flex-shrink:0; padding:calc(var(--status-bar-height,0px) + 18px) 22px 10px; border-bottom:1px solid #e8edf3; background:#fff; }
.lab-heading { display:flex; justify-content:space-between; align-items:baseline; gap:12px; }
.lab-title { color:#203047; font-size:22px; font-weight:650; letter-spacing:-.5px; }
.lab-hint { font-size:10px; color:#788b9e; text-align:right; line-height:1.5; }
.lab-shortcuts { display:flex; gap:6px; margin-top:10px; }
.lab-shortcuts button { flex:1; min-width:0; min-height:44px; border-radius:12px; color:#456a8b; background:#f1f5f9; font-size:12px; font-weight:550; }
.lab-scroll { flex:1; min-height:0; height:0; }
.lab-panel { padding:24px 26px; }
.panel-heading { display:flex; justify-content:space-between; align-items:center; gap:10px; font-size:12px; font-weight:550; }
.panel-meta { font-size:10px; font-weight:400; opacity:.65; }
.specimen-title { display:block; margin-top:30px; font-size:32px; font-weight:600; letter-spacing:-1px; line-height:1.3; }
.specimen-copy { display:block; margin-top:12px; font-size:12px; line-height:1.8; opacity:.72; }
.lab-light { min-height:620px; min-height:max(380px,var(--lab-sample-height)); color:#25374a; background:#fff; }
.light-swatches { display:flex; gap:12px; margin:25px 0 22px; }
.light-swatches view { flex:1; height:38px; border-radius:9px; background:#dae8f5; }
.light-swatches view:nth-child(2) { background:#dcefe8; }.light-swatches view:nth-child(3) { background:#eae3f3; }
.type-lines { display:flex; flex-direction:column; gap:11px; font-size:13px; line-height:1.5; }
.type-lines text:nth-child(2) { font-size:12px; letter-spacing:2px; }.type-lines text:last-child { font-size:11px; font-variant-numeric:tabular-nums; opacity:.7; }
.lab-dark { min-height:620px; min-height:max(380px,var(--lab-sample-height)); color:#edf4fb; background:#132133; }
.orbit-mark { position:relative; width:152px; height:84px; margin:20px 0 24px; }
.orbit-mark view { position:absolute; top:8px; width:70px; height:70px; border:1px solid #7997b8; border-radius:50%; }
.orbit-mark view:nth-child(2) { left:40px; border-color:#a1b9d0; }.orbit-mark view:nth-child(3) { left:80px; border-color:#c2d6e8; }
.lab-mixed { display:flex; height:620px; height:max(380px,var(--lab-sample-height)); }
.mixed-light,.mixed-dark { display:flex; flex:1; min-width:0; flex-direction:column; justify-content:space-between; padding:24px 26px; }
.mixed-light { color:#203047; background:#f6f8fc; }.mixed-dark { color:#edf4fb; background:#152234; }
.mixed-label { font-size:11px; }.mixed-title { font-size:70px; line-height:1.1; font-weight:450; }
.mixed-light > text:last-child,.mixed-dark > text:last-child { font-size:12px; line-height:1.9; letter-spacing:1px; }
.photo-group { background:#fff; }
.photo-caption { display:flex; justify-content:space-between; padding:18px 26px; color:#203047; background:#f6f8fc; font-size:12px; font-weight:550; }
.photo-caption text:last-child { font-size:11px; font-weight:400; opacity:.7; }
.caption-dark { color:#edf4fb; background:#111d2a; }
.photo-frame { position:relative; height:620px; height:max(410px,var(--lab-sample-height)); overflow:hidden; }
.photo-day { background:#edf1f7; }.photo-night { background:#111d2a; }
.lab-photo { display:block; width:100%; height:100%; }
.photo-error { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:13px; color:#748aa2; }
.photo-credit { padding:12px 26px; color:#7f8d9c; background:#f6f8fc; font-size:9px; line-height:1.6; }
.lab-type { min-height:620px; min-height:max(570px,var(--lab-sample-height)); background:#edf4f9; color:#233e57; }
.type-display { display:block; margin-top:28px; font-size:94px; line-height:1.15; font-weight:650; letter-spacing:-5px; }
.type-medium { display:block; margin:14px 0 24px; font-size:22px; font-weight:550; }
.ruler-lines { display:flex; flex-direction:column; gap:9px; margin-bottom:24px; }
.ruler-lines view { height:1px; background:#9db4c7; }.ruler-lines view:nth-child(even) { height:2px; background:#577b98; }
.type-small { display:block; font-size:11px; line-height:1.8; color:#647e93; }
.type-alphabet { display:block; margin-top:22px; font-size:24px; letter-spacing:1px; }
.type-digits { display:block; margin-top:18px; font-size:17px; font-variant-numeric:tabular-nums; }
.dense-type { display:flex; flex-direction:column; gap:7px; margin-top:22px; font-size:12px; white-space:nowrap; overflow:hidden; }
.lab-end { display:flex; align-items:center; justify-content:space-between; gap:16px; min-height:210px; padding:24px 26px calc(100px + env(safe-area-inset-bottom,0px)); color:#768b9f; background:#fff; font-size:12px; }
.lab-end button { width:44px; min-height:44px; border:1px solid #dfe8f0; border-radius:50%; color:#456a8b; font-size:20px; }
@media (max-width:374px) {
  .lab-header { padding-left:16px; padding-right:16px; }.lab-title { font-size:20px; }.lab-hint { max-width:140px; }
  .lab-panel,.mixed-light,.mixed-dark { padding-left:22px; padding-right:22px; }.specimen-title { font-size:29px; }
}
</style>
