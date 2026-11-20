import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const base = 'https://github.com/Dango-F/UCAS_Course_Schedule'
const hash = 'a'.repeat(64)
let saved: unknown
const request = vi.fn()
const network = vi.fn()
const openURL = vi.fn()

function published(code = 3, version = '1.1.0') {
  const tag = 'v' + version
  const asset = (name: string) => ({ name, size: 1024, state: 'uploaded', browser_download_url: base + '/releases/download/' + tag + '/' + name })
  return {
    release: { tag_name: tag, draft: false, prerelease: false, assets: [asset('update.json'), { ...asset('schedule.apk'), digest: 'sha256:' + hash }], body: '本次更新' },
    meta: { versionCode: code, versionName: version, apk: 'schedule.apk', sha256: hash }
  }
}
function respond({ release, meta } = published()) {
  request.mockResolvedValueOnce({ statusCode: 200, data: JSON.stringify(release) })
    .mockResolvedValueOnce({ statusCode: 200, data: JSON.stringify(meta) })
}
async function launch() {
  const api = await import('../src/services/app-update')
  api.enterUpdateForeground()
  return api
}
beforeEach(() => {
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-21T12:00:00Z'))
  saved = undefined
  request.mockReset()
  network.mockReset().mockResolvedValue({ networkType: 'wifi' })
  vi.stubGlobal('plus', { os: { name: 'Android' }, runtime: { versionCode: '2', version: '1.0.0', openURL } })
  vi.stubGlobal('uni', { request, getNetworkType: network, getStorageSync: () => saved,
    setStorageSync: (_key: string, value: unknown) => { saved = JSON.parse(JSON.stringify(value)) } })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it('shares the in-flight manual/automatic check and binds the manifest to the same release', async () => {
  const api = await launch()
  respond()
  const pending = api.checkUpdate(false)
  expect(api.checkUpdate(true)).toBe(pending)
  expect(await pending).toMatchObject({ kind: 'available', release: { versionCode: 3, notes: '本次更新' } })
  expect(request.mock.calls.map(([options]) => options.url)).toEqual([
    'https://api.github.com/repos/Dango-F/UCAS_Course_Schedule/releases/latest', base + '/releases/download/v1.1.0/update.json'
  ])
  api.openReleasePage(api.availableUpdate.value!)
  expect(openURL).toHaveBeenCalledWith(base + '/releases/tag/v1.1.0', expect.any(Function))
})
it('restores the result across restarts and checks again just after local midnight', async () => {
  vi.setSystemTime(new Date(2026, 10, 21, 23, 59, 30))
  let api = await launch()
  respond()
  await api.checkUpdate(false)
  vi.resetModules()
  api = await launch()
  vi.advanceTimersByTime(29_999)
  expect((await api.checkUpdate(false)).kind).toBe('available')
  expect(request).toHaveBeenCalledTimes(2)
  vi.advanceTimersByTime(1)
  respond(published(2, '1.0.0'))
  expect((await api.checkUpdate(false)).kind).toBe('current')
  expect(api.availableUpdate.value).toBeNull()
})
it('reminds the next day, skips only the selected build and still lets a manual check find it', async () => {
  const api = await launch()
  respond()
  await api.checkUpdate(false)
  const r = api.availableUpdate.value!
  api.dismissUpdate(r, false)
  expect(api.mayRemind(r)).toBe(false)
  vi.advanceTimersByTime(86_400_000)
  expect(api.mayRemind(r)).toBe(true)
  api.dismissUpdate(r, true)
  respond()
  expect((await api.checkUpdate(true)).kind).toBe('available')
  expect(api.mayRemind(r)).toBe(false)
  respond(published(4, '1.2.0'))
  await api.checkUpdate(true)
  expect(api.mayRemind(api.availableUpdate.value!)).toBe(true)
})
it('does not use the Web resource version to offer an APK to a newer installation', async () => {
  vi.stubGlobal('plus', { os: { name: 'Android' }, runtime: { versionCode: '15', version: '2.0.0' } })
  const api = await launch()
  respond()
  expect((await api.checkUpdate(false)).kind).toBe('current')
  expect(api.installedVersion.value).toBe('2.0.0')
})
it('leaves an offline foreground uncounted, then consumes the day even on a timeout', async () => {
  vi.setSystemTime(new Date(2026, 10, 21, 8))
  let api = await launch()
  network.mockResolvedValueOnce({ networkType: 'none' })
  expect((await api.checkUpdate(false)).kind).toBe('error')
  expect(request).not.toHaveBeenCalled()
  expect(saved).toBeUndefined()
  api.enterUpdateForeground()
  request.mockRejectedValueOnce({ errMsg: 'timeout' })
  expect((await api.checkUpdate(false)).kind).toBe('error')
  vi.advanceTimersByTime(12 * 3_600_000)
  vi.resetModules()
  api = await launch()
  expect((await api.checkUpdate(false)).kind).toBe('skipped')
  expect(request).toHaveBeenCalledTimes(1)
  respond()
  expect((await api.checkUpdate(true)).kind).toBe('available')
})
it('counts a request against its start date when the response arrives after midnight', async () => {
  vi.setSystemTime(new Date(2026, 11, 31, 23, 59, 59))
  const api = await launch()
  const { release, meta } = published()
  request.mockImplementationOnce(async () => {
    vi.advanceTimersByTime(2000)
    return { statusCode: 200, data: release }
  }).mockResolvedValueOnce({ statusCode: 200, data: meta })
  expect((await api.checkUpdate(true)).kind).toBe('available')
  respond()
  api.enterUpdateForeground()
  expect((await api.checkUpdate(false)).kind).toBe('available')
  expect(request).toHaveBeenCalledTimes(4)
})
it('reuses a manual check on later foregrounds that day and can still check manually again', async () => {
  const api = await launch()
  respond()
  await api.checkUpdate(true)
  api.enterUpdateForeground()
  expect((await api.checkUpdate(false)).kind).toBe('available')
  expect(request).toHaveBeenCalledTimes(2)
  respond()
  await api.checkUpdate(true)
  expect(request).toHaveBeenCalledTimes(4)
})
it('recognizes the day of a check made by the previous cache format', async () => {
  vi.setSystemTime(new Date(2026, 10, 21, 23, 59))
  saved = { checkedAt: Date.now(), checkedFor: 2, release: { tag: 'v1.0.0', versionName: '1.0.0', versionCode: 2, size: 1024, notes: '' } }
  const api = await launch()
  expect((await api.checkUpdate(false)).kind).toBe('current')
  expect(request).not.toHaveBeenCalled()
  vi.advanceTimersByTime(60_000)
  respond()
  expect((await api.checkUpdate(false)).kind).toBe('available')
})
it('respects server cooldown for manual checks, including across restarts', async () => {
  let api = await launch()
  request.mockResolvedValueOnce({ statusCode: 403, header: { 'Retry-After': '120', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': String(Date.now() / 1000 + 180) } })
  expect((await api.checkUpdate(false)).kind).toBe('error')
  vi.resetModules()
  api = await launch()
  vi.advanceTimersByTime(120_000)
  expect((await api.checkUpdate(true)).kind).toBe('error')
  expect(request).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(60_000)
  respond()
  expect((await api.checkUpdate(true)).kind).toBe('available')
})
it.each(['missing manifest', 'missing APK', 'wrong tag', 'unmatched digest', 'unrelated URL', 'prerelease'])(
  'reports an incomplete or invalid release (%s) without treating it as current', async problem => {
    const api = await launch()
    const example = published()
    if (problem === 'missing manifest') example.release.assets.shift()
    if (problem === 'missing APK') example.release.assets.pop()
    if (problem === 'wrong tag') example.meta.versionName = '1.2.0'
    if (problem === 'unmatched digest') example.meta.sha256 = 'b'.repeat(64)
    if (problem === 'unrelated URL') example.release.assets[0].browser_download_url = 'https://example.com/update.json'
    if (problem === 'prerelease') example.release.prerelease = true
    respond(example)
    expect((await api.checkUpdate(true)).kind).toBe('error')
    expect(api.availableUpdate.value).toBeNull()
  })
it('leaves other platforms out of APK checks', async () => {
  vi.stubGlobal('plus', { os: { name: 'iOS' } })
  const api = await launch()
  expect(api.androidUpdates.value).toBe(false)
  expect(api.updateForeground.value).toBe(0)
  expect(request).not.toHaveBeenCalled()
})
