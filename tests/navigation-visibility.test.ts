import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {createNavigationVisibility} from '../src/components/navigation-visibility.js'

describe('navigation visibility',()=>{
  beforeEach(()=>vi.useFakeTimers());afterEach(()=>vi.useRealTimers())
  function fixture(mode = 'auto') {
    const canvas=Object.assign(new EventTarget(),{scrollTop:0}),wake=new EventTarget()
    const focused={matches:()=>true,focus:vi.fn()}
    const bar=Object.assign(new EventTarget(),{inert:false,setAttribute:vi.fn(),contains:(e:unknown)=>e===bar||e===focused,querySelector:()=>focused})
    const win=Object.assign(new EventTarget(),{setTimeout,clearTimeout,performance:{now:()=>Date.now()},MutationObserver:class {observe(){}disconnect(){}}})
    const doc=Object.assign(new EventTarget(),{defaultView:win,hidden:false,activeElement:null as unknown})
    const root={ownerDocument:doc,dataset:{} as Record<string,string>,hasAttribute:()=>false,closest:()=>canvas,querySelector:(s:string)=>s==='.glass-bar'?bar:wake}
    const suspend=vi.fn(),controller=createNavigationVisibility(root,suspend,mode)
    const event=(target:EventTarget,type:string,props={})=>target.dispatchEvent(Object.assign(new Event(type),props))
    const start=()=>event(canvas,'pointerdown',{pointerId:1,clientX:100,clientY:200,isPrimary:true})
    return {canvas,wake,bar,focused,win,doc,root,suspend,controller,event,start}
  }
  it('hides at 1200ms and wakes with a keyboard-accessible handle',()=>{
    const f=fixture();expect(f.root.dataset.navIdle).toBe('false')
    vi.advanceTimersByTime(1199);expect(f.bar.inert).toBe(false)
    vi.advanceTimersByTime(1);expect(f.bar.inert).toBe(true);expect(f.suspend).toHaveBeenCalledTimes(1)
    f.event(f.wake,'click',{detail:0});expect(f.bar.inert).toBe(false);expect(f.focused.focus).toHaveBeenCalled()
    f.controller.destroy()
  })
  it('ignores horizontal gestures and programmatic scroll, accepts vertical intent',()=>{
    const f=fixture();vi.advanceTimersByTime(1200);f.start()
    f.event(f.doc,'pointermove',{pointerId:1,clientX:20,clientY:201})
    f.canvas.scrollTop=100;f.event(f.canvas,'scroll');expect(f.bar.inert).toBe(true)
    f.event(f.doc,'pointerup',{pointerId:1});f.start()
    f.event(f.doc,'pointermove',{pointerId:1,clientX:101,clientY:180});expect(f.bar.inert).toBe(false)
    f.event(f.doc,'pointercancel',{pointerId:1});vi.advanceTimersByTime(200)
    f.canvas.scrollTop=200;f.event(f.canvas,'scroll');vi.advanceTimersByTime(1100);expect(f.bar.inert).toBe(false)
    vi.advanceTimersByTime(100);expect(f.bar.inert).toBe(true);f.controller.destroy()
  })
  it('keeps keyboard focus visible and reschedules when focus leaves',()=>{
    const f=fixture();f.doc.activeElement=f.focused;vi.advanceTimersByTime(1500);expect(f.bar.inert).toBe(false)
    f.doc.activeElement=null;f.event(f.bar,'focusout');vi.advanceTimersByTime(1200);expect(f.bar.inert).toBe(true);f.controller.destroy()
  })
  it('does not reveal navigation on a blocked detail page',()=>{
    const f=fixture();vi.advanceTimersByTime(1200);f.root.dataset.navigationHidden='true'
    f.event(f.wake,'click',{detail:1});expect(f.bar.inert).toBe(true);f.controller.destroy()
  })
  it('releases handlers and timers on unmount',()=>{
    const f=fixture();f.controller.destroy();vi.advanceTimersByTime(5000)
    expect(f.suspend).not.toHaveBeenCalled();expect(f.root.dataset.navIdle).toBeUndefined()
    f.start();f.event(f.doc,'pointermove',{pointerId:1,clientX:100,clientY:150});expect(f.root.dataset.navIdle).toBeUndefined()
  })
  it('fixed mode has no idle timer and remains visible',()=>{
    const f=fixture('fixed');vi.advanceTimersByTime(10000)
    expect(f.bar.inert).toBe(false);expect(f.root.dataset.navIdle).toBe('false')
    expect(vi.getTimerCount()).toBe(0);expect(f.suspend).not.toHaveBeenCalled();f.controller.destroy()
  })
  it('reveals on auto-to-fixed and cancels the previous timer',()=>{
    const f=fixture();vi.advanceTimersByTime(1300);expect(f.bar.inert).toBe(true)
    f.controller.configure('fixed');expect(f.bar.inert).toBe(false);vi.advanceTimersByTime(3000)
    expect(f.bar.inert).toBe(false);expect(vi.getTimerCount()).toBe(0)
    f.controller.configure('auto');vi.advanceTimersByTime(1200);expect(f.bar.inert).toBe(true);f.controller.destroy()
  })
  it('changing preference does not override a hidden settings detail',()=>{
    const f=fixture();vi.advanceTimersByTime(1200);f.root.dataset.navigationHidden='true'
    f.controller.configure('fixed');expect(f.bar.inert).toBe(true)
    delete f.root.dataset.navigationHidden;f.controller.show();expect(f.bar.inert).toBe(false)
    vi.advanceTimersByTime(3000);expect(f.bar.inert).toBe(false);f.controller.destroy()
  })
})
