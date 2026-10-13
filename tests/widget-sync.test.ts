import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { makeDemo } from '../src/data/demo'
import { buildWidgetSnapshot } from '../src/domain/widget'
import { getWidgetState, installWidgetNative, pendingWidgetAction, refreshWidgetActions, requestPinWidget, syncSavedWidgetSchedule, takeWidgetAction, unsupportedWidgetState, widgetSyncStatus, type WidgetNativePort } from '../src/services/widget-sync'
import { useScheduleStore } from '../src/stores/schedule'

let saved: unknown = ''
let port: WidgetNativePort
beforeEach(() => {
  saved = ''
  setActivePinia(createPinia())
  vi.stubGlobal('uni', { getStorageSync: () => saved, setStorageSync: (_key: string, value: string) => { saved = value } })
  port = { syncSnapshot: vi.fn(async json => ({ ok: true, revision: JSON.parse(json).revision })),
    getWidgetState: () => ({ ...unsupportedWidgetState(), supported: true }),
    updateWidgetOptions: async () => true, refreshWidgets: vi.fn(), requestPinWidget: () => ({ status: 'manual' }), consumePendingAction: () => null }
  installWidgetNative(port)
  widgetSyncStatus.value = { state: 'idle', message: '', at: 0 }
  pendingWidgetAction.value = null
})

describe('桌面添加能力与错误反馈', () => {
  it('原生能力缺失时报告安装包问题，不把它当成桌面拒绝', () => {
    port.getWidgetState = () => ({ ...unsupportedWidgetState(), availability: 'native_missing' })
    port.requestPinWidget = vi.fn(() => ({ status: 'requested' }))
    expect(requestPinWidget('large')).toEqual({ status: 'unavailable', reason: 'native_missing' })
    expect(port.requestPinWidget).not.toHaveBeenCalled()
  })
  it('只注册了一款时，不能请求不存在的 Provider', () => {
    port.getWidgetState = () => ({ ...unsupportedWidgetState(), supported: true, pinSupported: true, registeredKinds: ['large'] })
    expect(requestPinWidget('small')).toEqual({ status: 'unavailable', reason: 'providers_missing' })
  })
  it('旧 Android 和不支持固定组件的桌面直接进入手动添加', () => {
    port.requestPinWidget = vi.fn(() => ({ status: 'requested' }))
    expect(requestPinWidget('large').status).toBe('manual')
    expect(port.requestPinWidget).not.toHaveBeenCalled()
  })
  it('系统接受请求不等同添加成功，调用异常和过期返回也有明确状态', () => {
    port.getWidgetState = () => ({ ...unsupportedWidgetState(), supported: true, pinSupported: true })
    port.requestPinWidget = () => ({ status: 'requested' })
    expect(requestPinWidget('large').status).toBe('requested')
    port.requestPinWidget = () => { throw new Error('no foreground activity') }
    expect(requestPinWidget('large')).toEqual({ status: 'error', reason: 'native_error' })
    port.requestPinWidget = () => true as unknown as ReturnType<WidgetNativePort['requestPinWidget']>
    expect(requestPinWidget('large')).toEqual({ status: 'error', reason: 'invalid_response' })
  })
})
afterEach(() => vi.unstubAllGlobals())
describe('小组件同步生命周期', () => {
  it('按成功保存顺序同步并立即捕获内容，后续内存编辑不泄漏', async () => {
    const schedule = makeDemo('normal')
    const first = syncSavedWidgetSchedule(schedule)
    schedule.courses[0].teacher = '第二位教师'
    const second = syncSavedWidgetSchedule(schedule)
    await Promise.all([first, second])
    const calls = vi.mocked(port.syncSnapshot).mock.calls.map(([raw]) => JSON.parse(raw))
    expect(calls).toHaveLength(2)
    expect(calls[0].occurrences.find((row: { courseId: string }) => row.courseId === schedule.courses[0].id).teacher).not.toBe('第二位教师')
    expect(calls[1].occurrences.find((row: { courseId: string }) => row.courseId === schedule.courses[0].id).teacher).toBe('第二位教师')
  })
  it('同步失败不影响后续重试，并留下可读状态', async () => {
    vi.mocked(port.syncSnapshot).mockRejectedValueOnce(new Error('disk full'))
    await syncSavedWidgetSchedule(makeDemo('normal'))
    expect(widgetSyncStatus.value.state).toBe('error')
    await syncSavedWidgetSchedule(makeDemo('normal'))
    expect(widgetSyncStatus.value.state).toBe('synced')
  })
  it('缓存内容一致时只刷新，强制同步仍会重写', async () => {
    const schedule = makeDemo('normal')
    port.getWidgetState = () => ({ ...unsupportedWidgetState(), supported: true, revision: buildWidgetSnapshot(schedule).revision })
    await syncSavedWidgetSchedule(schedule)
    expect(port.syncSnapshot).not.toHaveBeenCalled()
    expect(port.refreshWidgets).toHaveBeenCalledOnce()
    await syncSavedWidgetSchedule(schedule, true)
    expect(port.syncSnapshot).toHaveBeenCalledOnce()
  })
  it('保存失败和演示场景不覆盖原生缓存，启动补偿读取持久化内容', async () => {
    const store = useScheduleStore()
    store.resetScenario('dense')
    expect(store.persistCurrent()).toBe(false)
    expect(port.syncSnapshot).not.toHaveBeenCalled()
    vi.stubGlobal('uni', { getStorageSync: () => saved, setStorageSync: () => { throw new Error('full') } })
    expect(store.replaceSchedule(makeDemo('normal'))).toBe(false)
    expect(port.syncSnapshot).not.toHaveBeenCalled()
    saved = JSON.stringify(makeDemo('normal'))
    await store.reconcileWidgets()
    expect(port.syncSnapshot).toHaveBeenCalledOnce()
    expect(JSON.parse(vi.mocked(port.syncSnapshot).mock.calls[0][0]).semester.name).toBe(makeDemo('normal').semester.name)
  })
  it('课表保存成功触发同步，但原生失败不改变保存返回值', async () => {
    vi.mocked(port.syncSnapshot).mockRejectedValue(new Error('native unavailable'))
    expect(useScheduleStore().replaceSchedule(makeDemo('normal'))).toBe(true)
    await syncSavedWidgetSchedule(makeDemo('normal'))
    expect(widgetSyncStatus.value.state).toBe('error')
    expect(typeof saved).toBe('string')
  })
  it('主存储损坏保留原生缓存；确实未导入则同步空状态', async () => {
    saved = '{bad'
    await useScheduleStore().reconcileWidgets()
    expect(port.syncSnapshot).not.toHaveBeenCalled()
    saved = ''
    await useScheduleStore().reconcileWidgets()
    expect(JSON.parse(vi.mocked(port.syncSnapshot).mock.calls[0][0]).semester).toBeNull()
  })
  it('点击只消费一次，空的原生返回不丢弃已暂存事件', () => {
    port.consumePendingAction = () => JSON.stringify({ eventId: 'one', widgetId: 1, target: 'today', date: '2026-09-07' })
    refreshWidgetActions()
    port.consumePendingAction = () => null
    refreshWidgetActions()
    expect(takeWidgetAction()?.eventId).toBe('one')
    expect(takeWidgetAction()).toBeNull()
  })
  it('不支持的平台不会写入、刷新或报保存异常', async () => {
    port.getWidgetState = unsupportedWidgetState
    await syncSavedWidgetSchedule(makeDemo('normal'))
    expect(port.syncSnapshot).not.toHaveBeenCalled()
    expect(getWidgetState().supported).toBe(false)
    expect(widgetSyncStatus.value.state).toBe('idle')
  })
  it('重复收到同一点击事件不会再次打开详情，新点击仍可消费', () => {
    port.consumePendingAction = () => JSON.stringify({ eventId: 'repeat', widgetId: 1, target: 'today', date: '2026-09-07' })
    refreshWidgetActions()
    expect(takeWidgetAction()?.eventId).toBe('repeat')
    refreshWidgetActions()
    expect(takeWidgetAction()).toBeNull()
    port.consumePendingAction = () => JSON.stringify({ eventId: 'new-click', widgetId: 1, target: 'today', date: '2026-09-07' })
    refreshWidgetActions()
    expect(takeWidgetAction()?.eventId).toBe('new-click')
  })
})
