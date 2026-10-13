import { describe, expect, it } from 'vitest'
import { paintRippleField, blendRipplePixels, rippleFrame, rippleSlope, rippleEnvelope, rippleAlive, flowEntryOffset, ribbonColumn, advanceFlowAge, FLOW_RIBBON_COUNT, FLOW_ENTRY_DURATION, FLOW_BAND_WIDTH, RIPPLE_RELEASE, RIPPLE_LIFETIME } from '../src/components/glass-ripple-field.js'

const wave={born:100,nx:0,ny:1,origin:.25,amplitude:.95}
describe('local propagating glass surface light',()=>{
  it('caps phase catch-up after a stall without slowing normal 60/120Hz frames',()=>{
    expect(advanceFlowAge(1000,16)).toBe(1016)
    expect(advanceFlowAge(1000,8)).toBe(1008)
    expect(advanceFlowAge(1000,900)).toBe(1048)
    const held={...wave,flowAge:1048,sustained:true,releasedAt:null}
    const before=new Uint8ClampedArray(96*48*4),after=new Uint8ClampedArray(before.length)
    paintRippleField(before,96,48,[held],1300)
    paintRippleField(after,96,48,[held],2200)
    expect(after).toEqual(before) // Wall-time alone no longer moves the pattern.
  })
  it('always enters from the lower left regardless of gesture direction',()=>{
    expect(FLOW_BAND_WIDTH).toBe(1.04)
    const pixels=new Uint8ClampedArray(96*48*4)
    for(const [nx,ny] of [[0,1],[0,-1],[1,0],[-1,0]]){
      const held={...wave,nx,ny,sustained:true,releasedAt:null}
      paintRippleField(pixels,96,48,[held],wave.born+120)
      let mass=0,edge=0,center=0
      for(let y=0;y<48;y++)for(let x=0;x<96;x++){
        const a=pixels[(y*96+x)*4+3];mass+=a
        const atEdge=x<48&&y>=24
        if(atEdge)edge+=a
        if(x>=36&&x<60&&y>=18&&y<30)center+=a
      }
      expect(mass).toBeGreaterThan(0)
      expect(edge/mass).toBeGreaterThan(.85)
      expect(center/mass).toBeLessThan(.02)
      expect(flowEntryOffset(held,wave.born+FLOW_ENTRY_DURATION,96,48)).toEqual({x:0,y:0})
    }
  })
  it('has one very broad ribbon whose bends advect from lower left to upper right',()=>{
    expect(FLOW_RIBBON_COUNT).toBe(1)
    for(let age=0;age<12000;age+=100)expect(ribbonColumn(0,0,age).width).toBeGreaterThan(.27)
    for(let band=0;band<FLOW_RIBBON_COUNT;band++){
      const start=ribbonColumn(band,-.33,1000)
      const next=ribbonColumn(band,0,2000)
      expect(next.center-start.center).toBeCloseTo(-.099,6)
      expect(next.width).toBeCloseTo(start.width,6)
      expect(next.strength).toBeCloseTo(start.strength,6)
    }
  })
  it('renders a single wide white core rather than a set of thin lines',()=>{
    const pixels=new Uint8ClampedArray(96*48*4)
    paintRippleField(pixels,96,48,[{...wave,sustained:true,releasedAt:null}],2000)
    const profile:number[]=[]
    for(let y=0;y<48;y++){
      const i=(y*96+48)*4
      profile.push(Math.max(0,(pixels[i+1]-90)/(255-90))*pixels[i+3])
    }
    const peak=Math.max(...profile),core=profile.map(v=>v>=peak*.5)
    let segments=0
    for(let y=0;y<48;y++)if(core[y]&&!core[y-1])segments++
    expect(segments).toBe(1)
    expect(core.filter(Boolean).length).toBeGreaterThanOrEqual(20)
  })
  it('enters without a bright rim spike or a discontinuity at the end',()=>{
    const pixels=new Uint8ClampedArray(96*48*4),previous=new Uint8ClampedArray(pixels.length)
    const target=new Uint8ClampedArray(pixels.length),memory=new Float32Array(pixels.length)
    for(const ny of [-1,1]){
      const held={...wave,nx:0,ny,sustained:true,releasedAt:null}
      previous.fill(0);memory.fill(0)
      let maxJump=0,maxAlpha=0
      for(let age=0;age<=FLOW_ENTRY_DURATION+100;age+=16){
        paintRippleField(target,96,48,[held],wave.born+age)
        blendRipplePixels(pixels,target,memory,16)
        for(let i=0;i<pixels.length;i+=4){
          maxAlpha=Math.max(maxAlpha,pixels[i+3])
          for(const bg of [30,255]){
            const before=(previous[i+1]-bg)*previous[i+3]/255*.58
            const after=(pixels[i+1]-bg)*pixels[i+3]/255*.58
            maxJump=Math.max(maxJump,Math.abs(after-before))
          }
        }
        previous.set(pixels)
      }
      expect(maxAlpha).toBeLessThan(220)
      expect(maxJump).toBeLessThan(14)
    }
  })
  it('keeps flowing light energy stable with visible grey on white and white on dark',()=>{
    const held={...wave,sustained:true,releasedAt:null}
    const pixels=new Uint8ClampedArray(96*48*4),previous=new Uint8ClampedArray(pixels.length)
    const masses:number[]=[]
    let maxJump=0,minWhitePeak=255,minDarkPeak=255,maxAlpha=0
    for(let now=800;now<12000;now+=16){
      paintRippleField(pixels,96,48,[held],now)
      let mass=0,whitePeak=0,darkPeak=0
      for(let i=0;i<pixels.length;i+=4){
        const a=pixels[i+3]/255*.58
        mass+=pixels[i+3];maxAlpha=Math.max(maxAlpha,pixels[i+3])
        whitePeak=Math.max(whitePeak,(255-pixels[i+1])*a)
        darkPeak=Math.max(darkPeak,(pixels[i+1]-30)*a)
        if(now>800)for(const bg of [30,255]){
          const before=(previous[i+1]-bg)*previous[i+3]/255*.58
          maxJump=Math.max(maxJump,Math.abs((pixels[i+1]-bg)*a-before))
        }
      }
      masses.push(mass);previous.set(pixels)
      minWhitePeak=Math.min(minWhitePeak,whitePeak);minDarkPeak=Math.min(minDarkPeak,darkPeak)
    }
    expect(Math.max(...masses)/Math.min(...masses)).toBeLessThan(1.015)
    expect(minWhitePeak).toBeGreaterThan(31)
    expect(minDarkPeak).toBeGreaterThan(45)
    expect(maxJump).toBeLessThan(3.5)
    expect(maxAlpha).toBeLessThan(220)
  })
  it('finishes the same drift in 2 seconds without increasing emission density',()=>{
    expect(RIPPLE_LIFETIME).toBe(2000)
    const a=rippleFrame(wave,600,2)!,b=rippleFrame(wave,1100,2)!
    expect(b.front-a.front).toBeCloseTo(.52*500/2000)
  })
  it('travels, widens and changes curvature instead of translating a fixed texture',()=>{
    const a=rippleFrame(wave,400,2)!,b=rippleFrame(wave,800,2)!
    expect(b.front).toBeGreaterThan(a.front)
    expect(b.width).toBeGreaterThan(a.width)
    expect(b.bend).not.toBe(a.bend)
    expect(rippleSlope(0,0,a)).not.toBe(rippleSlope(0,0,b))
  })
  it('starts and finishes continuously, with a finite lifetime',()=>{
    expect(rippleFrame(wave,100,2)).toBeNull()
    expect(rippleFrame(wave,101,2)!.amplitude).toBeLessThan(.001)
    expect(rippleFrame(wave,100+RIPPLE_LIFETIME-1,2)!.amplitude).toBeLessThan(.001)
    expect(rippleFrame(wave,100+RIPPLE_LIFETIME,2)).toBeNull()
  })
  it('makes internal highlights visible while leaving the shadow faint and localized',()=>{
    const pixels=new Uint8ClampedArray(96*48*4)
    paintRippleField(pixels,96,48,[wave],wave.born+RIPPLE_LIFETIME*(1000/2300))
    let bright=0,dark=0,center=0,maxDelta=0,maxLight=0,maxDark=0,maxRowCoverage=0
    const coverage=new Array(48).fill(0)
    for(let y=0;y<48;y++)for(let x=0;x<96;x++){
      const i=(y*96+x)*4
      if(pixels[i]>150)maxLight=Math.max(maxLight,pixels[i+3]);else maxDark=Math.max(maxDark,pixels[i+3])
      const visible=pixels[i+3]>5
      if(visible){if(pixels[i]>150)bright++;else dark++;if(y>16&&y<32)center++}
      // The stronger silver feather is intentionally more visible. Count
      // >3% effective coverage as the noticeable core, not its faint tail.
      if(pixels[i+3]*.58/255>.03)coverage[y]++
      if(y)for(const background of [30,255]){
        const previous=i-96*4
        const current=(pixels[i+1]-background)*pixels[i+3]/255
        const above=(pixels[previous+1]-background)*pixels[previous+3]/255
        // Colored transparent layers need a composited-luminance bound, not
        // an alpha-only bound that treats silver as equally bright as white.
        maxDelta=Math.max(maxDelta,Math.abs(current-above))
      }
    }
    expect(bright).toBeGreaterThan(100);expect(dark).toBeGreaterThan(100)
    maxRowCoverage=Math.max(...coverage)
    expect(center).toBeGreaterThan(100);expect(maxDelta*.58/255).toBeLessThan(.04)
    expect(maxLight*.58/255).toBeGreaterThan(.08)
    expect(maxLight*.58/255).toBeLessThan(.24)
    expect(maxDark*.58/255).toBeLessThan(.08)
    expect(maxLight).toBeGreaterThan(maxDark)
    expect(maxRowCoverage).toBeLessThan(96*.75)
    expect(bright+dark).toBeLessThan(96*48*.6)
  })
  it('is time-based, bounded with overlap, and clears after disturbances expire',()=>{
    const a=new Uint8ClampedArray(96*48*4),b=new Uint8ClampedArray(a.length)
    const waves=[wave,{...wave,born:200},{...wave,born:300}]
    paintRippleField(a,96,48,waves,800);paintRippleField(b,96,48,waves,800)
    expect(a).toEqual(b)
    for(let i=3;i<a.length;i+=4)expect(a[i]).toBeLessThan(255)
    paintRippleField(a,96,48,waves,301+RIPPLE_LIFETIME)
    for(let i=3;i<a.length;i+=4)expect(a[i]).toBe(0)
  })
  it('has visible local contrast on white and light on dark with the same pixels',()=>{
    const pixels=new Uint8ClampedArray(96*48*4)
    paintRippleField(pixels,96,48,[wave],1000)
    let peakWhiteContrast=0,peakDarkLight=0,visible=0
    for(let i=0;i<pixels.length;i+=4){
      const contrast=(255-pixels[i+1])*pixels[i+3]/255*.58
      peakWhiteContrast=Math.max(peakWhiteContrast,contrast)
      peakDarkLight=Math.max(peakDarkLight,(pixels[i+1]-30)*pixels[i+3]/255*.58)
      if(contrast>5)visible++
    }
    expect(peakWhiteContrast).toBeGreaterThan(10)
    expect(peakWhiteContrast).toBeLessThan(22)
    expect(peakDarkLight).toBeGreaterThan(20)
    expect(visible).toBeGreaterThan(200)
    expect(visible).toBeLessThan(96*48*.5)
  })
  it('does not extinguish a highlight when an opposing wave overlaps it',()=>{
    const a=new Uint8ClampedArray(96*48*4),b=new Uint8ClampedArray(a.length)
    const opposite={...wave,ny:-1,origin:-wave.origin}
    paintRippleField(a,96,48,[wave],900)
    paintRippleField(b,96,48,[wave,opposite],900)
    let before=0,after=0
    for(let i=0;i<a.length;i+=4){
      if(a[i]>150&&a[i+3]>5){
        before+=a[i]*a[i+3];after+=b[i]*b[i+3]
        // A byte of alpha quantization can change premultiplied RGB by 255.
        expect(b[i]*b[i+3]).toBeGreaterThanOrEqual(a[i]*a[i+3]-256)
      }
    }
    expect(after).toBeGreaterThanOrEqual(before*.98)
  })
  it('holds brightness for many lifetimes without a periodic fade or seam',()=>{
    const held={...wave,sustained:true,releasedAt:null}
    for(let now=600;now<15000;now+=16){
      expect(rippleAlive(held,now)).toBe(true)
      expect(rippleFrame(held,now,2)!.amplitude).toBe(wave.amplitude)
      expect(Math.abs(rippleFrame(held,now+16,2)!.front-rippleFrame(held,now,2)!.front)).toBeLessThan(.005)
    }
  })
  it('fades on release and resumes from the same level on quick retouch',()=>{
    const held={...wave,sustained:true,releasedAt:null as number|null,releaseLevel:1,resumeAt:null as number|null,resumeLevel:0}
    held.releaseLevel=rippleEnvelope(held,2000);held.releasedAt=2000
    const fading=rippleEnvelope(held,2300)
    expect(fading).toBeGreaterThan(0);expect(fading).toBeLessThan(1)
    expect(rippleAlive(held,2000+RIPPLE_RELEASE)).toBe(false)
    held.resumeLevel=fading;held.resumeAt=2300;held.releasedAt=null
    expect(rippleEnvelope(held,2300)).toBe(fading)
    expect(rippleEnvelope(held,2540)).toBe(1)
    expect(rippleAlive(held,10000)).toBe(true)
  })
  it('smooths abrupt pixel changes in premultiplied space and finishes fading',()=>{
    const out=new Uint8ClampedArray(4),memory=new Float32Array(4)
    const white=new Uint8ClampedArray([255,255,255,80])
    blendRipplePixels(out,white,memory,16)
    expect(out[3]).toBeGreaterThan(0);expect(out[3]).toBeLessThan(25)
    expect(out[0]).toBe(255)
    blendRipplePixels(out,white,memory,Infinity)
    const before=out[3]
    blendRipplePixels(out,new Uint8ClampedArray(4),memory,16)
    expect(out[3]).toBeGreaterThan(before*.7)
    for(let i=0;i<50;i++)blendRipplePixels(out,new Uint8ClampedArray(4),memory,16)
    expect(out[3]).toBe(0)
  })
})
