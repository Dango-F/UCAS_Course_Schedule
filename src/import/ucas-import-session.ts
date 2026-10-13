import {
  clearNativeImportHandoff,
  createUcasCourseMetaExtractionScript,
  createUcasExtractionScript,
  createUcasPortalHandoffScript,
  isUcasCourseSiteUrl,
  isUcasCourseDetailUrl,
  mergeUcasCourseMetadata,
  mergeUcasImportedCourses,
  readNativeImportHandoff,
  UCAS_COURSE_MAIN_URL,
  UCAS_IMPORT_KIND,
  UCAS_PERSON_SCHEDULE_URL,
  validateUcasCourseMeta,
  validateUcasDetailLinks,
  validateUcasImportPayload,
  type UcasDetailLink,
  type UcasImportedCourse,
  type UcasCourseMeta,
  type UcasProgressOverlayState,
  type ValidatedUcasImport,
} from './ucas'

export interface UcasImportWebview {
  getURL?: () => string
  evalJS?: (script: string) => void
  loadURL?: (url: string) => void
}

export type UcasImportPhase = 'metadata' | 'personal' | 'detail'

export interface UcasImportSessionHost {
  getWebview(): UcasImportWebview | null
  isCourseUrl(url: string): boolean
  isPersonalSchedulePage(url: string): boolean
  isSelectedCoursePage(url: string): boolean
  isCourseEntryPage(url: string): boolean
  isSepPage(url: string): boolean
  isSepPortalPage(url: string): boolean
  installPortalDocumentStartScript(webview: UcasImportWebview): void
  removePortalDocumentStartScript(): void
  clearHandoff(): void
  readHandoff(): unknown
  handoffAvailable(): boolean
  setReading(reading: boolean): void
  prepareReadingSurface?(webview: UcasImportWebview): Promise<boolean>
  setProgress(progress: UcasProgressOverlayState): void
  setStatus(status: string): void
  setError(message: string): void
  onResult(result: ValidatedUcasImport): void
}

const PERSONAL_STATUS = '正在读取选修课程信息和个人课表…'

function message(value: unknown, fallback: string): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180) || fallback
    : fallback
}

function failures(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(item => message(item, '')).filter(Boolean))].slice(0, 100)
}

function urlOf(webview: UcasImportWebview | null): string {
  try { return String(webview?.getURL?.() || '') } catch { return '' }
}

function sourceHost(url: string): string {
  try { return new URL(url).host } catch { return '未获取到网页地址' }
}

function personalScheduleUrl(current: string): string {
  if (!isUcasCourseSiteUrl(current)) return UCAS_PERSON_SCHEDULE_URL
  try { return new URL('/course/personSchedule', current).href } catch {
    return /^https:\/\/xkgodj\.ucas\.ac\.cn(?:[/?#]|$)/i.test(current)
      ? 'https://xkgodj.ucas.ac.cn/course/personSchedule'
      : UCAS_PERSON_SCHEDULE_URL
  }
}

/**
 * Coordinates the two independent sources: the selected-course table supplies
 * metadata, while the personal table and detail pages supply arrangements.
 * A failed metadata read never prevents a valid timetable from being saved.
 */
export class UcasImportSession {
  private phase: UcasImportPhase | null = null
  private active = false
  private preparingSurface = false
  private surfaceTimer: ReturnType<typeof setTimeout> | undefined
  private generation = 0
  private pollTimer: ReturnType<typeof setInterval> | undefined
  private timeoutTimer: ReturnType<typeof setTimeout> | undefined
  private actionTimer: ReturnType<typeof setTimeout> | undefined
  private fallbackTimer: ReturnType<typeof setTimeout> | undefined
  private detailTimer: ReturnType<typeof setTimeout> | undefined
  private completionTimer: ReturnType<typeof setTimeout> | undefined
  private detailQueue: UcasDetailLink[] = []
  private detailIndex = 0
  private activeDetail: UcasDetailLink | null = null
  private detailCourses: UcasImportedCourse[] = []
  private detailFailures: string[] = []
  private courseMetadata: UcasCourseMeta[] = []
  private metadataFailures: string[] = []
  private detailFallbackUsed = false
  private injectionKey = ''
  private activeWebview: UcasImportWebview | null = null
  private progress: UcasProgressOverlayState = { value: 0, phase: 'starting', label: '准备开始读取' }

  constructor(private readonly host: UcasImportSessionHost) {}

  get currentPhase(): UcasImportPhase | null { return this.phase }
  get isReading(): boolean { return this.active }
  get hasActiveDetail(): boolean { return Boolean(this.activeDetail) }

  private setProgress(value: number, phase: UcasProgressOverlayState['phase'], label: string, allowReset = false): void {
    const next = Math.max(0, Math.min(100, Math.round(value)))
    const current = this.progress.value
    const resolved = allowReset ? next : Math.max(current, next)
    this.progress = { value: resolved, phase, label }
    this.host.setProgress(this.progress)
  }

  private advanceProgress(max: number, label: string): void {
    this.setProgress(Math.min(max, this.progress.value + 2), this.progress.phase, label)
  }

  start(): void {
    if (this.active) return
    if (!this.host.handoffAvailable()) return this.fail('原生读取桥尚未就绪。请关闭页面后重新打开；若仍出现，请用 HBuilderX 真机运行。')
    const webview = this.host.getWebview(), url = urlOf(webview)
    if (!webview || (!webview.evalJS && !webview.loadURL)) return this.fail('学校网页仍在启动，请稍候几秒后再试。')
    if (!this.host.isCourseUrl(url)) return this.fail(`当前识别页面：${sourceHost(url)}。请从 SEP 进入选课系统，并打开选修课程或个人课表。`)

    this.cancelTimers()
    this.resetData()
    this.activeWebview = webview
    this.host.removePortalDocumentStartScript()
    this.host.clearHandoff()
    this.host.setError('')
    this.active = true
    this.generation += 1
    const generation = this.generation
    this.preparingSurface = Boolean(this.host.prepareReadingSurface)
    let surface: Promise<boolean> | undefined
    try { surface = this.host.prepareReadingSurface?.(webview) } catch { surface = Promise.resolve(false) }
    this.progress = { value: 0, phase: 'starting', label: '准备开始读取' }
    this.host.setReading(true)
    this.setProgress(5, 'starting', '正在连接教务页面', true)
    this.host.setStatus(PERSONAL_STATUS)
    if (surface) {
      // Background rendering is optional: a missing native capture/ACK must
      // never prevent reading. Also bound hosts that never settle their promise.
      const continueReading = () => {
        if (!this.active || generation !== this.generation || !this.preparingSurface) return
        clearTimeout(this.surfaceTimer)
        this.surfaceTimer = undefined
        this.preparingSurface = false
        this.beginRead(webview, url)
      }
      this.surfaceTimer = setTimeout(continueReading, 1800)
      surface.then(continueReading, continueReading)
      return
    }
    this.beginRead(webview, url)
  }

  private beginRead(webview: UcasImportWebview, url: string): void {
    this.beginPolling()

    if (isUcasCourseDetailUrl(url)) {
      this.phase = 'detail'
      this.activeDetail = { url, label: '当前课程' }
      this.setProgress(58, 'detail', '正在读取当前课程详情', true)
      this.runDetail(webview, this.generation)
      return
    }
    this.phase = 'metadata'
    this.setProgress(12, 'metadata', '正在打开选修课程信息', true)
    this.schedulePhase(webview)
  }

  cancel(): void {
    this.active = false
    this.preparingSurface = false
    this.generation += 1
    this.cancelTimers()
    this.resetData()
    this.activeWebview = null
    this.phase = null
    this.host.setReading(false)
    this.host.setProgress({ value: 0, phase: 'starting', label: '准备开始读取' })
    this.host.clearHandoff()
  }

  handleLoaded(webview: UcasImportWebview): void {
    if (!this.active || this.preparingSurface) return
    if (this.activeWebview && webview !== this.activeWebview) {
      const url = urlOf(webview)
      const expected = this.phase === 'detail'
        ? this.host.isSepPortalPage(url) || isUcasCourseDetailUrl(url)
        : this.phase === 'metadata'
          ? this.host.isCourseUrl(url) || this.host.isSepPage(url)
          : this.host.isPersonalSchedulePage(url) || this.host.isSepPage(url)
      if (!expected) return
      this.activeWebview = webview
    } else if (!this.activeWebview) this.activeWebview = webview
    this.injectionKey = ''
    this.host.setProgress(this.progress)
    if (this.phase === 'detail') this.runDetail(webview, this.generation)
    else this.schedulePhase(webview)
  }

  handleWebError(): void {
    if (!this.active) return
    if (this.activeDetail) return this.finishDetailFailure('课程详情页加载失败')
    if (this.phase === 'metadata') return this.continueToPersonal('选修课程页面加载失败，继续读取个人课表', true)
    this.fail('个人课表页面加载失败，请检查网络后重新打开。')
  }

  private webview(): UcasImportWebview | null { return this.activeWebview || this.host.getWebview() }

  private resetData(): void {
    this.detailQueue = []
    this.detailIndex = 0
    this.activeDetail = null
    this.detailCourses = []
    this.detailFailures = []
    this.courseMetadata = []
    this.metadataFailures = []
    this.detailFallbackUsed = false
    this.injectionKey = ''
  }

  private cancelTimers(): void {
    for (const timer of [this.surfaceTimer, this.timeoutTimer, this.actionTimer, this.fallbackTimer, this.detailTimer, this.completionTimer]) if (timer) clearTimeout(timer)
    this.surfaceTimer = undefined
    if (this.pollTimer) clearInterval(this.pollTimer)
    this.timeoutTimer = undefined
    this.actionTimer = undefined
    this.fallbackTimer = undefined
    this.detailTimer = undefined
    this.completionTimer = undefined
    this.pollTimer = undefined
  }

  private beginPolling(): void {
    this.pollTimer = setInterval(() => this.readPacket(), 280)
    this.refreshTimeout()
  }

  private refreshTimeout(): void {
    if (this.timeoutTimer) clearTimeout(this.timeoutTimer)
    const generation = this.generation
    this.timeoutTimer = setTimeout(() => {
      if (!this.active || generation !== this.generation) return
      if (this.phase === 'detail') return this.finishDetailCollection('课程详情读取超时')
      if (this.phase === 'metadata') return this.continueToPersonal('选修课程信息读取超时，已继续读取个人课表', true)
      this.fail('个人课表读取超时，请确认页面已打开后重试。')
    }, 120000)
  }

  private fail(error: string): void {
    this.active = false
    this.generation += 1
    this.cancelTimers()
    this.resetData()
    this.activeWebview = null
    this.phase = null
    this.host.setReading(false)
    this.host.setProgress({ value: 0, phase: 'starting', label: '读取未完成' })
    this.host.clearHandoff()
    this.host.setError(error)
  }

  private finish(result: ValidatedUcasImport): void {
    this.active = false
    this.generation += 1
    this.cancelTimers()
    this.phase = null
    this.setProgress(100, 'complete', '课表读取完成', true)
    this.host.setStatus('读取完成')
    this.host.clearHandoff()
    const generation = this.generation
    this.completionTimer = setTimeout(() => {
      this.completionTimer = undefined
      if (generation !== this.generation) return
      this.host.setReading(false)
      this.host.onResult(result)
      this.activeWebview = null
      this.resetData()
    }, 2000)
  }

  private readPacket(): void {
    const raw = this.host.readHandoff()
    if (!raw || typeof raw !== 'object') return
    const packet = raw as Record<string, unknown>
    if (packet.kind !== UCAS_IMPORT_KIND) return
    this.host.clearHandoff()
    if (packet.status === 'progress') {
      if (this.actionTimer) clearTimeout(this.actionTimer)
      this.actionTimer = undefined
      this.refreshTimeout()
      this.host.setStatus(message(packet.message, '正在读取课程安排…'))
      this.advanceProgress(this.phase === 'metadata' ? 26 : this.phase === 'personal' ? 56 : 92, message(packet.message, '正在读取课程安排…'))
      return
    }
    if (packet.status === 'course-meta') return this.receiveMetadata(packet)
    if (packet.status === 'detail-links') return this.beginDetails(packet)
    if (packet.status === 'error') {
      const error = message(packet.message, '教务页面未能完成读取。')
      if (this.activeDetail) return this.finishDetailFailure(error)
      if (this.phase === 'metadata') return this.continueToPersonal(error, true)
      return this.fail(error)
    }
    if (packet.status !== 'complete') return
    if (this.activeDetail) return this.receiveDetail(packet)
    this.receiveDirect(packet)
  }

  private receiveMetadata(packet: Record<string, unknown>): void {
    if (this.phase !== 'metadata') return
    if (this.actionTimer) clearTimeout(this.actionTimer)
    this.actionTimer = undefined
    this.courseMetadata = validateUcasCourseMeta(packet.courseMeta)
    this.metadataFailures.push(...failures(packet.failures))
    if (!this.courseMetadata.length) this.metadataFailures.push('选修课程页面未返回课程代码、主讲教师、学位课和考试方式')
    this.setProgress(32, 'metadata', this.courseMetadata.length ? `已读取 ${this.courseMetadata.length} 门课程信息` : '选修课程信息暂不可用')
    this.continueToPersonal(this.courseMetadata.length ? `已读取 ${this.courseMetadata.length} 门课程信息，继续读取上课安排…` : '选修课程表未返回课程信息，继续读取个人课表…')
  }

  private continueToPersonal(reason = '', recordFailure = false): void {
    if (!this.active) return
    if (reason && recordFailure) this.metadataFailures.push(reason)
    this.phase = 'personal'
    this.setProgress(40, 'personal', '正在打开个人课表')
    this.injectionKey = ''
    if (this.actionTimer) clearTimeout(this.actionTimer)
    this.actionTimer = undefined
    const webview = this.webview()
    if (!webview) return this.fail('学校网页已关闭，请重新打开教务页面。')
    const current = urlOf(webview)
    if (this.host.isPersonalSchedulePage(current)) return this.schedulePersonal(webview)
    if (!webview.loadURL) return this.fail('无法打开个人课表页面，请手动进入后重试。')
    try { webview.loadURL(personalScheduleUrl(current)) } catch { return this.fail('无法打开个人课表页面，请返回选课系统后重试。') }
    const generation = this.generation
    this.fallbackTimer = setTimeout(() => {
      this.fallbackTimer = undefined
      if (!this.active || generation !== this.generation || this.phase !== 'personal') return
      if (this.host.isPersonalSchedulePage(urlOf(webview))) this.schedulePersonal(webview)
      else this.fail('教务页面未返回个人课表，请手动打开“个人课表”后重试。')
    }, 12000)
  }

  private receiveDirect(packet: Record<string, unknown>): void {
    const validation = validateUcasImportPayload(packet)
    if (!validation.ok) return this.fail(validation.message)
    this.detailCourses = validation.value.courses
    this.detailFailures = validation.value.failures
    this.finishDetailCollection()
  }

  private schedulePhase(webview: UcasImportWebview | null): void {
    if (!this.active || !webview || !this.phase) return
    const url = urlOf(webview)
    if (this.phase === 'metadata') {
      if (this.host.isCourseUrl(url) && (this.host.isCourseEntryPage(url) || this.host.isSelectedCoursePage(url) || this.host.isPersonalSchedulePage(url))) return this.runMetadata(webview)
      if (this.host.isSepPage(url)) return
      return
    }
    if (this.phase === 'personal') {
      if (this.host.isPersonalSchedulePage(url)) return this.schedulePersonal(webview)
      if (this.host.isSepPage(url)) return
    }
  }

  private runMetadata(webview: UcasImportWebview | null): void {
    if (!webview || !this.active || this.phase !== 'metadata') return
    const url = urlOf(webview)
    if (!this.host.isCourseUrl(url)) return
    const key = `${this.generation}|metadata|${url}`
    if (this.injectionKey === key) return
    this.injectionKey = key
    this.setProgress(18, 'metadata', '正在读取选修课程信息')
    this.runAction(webview, createUcasCourseMetaExtractionScript(), 40000)
  }

  private schedulePersonal(webview: UcasImportWebview | null): void {
    if (!webview || !this.host.isPersonalSchedulePage(urlOf(webview))) return
    const key = `${this.generation}|personal|${urlOf(webview)}`
    if (this.injectionKey === key) return
    this.injectionKey = key
    this.setProgress(48, 'personal', '正在读取个人课表安排')
    this.runAction(webview, createUcasExtractionScript(undefined, '', urlOf(webview)), 40000)
  }

  private runDetail(webview: UcasImportWebview | null, generation: number): void {
    if (!webview || !this.active || generation !== this.generation || !this.activeDetail) return
    if (!isUcasCourseDetailUrl(urlOf(webview))) return
    const key = `${generation}|detail|${urlOf(webview)}|${this.detailIndex}`
    if (this.injectionKey === key) return
    this.injectionKey = key
    const total = Math.max(1, this.detailQueue.length)
    this.setProgress(58 + Math.round((this.detailIndex / total) * 34), 'detail', `正在读取 ${this.detailIndex + 1} / ${total} 门课程详情`)
    this.runAction(webview, createUcasExtractionScript(undefined, this.activeDetail.label), 30000)
  }

  private runAction(webview: UcasImportWebview, script: string, timeout: number): void {
    if (!webview.evalJS) return this.fail('学校网页读取接口尚未就绪，请稍候后重试。')
    this.host.clearHandoff()
    this.refreshTimeout()
    try { webview.evalJS(script) } catch { return this.fail('无法启动教务页面读取，请返回后重试。') }
    if (this.actionTimer) clearTimeout(this.actionTimer)
    const generation = this.generation
    this.actionTimer = setTimeout(() => {
      this.actionTimer = undefined
      if (!this.active || generation !== this.generation) return
      if (this.phase === 'detail') this.finishDetailFailure('读取课程详情超时')
      else if (this.phase === 'metadata') this.continueToPersonal('选修课程信息读取超时，继续读取个人课表', true)
      else this.fail('个人课表读取超时，请确认页面已打开后重试。')
    }, timeout)
  }

  private beginDetails(packet: Record<string, unknown>): void {
    const links = validateUcasDetailLinks(packet.detailLinks)
    const partial = validateUcasImportPayload({ ...packet, status: 'complete' })
    this.detailQueue = links
    this.detailIndex = 0
    this.activeDetail = null
    this.detailCourses = partial.ok ? partial.value.courses : []
    this.detailFailures = [...failures(packet.failures), ...(partial.ok ? partial.value.failures : [])]
    if (!links.length && !this.detailCourses.length) return this.finishDetailCollection('没有找到可读取的课程详情')
    this.phase = 'detail'
    this.setProgress(58, 'detail', links.length ? `准备读取 ${links.length} 门课程详情` : '正在整理课程安排')
    this.readNextDetail()
  }

  private readNextDetail(): void {
    if (!this.active) return
    if (this.detailIndex >= this.detailQueue.length) return this.finishDetailCollection()
    const webview = this.webview(), detail = this.detailQueue[this.detailIndex]
    if (!webview?.loadURL) return this.finishDetailFailure('无法打开课程详情页')
    this.activeDetail = detail
    this.detailFallbackUsed = false
    this.host.clearHandoff()
    this.host.setStatus(`正在读取 ${this.detailIndex + 1} / ${this.detailQueue.length} 门课程详情…`)
    this.setProgress(58 + Math.round((this.detailIndex / Math.max(1, this.detailQueue.length)) * 34), 'detail', `正在读取 ${this.detailIndex + 1} / ${this.detailQueue.length} 门课程详情`)
    const navigation = detail.navigationUrl || detail.url
    if (this.host.isSepPortalPage(navigation)) this.host.installPortalDocumentStartScript(webview)
    try { webview.loadURL(navigation) } catch { return this.finishDetailFailure('无法打开课程详情页') }
    const generation = this.generation
    if (this.detailTimer) clearTimeout(this.detailTimer)
    this.detailTimer = setTimeout(() => {
      this.detailTimer = undefined
      if (!this.active || generation !== this.generation || !this.activeDetail || this.activeDetail.url !== detail.url) return
      if (navigation !== detail.url && !this.detailFallbackUsed) {
        this.detailFallbackUsed = true
        this.activeDetail = { ...detail, navigationUrl: '' }
        try { webview.loadURL?.(detail.url) } catch { return this.finishDetailFailure('打开课程详情页失败') }
        this.detailTimer = setTimeout(() => {
          this.detailTimer = undefined
          if (!this.active || generation !== this.generation || !this.activeDetail || this.activeDetail.url !== detail.url) return
          this.finishDetailFailure('打开课程详情页超时')
        }, 18000)
        return
      }
      this.finishDetailFailure('打开课程详情页超时')
    }, 18000)
  }

  private receiveDetail(packet: Record<string, unknown>): void {
    const validation = validateUcasImportPayload(packet)
    if (validation.ok) { this.detailCourses.push(...validation.value.courses); this.detailFailures.push(...validation.value.failures) }
    else this.detailFailures.push(validation.message)
    this.clearDetailState()
    this.detailIndex += 1
    setTimeout(() => this.readNextDetail(), 0)
  }

  private finishDetailFailure(error: string): void {
    if (!this.activeDetail) return this.finishDetailCollection(error)
    this.detailFailures.push(`${this.activeDetail.label || '课程详情'}：${message(error, '读取失败')}`)
    this.clearDetailState()
    this.detailIndex += 1
    setTimeout(() => this.readNextDetail(), 0)
  }

  private clearDetailState(): void {
    if (this.detailTimer) clearTimeout(this.detailTimer)
    if (this.actionTimer) clearTimeout(this.actionTimer)
    this.detailTimer = undefined
    this.actionTimer = undefined
    this.activeDetail = null
    this.injectionKey = ''
    this.host.clearHandoff()
  }

  private finishDetailCollection(error = ''): void {
    this.setProgress(96, 'finishing', '正在整理读取结果')
    if (error) this.detailFailures.push(error)
    const arranged = mergeUcasImportedCourses(this.detailCourses)
    const courses = mergeUcasCourseMetadata(arranged, this.courseMetadata)
    const allFailures = [...new Set([...this.metadataFailures, ...this.detailFailures])].slice(0, 100)
    if (!courses.length) return this.fail(allFailures[0] ? `没有读到可保存的课程。${allFailures[0]}` : '没有读到可保存的课程，请重新打开教务页面后重试。')
    this.finish({ courses, failures: allFailures })
  }
}

export function createUcasImportSession(host: UcasImportSessionHost): UcasImportSession { return new UcasImportSession(host) }
export { clearNativeImportHandoff, readNativeImportHandoff, createUcasPortalHandoffScript }
