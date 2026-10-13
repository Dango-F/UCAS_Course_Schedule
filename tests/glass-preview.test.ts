import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createGlassNavigation } from '../src/components/glass-navigation.js'
import { createGlassPreview } from '../src/components/glass-preview.js'
import { HOP_TRAVEL_DURATION, HOP_SQUASH_DURATION } from '../src/components/glass-hop.js'

vi.mock('../src/components/glass-navigation.js', () => ({ createGlassNavigation:vi.fn() }))

describe('glass preview comparison lifecycle', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.useRealTimers())
  function fixture() {
    const lens = {setClarity:vi.fn(),configure:vi.fn(),suspend:vi.fn(),destroy:vi.fn()}
    lens.configure.mockImplementation(config=>lens.setClarity(config.clarity))
    vi.mocked(createGlassNavigation).mockReturnValue(lens)
    const button = Object.assign(new EventTarget(), {setAttribute:vi.fn()})
    const win = new EventTarget()
    const doc = Object.assign(new EventTarget(), {defaultView:win,hidden:false})
    const tabs = Array.from({length:3}, () => ({classList:{toggle:vi.fn()},setAttribute:vi.fn()}))
    const lensRoot = Object.assign(new EventTarget(), {querySelector:vi.fn(() => ({})),querySelectorAll:vi.fn(() => tabs)})
    const root = {ownerDocument:doc,dataset:{comparing:'false'},querySelector:(selector:string) => selector === '.glass-compare' ? button : lensRoot}
    const controller = createGlassPreview(root, 25)
    const event = (target:EventTarget, type:string, props = {}) => target.dispatchEvent(Object.assign(new Event(type,{cancelable:true}),props))
    return {lens,lensRoot,tabs,button,doc,win,root,controller,event}
  }
  it('shows default only while held, preserving the latest chosen value', () => {
    const f = fixture()
    f.event(f.button,'pointerdown',{pointerId:1,button:0,isPrimary:true})
    expect(f.root.dataset.comparing).toBe('true')
    expect(f.lens.setClarity).toHaveBeenLastCalledWith(100)
    f.controller.configure(35)
    expect(f.lens.setClarity).toHaveBeenLastCalledWith(100)
    f.event(f.doc,'pointerup',{pointerId:2})
    expect(f.root.dataset.comparing).toBe('true')
    f.event(f.doc,'pointerup',{pointerId:1})
    expect(f.root.dataset.comparing).toBe('false')
    expect(f.lens.setClarity).toHaveBeenLastCalledWith(35)
  })
  it.each(['pointerleave','pointercancel','blur','hidden'])('restores on %s interruption', reason => {
    const f = fixture()
    f.event(f.button,'pointerdown',{pointerId:1,button:0})
    if (reason === 'pointerleave') f.event(f.button,'pointerleave')
    if (reason === 'pointercancel') f.event(f.doc,'pointercancel',{pointerId:1})
    if (reason === 'blur') f.event(f.win,'blur')
    if (reason === 'hidden') { f.doc.hidden = true; f.event(f.doc,'visibilitychange') }
    expect(f.root.dataset.comparing).toBe('false')
    expect(f.lens.setClarity).toHaveBeenLastCalledWith(25)
  })
  it('supports held keyboard comparison and ignores unrelated keys', () => {
    const f = fixture()
    f.event(f.button,'keydown',{key:' ',repeat:false})
    expect(f.root.dataset.comparing).toBe('true')
    f.event(f.doc,'keyup',{key:'ArrowLeft'})
    expect(f.root.dataset.comparing).toBe('true')
    f.event(f.doc,'keyup',{key:' '})
    expect(f.lens.setClarity).toHaveBeenLastCalledWith(25)
    f.event(f.button,'keydown',{key:'Enter',repeat:false})
    f.event(f.button,'keydown',{key:'Escape'})
    expect(f.root.dataset.comparing).toBe('false')
  })
  it('releases the lens and all listeners on unmount', () => {
    const f = fixture()
    f.event(f.button,'pointerdown',{pointerId:1,button:0})
    f.controller.destroy()
    expect(f.lens.destroy).toHaveBeenCalledTimes(1)
    f.lens.setClarity.mockClear()
    f.event(f.button,'pointerdown',{pointerId:1,button:0})
    f.controller.configure(100)
    expect(f.lens.setClarity).not.toHaveBeenCalled()
  })
  it('passes the light switch through preview comparison and mode changes', () => {
    const f = fixture()
    f.controller.configure({clarity:25,touchLight:false,navMotion:'hop'})
    expect(f.lens.configure).toHaveBeenLastCalledWith(expect.objectContaining({touchLight:false}))
    f.event(f.button,'pointerdown',{pointerId:1,button:0})
    expect(f.lens.configure).toHaveBeenLastCalledWith(expect.objectContaining({touchLight:false,clarity:100}))
    f.controller.configure({clarity:35,touchLight:true,navMotion:'flow'})
    expect(f.lens.configure).toHaveBeenLastCalledWith(expect.objectContaining({touchLight:true,navMotion:'flow'}))
    f.controller.destroy()
  })
  it('starts a left-to-right then right-to-left hop only when the run token changes', () => {
    vi.useFakeTimers()
    const f = fixture()
    const config = {clarity:25,navMotion:'hop',hopPeak:9,hopPreviewRun:0,hopPreviewStop:0}
    f.controller.configure({...config,hopPeak:7})
    vi.advanceTimersByTime(1000)
    expect(f.lens.suspend).not.toHaveBeenCalled()
    f.controller.configure({...config,hopPeak:7,hopPreviewRun:1})
    expect(f.lens.suspend).toHaveBeenCalledTimes(1)
    expect(f.lens.configure).toHaveBeenLastCalledWith(expect.objectContaining({activeIndex:0,hopPeak:7}))
    vi.advanceTimersByTime(32)
    expect(f.lens.configure).toHaveBeenLastCalledWith(expect.objectContaining({activeIndex:2,hopPeak:7}))
    vi.advanceTimersByTime(HOP_TRAVEL_DURATION + HOP_SQUASH_DURATION + 60)
    expect(f.lens.configure).toHaveBeenLastCalledWith(expect.objectContaining({activeIndex:0,hopPeak:7}))
  })
  it('cancels an unfinished demo when adjustment starts or the user takes over', () => {
    vi.useFakeTimers()
    const f = fixture()
    const config = {clarity:25,navMotion:'hop',hopPeak:9,hopPreviewRun:1,hopPreviewStop:0}
    f.controller.configure(config)
    vi.advanceTimersByTime(32)
    f.controller.configure({...config,hopPeak:5,hopPreviewStop:1})
    expect(f.lens.suspend).toHaveBeenCalledTimes(2)
    f.controller.configure({...config,hopPeak:5,hopPreviewStop:1,hopPreviewRun:2})
    vi.advanceTimersByTime(32)
    const calls = f.lens.configure.mock.calls.length
    f.event(f.lensRoot,'pointerdown')
    vi.advanceTimersByTime(1000)
    expect(f.lens.configure.mock.calls.length).toBe(calls)
    f.controller.destroy()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('shares the Q elastic choice and omits the landing wait when disabled', () => {
    vi.useFakeTimers()
    const f = fixture()
    const config = {clarity:25,navMotion:'hop',qElastic:false,hopPreviewRun:1,hopPreviewStop:0}
    f.controller.configure(config)
    vi.advanceTimersByTime(32)
    expect(f.lens.configure).toHaveBeenLastCalledWith(expect.objectContaining({activeIndex:2,qElastic:false}))
    vi.advanceTimersByTime(HOP_TRAVEL_DURATION + 60)
    expect(f.lens.configure).toHaveBeenLastCalledWith(expect.objectContaining({activeIndex:0,qElastic:false}))
    f.controller.configure({...config,hopPreviewRun:2})
    vi.advanceTimersByTime(32)
    f.controller.configure({...config,hopPreviewRun:2,qElastic:true})
    const calls = f.lens.configure.mock.calls.length
    vi.advanceTimersByTime(1000)
    expect(f.lens.configure.mock.calls.length).toBe(calls)
    expect(f.lens.configure).toHaveBeenLastCalledWith(expect.objectContaining({activeIndex:0,qElastic:true}))
    f.controller.destroy()
    expect(vi.getTimerCount()).toBe(0)
  })
})
