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

// Positions in ninths of one display pixel. With the spectral weights above
// each RGB channel has its own zero centroid, including at a diagonal edge.
const SELECTOR_SUBPIXELS = [[-2,3],[2,0],[-2,-3],[3,0],[-2,3],[-2,-3],[4,0]]

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

export function opticalOffset(x,y,width,height,rim,amount,depthEffect=true,spectralOffset=0,edgeMirror=false,selector=false) {
  const radius=Math.min(width,height)/2, cx=x-width/2, cy=y-height/2
  const segment=Math.max(0,width/2-radius)
  const dx=cx-Math.max(-segment,Math.min(segment,cx)), length=Math.hypot(dx,cy)
  const sd=length-radius
  if((sd>=0&&!selector)||sd<=-rim||!length||rim<=0) return [0,0]
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
  // On the selector the centered glyph sits close to the flat top. Keep
  // the crest there thin and give the sweeping round ends the full lens.
  if(selector) {
    const normalX=dx/length
    const thickness=.31+.69*normalX*normalX
    rim*=thickness
    amount*=thickness
    if(sd<=-rim) return [0,0]
  }
  const inside=Math.max(0,-sd/rim)
  // Pad the map across the silhouette; CSS clips the already-refracted color.
  // The selector rolls off with a finite slope, including at its full crest.
  const bend=selector ? (1-inside)**3 : 1-Math.sqrt(Math.max(0,inside*(2-inside)))
  const d=-amount*bend
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

// Oversample the displacement field only. Each wavelength reads the original
// artwork once, even where the capsule crosses a one-pixel stroke.
/** @param {{pixels: Uint8ClampedArray, from: number, to: number}} [band] Existing destination and half-open range of raster rows. */
export function createOpticalMap(width,height,rim,amount,depthEffect=true,spectralOffset=0,dispersed=true,edgeMirror=false,density=1,selector=false,pixelPitch=0,band) {
  const columns=width*density, rows=height*density
  const pixels=band?.pixels ?? new Uint8ClampedArray(columns*rows*4)
  const scale=opticalMapScale(amount,dispersed,edgeMirror)
  const ray=selector&&dispersed&&pixelPitch>0
    ? SELECTOR_SUBPIXELS[SPECTRAL_SAMPLES.findIndex(sample=>sample.offset===spectralOffset)] : null
  const shiftX=ray ? ray[0]*pixelPitch/9 : 0, shiftY=ray ? ray[1]*pixelPitch/9 : 0
  const coverageMap=selector&&(spectralOffset===1||!dispersed)
  const radius=Math.min(width,height)/2
  const segment=width/2-radius
  const words=new Uint32Array(pixels.buffer)
  // In the straight part of a capsule the mirror ray is independent of x.
  // Selector rays also agree there whenever both samples are inside the rim.
  const flatStart=Math.max(0,Math.ceil((radius+Math.abs(shiftX))*density-.5))
  const flatEnd=Math.min(columns,Math.floor((width-radius-Math.abs(shiftX))*density-.5)+1)
  const endRow=band?.to ?? rows
  for(let y=band?.from ?? 0;y<endRow;y++) {
    const py=(y+.5)/density
    const flatRow=edgeMirror || (radius-Math.abs(py+shiftY-height/2)>=rim &&
      (!coverageMap || radius-Math.abs(py-height/2)>=(pixelPitch||1)))
    for(let x=0;x<columns;x++) {
      if(flatRow && x===flatStart+1 && x<flatEnd) {
        const index=y*columns+x
        words.fill(words[index-1],index,y*columns+flatEnd)
        x=flatEnd-1
        continue
      }
      const px=(x+.5)/density
      let [dx,dy]=opticalOffset(px+shiftX,py+shiftY,width,height,rim,amount,depthEffect,spectralOffset,edgeMirror,selector)
      // Integrate the warped stroke over the destination pixel. A neutral ray
      // must still read the original pixel, including at the center of the tab.
      if(ray && (dx||dy)) {
        const coverage=Math.min(1,Math.hypot(dx,dy)/pixelPitch)
        dx+=shiftX*coverage
        dy+=shiftY*coverage
      }
      const i=(y*columns+x)*4
      pixels[i]=255*(.5+(scale?dx/scale:0)); pixels[i+1]=255*(.5+(scale?dy/scale:0))
      pixels[i+2]=128; pixels[i+3]=255
      if(coverageMap) {
        const endX=Math.max(0,Math.abs(px-width/2)-segment)
        const inset=radius-Math.hypot(endX,py-height/2)
        pixels[i+2]=255*Math.max(0,Math.min(1,inset/(pixelPitch||1)))
      }
    }
  }
  return pixels
}

/** Sum the seven premultiplied colour contributions and average alpha separately. */
export function spectralFilterPrimitives(dispersed=true, selector=false, sharedMirror=false) {
  const output=selector?' result="refracted"':''
  const resolve=selector?`<feColorMatrix in="lens0" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 1 0 0" result="coverage"/>
    <feComposite in="refracted" in2="coverage" operator="in" result="inside"/>
    <feComposite in="SourceGraphic" in2="coverage" operator="out" result="outside"/>
    <feComposite in="inside" in2="outside" operator="arithmetic" k2="1" k3="1"/>`:''
  if(!dispersed) return `<feImage result="lens0" preserveAspectRatio="none"/><feDisplacementMap in="SourceGraphic" in2="lens0" scale="0" xChannelSelector="R" yChannelSelector="G"${output}/>${resolve}`
  let xml=''
  // Every wavelength of the mirrored outer rim has the same displacement.
  const sample = index => `sample${sharedMirror ? 0 : index}`
  SPECTRAL_SAMPLES.forEach(({rgb},i)=>{
    if (!sharedMirror || i===0) xml+=`<feImage result="lens${i}" preserveAspectRatio="none"/><feDisplacementMap in="SourceGraphic" in2="lens${i}" scale="0" xChannelSelector="R" yChannelSelector="G" result="${sample(i)}"/>`
    xml+=`<feColorMatrix in="${sample(i)}" type="matrix" values="${rgb[0]} 0 0 0 0 0 ${rgb[1]} 0 0 0 0 0 ${rgb[2]} 0 0 0 0 0 1 0" result="channel${i}"/>`
    if(i) xml+=`<feComposite in="${i===1?'channel0':`sum${i-1}`}" in2="channel${i}" operator="arithmetic" k2="1" k3="1" result="sum${i}"/>`
  })
  // Over opaque black, premultiplied RGB is unchanged and alpha is one.
  // Subtract black with alpha (1 - meanAlpha) to restore the original alpha
  // without sending the entire colour sum through the filter graph twice.
  xml+='<feFlood flood-color="black" result="black"/><feComposite in="sum6" in2="black" operator="over" result="opaqueSum"/>'
  let mean='sample0'
  if(!sharedMirror) {
    for(let i=1;i<7;i++) {
      xml+=`<feComposite in="${mean}" in2="${sample(i)}" operator="arithmetic" k2="${i/(i+1)}" k3="${1/(i+1)}" result="average${i}"/>`
      mean=`average${i}`
    }
  }
  xml+=`<feColorMatrix in="${mean}" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1 1" result="missingAlpha"/><feComposite in="opaqueSum" in2="missingAlpha" operator="arithmetic" k2="1" k3="-1"${output}/>`
  return xml+resolve
}
