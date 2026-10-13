import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { DEFAULT_GLASS_CLARITY, glassClarityProfile, normalizeGlassClarity } from '../src/domain/glass-material'
import { useAppearanceStore } from '../src/stores/appearance'

describe('glass clarity material', () => {
  it('uses the maximum clarity material at the default value', () => {
    expect(DEFAULT_GLASS_CLARITY).toBe(100)
    expect(glassClarityProfile(80)).toEqual({ blurFactor:1, surfaceAlpha:.06, selectionAlpha:.04 })
    expect(glassClarityProfile(100)).toEqual({ blurFactor:1 - 2 / 3, surfaceAlpha:.06 - .04, selectionAlpha:.04 - .015 })
  })
  it('reduces haze and coatings monotonically across the whole slider', () => {
    let previous = glassClarityProfile(0)
    for (let value = 1; value <= 100; value++) {
      const next = glassClarityProfile(value)
      for (const key of ['blurFactor', 'surfaceAlpha', 'selectionAlpha'] as const) {
        expect(next[key]).toBeGreaterThan(0)
        expect(next[key]).toBeLessThan(previous[key])
      }
      previous = next
    }
    expect(glassClarityProfile(0).blurFactor * .6).toBeCloseTo(2.4)
    expect(glassClarityProfile(100).blurFactor * .6).toBeCloseTo(.2)
  })
  it('rounds, clamps, and rejects non-numeric settings', () => {
    expect(normalizeGlassClarity(47.6)).toBe(48)
    expect(normalizeGlassClarity(-20)).toBe(0)
    expect(normalizeGlassClarity(120)).toBe(100)
    for (const value of [undefined, null, NaN, Infinity, '', '0', {}, false]) expect(normalizeGlassClarity(value)).toBe(100)
  })
})

describe('glass clarity preference storage', () => {
  const values = new Map<string, unknown>()
  beforeEach(() => {
    values.clear()
    setActivePinia(createPinia())
    vi.stubGlobal('uni', { getStorageSync:vi.fn(key => values.get(key)), setStorageSync:vi.fn((key, value) => values.set(key, value)) })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('defaults slider light on and persists an explicit off choice independently', () => {
    const store = useAppearanceStore()
    expect(store.glassTouchLight).toBe(true)
    expect(uni.setStorageSync).not.toHaveBeenCalled()
    store.setGlassTouchLight(false)
    expect(store.glassTouchLight).toBe(false)
    expect(values.get('lakeside:glass-touch-light:v1')).toBe(false)
    expect(store.glassClarity).toBe(100)
    expect(store.qElastic).toBe(true)
    setActivePinia(createPinia())
    expect(useAppearanceStore().glassTouchLight).toBe(false)
    useAppearanceStore().setGlassTouchLight(true)
    setActivePinia(createPinia())
    expect(useAppearanceStore().glassTouchLight).toBe(true)
  })
  it('applies light changes even on storage failure and reports retry recovery', () => {
    const store = useAppearanceStore()
    vi.mocked(uni.setStorageSync).mockImplementationOnce(() => { throw new Error('full') })
    store.setGlassTouchLight(false)
    expect(store.glassTouchLight).toBe(false)
    expect(store.touchLightSaveError).toBe(true)
    store.setGlassTouchLight(false)
    expect(store.touchLightSaveError).toBe(false)
    expect(values.get('lakeside:glass-touch-light:v1')).toBe(false)
  })
  it('keeps light enabled for missing, invalid or unavailable storage', () => {
    for (const raw of [undefined,null,'false',0,{}]) {
      values.set('lakeside:glass-touch-light:v1',raw)
      setActivePinia(createPinia())
      expect(useAppearanceStore().glassTouchLight).toBe(true)
    }
    vi.mocked(uni.getStorageSync).mockImplementation(() => { throw new Error('unavailable') })
    setActivePinia(createPinia())
    expect(useAppearanceStore().glassTouchLight).toBe(true)
  })

  it('previews without writes, saves once on release, and restores across store recreation', () => {
    const store = useAppearanceStore()
    expect(store.glassClarity).toBe(100)
    for (let i = 0; i <= 40; i++) store.previewClarity(i)
    expect(uni.setStorageSync).not.toHaveBeenCalled()
    expect(store.saveClarity()).toBe(true)
    expect(store.saveClarity()).toBe(true)
    expect(uni.setStorageSync).toHaveBeenCalledTimes(1)
    setActivePinia(createPinia())
    expect(useAppearanceStore().glassClarity).toBe(40)
  })
  it('restores zero correctly, handles invalid storage, and can reset the default', () => {
    for (const [raw, expected] of [[0,0], ['0',0], [100,100], ['garbled',100], [null,100], [{},100], ['{"value":20}',100]] as const) {
      values.set('lakeside:glass-clarity:v1', raw)
      setActivePinia(createPinia())
      expect(useAppearanceStore().glassClarity).toBe(expected)
    }
    const store = useAppearanceStore()
    store.saveClarity(20)
    store.saveClarity(DEFAULT_GLASS_CLARITY)
    expect(values.get('lakeside:glass-clarity:v1')).toBe(100)
  })
  it('keeps the preview and reports write failures without corrupting course data', () => {
    const store = useAppearanceStore()
    vi.mocked(uni.setStorageSync).mockImplementationOnce(() => { throw new Error('full') })
    expect(store.saveClarity(30)).toBe(false)
    expect(store.glassClarity).toBe(30)
    expect(store.saveError).toBe(true)
    expect(store.saveClarity()).toBe(true)
    expect(store.saveError).toBe(false)
    expect([...values.keys()]).toEqual(['lakeside:glass-clarity:v1'])
  })
  it('tolerates unavailable storage on launch', () => {
    vi.mocked(uni.getStorageSync).mockImplementationOnce(() => { throw new Error('unavailable') })
    expect(useAppearanceStore().glassClarity).toBe(100)
  })
})
