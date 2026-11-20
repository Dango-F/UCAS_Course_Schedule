import { describe, expect, it } from 'vitest'
import { flowMaterialFrame, hopMaterialProgress } from '../src/components/glass-selection-material.js'
import { createCapsuleMap, capsuleRefraction, selectorLensGeometry } from '../src/components/glass-lens.js'
import { createOpticalMap, opticalOffset } from '../src/components/glass-spectrum.js'

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
  it('has a narrow bounded rim with no full-face blur', () => {
    expect(selectorLensGeometry(48)).toEqual({rim:9,amount:6.5})
    for (const h of [1,24,48,100,NaN]) {
      const g=selectorLensGeometry(h)
      expect(g.rim).toBeLessThanOrEqual(9)
      expect(g.amount).toBeLessThanOrEqual(6.5)
    }
  })
  it('leaves the small selector interior neutral and bends only the rim', () => {
    const {rim,amount}=selectorLensGeometry(48)
    expect(capsuleRefraction(45,24,90,48,rim,amount)).toEqual([0,0])
    expect(capsuleRefraction(45,12,90,48,rim,amount)).toEqual([0,0])
    expect(capsuleRefraction(45,1,90,48,rim,amount)[1]).toBeGreaterThan(0)
    expect(createCapsuleMap(90,48,rim,amount).length).toBe(90*48*4)
  })
  it('increases the bend over the reference lens and keeps the center neutral at every wavelength', () => {
    const {rim,amount} = selectorLensGeometry(48)
    // Off-axis on the rounded end, so this exercises depth and dispersion too.
    for (const offset of [-1,0,1]) {
      const reference = opticalOffset(91,18,94,48,8,5,true,offset)
      const current = opticalOffset(91,18,94,48,rim,amount,true,offset,false,true)
      expect(Math.hypot(...current)).toBeGreaterThan(Math.hypot(...reference))
      expect(opticalOffset(47,24,94,48,rim,amount,true,offset,false,true)).toEqual([0,0])
    }
    expect(opticalOffset(47,3,94,48,rim,amount,true,1,false,true)).toEqual([0,0])
  })
  it('samples the same physical rim in CSS pixels at different map resolutions', () => {
    const {rim,amount} = selectorLensGeometry(48)
    const map = createOpticalMap(94,48,rim,amount,true,1,true,false,3,true)
    const pixel = (x: number,y: number) => Array.from(map.slice((y*282+x)*4,(y*282+x)*4+4))
    const low = createOpticalMap(94,48,rim,amount,true,1,true,false,1,true)
    expect(map.length).toBe(282*144*4)
    expect(pixel(141,72)).toEqual([128,128,255,255])
    expect(pixel(274,55)).toEqual(Array.from(low.slice((18*94+91)*4,(18*94+91)*4+4)))
  })
  it('resolves the silhouette across one display pixel at each screen density', () => {
    for (const dpr of [1,2,3]) {
      const density=2*dpr
      const map=createOpticalMap(94,48,9,6.5,true,1,true,false,density,true,1/dpr)
      const coverage=(row: number)=>map[(row*94*density+47*density)*4+2]
      // The first two map texels are 1/4 and 3/4 of a physical pixel inside.
      expect(coverage(0)).toBe(64)
      expect(coverage(1)).toBe(191)
      expect(coverage(2)).toBe(255)
    }
  })
  it('retains the peak and keeps the padding continuous with the last refracted texel', () => {
    const offset=(x: number)=>opticalOffset(x,24,94,48,9,6.5,true,0,false,true)[0]
    expect(offset(94)).toBeCloseTo(-6.5)
    expect(offset(94.1)).toBeCloseTo(offset(94))
    expect(Math.abs(offset(93.95)-offset(94))).toBeLessThan(.12)
  })
})
