import { computed, ref } from 'vue'
import { versionName as buildVersion } from '../manifest.json'

const repository = 'Dango-F/UCAS_Course_Schedule'
const github = 'https://github.com/' + repository
const latestApi = 'https://api.github.com/repos/' + repository + '/releases/latest'
const storageKey = 'lakeside.android.updates.v1'
const hour = 3_600_000
const day = 24 * hour
const invalidRelease = '这个发布版本的更新信息不完整，请稍后再试。'
const limited = 'GitHub 暂时限制了检查次数，请稍后再试。'

export interface AppRelease {
  tag: string
  versionCode: number
  versionName: string
  notes: string
  size: number
}
interface UpdateCache {
  attemptDay: number
  checkedFor: number
  rateLimitUntil: number
  ignored: number
  snoozed: number
  snoozedUntil: number
  release: AppRelease | null
}
type CheckResult =
  | { kind: 'available'; release: AppRelease }
  | { kind: 'current' | 'skipped' }
  | { kind: 'error'; message: string }

const cache = ref<UpdateCache>({
  attemptDay: 0, checkedFor: 0, rateLimitUntil: 0, ignored: 0, snoozed: 0, snoozedUntil: 0, release: null
})
export const installedVersion = ref(buildVersion)
const installedCode = ref(0)
export const androidUpdates = ref(false)
export const updateForeground = ref(0)
export const checkingUpdate = ref(false)
export const availableUpdate = computed(() => {
  const release = cache.value.release
  return installedCode.value > 0 && release && release.versionCode > installedCode.value ? release : null
})
let hydrated = false
let foregroundCount = 0
let inFlight: Promise<CheckResult> | undefined

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function positiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}
function localDay(date = new Date()): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate()
}
function stableTag(tag: unknown): tag is string {
  return typeof tag === 'string' && /^v?\d+\.\d+\.\d+$/.test(tag)
}
function restoreCache() {
  if (hydrated) return
  hydrated = true
  try {
    const saved: unknown = uni.getStorageSync(storageKey)
    if (!isRecord(saved)) return
    for (const key of ['attemptDay', 'checkedFor', 'rateLimitUntil', 'ignored', 'snoozed', 'snoozedUntil'] as const) {
      const value = saved[key]
      if (positiveInteger(value)) cache.value[key] = value
    }
    // Previous builds stored the last success or a one-hour failure cooldown.
    if (!cache.value.attemptDay) {
      if (positiveInteger(saved.retryAt)) {
        cache.value.attemptDay = localDay(new Date(saved.retryAt - hour))
        cache.value.checkedFor = 0
      } else if (positiveInteger(saved.checkedAt)) {
        cache.value.attemptDay = localDay(new Date(saved.checkedAt))
      }
    }
    const r = saved.release
    if (isRecord(r) && stableTag(r.tag) && r.versionName === r.tag.replace(/^v/, '') &&
        positiveInteger(r.versionCode) && positiveInteger(r.size) && typeof r.notes === 'string') {
      cache.value.release = { tag: r.tag, versionName: r.versionName, versionCode: r.versionCode, size: r.size, notes: r.notes }
    }
  } catch { /* An unavailable cache only affects this device's reminder interval. */ }
}
function persist() {
  try { uni.setStorageSync(storageKey, cache.value) } catch { /* In-memory state remains usable. */ }
}

export function enterUpdateForeground() {
  // #ifdef APP-PLUS
  if (typeof plus === 'undefined' || plus.os.name !== 'Android') return
  androidUpdates.value = true
  restoreCache()
  let name = plus.runtime.version
  let code = plus.runtime.versionCode
  if (!name || !code) {
    try {
      const info = uni.getAppBaseInfo()
      name ||= info.appVersion
      code ||= info.appVersionCode
    } catch { /* An older runtime may not expose package information. */ }
  }
  installedVersion.value = name || buildVersion
  installedCode.value = positiveInteger(Number(code)) ? Number(code) : 0
  updateForeground.value = ++foregroundCount
  // #endif
}

export function mayRemind(release: AppRelease) {
  const state = cache.value
  return release.versionCode === availableUpdate.value?.versionCode && state.ignored !== release.versionCode &&
    (state.snoozed !== release.versionCode || state.snoozedUntil <= Date.now())
}
export function dismissUpdate(release: AppRelease, ignore: boolean) {
  if (ignore) cache.value.ignored = release.versionCode
  else {
    cache.value.snoozed = release.versionCode
    cache.value.snoozedUntil = Date.now() + day
  }
  persist()
}
export function openReleasePage(release: AppRelease) {
  if (!stableTag(release.tag)) return
  const failed = () => uni.showToast({ title: '无法打开浏览器，请检查默认浏览器设置', icon: 'none' })
  try { plus.runtime.openURL(github + '/releases/tag/' + release.tag, failed) } catch { failed() }
}

async function requestJson(url: string): Promise<unknown> {
  const response = await uni.request({
    url, timeout: 12_000, dataType: 'text', responseType: 'text',
    header: { Accept: url === latestApi ? 'application/vnd.github+json' : '*/*', 'User-Agent': 'Lakeside-Schedule-Android' }
  }).catch(() => { throw new Error('无法连接 GitHub，请检查网络后重试。') })
  if (response.statusCode === 403 || response.statusCode === 429) {
    const headers: Record<string, string> = {}
    for (const [key, value] of Object.entries(response.header || {})) headers[key.toLowerCase()] = String(value)
    if (response.statusCode === 403 && !headers['retry-after'] && headers['x-ratelimit-remaining'] !== '0' &&
        !/rate limit/i.test(String(response.data))) throw new Error('GitHub 暂时拒绝了访问，请稍后再试。')
    const seconds = Number(headers['retry-after'])
    const retryAfter = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(headers['retry-after'])
    const reset = headers['x-ratelimit-remaining'] === '0' ? Number(headers['x-ratelimit-reset']) * 1000 : 0
    cache.value.rateLimitUntil = Math.max(Date.now() + 60_000, retryAfter || 0, reset || 0)
    throw new Error(limited)
  }
  if (response.statusCode === 404) throw new Error(url === latestApi ? '暂时找不到可检查的正式版本，请稍后再试。' : invalidRelease)
  if (response.statusCode !== 200) throw new Error('暂时无法连接 GitHub，请稍后重试。')
  try {
    return typeof response.data === 'string' ? JSON.parse(response.data.replace(/^\uFEFF/, '')) : response.data
  } catch { throw new Error(invalidRelease) }
}

async function fetchRelease(): Promise<AppRelease> {
  const release = await requestJson(latestApi)
  if (!isRecord(release) || release.draft !== false || release.prerelease !== false ||
      !stableTag(release.tag_name) || !Array.isArray(release.assets)) throw new Error(invalidRelease)
  const tag = release.tag_name
  const prefix = github + '/releases/download/' + tag + '/'
  const assets = release.assets.filter(isRecord)
  const uploaded = (name: string) => assets.find(asset => asset.name === name && asset.state === 'uploaded' &&
    asset.browser_download_url === prefix + name && positiveInteger(asset.size))
  if (!uploaded('update.json')) throw new Error(invalidRelease)
  const meta = await requestJson(prefix + 'update.json')
  if (!isRecord(meta) || !positiveInteger(meta.versionCode) || meta.versionName !== tag.replace(/^v/, '') ||
      typeof meta.apk !== 'string' || !/^[A-Za-z0-9_-][A-Za-z0-9._-]*\.apk$/.test(meta.apk) ||
      typeof meta.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(meta.sha256)) throw new Error(invalidRelease)
  const apk = uploaded(meta.apk)
  if (!apk || !positiveInteger(apk.size) ||
      (apk.digest && apk.digest !== 'sha256:' + meta.sha256.toLowerCase())) throw new Error(invalidRelease)
  return { tag, versionCode: meta.versionCode, versionName: meta.versionName, size: apk.size,
    notes: typeof release.body === 'string' ? release.body.slice(0, 4000) : '' }
}

function knownResult(): CheckResult {
  return availableUpdate.value ? { kind: 'available', release: availableUpdate.value } : { kind: 'current' }
}
async function refresh(manual: boolean): Promise<CheckResult> {
  try {
    const network = await uni.getNetworkType().catch(() => null)
    if (network?.networkType === 'none') return { kind: 'error', message: '当前没有网络，连接后再试。' }
    const online = !!network?.networkType && network.networkType !== 'unknown'
    if (!online && !manual) return { kind: 'error', message: '暂时无法确认网络状态，请稍后再试。' }
    const startedDay = localDay()
    if (online) {
      // Reserve the day before the request so a timeout or an app restart cannot repeat it.
      cache.value.attemptDay = startedDay
      cache.value.checkedFor = 0
      persist()
    }
    cache.value.release = await fetchRelease()
    cache.value.attemptDay = startedDay
    cache.value.checkedFor = installedCode.value
    cache.value.rateLimitUntil = 0
    persist()
    return knownResult()
  } catch (error) {
    persist()
    return { kind: 'error', message: error instanceof Error ? error.message : '无法连接 GitHub，请检查网络后重试。' }
  }
}
export function checkUpdate(manual: boolean): Promise<CheckResult> {
  if (inFlight) return inFlight
  if (!androidUpdates.value || !installedCode.value) return Promise.resolve({ kind: 'error', message: '无法读取已安装版本，请重新打开应用。' })
  const now = Date.now()
  const state = cache.value
  if (state.rateLimitUntil > now) return Promise.resolve({ kind: 'error', message: limited })
  if (!manual && state.attemptDay === localDay(new Date(now))) {
    return Promise.resolve(state.release && state.checkedFor === installedCode.value ? knownResult() : { kind: 'skipped' })
  }
  checkingUpdate.value = true
  inFlight = refresh(manual).finally(() => { inFlight = undefined; checkingUpdate.value = false })
  return inFlight
}
