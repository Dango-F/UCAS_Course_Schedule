// Local drifting wisps: softly curved, short and staggered, not a sweeping bar.
// Coordinates are in selector heights; pixels are shaded from the local slope.
export const RIPPLE_LIFETIME = 2000
export const RIPPLE_INTERVAL = 1100
export const RIPPLE_CAPACITY = 2
export const RIPPLE_RELEASE = 840
const smooth = x=>x*x*(3-2*x)

export function rippleEnvelope(wave,now) {
  if(wave.releasedAt!=null){
    const t=Math.max(0,1-(now-wave.releasedAt)/RIPPLE_RELEASE)
    return (wave.releaseLevel??1)*smooth(Math.min(1,t))
  }
  if(wave.resumeAt!=null){
    const t=Math.max(0,Math.min(1,(now-wave.resumeAt)/240))
    return wave.resumeLevel+(1-wave.resumeLevel)*smooth(t)
  }
  return smooth(Math.max(0,Math.min(1,(now-wave.born)/(RIPPLE_LIFETIME*.22))))
}

export function rippleAlive(wave, now) {
  return wave.sustained
    ? wave.releasedAt == null || now-wave.releasedAt<RIPPLE_RELEASE
    : now-wave.born<RIPPLE_LIFETIME
}

export function rippleFrame(wave, now, aspect) {
  const age = now-wave.born
  if(age<=0 || !rippleAlive(wave,now))return null
  // A held reflection drifts continuously, without periodic birth/death or a
  // modulo seam. Reverse smoothly at the ends, keeping its brightness stable.
  const t = wave.sustained
    ? .18+.64*(.5-.5*Math.cos(age*Math.PI/RIPPLE_LIFETIME))
    : age/RIPPLE_LIFETIME
  const extent = (Math.abs(wave.nx)*aspect+Math.abs(wave.ny))/2
  const enter = Math.min(1,age/(RIPPLE_LIFETIME*.22))
  const leave = Math.min(1,(1-t)/.42)
  return {
    ...wave,
    // A small drift within the glass, not a front scanning edge to edge.
    front:-Math.min(.38,extent*.6)+.52*t,
    origin:wave.origin+.12*Math.sin(t*Math.PI),
    width:.18+.07*t,
    bend:.23+.08*Math.sin(t*Math.PI),
    curl:.10*Math.sin(t*Math.PI*1.5),
    amplitude:wave.amplitude*(wave.sustained?rippleEnvelope(wave,now):smooth(enter)*smooth(leave))
  }
}

export function rippleSlope(x,y,wave) {
  const tangent=-x*wave.ny+y*wave.nx-wave.origin
  const normal=x*wave.nx+y*wave.ny-wave.front
  const distance=normal-wave.bend*tangent*tangent-wave.curl*tangent
  const u=distance/wave.width
  // Localized feathered ends prevent a single contour spanning the selector.
  const primary=-u*Math.exp(-.5*u*u-7.5*tangent*tangent)
  const side=tangent+.52
  const v=(normal+.18-wave.bend*side*side+wave.curl*side)/(wave.width*.85)
  const secondary=-v*Math.exp(-.5*v*v-9.5*side*side)
  return (primary*.72+secondary*.28)*wave.amplitude
}

export function paintRippleField(pixels,width,height,waves,now) {
  const held=waves.find(w=>w.sustained&&rippleAlive(w,now))
  if(held)return paintFlowField(pixels,width,height,held,now)
  const frames=waves.map(w=>rippleFrame(w,now,width/height)).filter(Boolean)
  let i=0
  for(let row=0;row<height;row++) {
    const y=(row+.5)/height-.5
    for(let col=0;col<width;col++,i+=4) {
      const x=(col+.5-width/2)/height
      let positive=0,negative=0
      for(const wave of frames){
        const slope=rippleSlope(x,y,wave)
        // Reversal must not algebraically cancel an existing visible highlight.
        // Max blending also avoids a brightness surge when wisps overlap.
        positive=Math.max(positive,slope);negative=Math.max(negative,-slope)
      }
      const white=positive/(1+positive*1.2)*.90
      const dark=negative/(1+negative*1.2)*.28
      // One fixed material for every backdrop: a soft silver surround makes
      // white light legible on white, without a whole-face mask or tone switch.
      const silver=.20*(1-Math.exp(-5*positive))
      const baseAlpha=silver+dark*(1-silver)
      const alpha=white+baseAlpha*(1-white)
      const shadow=dark*(1-silver),remaining=1-white
      pixels[i]=alpha?(255*white+(104*silver+54*shadow)*remaining)/alpha:0
      pixels[i+1]=alpha?(255*white+(116*silver+63*shadow)*remaining)/alpha:0
      pixels[i+2]=alpha?(255*white+(130*silver+73*shadow)*remaining)/alpha:0
      pixels[i+3]=Math.round(255*alpha)
    }
  }
  return frames.length
}

const flowBuffers=new WeakMap()
export const FLOW_BAND_WIDTH = 1.04
export const FLOW_ENTRY_DURATION = 680
// Do not jump the reflection across the face after a main-thread stall. The
// release envelope still uses wall time, so hidden/released effects can finish.
export function advanceFlowAge(age,dt) {
  return age+Math.max(0,Math.min(48,dt))
}
// Entry is a single spatial passage, not another light emission. Rapid re-touch
// keeps the original born time, so it never restarts this passage.
export function flowEntryOffset(wave,now,width,height) {
  const t=Math.max(0,Math.min(1,(wave.flowAge??(now-wave.born))/FLOW_ENTRY_DURATION))
  const remaining=1-smooth(t)
  if(!remaining)return {x:0,y:0}
  return {x:-width*.62*remaining,y:height*.60*remaining}
}
// One very broad open ribbon, not a bundle of narrow stripes. Its phase follows
// bottom-left -> top-right diagonal, independent of touch direction.
const RIBBONS=[
  {offset:-.06,width:.32,bend:.088,frequency:3.1,phase:2.0,strength:1}
]
export const FLOW_RIBBON_COUNT=RIBBONS.length
export function ribbonColumn(index,x,age) {
  const ribbon=RIBBONS[index]
  // A 10% quicker drift; entry, release and brightness clocks stay unchanged.
  const travel=age/1000*.33
  const u=x-travel
  const phase=u*ribbon.frequency+ribbon.phase
  return {
    center:-.30*x+ribbon.offset+ribbon.bend*Math.sin(phase)+.025*Math.sin(phase*1.7+.8),
    width:ribbon.width*(1+.13*Math.sin(phase*.73+index)),
    strength:ribbon.strength*(.78+.22*Math.cos(phase*.61+index*.9))
  }
}

// Samples of exp(-z²) at a uniform spacing form a sequence whose successive
// ratios have a constant ratio. Re-seed every 16 rows to bound roundoff.
function seedGaussian(sequence, index, z, step) {
  sequence[index] = Math.exp(-z*z)
  sequence[index+1] = Math.exp(-2*z*step-step*step)
  sequence[index+2] = Math.exp(-2*step*step)
}
function nextGaussian(sequence, index) {
  const value = sequence[index]
  sequence[index] *= sequence[index+1]
  sequence[index+1] *= sequence[index+2]
  return value
}

function paintFlowField(pixels,width,height,wave,now) {
  const stride=(width+2)*2
  let buffers=flowBuffers.get(pixels)
  if(!buffers||buffers.width!==width||buffers.height!==height){
    const rowY=Float64Array.from({length:height},(_,row)=>(row+.5)/height-.5)
    buffers={
      width,height,rowY,
      feather:rowY.map(y=>smooth(Math.min(1,(.5-Math.abs(y))/.10))),
      // A one-pixel transparent border supplies all four bilinear taps at the rim.
      field:new Float32Array(stride*(height+2)),
      columns:new Float32Array(width*FLOW_RIBBON_COUNT*3),
      gaussian:new Float64Array(width*FLOW_RIBBON_COUNT*6),
      sampleX:new Int32Array(width),weightX:new Float64Array(width)
    }
    flowBuffers.set(pixels,buffers)
  }
  const {field,columns,gaussian,sampleX,weightX}=buffers
  const age=Math.max(0,wave.flowAge??(now-wave.born))
  const entry=flowEntryOffset(wave,now,width,height)
  const entering=age<FLOW_ENTRY_DURATION
  for(let col=0;col<width;col++){
    const x=(col+.5)/width*2-1
    for(let band=0;band<FLOW_RIBBON_COUNT;band++){
      const ribbon=ribbonColumn(band,x,age),j=(col*FLOW_RIBBON_COUNT+band)*3
      columns[j]=ribbon.center;columns[j+1]=ribbon.width;columns[j+2]=ribbon.strength
    }
  }
  let lightSum=0,shadeSum=0
  for(let row=0;row<height;row++){
    const y=buffers.rowY[row],feather=buffers.feather[row]
    let index=(row+1)*stride+2
    for(let col=0;col<width;col++,index+=2){
      let light=0,shade=0
      for(let band=0;band<FLOW_RIBBON_COUNT;band++){
        const j=(col*FLOW_RIBBON_COUNT+band)*3,center=columns[j],spread=columns[j+1]*FLOW_BAND_WIDTH,strength=columns[j+2]
        const k=j*2
        if ((row & 15)===0) {
          seedGaussian(gaussian,k,(y-center)/spread,1/(height*spread))
          seedGaussian(gaussian,k+3,(y-center-spread*.85)/(spread*.90),1/(height*spread*.90))
        }
        light+=strength*nextGaussian(gaussian,k)
        shade+=strength*nextGaussian(gaussian,k+3)
      }
      light*=feather; shade*=feather
      // The field is Float32. If accumulated double-precision roundoff could
      // cross a rounding midpoint, evaluate that pixel directly.
      if (Math.fround(light*(1-1e-11))!==Math.fround(light*(1+1e-11)) ||
          Math.fround(shade*(1-1e-11))!==Math.fround(shade*(1+1e-11))) {
        light=0; shade=0
        for (let band=0;band<FLOW_RIBBON_COUNT;band++) {
          const j=(col*FLOW_RIBBON_COUNT+band)*3,center=columns[j],spread=columns[j+1]*FLOW_BAND_WIDTH,strength=columns[j+2]
          light+=strength*Math.exp(-Math.pow((y-center)/spread,2))
          shade+=strength*Math.exp(-Math.pow((y-center-spread*.85)/(spread*.90),2))
        }
        light*=feather; shade*=feather
      }
      field[index]=light;field[index+1]=shade
      lightSum+=field[index];shadeSum+=field[index+1]
    }
  }
  // Stable integrated energy prevents apparent whole-face flicker when the
  // curved crest changes shape. Normalization is spatial, not background based.
  const envelope=rippleEnvelope(wave,now)*wave.amplitude/.95
  // Normalize the complete field BEFORE clipping its entering portion. Otherwise
  // a thin sliver at the rim would be boosted to the full face's brightness.
  // Match light energy to the small width reduction so normalization does not
  // concentrate the accepted reflection into a brighter, narrower crest.
  const widthEnergy=FLOW_BAND_WIDTH/1.06
  const lightScale=width*height*.19*widthEnergy/Math.max(lightSum,1)*envelope
  const shadeScale=width*height*.135*widthEnergy/Math.max(shadeSum,1)*envelope
  const firstX=Math.max(0,Math.floor(entry.x)), endX=Math.min(width,Math.ceil(width+entry.x))
  const firstY=Math.max(0,Math.floor(entry.y)), endY=Math.min(height,Math.ceil(height+entry.y))
  if(entering){
    pixels.fill(0)
    for(let x=firstX;x<endX;x++){
      const sample=x-entry.x,left=Math.floor(sample)
      sampleX[x]=(left+1)*2
      weightX[x]=sample-left
    }
  }
  for(let y=firstY;y<endY;y++){
    const sample=y-entry.y,top=Math.floor(sample),dy=sample-top
    const line=(top+1)*stride
    let i=(y*width+firstX)*4
    for(let x=firstX;x<endX;x++,i+=4){
      let light,shade
      if(entering){
        const j=line+sampleX[x],k=j+stride,dx=weightX[x]
        // Preserve the four products and their order, including at fractional coordinates.
        light=field[j]*(1-dx)*(1-dy)+field[j+2]*dx*(1-dy)+field[k]*(1-dx)*dy+field[k+2]*dx*dy
        shade=field[j+1]*(1-dx)*(1-dy)+field[j+3]*dx*(1-dy)+field[k+1]*(1-dx)*dy+field[k+3]*dx*dy
      }else{
        const j=line+(x+1)*2
        light=field[j];shade=field[j+1]
      }
      const white=light*lightScale,grey=shade*shadeScale,alpha=white+grey
      pixels[i]=alpha?(255*white+82*grey)/alpha:0
      pixels[i+1]=alpha?(255*white+90*grey)/alpha:0
      pixels[i+2]=alpha?(255*white+100*grey)/alpha:0
      pixels[i+3]=Math.round(255*alpha)
    }
  }
  return 1
}

// Premultiplied temporal blending prevents a changing light/shadow sign from
// interpolating opaque RGB through black. Memory is reused, never read back.
export function blendRipplePixels(output,target,memory,dt) {
  const blend=1-Math.exp(-Math.max(0,dt)/65)
  let visible=false
  for(let i=0;i<target.length;i+=4){
    const a=target[i+3]/255
    memory[i]+=(target[i]*a-memory[i])*blend
    memory[i+1]+=(target[i+1]*a-memory[i+1])*blend
    memory[i+2]+=(target[i+2]*a-memory[i+2])*blend
    memory[i+3]+=(a-memory[i+3])*blend
    const alpha=memory[i+3]
    output[i+3]=Math.round(alpha*255)
    if(output[i+3]){
      visible=true
      output[i]=Math.round(memory[i]/alpha)
      output[i+1]=Math.round(memory[i+1]/alpha)
      output[i+2]=Math.round(memory[i+2]/alpha)
    }else output[i]=output[i+1]=output[i+2]=0
  }
  return visible
}
