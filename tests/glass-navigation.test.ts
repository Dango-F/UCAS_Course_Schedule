import { describe, expect, it } from 'vitest'
import { capsuleRefraction, createCapsuleMap, lensGeometry } from '../src/components/glass-lens.js'
import { tabAt, glassVelocity, glassDeformation, draggedTab, glassSpring, boundedGlassStretch, flowMaterialClear } from '../src/components/glass-navigation.js'

describe('capsule lens adapted from AndroidLiquidGlass', () => {
  it('scales the optical rim for the compact 56px bar without warping its center', () => {
    const compact = lensGeometry(56), original = lensGeometry(72)
    expect(original.rim).toBe(16)
    expect(original.amount).toBe(10)
    expect(compact.rim).toBeCloseTo(12.4444, 3)
    expect(compact.amount).toBeCloseTo(7.7778, 3)
    expect(compact.blur).toBeCloseTo(.6)
    expect(capsuleRefraction(180, 28, 360, 56, compact.rim, compact.amount)).toEqual([0, 0])
    expect(lensGeometry(200).amount).toBe(10)
    expect(lensGeometry(NaN)).toEqual(compact)
  })
  it('bounds the clear material blur at unusual sizes without changing the lens strength', () => {
    for (const height of [-1, 0, 1, 28, 56, 72, 200, Infinity, NaN]) {
      const geometry = lensGeometry(height)
      expect(geometry.blur).toBeGreaterThanOrEqual(.4)
      expect(geometry.blur).toBeLessThanOrEqual(.8)
    }
    expect(lensGeometry(200).blur).toBe(.8)
    expect(lensGeometry(56).amount).toBeCloseTo(7.7778, 3)
  })
  it('leaves the interior and outside untouched', () => {
    expect(capsuleRefraction(180, 36, 360, 72)).toEqual([0, 0])
    expect(capsuleRefraction(-1, 36, 360, 72)).toEqual([0, 0])
  })
  it('encodes a neutral compact interior with only subpixel quantization error', () => {
    const geometry = lensGeometry(56), map = createCapsuleMap(358, 56, geometry.rim, geometry.amount)
    for (const [x,y] of [[70,20],[179,28],[280,35]]) {
      const index = (y * 358 + x) * 4
      for (const channel of [0,1]) expect(Math.abs((map[index + channel] / 255 - .5) * geometry.amount * 2)).toBeLessThan(.04)
    }
  })
  it('refracts the top/bottom inward with symmetric edge strength', () => {
    const top = capsuleRefraction(180, 2, 360, 72)
    const bottom = capsuleRefraction(180, 70, 360, 72)
    expect(top[0]).toBeCloseTo(0)
    expect(top[1]).toBeGreaterThan(0)
    expect(bottom[1]).toBeCloseTo(-top[1])
    expect(Math.abs(top[1])).toBeLessThan(10)
    expect(Math.abs(capsuleRefraction(180, 12, 360, 72)[1])).toBeLessThan(top[1])
  })
  it('samples capsule ends, not a circular lens stretched across the bar', () => {
    const left = capsuleRefraction(2, 36, 360, 72)
    const right = capsuleRefraction(358, 36, 360, 72)
    expect(left[0]).toBeGreaterThan(0)
    expect(right[0]).toBeCloseTo(-left[0])
    expect(left[1]).toBeCloseTo(0)
  })
  it('creates bounded opaque displacement data with neutral center', () => {
    const map = createCapsuleMap(360, 72)
    expect(map.length).toBe(360 * 72 * 4)
    const center = (36 * 360 + 180) * 4
    expect([...map.slice(center, center + 4)]).toEqual([128, 128, 128, 255])
    for (let i = 3; i < map.length; i += 4) expect(map[i]).toBe(255)
  })
})

describe('glass navigation gestures', () => {
  it('restores flow tint at visual arrival without waiting for the pressure tail', () => {
    expect(flowMaterialClear(true, 1, 1, 100)).toBe(true)
    expect(flowMaterialClear(false, .98, 1, 100)).toBe(true)
    expect(flowMaterialClear(false, .996, 1, 100)).toBe(false)
    expect(flowMaterialClear(false, 1, 1, 100)).toBe(false)
    for (const hz of [60, 90, 120]) {
      let position = { value:0, velocity:0 }, pressure = { value:0, velocity:0 }, restoredAt = 0
      for (let elapsed = 0; elapsed < 1000; elapsed += 1000/hz) {
        position = glassSpring(position.value, position.velocity, 1, 1000/hz)
        pressure = glassSpring(pressure.value, pressure.velocity, Math.abs(position.value-1)>.002?1:0, 1000/hz, .038)
        if (!flowMaterialClear(false, position.value, 1, 100)) {
          restoredAt = elapsed
          expect(pressure.value).toBeGreaterThan(.8)
          break
        }
      }
      expect(restoredAt).toBeGreaterThan(150)
      expect(restoredAt).toBeLessThan(300)
    }
  })
  it('lets material and highlight settle from their current state without a release jump', () => {
    const shape = glassSpring(1.09, 0, 1.015, 16, .04)
    expect(shape.value).toBeGreaterThan(1.075)
    expect(shape.value).toBeLessThan(1.09)
    const light = glassSpring(140, 0, 100, 16, .025)
    expect(light.value).toBeGreaterThan(132)
    expect(light.value).toBeLessThan(140)
    expect(glassSpring(140, 0, 100, 0, .025)).toEqual({value:140,velocity:0})
  })
  it('settles identically across refresh rates and rests exactly at the target', () => {
    const full = glassSpring(0, 0, 2, 16)
    const first = glassSpring(0, 0, 2, 8)
    const halves = glassSpring(first.value, first.velocity, 2, 8)
    expect(halves.value).toBeCloseTo(full.value, 10)
    let state = {value:0, velocity:0}
    for (let t = 0; t < 900; t += 8) {
      state = glassSpring(state.value, state.velocity, 2, 8)
      expect(state.value).toBeGreaterThanOrEqual(0)
      expect(state.value).toBeLessThanOrEqual(2)
    }
    expect(state).toEqual({value:2, velocity:0})
  })
  it('retargets without teleporting or discarding velocity', () => {
    const moving = glassSpring(0, 0, 2, 60)
    expect(glassSpring(moving.value, moving.velocity, 0, 0)).toEqual(moving)
    let state = moving
    for (let i = 0; i < 100; i++) state = glassSpring(state.value, state.velocity, 0, 8)
    expect(state).toEqual({value:0, velocity:0})
  })
  it('keeps the wider three-tab selector inside the outer glass at both edges', () => {
    expect(boundedGlassStretch(1.095, 0, 116, 3)).toBeLessThan(1.061)
    expect(boundedGlassStretch(1.095, 2, 116, 3)).toBe(boundedGlassStretch(1.095, 0, 116, 3))
    expect(boundedGlassStretch(1.095, 1, 116, 3)).toBe(1.095)
  })
  it('selects the closest hit region without overflowing at the edges', () => {
    expect(tabAt(-50, 20, 320)).toBe(0)
    expect(tabAt(145, 20, 320)).toBe(1)
    expect(tabAt(200, 20, 320)).toBe(2)
    expect(tabAt(500, 20, 320)).toBe(3)
    expect(tabAt(20, 20, 300, 3)).toBe(0)
    expect(tabAt(170, 20, 300, 3)).toBe(1)
    expect(tabAt(319, 20, 300, 3)).toBe(2)
  })
  it('deforms more at speed, symmetrically and within a small bound', () => {
    const idle = glassDeformation(0), slow = glassDeformation(.1), fast = glassDeformation(2)
    expect(idle.stretch).toBeCloseTo(1.015)
    expect(slow.stretch).toBeGreaterThan(idle.stretch)
    expect(fast.stretch).toBeGreaterThan(slow.stretch)
    expect(fast.squeeze).toBeLessThan(slow.squeeze)
    expect(glassDeformation(-2)).toEqual(fast)
    expect(glassDeformation(100).stretch).toBeLessThanOrEqual(1.095)
    expect(glassDeformation(NaN)).toEqual(idle)
  })
  it('smooths velocity with elapsed time, not the number of touch events', () => {
    const full = glassVelocity(0, 16, 16)
    const half = glassVelocity(glassVelocity(0, 8, 8), 8, 8)
    expect(full).toBeCloseTo(half)
    expect(glassVelocity(.4, 5, 0)).toBe(.4)
    expect(glassVelocity(.4, NaN, 16)).toBe(.4)
    expect(glassVelocity(0, 1000, 16)).toBeLessThan(3)
    let velocity = 1
    for (let i = 0; i < 10; i++) velocity = glassVelocity(velocity, -16, 16)
    expect(velocity).toBeLessThan(-.9)
  })
  it('preserves the initial grab point, clamps edges and reverses continuously', () => {
    expect(draggedTab(1, 0, 320)).toBe(1)
    expect(draggedTab(1, 8, 320)).toBeCloseTo(1.1)
    expect(draggedTab(1, -8, 320)).toBeCloseTo(.9)
    expect(draggedTab(1, 0, 640)).toBe(1)
    expect(draggedTab(1, 999, 320)).toBe(3)
    expect(draggedTab(1, -999, 320)).toBe(0)
    expect(draggedTab(1, 999, 300, 3)).toBe(2)
    expect(draggedTab(1, -999, 300, 3)).toBe(0)
  })
})
