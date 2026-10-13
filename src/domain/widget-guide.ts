import type { WidgetPinResult, WidgetState } from './widget'

export interface WidgetNoticePayload {
  title: string
  message: string
  tone: 'success' | 'info' | 'warning'
  presentation?: 'toast' | 'guide'
}

export function widgetToastText(notice: WidgetNoticePayload): string {
  const first = notice.message.split(/[。！\n]/)[0].trim()
  return first.length <= 52 ? (first || notice.title) : notice.title + '，请点击标题旁的提示查看添加方法'
}

export function widgetAvailabilityMessage(state: WidgetState): string {
  if (!state.supported && ['io.dcloud.HBuilder', 'io.dcloud.uniappx'].includes(state.packageName || '')
      && ['native_missing', 'providers_missing'].includes(state.availability || '')) {
    return '当前正在使用 HBuilder 标准调试基座，小组件原生配置不会生效。请制作包含 lakeside-widget 的自定义调试基座，然后在运行到手机时选择“自定义基座 → 本地基座”。仅同步程序文件无法注册桌面小组件。'
  }
  switch (state.availability) {
    case 'native_missing': return '当前安装包未包含本版本所需的桌面小组件。请安装完整新版 APK；仅更新页面无法添加。'
    case 'providers_missing': return '当前安装包的小组件未被 Android 系统注册，因此桌面无法找到。请安装完整新版 APK。'
    case 'system_unsupported': return '当前系统未提供 Android 桌面小组件能力。'
    case 'bridge_error': return '暂时无法读取小组件状态，请重新打开应用后再试。'
  }
  if (!state.supported) return '桌面小组件需要安装安卓版湖畔课表。下方为样式示意。'
  return state.pinSupported ? '可通过系统添加或手动添加。' : '当前桌面不支持一键添加，请点击标题右侧的提示图标查看手动添加方法。'
}

export function widgetManualInstructions(brand = ''): string {
  const normalized = brand.toLowerCase()
  if (/honor|荣耀/.test(normalized)) {
    return '在主屏幕双指捏合 → 桌面卡片 → 湖畔课表 → 选择今日课表或当前课程。'
  }
  if (/xiaomi|redmi|poco|小米|红米/.test(normalized)) {
    return '双指捏合或长按桌面空白处 → 添加小部件 → 支持小部件应用／全部 → 安卓小部件 → 湖畔课表。\n\n不同系统版本入口名称可能不同；请进入“安卓小部件”列表查找。'
  }
  if (/huawei|华为/.test(normalized)) {
    return '双指捏合桌面 → 服务卡片 → 滑到页面底部 → 窗口小工具 → 湖畔课表。\n\n支持 Android 小组件的系统使用“窗口小工具”入口；它与厂商服务卡片列表不同。'
  }
  return '长按桌面空白处（部分桌面使用双指捏合）→ 小组件／桌面插件／窗口小工具 → 湖畔课表 → 选择今日课表或当前课程。\n\n如果先进入了厂商卡片中心，请继续查找“安卓小部件”或“窗口小工具”。桌面需要有足够空位，并允许修改布局。'
}

export function widgetPinFeedback(result: WidgetPinResult, state: WidgetState, brand = ''): { title: string; message: string } {
  if (result.status === 'requested') return { title: '已请求系统添加', message: '请在系统界面确认。若没有弹窗，可点击标题右侧的提示图标查看添加方法。' }
  if (result.status === 'unavailable') return { title: '暂时无法添加', message: widgetAvailabilityMessage({ ...state, supported: false, availability: result.reason as WidgetState['availability'] }) }
  if (result.reason === 'foreground_required') return { title: '请返回应用重试', message: '请解锁手机，并在湖畔课表显示在前台时重新点击添加。' }
  return { title: result.status === 'manual' ? '请从桌面添加' : '未能打开系统添加界面', message: widgetManualInstructions(brand) }
}
