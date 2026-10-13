import { dragOffset, releaseDuration, releaseTarget, sampleVelocity } from './swipe-motion.js'

// One controller owns BOTH dragging and settling transforms. Vue only commits
// week content after settling. Never hand the same style back and forth.
export function createSwipeController(root, notify) {
  const track = root.querySelector('.calendar-track')
  if (!track) return { destroy() {} }
  let width = root.getBoundingClientRect().width || 390
  let phase = 'idle'
  let offset = 0
  let target = 0
  let generation = 0
  let timer = 0
  let settleStart = 0
  let duration = 0
  let commitWeek = 0
  let gesture = null
  let queuedRelease = null
  let suppressUntil = 0
  let destroyed = false
  const now = () => performance.now()
  const config = () => ({
    week: Number(root.getAttribute('data-week')) || 1,
    maxWeek: Number(root.getAttribute('data-max-week')) || 1,
    reduced: root.getAttribute('data-reduced-motion') === 'true'
  })
  function paint(value) {
    offset = value
    track.style.transform = `translate3d(calc(-33.333333% + ${value}px), 0, 0)`
  }
  function clearSettle() {
    clearTimeout(timer)
    timer = 0
  }
  function readVisibleOffset() {
    const transform = getComputedStyle(track).transform
    const values = transform.slice(transform.indexOf('(') + 1, -1).split(',').map(Number)
    const x = transform.startsWith('matrix3d') ? values[12] : values[4]
    return Number.isFinite(x) ? x + width : offset
  }
  function point(event) {
    const list = event.touches?.length ? event.touches : event.changedTouches
    const touch = Array.from(list || []).find(item => !gesture || item.identifier === gesture.id)
    return touch ? { x: touch.clientX, y: touch.clientY, id: touch.identifier } : null
  }
  function sample(p) {
    if (!gesture) return
    const time = now()
    gesture.x = p.x
    gesture.y = p.y
    gesture.samples.push({ x: p.x, time })
    gesture.samples = gesture.samples.filter(item => time - item.time <= 100).slice(-8)
  }
  function finish() {
    if (phase !== 'settling') return
    clearSettle()
    track.style.transition = 'none'
    paint(-target * width)
    const value = config()
    commitWeek = value.week + target
    phase = target ? 'committing' : 'idle'
    notify('onRenderSwipeSettled', { target, generation })
  }
  function settle(nextTarget, velocity = 0) {
    clearSettle()
    target = nextTarget
    phase = 'settling'
    generation += 1
    const token = generation
    duration = config().reduced ? 0 : releaseDuration(offset, target, width, velocity)
    settleStart = now()
    notify('onRenderSwipeEnd', { target, generation, moved: true })
    // A single release-time flush makes even a tiny return transition reliable.
    // No layout is read on the touchmove path.
    void track.offsetWidth
    track.style.transition = duration ? `transform ${duration}ms cubic-bezier(.22,.68,.36,1)` : 'none'
    paint(-target * width)
    if (!duration) { finish(); return }
    timer = setTimeout(() => {
      if (!destroyed && generation === token) finish()
    }, duration + 40)
  }
  function applyGesture() {
    if (!gesture || gesture.axis !== 'horizontal' || phase === 'committing') return
    const value = config()
    const dx = gesture.x - gesture.startX
    paint(dragOffset(gesture.base + dx, width, value.week, value.maxWeek))
  }
  function release(value) {
    const c = config()
    if (value.cancelled) { settle(0); return }
    if (value.horizontal) {
      paint(dragOffset(value.base + value.dx, width, c.week, c.maxWeek))
      settle(releaseTarget(offset, value.velocity, width, c.week, c.maxWeek), value.velocity)
    } else if (value.interrupted) {
      // A tap/vertical scroll during an animation resumes its intended page.
      settle(value.resumeTarget)
    }
  }
  function checkCommit() {
    if (phase !== 'committing') return
    const c = config()
    if (c.week !== commitWeek || root.getAttribute('data-state') !== 'idle') return
    const panels = Array.from(track.children)
    const expected = [Math.max(1, c.week - 1), c.week, Math.min(c.maxWeek, c.week + 1)]
    if (panels.length !== 3 || panels.some((panel, index) =>
      Number(panel.getAttribute('data-week')) !== expected[index] ||
      Number(panel.querySelector('.week-content')?.getAttribute('data-week')) !== expected[index]
    )) return
    // MutationObserver runs after the actual view DOM commit, before painting.
    // Reset the track in this layer, not on a logic-layer rAF guess.
    phase = 'idle'
    track.style.transition = 'none'
    paint(0)
    if (gesture) {
      gesture.base = 0
      applyGesture()
    }
    if (queuedRelease) {
      const value = queuedRelease
      queuedRelease = null
      release(value)
    }
  }
  function start(event) {
    if (event.touches?.length !== 1) { cancel(); return }
    const p = point(event)
    if (!p) return
    width = root.getBoundingClientRect().width || width
    const interrupted = phase === 'settling'
    if (interrupted) {
      const visible = readVisibleOffset()
      clearSettle()
      generation += 1
      phase = 'idle'
      track.style.transition = 'none'
      paint(visible)
      notify('onRenderSwipeInterrupt', { generation })
    }
    const c = config()
    const boundary = (offset > 0 && c.week <= 1) || (offset < 0 && c.week >= c.maxWeek)
    gesture = {
      id: p.id, startX: p.x, startY: p.y, x: p.x, y: p.y,
      base: phase === 'committing' ? 0 : boundary ? offset / 0.14 : offset,
      axis: null, interrupted, resumeTarget: target,
      samples: [{ x: p.x, time: now() }]
    }
  }
  function move(event) {
    if (!gesture) return
    if (event.touches?.length !== 1) { cancel(); return }
    const p = point(event)
    if (!p) return
    sample(p)
    const dx = p.x - gesture.startX, dy = p.y - gesture.startY
    if (!gesture.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 4) return
      gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
      if (gesture.axis === 'horizontal') notify('onRenderSwipeAxis', {})
    }
    if (gesture.axis !== 'horizontal') return
    if (event.cancelable) event.preventDefault()
    suppressUntil = now() + 360
    applyGesture()
  }
  function end(event) {
    if (!gesture) return
    const p = point(event)
    if (p) sample(p)
    const value = {
      horizontal: gesture.axis === 'horizontal',
      dx: gesture.x - gesture.startX, base: gesture.base,
      velocity: sampleVelocity(gesture.samples, now()),
      interrupted: gesture.interrupted, resumeTarget: gesture.resumeTarget
    }
    gesture = null
    if (value.horizontal) suppressUntil = now() + 360
    if (phase === 'committing') { queuedRelease = value; return }
    release(value)
  }
  function cancel() {
    if (!gesture) return
    const needsReturn = gesture.axis === 'horizontal' || gesture.interrupted
    gesture = null
    if (!needsReturn) return
    suppressUntil = now() + 360
    if (phase === 'committing') { queuedRelease = { cancelled: true }; return }
    settle(0)
  }
  function transitionEnd(event) {
    if (event.target !== track || event.propertyName !== 'transform' || phase !== 'settling') return
    // A cancelled transition's late event must not complete a newer motion.
    if (now() - settleStart < duration - 20 || Math.abs(readVisibleOffset() + target * width) > 1) return
    finish()
  }
  function click(event) {
    if (now() >= suppressUntil) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  const observer = new MutationObserver(checkCommit)
  observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-week', 'data-state'] })
  // App renderjs does not support unmount hooks. Also dispose when its DOM
  // leaves the document, including switching comparison versions/navigation.
  const detachObserver = new MutationObserver(() => {
    if (!root.isConnected) destroy()
  })
  if (root.ownerDocument?.body) detachObserver.observe(root.ownerDocument.body, { childList: true, subtree: true })
  // Capture on the stable root. Remounting scroll-view children never drops
  // a gesture or requires scanning/rebinding all course descendants.
  root.addEventListener('touchstart', start, { passive: true, capture: true })
  root.addEventListener('touchmove', move, { passive: false, capture: true })
  root.addEventListener('touchend', end, { passive: true, capture: true })
  root.addEventListener('touchcancel', cancel, { passive: true, capture: true })
  root.addEventListener('click', click, true)
  track.addEventListener('transitionend', transitionEnd)
  paint(0)
  function destroy() {
    if (destroyed) return
    destroyed = true
    clearSettle()
    observer.disconnect()
    detachObserver.disconnect()
    root.removeEventListener('touchstart', start, true)
    root.removeEventListener('touchmove', move, true)
    root.removeEventListener('touchend', end, true)
    root.removeEventListener('touchcancel', cancel, true)
    root.removeEventListener('click', click, true)
    track.removeEventListener('transitionend', transitionEnd)
    gesture = null
    queuedRelease = null
  }
  return { destroy }
}
