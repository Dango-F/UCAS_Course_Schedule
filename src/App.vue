<script lang="ts">
import { initializeWidgetPlatform } from './services/widget-platform'
import { refreshWidgetActions } from './services/widget-sync'
import { protectNativeLaunchScreen } from './services/launch-screen'
export default {
  onLaunch() { protectNativeLaunchScreen(); initializeWidgetPlatform(); refreshWidgetActions() },
  onShow() { refreshWidgetActions() },
}
</script>
<style lang="scss">
@import './styles/base.scss';
</style>
