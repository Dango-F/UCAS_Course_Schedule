export type CalendarViewMode = 'grid' | 'list'
type ViewChange = { week: number; mode: CalendarViewMode; revision: number }
export type PreparedWeekView = { active: CalendarViewMode; grid: boolean; list: boolean }
export type PreparedWeekViews = Record<number, PreparedWeekView>

// Only the current week may retain both views. Neighbours switch one at a time
// after the current Vue update has had a chance to reach the screen.
export function createCalendarViewPreparation(publish: (views: PreparedWeekViews) => void) {
  let views: PreparedWeekViews = {}
  let timer: ReturnType<typeof setTimeout> | undefined
  let fallback: ReturnType<typeof setTimeout> | undefined
  let queue: number[] = []
  let currentWeek = 0
  let targetMode: CalendarViewMode = 'grid'
  let revision = 0
  let waitingForMotion = false
  let disposed = false
  const single = (mode: CalendarViewMode): PreparedWeekView => ({ active: mode, grid: mode === 'grid', list: mode === 'list' })

  function scheduleNext() {
    if (disposed || timer !== undefined || !queue.length) return
    if (waitingForMotion && Math.abs(queue[0] - currentWeek) > 1) return
    timer = setTimeout(() => {
      timer = undefined
      const week = queue.shift()
      if (week === undefined) return
      views = { ...views, [week]: single(targetMode) }
      publish(views)
      scheduleNext()
    }, 48)
  }

  function settle(change: ViewChange) {
    if (!waitingForMotion || change.revision !== revision || change.week !== currentWeek || change.mode !== targetMode) return
    clearTimeout(fallback)
    waitingForMotion = false
    scheduleNext()
  }

  function sync(current: number, mode: CalendarViewMode, available: number[], animate = true) {
    if (disposed) return revision
    clearTimeout(timer)
    timer = undefined
    const firstLoad = currentWeek === 0
    if (current !== currentWeek || mode !== targetMode || !animate) {
      clearTimeout(fallback)
      waitingForMotion = animate && current === currentWeek && mode !== targetMode
      if (waitingForMotion) {
        const change = { week: current, mode, revision: ++revision }
        // Recover the distant swipe slots if the WebView never delivers completion.
        fallback = setTimeout(() => settle(change), 1500)
      }
    }
    currentWeek = current
    targetMode = mode
    const next: PreparedWeekViews = {}
    for (const week of available) {
      const previous = views[week]
      if (firstLoad) next[week] = single(mode)
      else if (previous) next[week] = week === current ? previous : single(previous.active)
    }
    if (available.includes(current)) next[current] = { ...(next[current] || single(mode)), active: mode, [mode]: true }
    views = next
    queue = available.filter(week => week !== current && views[week]?.active !== mode)
      .sort((a, b) => Math.abs(a - current) - Math.abs(b - current) || a - b)
    publish(views)
    scheduleNext()
    return revision
  }

  function dispose() {
    disposed = true
    clearTimeout(timer)
    clearTimeout(fallback)
    queue = []
  }
  return { sync, settle, dispose }
}
