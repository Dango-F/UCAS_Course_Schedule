// View-layer gesture math. Distances are CSS pixels, velocity is px/ms.
export function releaseTarget(offset, velocity, width, week, maxWeek) {
  const distance = Math.abs(offset)
  const aligned = Math.sign(velocity) === Math.sign(offset)
  const threshold = Math.min(62, width * 0.18)
  const flick = distance >= 22 && Math.abs(velocity) >= 0.45 && aligned
  const target = distance >= threshold || flick ? (offset < 0 ? 1 : -1) : 0
  return week + target < 1 || week + target > maxWeek ? 0 : target
}

export function releaseDuration(offset, target, width, velocity) {
  const remaining = Math.abs(-target * width - offset)
  if (remaining < 0.5) return 0
  const fraction = Math.min(1, remaining / width)
  const speed = Math.min(1, Math.abs(velocity) / 1.5)
  return Math.round(target === 0
    ? Math.max(100, 110 + fraction * 110 - speed * 15)
    : Math.max(150, Math.min(280, 160 + fraction * 110 - speed * 30)))
}

export function dragOffset(raw, width, week, maxWeek) {
  const bounded = (raw > 0 && week <= 1) || (raw < 0 && week >= maxWeek)
  return Math.max(-width, Math.min(width, bounded ? raw * 0.14 : raw))
}

export function sampleVelocity(samples, now) {
  const recent = samples.filter(sample => now - sample.time <= 90)
  if (recent.length < 2) return 0
  const first = recent[0], last = recent[recent.length - 1]
  const elapsed = last.time - first.time
  return elapsed > 0 ? (last.x - first.x) / elapsed : 0
}
