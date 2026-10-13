import { paintRippleField, blendRipplePixels, rippleAlive, rippleEnvelope, advanceFlowAge, RIPPLE_CAPACITY } from './glass-ripple-field.js'

/** Optional touch-driven surface light on the selector. One bounded view-layer
 * RAF, a small local canvas; never rebuilds or edits the refraction filters.
 * Set the flag to false and reload to remove the effect independently.
 */
export const GLASS_TOUCH_LIGHT_ENABLED = true

export function createGlassTouchLight(root, initial = {}) {
  const noop = {configure(){},suspend(){},destroy(){}}
  const layer = root.querySelector('.glass-touch-light')
  const sheen = layer?.querySelector('.glass-touch-sheen')
  if (!GLASS_TOUCH_LIGHT_ENABLED || !sheen) return noop
  const doc = root.ownerDocument, win = doc.defaultView
  const canvas=doc.createElement('canvas')
  const context=canvas.getContext('2d')
  if(!context) return noop
  canvas.setAttribute('aria-hidden','true')
  canvas.style.cssText='position:absolute;inset:0;width:100%;height:100%;pointer-events:none'
  sheen.appendChild(canvas)
  const scope = root.closest('.preview-stage') || root.closest('.phone-canvas') || root
  const bar = root.querySelector('.glass-bar')
  const preference = win.matchMedia('(prefers-reduced-motion: reduce), (prefers-reduced-transparency: reduce), (prefers-contrast: more)')
  const listeners = []
  let config = initial, contact = null, disposed = false, frame = 0, lastFrame = 0
  let waves=[],alpha=0,lastAlpha='',imageData=null,drawn=false
  let targetPixels=null,pixelMemory=null
  layer.dataset.effect = 'wide-ribbon-v12'
  const quiet = () => config.touchLight === false || config.reducedMotion || preference.matches || root.dataset.glassTouchLight === 'off'
  const blocked = () => doc.hidden || root.hasAttribute('inert') || root.dataset.navigationHidden === 'true'
  function listen(target,type,fn,options) {
    target.addEventListener(type,fn,options)
    listeners.push(()=>target.removeEventListener(type,fn,options))
  }
  function render() {
    const opacity = alpha.toFixed(4)
    if (opacity !== lastAlpha) { layer.style.opacity = opacity; lastAlpha = opacity }
    const active = alpha > 0 ? 'true' : 'false'
    if (layer.dataset.active !== active) layer.dataset.active = active
  }
  function suspend() {
    win.cancelAnimationFrame(frame); frame = 0; contact = null
    alpha = 0;waves=[]
    pixelMemory?.fill(0);targetPixels?.fill(0)
    if(drawn){context.clearRect(0,0,canvas.width,canvas.height);drawn=false}
    render()
  }
  function initializeBitmap() {
    // Flow coordinates are normalized on both axes. A fixed bitmap scales with
    // CSS; selector resizing cannot erase its history or bypass the smoothing.
    const w=128
    canvas.width=w;canvas.height=48;imageData=context.createImageData(w,48)
    targetPixels=new Uint8ClampedArray(w*48*4);pixelMemory=new Float32Array(w*48*4)
  }
  function tick(now) {
    frame = 0
    if (disposed) return
    if (quiet() || blocked() || root.dataset.navIdle === 'true') { suspend(); return }
    const dt = Math.min(64,Math.max(0,now-lastFrame)); lastFrame = now
    waves=waves.filter(w=>rippleAlive(w,now))
    for(const wave of waves)wave.flowAge=advanceFlowAge(wave.flowAge,dt)
    // Touch event frequency never pulses the whole layer's brightness.
    const wantedAlpha = waves.length ? .58 : 0
    alpha += (wantedAlpha-alpha)*(1-Math.exp(-dt/(wantedAlpha?70:100)))
    if (Math.abs(alpha-wantedAlpha)<.002) alpha=wantedAlpha
    if(imageData&&(waves.length||drawn)){
      if(waves.length)paintRippleField(targetPixels,canvas.width,canvas.height,waves,now)
      else targetPixels.fill(0)
      drawn=blendRipplePixels(imageData.data,targetPixels,pixelMemory,dt)
      context.putImageData(imageData,0,0)
      if(!drawn)pixelMemory.fill(0)
    }
    render()
    if (waves.length || drawn || alpha!==wantedAlpha) frame=win.requestAnimationFrame(tick)
  }
  function request() {
    if (disposed || frame) return
    lastFrame=win.performance.now(); frame=win.requestAnimationFrame(tick)
  }
  function begin(point,source,target) {
    if (disposed || contact || quiet() || blocked()) return
    // A preview embedded in the page owns its own light, not the hidden or
    // separate main navigation's light as well.
    const other=target.closest?.('.preview-lens-root,.liquid-nav')
    if (other && other!==root) return
    const navigation=bar.contains(target)
    const bounds=bar.getBoundingClientRect()
    contact={id:point.id,source,navigation,startX:point.x,startY:point.y,x:point.x,y:point.y,distance:0,origin:Math.max(-.7,Math.min(.7,(point.x-bounds.left)/bounds.width-.5)),moved:false}
    if (navigation) emitWave(0,-1,.95)
  }
  function emitWave(dx,dy,amplitude=.95) {
    const now=win.performance.now()
    waves=waves.filter(w=>rippleAlive(w,now))
    if(contact.wave)return false
    // Resume a fading reflection from its current brightness and phase,
    // rather than restarting a flash on each quick re-touch.
    const recent=waves.at(-1)
    if(recent && recent.releasedAt!=null){
      recent.resumeLevel=rippleEnvelope(recent,now)
      recent.resumeAt=now
      recent.releasedAt=null
      contact.wave=recent;request();return true
    }
    if(waves.length>=RIPPLE_CAPACITY)return false
    const length=Math.hypot(dx,dy)||1
    const wave={born:now,flowAge:0,nx:dx/length,ny:dy/length,origin:contact.origin,amplitude,sustained:true,releasedAt:null}
    waves.push(wave);contact.wave=wave
    request();return true
  }
  function move(point,source) {
    if (!contact || contact.source!==source || contact.id!==point.id) return
    const travelX=point.x-contact.startX,travelY=point.y-contact.startY
    const dx=point.x-contact.x,dy=point.y-contact.y
    contact.x=point.x;contact.y=point.y
    if (!contact.navigation && !contact.moved && Math.max(Math.abs(travelX),Math.abs(travelY))<6) return
    contact.distance+=Math.hypot(dx,dy)
    if(!contact.moved || contact.distance>=48){
      if(emitWave(dx,dy))contact.distance=0
    }
    contact.moved=true
  }
  function finish(id,source) {
    if (!contact || contact.source!==source || (id!==null && contact.id!==id)) return
    // Fade only on release, never periodically while the finger is held.
    if(contact.wave){
      const now=win.performance.now()
      contact.wave.releaseLevel=rippleEnvelope(contact.wave,now)
      contact.wave.releasedAt=now
    }
    contact=null
  }
  const touchPoint=t=>({id:t.identifier,x:t.clientX,y:t.clientY})
  // Native page panning cancels pointer events. Passive touch events continue
  // through that pan; mouse/pen use the pointer path without duplicate input.
  // Capture observes uni scroll-view's events before its propagation stop,
  // without preventing scrolling or changing the gesture owner.
  const touchOptions={passive:true,capture:true}
  listen(scope,'touchstart',event=>{
    if(event.touches.length!==1){suspend();return}
    begin(touchPoint(event.touches[0]),'touch',event.target)
  },touchOptions)
  listen(doc,'touchmove',event=>{
    if (!contact || contact.source!=='touch') return
    if(event.touches.length!==1){suspend();return}
    move(touchPoint(event.touches[0]),'touch')
  },touchOptions)
  const endTouch=event=>{
    for(const point of event.changedTouches)finish(point.identifier,'touch')
    if(event.touches.length===0)finish(null,'touch')
  }
  listen(doc,'touchend',endTouch,touchOptions);listen(doc,'touchcancel',endTouch,touchOptions)
  listen(scope,'pointerdown',event=>{
    if(event.pointerType==='touch'||event.button>0||event.isPrimary===false)return
    begin({id:event.pointerId,x:event.clientX,y:event.clientY},'pointer',event.target)
  },{passive:true})
  listen(doc,'pointermove',event=>move({id:event.pointerId,x:event.clientX,y:event.clientY},'pointer'),{passive:true})
  listen(doc,'pointerup',event=>finish(event.pointerId,'pointer'),{passive:true})
  listen(doc,'pointercancel',event=>finish(event.pointerId,'pointer'),{passive:true})
  listen(win,'blur',suspend)
  listen(doc,'visibilitychange',()=>{if(doc.hidden)suspend()})
  preference.addEventListener?.('change',suspend)
  const observer=new win.MutationObserver(()=>{
    if(quiet()||blocked()||root.dataset.navIdle==='true')suspend()
  })
  observer.observe(root,{attributes:true,attributeFilter:['inert','data-navigation-hidden','data-nav-idle','data-glass-touch-light']})
  initializeBitmap();render()
  return {
    configure(next){const changed=config.navMotion!==next.navMotion;config=next;if(changed||quiet())suspend()},
    suspend,
    destroy(){
      disposed=true;suspend();listeners.forEach(remove=>remove());observer.disconnect()
      canvas.remove()
      preference.removeEventListener?.('change',suspend)
      layer.style.removeProperty('opacity');sheen.style.removeProperty('transform');delete layer.dataset.active;delete layer.dataset.effect
    }
  }
}
