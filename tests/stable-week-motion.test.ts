import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { boundWeekPosition, createStableWeekController, settleWeek, weekDuration } from '../src/components/stable-week-motion.js'

describe('V2 stable-slot decisions', () => {
  it('retains fractional distance and low-speed flick decisions without wrapping at boundaries', () => {
    expect(settleWeek(2.4, 0, 20)).toBe(2)
    expect(settleWeek(2.6, 0, 20)).toBe(3)
    expect(settleWeek(2.1, 0.3, 20)).toBe(3)
    expect(settleWeek(1.9, -0.3, 20)).toBe(1)
    expect(settleWeek(-0.2, -1, 20)).toBe(0)
    expect(settleWeek(19.2, 1, 20)).toBe(19)
    expect(boundWeekPosition(-0.2, 19)).toBeGreaterThan(-0.2)
  })
  it('gives slow releases a gentler finish and short flicks a quicker finish', () => {
    expect(weekDuration(200, 390, 0)).toBeGreaterThan(weekDuration(200, 390, 1))
    expect(weekDuration(0.1, 390, 0)).toBe(0)
    expect(weekDuration(5, 390, 0)).toBeGreaterThanOrEqual(120)
  })
})

describe('V2 view-layer compositor lifecycle', () => {
  let time: number
  let visibleX: number
  let refreshPanels: () => void
  let panelObservation: MutationObserverInit
  beforeEach(() => {
    vi.useFakeTimers()
    time = 0
    visibleX = -780
    vi.spyOn(performance, 'now').mockImplementation(() => time)
    refreshPanels = () => {}
    panelObservation = {}
    vi.stubGlobal('MutationObserver', class {
      constructor(private callback: () => void) {}
      observe(target: { style?: unknown }, options: MutationObserverInit) {
        if (target.style) { refreshPanels = this.callback; panelObservation = options }
      }
      disconnect() {}
    })
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
    vi.stubGlobal('getComputedStyle', () => ({ transform: `matrix(1, 0, 0, 1, ${visibleX}, 0)` }))
  })
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })
  function fixture(week = 3, reducedMotion = false) {
    const handlers = new Map<string, Function>()
    const attrs: Record<string, string> = {}
    let reads = 0
    const scrollers: { scrollTop: number }[] = []
    const cachedScroller = { scrollTop: 77 }
    const makePanel = (i: number) => ({
      getAttribute: () => String(i + 1),
      getBoundingClientRect: () => { reads++; return { left: (i - 2) * 390, right: (i - 1) * 390 } },
      querySelectorAll: (selector: string) => {
        const scroller = scrollers[i] ||= { scrollTop: 0 }
        if (selector === '[data-calendar-view="active"] .uni-scroll-view') return [scroller]
        if (selector === '.uni-scroll-view') return [scroller, cachedScroller]
        return []
      }
    })
    let panels = Array.from({ length: 5 }, (_, i) => makePanel(i))
    const track = {
      style: { transform: '', transition: '' },
      get offsetWidth() { reads++; return 390 },
      addEventListener: (name: string, fn: Function) => handlers.set(name, fn),
      removeEventListener: (name: string) => handlers.delete(name)
    }
    const root = {
      querySelector: () => track,
      querySelectorAll: (selector: string) => selector === '[data-calendar-panel="ready"]' ? panels : [],
      getBoundingClientRect: () => { reads++; return { left: 0, right: 390, width: 390 } },
      setAttribute: (name: string, value: string) => { attrs[name] = value },
      addEventListener: (name: string, fn: Function) => handlers.set(name, fn),
      removeEventListener: (name: string) => handlers.delete(name)
    }
    const config = { week, maxWeek: 20, revision: 0, reducedMotion }
    const notify = vi.fn()
    const controller = createStableWeekController(root, config, notify)
    function touch(type: string, x: number, y = 100) {
      time += 16
      const p = { identifier: 1, clientX: x, clientY: y }
      handlers.get(type)?.({ touches: type === 'touchend' || type === 'touchcancel' ? [] : [p], changedTouches: [p], cancelable: true, preventDefault() {} })
    }
    return { config, notify, controller, touch, track, handlers, attrs, scrollers, cachedScroller, reads: () => reads,
      ready(weeks: number[]) { panels = weeks.map(week => makePanel(week - 1)); refreshPanels() },
      prepare(first: number, last: number) { panels = Array.from({ length: last - first + 1 }, (_, i) => makePanel(first - 1 + i)); refreshPanels() }
    }
  }
  it('recognizes prepared view wrappers without depending on grid-only CSS classes', () => {
    const f = fixture(3, true)
    f.touch('touchstart', 300); f.touch('touchmove', 50); f.touch('touchend', 50)
    expect(f.notify).toHaveBeenCalledWith({ week: 4, revision: 0 })
    expect(panelObservation.attributes).toBe(true)
    expect(panelObservation.attributeFilter).toEqual(['data-calendar-panel', 'data-calendar-view'])
    f.controller.destroy()
  })
  it('blocks gaps while neighbours prepare and admits them as soon as they are ready', () => {
    const f = fixture(3, true)
    f.ready([1, 3, 5])
    f.touch('touchstart', 300); f.touch('touchmove', 0); f.touch('touchend', 0)
    expect(f.track.style.transform).toBe('translate3d(-780px,0,0)')
    expect(f.notify).not.toHaveBeenCalled()
    f.ready([1, 3, 4, 5])
    f.touch('touchstart', 300); f.touch('touchmove', 50); f.touch('touchend', 50)
    expect(f.notify).toHaveBeenCalledWith({ week: 4, revision: 0 })
    f.controller.destroy()
  })
  it('resets only active offscreen scrollers, not cached views or the current week', () => {
    const f = fixture(3, true)
    f.scrollers.forEach(scroller => { scroller.scrollTop = 55 })
    f.touch('touchstart', 300)
    expect(f.scrollers[0].scrollTop).toBe(0)
    expect(f.scrollers[2].scrollTop).toBe(55)
    expect(f.cachedScroller.scrollTop).toBe(77)
    f.controller.destroy()
  })
  it('announces the target at every release even when the next gesture interrupts before halfway', () => {
    const f = fixture()
    f.touch('touchstart', 300); f.touch('touchmove', 150); f.touch('touchend', 150)
    expect(f.notify).toHaveBeenCalledWith({ week: 4, revision: 0 })
    f.prepare(2, 6)
    visibleX = -950
    f.touch('touchstart', 300); f.touch('touchmove', 0); f.touch('touchend', 0)
    expect(f.notify.mock.calls.at(-1)?.[0]).toEqual({ week: 5, revision: 0 })
    f.controller.destroy()
  })
  it('uses new prepared bounds during an active gesture rather than freezing the old two-week boundary', () => {
    const f = fixture(5)
    f.touch('touchstart', 300)
    f.prepare(3, 7)
    const reads = f.reads()
    f.touch('touchmove', 100)
    expect(Number.parseFloat(f.track.style.transform.slice('translate3d('.length))).toBeCloseTo(-1760, 5)
    expect(f.reads()).toBe(reads)
    f.touch('touchend', 100)
    expect(f.notify.mock.calls.at(-1)?.[0]).toEqual({ week: 6, revision: 0 })
    f.controller.destroy()
  })
  it('does not read layout or notify Vue while following the finger', () => {
    const f = fixture()
    f.touch('touchstart', 300)
    const reads = f.reads()
    for (let i = 1; i <= 20; i++) f.touch('touchmove', 300 - i * 5)
    expect(f.reads()).toBe(reads)
    expect(f.notify).not.toHaveBeenCalled()
    expect(f.track.style.transform).toBe('translate3d(-880px,0,0)')
    f.controller.destroy()
  })
  it('writes one CSS target and publishes the week at release, without publishing again at completion', () => {
    const f = fixture()
    f.touch('touchstart', 300); f.touch('touchmove', 150); f.touch('touchend', 150)
    expect(f.track.style.transition).toContain('cubic-bezier')
    expect(f.track.style.transform).toBe('translate3d(-1170px,0,0)')
    expect(f.notify).toHaveBeenCalledWith({ week: 4, revision: 0 })
    vi.advanceTimersByTime(350)
    expect(f.notify).toHaveBeenCalledTimes(1)
    expect(f.attrs['data-motion-phase']).toBe('idle')
    f.controller.destroy()
  })
  it('resumes from the displayed position and rejects an older completion timer', () => {
    const f = fixture()
    f.touch('touchstart', 300); f.touch('touchmove', 150); f.touch('touchend', 150)
    expect(f.notify).toHaveBeenCalledTimes(1)
    visibleX = -900
    f.touch('touchstart', 300); f.touch('touchmove', 280)
    expect(Number.parseFloat(f.track.style.transform.slice('translate3d('.length))).toBeCloseTo(-920, 5)
    vi.advanceTimersByTime(400)
    expect(f.notify).toHaveBeenCalledTimes(1)
    f.touch('touchend', 280)
    vi.advanceTimersByTime(350)
    expect(f.notify).toHaveBeenCalledTimes(1)
    f.controller.destroy()
  })
  it('does not move the release notification to the next touchstart', () => {
    const f = fixture()
    f.touch('touchstart', 300); f.touch('touchmove', 150); f.touch('touchend', 150)
    visibleX = -1120
    f.touch('touchstart', 300)
    expect(f.notify).toHaveBeenCalledWith({ week: 4, revision: 0 })
    expect(f.notify).toHaveBeenCalledTimes(1)
    f.touch('touchmove', 270)
    expect(f.track.style.transform).toBe('translate3d(-1150px,0,0)')
    f.controller.destroy()
  })
  it('returns tiny or cancelled drags and ignores stale velocity after holding', () => {
    const f = fixture()
    f.touch('touchstart', 300); f.touch('touchmove', 292); f.touch('touchend', 292)
    vi.advanceTimersByTime(350)
    expect(f.track.style.transform).toBe('translate3d(-780px,0,0)')
    f.touch('touchstart', 300); f.touch('touchmove', 160)
    time += 200
    f.touch('touchend', 160)
    vi.advanceTimersByTime(350)
    expect(f.notify).not.toHaveBeenCalled()
    f.touch('touchstart', 300); f.touch('touchmove', 100); f.touch('touchcancel', 100)
    vi.advanceTimersByTime(350)
    expect(f.track.style.transform).toBe('translate3d(-780px,0,0)')
    f.controller.destroy()
  })
  it('does not animate a vertical gesture or lose a gesture to an echoed configuration', () => {
    const f = fixture()
    f.touch('touchstart', 300); f.touch('touchmove', 298, 160); f.touch('touchend', 298, 160)
    expect(f.notify).not.toHaveBeenCalled()
    f.touch('touchstart', 300); f.touch('touchmove', 270)
    f.controller.configure({ ...f.config })
    f.touch('touchmove', 250)
    expect(f.track.style.transform).toBe('translate3d(-830px,0,0)')
    f.controller.destroy()
  })
  it('external jumps invalidate pending commits; disposal removes listeners and timers', () => {
    const f = fixture()
    f.touch('touchstart', 300); f.touch('touchmove', 100); f.touch('touchend', 100)
    f.controller.configure({ ...f.config, week: 10, revision: 1 })
    expect(f.track.style.transform).toBe('translate3d(-3510px,0,0)')
    vi.advanceTimersByTime(400)
    expect(f.notify).toHaveBeenCalledTimes(1)
    expect(f.notify).toHaveBeenCalledWith({ week: 4, revision: 0 })
    f.controller.destroy()
    expect(f.handlers.size).toBe(0)
  })
  it('reduced motion still commits the week without a transition', () => {
    const f = fixture(3, true)
    f.touch('touchstart', 300); f.touch('touchmove', 100); f.touch('touchend', 100)
    expect(f.track.style.transition).toBe('none')
    expect(f.notify).toHaveBeenCalledWith({ week: 4, revision: 0 })
    f.controller.destroy()
  })
})
