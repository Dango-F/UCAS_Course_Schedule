import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dragOffset, releaseDuration, releaseTarget, sampleVelocity } from '../src/components/swipe-motion.js'
import { createSwipeController } from '../src/components/calendar-swipe-engine.js'

describe('swipe release decisions', () => {
  it('accepts a deliberate short fast flick, but returns a tiny drag', () => {
    expect(releaseTarget(-30, -0.9, 390, 3, 20)).toBe(1)
    expect(releaseTarget(-10, -2, 390, 3, 20)).toBe(0)
    expect(releaseTarget(30, 0.9, 390, 3, 20)).toBe(-1)
  })
  it('does not use opposing or stale velocity to turn a page', () => {
    expect(releaseTarget(-30, 0.9, 390, 3, 20)).toBe(0)
    expect(sampleVelocity([{ x: 0, time: 0 }, { x: -80, time: 30 }], 200)).toBe(0)
  })
  it('never turns beyond the semester or drags beyond the prepared panel', () => {
    expect(releaseTarget(100, 1, 390, 1, 20)).toBe(0)
    expect(releaseTarget(-100, -1, 390, 20, 20)).toBe(0)
    expect(dragOffset(100, 390, 1, 20)).toBeCloseTo(14)
    expect(dragOffset(-900, 390, 3, 20)).toBe(-390)
  })
  it('settles small drags and avoids a full-length animation at the endpoint', () => {
    expect(releaseDuration(-12, 0, 390, 0)).toBeGreaterThanOrEqual(100)
    expect(releaseDuration(-390, 1, 390, -1)).toBe(0)
    expect(releaseDuration(-100, 1, 390, -1)).toBeLessThan(280)
  })
})

describe('view-layer gesture lifecycle', () => {
  let mutation: () => void
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('MutationObserver', class {
      callback: () => void
      constructor(callback: () => void) { this.callback = callback }
      observe(_root: unknown, options: { attributes?: boolean }) { if (options.attributes) mutation = this.callback }
      disconnect() {}
    })
    vi.stubGlobal('getComputedStyle', () => ({ transform: 'matrix(1, 0, 0, 1, -510, 0)' }))
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
  function fixture() {
    const handlers = new Map<string, Function>()
    const attrs: Record<string, string> = { 'data-week': '3', 'data-max-week': '20', 'data-state': 'idle' }
    let weeks = [2, 3, 4]
    const track = {
      style: { transform: '', transition: '' }, offsetWidth: 1170,
      get children() { return weeks.map(week => ({ getAttribute: () => String(week), querySelector: () => ({ getAttribute: () => String(week) }) })) },
      addEventListener: vi.fn(), removeEventListener: vi.fn()
    }
    const root = {
      querySelector: () => track, getBoundingClientRect: () => ({ width: 390 }),
      getAttribute: (key: string) => attrs[key],
      addEventListener: (key: string, handler: Function) => handlers.set(key, handler),
      removeEventListener: (key: string) => handlers.delete(key)
    }
    const notify = vi.fn((method: string) => {
      if (method === 'onRenderSwipeEnd') attrs['data-state'] = 'busy'
    })
    const controller = createSwipeController(root, notify)
    function touch(type: string, x: number, y = 100) {
      const p = { clientX: x, clientY: y, identifier: 1 }
      handlers.get(type)?.({ touches: type === 'touchend' ? [] : [p], changedTouches: [p], cancelable: true, preventDefault() {} })
    }
    return { track, attrs, controller, notify, touch, handlers,
      commit() { attrs['data-week'] = '4'; attrs['data-state'] = 'idle'; weeks = [3, 4, 5]; mutation() }
    }
  }
  it('takes over the visible animation position without jumping to center', () => {
    const f = fixture()
    f.touch('touchstart', 300); f.touch('touchmove', 190); f.touch('touchend', 190)
    f.touch('touchstart', 300)
    expect(f.track.style.transform).toContain('-120px')
    f.touch('touchmove', 280)
    expect(f.track.style.transform).toContain('-140px')
    expect(f.notify.mock.calls.some(([method]) => method === 'onRenderSwipeInterrupt')).toBe(true)
    vi.advanceTimersByTime(400)
    expect(f.notify.mock.calls.some(([method]) => method === 'onRenderSwipeSettled')).toBe(false)
    f.controller.destroy()
  })
  it('keeps repeated movement in the view layer without notifying Vue every frame', () => {
    const f = fixture()
    f.touch('touchstart', 300)
    for (let i = 1; i <= 20; i++) f.touch('touchmove', 300 - i * 5)
    expect(f.notify).toHaveBeenCalledTimes(1)
    expect(f.notify.mock.calls[0][0]).toBe('onRenderSwipeAxis')
    expect(f.track.style.transform).toContain('-100px')
    f.controller.destroy()
  })
  it('preserves movement that arrived while the previous week was committing', () => {
    const f = fixture()
    f.touch('touchstart', 300); f.touch('touchmove', 190); f.touch('touchend', 190)
    vi.advanceTimersByTime(400)
    f.touch('touchstart', 300); f.touch('touchmove', 230)
    expect(f.track.style.transform).toContain('-390px')
    f.commit()
    expect(f.track.style.transform).toContain('-70px')
    f.touch('touchend', 230)
    expect(f.notify.mock.calls.at(-1)?.[1].target).toBe(1)
    f.controller.destroy()
  })
  it('queues a complete quick gesture instead of swallowing its release', () => {
    const f = fixture()
    f.touch('touchstart', 300); f.touch('touchmove', 190); f.touch('touchend', 190)
    vi.advanceTimersByTime(400)
    f.touch('touchstart', 300); f.touch('touchmove', 230); f.touch('touchend', 230)
    f.commit()
    expect(f.notify.mock.calls.filter(([method]) => method === 'onRenderSwipeEnd')).toHaveLength(2)
    f.controller.destroy()
  })
  it('returns a small drag and releases all timers/listeners on unmount', () => {
    const f = fixture()
    f.touch('touchstart', 300); f.touch('touchmove', 290); f.touch('touchend', 290)
    expect(f.notify.mock.calls.at(-1)?.[1].target).toBe(0)
    f.controller.destroy()
    vi.advanceTimersByTime(1000)
    expect(f.handlers.size).toBe(0)
    expect(f.notify.mock.calls.some(([method]) => method === 'onRenderSwipeSettled')).toBe(false)
  })
})
