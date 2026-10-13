<template>
  <ImportDashboard ref="dashboard" :host-instance="pageInstance" @close="closePage" />
</template>

<script setup lang="ts">
import { getCurrentInstance, ref } from 'vue'
import { onBackPress } from '@dcloudio/uni-app'
import ImportDashboard from '../../components/ImportDashboard.vue'

const pageInstance = getCurrentInstance()
const dashboard = ref<{ handleBackPress: () => boolean } | null>(null)

// Legacy direct page URL only; the + entry now uses the embedded CSS route.
function closePage(): void {
  // uni.navigateBack({ animationType:'pop-out', animationDuration:220 })
  uni.navigateBack({ animationType:'none', animationDuration:0 })
}
onBackPress(() => dashboard.value?.handleBackPress() || false)
</script>
