const CARD_DURATION = 120
const CARD_STAGGER = 26
const MAX_DURATION = 250
const SURFACE_FADE = 70

function animateList(list, opening, animations) {
  const viewport = list.getBoundingClientRect()
  const cards = []
  // Cards are laid out vertically in timetable order. Everything after the
  // first card below the viewport is outside this group of entrance effects.
  for (const card of list.querySelectorAll('.course-card')) {
    const bounds = card.getBoundingClientRect()
    if (bounds.top >= viewport.bottom) break
    if (bounds.bottom > viewport.top) cards.push(card)
  }
  const intervals = Math.max(0, cards.length - 1)
  const spread = Math.min(intervals * CARD_STAGGER, MAX_DURATION - CARD_DURATION)
  const total = cards.length ? CARD_DURATION + spread : SURFACE_FADE
  // The selected layer owns the resting appearance, even if WebView drops a finish event.
  const timing = { duration: total, fill: 'none', direction: opening ? 'normal' : 'reverse' }
  animations.push(list.animate([
    { opacity: 0, easing: 'ease-out' },
    { opacity: 1, offset: SURFACE_FADE / total },
    { opacity: 1 }
  ], timing))

  const from = { transform: `translateX(-${Math.min(72, viewport.width * .18)}px)`, opacity: 0 }
  const to = { transform: 'translateX(0)', opacity: 1 }
  cards.forEach((card, index) => {
    const delay = intervals ? spread * index / intervals : 0
    // Hold the endpoints on one reversible timeline. A nonzero endDelay would
    // move these transform/opacity animations off the Chromium compositor.
    const frames = []
    if (delay > 0) frames.push({ ...from, offset: 0 })
    frames.push(
      { ...from, offset: delay / total, easing: 'cubic-bezier(.23,.55,.28,1)' },
      { ...to, offset: (delay + CARD_DURATION) / total }
    )
    if (delay < spread) frames.push({ ...to, offset: 1 })
    animations.push(card.animate(frames, timing))
  })
}

export function observeCalendarListMotion(root, onSettled) {
  const doc = root.ownerDocument
  const quiet = doc.defaultView.matchMedia('(prefers-reduced-motion: reduce)')
  let { currentWeek, viewMode, viewRevision } = root.dataset
  let panel = null, waiting = null, animations = []
  let recoveryTimer

  function clear() {
    clearTimeout(recoveryTimer)
    waiting?.disconnect()
    waiting = null
    if (animations.length) {
      animations[0].onfinish = null
      animations[0].oncancel = null
    }
    for (const animation of animations) animation.cancel()
    animations = []
    panel?.removeAttribute('data-list-preparing')
    panel?.removeAttribute('data-list-animating')
    panel = null
  }

  function reportSettled() {
    if (Number(viewRevision)) onSettled({ week: Number(currentWeek), mode: viewMode, revision: Number(viewRevision) })
  }

  function finish() {
    if (!panel) return
    clear()
    reportSettled()
  }

  // A suspended timeline or an interrupted mount may deliver no animation events.
  function armRecovery() {
    clearTimeout(recoveryTimer)
    recoveryTimer = setTimeout(finish, MAX_DURATION + 100)
  }

  function switchView() {
    const sameWeek = currentWeek === root.dataset.currentWeek
    const toggled = viewMode && viewMode !== root.dataset.viewMode
    const newRevision = viewRevision !== root.dataset.viewRevision
    currentWeek = root.dataset.currentWeek
    viewMode = root.dataset.viewMode
    viewRevision = root.dataset.viewRevision
    const hidden = doc.hidden || root.dataset.visible === 'false'
    if (!sameWeek || hidden || quiet.matches || root.dataset.quiet === 'true' || !root.animate) {
      const interrupted = Boolean(panel)
      clear()
      if (interrupted || toggled || newRevision) reportSettled()
      return
    }
    if (!toggled) {
      // Multiple taps can reach the App view layer in a single patch.
      if (newRevision && !panel) reportSettled()
      return
    }
    if (panel) {
      if (!animations.length) {
        finish() // The first tap's destination has not painted yet.
        return
      }
      try {
        for (const animation of animations) animation.reverse()
        armRecovery()
      } catch {
        finish()
      }
      return
    }

    panel = root.querySelector(`.week-panel-content[data-week="${currentWeek}"]`)
    if (!panel) { reportSettled(); return }
    function startWhenReady() {
      const list = panel?.querySelector('.week-list-layer')
      if (!list?.querySelector('.course-card, .empty-state') || !panel.querySelector('.week-grid-layer .week-content')) return false
      waiting?.disconnect()
      waiting = null
      panel.removeAttribute('data-list-preparing')
      panel.setAttribute('data-list-animating', '')
      try {
        animateList(list, viewMode === 'list', animations)
      } catch {
        // Also release effects already started if a later card could not animate.
        finish()
        return true
      }
      const surface = animations[0]
      surface.onfinish = () => {
        if (animations[0] === surface && surface.playState === 'finished') finish()
      }
      surface.oncancel = () => { if (animations[0] === surface) finish() }
      armRecovery()
      return true
    }
    if (!startWhenReady()) {
      panel.setAttribute('data-list-preparing', viewMode)
      waiting = new MutationObserver(startWhenReady)
      waiting.observe(panel, { childList: true, subtree: true })
      armRecovery()
    }
  }

  const changes = new MutationObserver(switchView)
  changes.observe(root, { attributes: true, attributeFilter: ['data-view-mode', 'data-current-week', 'data-view-revision', 'data-quiet', 'data-visible'] })
  doc.addEventListener('visibilitychange', finish)
  function preferenceChanged(event) { if (event.matches) finish() }
  quiet.addEventListener?.('change', preferenceChanged)
  reportSettled() // The user may have switched views before renderjs was mounted.
  return () => {
    changes.disconnect()
    doc.removeEventListener('visibilitychange', finish)
    quiet.removeEventListener?.('change', preferenceChanged)
    clear()
  }
}
