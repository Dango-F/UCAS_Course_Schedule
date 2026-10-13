import {describe,it,expect} from 'vitest'
import {opticalOffset,createOpticalMap,SPECTRAL_SAMPLES,mirrorFoldWidth,mirrorFoldProfile,opticalMapScale,MIRROR_TURN_RADIUS} from '../src/components/glass-spectrum.js'
import {lensGeometry} from '../src/components/glass-lens.js'

const g=lensGeometry(56),b=mirrorFoldWidth(g.rim,g.amount)
const offset=(x:number,y:number,s=0)=>opticalOffset(x,y,300,56,g.rim,g.amount,true,s,true)
describe('joined glass mirror faces',()=>{
  it('keeps the base lens geometry with a 7px fold',()=>{
    expect(g.rim).toBeCloseTo(12.44444,4);expect(g.amount).toBeCloseTo(7.77778,4);expect(b).toBe(7)
    for(const y of [b+1,28,56-b-1]) expect(offset(150,y)).toEqual([0,0])
  })
  it('compresses only vertically and meets the unchanged original at the join',()=>{
    for(const x of [40,70,150,240,260]) {
      for(const d of [.1,.5,1,2,2.8]) {
        const above=offset(x,b-d),below=offset(x,b+d)
        expect(above[0]).toBeCloseTo(0);expect(below[0]).toBeCloseTo(0)
        const [radial,compression]=mirrorFoldProfile(b-d,b)
        expect(above[1]).toBeCloseTo(radial+compression,10)
      }
      for(let y=.5;y<b-1;y++) {
        const before=y+offset(x,y)[1],after=y+1+offset(x,y+1)[1]
        expect(after-before).toBeLessThan(-1)
      }
      const left=b-.00001+offset(x,b-.00001)[1],right=b+.00001+offset(x,b+.00001)[1]
      expect(left).toBeCloseTo(right,9)
      expect(b+offset(x,b)[1]).toBeCloseTo(b+MIRROR_TURN_RADIUS/2)
    }
  })
  it('unfolds from a compressed rim without a wide magnifying plateau',()=>{
    const scale=(y:number)=>{
      const epsilon=1e-5,source=(s:number)=>s+offset(150,s)[1]
      return 1/Math.abs((source(y+epsilon)-source(y-epsilon))/(2*epsilon))
    }
    const scales=[.0001,b*.25,b*.5,b*.75,b-MIRROR_TURN_RADIUS-.0001].map(scale)
    expect(scales[0]).toBeGreaterThan(.36);expect(scales[0]).toBeLessThan(.38)
    for(let i=1;i<scales.length;i++)expect(scales[i]).toBeGreaterThan(scales[i-1])
    expect(scales.at(-1)).toBeCloseTo(1,3)
    expect(scale(b/2)).toBeGreaterThan(.55)
    for(let y=.001;y<b-MIRROR_TURN_RADIUS;y+=.01){expect(scale(y)).toBeGreaterThan(.36);expect(scale(y)).toBeLessThanOrEqual(1.00001)}
    // Small adjustment from the video-guided baseline, not another redesign.
    const d=b-MIRROR_TURN_RADIUS
    const previousEdgeScale=1/(1+.25*(1-Math.exp(-d))+3*.5*d*d/(b*b))
    expect(scales[0]/previousEdgeScale).toBeGreaterThan(.90)
    expect(scales[0]/previousEdgeScale).toBeLessThan(.95)
  })
  it('rounds the reversal continuously within 1.5px, leaving the original intact beyond it',()=>{
    const source=(s:number)=>s+offset(150,s)[1],eps=1e-5
    const slope=(s:number)=>(source(s+eps)-source(s-eps))/(2*eps)
    for(const s of [b-MIRROR_TURN_RADIUS,b,b+MIRROR_TURN_RADIUS]){
      expect(source(s-eps)).toBeCloseTo(source(s+eps),4)
      expect(slope(s-1e-4)).toBeCloseTo(slope(s+1e-4),3)
    }
    expect(slope(b)).toBeCloseTo(0,6)
    expect(slope(b-MIRROR_TURN_RADIUS)).toBeCloseTo(-1,4)
    expect(slope(b+MIRROR_TURN_RADIUS)).toBeCloseTo(1,4)
    for(let s=b+MIRROR_TURN_RADIUS;s<28;s+=.1)expect(source(s)).toBeCloseTo(s,8)
    expect(2*MIRROR_TURN_RADIUS).toBe(1.5)
  })
  it('allows longer source reach and bounds encoding even for small controls',()=>{
    const edge=.00001,source=edge+offset(150,edge)[1]
    expect(source).toBeGreaterThan(18);expect(source).toBeLessThan(19)
    for(const height of [8,24,48,56,80]){
      const geometry=lensGeometry(height),fold=mirrorFoldWidth(geometry.rim,geometry.amount)
      expect(fold).toBeLessThanOrEqual(7)
      for(let y=.01;y<fold;y+=.1){
        const d=opticalOffset(150,y,300,height,geometry.rim,geometry.amount,true,0,true)
        expect(Math.hypot(...d)).toBeLessThan(opticalMapScale(geometry.amount,true,true)/2)
      }
    }
  })
  it('adds no horizontal compression beyond the narrowed geometric cap fold',()=>{
    for(let y=.5;y<56;y+=2)for(let x=.5;x<300;x+=2){
      const cx=x-150,cy=y-28,dx=cx-Math.max(-122,Math.min(122,cx)),length=Math.hypot(dx,cy),inside=28-length
      const expectedX=inside>0?-mirrorFoldProfile(inside,b)[0]*dx/length:0
      expect(offset(x,y)[0]).toBeCloseTo(expectedX,10)
    }
  })
  it('aligns all channels at the join and preserves the separate refraction path',()=>{
    for(const sample of SPECTRAL_SAMPLES) expect(offset(70,2,sample.offset)).toEqual(offset(70,2))
    const refract=(s:number)=>opticalOffset(70,2,300,56,g.rim,g.amount,true,s,false)
    expect(refract(1)).not.toEqual(refract(-1));expect(refract(0)[0]).toBeGreaterThan(0)
  })
  it('has symmetric top, bottom and capsule caps with bounded encoded samples',()=>{
    for(const [x,y] of [[150,2],[70,2],[2,28],[10,10]]) {
      const a=offset(x,y),v=offset(x,56-y),h=offset(300-x,y)
      expect(a[0]).toBeCloseTo(v[0]);expect(a[1]).toBeCloseTo(-v[1])
      expect(a[0]).toBeCloseTo(-h[0]);expect(a[1]).toBeCloseTo(h[1])
    }
    const first=createOpticalMap(300,56,g.rim,g.amount,true,1,true,true)
    expect(first).toEqual(createOpticalMap(300,56,g.rim,g.amount,true,-1,true,true))
    for(let y=.5;y<56;y+=3)for(let x=.5;x<300;x+=3)expect(Math.hypot(...offset(x,y))).toBeLessThanOrEqual(opticalMapScale(g.amount,false,true)/2)
    expect(mirrorFoldWidth(0,1)).toBe(0);expect(mirrorFoldWidth(1,0)).toBe(0)
    expect(offset(-1,28)).toEqual([0,0])
  })
})
