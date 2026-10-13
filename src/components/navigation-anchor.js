import { navigationAnchorPercent } from './calendar-geometry.js'

// These measurable references stay mounted across tabs and list/grid modes.
// No scroll listener or permanent frame loop: navigation must not chase rows
// while the timetable scrolls. CSS clamps the anchor above the safe bottom.
export function createNavigationAnchor(root) {
  const win = root.ownerDocument.defaultView
  const canvas = root.closest('.phone-canvas')
  const header = canvas.querySelector('.top-area')
  const heading = canvas.querySelector('.navigation-anchor-heading')
  let frame = 0, disposed = false, last = ''
  function update() {
    frame = 0
    if (disposed || !canvas.clientHeight) return
    const value = navigationAnchorPercent(header.getBoundingClientRect().height,
      heading.getBoundingClientRect().height, canvas.clientHeight).toFixed(6) + '%'
    if (value !== last) {
      last = value
      root.style.setProperty('--navigation-anchor-center', value)
    }
  }
  function schedule() {
    if (!disposed && !frame) frame = win.requestAnimationFrame(update)
  }
  const observer = win.ResizeObserver ? new win.ResizeObserver(schedule) : null
  for (const element of [canvas, header, heading]) observer?.observe(element)
  win.addEventListener('resize', schedule)
  win.visualViewport?.addEventListener('resize', schedule)
  update()
  return { destroy() {
    disposed = true
    win.cancelAnimationFrame(frame)
    observer?.disconnect()
    win.removeEventListener('resize', schedule)
    win.visualViewport?.removeEventListener('resize', schedule)
    root.style.removeProperty('--navigation-anchor-center')
  } }
}
