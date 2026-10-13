import { ref } from 'vue'
import { buildWidgetSnapshot, parseWidgetAction, type WidgetAction, type WidgetKind, type WidgetOptions, type WidgetState, type WidgetPinResult } from '../domain/widget'
import type { Schedule } from '../domain/schedule'

export interface WidgetNativePort {
  syncSnapshot(json: string): Promise<{ ok: boolean; revision: string; error?: string }>
  getWidgetState(): WidgetState
  updateWidgetOptions(id: number, options: WidgetOptions): Promise<boolean>
  refreshWidgets(): void
  requestPinWidget(kind: WidgetKind): WidgetPinResult
  consumePendingAction(): string | null
}
export const unsupportedWidgetState = (): WidgetState => ({ supported: false, pinSupported: false, revision: '', cacheState: 'unsupported', instances: [], availability: 'unsupported' })
const unsupported: WidgetNativePort = {
  syncSnapshot: async () => ({ ok: false, revision: '', error: '此平台暂不支持桌面小组件' }),
  getWidgetState: unsupportedWidgetState, updateWidgetOptions: async () => false,
  refreshWidgets() {}, requestPinWidget: () => ({ status: 'unavailable', reason: 'unsupported' }), consumePendingAction: () => null,
}
let native: WidgetNativePort = unsupported
let queue = Promise.resolve()
const handledEvents = new Set<string>()
export const widgetSyncStatus = ref<{ state: 'idle' | 'syncing' | 'synced' | 'error'; message: string; at: number }>({ state: 'idle', message: '', at: 0 })
export const pendingWidgetAction = ref<WidgetAction | null>(null)
export function installWidgetNative(port: WidgetNativePort): void { native = port; handledEvents.clear() }
export function getWidgetState(): WidgetState { try { return native.getWidgetState() } catch { return unsupportedWidgetState() } }
export function syncSavedWidgetSchedule(schedule: Schedule | null, force = false): Promise<void> {
  if (!getWidgetState().supported) return Promise.resolve()
  // Capture synchronously, before a caller can mutate its live Pinia schedule.
  let snapshot: ReturnType<typeof buildWidgetSnapshot>
  try { snapshot = buildWidgetSnapshot(schedule) } catch (error) {
    widgetSyncStatus.value = { state: 'error', message: String(error instanceof Error ? error.message : error), at: Date.now() }
    return Promise.resolve()
  }
  const json = JSON.stringify(snapshot)
  queue = queue.then(async () => {
    widgetSyncStatus.value = { state: 'syncing', message: '正在同步课表', at: Date.now() }
    try {
      if (!force && getWidgetState().revision === snapshot.revision) native.refreshWidgets()
      else {
        const result = await native.syncSnapshot(json)
        if (!result.ok) throw new Error(result.error || '小组件同步失败')
      }
      widgetSyncStatus.value = { state: 'synced', message: snapshot.semester ? '小组件已同步' : '尚未导入真实课表', at: Date.now() }
    } catch {
      widgetSyncStatus.value = { state: 'error', message: '课表已保存，小组件同步失败，请重新同步', at: Date.now() }
    }
  })
  return queue
}
export function refreshWidgetActions(): void {
  try {
    const action = parseWidgetAction(native.consumePendingAction())
    if (action && !handledEvents.has(action.eventId)) {
      handledEvents.add(action.eventId)
      if (handledEvents.size > 32) handledEvents.delete(handledEvents.values().next().value!)
      pendingWidgetAction.value = action
    }
  } catch { /* Preserve a previously queued action while an import is open. */ }
}
export function takeWidgetAction(): WidgetAction | null {
  const action = pendingWidgetAction.value
  pendingWidgetAction.value = null
  return action
}
export function requestPinWidget(kind: WidgetKind): WidgetPinResult {
  const state = getWidgetState()
  if (!state.supported) return { status: 'unavailable', reason: state.availability || 'unsupported' }
  if (state.registeredKinds && !state.registeredKinds.includes(kind)) return { status: 'unavailable', reason: 'providers_missing' }
  if (!state.pinSupported) return { status: 'manual', reason: 'launcher_unsupported' }
  try {
    const result = native.requestPinWidget(kind)
    if (!result || !['requested', 'manual', 'unavailable', 'error'].includes(result.status)) return { status: 'error', reason: 'invalid_response' }
    return result
  } catch { return { status: 'error', reason: 'native_error' } }
}
export async function updateWidgetOptions(id: number, options: WidgetOptions): Promise<boolean> {
  try { return await native.updateWidgetOptions(id, options) } catch { return false }
}
