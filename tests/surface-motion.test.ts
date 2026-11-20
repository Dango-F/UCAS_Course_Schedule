import { describe, expect, it, vi } from 'vitest'
import { createSurfaceMotion } from '../src/components/surface-motion.js'

function surface() {
  let progress = 0
  const effects: Array<{ frames: Keyframe[]; cancel: ReturnType<typeof vi.fn>; onfinish: null | (() => void) }> = []
  const element = {
    style: { opacity: '' },
    animate(frames: Keyframe[]) {
      const effect = { frames, cancel: vi.fn(), onfinish: null, effect: { getComputedTiming: () => ({ progress }) } }
      effects.push(effect)
      return effect
    }
  }
  const motion = createSurfaceMotion(element, 'opacity', String, 0)
  return { motion, effects, element, advance(value: number) { progress = value } }
}

describe('reversible browser animation', () => {
  it('starts a reversal at the current eased value and ignores an obsolete finish event', () => {
    const f = surface(), entered = vi.fn(), left = vi.fn()
    f.motion.play(1, 250, 'ease', entered)
    const oldFinish = f.effects[0].onfinish!
    f.advance(.63)
    f.motion.play(0, 250, 'ease', left)
    expect(f.effects[1].frames).toEqual([{ opacity: '0.63' }, { opacity: '0' }])
    oldFinish()
    expect(entered).not.toHaveBeenCalled()
    f.effects[1].onfinish!()
    expect(left).toHaveBeenCalledOnce()
    expect(f.element.style.opacity).toBe('0')
    expect(f.motion.value()).toBe(0)
  })
  it('applies the final value immediately in reduced motion and cancels a pending animation on disposal', () => {
    const f = surface(), finished = vi.fn()
    f.motion.play(1, 0, 'linear', finished)
    expect(f.effects).toHaveLength(0)
    expect(f.element.style.opacity).toBe('1')
    f.motion.play(0, 200, 'ease', finished)
    const stale = f.effects[0].onfinish!
    f.motion.cancel()
    stale()
    expect(finished).toHaveBeenCalledOnce()
    expect(f.effects[0].cancel).toHaveBeenCalledOnce()
  })
})
