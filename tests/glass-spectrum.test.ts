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
  it('can reuse a mirrored PNG while retaining all distinct selector PNGs',()=>{
    for(const [width,height] of [[63,31],[100,48]]){
      const mirror=createOpticalMap(width,height,9,6.5,true,0,true,true)
      for(const {offset} of SPECTRAL_SAMPLES){
        const ray=createOpticalMap(width,height,9,6.5,true,offset,true,true)
        expect(Buffer.from(ray).equals(Buffer.from(mirror))).toBe(true)
      }
      const selector=SPECTRAL_SAMPLES.map(({offset})=>Buffer.from(createOpticalMap(width,height,9,6.5,true,offset,true,false,2,true,.5)))
      expect(selector.every((ray,i)=>selector.slice(0,i).every(previous=>!previous.equals(ray)))).toBe(true)
    }
  })
  it('reconstructs each full-resolution wavelength when interrupted between raster rows', () => {
    for (const {offset} of SPECTRAL_SAMPLES) {
      const args = [37, 19, 4.5, 3.25, true, offset, true, false, 3, true, 1 / 2.75] as const
      const expected = createOpticalMap(...args)
      const pixels = new Uint8ClampedArray(expected.length)
      const rows = 19 * 3
      for (let from = 0; from < rows; from += 4) {
        createOpticalMap(...args, { pixels, from, to: Math.min(rows, from + 4) })
      }
      expect(Buffer.from(pixels).equals(Buffer.from(expected))).toBe(true)
    }
  })
  it('shares only the coincident outer displacement across the seven colour weights',()=>{
    const outer = spectralFilterPrimitives(true, false, true)
    expect(outer.match(/<feDisplacementMap /g)).toHaveLength(1)
    expect(outer.match(/<feColorMatrix in="sample0" type="matrix"/g)).toHaveLength(7)
    expect(outer).not.toMatch(/"sample[1-6]"/)
    expect(spectralFilterPrimitives(true, true).match(/<feDisplacementMap /g)).toHaveLength(7)
  })
  it('refracts the original artwork once per wavelength without a blur or a second shifted copy',()=>{
    const graph = spectralFilterPrimitives()
    expect(graph).not.toContain('feGaussianBlur')
    expect(graph.match(/<feDisplacementMap in="SourceGraphic"/g)).toHaveLength(7)
    expect(graph).not.toContain('rimCoverage')
  })
})
