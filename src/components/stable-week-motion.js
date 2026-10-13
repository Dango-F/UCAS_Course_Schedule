// V2 keeps chronological slots and the built-in swiper's fractional-page
// distance/velocity decision, but gives release animation to the compositor.
export function settleWeek(position, velocity, maxWeek) {
  const flick = Math.abs(velocity) > 0.2 ? Math.sign(velocity) * 0.5 : 0
  return Math.max(0, Math.min(maxWeek - 1, Math.round(position + flick)))
}

export function weekDuration(remaining, width, velocity) {
  if (remaining < 0.5) return 0
  const fraction = Math.min(1, remaining / width)
  const speed = Math.min(1, Math.abs(velocity) / 1.2)
  // Slow drags ease out gently; fast repeated flicks retain a short finish.
  return Math.round(Math.max(120, 150 + fraction * 110 - speed * 45))
}

export function boundWeekPosition(position, last) {
  const rubber = distance => 0.5 - 0.25 / (distance + 0.5)
  return position < 0 ? -rubber(-position) : position > last ? last + rubber(position - last) : position
}

export function createStableWeekController(root, initialConfig, notify) {
  const track = root.querySelector('.week-track')
  if (!track) return { destroy() {}, configure() {} }
  let config = initialConfig
  let width = root.getBoundingClientRect().width || 390
  let position = config.week - 1
  let destination = position
  let reported = position
  let gesture = null
  let settling = false
  let timer = 0
  let generation = 0
  let started = 0
  let duration = 0
  let suppressedUntil = 0
  let destroyed = false
  let preparedPanels = []
  let preparedMin = position
  let preparedMax = position
  const now = () => performance.now()
  function paint(value) {
    position = value
    track.style.transform = `translate3d(${-value * width}px,0,0)`
  }
  function visiblePosition() {
    const transform = getComputedStyle(track).transform
    const values = transform.slice(transform.indexOf('(') + 1, -1).split(',').map(Number)
    const x = transform.startsWith('matrix3d') ? values[12] : values[4]
    return Number.isFinite(x) ? -x / width : position
  }
  function stop() {
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
  function settle(target, velocity = 0) {
    stop()
    destination = Math.max(0, Math.min(config.maxWeek - 1, target))
    duration = config.reducedMotion ? 0 : weekDuration(Math.abs(destination - position) * width, width, velocity)
    settling = true
    const token = generation
    started = now()
    root.setAttribute('data-motion-phase', 'settling')
    // One release-time flush commits even a tiny drag before CSS transitions.
    // No rAF loop, reactive updates or layout reads on the movement path.
    if (duration) void track.offsetWidth
    track.style.transition = duration ? `transform ${duration}ms cubic-bezier(.22,.68,.36,1)` : 'none'
    paint(destination)
    if (duration) timer = setTimeout(() => finish(token), duration + 50)
    // Like V3's change event, publish every release immediately. Waiting for
    // transitionend starves both headings and the +/-2 preload window during
    // regular quick interruptions. CSS remains the sole animation owner.
    report()
    if (!duration) finish(token)
  }
  function point(event) {
    const points = event.touches?.length ? event.touches : event.changedTouches
    return Array.from(points || []).find(p => !gesture || p.identifier === gesture.id)
  }
  function start(event) {
    if (event.touches?.length !== 1) { cancel(); return }
    const p = point(event)
    if (!p) return
    const interrupted = settling
    // Read the actually displayed position, not the previous target transform.
    const visible = interrupted ? visiblePosition() : position
    stop()
    paint(visible)
    resetOffscreenScroll()
    const last = config.maxWeek - 1
    const base = visible < 0 ? -(0.25 / (0.5 + visible) - 0.5)
      : visible > last ? last + 0.25 / (0.5 - (visible - last)) - 0.5 : visible
    gesture = {
      id: p.identifier, startX: p.clientX, startY: p.clientY, x: p.clientX,
      base, lastTime: now(), velocity: 0, axis: null, interrupted,
      resume: destination
    }
    root.setAttribute('data-motion-phase', 'tracking')
  }
  function move(event) {
    if (!gesture) return
    if (event.touches?.length !== 1) { cancel(); return }
    const p = point(event)
    if (!p) return
    const dx = p.clientX - gesture.startX, dy = p.clientY - gesture.startY
    if (!gesture.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 3) return
      gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
    }
    if (gesture.axis !== 'horizontal') return
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
  }
  function end() {
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
    settle(target, velocity)
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
    if (now() >= suppressedUntil) return
    event.preventDefault()
    event.stopImmediatePropagation()
  }
  function configure(next) {
    if (destroyed || next.revision === config.revision) return
    stop()
    gesture = null
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
  root.addEventListener('touchstart', start, { capture: true, passive: true })
  root.addEventListener('touchmove', move, { capture: true, passive: false })
  root.addEventListener('touchend', end, { capture: true, passive: true })
  root.addEventListener('touchcancel', cancel, { capture: true, passive: true })
  root.addEventListener('click', click, true)
  track.addEventListener('transitionend', transitionEnd)
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
    root.removeEventListener('touchstart', start, true)
    root.removeEventListener('touchmove', move, true)
    root.removeEventListener('touchend', end, true)
    root.removeEventListener('touchcancel', cancel, true)
    root.removeEventListener('click', click, true)
    track.removeEventListener('transitionend', transitionEnd)
  }
  return { configure, destroy }
}
