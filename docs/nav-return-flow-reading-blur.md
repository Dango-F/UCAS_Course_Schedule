# 返回导航、流动恢复与读取模糊

## 2026-10-12 真机排查：截图 MIME 标头与常驻高斯模糊

备份：`.backup/reading-renderer-before-20261012-220847`。

连接的 Android 14 测试手机在真实教务页中 `draw()` 成功；`toBase64Data()` 返回有图像内容的字符串，但标头是 `data:image/null;base64`。原代码只接受 PNG/JPEG 标头，错误地将这种图像判定为空，继而退回每次文档加载后注入 CSS 的路径。此前“截图返回 null”的推断不完整。临时遮护仍有异步 `evalJS` 与立即跳页的竞争，以及 600ms 后强制撤去的空档，现已移除。

当前路径：只截取读取前的课表一次，使用命名 Bitmap；进度层按 ID 访问 Bitmap，在 HTML5+ 渲染层转换数据，根据 PNG/JPEG 的实际编码签名修正 MIME，再解码并施加 1.2px 高斯模糊。收到绘制确认后显示进度圈并启动读取，全部课程共用同一个图像节点。Bitmap 保留到读取结束，浮层意外重载也可恢复相同画面。结束/取消/release 会释放 Bitmap 和图像；不把图像写到磁盘、日志或 storage。纯色遮护不再使用。

真机验证已覆盖真实个人课表截图、跨 WebView 读取、两次底层页面刷新（12 次模糊背景像素采样完全一致）、清晰进度动画，以及完整读取正常进入结果预览。第一轮完整读取 262 次采样均存在模糊图像；第二轮增加截图前后读取状态检查，60 次有效采样中清晰帧为 0、背景像素完全一致，未自动保存导入结果。类型检查、App 构建和相关 34 项测试通过；补充的“模糊画面准备期间不显示清晰进度层”断言也已通过。

以下为历史实现记录。

修改前备份：`.backup/nav-return-flow-blur-before-20260922-225854`。

## 设置返回

`SettingsDashboard` 同时上报二级页和 leaving 状态。导航在 leaving 开始时可见，不再等 340ms 退出动画结束；动画完成前仍 inert，主页面也阻止切换栏目，避免中途误触卸载设置内容。导航节点和液态玻璃控制器不重建。

返回时实际绘制层级为：一级页（1）< 导航栏（20）< 二级页（25）< 导入页（30）。设置外层保持 z-index:auto，二级页与导航在同一父级层叠体系内比较，未收回部分会遮住导航，已收回部分自然露出导航。

## 流动材质

只修改 flow：松手且距离目标不超过 0.5 个 CSS 像素时，恢复原有灰色及 0.94 亮度，不再等压力弹簧精确归零。位移、形变、反射、光斑弹簧仍自然收敛。对应 CSS 限定 `:not(.is-hop)`；跃动控制器与时序未修改。

## 读取模糊

### 当前方案：持久画面 + 非阻塞降级

此前方案仍有未覆盖的实际路径：Native.js 调用未确认画面生效就缓存成功；不支持原生/文档启动的基座仍会加载后补模糊；读取没有等待模糊画面显示就导航。仅测试 mock API 成功及浏览器文档启动路径不足以排除清晰帧。

现在实际读取入口先通过 HTML5+ WebView.draw 获取当前网站可视区域，存入匿名 Bitmap，转为 data URI 后立即 clear Bitmap。在独立本地读取 WebView 内解码并显示轻模糊图片，经过渲染帧后回传 ready token。准备成功后启动网页导航和提取；准备失败、异常或超时也会继续读取，不把视觉功能当成导入前提。读取期间保持这一帧网站背景，不追随底层页面刷新；动画和进度正常更新。原生读取层固定 zindex:999，防止后显示的网站遮住它。保持 1.2px 模糊、2%轻色罩和0.9秒对勾延迟。

图片不写入文件、日志或 storage，只在内存中保存；storage 仅传递短 token 状态且读取后立即删除。完成、失败、取消和退出时清理图片、待处理回调、轮询、原生 Bitmap。截图仅在通过教务课程网址检查后进行，不对登录表单截图。

2026-09-23 回归修复：移除“读取背景尚未准备好，请稍后重试”的硬失败分支。背景准备最长等待1.5秒，会话另设1.8秒保险计时器，防止宿主 Promise 永不完成；过期、取消和重开使用代次检查，导航仅启动一次。浮层初始化脚本与图片设置同次 evalJS 执行，准备期间每240ms有界重试，避免一次发送丢失后永远等不到回执。初始化和同 token 设置均幂等，不重新解码或清掉正在显示的图片；浮层 loaded 时重放当前图片，不重新截图后续课程页面。

缺少 storage/plusready 或回执超时不等同于图片失败：保留已经提交的图片，停止后续回执，同时启用原生/文档内模糊降级；明确截图/解码失败则只启用降级路径。取消后不会恢复旧图片。控制台只记录 capture unavailable / capture failed / paint confirmation timed out 等阶段，不记录图像、学校 URL 或登录信息。实际手机尚未连接，无法确定用户机型的失败具体发生在截图还是回执阶段；旧基座在截图和原生/文档启动模糊均不可用时，仍不能保证零清晰帧。

`tests/ucas-reading-surface.test.ts` 覆盖成功、失败、异常、超时、取消、重开、浮层重载和缺失回执，全量141项测试通过。浏览器回归加载实际构建的浮层 HTML 及相对路径脚本，验证桥缺失/抛错/延迟可用、重复初始化保持同一图片节点、重载重放及清理。额外禁用底层所有模糊，让底层三个新文档直接绘制清晰画面，核对独立模糊背景区域的截图像素完全一致，读取动画保持清晰。真实手机 WebView.draw 和绘制确认仍需真机验证。参考 [WebView.draw / zindex](https://www.html5plus.org/doc/zh_cn/webview.html)、[Bitmap.toBase64Data / clear](https://www.html5plus.org/doc/zh_cn/nativeobj.html)。

本次备份：`.backup/reading-persistent-backdrop-before-20260922-235010`。

非阻塞修复前备份：`.backup/reading-background-recovery-before-20260923-091309`。

### 降级能力路径（截图准备期间不启用，准备未确认后启用）

优先在网站 WebView 的原生 View 上设置 RenderEffect，独立透明 WebView 只负责清晰动画。原生效果跨文档刷新保留，新发现的网站子 WebView 在显示前配置，动画层不处理。若原生模糊不可用，则注册文档启动 CSS 脚本，在 HTML 解析前通过 MutationObserver 建立模糊层；loading/loaded 注入仍作补充。两条模糊路径互斥，避免重复叠加。结束、失败、取消、release 时移除原生效果、文档启动脚本句柄、观察器、缩放监听和网页模糊层。

模糊强度为 `src/import/ucas.ts` 的 `UCAS_PROGRESS_BLUR_PX = 1.2`；CSS 兼容路径遮罩浓度为 `UCAS_PROGRESS_VEIL_ALPHA = .02`，原生路径不叠加色罩。原生半径按屏幕 density 换算，CSS 半径按网页缩放比例换算。不改变网站内容、不把动画包进 filter，也不改变原有 0.9 秒对勾延迟。CSS 路径保留减少透明度设置的实色兜底。

能力边界：RenderEffect 需要 Android API 31+ 且原生桥可用；文档启动注入需要基座包含支持该功能的 AndroidX WebKit。二者均不可用时只能回退 loading/loaded 注入，不能承诺旧基座刷新零清晰帧。当前项目没有实体手机连接，原生调用仅完成 mock 生命周期验证，需要真机验收。参考 [RenderEffect](https://developer.android.com/reference/android/graphics/RenderEffect)、[ScriptHandler.remove](https://developer.android.com/reference/androidx/webkit/ScriptHandler)、[HTML5+ Native.js](https://www.html5plus.org/doc/zh_cn/android.html)。

背景滤镜受文档的 backdrop root 限制，不能把透明原生 WebView 的 CSS 模糊视作对另一个原生 WebView 的跨层模糊。参考 [MDN backdrop-filter 的作用范围](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter#backdrop_root)。

验证：类型检查、128 项单元测试、H5/App 构建；`scripts/verify-reading-blur.cjs` 检查同页和独立文档动画、1.2px 模糊与2%遮罩、完成状态、清理及减少透明度，以及文档启动注册后连续三次真实文档导航（每次从第一帧采样，共30帧）均存在模糊、取消后刷新不再出现。截图位于 `.artifacts/reading-blur`，使用本地模拟网站，不代表真实教务登录或特定品牌手机已验收。

刷新修复前备份：`.backup/reading-refresh-blur-before-20260922-233246`。

本次层级与轻模糊修改前备份：`.backup/settings-layer-light-blur-before-20260922-231753`。`scripts/verify-settings-categories.cjs` 已加入返回中途的实际遮挡检查，截图位于 `.artifacts/settings-categories/return-layering.png`。
