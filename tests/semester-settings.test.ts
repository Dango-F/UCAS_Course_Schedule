import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { makeDemo } from '../src/data/demo'
import { syncSavedWidgetSchedule } from '../src/services/widget-sync'
import { useScheduleStore } from '../src/stores/schedule'

vi.mock('../src/services/widget-sync', () => ({ syncSavedWidgetSchedule: vi.fn(() => Promise.resolve()) }))

function fixture(persisted = true) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-20T04:00:00Z'))
  const initial = { ...makeDemo('normal'), importedAt: '2026-08-31T04:00:00Z' }
  let saved = persisted ? JSON.stringify(initial) : ''
  const write = vi.fn((_key: string, value: string) => { saved = value })
  vi.stubGlobal('uni', { getStorageSync: () => saved, setStorageSync: write })
  setActivePinia(createPinia())
  return { store: useScheduleStore(), initial, write, saved: () => JSON.parse(saved) }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('教学周设置', () => {
  it('保存日期和周数，重新计算当前周并同步小组件', () => {
    const { store, initial, saved } = fixture()
    expect(store.updateSemesterTiming('2026-11-09', 24)).toBe(true)
    expect(store.week).toBe(2)
    expect(saved()).toEqual({ ...initial, semester: { ...initial.semester, monday: '2026-11-09', weeks: 24, confirmed: true } })
    expect(syncSavedWidgetSchedule).toHaveBeenCalledWith(store.schedule)
    setActivePinia(createPinia())
    expect(useScheduleStore().schedule.semester).toEqual(saved().semester)
  })

  it('仅缩短总周数时将浏览周次限制在新范围内', () => {
    const { store } = fixture()
    store.setWeek(19)
    expect(store.updateSemesterTiming('2026-08-31', 16)).toBe(true)
    expect(store.week).toBe(16)
  })

  it('拒绝非周一、无效周数和会隐藏现有安排的缩短操作', () => {
    const { store, write } = fixture()
    expect(() => store.updateSemesterTiming('2026-11-10', 20)).toThrow('周一')
    expect(() => store.updateSemesterTiming('2026-02-30', 20)).toThrow('周一')
    expect(() => store.updateSemesterTiming('2026-08-31', 31)).toThrow('整数')
    expect(() => store.updateSemesterTiming('2026-08-31', 15)).toThrow('至少保留 16 周')
    expect(write).not.toHaveBeenCalled()
    expect(syncSavedWidgetSchedule).not.toHaveBeenCalled()
  })

  it('本地写入失败时保留当前课表和浏览周次', () => {
    const { store, write } = fixture()
    const previous = store.schedule
    const week = store.week
    write.mockImplementationOnce(() => { throw new Error('disk full') })
    expect(store.updateSemesterTiming('2026-11-09', 24)).toBe(false)
    expect(store.schedule).toBe(previous)
    expect(store.week).toBe(week)
    expect(syncSavedWidgetSchedule).not.toHaveBeenCalled()
  })

  it('允许调整示例学期而不写入正式课表', () => {
    const { store, write } = fixture(false)
    expect(store.updateSemesterTiming('2026-11-09', 24)).toBe(true)
    expect(store.schedule.semester).toMatchObject({ monday: '2026-11-09', weeks: 24, confirmed: false })
    expect(store.isDemo).toBe(true)
    expect(write).not.toHaveBeenCalled()
    expect(syncSavedWidgetSchedule).not.toHaveBeenCalled()
  })
})
