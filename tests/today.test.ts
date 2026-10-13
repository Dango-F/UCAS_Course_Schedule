import { describe, expect, it } from 'vitest'
import { makeDemo } from '../src/data/demo'
import { currentTileOnDate, nextUpcomingTile, tileHasEnded, tilesForDate } from '../src/domain/today'

describe('今日课程时间线', () => {
  it('按日期、教学周和单双周筛选课程', () => {
    const schedule = makeDemo('normal')
    expect(tilesForDate(schedule, '2026-09-07').map(tile => tile.course.id)).toEqual(['math'])
    expect(tilesForDate(schedule, '2026-09-14').map(tile => tile.course.id)).toEqual(['math', 'science'])
    expect(tilesForDate(schedule, '2026-09-13')).toEqual([])
  })

  it('上课时返回当前课，下一节只返回之后开课的课程', () => {
    const schedule = makeDemo('normal')
    const now = new Date('2026-09-14T09:00:00+08:00')
    expect(currentTileOnDate(schedule, '2026-09-14', now)?.course.id).toBe('math')
    expect(nextUpcomingTile(schedule, now)).toMatchObject({ course: { id: 'science' }, actualDate: '2026-09-14' })
  })

  it('精确处理开课和下课边界，不把刚下课的课当作当前课', () => {
    const schedule = makeDemo('normal')
    expect(currentTileOnDate(schedule, '2026-09-14', new Date('2026-09-14T08:30:00+08:00'))?.course.id).toBe('math')
    expect(currentTileOnDate(schedule, '2026-09-14', new Date('2026-09-14T10:05:00+08:00'))).toBeNull()
    expect(currentTileOnDate(schedule, '2026-09-14', new Date('2026-09-14T13:30:00+08:00'))?.course.id).toBe('science')
  })

  it('跨到下一教学日、开学前和学期结束后都能正确寻找下一节', () => {
    const schedule = makeDemo('normal')
    expect(nextUpcomingTile(schedule, new Date('2026-09-07T21:51:00+08:00'))).toMatchObject({
      course: { id: 'english' }, actualDate: '2026-09-08'
    })
    expect(nextUpcomingTile(schedule, new Date('2026-08-30T12:00:00+08:00'))?.actualDate).toBe('2026-08-31')
    expect(nextUpcomingTile(schedule, new Date('2027-02-01T12:00:00+08:00'))).toBeNull()
  })

  it('完成状态按课程结束时间计算', () => {
    const schedule = makeDemo('normal')
    const math = tilesForDate(schedule, '2026-09-14')[0]
    expect(tileHasEnded(schedule, math, new Date('2026-09-14T10:05:00+08:00'))).toBe(true)
    expect(tileHasEnded(schedule, math, new Date('2026-09-14T10:04:59+08:00'))).toBe(false)
  })
})
