import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { hopAirborne, hopFrame, hopLandingSquash, hopLandingDeformation, landingInertiaFrame, hopInertiaStart, hopWallStart, hopTransformOrigin, landingInertiaReady, HOP_TRAVEL_DURATION, HOP_LANDING_COMPRESS_DURATION, HOP_LANDING_DURATION, HOP_LANDING_REBOUND_DURATION, HOP_SQUASH_REBOUND_DURATION, HOP_SQUASH_DURATION } from '../src/components/glass-hop.js'
import { useAppearanceStore } from '../src/stores/appearance'
import { DEFAULT_HOP_PEAK, normalizeHopPeak } from '../src/domain/navigation-hop'

describe('hop timeline', () => {
  it('uses a 200ms flight without changing its landing clock', () => {
    expect(HOP_TRAVEL_DURATION).toBe(200)
    expect(hopFrame(0,2,0,0,HOP_TRAVEL_DURATION/2,HOP_TRAVEL_DURATION).position).toBe(1)
    expect(hopFrame(0,2,0,0,HOP_TRAVEL_DURATION,HOP_TRAVEL_DURATION).done).toBe(true)
  })
  it('starts normal, inflates at mid-flight and finishes position and size together', () => {
    expect(hopFrame(0,2,0,0,0,360)).toEqual({position:0,lift:0,done:false})
    expect(hopFrame(0,2,0,0,180,360)).toEqual({position:1,lift:1,done:false})
    expect(hopFrame(0,2,0,0,360,360)).toEqual({position:2,lift:0,done:true})
    let previous = 0
    for (let t=0;t<=360;t+=6) {
      const result = hopFrame(0,2,0,0,t,360)
      expect(result.position).toBeGreaterThanOrEqual(previous)
      expect(result.lift).toBeGreaterThanOrEqual(0)
      expect(result.lift).toBeLessThanOrEqual(1)
      previous = result.position
    }
  })
  it('holds the expanded shape and resumes smoothly from interrupted position and size', () => {
    expect(hopFrame(1,1,0,1,180,180)).toEqual({position:1,lift:1,done:true})
    const current = hopFrame(0,2,0,0,120,360)
    expect(hopFrame(current.position,0,current.lift,0,0,360)).toEqual({...current,done:false})
    expect(hopFrame(current.position,0,current.lift,0,360,360)).toEqual({position:0,lift:0,done:true})
    expect(hopFrame(1,1,1,0,180,180)).toEqual({position:1,lift:0,done:true})
  })
  it('uses elapsed time, independent of refresh rate, and ends after a delayed frame', () => {
    expect(hopFrame(2,0,0,0,10000,360)).toEqual({position:0,lift:0,done:true})
    expect(hopFrame(2,0,0,0,180,360).lift).toBe(1)
  })
  it('adds a full-height flight arc only while travelling, without snapping on retarget', () => {
    expect(hopAirborne(0,0,320,true)).toBe(0)
    expect(hopAirborne(0,160,320,true)).toBe(1)
    expect(hopAirborne(0,320,320,true)).toBe(0)
    expect(hopAirborne(.7,0,320,true)).toBe(.7)
    expect(hopAirborne(.7,160,320,true)).toBe(1)
    expect(hopAirborne(.7,320,320,true)).toBe(0)
    expect(hopAirborne(0,160,160,false)).toBe(0)
    expect(hopAirborne(.7,0,160,false)).toBe(.7)
    expect(hopAirborne(.7,160,160,false)).toBe(0)
  })
  it('lands full size, compresses once, and returns to full size', () => {
    expect(HOP_LANDING_COMPRESS_DURATION).toBe(125)
    expect(HOP_LANDING_REBOUND_DURATION).toBe(125)
    expect(HOP_LANDING_DURATION).toBe(250)
    expect(hopLandingSquash(0)).toBe(0)
    expect(hopLandingSquash(HOP_LANDING_COMPRESS_DURATION)).toBe(1)
    expect(hopLandingSquash(HOP_LANDING_COMPRESS_DURATION / 2)).toBeCloseTo(.5)
    expect(hopLandingSquash(HOP_LANDING_COMPRESS_DURATION + 62.5)).toBeCloseTo(.5)
    expect(hopLandingSquash(HOP_LANDING_COMPRESS_DURATION + 125)).toBeLessThan(.5)
    expect(hopLandingSquash(HOP_LANDING_DURATION)).toBeCloseTo(0)
    expect(hopLandingSquash(HOP_LANDING_DURATION * 2)).toBeCloseTo(0)
  })
  it('settles the hop squash in 125ms using the shared recovery clock', () => {
    expect(HOP_SQUASH_REBOUND_DURATION).toBe(125)
    expect(HOP_SQUASH_DURATION).toBe(250)
    expect(hopLandingDeformation(1)).toEqual({stretch:1.12,squeeze:.85})
    expect(hopLandingSquash(187.5,HOP_SQUASH_REBOUND_DURATION)).toBeCloseTo(.5)
    expect(hopLandingSquash(HOP_SQUASH_DURATION,HOP_SQUASH_REBOUND_DURATION)).toBeCloseTo(0)
    expect(hopLandingSquash(HOP_SQUASH_DURATION)).toBeCloseTo(0)
    expect(landingInertiaFrame(.95,.001,1,1,HOP_SQUASH_DURATION,.06,HOP_SQUASH_REBOUND_DURATION)).toEqual({value:1,velocity:0})
    expect(landingInertiaFrame(.95,.001,1,1,HOP_SQUASH_DURATION)).toEqual({value:1,velocity:0})
  })
  it('hands off before arrival with the original incoming flight velocity', () => {
    for (const [from,to] of [[0,1],[2,1],[3,1],[0,2]]) {
      const time = hopInertiaStart(from,to,HOP_TRAVEL_DURATION),t = time/HOP_TRAVEL_DURATION
      const state = hopFrame(from,to,0,0,time,HOP_TRAVEL_DURATION),velocity = (to-from)*6*t*(1-t)/HOP_TRAVEL_DURATION
      expect(time).toBeLessThan(HOP_TRAVEL_DURATION)
      expect(Math.abs(state.position-to)).toBeGreaterThan(.000001)
      expect(landingInertiaReady(false,state.position,velocity,to,4)).toBe(true)
    }
  })
  it('centers deformation at every interior tab and still pins both walls', () => {
    for (const count of [3,4]) {
      expect(hopTransformOrigin(0,count)).toBe(0)
      expect(hopTransformOrigin(count-1,count)).toBe(100)
      for (let tab = 1;tab < count-1;tab++) for (const offset of [-.06,0,.06]) {
        expect(hopTransformOrigin(tab+offset,count)).toBe(50)
      }
    }
  })
  it('uses the same subpixel distance and velocity limits as flow wall contact', () => {
    for (const distance of [.1,1,2,3]) for (const width of [75,100,200]) {
      const time = hopWallStart(0,distance,HOP_TRAVEL_DURATION,width),t = time/HOP_TRAVEL_DURATION
      expect(time).toBeLessThan(HOP_TRAVEL_DURATION)
      expect((distance-hopFrame(0,distance,0,0,time,HOP_TRAVEL_DURATION).position)*width).toBeLessThanOrEqual(.500001)
      expect(distance*6*t*(1-t)/HOP_TRAVEL_DURATION*width).toBeLessThanOrEqual(.050001)
    }
  })
})

describe('navigation motion preference', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('keeps hop as the default and persists flow independently of glass clarity', () => {
    const data = new Map()
    vi.stubGlobal('uni',{getStorageSync:vi.fn(key=>data.get(key)),setStorageSync:vi.fn((key,value)=>data.set(key,value))})
    setActivePinia(createPinia())
    const store = useAppearanceStore(), clarity=store.glassClarity
    expect(store.navMotion).toBe('hop')
    store.setNavMotion('hop')
    expect(store.glassClarity).toBe(clarity)
    setActivePinia(createPinia())
    expect(useAppearanceStore().navMotion).toBe('hop')
    useAppearanceStore().setNavMotion('flow')
    expect(data.get('lakeside:nav-motion:v1')).toBe('flow')
  })
  it('falls back for invalid saved mode and reports a failed save', () => {
    vi.stubGlobal('uni',{getStorageSync:()=> 'invalid',setStorageSync:()=>{throw Error('full')}})
    setActivePinia(createPinia())
    const store=useAppearanceStore()
    expect(store.navMotion).toBe('hop')
    store.setNavMotion('hop')
    expect(store.navMotion).toBe('hop')
    expect(store.motionSaveError).toBe(true)
  })
})

describe('hop peak preference', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('defaults to 5px, rounds and clamps the full peak to 2–9px', () => {
    expect(DEFAULT_HOP_PEAK).toBe(5)
    expect([undefined, null, '', 'bad', NaN].map(normalizeHopPeak)).toEqual([5,5,5,5,5])
    expect([-20,2,5.6,9,20,'8'].map(normalizeHopPeak)).toEqual([2,2,6,9,9,8])
  })
  it('previews without writing, saves once, and restores independently of the mode', () => {
    const values = new Map<string, unknown>()
    const setStorageSync = vi.fn((key:string,value:unknown) => values.set(key,value))
    vi.stubGlobal('uni',{getStorageSync:(key:string) => values.get(key),setStorageSync})
    setActivePinia(createPinia())
    const store = useAppearanceStore()
    expect(store.navHopPeak).toBe(5)
    store.previewHopPeak(9)
    expect(store.navHopPeak).toBe(9)
    expect(setStorageSync).not.toHaveBeenCalled()
    expect(store.saveHopPeak()).toBe(true)
    expect(values.get('lakeside:nav-hop-peak:v1')).toBe(9)
    store.saveHopPeak()
    expect(setStorageSync).toHaveBeenCalledTimes(1)
    store.setNavMotion('flow')
    setActivePinia(createPinia())
    expect(useAppearanceStore().navHopPeak).toBe(9)
    expect(useAppearanceStore().navMotion).toBe('flow')
  })
  it('uses the default for invalid storage and keeps a failed save visible until retry', () => {
    const setStorageSync = vi.fn().mockImplementationOnce(() => { throw Error('full') })
    vi.stubGlobal('uni',{getStorageSync:(key:string) => key === 'lakeside:nav-hop-peak:v1' ? 'invalid' : undefined,setStorageSync})
    setActivePinia(createPinia())
    const store = useAppearanceStore()
    expect(store.navHopPeak).toBe(5)
    expect(store.saveHopPeak(2)).toBe(false)
    expect(store.navHopPeak).toBe(2)
    expect(store.hopPeakSaveError).toBe(true)
    expect(store.saveHopPeak()).toBe(true)
    expect(store.hopPeakSaveError).toBe(false)
  })
})
