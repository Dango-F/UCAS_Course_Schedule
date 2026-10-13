// Shared with the navigation anchor: never infer a period from viewport percent.
export const CALENDAR_ROW_HEIGHT = 60
export const CALENDAR_BREAK_HEIGHT = 32
export function calendarRowTop(section) {
  return (section - 1) * CALENDAR_ROW_HEIGHT
    + (section > 4 ? CALENDAR_BREAK_HEIGHT : 0)
    + (section > 9 ? CALENDAR_BREAK_HEIGHT : 0)
}

export function navigationAnchorPercent(headerHeight, headingHeight, canvasHeight) {
  if (!(canvasHeight > 0)) return 85
  const center = headerHeight + headingHeight + calendarRowTop(9) + CALENDAR_ROW_HEIGHT / 2
  return center / canvasHeight * 100
}
