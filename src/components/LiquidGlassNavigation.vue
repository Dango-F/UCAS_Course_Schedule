<template>
  <view id="liquid-nav-root" class="liquid-nav" :data-navigation-hidden="!visible ? 'true' : undefined" :inert="!visible ? true : undefined" :aria-hidden="!visible ? 'true' : undefined" :nav-config="navConfig" :change:nav-config="glassNav.configure">
    <view class="glass-bar bottom-navigation" :style="{ '--glass-tab-count':items.length }" role="navigation" aria-label="主导航" :aria-hidden="visible ? 'false' : 'true'">
      <view class="glass-surface" aria-hidden="true" />
      <view class="glass-edge" aria-hidden="true"><view class="glass-light" /></view>
      <view class="glass-selection" aria-hidden="true"><view><view class="glass-touch-light"><view class="glass-touch-sheen"/></view></view></view>
      <button v-for="(item, index) in items" :key="item.label" class="nav-item" :class="{ active: index === activeIndex }"
        :data-nav-index="index" :aria-label="item.aria" :aria-current="index === activeIndex ? 'page' : undefined" :tabindex="visible ? 0 : -1">
        <AppIcon :name="item.icon" :size="25" color="#202126" /><text>{{ item.label }}</text>
      </button>
    </view>
    <button class="glass-wake" aria-label="显示导航栏"><view/></button>
  </view>
</template>

<script lang="ts">
import { computed, defineComponent } from 'vue'
import AppIcon from './AppIcon.vue'
import { useAppearanceStore } from '../stores/appearance'
import { NAVIGATION_ITEMS } from './navigation-items'
export default defineComponent({
  components: { AppIcon },
  props: { week: {type:Number, required:true}, activeIndex: {type:Number, default:0}, visible: {type:Boolean, default:true}, reducedMotion:Boolean },
  emits:['select'],
  setup(props) {
    const appearance = useAppearanceStore()
    const items = NAVIGATION_ITEMS
    return { items, navConfig:computed(() => ({week:props.week, activeIndex:props.activeIndex, reducedMotion:props.reducedMotion, clarity:appearance.glassClarity, touchLight:appearance.glassTouchLight, navMotion:appearance.navMotion, qElastic:appearance.qElastic, hopPeak:appearance.navHopPeak, navVisibility:appearance.navVisibility})) }
  },
  methods: { onViewSelect(index:number) { if (this.visible && index >= 0 && index < this.items.length) this.$emit('select', index) } }
})
</script>

<script module="glassNav" lang="renderjs">
import { createGlassNavigation } from './glass-navigation.js'
import { createNavigationAnchor } from './navigation-anchor.js'
import { createNavigationVisibility } from './navigation-visibility.js'
let controller, anchor, visibility, config, readyTimer
export default {
  mounted() {
    controller?.destroy()
    anchor?.destroy()
    visibility?.destroy()
    controller = null
    clearTimeout(readyTimer)
    const owner = this
    const bind = (attempt = 0) => {
      const root = document.getElementById('liquid-nav-root')
      if (!root?.querySelector('.glass-surface') || !root.closest('.phone-canvas')?.querySelector('.navigation-anchor-heading') || !config) {
        if (attempt < 30) readyTimer = setTimeout(() => bind(attempt + 1), 16)
        return
      }
      controller = createGlassNavigation(root, config, index => owner.$ownerInstance?.callMethod('onViewSelect', index))
      anchor = createNavigationAnchor(root)
      visibility = createNavigationVisibility(root, () => controller?.suspend(), config.navVisibility)
    }
    bind()
  },
  beforeUnmount() { clearTimeout(readyTimer); visibility?.destroy(); visibility = null; controller?.destroy(); anchor?.destroy(); anchor = null; controller = null; config = null },
  methods: { configure(value) { if (!value) return; config = value; controller?.configure(value); visibility?.configure(value.navVisibility) } }
}
</script>

<style scoped src="./glass-navigation.css"></style>
