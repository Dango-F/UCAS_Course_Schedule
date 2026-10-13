import type { UcasImportPhase, UcasImportWebview } from './ucas-import-session'
import portalPreloadSource from '../static/ucas-portal-preload.js?raw'
import readingBackdropSource from '../static/ucas-reading-backdrop.js?raw'
import { createUcasProgressBlurScript, createUcasProgressBlurHideScript, UCAS_PROGRESS_BLUR_PX, UCAS_PROGRESS_VEIL_ALPHA, UCAS_COURSE_ORIGINS, UCAS_SEP_LOGIN_URL } from './ucas'

export interface NativeCourseWebview extends UcasImportWebview {
  setStyle?: (styles: Record<string, unknown>) => void
  show?: () => void
  hide?: () => void
  isVisible?: () => boolean
  close?: () => void
  bringToFront?: () => void
  append?: (webview: NativeCourseWebview) => void
  reload?: () => void
  draw?: (bitmap: unknown, success: () => void, error: () => void, options?: Record<string, unknown>) => void
  nativeInstanceObject?: () => unknown
  setJsFile?: (path?: string) => void
  appendJsFile?: (path: string) => void
  overrideResourceRequest?: (options?: Array<Record<string, unknown>>) => void
  addEventListener?: (event: string, listener: () => void, capture?: boolean) => void
}

export interface UcasWebviewManagerOptions {
  instance: unknown
  top: string
  bottom: string
  isOpen: () => boolean
  mode: () => 'mobile' | 'desktop'
  phase: () => UcasImportPhase | null
  hasDetail: () => boolean
  isBrowserUrl: (url: string) => boolean
  isPersonalUrl: (url: string) => boolean
  isSelectedUrl: (url: string) => boolean
  isEntryUrl: (url: string) => boolean
  isDetailUrl: (url: string) => boolean
  isPortalUrl: (url: string) => boolean
  onLoading: (webview: NativeCourseWebview) => void
  onLoaded: (webview: NativeCourseWebview) => void
}

interface AndroidApi {
  invoke?: (target: unknown, method: string, ...args: unknown[]) => unknown
  importClass?: (name: string) => unknown
  newObject?: (name: string, ...args: unknown[]) => unknown
  getAttribute?: (target: unknown, name: string) => unknown
}

const PORTAL_PRELOAD = '_www/static/ucas-portal-preload.js'
const PROGRESS_OVERLAY_URL = '_www/static/ucas-progress-overlay.html'
const LOGOUT_FALLBACK = '_www/static/ucas-logout-empty.json'
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function runtime(): typeof globalThis & { plus?: any } {
  return globalThis as typeof globalThis & { plus?: any }
}

function urlOf(webview: NativeCourseWebview): string {
  try { return String(webview.getURL?.() || '') } catch { return '' }
}

/** Keeps native child WebView setup out of the import page and makes it idempotent. */
export class UcasWebviewManager {
  private setupTimer: ReturnType<typeof setTimeout> | undefined
  private watchTimer: ReturnType<typeof setTimeout> | undefined
  private originalUserAgent = ''
  private mobileUserAgent = ''
  private configured = new Set<NativeCourseWebview>()
  private listenersInstalled = new WeakSet<NativeCourseWebview>()
  private documentStartAttempted = new WeakSet<NativeCourseWebview>()
  private shown = new Set<NativeCourseWebview>()
  private preloadSet = new Set<NativeCourseWebview>()
  private preloadAppend = new Set<NativeCourseWebview>()
  private resourceGuard = new Set<NativeCourseWebview>()
  private lastLoaded: NativeCourseWebview | null = null
  private styles = new WeakMap<NativeCourseWebview, string>()
  private modeApplied = new WeakMap<NativeCourseWebview, 'mobile' | 'desktop'>()
  private progressOverlay: NativeCourseWebview | null = null
  private progressOverlayReady = false
  private progressOverlayScript = ''
  private readingBlur = false
  private nativeBlurViews = new Map<NativeCourseWebview, unknown>()
  private blurStartHandlers = new Map<NativeCourseWebview, unknown>()
  private blurAttempted = new Set<NativeCourseWebview>()
  private backdropGeneration = 0
  private backdropActive = false
  private backdropScript = ''
  private backdropCancel: (() => void) | null = null
  private backdropBitmap: { clear(): void } | null = null

  /** Capture once, then keep it in the persistent indicator renderer across all
   * school refreshes. The renderer converts the named native Bitmap locally;
   * no image data crosses the uni-app service bridge or touches storage/disk. */
  prepareReadingSurface(webview: NativeCourseWebview): Promise<boolean> {
    this.clearReadingSurface()
    const plus = runtime().plus, overlay = this.ensureProgressOverlay()
    if (!webview.draw || !plus?.nativeObj?.Bitmap || !overlay?.evalJS) {
      this.useLiveReadingBlur(webview)
      return Promise.resolve(false)
    }
    this.backdropActive = true
    const generation = this.backdropGeneration
    const token = Date.now().toString(36) + '-' + generation
    const bitmapId = '__lakeside_reading_bitmap__:' + token
    const key = '__lakeside_backdrop_ready__:' + token
    return new Promise(resolve => {
      let finished = false, lastSent = -Infinity
      let poll: ReturnType<typeof setTimeout> | undefined, timeout: ReturnType<typeof setTimeout> | undefined
      const finish = (ready: boolean, reason = '', retainImage = false) => {
        if (finished) return
        finished = true; clearTimeout(poll); clearTimeout(timeout)
        // Stop late ACKs as well as clearing the current token. The image may
        // already be painted even when the cross-WebView storage ACK is missing.
        try { overlay.evalJS?.('window.__lakesideReadingBackdrop && window.__lakesideReadingBackdrop.silence(' + JSON.stringify(token) + ')') } catch { /* renderer gone */ }
        try { plus.storage?.removeItem?.(key) } catch { /* app shutting down */ }
        this.backdropCancel = null
        this.backdropActive = ready || retainImage
        if (ready || retainImage) this.backdropScript = this.backdropScript.replace(/,true\)$/, ',false)')
        else {
          this.backdropScript = ''
          try { overlay.evalJS?.('window.__lakesideReadingBackdrop && window.__lakesideReadingBackdrop.clear()') } catch { /* renderer gone */ }
          this.releaseReadingBitmap()
        }
        if (reason) console.warn('[UCAS reading background]', reason, '; continuing import')
        // Missing acknowledgement does not remove an already submitted image.
        // Only actual capture/decode failures need the existing native blur.
        if (!ready && !retainImage && generation === this.backdropGeneration && this.options.isOpen()) this.useLiveReadingBlur(webview)
        if (generation === this.backdropGeneration && this.options.isOpen()) this.applyProgressOverlayScript()
        resolve(ready)
      }
      this.backdropCancel = () => finish(false)
      const check = () => {
        if (finished) return
        if (generation !== this.backdropGeneration || !this.options.isOpen()) return finish(false)
        try {
          const ack = plus.storage?.getItem?.(key)
          if (ack === 'ready') return finish(true)
          if (ack === 'error') return finish(false, 'image decode failed')
        } catch { /* Missing storage ACK is not evidence of a failed picture. */ }
        if (this.backdropScript && Date.now() - lastSent >= 240) {
          this.applyReadingBackdrop(); lastSent = Date.now()
        }
        poll = setTimeout(check, 30)
      }
      timeout = setTimeout(() => finish(false, this.backdropScript ? 'paint confirmation timed out' : 'capture timed out', Boolean(this.backdropScript)), 1500)
      try {
        try { plus.storage?.removeItem?.(key) } catch { /* optional acknowledgement channel */ }
        const bitmap = new plus.nativeObj.Bitmap(bitmapId)
        this.backdropBitmap = bitmap
        webview.draw!(bitmap, () => {
          if (finished || generation !== this.backdropGeneration) return
          this.backdropScript = 'window.__lakesideReadingBackdrop.setBitmap(' + JSON.stringify(bitmapId) + ',' + JSON.stringify(token) + ',' + UCAS_PROGRESS_BLUR_PX + ',' + UCAS_PROGRESS_VEIL_ALPHA + ',true)'
        }, () => finish(false, 'capture failed'), { check:true })
        check()
      } catch { finish(false, 'capture bridge failed') }
    })
  }

  private releaseReadingBitmap(): void {
    try { this.backdropBitmap?.clear() } catch { /* native renderer disposed */ }
    this.backdropBitmap = null
  }

  private useLiveReadingBlur(webview: NativeCourseWebview): void {
    this.backdropActive = false
    if (this.readingBlur) this.setReadingBlur(true, webview)
  }

  private clearReadingSurface(): void {
    this.backdropGeneration++
    this.backdropCancel?.(); this.backdropCancel = null
    this.backdropActive = false; this.backdropScript = ''
    this.releaseReadingBitmap()
    try { this.progressOverlay?.evalJS?.('window.__lakesideReadingBackdrop && window.__lakesideReadingBackdrop.clear()') } catch { /* renderer gone */ }
  }

  constructor(private readonly options: UcasWebviewManagerOptions) {}

  private android(): AndroidApi | undefined { return runtime().plus?.android }

  private pageWebview(): any {
    return (this.options.instance as any)?.proxy?.$scope?.$getAppWebview?.()
  }

  list(): NativeCourseWebview[] {
    const result: NativeCourseWebview[] = []
    const add = (candidate: NativeCourseWebview | undefined, allowEmpty = false): void => {
      if (!candidate || result.includes(candidate)) return
      const url = urlOf(candidate)
      if (this.options.isBrowserUrl(url) || this.configured.has(candidate) || (allowEmpty && (!url || /^about:blank(?:#|$)/i.test(url)))) result.push(candidate)
    }
    for (const child of this.pageWebview()?.children?.() || []) add(child, true)
    for (const child of runtime().plus?.webview?.all?.() || []) add(child)
    return result
  }

  current(): NativeCourseWebview | null {
    const candidates = this.list()
    if (!candidates.length) return null
    const phase = this.options.phase()
    // Before reading, the actual visible course WebView wins over a SEP
    // window whose older `loaded` callback happened to be remembered last.
    if (!phase) {
      for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const candidate = candidates[index]
        try { if (candidate.isVisible?.() && this.options.isEntryUrl(urlOf(candidate))) return candidate } catch { /* closing WebView */ }
      }
    }
    const expectedForPhase = (url: string): boolean => {
      if (this.options.hasDetail()) return this.options.isDetailUrl(url) || this.options.isPortalUrl(url)
      if (phase === 'metadata') return this.options.isSelectedUrl(url) || this.options.isEntryUrl(url) || this.options.isPersonalUrl(url) || this.isSepBrowserUrl(url)
      return this.options.isPersonalUrl(url) || this.options.isEntryUrl(url) || this.isSepBrowserUrl(url)
    }
    // A newly-created child can finish loading after the old xkgo child is
    // still marked visible. Prefer the latest expected route so the SSO
    // cookie and extraction script stay on the child that just navigated.
    if (this.lastLoaded && candidates.includes(this.lastLoaded) && expectedForPhase(urlOf(this.lastLoaded))) return this.lastLoaded
    // Navigations between xkgo, SEP and xkcts can briefly leave an old child
    // WebView in `plus.webview.all()`. Keep using the child that is actually
    // visible while its URL is changing; selecting another matching URL here
    // would split the authenticated SSO cookies across two WebViews.
    for (let index = candidates.length - 1; index >= 0; index -= 1) {
      if (this.shown.has(candidates[index])) return candidates[index]
    }
    const find = (predicate: (url: string) => boolean): NativeCourseWebview | null => {
      for (let index = candidates.length - 1; index >= 0; index -= 1) if (predicate(urlOf(candidates[index]))) return candidates[index]
      return null
    }
    if (this.options.hasDetail()) {
      const detail = find(url => this.options.isDetailUrl(url) || this.options.isPortalUrl(url))
      if (detail) return detail
    }
    return find(this.options.isPersonalUrl) || find(this.options.isEntryUrl) || find(this.options.isBrowserUrl) || find(Boolean) || candidates[0]
  }

  private isSepBrowserUrl(url: string): boolean {
    try { return new URL(url).origin.toLowerCase() === 'https://sep.ucas.ac.cn' } catch { return /^https:\/\/sep\.ucas\.ac\.cn(?:[/?#]|$)/i.test(url) }
  }

  open(): void { this.scheduleSetup() }

  /** Native effects survive document replacement; never apply to the indicator. */
  setReadingBlur(active: boolean, current?: NativeCourseWebview | null): void {
    this.readingBlur = active
    // Remember the request even during capture so preparation failure can
    // immediately enable live blur. Never capture an already-blurred image.
    if (active && this.backdropActive) return
    if (!active) {
      this.clearReadingSurface()
      const android = this.android()
      for (const view of this.nativeBlurViews.values()) {
        try { android?.invoke?.(view, 'setRenderEffect', null) } catch { /* disposed view */ }
      }
      for (const handler of this.blurStartHandlers.values()) {
        try { android?.invoke?.(handler, 'remove') } catch { /* disposed renderer */ }
      }
      for (const child of new Set([...this.blurAttempted, ...this.list()])) {
        try { child.evalJS?.(createUcasProgressBlurHideScript()) } catch { /* navigating */ }
      }
      this.nativeBlurViews.clear(); this.blurStartHandlers.clear(); this.blurAttempted.clear()
      return
    }
    for (const child of new Set([...(current ? [current] : []), ...this.list()])) this.prepareReadingBlur(child)
  }

  private prepareReadingBlur(webview: NativeCourseWebview): void {
    if (!this.readingBlur || this.backdropActive || webview === this.progressOverlay) return
    // Native blur is attached to the view, not the document: no repeated
    // evalJS or effect rebuild is needed during the manager's setup polling.
    if (this.nativeBlurViews.has(webview)) return
    const android = this.android()
    if (!this.blurAttempted.has(webview)) {
      this.blurAttempted.add(webview)
      // Requires Android 12+, but feature failures remain local to the effect.
      // The sibling indicator must exist, or native blur would blur it as well.
      if (this.progressOverlay && android?.invoke && android.getAttribute && webview.nativeInstanceObject) {
        try {
          const native = webview.nativeInstanceObject()
          if (!native) throw new Error('no native view')
          const resources = android.invoke(native, 'getResources')
          const metrics = android.invoke(resources, 'getDisplayMetrics')
          const density = Number(android.getAttribute(metrics, 'density')) || 1
          const mode = android.getAttribute('android.graphics.Shader$TileMode', 'CLAMP')
          const effect = android.invoke('android.graphics.RenderEffect', 'createBlurEffect', UCAS_PROGRESS_BLUR_PX * density, UCAS_PROGRESS_BLUR_PX * density, mode)
          if (!effect) throw new Error('no RenderEffect')
          android.invoke(native, 'setRenderEffect', effect)
          this.nativeBlurViews.set(webview, native)
        } catch { /* Older Android / bridge: use document-start CSS below. */ }
      }
      if (!this.nativeBlurViews.has(webview) && android?.invoke && android.newObject && webview.nativeInstanceObject) {
        try {
          if (android.invoke('androidx.webkit.WebViewFeature', 'isFeatureSupported', 'DOCUMENT_START_SCRIPT') !== true) throw new Error('unsupported')
          const origins = android.newObject('java.util.HashSet')
          for (const origin of [...UCAS_COURSE_ORIGINS, new URL(UCAS_SEP_LOGIN_URL).origin]) android.invoke(origins, 'add', origin)
          const handler = android.invoke('androidx.webkit.WebViewCompat', 'addDocumentStartJavaScript', webview.nativeInstanceObject(), createUcasProgressBlurScript(), origins)
          if (handler) this.blurStartHandlers.set(webview, handler)
        } catch { /* Retain loading/loaded CSS fallback on old stock bases. */ }
      }
    }
    try {
      // Exactly one blur path; avoid native + CSS doubling the blur radius.
      webview.evalJS?.(this.nativeBlurViews.has(webview) ? createUcasProgressBlurHideScript() : createUcasProgressBlurScript())
    } catch { /* new document may not be ready yet */ }
  }

  /**
   * Keep the reading indicator in a sibling native WebView. The school page
   * can navigate freely underneath it without destroying the indicator DOM.
   */
  setProgressOverlay(script: string): boolean {
    const overlay = this.ensureProgressOverlay()
    if (!overlay?.evalJS) return false
    this.progressOverlayScript = script
    // Queue indicator changes while the snapshot is prepared. The first
    // visible spinner frame must already have its blurred website underneath.
    if (this.backdropCancel) return true
    this.showProgressOverlayWebview(overlay)
    if (this.progressOverlayReady || !overlay.addEventListener) this.applyProgressOverlayScript()
    return true
  }

  hideProgressOverlay(script: string): void {
    this.progressOverlayScript = ''
    const overlay = this.progressOverlay
    if (!overlay) return
    try { overlay.evalJS?.(script) } catch { /* overlay may be replacing its document */ }
    try { overlay.hide?.() } catch { /* overlay may already be gone */ }
  }

  private ensureProgressOverlay(): NativeCourseWebview | null {
    if (this.progressOverlay) return this.progressOverlay
    const plusWebview = runtime().plus?.webview
    if (!plusWebview?.create) return null
    const parent = this.pageWebview()
    try {
      const overlay = plusWebview.create(PROGRESS_OVERLAY_URL, '__lakeside_ucas_progress_overlay__', {
        top: this.options.top, bottom: this.options.bottom, left: '0px', right: '0px',
        opacity: 0,
        background: 'transparent',
        opaque: false,
        // Only this trusted bundled document needs the token-only paint ACK.
        plusrequire: 'normal',
        zindex: 999,
        'uni-app': 'none',
        scalable: false,
        softinputMode: 'adjustResize',
      }) as NativeCourseWebview
      this.progressOverlay = overlay
      this.progressOverlayReady = !overlay.addEventListener
      overlay.addEventListener?.('loading', () => {
        if (this.progressOverlay === overlay) this.progressOverlayReady = false
      }, false)
      overlay.addEventListener?.('loaded', () => {
        if (this.progressOverlay !== overlay) return
        this.progressOverlayReady = true
        this.applyReadingBackdrop()
        this.applyProgressOverlayScript()
      }, false)
      if (parent?.append) parent.append(overlay)
      else overlay.show?.()
      return overlay
    } catch {
      this.progressOverlay = null
      this.progressOverlayReady = false
      return null
    }
  }

  private showProgressOverlayWebview(overlay: NativeCourseWebview): void {
    try {
      overlay.setStyle?.({ top: this.options.top, bottom: this.options.bottom, left: '0px', right: '0px', zindex: 999, opacity: 1, background: 'transparent', opaque: false, scalable: false, softinputMode: 'adjustResize' })
      overlay.show?.()
      overlay.bringToFront?.()
    } catch { /* overlay may be between native lifecycle states */ }
  }

  private applyProgressOverlayScript(): void {
    const overlay = this.progressOverlay
    if (!overlay?.evalJS || !this.progressOverlayScript || this.backdropCancel) return
    try { overlay.evalJS(this.progressOverlayScript); this.showProgressOverlayWebview(overlay) } catch { /* overlay may still be loading */ }
  }

  private applyReadingBackdrop(): void {
    const overlay = this.progressOverlay
    if (!overlay?.evalJS || !this.backdropScript) return
    try {
      // Bootstrap in the same evaluation as set(): do not depend on relative
      // script loading or plusready ordering in the bundled native document.
      overlay.evalJS(readingBackdropSource + '\n;' + this.backdropScript)
      this.showProgressOverlayWebview(overlay)
    } catch { /* Retried during preparation, and on every overlay loaded event. */ }
  }

  scheduleSetup(attempt = 0): void {
    if (this.setupTimer) clearTimeout(this.setupTimer)
    this.setupTimer = setTimeout(() => {
      this.setupTimer = undefined
      if (!this.options.isOpen()) return
      const children = this.list()
      if (!children.length) { if (attempt < 60) this.scheduleSetup(attempt + 1); return }
      const active = this.current()
      for (const webview of children) this.configureChild(webview, webview === active)
      if (this.progressOverlay && this.progressOverlayScript) this.showProgressOverlayWebview(this.progressOverlay)
      if (this.watchTimer) clearTimeout(this.watchTimer)
      this.watchTimer = setTimeout(() => { this.watchTimer = undefined; if (this.options.isOpen()) this.scheduleSetup() }, 160)
    }, attempt ? 50 : 0)
  }

  private configureChild(webview: NativeCourseWebview, active: boolean): void {
    this.prepareReadingBlur(webview)
    if (!this.configured.has(webview)) {
      this.configured.add(webview)
      this.installDocumentStartGuard(webview)
      this.applyPortalGuard(webview)
    }
    if (!this.listenersInstalled.has(webview)) {
      this.listenersInstalled.add(webview)
      webview.addEventListener?.('loading', () => {
        this.prepareReadingBlur(webview)
        this.applyPortalGuard(webview); this.options.onLoading(webview)
      }, false)
      webview.addEventListener?.('loaded', () => {
        this.prepareReadingBlur(webview)
        this.applyPortalGuard(webview)
        try {
          const url = new URL(urlOf(webview))
          const path = /^\/portal\/site\//i.test(url.pathname) ? '/portal/site/[redacted]' : url.pathname.replace(/\/[A-Za-z0-9_-]{24,}/g, '/[redacted]')
          console.info('[UCAS import v2] loaded', url.origin + path)
        } catch { /* no URL available */ }
        this.lastLoaded = webview
        this.options.onLoaded(webview)
        this.scheduleSetup()
      }, false)
    }
    this.installLogoutGuard(webview)
    this.installPortalPreload(webview)
    if (active) this.show(webview)
    else this.hide(webview)
  }

  private show(webview: NativeCourseWebview): void {
    const mode = this.options.mode()
    const key = `${this.options.top}|${this.options.bottom}|${mode}`
    if (this.styles.get(webview) !== key) {
      try { webview.setStyle?.({ top: this.options.top, bottom: this.options.bottom, left: '0px', right: '0px', opacity: 1, scalable: mode === 'desktop', softinputMode: 'adjustResize' }); this.styles.set(webview, key) } catch { /* child may be replacing itself */ }
    }
    if (!this.shown.has(webview)) { try { webview.show?.(); this.shown.add(webview) } catch { /* older bases expose no show */ } }
    this.applyNativeSettings(webview, mode)
  }

  private hide(webview: NativeCourseWebview): void {
    this.styles.delete(webview)
    this.shown.delete(webview)
    try { webview.setStyle?.({ top: '-10000px', left: '-10000px', width: '1px', height: '1px', opacity: 0 }) } catch { /* child may be gone */ }
    try { webview.hide?.() } catch { /* child may be gone */ }
  }

  hideAll(): void { for (const child of this.list()) this.hide(child) }

  release(): void {
    this.setReadingBlur(false)
    this.hideAll()
    if (this.progressOverlay) {
      try { this.progressOverlay.hide?.() } catch { /* overlay may already be gone */ }
      try { this.progressOverlay.close?.() } catch { /* older bases may not expose close */ }
    }
    this.progressOverlay = null
    this.progressOverlayReady = false
    this.progressOverlayScript = ''
    if (this.setupTimer) clearTimeout(this.setupTimer)
    if (this.watchTimer) clearTimeout(this.watchTimer)
    this.setupTimer = undefined
    this.watchTimer = undefined
    this.configured.clear()
    this.shown.clear()
    this.preloadSet.clear()
    this.preloadAppend.clear()
    this.resourceGuard.clear()
    this.lastLoaded = null
  }

  setMode(mode: 'mobile' | 'desktop', reload = true): boolean {
    const webview = this.current()
    const navigatorApi = runtime().plus?.navigator
    try {
      if (!this.originalUserAgent) this.originalUserAgent = String(navigatorApi?.getUserAgent?.() || '')
      const target = mode === 'desktop' ? DESKTOP_UA : this.originalUserAgent
      if (navigatorApi?.setUserAgent && target && String(navigatorApi.getUserAgent?.() || '') !== target) navigatorApi.setUserAgent(target, false)
      if (webview) {
        this.applyNativeSettings(webview, mode, true)
        this.show(webview)
        if (reload) { const url = urlOf(webview); if (url && webview.reload) webview.reload(); else if (url) webview.loadURL?.(url) }
      }
      this.scheduleSetup()
      return true
    } catch { return false }
  }

  restoreUserAgent(): void {
    const navigatorApi = runtime().plus?.navigator
    if (this.originalUserAgent && navigatorApi?.setUserAgent) { try { navigatorApi.setUserAgent(this.originalUserAgent, false) } catch { /* leaving the page must still work */ } }
  }

  private applyNativeSettings(webview: NativeCourseWebview, mode: 'mobile' | 'desktop', force = false): void {
    const android = this.android()
    if (!android?.invoke || !webview.nativeInstanceObject) return
    if (!force && this.modeApplied.get(webview) === mode) return
    const nativeWebview = webview.nativeInstanceObject()
    if (!nativeWebview) return
    const settings = android.invoke(nativeWebview, 'getSettings')
    // SEP, xkgo and xkcts intentionally use different origins. Keep the
    // Android CookieManager enabled for the same WebView so the SEP Identity
    // redirect can set xkcts's SESSION cookie; this does not expose or copy
    // cookie values into the app.
    try {
      const cookieClass = android.importClass?.('android.webkit.CookieManager') as any
      const cookieManager = cookieClass?.getInstance?.() || (cookieClass ? android.invoke(cookieClass, 'getInstance') : null)
      if (cookieManager) {
        android.invoke(cookieManager, 'setAcceptCookie', true)
        android.invoke(cookieManager, 'setAcceptThirdPartyCookies', nativeWebview, true)
        android.invoke(cookieManager, 'flush')
      }
    } catch { /* older bases may not expose CookieManager through plus.android */ }
    try { android.invoke(settings, 'setDomStorageEnabled', true) } catch { /* optional on old Android */ }
    if (!this.mobileUserAgent) this.mobileUserAgent = this.originalUserAgent || String(android.invoke(settings, 'getUserAgentString') || '')
    const userAgent = mode === 'desktop' ? DESKTOP_UA : this.mobileUserAgent
    if (userAgent) android.invoke(settings, 'setUserAgentString', userAgent)
    android.invoke(settings, 'setUseWideViewPort', mode === 'desktop')
    android.invoke(settings, 'setLoadWithOverviewMode', mode === 'desktop')
    android.invoke(settings, 'setTextZoom', 100)
    android.invoke(settings, 'setSupportMultipleWindows', false)
    this.modeApplied.set(webview, mode)
  }

  private installLogoutGuard(webview: NativeCourseWebview): void {
    if (this.resourceGuard.has(webview) || !webview.overrideResourceRequest) return
    try {
      webview.overrideResourceRequest([{ match: '^https://(?:xkgo\\.ucas\\.ac\\.cn:3000|xkgodj\\.ucas\\.ac\\.cn)/user/logout/?(?:[?#].*)?$', redirect: LOGOUT_FALLBACK, mime: 'application/json', encoding: 'UTF-8', header: {
        'Cache-Control': 'no-store',
        // This is only the locally substituted empty logout-probe response.
        // Permit SEP to read it without relaxing any school server policy.
        'Access-Control-Allow-Origin': 'https://sep.ucas.ac.cn',
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      } }])
      this.resourceGuard.add(webview)
    } catch { /* JavaScript preload remains as a fallback */ }
  }

  private installPortalPreload(webview: NativeCourseWebview): void {
    if (webview.setJsFile && !this.preloadSet.has(webview)) {
      try { webview.setJsFile(PORTAL_PRELOAD); this.preloadSet.add(webview) } catch { /* try append below */ }
    }
    if (!this.preloadSet.has(webview) && webview.appendJsFile && !this.preloadAppend.has(webview)) {
      try { webview.appendJsFile(PORTAL_PRELOAD); this.preloadAppend.add(webview) } catch { /* optional API */ }
    }
  }

  private applyPortalGuard(webview: NativeCourseWebview): void {
    if (!this.isSepBrowserUrl(urlOf(webview))) return
    try { webview.evalJS?.(portalPreloadSource) } catch { /* fallback for an already loaded document */ }
  }

  private installDocumentStartGuard(webview: NativeCourseWebview): void {
    if (this.documentStartAttempted.has(webview)) return
    const android = this.android()
    if (!android?.invoke || !android.newObject || !webview.nativeInstanceObject) return
    this.documentStartAttempted.add(webview)
    try {
      const supported = android.invoke('androidx.webkit.WebViewFeature', 'isFeatureSupported', 'DOCUMENT_START_SCRIPT')
      if (supported !== true) throw new Error('unsupported')
      const nativeWebview = webview.nativeInstanceObject()
      if (!nativeWebview) throw new Error('unavailable')
      const origins = android.newObject('java.util.HashSet')
      android.invoke(origins, 'add', 'https://sep.ucas.ac.cn')
      android.invoke('androidx.webkit.WebViewCompat', 'addDocumentStartJavaScript', nativeWebview, portalPreloadSource, origins)
      console.info('[UCAS import v2] portal guard: document-start registered')
    } catch {
      // Stock HBuilderX bases may not bundle this AndroidX API. Both the
      // packaged HTML5+ preload and loaded-document guard remain available.
      console.info('[UCAS import v2] portal guard: HTML5+ preload fallback')
    }
  }
}
