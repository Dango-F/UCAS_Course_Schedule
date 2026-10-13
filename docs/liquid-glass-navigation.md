# 液态玻璃底部导航

**当前实现（2026-09-21）**：三项「课表 / 今日 / 设置」、56px 高；组件挂载期间始终显示，不因滚动、停顿、弹层或页面焦点变化而隐藏。
最新材质为低雾度透明玻璃：0.6px 模糊、6% 浅色覆盖，保留边缘折射。参数、前后对比与验收见 [liquid-glass-clear.md](liquid-glass-clear.md)。
折射坐标修正、松手连续性和最新验收见 [liquid-glass-continuity.md](liquid-glass-continuity.md)。
早期三项常驻导航的实现记录保存在 [liquid-glass-compact.md](liquid-glass-compact.md)。
下文保留初版实现记录，入口、截图路径和测试数量不能直接当作当前状态。

第二轮资料复核、视觉优化与备份见 [liquid-glass-refinement-review.md](liquid-glass-refinement-review.md)。

## 范围与备份

主页底栏改为悬浮胶囊；保留原有「课表 / 今日 / 学期 / 动效」入口，不新增空的日程、个人页面。
截图参考只用于材质、轮廓、间距与选中状态，不修改课程卡片或 V2 横向翻页算法。

修改前完整源文件快照：`.backup/liquid-nav-before-20260920-122451/`，包含 `src/`、`scripts/`、`tests/`、`docs/`。
如需回退，仅对照恢复本功能所列文件，不整体覆盖后续业务修改。加载圆点恢复是独立改动，应保留。

## 源码参考与移植

优先阅读 [Kyant0/AndroidLiquidGlass](https://github.com/Kyant0/AndroidLiquidGlass)，参考固定提交
`65ab177e90e5c1d8c62e70cf7755841982da65f6`（kmp 分支）。本地研究副本在 `.artifacts/references/AndroidLiquidGlass/`。
阅读的核心文件：

- `app/src/commonMain/kotlin/com/kyant/backdrop/catalog/components/LiquidBottomTabs.kt`
- 同目录下 `utils/DampedDragAnimation.kt`、`utils/InteractiveHighlight.kt`
- `backdrop/src/commonMain/kotlin/com/kyant/backdrop/effects/Lens.kt`
- 同模块 `internal/Shaders.kt`、`highlight/Highlight.kt`、`DrawBackdropModifier.kt`、`backdrops/LayerBackdrop.kt`

补充阅读 [效果接口](https://kyant.gitbook.io/backdrop/api/backdrop-effects)、
[玻璃底栏](https://kyant.gitbook.io/backdrop/tutorials/glass-bottom-bar)、
[交互底栏](https://kyant.gitbook.io/backdrop/tutorials/interactive-glass-bottom-bar)、
[FAQ](https://kyant.gitbook.io/backdrop/faq)。

原库为 Kotlin / Compose，不直接装入 uni-app WebView。
本实现将 Shader 中的有符号距离、法线和 `1 - sqrt(1 - x*x)` 折射曲线移植为胶囊位移图：

1. 按胶囊真实尺寸计算边缘 16px 内的向内采样偏移，中心不扭曲。
2. 生成 RG 编码位移纹理，作为 SVG `feDisplacementMap` 的输入；最大偏移 10px。
3. 对真实背景应用饱和度、轻模糊和 SVG 位移滤镜；图标、文字位于独立前景层，不参与折射。
4. 加入沿边高光、克制阴影、浅灰选中胶囊以及按压/拖动时的轻微拉伸和光照变化。

这是受原库启发的 WebView 移植，不是其全部原生 Shader / 色差 / 阻尼物理系统的等价实现。
Apache-2.0 许可与修改声明保存在 `src/static/licenses/AndroidLiquidGlass-*`，位移实现也保留来源声明。

## 交互与性能边界

- 导航始终显示并可交互；滚动、惯性、停顿、弹层和焦点变化均不控制其显隐。相关显隐状态、生命周期监听和禁用分支已删除。
- 导航上可横向拖动选中胶囊，松手执行目标入口。
- 组件卸载时移除指针监听、尺寸观察器和 SVG。
- 位移图只在安装或尺寸变化时生成，没有课表截图、DOM 克隆或逐帧 Vue 状态更新。
- 不监听课表滚动，也不会在滚动热路径读取几何布局。导航位置变化不会改变课表可用高度。
- 底部课表留白增至 104px 加安全区，使最后一节能滚动至导航上方。

目前仅 Chromium / Android WebView 路径启用 SVG 背景折射；其他引擎回退为模糊、高光和阴影材质。
不支持 backdrop-filter 时使用更实的浅色背景。系统减少透明度/高对比度使用实色；系统或应用减少动画时取消形变过渡。
这不是 iOS 原生 Liquid Glass，也不保证所有 Android WebView 都有相同的 GPU 成本。
真机仍须验收连续纵向滚动、切周同时导航可见、120Hz 屏和旧版 WebView 的观感与帧率。

## 文件与验收

- `LiquidGlassNavigation.vue`：独立外观、入口语义、renderjs 生命周期。
- `glass-navigation.js`：按压/拖动和材质动画；不含导航显隐状态或显隐逻辑。
- `glass-lens.js`：折射数学与尺寸相关滤镜安装。
- 主页接入导航，`CalendarWeekPanel.vue` 只调整底部留白；`renderjs.d.ts` 增加模块声明。

单元测试：`tests/glass-navigation.test.ts`；浏览器：`node scripts/verify-glass-nav.cjs`。
浏览器检查导航在空闲、纵向/横向滚动、弹层打开和关闭后均保持显示，以及键盘、320/390/768px 布局和减少透明度回退。
同一静止条纹背景分别启用/移除 SVG 位移，比较截图，并要求移除前连续两帧完全一致，排除动画造成的假差异。
截图与报告输出至 `.artifacts/glass-nav-clear/`。另运行 `verify-loading-lab.cjs` 和 `verify-swipe-ab.cjs` 检查原有功能。

2026-09-20 的历史验收针对当时的版本；之后导航显隐控制已整体删除。
浏览器结果不等同于 Android 真机帧率验收。
