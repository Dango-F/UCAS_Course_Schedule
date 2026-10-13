const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0))
export function materialEase(progress) {
  const t = clamp(progress)
  return t * t * (3 - 2 * t)
}

// Clear through the middle of a hop, softly restoring the resting face while
// the capsule shrinks. Both endpoints follow the existing shape clock exactly.
export function hopMaterialProgress(lift) { return materialEase(clamp(lift) * 2) }

// Flow's position spring is authoritative: restoration ends at visual arrival,
// not when its slower pressure/shape springs finish. Retarget from visible tint.
export function flowMaterialFrame(from, held, elapsed, distance, remaining) {
  const initial = clamp(from)
  const travelling = !held && distance > .5
  const progress = travelling
    ? clamp(1 - Math.max(0, remaining - .5) / (distance - .5))
    : clamp(elapsed / 160)
  const p = materialEase(progress)
  const value = held ? initial + (1 - initial) * p
    : initial * (1 - p) + (travelling ? Math.sin(Math.PI * p) ** 2 * (1 - initial) : 0)
  return { value:progress === 1 ? (held ? 1 : 0) : value, done:progress === 1 }
}
