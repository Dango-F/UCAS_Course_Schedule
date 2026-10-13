/** Optional, view-layer backdrop contrast. Remove its one lens hook to disable.
 * This estimates painted backgrounds, not compositor pixels or screenshots.
 * Solid colours and readable images are supported; unknown media fails closed.
 */
export const ADAPTIVE_GLASS_ENABLED = true
export const ADAPTIVE_SAMPLE_INTERVAL = 160

const clamp = (x,min=0,max=1) => Math.max(min,Math.min(max,x))
export function parseBackdropColor(value) {
  const match = /^rgba?\(([^)]+)\)$/.exec(value || '')
  if (!match) return null
  const parts = match[1].replace(/[,/]/g,' ').trim().split(/\s+/)
  if (parts.length < 3) return null
  const rgb = parts.slice(0,3).map(s => clamp(parseFloat(s)/(s.endsWith('%')?100:255)))
  const alpha = parts[3] === undefined ? 1 : clamp(parseFloat(parts[3])/(parts[3].endsWith('%')?100:1))
  return [...rgb,alpha].every(Number.isFinite) ? [...rgb,alpha] : null
}
export function backdropLuminance(rgb) {
  const linear = rgb.slice(0,3).map(v => v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
  return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722
}
export function nextBackdropTone(previous,luminance) {
  if (!Number.isFinite(luminance)) return previous || 'light'
  // Hysteresis prevents repeated flips around mid-grey; background, not text,
  // determines contrast. Do not follow the device's colour-scheme setting.
  return luminance < (previous==='dark'?.24:.17) ? 'dark' : 'light'
}
export function compositeBackdrop(front,back) {
  const a=front[3]+back[3]*(1-front[3])
  if (!a) return [0,0,0,0]
  return [0,1,2].map(i=>(front[i]*front[3]+back[i]*back[3]*(1-front[3]))/a).concat(a)
}
export function imageBackdropUV(x,y,box,iw,ih,fit='fill',position='50% 50%') {
  if (!(box.width>0&&box.height>0&&iw>0&&ih>0)) return null
  let w=box.width,h=box.height
  if (fit!=='fill') {
    let scale=fit==='cover'?Math.max(w/iw,h/ih):Math.min(w/iw,h/ih)
    if (fit==='none') scale=1
    if (fit==='scale-down') scale=Math.min(1,scale)
    w=iw*scale;h=ih*scale
  }
  const parts=position.trim().split(/\s+/)
  const alignment=(s,space)=>s?.endsWith('%')?parseFloat(s)/100*space:s?.endsWith('px')?parseFloat(s):space/2
  const u=(x-box.left-alignment(parts[0],box.width-w))/w
  const v=(y-box.top-alignment(parts[1]||parts[0],box.height-h))/h
  return u>=0&&u<=1&&v>=0&&v<=1?[u,v]:null
}

export function createGlassBackdropAdaptation(root) {
  const noop={refresh(){},destroy(){}}
  const doc=root.ownerDocument,win=doc.defaultView
  if (!ADAPTIVE_GLASS_ENABLED||!doc.elementsFromPoint||!win.MutationObserver||!win.CSS?.supports('backdrop-filter','blur(1px)')) return noop
  const scope=root.closest('.preview-stage')||root.closest('.phone-canvas')||doc.body
  const surface=root.querySelector('.glass-surface')
  if(!surface)return noop
  const solid=win.matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more)')
  let timer=0,last=-Infinity,disposed=false,checks=0,reads=0
  const listeners=[],images=new Map(),ownedImages=new Set()
  function cacheImage(key,entry) {
    images.set(key,entry)
    if(images.size>64){
      const oldest=images.keys().next().value,evicted=images.get(oldest).img
      images.delete(oldest)
      if(ownedImages.delete(evicted)){evicted.onload=null;evicted.onerror=null}
    }
  }
  const listen=(target,type,fn,options)=>{target.addEventListener(type,fn,options);listeners.push(()=>target.removeEventListener(type,fn,options))}
  const hidden=()=>doc.hidden||root.dataset.navigationHidden==='true'||root.dataset.navIdle==='true'||root.hasAttribute('inert')
  const set=(el,key,value)=>{if(el.dataset[key]!==value)el.dataset[key]=value}
  function reset() {
    delete root.dataset.glassBackdropTone
    root.querySelectorAll('.nav-item').forEach(el=>delete el.dataset.glassBackdropTone)
  }
  function schedule() {
    if(disposed||timer||doc.hidden) return
    timer=win.setTimeout(measure,Math.max(0,ADAPTIVE_SAMPLE_INTERVAL-(win.performance.now()-last)))
  }
  function imagePixels(img,key) {
    const cached=images.get(key)
    if(cached?.pixels!==undefined) return cached.pixels
    if(!img.complete||!img.naturalWidth) return null
    let pixels=null
    try {
      const canvas=doc.createElement('canvas');canvas.width=canvas.height=64
      const ctx=canvas.getContext('2d',{willReadFrequently:true})
      ctx.drawImage(img,0,0,64,64)
      pixels=ctx.getImageData(0,0,64,64).data;reads++
    } catch { /* CORS/security: never proxy, screenshot or change crossorigin. */ }
    cacheImage(key,{img,pixels})
    return pixels
  }
  function imageAt(el,style,box,x,y) {
    // These surfaces do not expose their current painted pixels through DOM
    // styles. Preserve the last known tone rather than inventing a colour.
    if(['CANVAS','VIDEO','IFRAME','svg'].includes(el.tagName)||el.ownerSVGElement) return {unknown:true}
    let img=el.tagName==='IMG'?el:el.tagName==='UNI-IMAGE'?el.querySelector('img'):null
    let fit=style.objectFit||'fill',position=style.objectPosition||'50% 50%'
    if(!img&&style.backgroundImage?.startsWith('url(')) {
      // Restrict new decoding requests to same-origin/local assets. Already
      // loaded <img> with CORS permission can still be read below.
      const match=/^url\(["']?(.*?)["']?\)$/.exec(style.backgroundImage)
      if(!match)return {unknown:true}
      const url=new URL(match[1],doc.baseURI)
      if(!['data:','blob:'].includes(url.protocol)&&url.origin!==win.location.origin) return {unknown:true}
      const key=url.href,cached=images.get(key)
      img=cached?.img
      if(!img){img=new win.Image();ownedImages.add(img);cacheImage(key,{img});img.onload=schedule;img.onerror=()=>{cacheImage(key,{img,pixels:null})};img.src=key}
      if(!['cover','contain','100% 100%'].includes(style.backgroundSize)) return {unknown:true}
      fit=style.backgroundSize==='100% 100%'?'fill':style.backgroundSize;position=style.backgroundPosition
    } else if(!img&&style.backgroundImage&&style.backgroundImage!=='none') return {unknown:true}
    if(!img) return null
    if(el.tagName==='UNI-IMAGE'){
      const mode=el.getAttribute('mode')||'scaleToFill'
      fit=mode==='aspectFill'?'cover':mode==='aspectFit'?'contain':'fill'
    }
    const key=img.currentSrc||img.src
    const pixels=imagePixels(img,key)
    if(!pixels) return {unknown:true}
    const uv=imageBackdropUV(x,y,box,img.naturalWidth,img.naturalHeight,fit,position)
    if(!uv)return null
    const i=(Math.min(63,Math.floor(uv[1]*64))*64+Math.min(63,Math.floor(uv[0]*64)))*4
    return {color:[pixels[i]/255,pixels[i+1]/255,pixels[i+2]/255,pixels[i+3]/255]}
  }
  function measure() {
    timer=0
    if(disposed)return
    last=win.performance.now()
    if(solid.matches||root.dataset.glassAdaptive==='off'){reset();return}
    if(hidden())return
    const box=surface.getBoundingClientRect()
    if(box.width<=0||box.height<=0||box.bottom<0||box.top>win.innerHeight)return
    const items=[...root.querySelectorAll('.nav-item')]
    const styles=new Map(),rects=new Map()
    const styleOf=el=>{if(!styles.has(el))styles.set(el,win.getComputedStyle(el));return styles.get(el)}
    const rectOf=el=>{if(!rects.has(el))rects.set(el,el.getBoundingClientRect());return rects.get(el)}
    const sample=(x,y)=>{
      let result=[0,0,0,0],visited=new Set()
      const stack=doc.elementsFromPoint(x,y)
      for(const el of stack.slice(0,40)){
        if(root.contains(el)||el.closest('.liquid-nav,.preview-lens-root')||visited.has(el))continue
        visited.add(el)
        const style=styleOf(el)
        if(style.visibility==='hidden'||style.display==='none'||Number(style.opacity)===0)continue
        // Group opacity and transformed/filtered media are only approximations.
        const opacity=clamp(Number(style.opacity)),rect=rectOf(el)
        if(x<rect.left||x>rect.right||y<rect.top||y>rect.bottom)continue
        const media=imageAt(el,style,rect,x,y)
        if(media?.unknown&&result[3]<.95)return null
        if(media?.color)result=compositeBackdrop(result,[...media.color.slice(0,3),media.color[3]*opacity])
        const bg=parseBackdropColor(style.backgroundColor)
        if(bg)result=compositeBackdrop(result,[...bg.slice(0,3),bg[3]*opacity])
        if(result[3]>.98)break
      }
      return backdropLuminance(compositeBackdrop(result,[1,1,1,1]))
    }
    const all=[]
    // Three points per item, inset from distorted edges; ignore glyph colour.
    items.forEach((item,index)=>{
      const values=[]
      for(const [dx,dy] of [[.32,.35],[.68,.35],[.5,.72]]){
        const x=box.left+box.width*(index+dx)/items.length,y=box.top+box.height*dy
        const value=sample(x,y);if(value!==null)values.push(value)
      }
      if(values.length>=2){const l=values.reduce((a,b)=>a+b,0)/values.length;all.push(l);set(item,'glassBackdropTone',nextBackdropTone(item.dataset.glassBackdropTone,l))}
    })
    if(all.length>=Math.ceil(items.length/2))set(root,'glassBackdropTone',nextBackdropTone(root.dataset.glassBackdropTone,all.reduce((a,b)=>a+b,0)/all.length))
    checks++
  }
  const observer=new win.MutationObserver(records=>{
    if(records.some(r=>!root.contains(r.target)&&!r.target.closest?.('.liquid-nav,.preview-lens-root')))schedule()
  })
  observer.observe(scope,{subtree:true,childList:true,attributes:true,attributeFilter:['style','class','src','srcset']})
  const stateObserver=new win.MutationObserver(schedule)
  stateObserver.observe(root,{attributes:true,attributeFilter:['data-navigation-hidden','data-nav-idle','inert','data-glass-adaptive']})
  const resize=win.ResizeObserver?new win.ResizeObserver(schedule):null
  resize?.observe(surface)
  listen(scope,'scroll',schedule,{capture:true,passive:true})
  listen(scope,'load',schedule,{capture:true,passive:true})
  listen(scope,'transitionend',schedule,{capture:true,passive:true})
  listen(win,'resize',schedule,{passive:true})
  listen(doc,'visibilitychange',()=>{if(doc.hidden){win.clearTimeout(timer);timer=0}else schedule()})
  solid.addEventListener?.('change',schedule)
  // Unknown/complex paint initially keeps the original light material.
  set(root,'glassBackdropTone','light')
  root.querySelectorAll('.nav-item').forEach(el=>set(el,'glassBackdropTone','light'))
  schedule()
  return {
    refresh:schedule,
    // Counts are read on demand for regression checks, never written per frame.
    stats:()=>({checks,imageReads:reads,cachedImages:images.size,pending:Boolean(timer)}),
    destroy(){
      disposed=true;win.clearTimeout(timer);observer.disconnect();stateObserver.disconnect();resize?.disconnect()
      listeners.forEach(remove=>remove());solid.removeEventListener?.('change',schedule)
      ownedImages.forEach(img=>{img.onload=null;img.onerror=null});ownedImages.clear();images.clear();reset()
    }
  }
}
