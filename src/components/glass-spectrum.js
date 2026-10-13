/* Copyright 2025 Kyant. Apache-2.0; see static/licenses/AndroidLiquidGlass-LICENSE.txt.
 * Web/SVG port of RoundedRectRefractionWithDispersionShaderString and Lens.kt.
 * Seven spectral samples, original channel weights, inward refraction sign and
 * normalized SDF + radial depth direction. The optional edge fold below is a
 * separate geometric mirror, not the original shader. Maps use 8-bit precision. */
export const SPECTRAL_SAMPLES = [
  {offset:1, rgb:[2/7,0,0]},
  {offset:2/3, rgb:[2/7,1/7,0]},
  {offset:1/3, rgb:[2/7,2/7,0]},
  {offset:0, rgb:[0,2/7,0]},
  {offset:-1/3, rgb:[0,2/7,1/3]},
  {offset:-2/3, rgb:[0,0,1/3]},
  {offset:-1, rgb:[1/7,0,1/3]}
]

export function mirrorFoldWidth(rim,amount) {
  if(rim<=0||amount<=0) return 0
  // Fixed 7 CSS-pixel face, clamped only for very small controls.
  return Math.min(rim,amount,7)
}

export const MIRROR_BASE_COMPRESSION = .25
export const MIRROR_VERTICAL_COMPRESSION = .58
export const MIRROR_JOIN_WIDTH = 1
export const MIRROR_TURN_RADIUS = .75

// Round only the fold itself, not the whole reflected face. A smooth reversal
// must cross zero slope, so keep that region subpixel on each side rather than
// spreading it over the optical rim (which would smear letters into a band).
export function mirrorFoldProfile(inside,fold) {
  const z=fold-inside,turn=Math.min(MIRROR_TURN_RADIUS,fold/4)
  if(fold<=0||z<=-turn) return [0,0]
  const rounded=Math.abs(z)<turn?(z*z+turn*turn)/(2*turn):Math.abs(z)
  const distance=Math.max(0,z-turn),joinWidth=Math.min(MIRROR_JOIN_WIDTH,fold/2)
  const compression=MIRROR_BASE_COMPRESSION*(distance+joinWidth*Math.expm1(-distance/joinWidth))+MIRROR_VERTICAL_COMPRESSION*distance**3/(fold*fold)
  return [z+rounded,compression]
}

export function opticalMapScale(amount,dispersed=true,edgeMirror=false) {
  // Reserve the extra vertical travel without increasing raster size/passes.
  return 2*amount*(edgeMirror?2+MIRROR_BASE_COMPRESSION+MIRROR_VERTICAL_COMPRESSION:dispersed?2:1)
}

export function opticalOffset(x,y,width,height,rim,amount,depthEffect=true,spectralOffset=0,edgeMirror=false) {
  const radius=Math.min(width,height)/2, cx=x-width/2, cy=y-height/2
  const segment=Math.max(0,width/2-radius)
  const dx=cx-Math.max(-segment,Math.min(segment,cx)), length=Math.hypot(dx,cy)
  const sd=length-radius
  if(sd>=0||sd<=-rim||!length||rim<=0) return [0,0]
  if(edgeMirror) {
    const fold=mirrorFoldWidth(rim,amount)
    const [displacement,compression]=mirrorFoldProfile(-sd,fold)
    if(!displacement) return [0,0]
    const nx=dx/length,ny=cy/length
    // Video-guided approximation: strongly compressed outer rim, fuller inner
    // face, and a 1.5px-wide rounded turn instead of the former sharp V fold.
    // One background sample per channel: no alpha-doubled image or blur veil.
    // Additional compression is Y-only, fading around the curved end caps.
    // Independently shifted colors or a radial tilt would shear the joined
    // copies. All samples align here; the selector retains reference refraction.
    return [-displacement*nx,-displacement*ny-compression*ny**3]
  }
  const t=1+sd/rim
  const d=-amount*(1-Math.sqrt(Math.max(0,1-t*t)))
  let gx=dx/length, gy=cy/length
  if(depthEffect) {
    const radial=Math.hypot(cx,cy)
    if(radial) { gx+=cx/radial; gy+=cy/radial }
    const norm=Math.hypot(gx,gy)
    if(norm) { gx/=norm; gy/=norm }
  }
  // Exactly the position-dependent dispersion in the reference shader.
  const dispersion=(cx*cy)/((width/2)*(height/2))
  const factor=1+spectralOffset*dispersion
  return [d*gx*factor,d*gy*factor]
}

export function createOpticalMap(width,height,rim,amount,depthEffect=true,spectralOffset=0,dispersed=true,edgeMirror=false) {
  const pixels=new Uint8ClampedArray(width*height*4)
  const scale=opticalMapScale(amount,dispersed,edgeMirror)
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const [dx,dy]=opticalOffset(x+.5,y+.5,width,height,rim,amount,depthEffect,spectralOffset,edgeMirror)
    const i=(y*width+x)*4
    pixels[i]=255*(.5+(scale?dx/scale:0)); pixels[i+1]=255*(.5+(scale?dy/scale:0))
    pixels[i+2]=128; pixels[i+3]=255
  }
  return pixels
}

/** Weighted RGB sum and independently averaged alpha, not tinted overlays.
 * Contributions retain source alpha while summing, then subtract only the
 * excess alpha. This avoids premultiplication darkening of seven 1/7 layers. */
export function spectralFilterPrimitives(dispersed=true) {
  if(!dispersed) return '<feImage result="lens0" preserveAspectRatio="none"/><feDisplacementMap in="SourceGraphic" in2="lens0" scale="0" xChannelSelector="R" yChannelSelector="G"/>'
  let xml=''
  SPECTRAL_SAMPLES.forEach(({rgb},i)=>{
    xml+=`<feImage result="lens${i}" preserveAspectRatio="none"/><feDisplacementMap in="SourceGraphic" in2="lens${i}" scale="0" xChannelSelector="R" yChannelSelector="G" result="sample${i}"/>`
    xml+=`<feColorMatrix in="sample${i}" type="matrix" values="${rgb[0]} 0 0 0 0 0 ${rgb[1]} 0 0 0 0 0 ${rgb[2]} 0 0 0 0 0 1 0" result="channel${i}"/>`
    if(i) xml+=`<feComposite in="${i===1?'channel0':`sum${i-1}`}" in2="channel${i}" operator="arithmetic" k2="1" k3="1" result="sum${i}"/>`
  })
  for(let i=1;i<7;i++) xml+=`<feComposite in="${i===1?'sample0':`average${i-1}`}" in2="sample${i}" operator="arithmetic" k2="${i/(i+1)}" k3="${1/(i+1)}" result="average${i}"/>`
  const alphaOnly='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0'
  xml+=`<feColorMatrix in="average6" values="${alphaOnly}" result="averageAlpha"/><feColorMatrix in="sum6" values="${alphaOnly}" result="sumAlpha"/><feComposite in="sumAlpha" in2="averageAlpha" operator="arithmetic" k2="1" k3="-1" result="excessAlpha"/><feComposite in="sum6" in2="excessAlpha" operator="arithmetic" k2="1" k3="-1"/>`
  return xml
}
