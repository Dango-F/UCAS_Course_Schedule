import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCalendarViewPreparation, type PreparedWeekViews } from '../src/components/calendar-view-preparation'

describe('bounded calendar view preparation', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  function fixture() {
    let views: PreparedWeekViews = {}
    const publish = vi.fn((next: PreparedWeekViews) => { views = next })
    const preparation = createCalendarViewPreparation(publish)
    preparation.sync(3, 'grid', [1, 2, 3, 4, 5])
    return { ...preparation, publish, views: () => views }
  }
  it('switches only the current week immediately, then one nearest neighbour per task', () => {
    const f = fixture()
    f.sync(3, 'list', [1, 2, 3, 4, 5])
    expect(Object.values(f.views()).filter(view => view.active === 'list')).toHaveLength(1)
    expect(f.views()[3]).toEqual({ active: 'list', grid: true, list: true })
    vi.advanceTimersByTime(48)
    expect(f.views()[2].active).toBe('list')
    expect(f.views()[4].active).toBe('grid')
    vi.advanceTimersByTime(48)
    expect(f.views()[4].active).toBe('list')
    vi.runAllTimers()
    expect(Object.values(f.views()).every(view => view.active === 'list')).toBe(true)
    expect(Object.values(f.views()).reduce((count, view) => count + Number(view.grid) + Number(view.list), 0)).toBe(6)
    f.dispose()
  })
  it('reuses current-week views and cancels stale work during rapid toggles', () => {
    const f = fixture()
    f.sync(3, 'list', [1, 2, 3, 4, 5])
    vi.advanceTimersByTime(48)
    f.sync(3, 'grid', [1, 2, 3, 4, 5])
    expect(f.views()[3]).toEqual({ active: 'grid', grid: true, list: true })
    vi.runAllTimers()
    expect(Object.values(f.views()).every(view => view.active === 'grid')).toBe(true)
    f.dispose()
  })
  it('evicts off-window weeks and keeps at most one alternate view when changing weeks', () => {
    const f = fixture()
    f.sync(3, 'list', [1, 2, 3, 4, 5])
    f.sync(4, 'list', [2, 3, 4, 5, 6])
    expect(f.views()[1]).toBeUndefined()
    expect(f.views()[3]).toEqual({ active: 'list', grid: false, list: true })
    expect(f.views()[4]).toEqual({ active: 'list', grid: true, list: true })
    vi.runAllTimers()
    expect(Object.keys(f.views())).toEqual(['2', '3', '4', '5', '6'])
    expect(Object.values(f.views()).filter(view => view.grid && view.list)).toHaveLength(1)
    f.dispose()
  })
  it('handles semester edges and external jumps without preparing old weeks', () => {
    const f = fixture()
    f.sync(3, 'list', [1, 2, 3, 4, 5])
    f.sync(20, 'list', [18, 19, 20])
    expect(Object.keys(f.views())).toEqual(['20'])
    vi.runAllTimers()
    expect(Object.keys(f.views())).toEqual(['18', '19', '20'])
    f.dispose()
  })
  it('does not publish deferred work after disposal', () => {
    const f = fixture()
    f.sync(3, 'list', [1, 2, 3, 4, 5])
    f.dispose()
    const count = f.publish.mock.calls.length
    vi.runAllTimers()
    f.sync(4, 'grid', [2, 3, 4, 5, 6])
    expect(f.publish).toHaveBeenCalledTimes(count)
  })
})
