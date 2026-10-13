import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppearanceStore } from '../src/stores/appearance'

const key = 'lakeside:nav-q-elastic:v1'
describe('Q elastic preference', () => {
  afterEach(() => vi.unstubAllGlobals())
  it.each([undefined, null, '', 'invalid', 0, 'false', true])('defaults on for absent or invalid storage: %s', value => {
    vi.stubGlobal('uni', { getStorageSync: () => value })
    setActivePinia(createPinia())
    expect(useAppearanceStore().qElastic).toBe(true)
  })
  it('persists both choices without changing glass, navigation mode, height or page transitions', () => {
    const data = new Map<string, unknown>()
    vi.stubGlobal('uni', { getStorageSync: (name:string) => data.get(name), setStorageSync: (name:string, value:unknown) => data.set(name,value) })
    setActivePinia(createPinia())
    const store = useAppearanceStore()
    const before = [store.glassClarity, store.navMotion, store.navHopPeak, store.settingsMotion, store.navVisibility]
    store.setQElastic(false)
    expect(data.get(key)).toBe(false)
    expect([store.glassClarity, store.navMotion, store.navHopPeak, store.settingsMotion, store.navVisibility]).toEqual(before)
    setActivePinia(createPinia())
    expect(useAppearanceStore().qElastic).toBe(false)
    useAppearanceStore().setQElastic(true)
    setActivePinia(createPinia())
    expect(useAppearanceStore().qElastic).toBe(true)
  })
  it('uses the current choice immediately on a failed save and retries successfully', () => {
    const save = vi.fn().mockImplementationOnce(() => { throw Error('full') })
    vi.stubGlobal('uni', { getStorageSync: () => { throw Error('unavailable') }, setStorageSync: save })
    setActivePinia(createPinia())
    const store = useAppearanceStore()
    expect(store.qElastic).toBe(true)
    store.setQElastic(false)
    expect(store.qElastic).toBe(false)
    expect(store.qElasticSaveError).toBe(true)
    store.setQElastic(false)
    expect(store.qElasticSaveError).toBe(false)
    expect(save).toHaveBeenLastCalledWith(key,false)
  })
})
