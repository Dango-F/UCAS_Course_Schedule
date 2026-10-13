import {describe,it,expect} from 'vitest'
import {parseBackdropColor,backdropLuminance,nextBackdropTone,compositeBackdrop,imageBackdropUV,ADAPTIVE_SAMPLE_INTERVAL} from '../src/components/glass-adaptive.js'

describe('background-driven glass contrast',()=>{
  it('parses computed RGB colours and opacity without guessing unsupported colours',()=>{
    expect(parseBackdropColor('rgb(255, 128, 0)')).toEqual([1,128/255,0,1])
    expect(parseBackdropColor('rgb(100% 0% 50% / 20%)')).toEqual([1,0,.5,.2])
    expect(parseBackdropColor('rgba(0, 0, 0, 0)')).toEqual([0,0,0,0])
    expect(parseBackdropColor('invalid')).toBeNull()
  })
  it('uses linear luminance, not the device theme or image average',()=>{
    expect(backdropLuminance([0,0,0])).toBe(0)
    expect(backdropLuminance([1,1,1])).toBe(1)
    expect(backdropLuminance([.5,.5,.5])).toBeCloseTo(.214,3)
    expect(backdropLuminance([0,1,0])).toBeGreaterThan(backdropLuminance([0,0,1]))
  })
  it('keeps hysteresis across mid-grey and preserves the last state if unreadable',()=>{
    expect(nextBackdropTone('light',.1)).toBe('dark')
    expect(nextBackdropTone('dark',.2)).toBe('dark')
    expect(nextBackdropTone('light',.2)).toBe('light')
    expect(nextBackdropTone('dark',.8)).toBe('light')
    expect(nextBackdropTone('dark',NaN)).toBe('dark')
    expect(ADAPTIVE_SAMPLE_INTERVAL).toBeGreaterThanOrEqual(150)
  })
  it('composites translucent surfaces in painting order',()=>{
    expect(compositeBackdrop([0,0,0,.5],[1,1,1,1])).toEqual([.5,.5,.5,1])
    expect(compositeBackdrop([1,0,0,1],[0,0,0,1])).toEqual([1,0,0,1])
    expect(compositeBackdrop([0,0,0,0],[0,0,0,0])).toEqual([0,0,0,0])
  })
  it('samples the displayed crop, including object-fit cover and contain',()=>{
    const box={left:10,top:20,width:100,height:100}
    expect(imageBackdropUV(60,70,box,200,100,'cover')).toEqual([.5,.5])
    expect(imageBackdropUV(10,70,box,200,100,'cover')).toEqual([.25,.5])
    expect(imageBackdropUV(60,20,box,200,100,'contain')).toBeNull()
    expect(imageBackdropUV(10,70,box,200,100,'cover','0% 50%')).toEqual([0,.5])
    expect(imageBackdropUV(60,70,box,0,0)).toBeNull()
  })
})
