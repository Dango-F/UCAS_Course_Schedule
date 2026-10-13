export type CalendarViewMode = 'grid' | 'list'
export type PreparedWeekView = { active: CalendarViewMode; grid: boolean; list: boolean }
export type PreparedWeekViews = Record<number, PreparedWeekView>

// Only the current week may retain both views. Neighbours switch one at a time
// after the current Vue update has had a chance to reach the screen.
export function createCalendarViewPreparation(publish: (views: PreparedWeekViews) => void) {
  let views: PreparedWeekViews = {}
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposed = false
  let initialized = false
  const single = (mode: CalendarViewMode): PreparedWeekView => ({ active: mode, grid: mode === 'grid', list: mode === 'list' })
  function cancel() { clearTimeout(timer); timer = undefined }
  function sync(current: number, mode: CalendarViewMode, available: number[]) {
    if (disposed) return
    cancel()
    const next: PreparedWeekViews = {}
    for (const week of available) {
      const previous = views[week]
      if (!initialized) next[week] = single(mode)
      else if (previous) next[week] = week === current ? previous : single(previous.active)
    }
    if (available.includes(current)) next[current] = { ...(next[current] || single(mode)), active: mode, [mode]: true }
    views = next
    initialized = true
    publish(views)
    const queue = available.filter(week => week !== current && views[week]?.active !== mode)
      .sort((a, b) => Math.abs(a - current) - Math.abs(b - current) || a - b)
    function prepareNext() {
      timer = undefined
      if (disposed) return
      const week = queue.shift()
      if (week === undefined) return
      views = { ...views, [week]: single(mode) }
      publish(views)
      if (queue.length) timer = setTimeout(prepareNext, 48)
    }
    if (queue.length) timer = setTimeout(prepareNext, 48)
  }
  return { sync, dispose() { disposed = true; cancel() } }
}
