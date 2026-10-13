import { afterEach, describe, expect, it, vi } from 'vitest'
import { UcasWebviewManager, type UcasWebviewManagerOptions } from '../src/import/ucas-webview'
import { UcasImportSession, type UcasImportSessionHost } from '../src/import/ucas-import-session'

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()})
function fixture(withEvents = false) {
  vi.useFakeTimers()
  const values=new Map<string,string>(),clear=vi.fn(),draw=vi.fn((_bitmap,done)=>done())
  const website={getURL:()=> 'https://xkgo.ucas.ac.cn:3000/course/personSchedule',evalJS:vi.fn(),loadURL:vi.fn(),draw}
  const events = new Map<string,()=>void>()
  const overlay={evalJS:vi.fn(),setStyle:vi.fn(),show:vi.fn(),hide:vi.fn(),close:vi.fn(),bringToFront:vi.fn(),...(withEvents ? {addEventListener:(event:string,listener:()=>void)=>events.set(event,listener)} : {})}
  const readData=vi.fn(()=>null),bitmapIds:string[]=[]
  class Bitmap { constructor(id:string){bitmapIds.push(id)} clear=clear;toBase64Data=readData }
  const create=vi.fn(()=>overlay)
  vi.stubGlobal('plus',{nativeObj:{Bitmap},webview:{create,all:()=>[website]},storage:{getItem:(key:string)=>values.get(key),removeItem:(key:string)=>values.delete(key)}})
  const options:UcasWebviewManagerOptions={instance:{},top:'60px',bottom:'140px',isOpen:()=>true,mode:()=>'mobile',phase:()=>null,hasDetail:()=>false,isBrowserUrl:()=>true,isPersonalUrl:()=>true,isSelectedUrl:()=>false,isEntryUrl:()=>false,isDetailUrl:()=>false,isPortalUrl:()=>false,onLoading:vi.fn(),onLoaded:vi.fn()}
  return {manager:new UcasWebviewManager(options),website,overlay,values,clear,create,events,readData,bitmapIds}
}

function backdropCalls(f:ReturnType<typeof fixture>) {
  return f.overlay.evalJS.mock.calls.map(([s])=>String(s)).filter(s=>s.includes('\n;window.__lakesideReadingBackdrop.setBitmap('))
}
function backdropArgs(f:ReturnType<typeof fixture>) {
  const script=backdropCalls(f).at(-1)!.split('\n;window.__lakesideReadingBackdrop.setBitmap(')[1]
  return JSON.parse('['+script.slice(0,-1)+']')
}
describe('persistent reading surface',()=>{
  it('waits for painted acknowledgement, captures once and keeps the surface across progress updates',async()=>{
    const f=fixture();let settled=false
    const result=f.manager.prepareReadingSurface(f.website).then(v=>{settled=true;return v})
    f.manager.setProgressOverlay('queued-sharp-indicator')
    expect(f.overlay.evalJS).not.toHaveBeenCalledWith('queued-sharp-indicator')
    await vi.advanceTimersByTimeAsync(60)
    expect(settled).toBe(false)
    expect(f.clear).not.toHaveBeenCalled()
    const args=backdropArgs(f)
    expect(args[0]).toBe(f.bitmapIds[0])
    expect(f.readData).not.toHaveBeenCalled()
    f.values.set('__lakeside_backdrop_ready__:'+args[1],'ready')
    await vi.advanceTimersByTimeAsync(30)
    expect(await result).toBe(true)
    expect(f.overlay.evalJS).toHaveBeenCalledWith('queued-sharp-indicator')
    for(let i=0;i<3;i++){f.manager.setProgressOverlay('progress-'+i);f.manager.setReadingBlur(true,f.website)}
    expect(f.website.draw).toHaveBeenCalledOnce()
    expect(f.website.evalJS).not.toHaveBeenCalled()
    expect(f.overlay.setStyle).toHaveBeenCalledWith(expect.objectContaining({zindex:999}))
    expect(f.values.size).toBe(0)
    f.manager.release()
    expect(f.clear).toHaveBeenCalledOnce()
    expect(f.overlay.evalJS).toHaveBeenCalledWith('window.__lakesideReadingBackdrop && window.__lakesideReadingBackdrop.clear()')
  })
  it('missing ACK retains the named Bitmap without clearing the picture or doubling its blur',async()=>{
    const f=fixture(),result=f.manager.prepareReadingSurface(f.website)
    f.manager.setReadingBlur(true,f.website)
    f.overlay.evalJS.mockClear()
    await vi.advanceTimersByTimeAsync(1501)
    expect(await result).toBe(false)
    expect(f.clear).not.toHaveBeenCalled()
    expect(f.overlay.evalJS.mock.calls.some(([s])=>String(s).endsWith('Backdrop.clear()'))).toBe(false)
    expect(f.website.evalJS).not.toHaveBeenCalled()
    expect(f.overlay.setStyle).toHaveBeenLastCalledWith(expect.objectContaining({background:'transparent',opaque:false}))
    expect(backdropCalls(f).length).toBeGreaterThan(1)
    f.manager.release()
  })
  it('bootstraps without loaded or storage ACK and restores the image after overlay reload',async()=>{
    const f=fixture(true)
    delete (globalThis as any).plus.storage
    const result=f.manager.prepareReadingSurface(f.website)
    expect(backdropCalls(f)).toHaveLength(1)
    expect(backdropCalls(f)[0]).toContain('window.__lakesideReadingBackdrop =')
    await vi.advanceTimersByTimeAsync(1501)
    expect(await result).toBe(false)
    f.overlay.evalJS.mockClear()
    f.events.get('loading')!();f.events.get('loaded')!()
    expect(backdropCalls(f)).toHaveLength(1)
    expect(backdropArgs(f)[4]).toBe(false)
    f.manager.release()
    f.overlay.evalJS.mockClear();f.events.get('loaded')!()
    expect(backdropCalls(f)).toHaveLength(0)
  })
  it('restores a confirmed background when the overlay reloads without capturing another website',async()=>{
    const f=fixture(true),result=f.manager.prepareReadingSurface(f.website)
    const token=backdropArgs(f)[1]
    f.values.set('__lakeside_backdrop_ready__:'+token,'ready')
    await vi.advanceTimersByTimeAsync(30)
    expect(await result).toBe(true)
    f.overlay.evalJS.mockClear()
    f.events.get('loading')!();f.events.get('loaded')!()
    expect(backdropCalls(f)).toHaveLength(1)
    expect(backdropArgs(f)[1]).toBe(token)
    expect(backdropArgs(f)[4]).toBe(false)
    expect(f.website.draw).toHaveBeenCalledOnce()
    f.manager.release()
  })
  it('capture errors preserve the existing live blur without introducing a solid mask',async()=>{
    const f=fixture()
    f.website.draw.mockImplementation(()=>{throw new Error('unavailable')})
    expect(await f.manager.prepareReadingSurface(f.website)).toBe(false)
    f.manager.setReadingBlur(true,f.website)
    f.overlay.setStyle.mockClear()
    for(let i=0;i<3;i++){
      f.manager.setProgressOverlay('progress-'+i)
      f.manager.setReadingBlur(true,f.website)
      await vi.advanceTimersByTimeAsync(1000)
    }
    expect(f.website.evalJS).toHaveBeenCalled()
    expect(f.overlay.setStyle.mock.calls.every(([s])=>s.background==='transparent'&&s.opaque===false)).toBe(true)
    expect(backdropCalls(f)).toHaveLength(0)
    f.manager.release()
  })
  it('a null service-side conversion does not discard a native Bitmap that the renderer can read',async()=>{
    const f=fixture()
    const result=f.manager.prepareReadingSurface(f.website)
    expect(backdropCalls(f)).toHaveLength(1)
    expect(f.readData).not.toHaveBeenCalled()
    expect(f.website.draw).toHaveBeenCalledOnce()
    const token=backdropArgs(f)[1]
    f.values.set('__lakeside_backdrop_ready__:'+token,'ready')
    await vi.advanceTimersByTimeAsync(30)
    expect(await result).toBe(true)
    f.manager.release()
  })
  it('cancel during capture cleans memory and ignores a late capture callback',async()=>{
    const f=fixture();let captured:()=>void=()=>{}
    f.website.draw.mockImplementation((_bitmap,done)=>{captured=done})
    const result=f.manager.prepareReadingSurface(f.website)
    f.manager.release();captured()
    await vi.advanceTimersByTimeAsync(100)
    expect(await result).toBe(false)
    expect(f.clear).toHaveBeenCalledOnce()
    expect(f.overlay.evalJS.mock.calls.some(([s])=>String(s).includes('.set('))).toBe(false)
  })
})

function sessionFixture(){
  vi.useFakeTimers()
  let acknowledge:(ready:boolean)=>void=()=>{}
  const website={getURL:()=> 'https://xkgo.ucas.ac.cn:3000/course/personSchedule',evalJS:vi.fn(),loadURL:vi.fn()}
  const host:UcasImportSessionHost={getWebview:()=>website,isCourseUrl:()=>true,isPersonalSchedulePage:()=>true,isSelectedCoursePage:()=>false,isCourseEntryPage:()=>false,isSepPage:()=>false,isSepPortalPage:()=>false,installPortalDocumentStartScript:vi.fn(),removePortalDocumentStartScript:vi.fn(),clearHandoff:vi.fn(),readHandoff:()=>undefined,handoffAvailable:()=>true,setReading:vi.fn(),setProgress:vi.fn(),setStatus:vi.fn(),setError:vi.fn(),onResult:vi.fn(),prepareReadingSurface:()=>new Promise(resolve=>{acknowledge=resolve})}
  return {session:new UcasImportSession(host),host,website,ack:(ready:boolean)=>acknowledge(ready)}
}
describe('optional reading background preparation',()=>{
  it('在 xkgodj 会话中继续打开同一域名的个人课表',async()=>{
    const f=sessionFixture()
    f.website.getURL=()=> 'https://xkgodj.ucas.ac.cn/courseManage/new-route'
    f.host.isPersonalSchedulePage=()=>false
    f.host.isCourseEntryPage=()=>false
    f.session.start();f.ack(false)
    await vi.advanceTimersByTimeAsync(120001)
    expect(f.website.loadURL).toHaveBeenCalledWith('https://xkgodj.ucas.ac.cn/course/personSchedule')
    f.session.cancel()
  })

  it('does not inject or navigate before the surface is ready, including loaded callbacks',async()=>{
    const f=sessionFixture();f.session.start();f.session.handleLoaded(f.website)
    await vi.advanceTimersByTimeAsync(1000)
    expect(f.website.evalJS).not.toHaveBeenCalled();expect(f.website.loadURL).not.toHaveBeenCalled()
    f.ack(true);await vi.advanceTimersByTimeAsync(1000)
    expect(f.website.evalJS.mock.calls.length+f.website.loadURL.mock.calls.length).toBeGreaterThan(0)
    f.session.cancel()
  })
  it('cancel prevents late background completion from starting navigation',async()=>{
    const f=sessionFixture();f.session.start()
    f.session.cancel()
    f.ack(true);await vi.advanceTimersByTimeAsync(2000)
    expect(f.website.evalJS).not.toHaveBeenCalled();expect(f.website.loadURL).not.toHaveBeenCalled()
    expect(f.session.isReading).toBe(false)
    f.session.cancel()
  })
  it.each(['false','rejected','throws','timeout'])('continues reading when visual preparation returns %s',async mode=>{
    const f=sessionFixture()
    if(mode==='rejected')f.host.prepareReadingSurface=()=>Promise.reject(new Error('renderer unavailable'))
    if(mode==='throws')f.host.prepareReadingSurface=()=>{throw new Error('bridge unavailable')}
    f.session.start()
    if(mode==='false')f.ack(false)
    await vi.advanceTimersByTimeAsync(2800)
    expect(f.session.isReading).toBe(true)
    expect(f.website.evalJS.mock.calls.length+f.website.loadURL.mock.calls.length).toBeGreaterThan(0)
    expect(f.host.setError).toHaveBeenCalledOnce()
    expect(f.host.setError).toHaveBeenCalledWith('')
    const progressCalls=vi.mocked(f.host.setProgress).mock.calls.length
    f.ack(true);await Promise.resolve()
    expect(vi.mocked(f.host.setProgress).mock.calls.length).toBe(progressCalls)
    f.session.cancel()
  })
  it('ignores a previous attempt acknowledgement during a restarted reading',async()=>{
    const f=sessionFixture();let oldAck:(value:boolean)=>void=()=>{}
    const currentPrepare=f.host.prepareReadingSurface
    f.host.prepareReadingSurface=()=>new Promise(resolve=>{oldAck=resolve})
    f.session.start();f.session.cancel()
    f.host.prepareReadingSurface=currentPrepare
    f.session.start();oldAck(true);await Promise.resolve()
    expect(f.session.currentPhase).toBe(null)
    f.ack(true);await Promise.resolve()
    expect(f.session.currentPhase).toBe('metadata')
    f.session.cancel()
  })
})
