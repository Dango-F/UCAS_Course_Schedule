<script lang="ts">
import { initializeWidgetPlatform } from './services/widget-platform'
import { refreshWidgetActions } from './services/widget-sync'
import { protectNativeLaunchScreen } from './services/launch-screen'
import { enterUpdateForeground, updateForeground } from './services/app-update'
export default {
  onLaunch() { protectNativeLaunchScreen(); initializeWidgetPlatform(); refreshWidgetActions() },
  onShow() { refreshWidgetActions(); enterUpdateForeground() },
  onHide() { updateForeground.value = 0 },
}
</script>
<style lang="scss">
@import './styles/base.scss';
</style>
