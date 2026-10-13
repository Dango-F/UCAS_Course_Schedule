<template>
  <view class="motion-lab">
    <view class="lab-nav">
      <button class="lab-back" aria-label="返回课表" @click="goBack"><AppIcon name="left" :size="20" color="#1d1d1f" /></button>
      <text>动效预览</text><text class="lab-nav-note">导入课表</text>
    </view>
    <scroll-view class="lab-scroll" scroll-y>
      <view class="lab-content">
        <view class="lab-heading"><text class="lab-title">等待，也可以很轻。</text><text class="lab-intro">一个原版，三种新的节奏。选一个，感受从读取到完成。</text></view>

        <view class="lab-stage" :class="{ 'with-context': context }">
          <view v-if="context" class="lab-context" aria-hidden="true">
            <text class="context-title">个人课表</text><view class="context-rule" />
            <view v-for="row in 4" :key="row" class="context-row"><view /><view /><view /></view>
          </view>
          <view class="lab-status" role="status" aria-live="polite" :aria-label="complete ? '预览：读取完成' : '预览：正在读取课程信息'">
            <ImportLoadingPreview :key="replayKey" :variant="selected" :complete="complete" :slow="slow" :reduced-motion="quiet" :paused="!visible" />
            <text class="lab-status-title">{{ complete ? '读取完成' : '正在读取课程信息' }}</text>
            <text class="lab-status-note">{{ complete ? '课程已就绪，接下来核对课表' : '请稍候，正在整理本学期的安排' }}</text>
          </view>
          <view class="stage-meta"><text>{{ current.tag }} · {{ current.name }}</text><text>{{ quiet ? '减少动态' : slow ? '0.5× 慢放' : '1× 原速' }}</text></view>
        </view>

        <view class="variant-picker" role="group" aria-label="选择加载动画">
          <button v-for="item in loadingVariants" :key="item.id" class="variant-option" :class="{ selected: selected === item.id }"
            :aria-pressed="selected === item.id" :aria-label="item.tag + '：' + item.name" @click="selectVariant(item.id)">
            <view class="variant-caption"><text>{{ item.tag }}</text><view class="selection-dot" /></view><text class="variant-name">{{ item.name }}</text>
          </button>
        </view>
        <text class="variant-description">{{ current.description }}</text>

        <view class="lab-actions">
          <button class="demo-button" @click="playDemo">{{ demoRunning ? '重新演示' : '完整演示' }}<AppIcon name="arrow" :size="17" color="#ffffff" /></button>
          <button class="finish-button" @click="complete ? restart() : finish()">{{ complete ? '重新转圈' : '立即完成' }}</button>
        </view>
        <text class="demo-hint">完整演示：读取 3 秒，再播放完成动画。</text>

        <view class="lab-options">
          <view class="lab-option-row"><text>播放速度</text><view class="speed-picker" role="group" aria-label="播放速度"><button :class="{ active: !slow }" :aria-pressed="!slow" @click="setSlow(false)">原速</button><button :class="{ active: slow }" :aria-pressed="slow" @click="setSlow(true)">慢放</button></view></view>
          <button class="lab-option-row" role="switch" aria-label="课表背景" :aria-checked="context" @click="context = !context"><text>课表背景</text><view class="lab-toggle" :class="{ on: context }"><view /></view></button>
          <button class="lab-option-row" role="switch" aria-label="减少动态" :aria-checked="quiet" @click="quiet = !quiet"><text>减少动态</text><view class="lab-toggle" :class="{ on: quiet }"><view /></view></button>
        </view>
        <text class="lab-footnote">仅供动效对比，不读取数据，也不改变实际导入动画。</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { onHide, onShow } from '@dcloudio/uni-app'
import AppIcon from '../../components/AppIcon.vue'
import ImportLoadingPreview from '../../components/ImportLoadingPreview.vue'
import { loadingVariants, type LoadingVariant } from '../../components/loading-preview'
import { useScheduleStore } from '../../stores/schedule'

const store = useScheduleStore()
const selected = ref<LoadingVariant>('original')
const current = computed(() => loadingVariants.find(item => item.id === selected.value)!)
const complete = ref(false)
const slow = ref(false)
const quiet = ref(store.reducedMotion)
const context = ref(false)
const visible = ref(true)
const replayKey = ref(0)
const demoRunning = ref(false)
let demoTimer: ReturnType<typeof setTimeout> | undefined
function cancelDemo() { clearTimeout(demoTimer); demoTimer = undefined; demoRunning.value = false }
function restart() { cancelDemo(); complete.value = false; replayKey.value++ }
function selectVariant(id: LoadingVariant) { selected.value = id; restart() }
function setSlow(value: boolean) { slow.value = value; restart() }
function finish() { cancelDemo(); complete.value = true }
function playDemo() {
  restart()
  demoRunning.value = true
  demoTimer = setTimeout(finish, 3000)
}
function goBack() {
  cancelDemo()
  if (getCurrentPages().length > 1) uni.navigateBack()
  else uni.reLaunch({ url: '/pages/index/index' })
}
onHide(() => { visible.value = false; cancelDemo() })
onShow(() => { visible.value = true })
onUnmounted(cancelDemo)
</script>

<style scoped>
/* Apple-inspired restraint: porcelain, graphite, system typography. Motion is
   the focal point; no decorative gradients, glass cards or downloaded fonts. */
.motion-lab { --lab-paper:#f5f5f7; --lab-ink:#1d1d1f; --lab-secondary:#6e6e73; --lab-line:#e5e5ea; --lab-accent:#007aff; display:flex; flex-direction:column; height:100vh; height:100dvh; max-width:560px; margin:0 auto; color:var(--lab-ink); background:var(--lab-paper); font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text','Segoe UI','PingFang SC','Microsoft YaHei',sans-serif; }
.lab-nav { flex-shrink:0; display:flex; align-items:center; justify-content:space-between; height:calc(60px + var(--status-bar-height, 0px)); padding:var(--status-bar-height, 0px) 22px 0 10px; font-size:15px; font-weight:600; }
.lab-back { width:44px; height:44px; display:flex; align-items:center; justify-content:center; }
.lab-nav-note { color:var(--lab-secondary); font-size:11px; font-weight:400; }
.lab-scroll { flex:1; height:0; min-height:0; }
.lab-content { padding:14px 24px calc(28px + env(safe-area-inset-bottom)); }
.lab-heading { margin-bottom:24px; }
.lab-title { display:block; font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','PingFang SC','Microsoft YaHei',sans-serif; font-size:27px; line-height:1.3; font-weight:600; letter-spacing:-.9px; }
.lab-intro { display:block; max-width:300px; margin-top:10px; color:var(--lab-secondary); font-size:12px; line-height:1.8; }
.lab-stage { position:relative; display:flex; align-items:center; justify-content:center; height:252px; border-radius:24px; background:#fff; overflow:hidden; isolation:isolate; }
.lab-status { position:relative; display:flex; flex-direction:column; align-items:center; margin-top:-18px; }
.lab-status-title { margin-top:2px; font-size:13px; font-weight:500; }
.lab-status-note { margin-top:7px; font-size:10px; color:var(--lab-secondary); }
.stage-meta { position:absolute; bottom:18px; left:20px; right:20px; display:flex; justify-content:space-between; font-size:10px; color:var(--lab-secondary); font-variant-numeric:tabular-nums; }
.lab-context { position:absolute; inset:0; padding:20px; opacity:.2; filter:blur(2.5px); pointer-events:none; }
.context-title { font-size:12px; }.context-rule { height:1px; background:#a5adb9; margin:12px 0; }
.context-row { display:flex; height:39px; gap:10px; margin-top:8px; }.context-row view { flex:1; background:#cad9e3; border-radius:4px; }.context-row:nth-child(odd) view:nth-child(2) { background:transparent; }
.with-context .lab-status { padding:0 12px 14px; border-radius:20px; background:rgba(255,255,255,.86); }
.variant-picker { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:9px; margin-top:20px; }
.variant-option { padding:12px 14px; border:1px solid var(--lab-line); border-radius:14px; text-align:left; background:rgba(255,255,255,.4); }
.variant-option.selected { background:#fff; border-color:var(--lab-ink); box-shadow:inset 0 0 0 .5px var(--lab-ink); }
.variant-caption { display:flex; align-items:center; justify-content:space-between; color:var(--lab-secondary); font-size:10px; }.selection-dot { width:5px; height:5px; border-radius:50%; background:transparent; }.selected .selection-dot { background:var(--lab-ink); }
.variant-name { display:block; margin-top:4px; font-size:13px; font-weight:500; }
.variant-description { display:block; min-height:36px; padding:12px 2px 0; color:var(--lab-secondary); font-size:11px; line-height:1.6; }
.lab-actions { display:flex; gap:10px; margin-top:16px; }.demo-button, .finish-button { flex:1; min-height:46px; display:flex; align-items:center; justify-content:center; gap:8px; border-radius:14px; font-size:13px; font-weight:500; }.demo-button { background:var(--lab-ink); color:#fff; }.finish-button { background:#fff; border:1px solid var(--lab-line); }
.demo-hint { display:block; margin:10px 0 20px; text-align:center; font-size:10px; color:var(--lab-secondary); }
.lab-options { padding:0 15px; background:white; border-radius:18px; }.lab-option-row { width:100%; min-height:52px; display:flex; align-items:center; justify-content:space-between; font-size:12px; }.lab-option-row + .lab-option-row { border-top:1px solid #f0f0f2; }
.speed-picker { height:38px; box-sizing:border-box; display:flex; align-items:center; padding:3px; background:#f0f0f2; border-radius:8px; }
.speed-picker button { min-width:51px; height:30px; min-height:30px; display:flex; align-items:center; justify-content:center; box-sizing:border-box; margin:0; padding:0 8px; line-height:1; font-size:11px; border-radius:6px; color:var(--lab-secondary); }
.speed-picker .active { background:white; color:var(--lab-ink); box-shadow:0 1px 3px #0000000d; }
.lab-toggle { width:36px; height:22px; border-radius:12px; background:var(--lab-line); padding:2px; }.lab-toggle view { height:18px; width:18px; border-radius:50%; background:white; box-shadow:0 1px 3px #00000018; }.lab-toggle.on { background:var(--lab-accent); }.lab-toggle.on view { transform:translateX(14px); }
.lab-footnote { display:block; margin:20px 4px 0; color:var(--lab-secondary); font-size:10px; line-height:1.8; text-align:center; }
@media (max-width:360px) { .lab-content { padding-left:18px; padding-right:18px; }.lab-title { font-size:25px; }.lab-stage { height:234px; } }
@media (prefers-reduced-transparency:reduce) { .with-context .lab-status { background:white; }.lab-context { filter:none; opacity:.1; } }
</style>
