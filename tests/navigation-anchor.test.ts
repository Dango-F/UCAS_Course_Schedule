import { describe, expect, it } from 'vitest'
import { calendarRowTop, CALENDAR_ROW_HEIGHT, navigationAnchorPercent } from '../src/components/calendar-geometry.js'

describe('navigation ninth-period anchor', () => {
  it('uses the same row and break geometry as the grid', () => {
    expect(calendarRowTop(1)).toBe(0)
    expect(calendarRowTop(5)).toBe(272)
    expect(calendarRowTop(9) + CALENDAR_ROW_HEIGHT / 2).toBe(542)
    expect(calendarRowTop(10)).toBe(604)
  })
  it.each([640, 844, 960])('keeps the same course center with canvas height %i', height => {
    const percent = navigationAnchorPercent(88, 70, height)
    expect(percent / 100 * height).toBeCloseTo(700)
  })
  it('accounts for status bar/header changes instead of using a fixed viewport percentage', () => {
    expect(navigationAnchorPercent(118, 70, 844) / 100 * 844).toBeCloseTo(730)
    expect(navigationAnchorPercent(88, 70, 0)).toBe(85)
  })
})
