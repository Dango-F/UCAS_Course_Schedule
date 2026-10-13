import { installWidgetNative, unsupportedWidgetState } from './widget-sync'
import type { WidgetState, WidgetPinResult } from '../domain/widget'
// #ifdef APP-PLUS
import * as plugin from '@/uni_modules/lakeside-widget'
// #endif

function nativeCallback<T>(invoke: (complete: (json: string) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('小组件同步超时')), 30_000)
    try { invoke(json => { clearTimeout(timer); try { resolve(JSON.parse(json) as T) } catch (error) { reject(error) } }) }
    catch (error) { clearTimeout(timer); reject(error) }
  })
}

export function initializeWidgetPlatform(): void {
  // #ifdef APP-PLUS
  if (uni.getSystemInfoSync().platform !== 'android') return
  installWidgetNative({
    syncSnapshot: json => nativeCallback(complete => plugin.syncSnapshot({ snapshotJson: json, complete })),
    getWidgetState: () => {
      try {
        const state = JSON.parse(plugin.getWidgetState()) as WidgetState
        // An old APK/standard base can contain the JS screen without the native plugin.
        if (!state || typeof state.supported !== 'boolean') throw new Error('Invalid widget state')
        if (state.supported && state.nativeVersion !== 2) return { ...state, supported: false, pinSupported: false, availability: 'native_missing' }
        return state.supported ? state : { ...state, availability: state.availability === 'unsupported' || !state.availability ? 'native_missing' : state.availability }
      } catch { return { ...unsupportedWidgetState(), availability: 'native_missing', cacheState: 'native_missing' } }
    },
    updateWidgetOptions: async (id, options) => (await nativeCallback<{ ok: boolean }>(complete => plugin.updateWidgetOptions({ widgetId: id,
      optionsJson: JSON.stringify(options), complete }))).ok === true,
    refreshWidgets: () => plugin.refreshWidgets(), requestPinWidget: kind => JSON.parse(plugin.requestPinWidget(kind)) as WidgetPinResult,
    consumePendingAction: () => plugin.consumePendingAction(),
  })
  // #endif
}
