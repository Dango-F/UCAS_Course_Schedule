import { describe, expect, it } from 'vitest'
import { flowMaterialFrame, hopMaterialProgress } from '../src/components/glass-selection-material.js'
import { createCapsuleMap, capsuleRefraction, selectorLensGeometry } from '../src/components/glass-lens.js'

describe('continuous selector material', () => {
  it('keeps hop endpoints resting and the middle clear, with a smooth final fade', () => {
    expect(hopMaterialProgress(0)).toBe(0)
    expect(hopMaterialProgress(.5)).toBe(1)
    expect(hopMaterialProgress(1)).toBe(1)
    expect(hopMaterialProgress(.1)).toBeGreaterThan(0)
    expect(hopMaterialProgress(.001)).toBeLessThan(.0001)
    expect(hopMaterialProgress(NaN)).toBe(0)
  })
  it('flow restores on visual arrival even if pressure still has a tail', () => {
    for (const from of [0, .3, 1]) {
      expect(flowMaterialFrame(from, false, 0, 100, 100).value).toBe(from)
      expect(flowMaterialFrame(from, false, 250, 100, .5)).toEqual({value:0,done:true})
      expect(flowMaterialFrame(from, false, 100, 100, 1).value).toBeLessThan(.001)
      for (let remaining=0;remaining<=100;remaining++) {
        const {value}=flowMaterialFrame(from,false,100,100,remaining)
        expect(value).toBeGreaterThanOrEqual(0)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })
  it('stationary hold/release and interruption start from visible tint', () => {
    expect(flowMaterialFrame(.6,true,0,0,0).value).toBe(.6)
    expect(flowMaterialFrame(.6,true,160,0,0)).toEqual({value:1,done:true})
    expect(flowMaterialFrame(1,false,0,0,0).value).toBe(1)
    expect(flowMaterialFrame(1,false,80,0,0).value).toBe(.5)
    expect(flowMaterialFrame(1,false,160,0,0)).toEqual({value:0,done:true})
    const current=flowMaterialFrame(.7,false,100,100,60).value
    expect(flowMaterialFrame(current,false,0,40,40).value).toBe(current)
  })
})

describe('lightweight selector optics', () => {
  it('has a narrow bounded rim with no extra blur', () => {
    expect(selectorLensGeometry(48)).toEqual({rim:6,amount:2.5,blur:0})
    for (const h of [1,24,48,100,NaN]) {
      const g=selectorLensGeometry(h)
      expect(g.rim).toBeLessThanOrEqual(6)
      expect(g.amount).toBeLessThanOrEqual(2.5)
      expect(g.blur).toBe(0)
    }
  })
  it('leaves the small selector interior neutral and bends only the rim', () => {
    const {rim,amount}=selectorLensGeometry(48)
    expect(capsuleRefraction(45,24,90,48,rim,amount)).toEqual([0,0])
    expect(capsuleRefraction(45,8,90,48,rim,amount)).toEqual([0,0])
    expect(capsuleRefraction(45,1,90,48,rim,amount)[1]).toBeGreaterThan(0)
    expect(createCapsuleMap(90,48,rim,amount).length).toBe(90*48*4)
  })
})
