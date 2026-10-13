import type { WeekPanel } from './calendar-view'
import { compactNumbers, hasTileConflict, type Period } from './schedule'

export function calendarListDays(panel: WeekPanel, periods: Period[]) {
  const times = new Map(periods.map(period => [period.section, period]))
  return panel.days.map((day, index) => ({
    ...day,
    groups: panel.groupsByDay[index].map(group => {
      const conflict = hasTileConflict(group.tiles)
      return {
        group, conflict,
        cards: group.tiles.map(tile => {
          const start = times.get(tile.start)?.start || '待确认'
          const end = times.get(tile.end)?.end || '待确认'
          const sections = compactNumbers(Array.from({ length: tile.end - tile.start + 1 }, (_, i) => tile.start + i))
          const location = tile.meeting.location.trim() || '地点待确认'
          const label = ['周' + day.label, tile.course.name, start + ' 至 ' + end, '第' + sections + '节', location]
          if (conflict) label.push('有课程冲突')
          return { tile, start, end, sections, location, label: label.join('，') }
        })
      }
    })
  })).filter(day => day.groups.length > 0)
}
