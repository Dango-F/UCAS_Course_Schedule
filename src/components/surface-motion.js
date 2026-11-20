// The entering surface responds immediately and settles at rest. Exits from
// rest have zero endpoint velocities so a readable surface can travel away.
export const SURFACE_ENTER_EASING = 'cubic-bezier(.24,.56,.34,1)'
export const SURFACE_EXIT_EASING = 'cubic-bezier(.32,0,.68,1)'

// The compositor interpolates a single scalar (translation or opacity).
// Sample the eased timeline only when a gesture reverses an ongoing motion.
export function createSurfaceMotion(element, property, format, initial) {
  let start = initial, target = initial, animation = null
  function value() {
    if (!animation) return target
    const progress = animation.effect.getComputedTiming().progress ?? 0
    return start + (target - start) * progress
  }
  function cancel() {
    if (!animation) return
    animation.onfinish = null
    animation.cancel()
    animation = null
  }
  function play(next, duration, easing, finished) {
    const from = value()
    cancel()
    start = from
    target = next
    element.style[property] = format(next)
    if (!duration || from === next) { finished?.(); return }
    const effect = element.animate([{ [property]: format(from) }, { [property]: format(next) }],
      { duration, easing, fill: 'both' })
    animation = effect
    effect.onfinish = () => {
      if (animation !== effect) return
      cancel()
      finished?.()
    }
  }
  return { value, play, cancel, finish: () => animation?.finish() }
}
