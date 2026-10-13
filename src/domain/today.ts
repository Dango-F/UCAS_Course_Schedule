import { chinaDate, dateAt, teachingWeek, tilesForWeek, type Schedule, type Tile } from './schedule'

export type DatedTile = Tile & { actualDate: string }

const CLOCK_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/

function timestampAt(schedule: Schedule, date: string, section: number, edge: 'start' | 'end'): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const time = schedule.periods.find(period => period.section === section)?.[edge]
  if (!time || !CLOCK_TIME.test(time)) return null
  const timestamp = Date.parse(`${date}T${time}:00+08:00`)
  return Number.isFinite(timestamp) ? timestamp : null
}

export function tileStartTimestamp(schedule: Schedule, tile: Tile, date: string): number | null {
  return timestampAt(schedule, date, tile.start, 'start')
}

export function tileEndTimestamp(schedule: Schedule, tile: Tile, date: string): number | null {
  return timestampAt(schedule, date, tile.end, 'end')
}

export function tilesForDate(schedule: Schedule, date: string): DatedTile[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00+08:00`))) return []
  const localDate = new Date(`${date}T12:00:00+08:00`)
  const week = teachingWeek(schedule.semester.monday, localDate)
  if (week < 1 || week > schedule.semester.weeks) return []

  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay() || 7
  return tilesForWeek(schedule, week)
    .filter(tile => tile.meeting.day === weekday)
    .sort((a, b) => a.start - b.start)
    .map(tile => ({ ...tile, actualDate: date }))
}

export function currentTileOnDate(schedule: Schedule, date: string, now: Date): DatedTile | null {
  const timestamp = now.getTime()
  return tilesForDate(schedule, date).find(tile => {
    const start = tileStartTimestamp(schedule, tile, date)
    const end = tileEndTimestamp(schedule, tile, date)
    return start !== null && end !== null && start <= timestamp && timestamp < end
  }) ?? null
}

export function nextUpcomingTile(schedule: Schedule, now: Date): DatedTile | null {
  const firstWeek = Math.max(1, teachingWeek(schedule.semester.monday, now))
  if (firstWeek > schedule.semester.weeks) return null

  for (let week = firstWeek; week <= schedule.semester.weeks; week += 1) {
    const candidates = tilesForWeek(schedule, week).sort((a, b) => a.meeting.day - b.meeting.day || a.start - b.start)
    for (const tile of candidates) {
      const actualDate = chinaDate(dateAt(schedule.semester.monday, week, tile.meeting.day))
      const start = tileStartTimestamp(schedule, tile, actualDate)
      if (start !== null && start > now.getTime()) return { ...tile, actualDate }
    }
  }
  return null
}

export function tileHasEnded(schedule: Schedule, tile: DatedTile, now: Date): boolean {
  const end = tileEndTimestamp(schedule, tile, tile.actualDate)
  return end !== null && end <= now.getTime()
}
