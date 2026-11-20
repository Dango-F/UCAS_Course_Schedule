// Motion and optical paint share the display timestamp, including on variable-refresh screens.
export function createGlassFrameClock(win) {
  let next = new Map(), spare = new Map(), current = null, frame = 0, sequence = 0
  function flush(time) {
    frame = 0
    current = next
    next = spare
    try {
      for (const callback of current.values()) callback(time)
    } finally {
      current.clear()
      spare = current
      current = null
      if (next.size) frame = win.requestAnimationFrame(flush)
    }
  }
  return {
    request(callback) {
      const id = ++sequence
      next.set(id, callback)
      if (!frame && !current) frame = win.requestAnimationFrame(flush)
      return id
    },
    cancel(id) {
      next.delete(id)
      current?.delete(id)
      if (!next.size && frame) { win.cancelAnimationFrame(frame); frame = 0 }
    }
  }
}
