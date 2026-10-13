import {afterEach,describe,expect,it,vi} from 'vitest'
import {createPinia,setActivePinia} from 'pinia'
import {useAppearanceStore} from '../src/stores/appearance'

describe('navigation visibility preference',()=>{
  afterEach(()=>vi.unstubAllGlobals())
  it('defaults to fixed, persists both choices independently of material and motion',()=>{
    const values=new Map()
    vi.stubGlobal('uni',{getStorageSync:(key:string)=>values.get(key),setStorageSync:(key:string,value:unknown)=>values.set(key,value)})
    setActivePinia(createPinia());const store=useAppearanceStore()
    expect(store.navVisibility).toBe('fixed')
    store.setNavVisibility('auto');expect(values.get('lakeside:nav-visibility:v1')).toBe('auto')
    expect(store.navMotion).toBe('hop');expect(store.glassClarity).toBe(100)
    setActivePinia(createPinia());expect(useAppearanceStore().navVisibility).toBe('auto')
    useAppearanceStore().setNavVisibility('fixed')
    setActivePinia(createPinia());expect(useAppearanceStore().navVisibility).toBe('fixed')
  })
  it('uses fixed for unrecognized storage and failed reads',()=>{
    for(const getStorageSync of [()=>undefined,()=>true,()=> 'invalid',()=>{throw Error('storage')}]) {
      vi.stubGlobal('uni',{getStorageSync});setActivePinia(createPinia())
      expect(useAppearanceStore().navVisibility).toBe('fixed')
    }
  })
  it('applies a choice when saving fails and clears the error on retry',()=>{
    const setStorageSync=vi.fn().mockImplementationOnce(()=>{throw Error('full')})
    vi.stubGlobal('uni',{getStorageSync:()=>undefined,setStorageSync});setActivePinia(createPinia())
    const store=useAppearanceStore();store.setNavVisibility('auto')
    expect(store.navVisibility).toBe('auto');expect(store.visibilitySaveError).toBe(true)
    store.setNavVisibility('auto');expect(store.visibilitySaveError).toBe(false)
  })
})
