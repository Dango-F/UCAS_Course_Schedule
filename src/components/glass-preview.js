import { createGlassNavigation } from './glass-navigation.js'
import { HOP_TRAVEL_DURATION, HOP_SQUASH_DURATION } from './glass-hop.js'
import { DEFAULT_GLASS_CLARITY, normalizeGlassClarity } from '../domain/glass-material'
import { DEFAULT_HOP_PEAK } from '../domain/navigation-hop'

/** Real navigation physics over sample content; selections never change routes. */
export function createGlassPreview(root, initialClarity) {
  const doc = root.ownerDocument, win = doc.defaultView
  const button = root.querySelector('.glass-compare')
  const lensRoot = root.querySelector('.preview-lens-root')
  const normalize = value => {
    const next = typeof value === 'number' ? {clarity:value,navMotion:'hop',hopPeak:DEFAULT_HOP_PEAK} : value
    return {...next,hopPreviewRun:next.hopPreviewRun ?? 0,hopPreviewStop:next.hopPreviewStop ?? 0}
  }
  let config = normalize(initialClarity), clarity = normalizeGlassClarity(config.clarity), comparing = false, disposed = false
  let activeIndex = 0
  let pointer = null, heldKey = null
  let demoStart = null, demoReturn = null, demoVersion = 0
  const current = () => ({...config,activeIndex,clarity:comparing ? DEFAULT_GLASS_CLARITY : clarity})
  const lens = createGlassNavigation(lensRoot, current(), index => {
    cancelDemo()
    activeIndex = index
    syncSelection()
    lens.configure(current())
  })
  function syncSelection() {
    lensRoot.querySelectorAll('[data-nav-index]').forEach((item,i) => {
      item.classList.toggle('active',i===activeIndex)
      item.setAttribute('aria-pressed',String(i===activeIndex))
    })
  }
  function cancelDemo(reset = false) {
    demoVersion += 1
    clearTimeout(demoStart); clearTimeout(demoReturn)
    demoStart = demoReturn = null
    if (reset && !disposed) {
      activeIndex = 0
      syncSelection()
      lens.configure(current())
      lens.suspend()
    }
  }
  function showTab(index) {
    activeIndex = index
    syncSelection()
    lens.configure(current())
  }
  function runHopPreview() {
    cancelDemo(true)
    if (config.navMotion !== 'hop' || config.reducedMotion || win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const version = demoVersion
    // Paint the leftmost starting point before the first hop, then leave a
    // short beat at the right edge so the two jumps read separately.
    demoStart = setTimeout(() => {
      demoStart = null
      if (disposed || version !== demoVersion) return
      showTab(lensRoot.querySelectorAll('[data-nav-index]').length - 1)
      demoReturn = setTimeout(() => {
        demoReturn = null
        if (disposed || version !== demoVersion) return
        showTab(0)
      }, HOP_TRAVEL_DURATION + (config.qElastic === false ? 0 : HOP_SQUASH_DURATION) + 60)
    }, 32)
  }
  const listeners = []
  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options)
    listeners.push(() => target.removeEventListener(type, handler, options))
  }
  function showDefault(value) {
    if (disposed || comparing === value) return
    comparing = value
    root.dataset.comparing = String(value)
    button.setAttribute('aria-pressed', String(value))
    lens.configure(current())
  }
  function release() { pointer = null; heldKey = null; showDefault(false) }
  listen(button, 'pointerdown', event => {
    if (event.button > 0 || event.isPrimary === false) return
    pointer = event.pointerId
    showDefault(true)
  }, { passive:true })
  const finishPointer = event => { if (event.pointerId === pointer) release() }
  listen(doc, 'pointerup', finishPointer, { passive:true })
  listen(doc, 'pointercancel', finishPointer, { passive:true })
  listen(button, 'pointerleave', () => { if (pointer !== null) release() }, { passive:true })
  listen(button, 'keydown', event => {
    if (event.key === 'Escape' && comparing) { event.preventDefault(); event.stopPropagation(); release(); return }
    if (event.key !== ' ' && event.key !== 'Enter') return
    event.preventDefault()
    if (!event.repeat) { heldKey = event.key; showDefault(true) }
  })
  listen(doc, 'keyup', event => { if (event.key === heldKey) { event.preventDefault(); release() } })
  listen(button, 'blur', release)
  listen(win, 'blur', release)
  listen(doc, 'visibilitychange', () => { if (doc.hidden) release() })
  listen(lensRoot, 'pointerdown', () => cancelDemo(), { passive:true })
  listen(lensRoot, 'keydown', () => cancelDemo())
  return {
    configure(value) {
      if (disposed) return
      const previous = config
      config = normalize(value)
      clarity = normalizeGlassClarity(config.clarity)
      lens.configure(current())
      if (config.navMotion !== previous.navMotion || config.qElastic !== previous.qElastic || config.hopPreviewStop !== previous.hopPreviewStop) cancelDemo(true)
      if (config.hopPreviewRun !== previous.hopPreviewRun) runHopPreview()
    },
    destroy() { cancelDemo(); release(); disposed = true; listeners.forEach(remove => remove()); lens.destroy() }
  }
}
