# Android 桌面小组件

当前正式发布路线按用户要求为：在 `C:/Users/FanYulong/Desktop/UCAS_Course_Schedule` 主工程选择 **打正式包 + 快速安心打包**。完整步骤以 [正式包执行方案](android-widget-release.md) 为准。下文临时源码副本、传统打包和 `pack-widget-android.ps1` 属于先前排查记录，不是当前发布要求。

2026-10-10 项目 CLI 编译器核心依赖已统一为官方 5.26 正式版 `3.0.0-5020620260917001`，锁文件和已安装依赖同步更新。此前 5.24 系列记录仅代表历史检查环境。

## 功能

源码位于 `src/uni_modules/lakeside-widget`。湖畔课表保持 uni-app App-Vue 架构，最低 Android API 23。

2026-10-14 名称统一：原“简洁版”改为“紧凑版”，原“详细版”改为“宽松版”。App 样式标题、添加按钮、实例列表、无障碍标签、添加成功提示与 Android 桌面选择列表已同步更名；原有实例和设置继续使用 small/large 类型。下文旧名称保留为历史记录中的对应叫法。

- **今日课表**：默认尽量占满桌面宽度、高度 3 行，只允许纵向调整；列表随高度增减可见课程数量。显示日期、学期、教学周、当天全部连续课程时段，支持上下滚动。正在上课、已结束和冲突课程分别有标识。
- **当前课程**：默认尽量占满桌面宽度，声明高度 1 行，最多两堂；正常两行最多四堂，继续拉高每增加一档高度多两堂，容量按 2/4/6/8… 递增。正在上课的安排优先，再补整学期后续安排；已结束课程不进入简洁版，跨天标明明日或具体日期。两行长标题换行导致固定间距放不下四堂时，恢复弹性布局，先收紧间距而非隐藏第四堂；更高档追加课程保留固定间距并测量完整可用空间。
- 点击外框、详细版课程行、简洁版课程内容或底部数量打开主界面的整周课表，并定位到对应日期所在教学周；不自动打开课程详情。明日切换和刷新按钮执行各自操作，详细版列表的上下滑动只滚动。列表内部空白可能由 `ListView` 消耗触摸，不能仅凭外框的点击绑定保证每个像素都能打开 App。未导入和未确认学期有对应操作。
- 2026-10-10 修正了详细版课程行的触摸拦截风险：根节点保留填充跳转参数，但不再标记为 clickable/focusable，由列表的条目点击监听处理整行跳转。这修复既有点击设计的兼容问题，实际点击效果仍需在桌面验证。[Android 集合点击机制](https://developer.android.com/develop/ui/views/appwidgets/collections)
- 两种组件都有 **明日 / 今日** 按钮，在桌面直接切换。详细版列出明天全部课程；简洁版一行最多两堂、正常两行最多四堂，继续拉高可显示更多明天的安排，无课时明确提示，不跳到后天。各实例独立保存预览状态，周期刷新与进程回收后保持；北京时间跨午夜后，在下一次实际刷新时恢复今天。
- 字号已调整：详细版日期 20→17sp、课程名称 15→13sp；简洁版名称 17→14sp（紧凑布局 14→12sp）。已结束卡片使用浅灰背景和灰色文字，仅课程名称通过 `StrikethroughSpan` 显示删除线，时间、地点和教师不划线。
- 详细版课程卡片最小高度 68→54dp，上下内边距 10→6dp，卡片间距 8→5dp；同时缩短时间行、次要信息和状态标识之间的间距。卡片仍按内容增高，保留长课程名两行显示和系统大字体的空间。
- **设置 → 桌面小组件**提供样式预览、添加按钮和标题行右侧同步图标，同步结果使用底部短提示。每个实例单独保存教师、地点、节次及背景不透明度（60%～100%，步长 5%）；简洁版隐藏节次。简洁版预览位于添加简洁版按钮下方，按一行、两行顺序展示。
- 背景不透明度默认 80%，松开滑块后立即保存当前实例的设置并调用原生刷新，不等待周期任务；教师、地点和节次开关也采用这条链路。更新的是所选实例，其他组件保留各自设置，App 中的预览不随实例设置改变。仅外层底板改变不透明度，文字和课程色块保持可读。2026-10-10 去除了底板额外的固定 0.85 View alpha，避免与动态图片 alpha 重复叠加；100% 对应不透明底板。[Android 图片 alpha 接口](https://developer.android.com/reference/android/widget/ImageView#setImageAlpha(int))
- 未导入时不显示 App 的示例课表，缓存不包含 SEP 登录数据，可离线显示。

添加反馈使用底部浅灰小提示，约 2 秒后自动消失，无外边框，背景不透明度 90%，无页面遮罩、无“知道了”确认，不拦截触摸。添加失败、添加成功和保存失败均采用此反馈；长诊断保留简短标题和查看方法的指引。只有主动点击标题旁提示图标时打开完整手动添加方法，可点击关闭图标或背景关闭。

两款组件课程名旁均改为无文字状态灯：绿色表示当前上课，黄色表示待上课，灰色 `#ECEEF0` 与已结束卡片颜色一致，保留细灰描边便于辨认。“进行中”“已结束”课程状态文字不再可见，简洁版也不再显示“下一节”状态标签；跨天日期和课程冲突信息保留。详细版已结束卡片仍淡灰且仅课程名称划线；简洁版正常筛选仍不返回已结束课程，但渲染器共用三态判断。

课表页顶部与小组件预览共同使用 `src/styles/status-light.scss`，原生状态灯资源由 `node scripts/generate-widget-status.cjs` 从同一份颜色、7px 核心尺寸、6px 光晕和 2.4 秒周期生成。原生绿色灯用 RemoteViews 支持的 ViewFlipper 在桌面可见时播放 20 帧，黄灰灯静态显示；系统动画缩放为 0 时绿色也使用静态灯。动画不需要反复唤起应用刷新。桌面不能执行 Vue/CSS，所以原生使用生成资源还原共用设计参数，并未声称直接运行课表页 CSS。[RemoteViews 支持范围](https://developer.android.com/reference/android/widget/RemoteViews)、[ViewFlipper](https://developer.android.com/reference/android/widget/ViewFlipper)

课程信息使用统一的基础字号与正常字重：详细版 11sp，简洁版 10sp，显式使用相同 sans-serif 字体。课程信息位于同一个原生 TextView，汉字进一步做以下视觉修正。

最新视觉修正：时间数字继续保持原大小，教室/教师信息中的汉字缩为原字号的 94%（简洁版约 9.4sp，详细版约 10.34sp），标点、时间数字和教室编号不缩小；使用 RelativeSizeSpan，保持原布局和系统字体缩放。管理页预览采用相同 94% 比例。课程灯容器下移 1dp（页面预览 1px），补偿汉字视觉中心与行框中心的差异，缩短预览标题行高以减少默认行高的影响；呼吸动画仍作用于内部灯，课程名位置不变。

本次视觉修正通过类型检查、App/H5 构建、aapt2 资源链接、Kotlin/UTS 联合编译及 23 项原生契约回归。320/390/480px 浏览器复核通过，实测汉字字体比例 94% 及灯容器中心下移 1px，预览截图已更新。字号与位置在桌面实际系统字体中的效果仍待完整 APK 验证。

本轮验证通过类型检查、27 项 TypeScript 回归测试、23 项原生契约测试、App/H5 构建、aapt2 和 Kotlin/UTS 联合编译。管理页浏览器在 320/390/480px 验证底部提示位置、无确认按钮、无触摸拦截、自动消失、手动指引入口和三色灯；比较详细版时间/地点字体，并复核简洁版字号与对齐。`status-ui-report.json` 检查原生字号/字体/字重一致及 20 帧 2.4 秒灯结构。实际桌面 ViewFlipper 动画和点击仍待新 APK 验收，周期更新带来的课程状态延迟仍遵循原有省电策略。

两款组件不再声明固定四列的 `targetCellWidth`，共享 `ls_widget_default_width` 尺寸资源，按设备最小屏宽选择默认宽度，并为桌面边距与系统组件留白预留 64dp。使用最小屏宽可避免旋转后过大的宽度声明导致组件不能放入竖屏网格。默认高度通过 `targetCellHeight=3/1` 声明，旧系统默认高度为 180/48dp；简洁版 `minResizeHeight=48dp`，不再声明最大高度；默认尺寸的占格由桌面换算。两款组件均复用 `LakesideWidgetProvider.onAppWidgetOptionsChanged` 刷新，无需新增尺寸广播或重复业务逻辑。

2026-10-13 最新紧凑布局：默认一行高度，顶部信息栏保留日期、星期、教学周、剩余数量、明日切换及可见更新时间，下方课程上下排列，一行布局最多两堂，拉高至两行布局最多四堂（140dp 切换）。每门保留状态灯、跨天标记、名称、起止时间、地点和教师；名称 12sp，课程信息 10sp，跨天标签 8.5sp，汉字继续采用 94% 视觉修正。每门最小内容高度 28dp，间距 2dp；课程区额外右移 6dp，顶部信息栏的位置和字号保持不变。两种尺寸共用课程选择与逐行渲染，一行传入容量 2，两行传入容量 4。第二至第四门及各自间距在没有对应课程时隐藏；空状态仍使用第一门区域。紧凑版取消名称和课程信息的单行省略限制，空间不足时允许换行；长名称或大字体仍需要用户拉高组件。常规字号布局可在 78dp 容纳；较矮的一行自动使用 62dp 或 48dp 的紧凑字号布局，同样保留所有字段。`minHeight/minResizeHeight` 均为 48dp，避免原先 84dp 被桌面换算为两格、无法缩回一格。默认 `targetCellHeight=1`，拉高最多展示四堂；Android 没有通用的“最大两格”声明，API 31 之前也不执行 `maxResizeHeight`，最终占格与缩放边界仍由宿主决定，不能承诺所有桌面都严格限为两格。[Android 尺寸约束](https://developer.android.com/develop/ui/views/appwidgets/layouts)

简洁版状态灯使用原有矢量和 20 帧动画，在单独的约 13.57dp 原生灯布局中缩放显示，灯核心约 5dp；详细版使用约 16.29dp 灯布局，核心约 6dp。矢量绘制参数、颜色和动画周期继续与 App 顶部状态灯共用，App 顶部灯尺寸保持原值。小组件灯在 14dp 标题行中通过根布局 `layout_gravity=center` 居中，父层允许光晕越过容器边界，避免缩小行高时裁掉呼吸灯。2026-10-14 拖动修复后，Android 12 及以上改为提前提交各高度档位的响应式 RemoteViews，宿主精确尺寸用于推导测量宽度与需要覆盖的高度范围；Android 6～11 继续使用横竖屏尺寸上下界和尺寸回调刷新。

同日间距修正：用户确认保持原排版，详细版状态灯继续放在课程名称旁，不放到时间列上方。简洁版灯容器宽度为 5dp，详细版为 6dp，两款组件的灯与后续名称／跨天标签之间保留约 3dp。灯资源在窄容器内居中，父层允许光晕越过边界，避免为容纳光晕留下过大的文字间隙；简洁版圆点与下方时间仍自然左对齐。

最终视觉确认：简洁版灯核心约 5dp、详细版约 6dp，均保留约 3dp 的文字间距。课程前的“明日”标签与名称共处一行、垂直居中，原生标签使用 match_parent 行高、center_vertical 和 includeFontPadding=false；管理页使用 flex 居中并通过实际文本边界复核。最终三张截图位于 `.artifacts/widget-small-layout/`，由当前 XML 与示例课程生成浏览器预览，非 Android 真机截图；详细版截图包括顶部、三门课程及底部，两门已结束课程仅名称划线。

以下 2026-10-12 的一行一堂及三栏方案为历史排版记录，最新行为以上述 2026-10-13 说明为准。

2026-10-12 简洁版按新要求改为两个布局：小于 110dp 显示一堂，110dp 起最多两堂，不再继续增加课程行。默认两堂布局由两个独立课程区域组成，各自点击打开所属日期的完整课表；只有一堂或没有课程时隐藏第二个区域。课程选择复用原学期快照与排序，通过 `WidgetSelector.smallCourses` 统一筛选；业务不依赖 Vue 存活。原中间高度布局已移除。

一行版重新设计为三栏：左侧日期、星期、教学周，中间课程状态、名称和“起止时间 · 教学楼 · 教师”，右侧上排显示“余N堂”和靠右的“明日”，下排仅显示靠右的刷新图标。这些字段不再因缩到一行而隐藏。日期使用 `M/d EEE`；明日模式数量为“共N堂”，旁边的按钮切为“今日”。未确认、待同步、未开学和学期结束分别显示对应状态，不虚构数量。数量为 0 时也显示 0。完整日期、状态文案与更新时间保留在无障碍说明中；课程名过长仍省略，课程信息行过长采用中间省略以保留尾部教师摘要，默认一行高度不增加。

右侧数量缩写和操作重排通过类型检查、App/H5 构建、aapt2 与 Kotlin/UTS 编译及 23 项原生回归。浏览器在 320/390/480px 实测数量与明日同排、明日右边缘对齐、刷新位于下一排，预览截图已更新。两行版底部完整数量文案未改。

后续排版修正：一行版左内边距由 10dp 增至 18dp，右内边距由 6dp 增至 14dp；右侧区域宽 60dp，数量占 32dp，明日占 28dp，上排各自居中，下排刷新在明日同一列居中，图标字号由 14sp 缩为 12sp。没有添加按钮外框，数量和明日仍为 9sp。App/H5 构建、类型检查、aapt2 资源链接通过；浏览器覆盖 320/390/480px，实测日期左留白、明日/刷新列中心一致、信息无横向溢出。新版管理页截图已更新，桌面真实效果需完整 APK 验证。

日期位置再微调：左内边距进一步由 18dp 增至 24dp，日期栏宽同步减少 6dp（原生 64→58dp，管理页 62→56px）。日期和教学周整组右移，分隔条、课程区及右侧操作区位置保持原值，避免因增加留白继续挤压课程内容。

教师默认显示，一行、两行共用 `WidgetText.smallMeta` 拼接课程信息。单教师显示姓名，多教师按原顺序取第一位并加“等”，重复姓名不计多位；支持顿号、中英文逗号、分号、斜杠、换行与中文姓名间空格，保留单个英文姓名的内部空格和外文姓名的间隔点。教师接在教学楼后，用 ` · ` 连接，取消课程名称旁的独立姓名字段。读取旧简洁版设置时开启教师默认展示，其他选项保持原值；此版本保存的设置带 `teacherDefaultVersion=1`，后续用户主动关闭教师开关会被保留。左侧日期与课程信息基础字号为 10sp，教室/教师汉字按前述比例视觉缩小；“明日”和剩余数量统一 9sp。右侧上排余量靠左、明日靠右，下排刷新图标靠右。无障碍说明保留完整多教师名单和地点。

上一轮教师与字号调整验证通过 26 项 TypeScript 回归、20 项原生契约测试、类型检查、App/H5 构建、aapt2 与 Kotlin/UTS 联合编译。教师字段现已合并到课程信息行，APK 校验不再要求旧的独立教师视图 ID。

教师位置与多教师摘要修改通过类型检查、App/H5 构建、aapt2 和 Kotlin/UTS 联合编译及 22 项原生测试。新增测试覆盖单教师、多种分隔符、重复姓名、英文空格、外文间隔点、缺失姓名，以及地点/教师开关下的拼接顺序。浏览器在 320/390/480px 检查“教学楼 · 第一位教师等”、字号与右侧对齐，更新两款管理页预览截图；真机桌面中间省略的最终效果待新 APK 验证。

最大高度属性从 Android 12 起提供，Android 6～11 或忽略该属性的桌面可能仍允许继续拖高；此时内容仍最多两堂。不同桌面将 dp 换算为占格的方式不一致，无法用统一属性严格保证所有桌面都恰好限制在两格。[Android 尺寸与上限说明](https://developer.android.com/develop/ui/views/appwidgets/layouts)

发布 APK 验证改为检查第二个课程区域的 ID，避免误用仍仅支持单堂课程的原生缓存。尚未完成真机桌面的添加、纵向拖动及大字体验收；这些配置属于原生资源，需重新打完整 APK，删除旧简洁版后重新添加以验证默认两行。

本次通过类型检查、26 项 TypeScript 回归测试、App 5.26 构建、aapt2 全资源/Manifest 链接、Kotlin 与生成 UTS 桥接联合编译，以及 19 项原生模型契约测试；其中新增 4 项覆盖一堂/两堂筛选、排除已结束、优先同时上课、跨天与明日限定范围。该验证不等同于桌面真实占格和拖动限制已验收。

一行信息补全后的验证：类型检查、App/H5 正式资源构建、aapt2 全资源链接与 Kotlin/UTS 联合编译、19 项原生契约测试通过。管理页浏览器检查覆盖 320/390/480px，确认单行示意同时包含日期、星期、教学周与剩余数量，无横向溢出。`.artifacts/settings-categories/widget-single-preview.png` 和 `widget-double-preview.png` 为真实管理页样式截图，属于示意预览，不是 Android 桌面真机截图；实际窄桌面、系统字体及剩余数量的渲染仍需在 APK 中验收。

这是尽量铺满宽度的通用适配，不是读取桌面网格列数：Android 没有给第三方组件提供跨桌面的统一列数查询或“占满所有列”声明。不同 Launcher 的网格、留白和字体设置仍影响实际占格，尤其是横屏、超密网格和折叠屏；需用实际桌面验证。[Android 官方尺寸说明](https://developer.android.com/develop/ui/views/appwidgets/layouts)

升级不会自动重排已经放在桌面上的实例。验证新默认宽度和高度时，需要删除旧实例后重新添加。

## Android 通用添加与安装包诊断

两款组件均使用 Android 标准 `AppWidgetProvider + RemoteViews`，不依赖某一品牌的卡片协议。兼容目标为 Android 6.0/API 23 以上、提供 App Widget 能力的桌面；不能保证每家厂商的独立卡片商店/搜索都收录，也不能绕过不支持小组件的桌面或系统策略。

- Android 8.0+ 且桌面支持时请求系统固定组件；其他情况使用桌面的标准小组件列表。
- 添加请求在点击时立即发起，不等待课表同步。成功请求显示提示，失败显示可见弹窗；只有查询到新实例后才显示“已添加”。
- 原生层查询系统已注册的 Provider，区分原生模块缺失、Provider 未注册、系统不支持和桌面不支持一键添加。添加失败时提示原因；标题右侧提示图标提供手动添加方法。
- 荣耀：双指捏合主屏幕 → 桌面卡片 → **经典小工具** → 湖畔课表。[荣耀官方说明](https://www.honor.com/cn/support/content/zh-cn15849809/)
- 小米/Redmi/POCO：添加小部件 → 支持小部件应用/全部 → **安卓小部件**。[小米官方说明](https://dev.mi.com/console/doc/detail?pId=2466)
- 华为支持 Android 小组件的系统：服务卡片页面底部 → **窗口小工具**。[华为官方说明](https://consumer.huawei.com/cn/support/content/zh-cn15978796/)
- 其他桌面：长按空白处或双指捏合 → 小组件/窗口小工具/桌面插件。入口文字因系统版本而异。

2026-10-09 通过已授权 USB 调试检查到：HONOR FNE-AN00，Android 14/API 34，系统具备 `android.software.app_widgets`；手机上 `ucas.course.schedule` 是 0.1.0/versionCode 1，最后更新于 2026-09-30 02:12:41。系统针对该包查询 `APPWIDGET_UPDATE` 返回 `No receivers found`。本地 `dist/release/apk/__UNI__F1ADC35__20261009082010.apk` 的静态检查也确认缺少全部小组件注册、原生类与布局。因此目前的失败有明确的安装包原因，不能归结为荣耀不支持标准小组件。记录见 `.artifacts/widget-device-check.json`。

本轮原生接口版本为 2，APK Manifest 中有 `com.lakeside.widget.API_VERSION=2`。仅更新 JS 页面不会补上 Provider 或升级原生接口；必须重新安装完整 APK。

## 数据、刷新与跳转

`src/domain/widget.ts` 用现有周次、日期、时段与冲突算法生成整学期快照，包含版本、内容修订标识、北京时间、学期及每次课程安排。生成时间不参与修订标识。

`replaceSchedule()`、`persistCurrent()` 成功后立即捕获已保存内容，排队同步；保存失败和演示场景不修改原生缓存。启动/返回前台的补偿读取真实持久化课表，排除未保存的编辑。原生使用私有 `AtomicFile` 保存快照，SharedPreferences 保存实例设置和旧版列表当天渲染快照，写入串行执行，先校验后原子提交。失败保留原有快照，并单独报告同步异常，不改变主课表保存结果。

所有组件共用唯一的 `lakeside-widget-refresh-v1` WorkManager 周期任务，周期 15 分钟，无网络条件，`updatePeriodMillis=0`。保存、配置、添加、尺寸变化和手动刷新立即请求更新；全部删除后取消周期任务。重启、包更新和系统时间变化触发恢复检查。系统省电可能延迟刷新，不保证上下课或午夜准点更新；组件保留最后更新时间，点击即可手动刷新。不使用精确闹钟或常驻前台服务，强行停止后需要重新打开 App 恢复。

API 31+ 使用 `RemoteCollectionItems`，API 23～30 使用 `RemoteViewsService`。旧版列表读取与标题一致的日期、课程、选项和时钟，避免异步绑定或进程重启时另采样一个日期。

UTS 提供 `syncSnapshot`、`getWidgetState`、`updateWidgetOptions`、`refreshWidgets`、`requestPinWidget`、`consumePendingAction`；复杂数据通过 JSON 字符串传输，写入以回调报告结果。JS 端处理超时、错误和事件去重，H5 不加载原生入口，其他原生平台有无功能兜底。

组件使用显式 Activity PendingIntent 打开 `WidgetEntryActivity`，保存一次动作后启动宿主入口。课程点击现在携带 `calendar` 目标及展示日期，App 打开整周课表、选中该日期并定位教学周；旧基座发出的 `course` 动作也按相同方式处理。首页就绪后消费动作，导入和未保存课程编辑期间暂存。列表模板使用 mutable，普通按钮使用 immutable；URI 区分实例和动作，Manifest 组件不对其他应用导出。今天/明天切换使用显式 Provider 广播，仅修改对应实例的日期预览并本地重绘，不启动 App。Android 包名始终从宿主 `context.packageName` 读取，不使用 DCloud AppID。

## 构建与安装

### `Keep` / `androidx.work` 找不到时

2026-10-09 用户日志中的第一条“存在三方依赖或资源引用，请配置运行环境”是关键错误。随后 `Keep`、`androidx.work` 缺失是依赖未解析的结果。插件现在直接声明 `androidx.annotation:annotation:1.9.1` 与 `androidx.work:work-runtime:2.11.2`，不能靠删除注解或只更新 JS 来解决。

已提供可重复执行的本地环境准备脚本（下载官方 Gradle / Android SDK，校验官方摘要）：

```powershell
./scripts/setup-widget-android-environment.ps1 -JavaHome E:/Java/jdk-17 -ConfigureHBuilderX
./scripts/verify-widget-gradle.ps1 -JavaHome E:/Java/jdk-17
```

不传 `-ConfigureHBuilderX` 时只准备工具与配置清单；传入时备份 HBuilderX 用户设置，仅更新下面三个字段。当前机器已完成配置：

| 设置 → 运行配置 | 本机路径 |
| --- | --- |
| Gradle 可执行脚本 | `C:/Users/FanYulong/Desktop/UCAS_Course_Schedule/.artifacts/android-environment/gradle-8.7/bin/gradle.bat` |
| Gradle JDK 根目录 | `E:/Java/jdk-17` |
| Android SDK 根目录 | `C:/Users/FanYulong/Desktop/UCAS_Course_Schedule/.artifacts/android-environment/sdk` |

SDK 包含 API 34、35 和 Build Tools 35.0.0。Gradle 检查复现 HBuilderX 扩展的 AGP 8.2.2 依赖解析流程；这不是最终 APK 构建配置（WorkManager 2.11.2 的最终构建仍要求兼容的较新 Android 构建工具链）。脚本把本地 IPC 临时目录放在项目内，避免本机终端虚拟临时路径导致 Java `Unable to establish loopback connection`。

本次实测 Gradle 返回 `BUILD SUCCESSFUL`，成功解析 30 个运行时依赖，包含 `annotation-jvm`、`work-runtime-2.11.2.aar` 及完整传递依赖。依赖已进入本机标准 Gradle 缓存，HBuilderX 可以复用；清单位于 `.artifacts/android-environment/dependency-check/resolved-dependencies.txt`。此前手动给 Kotlin 编译器提供 JAR 的检查不能替代这项验证。

**配置环境与制作基座是两件事。** 本地 Gradle 可以解决编译时缺库，但两个 Provider、Service、Activity、WorkManager 初始化组件及 XML 资源必须进入 APK。现有标准基座不会因为同步页面而注册这些内容。必须制作包含本插件的自定义基座并选择它运行，或重新生成完整 APK 覆盖安装。[DCloud 运行环境说明](https://uniapp.dcloud.net.cn/tutorial/run/uts-development-android.html)

当前运行的是 `E:/HBuilderX` 5.07；工程已准备 5.24 工具目录。保存未保存的编辑后，退出旧版并使用下述兼容版本打开生成工程。打包脚本检测 CLI 与运行中 HBuilderX 不匹配时会报错，不再继续寻找旧 APK。

### 完整原生构建

用户 15:10 的日志已经显示依赖更新完成、编译成功，同时明确警告“标准基座不能生效”。当前 `.hbuilderx/launch.json` 的 Android 配置为 `playground: "standard"`，手机的 `io.dcloud.HBuilder` 和 `ucas.course.schedule` 都查询不到 Provider。最新 `__UNI__F1ADC35__20261009121523.apk` 的静态检查也缺少全部小组件原生注册和布局。重复运行到标准基座不会解决这项缺失。

**调试需要先制作并选用自定义基座：**

1. 使用兼容的 HBuilderX 5.24 打开独立生成工程 `C:/Users/FanYulong/AppData/Local/Temp/LakesideWidgetBuild-__UNI__F1ADC35`。
2. 选择 **发行 → 原生 App-云打包 → Android → 制作自定义调试基座**，使用既有包名和证书，并选择 **传统打包**。自定义调试基座不支持安心打包；切换后包名栏若隐藏，保持界面默认值，生成后检查实际包名。制作前确认该工程根目录存在 `uni_modules/lakeside-widget`。
3. 构建成功后，生成工程的 `unpackage/debug/android_debug.apk` 必须通过原生检查，再把它配置给维护中的 CLI 工程。可以在维护工程根目录运行：

```powershell
./scripts/use-widget-custom-base.ps1 -ApkPath C:/Users/FanYulong/AppData/Local/Temp/LakesideWidgetBuild-__UNI__F1ADC35/unpackage/debug/android_debug.apk
```

脚本检查组件、资源、签名和调试基座标志后，复制到 CLI 项目的 `dist/debug/android_debug.apk`，备份并修改 `.hbuilderx/launch.json` 为 `playground: "custom"` / `customPlaygroundType: "local"`。无合格 APK 时不会切换配置。云打包脚本的 `-CustomBase -Submit` 模式在产物验证后自动执行这个步骤。

4. 停止旧运行会话，再选择 **运行 → 运行到手机或模拟器 → 自定义基座 → 本地基座**。成功日志应出现“安装/启动自定义基座”，而非“启动 HBuilder 调试基座”。
5. 返回小组件设置检查两种 Provider 已注册，再验证桌面添加和课程点击。正式发布时另做完整 APK；自定义基座用于 HBuilderX 调试。[DCloud 自定义基座说明](https://uniapp.dcloud.net.cn/tutorial/run/run-app.html#使用自定义基座运行)

1. 使用与项目 5.24 系列编译器兼容的 HBuilderX，安装 Android UTS 扩展。执行 `npm run prepare:widget-android`，导入生成的独立 HBuilderX 工程；以参数清单中的 `project` 路径为准，避免误选原 CLI 工程或旧资源目录。
2. 执行 `npm ci`、`npm run build:app`。产物是 `dist/build/app`，其中包含插件 Kotlin、UTS 生成的 `index.kt`、Manifest、res 和 config.json；它不是 APK。
3. 新增 Manifest、原生资源和依赖必须重新制作 **Android 自定义基座**，选择该基座调试；标准基座或仅热更新旧 APK 无法注册 Provider。
4. 使用现有 Android 包名和签名，通过 HBuilderX「发行 → 原生 App-云打包」生成 APK，安装后打开一次并同步真实课表，再通过设置或长按桌面添加组件。签名凭据不放入源码或文档。

WorkManager 固定 `2.11.2`；实测 AAR 要求 **compileSdk ≥35、Android Gradle Plugin ≥8.6**，应用 minSdk 保持 23。WorkManager 2.12.0 会提高最低 Android 版本至 API 24，不能直接升级。

`npm run prepare:android-release`（或 `prepare:widget-android`）每次将完整正式源码复制到新的系统临时目录 `LakesideWidgetRelease-时间戳-随机标识`，确保原生 `uni_modules` 位于独立工程根目录。这样可避免 HBuilderX 将嵌套的副本识别为已打开的父级 CLI 工程。准备过程逐文件验证全部应用源码与 `src/` 一致，并记录 SHA-256，不使用 debug APK 或前端产物替代源码。只修改本工程的 `src/`，改动后重新生成。`npm run prepare:widget-hbuilderx` 仍可导出工程内副本供查看，但正式打包优先使用独立副本。

构建副本同时复制根目录 `unpackage/res/icons`，因为这些图标并不在 `src/` 内。Android 包名已从上一个正式 APK 核实为 `ucas.course.schedule`。新包必须沿用原签名，才能覆盖安装并保留用户数据。

### 可复现的打包准备

工程目录已下载独立的 HBuilderX **5.24.2026081301**，位置为 `.artifacts/hbuilderx-toolchain/5.24/HBuilderX`，并准备对应 UTS `5.24.2026081216.3203`、App 云打包 `2.0.0.2026030912`、Vue/Vite `5.24.2026081216.3200`、Launcher `5.24.2026081015.1930` 和 Android 运行扩展 `1.0.3-2026081019.2736`。不替换 `E:/HBuilderX` 中原有工具。新电脑需自行安装这些版本，脚本允许指定 `-HBuilderXPath`。Android 运行扩展在 npm 镜像中缺少这一版本，本次从 HBuilderX 官方更新配置指向的 ZIP 地址下载补齐。

```powershell
# 仅生成本地工程与参数清单，不调用云端
npm run prepare:widget-android
# 或指定 HBuilderX 路径
./scripts/pack-widget-android.ps1 -HBuilderXPath E:/HBuilderX

# 账号登录有效且已同意将原生代码/构建输入提交到 DCloud 后，才能执行：
./scripts/pack-widget-android.ps1 -JavaPath E:/Java/jdk-17/bin/java.exe -Submit
# 自定义调试基座：
./scripts/pack-widget-android.ps1 -JavaPath E:/Java/jdk-17/bin/java.exe -CustomBase -Submit
```

参数清单在 `.artifacts/widget-cloud-pack-plan.json`。选择 Android、沿用云端证书、不启用打包广告。2026-10-09 调整为：正式包和自定义基座均默认传统云打包，正式包参数为 `--iscustom false --safemode false`，自定义基座为 `--iscustom true --safemode false`；每次准备一个全新、独立的临时源码目录，不复用原工程的打包缓存。默认优先使用本机符合版本要求的 `E:/HBuilderX`，否则使用配套 5.24 工具。不记录账号密码、证书密码或私钥。这是针对本项目正式包遗漏原生插件的排查方案，不代表安心打包普遍不支持 UTS。完整操作步骤见 [正式包执行方案](android-widget-release.md)。

`-Submit` 会将打包所需内容发送至 DCloud，不是离线构建。命令报“此功能需要先登录”时，应在所用 HBuilderX 内重新登录；仅能查询到缓存用户名不代表打包登录有效。CLI 退出码可能为 0 而打包未成功。脚本会查找此次新生成的 APK，并强制执行下面的原生内容/签名检查；没有新 APK 或检查失败均以错误结束。[自定义基座不支持安心打包](https://uniapp.dcloud.net.cn/tutorial/build/SafePack.html)

### APK 静态检查

```powershell
./scripts/verify-widget-apk.ps1 -ApkPath <新APK路径> -JavaPath E:/Java/jdk-17/bin/java.exe
# 可通过 -ApkSignerJar 指定其他 Android SDK 中的 apksigner.jar
```

该脚本检查宿主包名、minSdk、原生接口版本 2、两个 Provider、Activity、RemoteViews Service、Worker/桥接的真实 DEX 类定义、布局/元数据、App 资源和有效签名；通过 `dcloud_control.xml` 检查正式包/自定义基座标志，拒绝把改名后的 debug 包当作正式包。签名指纹默认与已有正式 APK 比较，以检测无法覆盖升级的问题。AndroidX 内部类允许发布混淆。结果保存在 `.artifacts/widget-apk-verification.json`，不替代真机验收。用旧 APK 运行时应失败：旧包不含这些组件。

Android 8.0+ 且 Launcher 支持时可请求固定组件；返回成功只表示系统接受请求，需要用户确认，返回 App 后查询实例。其他系统使用“长按桌面 → 小组件 → 湖畔课表”。

## 自动验证

```sh
npm run typecheck
npm test
npm run build:h5
npm run build:app
npm run verify:widget-ui
```

原生验证需要 Windows、JDK 17 和下载依赖的网络：

```powershell
./scripts/verify-widget-native.ps1 -JavaPath E:/Java/jdk-17/bin/java.exe
# PATH 配置好 Java 后也可：npm run verify:widget-native
# 已有 SDK 可传 -AndroidJar <SDK/platforms/android-35/android.jar>
```

脚本把官方 Android API 35、aapt2、Kotlin 编译器和依赖下载至 `.artifacts/widget-native/tools`；编译全部手写 Kotlin、用 aapt2 编译并链接原始插件 XML/Manifest，使用实际 TypeScript 快照运行 JVM 跨语言业务测试。Manifest 必须声明插件包名 `uts.sdk.modules.lakesideWidget`，这是 HBuilderX 本地资源链接的要求，不改变宿主 Android 包名。

若找到配套 HBuilderX Android 运行扩展，脚本还使用其 Kotlin 编译器、API 36 和官方 UTS 库，结合 aapt2 生成的真实 R 类，一起编译 `npm run build:app` 生成的 `index.kt` 与全部原生 Kotlin。可通过 `-HBuilderXPath` 指定工具目录。未找到运行扩展时明确报告跳过该项。JAR 与 `widget-resources.ap_` 是验证产物，不是 APK；桥接编译通过不等于 JS 原生调用和厂商桌面已实测。

前端测试覆盖周次、非连续节次、冲突、保存失败、快照副本、重试、重复点击与过期参数。原生测试覆盖开始/结束边界、列表保留、跨天、学期前后、北京时间、缓存校验、实例设置和旧版渲染快照。浏览器专项检查覆盖 320/390/480px、两个预览、平台提示、按钮尺寸和页面返回；截图及报告在 `.artifacts/settings-categories`。

## 真机验收

- API 23、26、31、较新 Android；原生 Launcher 和至少一款国产系统桌面。
- 同时添加大小组件、多个同款，独立设置、删除部分/全部、桌面备份恢复。
- 0、1、3、超过一屏课程；长名称、空教师/地点、冲突、大字体、调整尺寸。
- 当前课、下一节、明日、学期首课/结束、未导入、未确认学期。
- 冷启动、热启动、连续点击、删除课程、重新导入 ID 复用、导入/编辑中点击后暂存。
- 断网、普通进程回收、重启解锁、跨午夜、修改时间、省电、强行停止后恢复。
- 保存同步、失败重试、旧 APK 升级、发布混淆与 Provider/Service/Worker/Activity 是否齐全。

此前完成 H5 构建与 320/390/480px 浏览器专项检查（含添加失败即时弹窗和手动指引）。本轮修改字体、已结束样式、点击目标和明日预览后通过：类型检查、33 个测试文件共 321 项测试、App 资源构建、UTS 生成、全部手写 Kotlin 编译、UTS 桥接与原生代码的官方运行库联合编译、aapt2 资源链接和 15 项 JVM 原生场景。新增覆盖明日跨周、明日无课、开学/结束边界、预览跨午夜重置和旧版列表预览帧。

本轮新增原生 XML 按钮和样式，需重新制作自定义基座并选择它运行；正式使用也需重新生成完整 APK。当前已验证源码/资源编译和业务逻辑，新桌面字号、删除线、按钮触控和跳转仍待安装本轮新包后验收。

现有 `dist/debug/android_debug.apk` 已核实包含两款 Provider；本轮改动后的新按钮不在这份旧基座中。再次检查最新正式包 `__UNI__F1ADC35__20261009234346.apk`，Manifest 注册、DEX 原生类和组件资源均缺失，不能把它作为支持小组件的新正式包交付。后续打包产物必须通过 `verify-widget-apk.ps1`；检查已增加明日按钮资源，避免误接受本轮修改前的基座。完整从源码准备到安装的步骤以 [正式包执行方案](android-widget-release.md) 为准；当前新目录只完成本地准备，未提交云打包。

2026-10-09 后续检查：已核实旧 APK 包名及签名，修复构建副本缺失图标、UTS Manifest 缺少 package 属性的问题，准备 HBuilderX 5.24 和配套扩展，并完成本地打包参数清单。APK 静态检查脚本成功识别旧包缺少小组件的情况。HBuilderX 本地资源发布两次返回“此功能需要先登录”；本地运行编译还要求配置 Android 依赖解析环境或重新制作云端自定义基座，现有标准基座缺少 WorkManager。独立脚本已使用真实 WorkManager 和官方 UTS 运行库完成联合编译。

自动审批拒绝云打包命令，要求用户明确允许将项目构建内容发送到 DCloud。该提交命令未执行，尚未生成包含本插件的最终签名 APK。

已连接荣耀手机并完成安装包与系统能力诊断；尚未在手机上安装含本插件的新 APK。桌面样式、UTS 运行时跳转、后台调度与厂商兼容性仍需重新打包安装后验收。独立验证与 HBuilderX 工具下载仅保存在工程构建目录，没有替换本机 HBuilderX 安装。

官方参考：[集合组件](https://developer.android.com/develop/ui/views/appwidgets/collections)、[尺寸适配](https://developer.android.com/develop/ui/views/appwidgets/layouts)、[刷新机制](https://developer.android.com/develop/ui/views/appwidgets/advanced)、[UTS 原生混编](https://github.com/dcloudio/uni-app/blob/uni-app-x/docs/plugin/uts-plugin-hybrid.md)。

2026-10-13 设置页恢复详细版示例，放在“添加详细版”按钮下方，简洁版两个示例仍位于“添加简洁版”下方；实例开关和不透明度设置保留。标题旁 18px 说明图标改为垂直居中，44px 点击区域不变；添加反馈停留 1600ms 后淡出，保留 90% 不透明度背景且无边框。

本轮验证：类型检查、App/H5 构建、27 项小组件 TypeScript 测试、25 项原生课程与跨语言契约测试通过；实际 aapt2 资源链接与 Kotlin/UTS 联合编译通过。设置页在 320/390/480px 浏览器验证通过；48dp 与 62dp XML 衍生预览覆盖 250/320/390px 宽度，参考课程字段、灯与跨天标签无越界。浏览器预览不等于真机桌面验证，本轮未生成或安装 APK。新尺寸元数据需完整原生打包，覆盖安装后删除旧组件并重新添加，排除桌面缓存旧尺寸。

2026-10-13 两行简洁版留白调整：外层顶部内边距 6dp、底部 4dp，顶部信息略下移；四个课程行最小高度 27dp，三个间隔使用 layout_weight=1，自动将额外高度分配至课程之间。课程区最小高度 114dp，整体仍能在 140dp 容纳四堂参考课程；不再把四堂紧密挤在中央。140/180/220dp XML 衍生预览的课程间距约为 2/15.3/28.7px，首堂紧跟顶部、末堂距底部约 4px；长课程保留换行。App 两行示意同步采用均匀间距，所有一行布局资源、字号与信息保持原值。

两行留白调整验证：类型检查、App/H5 构建、原生 aapt2 链接与 Kotlin/UTS 联合编译、25 项原生课程测试通过；设置页 320/390/480px 检查通过。两行预览在 140/180/220dp 验证间距均匀随高度增长，参考字段在 250/320/390px 宽度保留；一行布局复核间距仍为 2dp。截图 `.artifacts/widget-small-layout/small-two-row-four-courses-preview.png` 为实际 XML 衍生的浏览器示意，不是真机截图。本轮未生成新版 APK，需沿用主工程快速安心正式打包路线安装验证。

2026-10-13 两行留白再次调整：保留顶部 6dp、底部 4dp；四个课程行各分配权重 1，三个课程间隔各分配权重 2，每门名称与时间之间新增 1dp 的弹性间隔。额外高度同时进入课程内部与课程之间，课程间距约为行内间距的两倍，避免前版只把空白分到课程之间。180dp 参考高度中，名称到时间间隔约 5.1dp、课程间隔约 10.2dp（原课程间隔约 15.3dp）；140/220dp 也检查该层级关系。App 两行样例同步采用同样比例，一行资源和间距保持原值。APK 静态检查新增 ls_small_line_gap ID，避免旧原生壳误通过。截图仍为 XML 衍生浏览器预览，非真机截图。

2026-10-13 两行课程间距小幅收紧：课程间隔权重从 2 降到 1.5，基础间隔仍为 2dp，行内继续保留弹性留白。180dp 参考高度中，课程间隔由约 10.2dp 降至 9.25dp，行内约 5.84dp；课程间隔仍大于行内间隔。App 两行示意同步修改，一行资源与字号保持原值。

2026-10-13 两行卡片上下边缘留白微调：课程区首尾各加入权重 0.5、基础高度 0dp 的弹性留白，课程行和课程间隔继续保留 1/1.5 权重。180dp 参考高度首堂向下约 2.16dp、末堂底部增加约 2.17dp 留白，课程间隔约 8.5dp、行内约 5.33dp；最小 140dp 时不强行增加边缘高度，仍能容纳四堂。App 两行样例同步添加首尾弹性留白；一行与详细版资源保持原值。APK 验证新增首尾留白资源 ID，避免复用旧原生壳。

2026-10-13 课程间距极小幅收紧：两行课程间隔权重 1.5 → 1.4；首尾留白和行内间隔权重保持原值。180dp 参考高度间距约 8.50dp → 8.27dp（缩小约 3%），课程间距仍大于行内约 5.47dp；字体、字段、一行与详细版资源保持原值。App 两行样例同步。

2026-10-13 课程间距再次微调：两行课程间隔权重 1.4 → 1.3，180dp 参考高度间距约 8.27dp → 8.00dp（再收紧约 3%）；仍大于行内约 5.63dp。首尾留白和行内间隔权重保留，字体与一行布局保持原值，App 两行样例同步。140/180/220dp XML 衍生预览检查通过。

2026-10-13 课程间距继续微调：两行课程间隔权重 1.3 → 1.2，180dp 参考高度间距约 8.00dp → 7.75dp（再收紧约 3%），仍大于行内约 5.78dp。首尾留白和行内间隔权重保留，App 两行样例同步；一行与详细版保持原值。140/180/220dp XML 衍生预览检查通过。

2026-10-13 两行间距和首尾留白联合微调：课程间隔权重 1.2 → 1.1，首尾各 0.5 → 0.65，总弹性权重保持 8.6。180dp 参考高度课程间隔约 7.75dp → 7.25dp，首堂向下、末堂向上各约 0.72dp，名称与时间行内间隔仍约 5.78dp；课程间隔仍大于行内间隔。140dp 最小尺寸继续完整容纳参考四堂，App 两行样例同步。一行与详细版保持原值；XML 衍生预览覆盖 140/180/220dp。

2026-10-13 首尾留白继续微调：两行首尾弹性权重各 0.65 → 0.75，课程间隔权重维持 1.1。180dp 参考高度首堂距顶部约 25.11dp → 25.52dp，末堂距底部约 7.11dp → 7.50dp，课程间隔仍大于行内间隔。App 两行样例同步；一行与详细版资源保持原值。140/180/220dp XML 衍生预览检查通过。

2026-10-14 简洁版一行底部留白微调：48/62/78dp 三个一行适配布局的课程区加入基础高度 0dp 的首尾弹性空白，上方权重 1、下方 2，将少量可用空间移到末堂下方。84dp 常规预览末堂距底部约 5.64dp → 6.64dp，课程组上移约 1dp；两门之间仍为 2dp，文字、状态灯和字段保留。最小 48dp 不强行增加固定边距，仍可完整容纳参考两堂。一行 App 样例同步；两行和详细版原生布局保持原值。APK 验证增加 ls_small_one_bottom_gap ID。

2026-10-14 简洁版内部间距封顶：默认尺寸仍可拖动，原 Provider 最大高度声明保留；课程间距在当前两行设计高度 180dp 封顶。Android 12+ 响应式 RemoteViews 新增 180dp 分界，旧版 Android 根据宿主报告的当前方向高度选择 ls_widget_small_capped。封顶布局冻结课程行最小高度、课程间隔、行内间隔和首尾留白，文字仍按内容换行，背景继续覆盖完整桌面组件；再拉高只增加下方外部空白，不扩大内部间距。它限制的是展示间距，并不能修改桌面已经分配的行数。

封顶布局由 scripts/generate-widget-small-cap.cjs 根据现有 ls_widget_small.xml 的字号、尺寸和权重生成，180dp 阈值同时生成在 widget_spacing.xml 中，Kotlin 从该资源读取；以后改常规两行样式需重新运行 npm run build:app，预构建 scripts/generate-widget-assets.cjs 会生成最新灯资源和封顶布局，避免两份样式脱节。App 两行示意的课程区最大高度同步为 154px。APK 验证增加封顶布局、阈值尺寸及内容容器 ID，旧壳不能通过。

Vite App 配置同时调用封顶样式生成器，覆盖 HBuilderX 直接调用编译器、跳过 npm prebuild 的发行入口；生成器仅在内容变化时写文件，避免无变化构建反复更新资源时间戳。

本轮验证：类型检查、App/H5 构建、原生 aapt2 链接与 Kotlin/UTS 联合编译、25 项原生课程回归通过；设置页 320/390/480px 检查含拉高到 260/400px 的间距上限。XML 衍生预览覆盖 140/160/180/220/320/480dp；180/220/320/480dp 的课程间距均为 7px，行内间隔约 5.53px，课程位置一致，250/320/390px 宽度字段完整。截图为浏览器近似预览，非真机；本轮未打包或安装新版 APK。

2026-10-14 简洁版拉高追加课程：按最新需求取消原先的 maxResizeHeight 声明，保留默认一行、纵向调整。新增 ls_widget_small_extra_row 固定间距模板，从现有两行封顶布局自动生成；后续课程作为独立嵌套 RemoteViews 依次加入 ls_small_more_courses，缩小时先清除旧的追加行。每门的日期、名称、时间、教室、教师、颜色、状态灯和点击目标使用原有渲染逻辑，追加行使用独立局部视图 ID，点击定位到该门课程所在日期。

容量计算先根据高度确定候选数量，再用 Android TextPaint/StaticLayout 测量实际名称、跨天标签、时间和教室教师信息，考虑字体缩放、换行与汉字 94% 视觉修正；只追加能完整放下的课程。候选筛选去除原先硬编码的四堂上限，继续保持当前课程优先、未来安排稳定排序和去重；明日模式仅使用明日安排。正常两行仍最多四堂，180dp 以上固定行内及课程间距，额外空间显示第五、第六堂等；没有后续课程时保留空白。

Android 12+ 优先采用 OPTION_APPWIDGET_SIZES 精确尺寸列表（单组至多 16 个布局）；列表缺失或类型不符则回退到横竖屏尺寸范围。候选容量对极端尺寸保留 64 堂的内存保护界限，普通手机和平板的可视课程数量按实际空间决定。额外课程模板与测量用尺寸、字号都由生成器从两行 XML 推导，APK 检查增加模板和容器资源。

追加课程验证：类型检查、App/H5 构建、Android 资源链接和 Kotlin/UTS 联合编译通过；原生场景扩展到 30 项，新增超过四堂的顺序和去重、明日不跨天、容量边界及缩小、完整行适配、长名称/大字体适配。设置页 320/390/480px 检查通过；实际 XML 衍生浏览器预览在 180/220/320/480dp 分别显示 4/5/7/11 堂，课程间隔均为 7px，行内约 5.53px；250/320/390px 宽度检查字段不越界，缩回 180dp 后仅保留四堂。截图 `.artifacts/widget-small-layout/small-tall-capped-preview.png` 为扩展到七堂的示例，非真机截图。未生成新版 APK，需在主工程打完整正式包并覆盖安装。

2026-10-14 修复简洁版两行只显示三堂：原完整行测量把固定的两行设计间距当成不能压缩的空间，跨日期标签与长课程名换行后会删除第四堂。基础容量现在固定为一行两堂、两行四堂（课程不足时按实际数量），固定间距放不下基础四堂时复用 ls_widget_small 弹性四行布局。额外课程仍测量完整可用高度，按两堂为一组追加，避免第五、第七堂这种单个扩展档。

根据本轮用户更正，容量改为按高度档位 2/4/6/8… 递增，不再按每门约 38.545dp 的高度逐门增加。沿用既有一行/两行分界 140dp，180dp 作为两行参考高度，再增加每 90dp 为一个扩展档；这是由宿主可用 dp 高度推算的显示档位，不能据此保证所有桌面物理网格行数相同。普通字号空间不足时先压缩两行间距，额外档位在长名称或大字体下仍避免裁切追加课程；可用课程不足则显示实际数量。

验证：App 构建、Android 资源链接、Kotlin 与生成的 UTS 入口联合编译、32 项原生测试通过。新增长标题固定间距只能容纳三堂但基础容量仍保留四堂、课程不足与成对追加、270/360dp 档位边界和缩小回退场景。XML 衍生浏览器检查在 250px 宽的两门长名称换行场景仍展示完整四堂；参考 180/220/320/480dp 分别为 4/4/6/10 堂，课程间距保持 7px。预览为浏览器近似，不是真机；未生成新版 APK，需要主工程完整正式包覆盖安装。

2026-10-14 更名验证：App/H5 构建、Android aapt2 资源编译通过；设置页 320/390/480px 检查通过，并生成最新宽松版、紧凑版一行/两行/扩展六堂的 XML 衍生浏览器预览。源码与校验脚本的无障碍标题同步更新；UI 检查使用新构建的 H5，避免旧产物造成标签误报。未提交新 APK 打包，也未进行真机截图，原生选择列表名称需完整 APK 覆盖安装后生效。

2026-10-14 尝试修复拖动过程中布局滞后（待真机验收）：修改前完整源码与配置保存在 .backup/widget-resize-before-20261014-180343，共 321 个文件及 SHA256 清单。该备份包含已经确认的紧凑版/宽松版名称，restore.ps1 只恢复本次八个改动文件；-WhatIf 已校验所有备份哈希及目标路径，不执行复制。此轮未执行恢复。

Android 12+ 不再仅为当前收到的精确尺寸生成一两套布局，而是预先提交高度范围：48/62/78dp 两堂，140dp 四堂弹性布局，180dp 四堂固定间距，以及 270/360/450dp 等六/八/十堂档位，覆盖屏幕高度及当前宿主报告范围。最多 16 个 RemoteViews；极大尺寸保留当前容量对应档位。组件仅允许纵向缩放，因此使用最窄有效宿主宽度测量，宽屏文字正常重排，避免不同宽度的候选互相干扰高度选择。长标题的四堂弹性兜底内容在 180dp 以上固定高度，背景仍铺满，避免预提交后再次拉大内部间距。所有候选共享此次渲染的时间、日期、课程快照和实例选项。新资源 ls_small_adaptive_content 纳入 APK 验证。

尺寸回调改为仅刷新当前组件，使用回调 Bundle 的副本；每实例请求令牌合并过时任务，开始渲染前及提交前检查，删除实例同时取消待处理请求。每次实际回调输出 LakesideWidget 标签的 Resize received 日志，方便后续判断厂商桌面是否在松手前通知应用。普通保存、定期刷新、明日切换流程仍共用原有缓存和业务。

验证：App 构建、aapt2 资源链接、Kotlin/UTS 联合编译及 36 项原生回归通过。新增同一份预提交计划双向切换 2/4/6/8 堂、缺少尺寸字段、16 帧限制、大尺寸容量、过期请求丢弃、实例隔离和删除取消场景。未提交付费打包，未安装 APK，也未验证真实桌面的拖动动画；不把数学回归或静态预览当作实时拖动验证。需要在主工程打完整正式 APK（快速安心打包）覆盖安装，分别拉大和缩小并停住不松手，核对数量与重叠；若用户确认失败，使用上述备份恢复本轮源码，再构建安装恢复版 APK。

此方案依据 Android 官方响应式布局机制（https://developer.android.com/develop/ui/views/appwidgets/layouts#provide-responsive-layouts）与 AOSP AppWidgetHostView.onLayout 的尺寸选择机制。对于拖动期间显示冻结快照或不执行实时布局的厂商桌面，仍可能只能松手后刷新，需以实际验收判断。
