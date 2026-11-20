<template>
  <view class="scroll-area" :reset-scroll="resetWhenHidden" :change:reset-scroll="scrollView.reset">
    <view class="uni-scroll-view scroll-viewport" :class="{ 'hide-scrollbar': hideScrollbar }"><slot /></view>
  </view>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
export default defineComponent({ props: { hideScrollbar: Boolean, resetWhenHidden: Boolean } })
</script>
<script module="scrollView" lang="renderjs">
export default {
  methods: {
    reset(hidden, previous, owner, instance) {
      if (hidden && previous === false) instance.$el.querySelector('.scroll-viewport').scrollTop = 0
    }
  }
}
</script>
<style scoped>
.scroll-area { display:block; width:100%; }
.scroll-viewport { position:relative; width:100%; height:100%; max-height:inherit; overflow-x:hidden; overflow-y:auto; -webkit-overflow-scrolling:touch; }
.hide-scrollbar { scrollbar-width:none; }
.hide-scrollbar::-webkit-scrollbar { display:none; }
</style>
