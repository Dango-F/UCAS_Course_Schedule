import { createGridGesture, GRID_HOLD_SLOP } from './calendar-grid-gesture.js'

// V2 keeps chronological slots and the built-in swiper's fractional-page
// distance/velocity decision, but gives release animation to the compositor.
export function settleWeek(position, velocity, maxWeek) {
  const flick = Math.abs(velocity) > 0.2 ? Math.sign(velocity) * 0.5 : 0
  return Math.max(0, Math.min(maxWeek - 1, Math.round(position + flick)))
}

export function weekDuration(distance, width, velocity) {
  const remaining = Math.abs(distance)
  if (remaining < 0.5) return 0
  const fraction = Math.min(1, remaining / width)
  // Scale time with sqrt(distance) so a slow release has similar acceleration
  // over short and long distances. Only momentum toward the target shortens it.
  const pagesPerSecond = Math.sign(distance) * velocity * 1000 / width
  const speed = Math.max(0, Math.min(1, pagesPerSecond / 3))
  return Math.round(Math.max(70, (240 - 60 * speed) * Math.sqrt(fraction)))
}

// For a Bézier easing, the initial speed in pixels/ms is
// (distance / duration) * (y1 / x1). The horizontal end tangent stops at the week.
export function weekReleaseEasing(distance, duration, velocity) {
  const slope = distance ? Math.max(0, velocity * duration / distance) : 0
  const x1 = 1 / Math.max(3, slope)
  const y1 = Math.min(1, slope / 3)
  return `cubic-bezier(${x1},${y1},.666667,1)`
}

// Progress on the velocity-matched release, displayed position, and slope.
// The 0/1/4/1/0% lag forms a cubic spline with continuous speed and acceleration.
const weekPullStops = [
  { offset: 0.40, position: 0.40, slope: 1 },
  { offset: 0.55, position: 0.54, slope: 0.8 },
  { offset: 0.70, position: 0.66, slope: 1 },
  { offset: 0.85, position: 0.84, slope: 1.2 },
  { offset: 1, position: 1, slope: 1 }
]
const weekPullSegments = weekPullStops.slice(0, -1).map((start, i) => {
  const end = weekPullStops[i + 1]
  // CSS Bézier control points are local to each keyframe interval.
  const scale = (end.offset - start.offset) / (3 * (end.position - start.position))
  const easing = `cubic-bezier(${1 / 3},${start.slope * scale},${2 / 3},${1 - end.slope * scale})`
  return { offset: start.offset, position: start.position, easing }
})

export function boundWeekPosition(position, last) {
  const rubber = distance => 0.5 - 0.25 / (distance + 0.5)
  return position < 0 ? -rubber(-position) : position > last ? last + rubber(position - last) : position
}

export function createStableWeekController(root, initialConfig, notify, editSlot) {
  const track = root.querySelector('.week-track')
  if (!track) return { destroy() {}, configure() {} }
  const quiet = root.ownerDocument?.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)')
  let config = initialConfig
  let width = root.getBoundingClientRect().width || 390
  let position = config.week - 1
  let destination = position
  let reported = position
  let gesture = null
  let listeningForMoves = false
  let settling = false
  let releaseAnimation = null
  let timer = 0
  let generation = 0
  let started = 0
  let duration = 0
  let suppressedUntil = 0
  const grid = editSlot ? createGridGesture(root, cancel, editSlot) : null
  let mouseEditing = false
  let destroyed = false
  let preparedPanels = []
  let preparedMin = position
  let preparedMax = position
  const now = () => performance.now()
  const translation = value => `translate3d(${-value * width}px,0,0)`
  function paint(value) {
    position = value
    track.style.transform = translation(value)
  }
  function visiblePosition() {
    const transform = getComputedStyle(track).transform
    const values = transform.slice(transform.indexOf('(') + 1, -1).split(',').map(Number)
    const x = transform.startsWith('matrix3d') ? values[12] : values[4]
    return Number.isFinite(x) ? -x / width : position
  }
  function stop() {
    if (releaseAnimation) {
      releaseAnimation.onfinish = null
      releaseAnimation.cancel()
      releaseAnimation = null
    }
    clearTimeout(timer)
    timer = 0
    generation += 1
    settling = false
    track.style.transition = 'none'
  }
  function refreshPreparedPanels() {
    // DOM acknowledgement, not a logic-layer guess. Updated even while the
    // finger is down; touchmove only reads these cached numeric bounds.
    preparedPanels = Array.from(root.querySelectorAll('[data-calendar-panel="ready"]')).map(panel => ({
      index: Number(panel.getAttribute('data-week')) - 1,
      scrollers: Array.from(panel.querySelectorAll('[data-calendar-view="active"] .uni-scroll-view'))
    })).filter(panel => Number.isInteger(panel.index))
    // Cached/partially prepared views can leave holes. Never let a gesture
    // cross an unready week just because a more distant week is ready.
    const ready = new Set(preparedPanels.map(panel => panel.index))
    preparedMin = preparedMax = reported
    if (ready.has(reported)) {
      while (ready.has(preparedMin - 1)) preparedMin -= 1
      while (ready.has(preparedMax + 1)) preparedMax += 1
    }
  }
  function resetOffscreenScroll(visible = position) {
    // Stable, full-width slots already tell us which pages are offscreen.
    // No per-panel getBoundingClientRect or forced geometry reads on touchstart.
    const tolerance = 1 / width
    for (const panel of preparedPanels) {
      if (panel.index + 1 > visible + tolerance && panel.index < visible + 1 - tolerance) continue
      panel.scrollers.forEach(scroller => {
        if (scroller.scrollTop) scroller.scrollTop = 0
      })
    }
  }
  function report() {
    if (reported === destination) return
    reported = destination
    notify({ week: destination + 1, revision: config.revision })
  }
  function finish(token) {
    if (destroyed || !settling || token !== generation) return
    stop()
    paint(destination)
    root.setAttribute('data-motion-phase', 'idle')
    resetOffscreenScroll()
    // The target was already reported at release; completion is visual only.
  }
  function settle(target, trackVelocity = 0) {
    stop()
    destination = Math.max(0, Math.min(config.maxWeek - 1, target))
    const distance = (destination - position) * width
    duration = config.reducedMotion || quiet?.matches ? 0 : weekDuration(distance, width, trackVelocity)
    settling = true
    const token = generation
    started = now()
    root.setAttribute('data-motion-phase', 'settling')
    const easing = weekReleaseEasing(distance, duration, trackVelocity)
    if (duration && track.animate) {
      const frames = [{ offset: 0, transform: translation(position) }]
      if (destination !== reported) {
        for (const segment of weekPullSegments) {
          const transform = translation(position + (destination - position) * segment.position)
          frames.push({ offset: segment.offset, transform, easing: segment.easing })
        }
      }
      frames.push({ offset: 1, transform: translation(destination) })
      releaseAnimation = track.animate(frames, { duration, easing })
      releaseAnimation.onfinish = () => finish(token)
    } else if (duration) {
      void track.offsetWidth
      track.style.transition = `transform ${duration}ms ${easing}`
    }
    paint(destination)
    if (duration && !releaseAnimation) timer = setTimeout(() => finish(token), duration + 50)
    // Like V3's change event, publish every release immediately. Waiting for
    // transitionend starves both headings and the +/-2 preload window during
    // regular quick interruptions. The browser owns the release interpolation.
    report()
    if (!duration) finish(token)
  }
  function point(event) {
    const points = event.touches?.length ? event.touches : event.changedTouches
    const finger = points?.[0]
    return finger && (!gesture || finger.identifier === gesture.id) ? finger : null
  }
  function start(event) {
    listenForMoves(true)
    if (event.touches?.length !== 1) { grid?.reset(); cancel(); return }
    const p = point(event)
    if (!p) return
    if (grid?.start(event, p)) return
    const interrupted = settling
    // Read the actually displayed position, not the previous target transform.
    const visible = interrupted ? visiblePosition() : position
    if (interrupted) {
      stop()
      paint(visible)
    }
    const last = config.maxWeek - 1
    const base = visible < 0 ? -(0.25 / (0.5 + visible) - 0.5)
      : visible > last ? last + 0.25 / (0.5 - (visible - last)) - 0.5 : visible
    gesture = {
      id: p.identifier, startX: p.clientX, startY: p.clientY, x: p.clientX,
      base, lastTime: now(), velocity: 0, axis: null, interrupted,
      sampleTime: event.timeStamp ?? now(), samplePosition: visible, trackVelocity: null,
      resume: destination
    }
    root.setAttribute('data-motion-phase', 'tracking')
  }
  function move(event) {
    if (event.touches?.length !== 1) { grid?.reset(); cancel(); return }
    const p = point(event)
    if (!p) return
    if (grid?.move(p)) { if (event.cancelable) event.preventDefault(); return }
    if (!gesture) return
    const dx = p.clientX - gesture.startX, dy = p.clientY - gesture.startY
    const distance = Math.max(Math.abs(dx), Math.abs(dy))
    if (!gesture.axis) {
      if (distance < 3) return
      gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
      if (gesture.axis === 'horizontal') resetOffscreenScroll()
    }
    if (gesture.axis !== 'horizontal') {
      // After the grid hold is cancelled, a vertical swipe belongs entirely to
      // the native scroller. It no longer needs a blocking handler on each move.
      if (distance >= GRID_HOLD_SLOP) listenForMoves(false)
      return
    }
    if (event.cancelable) event.preventDefault()
    const time = now()
    const elapsed = Math.max(1, time - gesture.lastTime)
    gesture.velocity = (elapsed > 90 ? 0 : gesture.velocity * 0.6) + 0.4 * (gesture.x - p.clientX) / elapsed
    gesture.x = p.clientX
    gesture.lastTime = time
    suppressedUntil = time + 360
    const raw = gesture.base - dx / width
    // A slow bridge must never let an interrupted gesture expose an empty slot.
    const bounded = boundWeekPosition(raw, config.maxWeek - 1)
    const min = preparedMin > 0 ? preparedMin : -0.5
    const max = preparedMax < config.maxWeek - 1 ? preparedMax : config.maxWeek - 0.5
    paint(Math.max(min, Math.min(max, bounded)))
    // The rubber band and prepared-panel bounds can move less than the finger.
    // Measure the displayed track using input timestamps, independent of frame rate.
    const sampleTime = event.timeStamp ?? time
    const dt = sampleTime - gesture.sampleTime
    if (dt > 0) {
      const measured = (position - gesture.samplePosition) * width / dt
      const weight = 1 - Math.exp(-dt / 24)
      gesture.trackVelocity = gesture.trackVelocity == null ? measured : gesture.trackVelocity + weight * (measured - gesture.trackVelocity)
      gesture.sampleTime = sampleTime
      gesture.samplePosition = position
    }
  }
  function end(event) {
    listenForMoves(true)
    if (grid?.finish()) {
      // A handled tap can open the editor under the finger. Suppress the
      // compatibility click before it can dismiss that newly mounted sheet.
      if (event.cancelable) event.preventDefault()
      return
    }
    if (!gesture) return
    const value = gesture
    gesture = null
    if (value.axis !== 'horizontal') {
      if (value.interrupted) settle(value.resume)
      else root.setAttribute('data-motion-phase', 'idle')
      return
    }
    suppressedUntil = now() + 360
    const velocity = now() - value.lastTime > 90 ? 0 : value.velocity
    const target = Math.max(preparedMin, Math.min(preparedMax, settleWeek(position, velocity, config.maxWeek)))
    const age = Math.max(0, (event.timeStamp ?? now()) - value.sampleTime)
    // Let a stopped finger lose its momentum before the existing 90 ms hold cutoff.
    const retained = Math.max(0, Math.min(1, (90 - age) / 58))
    settle(target, (value.trackVelocity ?? 0) * retained)
  }
  function cancel() {
    if (!gesture) return
    const value = gesture
    gesture = null
    if (value.axis === 'horizontal' || value.interrupted) settle(value.resume)
    else root.setAttribute('data-motion-phase', 'idle')
  }
  function transitionEnd(event) {
    if (event.target !== track || event.propertyName !== 'transform' || !settling) return
    if (now() - started < duration - 20 || Math.abs(visiblePosition() - destination) * width > 1) return
    finish(generation)
  }
  function click(event) {
    if (!grid?.suppressClick() && now() >= suppressedUntil) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  function configure(next) {
    if (destroyed || next.revision === config.revision) return
    stop()
    gesture = null
    grid?.reset()
    config = next
    destination = reported = Math.max(0, Math.min(config.maxWeek - 1, config.week - 1))
    width = root.getBoundingClientRect().width || width
    paint(destination)
    root.setAttribute('data-motion-phase', 'idle')
    refreshPreparedPanels()
    resetOffscreenScroll()
  }
  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
    const nextWidth = root.getBoundingClientRect().width
    if (!nextWidth || Math.abs(nextWidth - width) < 0.5) return
    stop()
    gesture = null
    width = nextWidth
    paint(destination)
    root.setAttribute('data-motion-phase', 'idle')
    resetOffscreenScroll()
    report()
  })
  resizeObserver?.observe(root)
  refreshPreparedPanels()
  const panelObserver = new MutationObserver(refreshPreparedPanels)
  panelObserver.observe(track, { childList: true, subtree: true, attributes: true,
    attributeFilter: ['data-calendar-panel', 'data-calendar-view'] })
  const detachObserver = new MutationObserver(() => { if (!root.isConnected) destroy() })
  if (root.ownerDocument?.body) detachObserver.observe(root.ownerDocument.body, { childList: true, subtree: true })
  function listenForMoves(enabled) {
    if (listeningForMoves === enabled) return
    listeningForMoves = enabled
    if (enabled) root.addEventListener('touchmove', move, { capture: true, passive: false })
    else root.removeEventListener('touchmove', move, true)
  }
  function cancelTouch() { listenForMoves(true); grid?.reset(); cancel() }
  function mouseDown(e) {
    if (e.button !== 0 || !grid || e.sourceCapabilities?.firesTouchEvents) return
    mouseEditing = true
    if (grid.start(e, e)) e.preventDefault()
  }
  function mouseMove(e) { if (mouseEditing && grid?.move(e)) e.preventDefault() }
  function mouseUp() { if (mouseEditing) grid?.finish(); mouseEditing = false }
  if (grid) {
    root.addEventListener('mousedown', mouseDown, true)
    root.ownerDocument.addEventListener('mousemove', mouseMove, true)
    root.ownerDocument.addEventListener('mouseup', mouseUp, true)
  }
  root.addEventListener('touchstart', start, { capture: true, passive: true })
  listenForMoves(true)
  root.addEventListener('touchend', end, { capture: true, passive: false })
  root.addEventListener('touchcancel', cancelTouch, { capture: true, passive: true })
  root.addEventListener('click', click, true)
  track.addEventListener('transitionend', transitionEnd)
  function preferenceChanged(event) { if (event.matches && settling) finish(generation) }
  quiet?.addEventListener?.('change', preferenceChanged)
  paint(position)
  root.setAttribute('data-motion-phase', 'idle')
  function destroy() {
    if (destroyed) return
    destroyed = true
    stop()
    gesture = null
    resizeObserver?.disconnect()
    panelObserver.disconnect()
    detachObserver.disconnect()
    if (grid) {
      grid.destroy()
      root.removeEventListener('mousedown', mouseDown, true)
      root.ownerDocument.removeEventListener('mousemove', mouseMove, true)
      root.ownerDocument.removeEventListener('mouseup', mouseUp, true)
    }
    root.removeEventListener('touchstart', start, true)
    listenForMoves(false)
    root.removeEventListener('touchend', end, true)
    root.removeEventListener('touchcancel', cancelTouch, true)
    root.removeEventListener('click', click, true)
    track.removeEventListener('transitionend', transitionEnd)
    quiet?.removeEventListener?.('change', preferenceChanged)
  }
  return { configure, destroy, dismissGridAdd: () => grid?.dismissGridAdd() }
}
