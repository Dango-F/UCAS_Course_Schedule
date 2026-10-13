import { describe, expect, it } from 'vitest'
import { widgetAvailabilityMessage, widgetManualInstructions, widgetPinFeedback, widgetToastText } from '../src/domain/widget-guide'
import { unsupportedWidgetState } from '../src/services/widget-sync'

describe('桌面小组件添加指引', () => {
  it('添加结果使用简短提示，不截断长诊断并引导查看方法', () => {
    expect(widgetToastText({ title: '已添加到桌面', message: '小组件已就位。回到桌面即可查看。', tone: 'success' })).toBe('小组件已就位')
    expect(widgetToastText({ title: '暂时无法添加', message: '长'.repeat(80), tone: 'warning' })).toContain('请点击标题旁的提示')
  })
  it('把安装包缺失、系统不支持和桌面不支持一键添加区分开', () => {
    const state = unsupportedWidgetState()
    expect(widgetAvailabilityMessage({ ...state, availability: 'native_missing' })).toContain('完整新版 APK')
    expect(widgetAvailabilityMessage({ ...state, availability: 'providers_missing' })).toContain('未被 Android 系统注册')
    expect(widgetAvailabilityMessage({ ...state, availability: 'system_unsupported' })).toContain('系统未提供')
    expect(widgetAvailabilityMessage({ ...state, supported: true })).toContain('手动添加')
  })
  it('覆盖厂商卡片中心下的标准 Android 小组件入口', () => {
    expect(widgetManualInstructions('Redmi')).toContain('安卓小部件')
    expect(widgetManualInstructions('HUAWEI')).toContain('窗口小工具')
    expect(widgetManualInstructions('HONOR')).toContain('桌面卡片 → 湖畔课表')
    expect(widgetManualInstructions('HONOR')).not.toContain('经典小工具')
    expect(widgetManualInstructions('samsung')).toContain('长按桌面')
    expect(widgetManualInstructions('unknown')).toContain('湖畔课表')
  })
  it('标准基座中能加载 Kotlin 但 Provider 缺失时明确要求切换自定义基座', () => {
    const state = { ...unsupportedWidgetState(), availability: 'providers_missing' as const, packageName: 'io.dcloud.HBuilder' }
    const feedback = widgetPinFeedback({ status: 'unavailable', reason: 'providers_missing' }, state)
    expect(feedback.message).toContain('标准调试基座')
    expect(feedback.message).toContain('自定义基座 → 本地基座')
    expect(widgetAvailabilityMessage({ ...state, packageName: 'ucas.course.schedule' })).toContain('完整新版 APK')
  })
  it('成功请求不宣称添加成功，前台错误提供可操作反馈', () => {
    const state = { ...unsupportedWidgetState(), supported: true }
    expect(widgetPinFeedback({ status: 'requested' }, state).title).toBe('已请求系统添加')
    expect(widgetPinFeedback({ status: 'error', reason: 'foreground_required' }, state).message).toContain('前台')
    expect(widgetPinFeedback({ status: 'unavailable', reason: 'providers_missing' }, state).message).toContain('未被 Android 系统注册')
  })
})
