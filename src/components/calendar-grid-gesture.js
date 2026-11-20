import { calendarRowTop, CALENDAR_ROW_HEIGHT } from './calendar-geometry.js'

export const GRID_HOLD_SLOP = 5

// Runs in the same WebView as the week pager. Only a confirmed slot crosses
// the renderjs bridge. Until the hold timer fires, normal scrolling wins.
export function createGridGesture(root, onHold, submit) {
  let press, selection, timer, ignoreClicksUntil = 0
  let scrollFrame = 0, scrollSpeed = 0, lastScrollTime = 0, scrollRemainder = 0
  const bound = (value, low, high) => Math.max(low, Math.min(high, value))
  function stopScrolling() {
    cancelAnimationFrame(scrollFrame)
    scrollFrame = scrollSpeed = scrollRemainder = 0
  }
  function reset() {
    clearTimeout(timer)
    stopScrolling()
    press = null
    selection?.view.remove()
    selection = null
  }
  function cell(area, point, snap) {
    const bounds = area.getBoundingClientRect()
    if (!bounds.width) return null
    const x = point.clientX - bounds.left
    const y = point.clientY - bounds.top
    if (!snap && (x < 0 || x >= bounds.width || y < 0 || y >= bounds.height)) return null
    const rows = area.parentElement.querySelectorAll('[data-section]')
    let nearest = null, distance = Infinity
    for (const row of rows) {
      const section = Number(row.dataset.section)
      const offset = y - calendarRowTop(section)
      if (!snap && (offset < 0 || offset >= CALENDAR_ROW_HEIGHT)) continue
      const d = Math.abs(offset - CALENDAR_ROW_HEIGHT / 2)
      if (d < distance) { distance = d; nearest = section }
    }
    return nearest === null ? null : { section: nearest, day: bound(Math.floor(x * 7 / bounds.width) + 1, 1, 7), last: Number(rows[rows.length - 1].dataset.section) }
  }
  function paint() {
    const { view, slot } = selection
    view.style.left = 'calc(' + (slot.day - 1) * 100 / 7 + '% + 1px)'
    view.style.top = calendarRowTop(slot.start) + 2 + 'px'
    view.style.height = calendarRowTop(slot.end) - calendarRowTop(slot.start) + CALENDAR_ROW_HEIGHT - 4 + 'px'
    const caption = view.querySelector('.grid-drag-caption')
    if (caption) caption.textContent = slot.start === slot.end ? '第' + slot.start + '节' : slot.start + '–' + slot.end + '节'
  }
  function button(label, action, className) {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = className
    el.dataset.gridAction = action
    el.textContent = label
    return el
  }
  function showSlot(tile) {
    const s = selection
    if (tile) Object.assign(s.slot, { start: tile.start, end: tile.end, tileId: tile.id })
    s.view.textContent = ''
    const top = button('━', 'start', 'grid-drag-handle')
    const bottom = button('━', 'end', 'grid-drag-handle')
    top.setAttribute('aria-label', '拖动调整开始节次')
    bottom.setAttribute('aria-label', '拖动调整结束节次')
    const edit = button(tile ? '编辑' : '添加', 'body', 'grid-drag-edit')
    const caption = document.createElement('span')
    caption.className = 'grid-drag-caption'
    edit.prepend(caption)
    s.view.append(top, edit, bottom)
    paint()
  }
  function activate() {
    const { body, target, x, y } = press
    const area = body.querySelector('.course-layer')
    if (!area?.isConnected || !target.isConnected) { reset(); return }
    const hit = cell(area, { clientX: x, clientY: y }, false)
    if (!hit) { reset(); return }
    const card = target.closest('[data-grid-tiles]')
    const candidates = card ? JSON.parse(card.dataset.gridTiles).filter(t => t.start <= hit.section && t.end >= hit.section) : []
    press.area = area
    press.hit = hit
    onHold()
    const view = document.createElement('div')
    view.className = 'grid-drag-selection'
    area.appendChild(view)
    selection = { area, view, scroller: area.closest('.uni-scroll-view'), slot: { week: Number(area.closest('.week-content').dataset.week), day: hit.day, start: hit.section, end: hit.section } }
    if (candidates.length > 1) {
      press.action = 'choose'
      selection.candidates = candidates
      view.classList.add('grid-drag-choices')
      for (const [index, tile] of candidates.entries()) view.appendChild(button(tile.name, 'pick-' + index, 'grid-drag-choice'))
      paint()
    } else {
      showSlot(candidates[0])
      press.action = candidates.length ? 'body' : 'range'
      press.original = { ...selection.slot }
    }
  }
  function start(event, point) {
    if (selection?.pending) return true
    clearTimeout(timer)
    const action = event.target.closest?.('[data-grid-action]')?.dataset.gridAction
    if (selection && action && selection.view.contains(event.target)) {
      press = { action, area: selection.area, hit: cell(selection.area, point, true), original: { ...selection.slot }, repeat: true }
      return true
    }
    reset()
    const body = event.target.closest?.('.calendar-body')
    if (!body) return false
    ignoreClicksUntil = 0
    // Ordinary scrolling and course taps finish before a slot needs measuring.
    press = { body, target: event.target, x: point.clientX, y: point.clientY }
    timer = setTimeout(activate, 450)
    return false
  }
  function updateSlot(point) {
    const hit = cell(press.area, point, true)
    if (!hit) return
    const slot = selection.slot, before = press.original
    const { start, end, day } = slot
    if (press.action === 'range') {
      slot.start = Math.min(before.start, hit.section)
      slot.end = Math.max(before.start, hit.section)
    } else if (press.action === 'start') slot.start = Math.min(before.end, hit.section)
    else if (press.action === 'end') slot.end = Math.max(before.start, hit.section)
    else {
      const length = before.end - before.start
      slot.start = bound(before.start + hit.section - press.hit.section, 1, hit.last - length)
      slot.end = slot.start + length
      slot.day = hit.day
    }
    press.changed = slot.start !== before.start || slot.end !== before.end || slot.day !== before.day
    if (slot.start !== start || slot.end !== end || slot.day !== day) paint()
  }
  function scrollEdge(time) {
    scrollFrame = 0
    if (!press?.point || !selection?.scroller || !scrollSpeed) return
    const elapsed = bound(time - lastScrollTime, 0, 32)
    lastScrollTime = time
    const distance = scrollRemainder + scrollSpeed * elapsed
    const step = Math.trunc(distance)
    scrollRemainder = distance - step
    if (step) {
      const scroller = selection.scroller
      const before = scroller.scrollTop
      scroller.scrollTop += step
      if (scroller.scrollTop === before) { stopScrolling(); return }
      updateSlot(press.point)
    }
    scrollFrame = requestAnimationFrame(scrollEdge)
  }
  function move(point) {
    if (!press) return false
    if (!selection) {
      if (Math.max(Math.abs(point.clientX - press.x), Math.abs(point.clientY - press.y)) >= GRID_HOLD_SLOP) reset()
      return false
    }
    if (!press.original || press.action.startsWith('pick-')) return true
    press.point = point
    if (selection.scroller) {
      const rect = selection.scroller.getBoundingClientRect()
      const top = bound((rect.top + 30 - point.clientY) / 30, 0, 1)
      const bottom = bound((point.clientY - rect.bottom + 50) / 50, 0, 1)
      const nextSpeed = .36 * (bottom - top) // CSS pixels/ms, previously 6 pixels per 60 Hz frame
      if (Math.sign(nextSpeed) !== Math.sign(scrollSpeed)) stopScrolling()
      scrollSpeed = nextSpeed
      if (scrollSpeed && !scrollFrame) {
        lastScrollTime = performance.now()
        scrollFrame = requestAnimationFrame(scrollEdge)
      }
    }
    updateSlot(point)
    return true
  }
  function finish() {
    stopScrolling()
    if (!selection || !press) { clearTimeout(timer); press = null; return false }
    ignoreClicksUntil = Date.now() + 450
    if (press.action.startsWith('pick-')) {
      const tile = selection.candidates[Number(press.action.slice(5))]
      selection.view.classList.remove('grid-drag-choices')
      showSlot(tile)
    } else if (press.action === 'range' || press.changed || (press.repeat && press.action === 'body')) {
      const slot = selection.slot
      if (slot.tileId) reset()
      else {
        // Keep the original rectangle visible until the add flow closes.
        selection.pending = true
        selection.view.classList.add('is-pending')
        selection.view.setAttribute('inert', '')
        selection.view.setAttribute('aria-hidden', 'true')
      }
      submit(slot)
    }
    press = null
    return true
  }
  function outside(e) {
    if (selection && !selection.pending && !selection.view.contains(e.target)) reset()
  }
  function dismissGridAdd() { if (selection?.pending) reset() }
  function contextMenu(e) { if (press || selection) e.preventDefault() }
  const doc = root.ownerDocument
  doc.addEventListener('pointerdown', outside, true)
  root.addEventListener('contextmenu', contextMenu)
  function destroy() {
    reset()
    doc.removeEventListener('pointerdown', outside, true)
    root.removeEventListener('contextmenu', contextMenu)
  }
  return { start, move, finish, reset, dismissGridAdd, destroy, suppressClick: () => Date.now() < ignoreClicksUntil }
}
