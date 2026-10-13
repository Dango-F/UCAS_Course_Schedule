# 导航位置与导入 CSS 转场

## 定位规则

以未纵向滚动的网格课表第 9 节行中心为基准，而不是固定 5vh。
课表行高仍为 60px，午间间隔仍为 32px，第 9 节中心相对课程网格顶部为 542px。
课表与导航使用同一份 `calendar-geometry.js`，日期表头抽为 `CalendarDayHeading.vue`。

页面保留不占布局、不可见且不可聚焦的课表标题/日期表头测量基准。
ResizeObserver 在容器、标题或表头尺寸变化时计算中心相对 phone-canvas 的百分比。
CSS 用该百分比定位胶囊中心；滚动和切换周不触发位置追踪，也没有常驻 RAF 循环。
今日、设置和排列课表始终使用这个网格基准，尺寸变化时仍可重新测量。

用户确认的短屏降级：不压缩行高，胶囊底部保留安全区 + 12px。
百分比是根据实际课表尺寸计算的，不是所有设备写死同一百分比。
滑块材质、宽高、折射和导航动效没有修改。

## 导入与设置转场

检查时加号入口已嵌入 ImportDashboard，并已使用 createSettingsRoute。
本轮把重复 CSS 提取为 `settings-route.css`，设置与导入直接导入同一文件。
两者均为 340ms，进入从右到左，退出向右；只改变 transform，阴影固定。
退出 transitionend 后卸载，丢失事件时由原有控制器的兜底计时器收尾。
共享减少动画规则，并在应用偏好改变时完成进行中的转场。

加号入口原生 navigateTo/navigateBack 动画以注释留存。
旧 pages/import/index 独立 URL 仍保留兼容返回，但关闭原生动画；加号不再经过它。
学校登录原生 WebView 的读取、取消和释放逻辑未重写，真机登录流程仍需实机验收。

## 备份与验证

修改前快照：`.backup/nav-anchor-import-css-before-20260922-211849`。
新增定位单元测试：`tests/navigation-anchor.test.ts`。
浏览器完整回归：`scripts/verify-nav-anchor-import.cjs`。
另回归设置分类及导航长按/跃动，检查原动效未被改变。
