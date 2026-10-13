import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UcasWebviewManager, type UcasWebviewManagerOptions } from '../src/import/ucas-webview'

const source = readFileSync(new URL('../src/static/ucas-portal-preload.js', import.meta.url), 'utf8')

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('教务预加载和再次进入', () => {
  it('读取前优先选择实际可见的选课网页，不误选旧 SEP 页面', () => {
    vi.useFakeTimers()
    const sepEvents = new Map<string, () => void>()
    const sep = {
      getURL: () => 'https://sep.ucas.ac.cn/sepCard/card', isVisible: () => true,
      setStyle: vi.fn(), show: vi.fn(), hide: vi.fn(),
      addEventListener: vi.fn((name: string, callback: () => void) => { sepEvents.set(name, callback) }),
    }
    const course = {
      getURL: () => 'https://xkgo.ucas.ac.cn:3000/#/course/personSchedule', isVisible: () => true,
      setStyle: vi.fn(), show: vi.fn(), hide: vi.fn(), addEventListener: vi.fn(),
    }
    vi.stubGlobal('plus', { webview: { all: () => [sep, course] } })
    const options: UcasWebviewManagerOptions = {
      instance: {}, top: '72px', bottom: '140px', isOpen: () => true,
      mode: () => 'mobile', phase: () => null, hasDetail: () => false,
      isBrowserUrl: url => /^https:\/\/(?:sep|xkgo)\.ucas\.ac\.cn/.test(url),
      isPersonalUrl: () => false, isSelectedUrl: () => false,
      isEntryUrl: url => url.startsWith('https://xkgo.ucas.ac.cn:3000/'),
      isDetailUrl: () => false, isPortalUrl: () => false,
      onLoading: vi.fn(), onLoaded: vi.fn(),
    }
    const manager = new UcasWebviewManager(options)
    manager.open(); vi.advanceTimersByTime(1)
    sepEvents.get('loaded')?.()
    expect(manager.current()).toBe(course)
    manager.release()
  })

  it.each([true, false])('读取期间跨刷新保留模糊（原生=%s），结束后释放效果和注入', nativeSupported => {
    vi.useFakeTimers()
    const nativeView = {}, renderEffect = {}, handler = {}, events = new Map<string, () => void>()
    const webview = {
      getURL: () => 'https://xkgo.ucas.ac.cn:3000/course/personSchedule', nativeInstanceObject: () => nativeView,
      evalJS: vi.fn(), setStyle: vi.fn(), show: vi.fn(), hide: vi.fn(),
      addEventListener: vi.fn((name: string, callback: () => void) => events.set(name, callback)),
    }
    const overlay = { evalJS: vi.fn(), setStyle: vi.fn(), show: vi.fn(), hide: vi.fn(), close: vi.fn() }
    const invoke = vi.fn((_object, method, ..._args) => {
      if (method === 'createBlurEffect') { if (!nativeSupported) throw new Error('API < 31'); return renderEffect }
      if (method === 'isFeatureSupported') return true
      if (method === 'addDocumentStartJavaScript') return handler
    })
    vi.stubGlobal('plus', { android: { invoke, getAttribute: vi.fn((_obj, field) => field === 'density' ? 3 : 'CLAMP'), newObject: vi.fn(() => ({})) }, webview: { all: () => [webview], create: () => overlay } })
    const options: UcasWebviewManagerOptions = {
      instance: {}, top:'50px', bottom:'80px', isOpen:()=>true, mode:()=>'mobile', phase:()=>'personal', hasDetail:()=>false,
      isBrowserUrl:()=>true, isPersonalUrl:()=>true, isSelectedUrl:()=>false, isEntryUrl:()=>false, isDetailUrl:()=>false, isPortalUrl:()=>false,
      onLoading:vi.fn(), onLoaded:vi.fn(),
    }
    const manager = new UcasWebviewManager(options)
    manager.open();vi.advanceTimersByTime(1)
    invoke.mockClear()
    manager.setProgressOverlay('sharp indicator')
    manager.setReadingBlur(true, webview)
    for(let i=0;i<3;i++){events.get('loading')?.();events.get('loaded')?.();vi.advanceTimersByTime(1)}
    const renderCalls=invoke.mock.calls.filter(([,method])=>method==='setRenderEffect')
    if(nativeSupported){
      expect(renderCalls).toEqual([[nativeView,'setRenderEffect',renderEffect]])
      expect(invoke.mock.calls.find(([,method])=>method==='createBlurEffect')?.slice(2,4)).toEqual([3.5999999999999996,3.5999999999999996])
      expect(webview.evalJS.mock.calls.some(([script])=>String(script).includes('function update()'))).toBe(false)
    } else {
      expect(renderCalls).toHaveLength(0)
      const starts=invoke.mock.calls.filter(([,method])=>method==='addDocumentStartJavaScript')
      expect(starts).toHaveLength(1)
      expect(String(starts[0][3])).toContain('MutationObserver')
    }
    manager.setReadingBlur(false)
    if(nativeSupported)expect(invoke).toHaveBeenCalledWith(nativeView,'setRenderEffect',null)
    else expect(invoke).toHaveBeenCalledWith(handler,'remove')
    const count=invoke.mock.calls.filter(([,method])=>method==='setRenderEffect'||method==='addDocumentStartJavaScript').length
    events.get('loading')?.();events.get('loaded')?.();vi.advanceTimersByTime(1)
    expect(invoke.mock.calls.filter(([,method])=>method==='setRenderEffect'||method==='addDocumentStartJavaScript')).toHaveLength(count)
    manager.release()
  })
  it.each(['https://xkgo.ucas.ac.cn:3000', 'https://xkgodj.ucas.ac.cn', 'https://sep.ucas.ac.cn'])('不会阻止 %s 非门户页面的普通请求', async origin => {
    const fetch = vi.fn(async (_url: string) => 'response')
    const context = {
      window: { fetch, open: vi.fn() },
      location: { origin, pathname: '/', href: origin + '/' },
      document: { readyState: 'complete', querySelectorAll: () => [] },
      URL, Promise, console: { info: vi.fn() },
    }
    runInNewContext(source, context)
    await context.window.fetch('https://xkgo.ucas.ac.cn:3000/user/logout')
    expect(fetch).toHaveBeenCalledOnce()
  })

  it('每个新 SEP 文档均阻止门户 logout 探测，并放行普通请求', async () => {
    for (const path of ['/portal/site/226/xs/1/test-ticket', '/portal/site/524/2412']) {
      const open = vi.fn(), send = vi.fn(), abort = vi.fn(), fetch = vi.fn(async () => 'response')
      class PrototypeXhr {
        open(...args: unknown[]) { open(...args) }
        send() { send() }
        abort() { abort() }
      }
      const context = {
        window: { XMLHttpRequest: PrototypeXhr, fetch, navigator: { sendBeacon: vi.fn() }, open: vi.fn() },
        location: { origin: 'https://sep.ucas.ac.cn', pathname: path, href: `https://sep.ucas.ac.cn${path}` },
        document: { readyState: 'complete', querySelectorAll: () => [] },
        URL, Promise, console: { info: vi.fn() },
      }
      runInNewContext(source, context)
      const firstWrapper = PrototypeXhr.prototype.send
      runInNewContext(source, context)
      expect(PrototypeXhr.prototype.send).toBe(firstWrapper)
      const request = new PrototypeXhr() as any
      request.open('POST', 'https://xkgo.ucas.ac.cn:3000/user/logout')
      request.send()
      expect(send).not.toHaveBeenCalled()
      expect(abort).toHaveBeenCalledOnce()
      await context.window.fetch('https://xkgo.ucas.ac.cn:3000/user/logout')
      expect(fetch).not.toHaveBeenCalled()
      request.open('POST', 'https://xkgodj.ucas.ac.cn/user/logout')
      request.send()
      expect(send).not.toHaveBeenCalled()
      expect(abort).toHaveBeenCalledTimes(2)
      await context.window.fetch('https://xkgodj.ucas.ac.cn/user/logout')
      expect(fetch).not.toHaveBeenCalled()
      request.open('GET', 'https://sep.ucas.ac.cn/resources/card/api')
      request.send()
      expect(send).toHaveBeenCalledOnce()
      await context.window.fetch('https://sep.ucas.ac.cn/resources/card/api')
      expect(fetch).toHaveBeenCalledOnce()
    }
  })

  it.each([true, false])('基座支持文档开始脚本=%s，重开不重复绑定事件且有静态兜底', supported => {
    vi.useFakeTimers()
    const listeners = new Map<string, () => void>()
    const webview = {
      getURL: () => 'https://sep.ucas.ac.cn/sepCard/card',
      nativeInstanceObject: () => ({}), setStyle: vi.fn(), show: vi.fn(), hide: vi.fn(),
      setJsFile: vi.fn(), appendJsFile: vi.fn(), overrideResourceRequest: vi.fn(), evalJS: vi.fn(),
      addEventListener: vi.fn((name: string, callback: () => void) => { listeners.set(name, callback) }),
    }
    const invoke = vi.fn((_object, method) => method === 'isFeatureSupported' ? supported : undefined)
    vi.stubGlobal('plus', { android: { invoke, newObject: vi.fn(() => ({})) }, webview: { all: () => [webview] } })
    const onLoaded = vi.fn()
    const options: UcasWebviewManagerOptions = {
      instance: {}, top: '50px', bottom: '80px', isOpen: () => true,
      mode: () => 'mobile', phase: () => null, hasDetail: () => false,
      isBrowserUrl: () => true, isPersonalUrl: () => false, isSelectedUrl: () => false,
      isEntryUrl: () => false, isDetailUrl: () => false, isPortalUrl: () => false, onLoading: vi.fn(), onLoaded,
    }
    const manager = new UcasWebviewManager(options)
    manager.open(); vi.advanceTimersByTime(1)
    manager.release()
    manager.open(); vi.advanceTimersByTime(1)
    listeners.get('loaded')?.()
    expect(webview.addEventListener).toHaveBeenCalledTimes(2)
    expect(onLoaded).toHaveBeenCalledOnce()
    expect(webview.setJsFile).toHaveBeenCalledWith('_www/static/ucas-portal-preload.js')
    expect(webview.appendJsFile).not.toHaveBeenCalled()
    expect(webview.overrideResourceRequest.mock.calls[0][0][0]).toMatchObject({
      redirect: '_www/static/ucas-logout-empty.json',
      header: { 'Access-Control-Allow-Origin': 'https://sep.ucas.ac.cn' },
    })
    expect(invoke.mock.calls.filter(([, method]) => method === 'addDocumentStartJavaScript')).toHaveLength(supported ? 1 : 0)
    expect(webview.evalJS).toHaveBeenCalledWith(source)
    manager.release()
  })

  it('读取浮层使用独立原生子 WebView，课程页面切换不会重建它', () => {
    const overlayListeners = new Map<string, () => void>()
    const overlay = {
      evalJS: vi.fn(), setStyle: vi.fn(), show: vi.fn(), hide: vi.fn(), close: vi.fn(), bringToFront: vi.fn(),
      addEventListener: vi.fn((name: string, callback: () => void) => { overlayListeners.set(name, callback) }),
    }
    const parent = { append: vi.fn(), children: () => [] }
    const create = vi.fn(() => overlay)
    vi.stubGlobal('plus', { webview: { create, all: () => [] } })
    const options: UcasWebviewManagerOptions = {
      instance: { proxy: { $scope: { $getAppWebview: () => parent } } }, top: '60px', bottom: '140px', isOpen: () => true,
      mode: () => 'mobile', phase: () => 'personal', hasDetail: () => false,
      isBrowserUrl: () => false, isPersonalUrl: () => false, isSelectedUrl: () => false,
      isEntryUrl: () => false, isDetailUrl: () => false, isPortalUrl: () => false, onLoading: vi.fn(), onLoaded: vi.fn(),
    }
    const manager = new UcasWebviewManager(options)
    expect(manager.setProgressOverlay('spinner-state')).toBe(true)
    expect(create).toHaveBeenCalledWith('_www/static/ucas-progress-overlay.html', '__lakeside_ucas_progress_overlay__', expect.objectContaining({ background: 'transparent', opaque: false }))
    expect(parent.append).toHaveBeenCalledWith(overlay)
    overlayListeners.get('loaded')?.()
    expect(overlay.evalJS).toHaveBeenCalledWith('spinner-state')
    manager.setProgressOverlay('spinner-state-after-navigation')
    expect(overlay.evalJS).toHaveBeenLastCalledWith('spinner-state-after-navigation')
    manager.release()
    expect(overlay.close).toHaveBeenCalledOnce()
  })
})
