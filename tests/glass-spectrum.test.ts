import {describe,it,expect} from 'vitest'
import {SPECTRAL_SAMPLES,opticalOffset,createOpticalMap,spectralFilterPrimitives} from '../src/components/glass-spectrum.js'

describe('Kyant seven-sample optics',()=>{
  it('preserves white and uses all seven reference offsets',()=>{
    expect(SPECTRAL_SAMPLES.map(s=>s.offset)).toEqual([1,2/3,1/3,0,-1/3,-2/3,-1])
    for(let channel=0;channel<3;channel++) expect(SPECTRAL_SAMPLES.reduce((sum,s)=>sum+s.rgb[channel],0)).toBeCloseTo(1)
    expect(spectralFilterPrimitives().match(/<feDisplacementMap /g)).toHaveLength(7)
    expect(spectralFilterPrimitives(false).match(/<feDisplacementMap /g)).toHaveLength(1)
  })
  it('depth changes sampling direction without increasing its length',()=>{
    const a=opticalOffset(70,2,300,56,12,8,false),b=opticalOffset(70,2,300,56,12,8,true)
    expect(a[0]).toBeCloseTo(0);expect(b[0]).toBeGreaterThan(0);expect(b[1]).toBeGreaterThan(0)
    expect(Math.hypot(...a)).toBeCloseTo(Math.hypot(...b))
  })
  it('splits spectral samples off-axis and leaves center undistorted',()=>{
    const a=opticalOffset(70,2,300,56,12,8,true,1),b=opticalOffset(70,2,300,56,12,8,true,-1)
    expect(Math.hypot(...a)).toBeGreaterThan(Math.hypot(...b))
    for(const {offset} of SPECTRAL_SAMPLES) expect(opticalOffset(150,28,300,56,12,8,true,offset)).toEqual([0,0])
    expect(opticalOffset(150,2,300,56,12,8,true,1)).toEqual(opticalOffset(150,2,300,56,12,8,true,-1))
  })
  it('bounds maps and safely handles zero strength',()=>{
    const map=createOpticalMap(100,48,6,0)
    expect([...map.slice(0,4)]).toEqual([128,128,128,255])
    for(const {offset} of SPECTRAL_SAMPLES) {
      const p=createOpticalMap(100,48,6,2.5,true,offset)
      expect(p).toHaveLength(100*48*4)
      for(let i=3;i<p.length;i+=4) expect(p[i]).toBe(255)
    }
  })
})
