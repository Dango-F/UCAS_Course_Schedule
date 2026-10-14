# 主工程 + 快速安心打包：Android 正式包执行方案

本方案按用户指定的路线执行：直接在 `C:/Users/FanYulong/Desktop/UCAS_Course_Schedule` 发布，选择 Android、打正式包、快速安心打包。源码仍在本目录的 `src/`，无需导出临时工程。

2026-10-10 已确认：最新 `dist/release/apk/__UNI__F1ADC35__20261010000818.apk` 的三个 DEX 文件，与 `dist/cache/apk/__UNI__F1ADC35_cm.apk` 逐一 SHA-256 完全一致。该原生壳缓存最后修改于 2026-09-19 06:12:42，不包含两款 Provider。正式包确实复用了缺少插件的旧原生壳；自定义 debug 包包含两款 Provider。这解释了 debug 可用而正式包缺少整个插件的差异。仍需验证下一次重新生成的原生壳与最终 APK。

官方说明：UTS 支持云端打包；安心打包在云端构建原生部分，在本地加入应用资源并签名，可缓存原生代码包。自定义调试基座不支持安心打包，但本次选择的是正式包。[UTS 插件文档](https://uniapp.dcloud.net.cn/plugin/uts-plugin.html)、[安心打包指南](https://uniapp.dcloud.net.cn/tutorial/build/SafePack)。

## 1. 打开主工程

停止手机运行会话并保存所有修改。使用 HBuilderX 5.26，登录原来打包所用的 DCloud 账号，通过“文件 → 打开目录”或“导入已有项目”打开：

```text
C:/Users/FanYulong/Desktop/UCAS_Course_Schedule
```

选中该项目进行发行。根目录应包含 `package.json`、`vite.config.ts`、`src`；应用配置在 `src/manifest.json`，插件位于 `src/uni_modules/lakeside-widget/utssdk/app-android`，其中必须包含 `AndroidManifest.xml`、`config.json`、`index.uts`、Kotlin 文件和 `res/`。

本次无需制作自定义基座。若 IDE 提示缺少 Vue 编译、UTS 或安心打包插件，按提示安装。以前的 `pack-widget-android.ps1`、`prepare:android-release` 与 `prepare:widget-hbuilderx` 是临时目录排查工具，本次不要用它们作为发行入口。

## 2. 检查正式源码构建

在主工程 PowerShell 执行：

```powershell
Set-Location C:/Users/FanYulong/Desktop/UCAS_Course_Schedule
npm run typecheck
npm run build:app
```

如果缺少 `node_modules`，先执行 `npm ci`。依赖已可用时不必重复安装。2026-10-10 已将项目六个 DCloud 核心依赖统一升级到官方正式版 `3.0.0-5020620260917001`，实际编译器标识为 **5.26**，与 HBuilderX 和手机 SDK 对齐；`@dcloudio/types` 保持该版本要求的 `3.4.31`，Vite 保持 `5.2.8`。升级已更新 `package-lock.json`；旧清单备份在 `.artifacts/compiler-5.24-backup`。无需再次执行不限定版本的 `uvm@latest`。

构建成功后检查 `dist/build/app/uni_modules/lakeside-widget/utssdk/app-android`，应有 `AndroidManifest.xml`、`config.json`、`src/index.kt`、`src/WidgetComponents.kt` 及 `res/layout/ls_widget_large.xml`、`ls_widget_small.xml`、`ls_widget_course.xml`。

`build:app` 只生成资源，不是完整 APK；HBuilderX 发行时仍选中 UCAS 主工程。不要把 `src` 或 `dist/build/app` 单独打开为新的发行工程。

当前 `src/manifest.json` 版本为 `0.1.0` / `1`，可保留做本次集成验证。正式升级发布时，在该源码文件增加版本号，例如 `0.1.1` / `2`，保存后重新构建打包；包名、AppID 和签名沿用原值。

## 3. 移走实际原生壳缓存

本项目真正复用的原生壳在 `dist/cache/apk/__UNI__F1ADC35_cm.apk`。只备份 `dist/release/apk` 不会移走这份壳，先前步骤遗漏了这个实际缓存位置。

2026-10-10 已在工作区内将旧壳移到 `.artifacts/widget-native-cache-backup/old-native-shell-320229b4.apk`，核对移动前后 SHA-256 一致，原路径已不存在。记录在 `.artifacts/widget-release-cache-reset.json`。源码、正式 APK、可用 debug 包和证书均保留。已经完成本次移走操作，不需要再次删除其他文件。

现在停止手机运行会话，关闭并重新打开 HBuilderX，再打开同一个 UCAS 主工程。继续使用正式包 + 快速安心打包。下一次需要生成/获取新的原生壳，而不是仅给旧壳加入前端页面。以新壳和 APK 的原生内容检查为准，不以排队时长判断成功；若原生构建失败，保留完整日志。

插件 `package.json` 同时补齐了官方模板中的 `dcloudext.type="uts"`，这项识别信息已随源码更新，本地 App 资源构建通过。尚未证实缺少该字段就是缓存复用的原因，不把它当作已验证根因。

## 4. 主工程快速安心打包

2026-10-10 本轮默认宽度、3/2 行高度和纵向调整配置已更新。aapt2 确认本地新生成的原生壳缓存仍声明旧 4×4 与双向调整，已将该缓存完整备份至 `.artifacts/widget-native-cache-backup/pre-full-width-*.apk` 并移出活跃路径，记录在 `.artifacts/widget-width-cache-reset.json`。下一次需生成包含新尺寸资源的原生壳；APK 校验新增 `dimen/ls_widget_default_width`，旧壳不能通过该项。

选中 `UCAS_Course_Schedule`，使用“发行 → 原生 App → 云打包”（菜单也可能称 App-Android/iOS 云打包）。确认窗口对应当前主工程。

| 配置 | 本次选择 |
| --- | --- |
| 平台 | Android |
| AppID | `__UNI__F1ADC35` |
| Android 包名 | `ucas.course.schedule` |
| 证书 | 以前使用的同一份云端证书 |
| 包类型 | **打正式包** |
| 打包方式 | **快速安心打包** |
| 自定义调试基座 | 不选 |
| 原生混淆 | 首次验证先不启用，之后开启需重新验证 |
| 广告、渠道 | 保持现有配置，不额外启用 |

“打正式包”和“快速安心打包”是两组独立选项，两项都要选中。点击打包；若提示安装安心打包插件，安装后重新点击。

等待云端原生构建、下载、本地组装和签名流程全部结束，控制台实际报告新 APK 路径。记录本次文件名、生成时间和完整日志。含 UTS 原生配置时仍可能排队，名称中的“快速”不保证无需云端构建。

出现 `Keep`、`androidx.work` 编译错误时停止发行并检查依赖日志。仅“编译成功”不能证明小组件已经进入最终 APK。

## 5. 检查本次新 APK

本项目已有正式产物在 `dist/release/apk/`。以本次控制台返回路径为准，其他工具链可能在 `unpackage/release/apk/`。选择本次新文件，不能使用备份里的旧文件或 `dist/debug/android_debug.apk`。

在主工程 PowerShell 执行，将 `本次新APK文件名.apk` 换成实际文件名：

```powershell
Set-Location C:/Users/FanYulong/Desktop/UCAS_Course_Schedule
./scripts/verify-widget-apk.ps1 `
  -ApkPath "C:/Users/FanYulong/Desktop/UCAS_Course_Schedule/dist/release/apk/本次新APK文件名.apk" `
  -JavaPath E:/Java/jdk-17/bin/java.exe `
  -ApkSignerJar E:/HBuilderX/plugins/app-safe-pack/apksigner.jar
```

实际输出在其他目录时仅修改 `-ApkPath`。检查正式包不要加 `-CustomBase`。成功时最后应显示：

```text
Package identity, signing, widget components, DEX classes and resources passed static inspection.
```

报告位于 `.artifacts/widget-apk-verification.json`，`passed` 必须为 true。检查覆盖包名、原生版本、两款 Provider、Service/Activity、真实 DEX 定义、Worker 父类、布局和明日按钮、内置 App 页面、非调试标志及签名。通过后再安装。

## 6. 覆盖安装与手机验收

结束 HBuilderX 手机运行会话，把通过检查的新 APK 传到手机并覆盖安装，从手机图标直接打开“湖畔课表”。验收期间不要再点击“运行到手机”，以免启动调试基座。

1. 设置 → 桌面小组件：可以添加两款组件；标题右侧提示图标可查看手动添加方法。
2. 点击重新同步，确认真实课表同步成功。
3. 添加宽松版、紧凑版；荣耀进入“桌面卡片 → 经典小工具”。
4. 删除旧实例后重新添加：检查两款组件默认尽量铺满桌面宽度，宽松版默认 3 行、可以纵向拉伸，紧凑版默认 1 行最多两堂，两行最多四堂；继续拉高容量按 2/4/6/8… 递增，高度调整不改变宽度。再检查行高、已结束名称划线、今日/明日切换及点击进入整周课表。
5. 断开电脑、关闭 App 页面、断网后手动刷新，课程仍应正常显示。
6. 观察周期刷新，接受省电延迟，不要求每 15 分钟或上下课准点刷新。

签名不一致时保留手机现有安装和数据，核对原证书后重新打包。

## 7. 失败时定位

| 结果 | 下一步 |
| --- | --- |
| Provider、DEX、布局均缺失 | 保留本次主工程快速安心打包完整日志及静态报告，检查插件发现、编译、云端输入与原生壳组装；停止安装该包。 |
| DEX 存在，Provider 缺失 | 查插件 Manifest 合并。 |
| Provider 存在，DEX/资源缺失 | 查 Kotlin、资源和依赖是否完整进入构建。 |
| `packageMode=false` | 拿到调试基座或错误产物，重新选择正式 APK。 |
| `signature.upgradeCompatible=false` | 核对并沿用原证书。 |
| 静态通过但手机提示未注册 | 核对实际安装版本、更新时间和运行进程，排除旧包或调试基座。 |
| 已注册但添加/显示/点击异常 | 收集操作时 logcat，排查原生运行逻辑。 |

可选 USB 诊断：

```powershell
& E:/HBuilderX/plugins/launcher-tools/tools/adbs/adb.exe shell dumpsys package ucas.course.schedule
& E:/HBuilderX/plugins/launcher-tools/tools/adbs/adb.exe shell cmd package query-receivers --brief -a android.appwidget.action.APPWIDGET_UPDATE -p ucas.course.schedule
```

应查询到 `com.lakeside.widget.LargeWidgetProvider` 与 `com.lakeside.widget.SmallWidgetProvider`。保留主工程 + 快速安心打包路线，依据日志修复明确问题，不把更换目录或传统打包当作已验证修复。

本方案已按用户指定路线更新。主工程类型检查与 `npm run build:app` 已通过；构建产物中已确认插件 Manifest、Kotlin 源码和布局存在，两款 Provider 声明及 54dp 最小行高均为当前版本。尚无本轮新生成且通过检查的正式 APK；源码或调试基座验证不能代替正式包检查和真机验收。

升级至 5.26 后重新通过：类型检查、33 个文件共 321 项回归测试、App/H5 构建（两者日志均显示编译器 5.26）、aapt2 资源链接、手写 Kotlin 编译、5.26 生成的 UTS 桥接与本机 HBuilderX 官方 Android 运行库联合编译，以及 15 项跨语言原生场景。旧原生壳路径仍为空。下一步重启 HBuilderX，继续在主工程使用正式包 + 快速安心打包，检查此次新 APK；无需自行重复升级依赖。

检查命令中的 `APK verification failed` 是产物不合格的主动拒绝，不是用户 PowerShell 命令错误。检查脚本已改为说明缺少原生插件并返回退出码 1，避免显示难以理解的异常堆栈；通过标准未放宽。
