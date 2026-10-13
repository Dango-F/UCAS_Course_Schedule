/** Scroll intent only: horizontal week rebasing must not reveal navigation. */
export function createNavigationVisibility(root, suspend, initialMode = 'fixed') {
  const doc=root.ownerDocument, win=doc.defaultView, canvas=root.closest('.phone-canvas')
  const bar=root.querySelector('.glass-bar'), wake=root.querySelector('.glass-wake')
  let timer=0, gesture=null, held=false, lastVertical=-Infinity, disposed=false
  let automatic=initialMode==='auto'
  const listeners=[], positions=new WeakMap()
  const blocked=()=>root.hasAttribute('inert')||root.dataset.navigationHidden==='true'||doc.hidden
  const now=()=>win.performance.now()
  function listen(target,type,handler,options) { target.addEventListener(type,handler,options);listeners.push(()=>target.removeEventListener(type,handler,options)) }
  function hide() {
    win.clearTimeout(timer)
    if(!automatic||root.dataset.navIdle==='true'||held||(bar.contains(doc.activeElement)&&doc.activeElement.matches(':focus-visible'))) return
    root.dataset.navIdle='true';bar.inert=true;bar.setAttribute('aria-hidden','true');suspend()
  }
  function schedule() { win.clearTimeout(timer);if(!disposed&&automatic&&!blocked()) timer=win.setTimeout(hide,1200) }
  function show() {
    if(disposed||blocked()) return
    if(root.dataset.navIdle!=='false') {root.dataset.navIdle='false';bar.inert=false;bar.setAttribute('aria-hidden','false')}
    schedule()
  }
  listen(wake,'click',e=>{show();if(e.detail===0) bar.querySelector('[aria-current="page"]')?.focus({preventScroll:true})})
  listen(canvas,'pointerdown',e=>{
    if(!automatic||e.isPrimary===false) return
    gesture={id:e.pointerId,x:e.clientX,y:e.clientY,axis:null}
    held=bar.contains(e.target)
    if(held) show()
  },{passive:true})
  listen(doc,'pointermove',e=>{
    if(!gesture||gesture.id!==e.pointerId||held) return
    const dx=Math.abs(e.clientX-gesture.x),dy=Math.abs(e.clientY-gesture.y)
    if(!gesture.axis&&Math.max(dx,dy)>=8) gesture.axis=dy>dx?'y':'x'
    if(gesture.axis==='y') {lastVertical=now();show()}
  },{passive:true})
  const release=e=>{if(gesture?.id===e.pointerId){gesture=null;held=false;schedule()}}
  listen(doc,'pointerup',release,{passive:true});listen(doc,'pointercancel',release,{passive:true})
  listen(canvas,'wheel',e=>{if(automatic&&Math.abs(e.deltaY)>Math.abs(e.deltaX)){lastVertical=now();show()}},{passive:true})
  listen(canvas,'scroll',e=>{
    if(!automatic) return
    const top=e.target.scrollTop,previous=positions.get(e.target)
    positions.set(e.target,top)
    if(Number.isFinite(top)&&top!==previous&&now()-lastVertical<400) {lastVertical=now();show()}
  },{capture:true,passive:true})
  listen(bar,'focusin',show);listen(bar,'focusout',schedule)
  listen(bar,'click',()=>{if(root.dataset.navIdle!=='true') show()})
  listen(win,'blur',()=>{held=false;gesture=null;suspend();schedule()})
  listen(doc,'visibilitychange',()=>{held=false;gesture=null;if(doc.hidden){suspend();win.clearTimeout(timer)}else show()})
  const observer=new win.MutationObserver(()=>{if(blocked()){held=false;gesture=null;suspend();win.clearTimeout(timer)}else show()})
  observer.observe(root,{attributes:true,attributeFilter:['inert','data-navigation-hidden']})
  show()
  return {show,configure(mode){
    if(disposed||automatic===(mode==='auto')) return
    automatic=mode==='auto';gesture=null;held=false;lastVertical=-Infinity
    win.clearTimeout(timer)
    // Route-level inert/hidden takes precedence; showing resumes when it closes.
    show()
  },destroy(){disposed=true;win.clearTimeout(timer);observer.disconnect();listeners.forEach(remove=>remove());bar.inert=false;delete root.dataset.navIdle}}
}
