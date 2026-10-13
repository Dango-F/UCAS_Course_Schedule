import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useAppearanceStore } from '../src/stores/appearance'

describe('settings page motion preference', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('defaults to right-side slide and persists all four choices independently', () => {
    const data = new Map<string, unknown>()
    vi.stubGlobal('uni', { getStorageSync: (key: string) => data.get(key), setStorageSync: (key: string, value: unknown) => data.set(key, value) })
    setActivePinia(createPinia())
    const appearance = useAppearanceStore()
    expect(appearance.settingsMotion).toBe('slide')
    const navMotion = appearance.navMotion
    appearance.setSettingsMotion('slide')
    expect(data.get('lakeside:settings-motion:v1')).toBe('slide')
    expect(appearance.navMotion).toBe(navMotion)
    setActivePinia(createPinia())
    expect(useAppearanceStore().settingsMotion).toBe('slide')
    useAppearanceStore().setSettingsMotion('page')
    expect(data.get('lakeside:settings-motion:v1')).toBe('page')
    setActivePinia(createPinia())
    expect(useAppearanceStore().settingsMotion).toBe('page')
    useAppearanceStore().setSettingsMotion('shape')
    expect(data.get('lakeside:settings-motion:v1')).toBe('shape')
    setActivePinia(createPinia())
    expect(useAppearanceStore().settingsMotion).toBe('shape')
    useAppearanceStore().setSettingsMotion('card')
    expect(data.get('lakeside:settings-motion:v1')).toBe('card')
    setActivePinia(createPinia())
    expect(useAppearanceStore().settingsMotion).toBe('card')
  })

  it('uses right-side slide for an invalid saved value and reports storage failures', () => {
    vi.stubGlobal('uni', { getStorageSync: () => 'invalid', setStorageSync: () => { throw Error('full') } })
    setActivePinia(createPinia())
    const appearance = useAppearanceStore()
    expect(appearance.settingsMotion).toBe('slide')
    appearance.setSettingsMotion('slide')
    expect(appearance.settingsMotion).toBe('slide')
    expect(appearance.settingsMotionSaveError).toBe(true)
  })
})
