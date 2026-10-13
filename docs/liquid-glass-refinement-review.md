# 液态玻璃第二轮：资料复核与实现决策

这是 2026-09-20 的历史记录。最新 56px 三项常驻底栏及交互优化见 [liquid-glass-compact.md](liquid-glass-compact.md)；本页的 72px、空闲隐藏和旧入口已被后续改动替代。

日期：2026-09-20。目标是美化现有 Vue / uni-app 底栏，不重构课表，不改变导航入口或加载动画。

## 先核实，而不是直接采纳讨论结论

| 对话中的说法 | 复核结果 | 本次决策 |
| --- | --- | --- |
| GitHub 和 GitBook 是两套方案 | 不对，是同一 Backdrop 项目的源码与文档 | 继续以固定提交源码为依据 |
| Backdrop 只能采样 Compose GraphicsLayer | 过于绝对。源码还有 CanvasBackdrop，自定义 DrawScope 绘制也能提供背景；Backdrop 本身是接口 | 原生外部像素输入存在研究路径，不宣称不可能 |
| Vue/WebView 与原生 Compose 无法一起使用 | 不能直接把库当 Vue 组件导入，但 AndroidView 支持混合 UI；这不自动解决背景采样 | 本次不引入原生插件或重建 Activity |
| 原生插件一定能直接折射 WebView | 同样不能成立。PixelCopy 可复制窗口像素，但需同步、裁剪、处理额外复制成本和自采样反馈；尚未在此 App 验证 | 不承诺其帧率，也不说必须重写整张课表 |
| WebGL 绝不可能直接使用 DOM 渲染结果 | 过于绝对。HTML-in-Canvas 已有实验实现，包括 WebGL/WebGPU 纹理接口；目前提案仍明确标记 Chromium flag | 不让正式版依赖实验开关，也不加入逐帧 html2canvas |
| CSS 只能做模糊 | 不完整。本项目的 backdrop-filter 引用 SVG 位移滤镜，在实测 Chromium 中能改变真实背景像素 | 保留已验证方案和回退路径 |
| 加入色散、更多 blur 就更像玻璃 | 属于审美选择，不是性能或效果保证 | 优先材质层次、边缘光和运动反馈；暂不增加色散、多透镜 |
| 位移图只生成一次，所以滚动时没有成本 | 不对。CPU 不重算位移图，但背景变化时浏览器仍需处理滤镜与合成 | 控制面积，保留真机验收要求 |

### 一手资料

- [Backdrop 官方简介](https://kyant.gitbook.io/backdrop)：明确链接到 AndroidLiquidGlass。
- [CanvasBackdrop 源码](https://github.com/Kyant0/AndroidLiquidGlass/blob/65ab177e90e5c1d8c62e70cf7755841982da65f6/backdrop/src/commonMain/kotlin/com/kyant/backdrop/backdrops/CanvasBackdrop.kt)：接受 `DrawScope.() -> Unit`，并非仅有 LayerBackdrop。
- [Backdrop 接口](https://github.com/Kyant0/AndroidLiquidGlass/blob/65ab177e90e5c1d8c62e70cf7755841982da65f6/backdrop/src/commonMain/kotlin/com/kyant/backdrop/Backdrop.kt)。
- [Android View / Compose 互操作](https://developer.android.com/develop/ui/compose/migrate/interoperability-apis/views-in-compose)。此文证明可混合，不证明 Kyant 自动捕获 WebView。
- [PixelCopy](https://developer.android.com/reference/android/view/PixelCopy)：Window / Surface 到 Bitmap 的复制能力。将复制结果作为自定义背景属于可行性推断，不是本项目已验证实现。
- [WICG HTML-in-Canvas](https://github.com/WICG/html-in-canvas/blob/main/README.md)：本次读取的 live explainer 使用 content=drawable / drawable 及相关纹理 API，状态仍为 flag 实现。网上旧例子中的 layoutsubtree、接口命名不能当作稳定 API。
- [交互式玻璃底栏文档](https://kyant.gitbook.io/backdrop/tutorials/interactive-glass-bottom-bar)。

本地重新阅读 `LiquidBottomTabs.kt`、`DampedDragAnimation.kt`、`Shaders.kt`、`Lens.kt`、
`LayerBackdrop.kt`、`CanvasBackdrop.kt`、`Backdrop.kt`、Android `RuntimeShader.kt`。
该 Android 后端 RuntimeShader 标注 API 33；不能将此门槛套用到所有平台或 WebView 的 SVG 路径。

## 视觉方案

沿用课表的克制配色：纸白 #fafafc、玻璃白 #ffffff、石墨 #202126、雾灰 #343541、边缘冷灰 #8391a3。
沿用系统字体；导航标签 11px，图标 25px，不新增字体或改变课程排版。
保持 72px 胶囊、4px 内边距、两侧 16px 与安全区；特征是透明外壳中一块轻微受力形变的选中胶囊。

静态材质：白色覆盖 .34 → .19；减轻阴影；边缘改为有方向的渐变细高光，mask 不支持时保留细边框。
选中胶囊仍为可识别的浅灰，但增加顶面亮度与底部暗沿，不再叠加一个昂贵的背景透镜。
唤出柄保持 52×44px 点击区域，视觉缩小为 40×20px；不牺牲触控尺寸。
显隐位移 22px → 10px、缩放 .97 → .985、位移动画 320ms → 280ms，减少弹窗感。

## 交互实现

- 位置与形变分离：位置直接按手指位移更新，不做弹簧拖尾。
- 保留最初抓取位置；从按钮侧边开始拖动也不会在超过识别阈值后跳到手指中心。
- 速度按实际事件时间做指数平滑并限幅，左右使用相同形变强度，不因改变方向突然翻转。
- 横向拉伸范围 1.015～1.095，纵向温和压缩；只变形选中背景，图标文字保持不变。
- 手指停止移动后，速度衰减最多持续 240ms，并归零停止 rAF。静止按压、普通课表滚动和隐藏状态没有形变帧循环。
- 固定径向高光通过 transform 跟随二维触点，不逐帧改写径向渐变参数。
- 松手直接对准目标，避免先回旧选项；点击/拖动完成仍立即打开原有页面或弹层，不为动画人为延迟。
- 保留 1200ms 空闲隐藏、按住保持、横向切周不唤出、弹层阻断与返回恢复。
- 取消触摸、窗口失焦、旋转尺寸变化都会取消预览；应用与系统减少动态时取消形变。

特意未加入：真实背景亮度取样、色散、多透镜、全屏 shader、原生桥接、课程卡片玻璃化、常驻动画循环。
它们不是“不能做”，而是当前收益与复杂度不匹配。后续须通过真机对照再决定。

## 备份与验收

本轮修改前：`.backup/liquid-nav-refine-before-20260920-190146/`，包含 src/scripts/tests/docs，以及 screenshots-before。
上一轮备份仍保留。呼吸圆点及其他三版动效代码本轮不改。

单测新增速度平滑、形变限幅/对称和抓取点连续性；浏览器新增偏心抓取、停手恢复、空闲零属性写入、位移图不重复生成的检查。
继续运行静止背景折射对照、真实拖动/取消、显隐、导航、响应式与可访问性，以及原有切周/动效回归。
桌面浏览器测试不能证明 Android 设备达到 60/120fps。

验收结果：68 项单元测试、类型检查、H5/App 构建通过；玻璃导航、V2 连续切周、四版加载动画三组浏览器回归通过。
额外验证 scroll-view 中真实课程变色会改变玻璃内像素，不只验证独立测试条纹；已查看正常课程底图、按压和折射对照截图。
完整课表底图截图：`.artifacts/glass-nav/course-backdrop.png`；交互图：`pressed-glass.png`。

回归时发现动效浏览器脚本仍期待 1.05s，但本轮开始前的工作区与单元测试已改为 0.9s；
只将过期浏览器断言同步到 0.9s，没有修改加载动画实现。
