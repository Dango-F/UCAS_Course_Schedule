import { computed, reactive } from 'vue'
import { describe, expect, it } from 'vitest'
import { calendarListDays } from '../src/domain/calendar-list-view'
import type { WeekPanel } from '../src/domain/calendar-view'
import { makeDemo } from '../src/data/demo'
import { compactNumbers, hasTileConflict, layoutTiles, tilesForWeek } from '../src/domain/schedule'

function fixture() {
  const schedule = makeDemo('normal')
  const tiles = tilesForWeek(schedule, 1)
  const groups = layoutTiles(tiles)
  const panel: WeekPanel = {
    week: 1, month: 9, tiles,
    days: Array.from('一二三四五六日', (label, i) => ({ day: i + 1, label, date: i + 7, iso: `2026-09-${String(i + 7).padStart(2, '0')}` })),
    groupsByDay: Array.from({ length: 7 }, (_, i) => groups.filter(group => group.day === i + 1))
  }
  return { schedule, panel }
}

describe('cached list presentation', () => {
  it('preserves every tile, time, section, location and conflict label', () => {
    const { schedule, panel } = fixture()
    const days = calendarListDays(panel, schedule.periods)
    expect(days.flatMap(day => day.groups.flatMap(group => group.cards))).toHaveLength(panel.tiles.length)
    for (const day of days) for (const group of day.groups) {
      expect(group.conflict).toBe(hasTileConflict(group.group.tiles))
      for (const card of group.cards) {
        expect(card.start).toBe(schedule.periods.find(period => period.section === card.tile.start)?.start)
        expect(card.end).toBe(schedule.periods.find(period => period.section === card.tile.end)?.end)
        expect(card.sections).toBe(compactNumbers(Array.from({ length: card.tile.end - card.tile.start + 1 }, (_, i) => card.tile.start + i)))
        expect(card.location).toBe(card.tile.meeting.location.trim())
        expect(card.label).toContain(card.tile.course.name)
        expect(card.label.includes('有课程冲突')).toBe(group.conflict)
      }
    }
  })
  it('retains fallbacks and omits days without courses', () => {
    const { panel } = fixture()
    panel.tiles.forEach(tile => { tile.meeting.location = ' ' })
    const days = calendarListDays(panel, [])
    expect(days.every(day => day.groups.length > 0)).toBe(true)
    expect(days[0].groups[0].cards[0]).toMatchObject({ start: '待确认', end: '待确认', location: '地点待确认' })
    expect(calendarListDays({ ...panel, tiles: [], groupsByDay: Array.from({ length: 7 }, () => []) }, [])).toEqual([])
  })
  it('reuses computed presentation until a relevant field changes', () => {
    const { schedule, panel } = reactive(fixture())
    const view = computed(() => calendarListDays(panel, schedule.periods))
    const first = view.value
    expect(view.value).toBe(first)
    first[0].groups[0].cards[0].tile.meeting.location = '新教室'
    expect(view.value).not.toBe(first)
    expect(view.value[0].groups[0].cards[0].location).toBe('新教室')
  })
})
