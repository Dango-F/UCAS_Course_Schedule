# 导入动效预览

入口：首页底栏 → 动效。仅用于比较，不改变教务导入流程、课表或设置。

## 四个方案

| 方案 | 读取中 | 完成 |
| --- | --- | --- |
| 现用 · 呼吸圆点 | 18 个圆点，顺时针传播，1.45 秒呼吸周期 | 圆点散开，绿色圆环用 0.5 秒描满，再画对勾（恢复原有节奏） |
| 一 · 细线旋环 | 单细弧，1.4 秒匀速旋转 | 旋弧淡出，圆环闭合，再描出对勾 |
| 二 · 渐隐短线 | 12 根短线，1 秒逐次渐隐 | 短线淡出，只留一个对勾 |
| 三 · 双弧回环 | 两段明暗圆弧，1.8 秒同向回旋 | 双弧淡出，圆环与对勾依次出现 |

新增方案的描圈时长与旋转周期一致：方案一 1.4 秒匀速、方案三 1.8 秒并沿用
旋转缓动；两者在圆环闭合后停顿 100ms 再画对勾。
现用呼吸圆点按用户要求恢复：描圈前延迟 220ms，500ms 缓出描圈；
完成后 0.9 秒开始描勾，耗时 900ms，正式导入与预览同步。
正式导入的完成展示窗口恢复为 2 秒；顺时针呼吸方向保留。
方案二没有圆环，保留短线淡出后于 300ms 开始描勾的结构。
新增三版的对勾仍用 500ms，现用版仍用 900ms；慢放模式整体按两倍时长播放。

原版几何、颜色与时序来自 `src/import/ucas.ts`，在隔离的预览组件中复现；
2026-09-20 将正式导入和现用预览的呼吸相位同步改为顺时针，不改变周期和完成动画。
不注入生产 WebView 的全屏遮罩。舞台大小与说明文案对四版统一，便于比较。
新方案是 Apple 审美启发的原创实现，不是 Apple Pay 官方控件或像素级复刻。

## 设计与实现

使用纸白 #f5f5f7、纯白 #ffffff、石墨 #1d1d1f、辅助灰 #6e6e73、
分隔灰 #e5e5ea、控件蓝 #007aff。标题用系统 Display 字体栈，正文使用
系统 Text 字体栈；不加载外部字体。舞台置于选项上方，只运行所选动效。

SVG 为受信任的本地静态字符串，由 App Vue / H5 的 `v-html` 显示。
uni-app 会自动隔离组件样式，使用显式 `:deep()` 选择器匹配 SVG 内部元素；
仅通过构建不足以证明动画在运行，浏览器测试还检查实际样式和跨帧变化。
旋转采用 CSS transform，明暗用 opacity，完成时短暂使用 stroke-dashoffset。
Vue 仅在用户操作/读取状态变化时更新；没有逐帧 JavaScript 或新增依赖。
支持系统减少动态、应用减少动画、0.5× 慢放、场景底图和完整演示。
离开页面时取消演示计时并暂停 CSS 动画；不保存方案或自动接入真实导入。

## 阅读的规范与代码

- [Apple HIG · Progress indicators](https://developer.apple.com/design/human-interface-guidelines/progress-indicators)：固定位置、准确状态、不伪造进度百分比。
- [Apple HIG · Motion](https://developer.apple.com/design/human-interface-guidelines/motion)：克制并为状态变化服务。
- [Ionic spinner.scss](https://github.com/ionic-team/ionic-framework/blob/main/core/src/components/spinner/spinner.scss)：阅读了透明度序列、旋转、暂停状态的实际实现。
- [Ionic spinner-configs.ts](https://github.com/ionic-team/ionic-framework/blob/main/core/src/components/spinner/spinner-configs.ts)：阅读了圆周排列与负延迟配置。只参考思路，未复制源码或引入依赖。
- [uni-app Vue 3 支持说明](https://uniapp.dcloud.io/tutorial/vue3-basics)：确认 App 与 H5 支持 v-html；此预览不面向小程序/nvue。

## 测试

`npm test`、`npm run typecheck`、`npm run build:h5`、`npm run build:app`。
`node scripts/verify-loading-lab.cjs` 验证实际页面并保存截图。
2026-09-20：类型检查、65 项单元测试、H5/App 构建、四版动效浏览器测试
和原有课表滑动回归均通过。已复查截图，覆盖 320 / 390 / 768px 布局。
真机 WebView 的动画观感仍需设备上最终确认。

修改前快照：`.backup/loading-lab-before-20260919-175618/`（主页、路由、原版导入实现）。
