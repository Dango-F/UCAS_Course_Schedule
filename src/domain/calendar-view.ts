import type { layoutTiles, Tile } from './schedule'
export type WeekPanel = {
  week: number
  month: number
  days: { day: number; label: string; date: number; iso: string }[]
  tiles: Tile[]
  groupsByDay: ReturnType<typeof layoutTiles>[number][][]
}
