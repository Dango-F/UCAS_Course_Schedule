import { afterEach, beforeEach, expect, it, vi } from 'vitest'

beforeEach(() => { vi.resetModules(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('recreating the homepage cannot replay the cold-launch composition', async () => {
  const { claimLaunchScreen } = await import('../src/services/launch-screen')
  expect(claimLaunchScreen()).toBe(true)
  expect(claimLaunchScreen()).toBe(false)
})

it('a first-page failure still closes a manually held native splash', async () => {
  const closeSplashscreen = vi.fn()
  vi.stubGlobal('plus', { navigator: { closeSplashscreen } })
  const { protectNativeLaunchScreen } = await import('../src/services/launch-screen')
  protectNativeLaunchScreen()
  vi.advanceTimersByTime(2499)
  expect(closeSplashscreen).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(closeSplashscreen).toHaveBeenCalledOnce()
})

it('successful handoff cancels the fallback so it cannot close another screen later', async () => {
  const closeSplashscreen = vi.fn()
  vi.stubGlobal('plus', { navigator: { closeSplashscreen } })
  const { protectNativeLaunchScreen, closeNativeLaunchScreen } = await import('../src/services/launch-screen')
  protectNativeLaunchScreen()
  vi.advanceTimersByTime(100)
  closeNativeLaunchScreen()
  vi.advanceTimersByTime(3000)
  expect(closeSplashscreen).toHaveBeenCalledOnce()
})

it('a preview base with no native close API does not crash or leave a timer', async () => {
  vi.stubGlobal('plus', { navigator: { closeSplashscreen: () => { throw new Error('Unavailable') } } })
  const { protectNativeLaunchScreen, closeNativeLaunchScreen } = await import('../src/services/launch-screen')
  protectNativeLaunchScreen()
  expect(closeNativeLaunchScreen).not.toThrow()
  expect(vi.getTimerCount()).toBe(0)
})
