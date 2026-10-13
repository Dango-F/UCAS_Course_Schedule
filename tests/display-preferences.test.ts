import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useScheduleStore } from '../src/stores/schedule'

describe('考核方式展示设置', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.stubGlobal('uni', { getStorageSync: vi.fn(() => ''), setStorageSync: vi.fn() })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('默认展示，保持原有课表呈现', () => {
    const store = useScheduleStore()
    expect(store.showExams).toBe(true)
    expect(store.schedule.courses.some(course => Boolean(course.exam))).toBe(true)
  })

  it('独立切换显示，不修改课程考核信息或其他显示设置', () => {
    const store = useScheduleStore()
    const original = JSON.stringify(store.schedule)
    store.showExams = false
    expect(store.showTeachers).toBe(true)
    expect(store.showSections).toBe(false)
    expect(JSON.stringify(store.schedule)).toBe(original)
    store.showExams = true
    expect(JSON.stringify(store.schedule)).toBe(original)
    expect(uni.setStorageSync).not.toHaveBeenCalled()
  })

  it('切周和切换示例场景不重置本次运行中的选择', () => {
    const store = useScheduleStore()
    store.showExams = false
    store.setWeek(5)
    expect(store.showExams).toBe(false)
    store.resetScenario('dense')
    expect(store.showExams).toBe(false)
  })
})
