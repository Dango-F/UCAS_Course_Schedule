# 湖畔课表启动画面

使用现有手机应用图标的源图 `src/static/app-icon-1024.png`，保留其浅蓝渐变底和原始山水图形，仅对外边缘做圆角处理。应用名称与原有文案“让时间，清晰一点。”居中排列。底部使用用户提供的国科大横式一蓝色标准标识，保持官方比例和颜色，并附“非官方课表应用”。源标识副本保存在 `design/launch/ucas-horizontal-blue.png`。

2026-10-10 调整主次比例：应用图标保持 80px，保留渐变圆角底板。底部国科大横式标识由过小的 72px 放大至 120px，保证校名清晰。学校标识为横向组合，其高度仍明显小于上方应用图标，按视觉体量维持主次关系。主视觉区域为 220×172px，顶部位于视口高度的 18%，最低 32px；图标在区域内下移 8px。标题 20px，副标题 11px。底部区域为 128×48px，说明文字 9px。短横屏两组按相近比例缩小。应用图标源文件保持不变。

2026-10-11 修复交接错位：旧原生九宫格图在空白区域拉伸，页面按百分比定位，两套算法以及系统留白差异使两个标识在交接时跳动。原生阶段现仅绘制 `#F6F8FC` 纯色背景；两组标识仅在页面动画层绘制一次，原位淡入和波纹播放期间位置不变。取消原有 2px 上浮。

`design/launch/launch-preview.png` 是当前页面构图的设计预览。当前独立浏览器回归截图为 `.artifacts/launch-screen/handoff-*.png`，报告为 `handoff-report.json`；验证范围为实际素材与组件 CSS，不包括原生窗口或完整 App 生命周期。旧 `launch-*.png` 与旧报告不能作为当前构图的验收。真机效果需要安装新 APK 验证。

## 启动流程

1. Android 原生启动阶段显示密度对应的纯色九宫格背景，不在此阶段放置两组标识。
2. 首页与两张本地图片就绪后，WebView 先绘制同色背景，标识初始透明；再调用 `plus.navigator.closeSplashscreen()` 并开始播放。
3. 两组标识用 180ms 原位淡入，随后仅轮廓波纹扩散，标识不移动。600ms 后整体开始淡出，820ms 后移除。不会循环、访问网络或重复在返回前台时播放。
4. 系统“减少动态”或 App 的“减少动画”启用时直接交接。图片加载失败也结束等待；组件 1.8 秒退出保护、App 2.5 秒关闭原生启动屏保护防止卡住。离开首页会提前关闭和清理计时器。

使用 `app-plus.splashscreen` 手动关闭配置与 `app-plus.distribute.splashscreen` 图片配置。两者不可混淆。启动动画层只在 App 首次首页实例启用；H5 普通访问不显示。开发预览：`npm run dev:h5` 后打开 `http://127.0.0.1:5173/?launchPreview=1`。没有新增面向用户的动画预览路由。

## 生成和打包

素材由 `python scripts/render-launch-assets.py` 生成，需要 Pillow 与 Windows 微软雅黑字体。首次导入可加 `--ucas-logo "官方横式蓝色PNG路径"`；之后直接使用项目中的源副本。生成两张 3 倍图供页面使用，以及 hdpi、xhdpi、xxhdpi 三张 `.9.png`，保存于 `unpackage/res/splash/`，已在 `src/manifest.json` 指定。原生图不需要再手工选择。

继续在 `C:\Users\FanYulong\Desktop\UCAS_Course_Schedule` 中使用 HBuilderX **发行 → 原生 App 云打包 → Android → 打正式包 → 快速安心打包**，使用原来的包名和证书。这次必须重新生成原生 APK；页面热更新、旧标准基座或只执行 `npm run build:app` 不能更新原生启动图。若使用诊断构建投影，投影脚本也会复制九宫格图片。

Android 12 以上系统可能先显示操作系统控制的图标启动屏，再进入 DCloud 启动画面；本项目是普通 uni-app，不添加仅 uni-app x 支持的 `splashScreens.android12` 配置。系统启动屏与本实现是不同层；本次修复针对 DCloud 原生画面与页面动画之间的错位，不承诺改变系统管理的图标动画。设备上的首帧、系统栏及交接需安装 APK 冷启动验收。

## 验证

本次通过 `npm run build:app`（编译器 5.26）、三张原生九宫格图的 aapt2 编译、4 项启动生命周期回归测试。`node scripts/verify-launch-handoff.cjs` 检查三张原生图内部颜色一致，并在独立浏览器中使用实际组件 CSS 与图片，覆盖 320×568、390×844、480×960 和 844×390：淡入与波纹期间两组标识的矩形坐标完全不变、布局无重叠、系统减少动态时直接可见且没有动画。该检查不依赖完整 App 的异步页面加载。

复核 UI 时先运行 `npm run dev:h5`，另一个终端执行 `npm run verify:launch-ui`。浏览器报告与截图位于 `.artifacts/launch-screen/`。源码和资源验证不代表 APK 已安装或真机动画已验收。

参考：[DCloud 启动界面](https://uniapp.dcloud.net.cn/tutorial/app-splashscreen.html)、[Android 九宫格图片](https://developer.android.com/studio/write/draw9patch)、[Android 启动动画设计](https://developer.android.com/develop/ui/views/launch/splash-screen)。动画短于 Android 官方建议的 1000ms 上限。
