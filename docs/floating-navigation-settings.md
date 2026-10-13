# 悬浮导航与设置层级

- 删除课表右上角设置入口，保留加号；设置从底部主导航进入。
- 三个栏目继续共用同一个 `LiquidGlassNavigation`，尺寸、定位、安全区策略和玻璃材质不分栏目设置。
- 今日/设置的 `scroll-view` 保持全高，页面边距和末尾留白移到内部内容容器，避免外层底部 padding 形成不随内容滚动的空白区。页面自身底色及课程卡片背景保留。
- 设置通过 `detail-change` 上报是否处于二级页以及是否正在退出：进入即隐藏，退出开始时立即显示，直到 section 回到 home 才解除 inert 和导航切换保护。二级页不再预留导航栏高度，只保留正常安全底距。
- 导航隐藏采用 `data-navigation-hidden`、`visibility`、`inert` 和禁用焦点，不卸载组件。不要在导航根节点上增加动态 class 绑定，否则 Vue 更新可能清除 renderjs 控制器维护的 `is-hop` 等状态类。
- 未改动玻璃材质参数、光斑、折射或运动控制器。设置进出动画仍共用 340ms transform 过渡。

修改前备份：`.backup/floating-nav-settings-before-20260922-213813`（src、scripts）。

验证：`npm run typecheck`、`npm test`、H5/App 构建；`scripts/verify-settings-categories.cjs` 检查全高滚动、短屏悬浮导航、设置层级显隐/焦点、组件复用和双向动画时长；`scripts/verify-nav-hop.cjs` 检查返回一级页后的真实触摸及材质效果；`scripts/verify-nav-anchor-import.cjs` 检查跨栏目位置和导入返回路径。浏览器模拟不代替不同品牌手机真机验收。
