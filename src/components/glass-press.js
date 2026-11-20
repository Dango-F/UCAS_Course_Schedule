/** A scrollable preview keeps its optical press until the original finger lifts.
 * Native panning ends the pointer stream but still delivers passive touch events. */
export function listenGlassPress(root, listen, down, move, finish, allowPagePan) {
  const doc = root.ownerDocument
  const passive = {passive:true}
  listen(doc, 'pointermove', move, passive)
  if (!allowPagePan) {
    listen(root, 'pointerdown', down, passive)
    listen(doc, 'pointerup', event => finish(event), passive)
    listen(doc, 'pointercancel', event => finish(event, true), passive)
    return
  }

  let pointerId = null, touchId = null, panning = false
  const capture = {passive:true, capture:true}
  listen(root, 'pointerdown', event => {
    if (event.pointerType === 'touch' && event.isPrimary !== false) {
      pointerId = event.pointerId
      touchId = null
      panning = false
    }
    down(event)
  }, passive)
  listen(root, 'touchstart', event => {
    if (pointerId !== null && event.touches.length === 1) touchId = event.changedTouches[0].identifier
  }, capture)
  listen(doc, 'pointerup', event => {
    if (!panning || event.pointerId !== pointerId) finish(event)
  }, passive)
  listen(doc, 'pointercancel', event => {
    if (event.pointerId === pointerId && touchId !== null) panning = true
    else finish(event, true)
  }, passive)
  function changedFinger(event) {
    for (const finger of event.changedTouches) {
      if (finger.identifier === touchId) return finger
    }
  }
  listen(doc, 'touchmove', event => {
    if (!panning) return
    const finger = changedFinger(event)
    if (finger) move({pointerId, clientX:finger.clientX, clientY:finger.clientY})
  }, capture)
  function endTouch(event) {
    if (touchId === null || (event.touches.length && !changedFinger(event))) return
    // A native scroll must never activate the tab underneath the release.
    if (pointerId !== null && (panning || event.type === 'touchcancel')) finish({pointerId}, true)
    pointerId = touchId = null
    panning = false
  }
  listen(doc, 'touchend', endTouch, capture)
  listen(doc, 'touchcancel', endTouch, capture)
}
