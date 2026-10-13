# 七次采样色散与深度折射

参考 Kyant0/AndroidLiquidGlass 的 kmp 分支 `internal/Shaders.kt`（RoundedRectRefractionWithDispersionShaderString）和 `effects/Lens.kt`，不是彩色边框模拟。原库 Apache-2.0 许可保留在 src/static/licenses。

## 实现

- 外壳和交互选中胶囊都使用七个位移采样，系数为 1、2/3、1/3、0、-1/3、-2/3、-1。
- 色散强度随归一化坐标 x*y 变化，RGB 权重沿用原 shader；alpha 独立取七次采样平均值，避免叠加白色或黑色遮罩。
- `depthEffect` 将胶囊 SDF 法线与中心径向方向相加并归一化，再进行向内折射。它改变背景采样方向，不是阴影或简单放大。
- 两项默认开启；installGlassLens 的 chromaticAberration/depthEffect 选项可以独立关闭，便于对照。
- 保留现有低模糊、低白色覆盖，以及流动/跃动两种动画。光学进度跟随压力/膨胀，表面通透进度仍按原材质曲线恢复。
- 触点控制高光方向；pointermove 合并到绘制帧。两个模式都在失焦、隐藏和销毁时清理动画。
- 位移图仅初始化和尺寸改变时生成；通透度和逐帧运动不重编码。选中胶囊静止时停用额外滤镜。
- 设置预览复用正式导航控制器，支持按压、拖动、模式选择和减少动画，但没有真实页面导航权限。
- 设置 → 外观与交互 → 导航栏显示，可选固定显示（默认）或自动隐藏，独立持久化。固定模式不启动闲置定时器，不覆盖设置详情等页面原有的隐藏规则。
- 自动模式下纵向滚动唤出导航，停止活动 1200ms 后隐藏；横向切周不唤出。保留可点击/键盘操作的唤出柄，长按和键盘焦点期间不隐藏。

## 精度及兼容边界

这是 WebView/SVG 对原算法的胶囊形移植，不是原生 AGSL。位移图与浏览器中间纹理存在 8-bit 量化、插值和合成差异，不宣称与原生逐像素相同，也不实现任意圆角矩形。

Chromium 路径启用 SVG backdrop；其他引擎保留模糊降级。CSS.supports 与 UA 不能证明所有 Android WebView 均正确渲染，仍需真机验收。减少透明度/增强对比度时关闭两个光学滤镜。

完整七次采样增加 GPU 成本，尤其同时按压两层玻璃时；本轮遵照要求未削弱色散以回避文字干扰。没有承诺 Android 60/120Hz，也未添加自动背景亮度分析或原生多形状融合。

## 验证入口

- `npm test`、`npm run typecheck`、`npm run build:h5`、`npm run build:app`
- `node scripts/verify-glass-spectrum.cjs`：色散/depth 开关像素对照、纯色和透明 alpha、显隐与可交互预览。结果在 `.artifacts/glass-spectrum`。
- `node scripts/verify-selector-optics.cjs`：320/390 宽，DPR 1/2 下真实背景折射、静止停用、缓存与无障碍降级。
- `node scripts/verify-nav-hop.cjs`：长按、快速切换、反向拖动、两模式及触点高光。

备份：`.backup/glass-spectrum-before-20260924-044017`，含恢复说明。

导航显示设置加入前另存：`.backup/nav-visibility-choice-before-20260924-101314`。

2026-09-24 最终验证：172 项单元测试通过，类型检查、H5/App 构建通过。浏览器光谱测试和完整导航回归均通过，包含默认固定、自动隐藏、两项重启保存、真实纵向触摸、惯性结束隐藏、键盘焦点、320/390/768 布局及无障碍降级。上轮跳跃动画、滑块像素与通透度预览回归也已通过。Android 真机性能尚未验收。
