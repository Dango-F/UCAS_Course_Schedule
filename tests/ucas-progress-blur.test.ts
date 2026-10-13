import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { createUcasProgressBlurScript, createUcasProgressBlurHideScript, createUcasProgressOverlayScript, UCAS_PROGRESS_BLUR_PX } from '../src/import/ucas'

function fixture(scale = 1) {
  const nodes = new Map<string, any>()
  const appendChild = (node: any) => { nodes.set(node.id, node) }
  const document = {
    head: { appendChild }, documentElement: { appendChild },
    getElementById: (id: string) => nodes.get(id),
    createElement: () => {
      const node: any = { id:'', textContent:'', setAttribute() {}, style: { setProperty(name: string, value: string) { this[name] = value } } }
      node.remove = () => nodes.delete(node.id)
      return node
    },
  }
  return { nodes, context: { document, window: { visualViewport: { scale } } } }
}

describe('website-local reading blur', () => {
  it('adds exactly one blur layer and removes it on finish/cancel', () => {
    const { nodes, context } = fixture()
    runInNewContext(createUcasProgressBlurScript(), context)
    const veil = nodes.get('__lakeside_progress_blur_v1__')
    expect(veil.style['--lc-reading-blur']).toBe(`${UCAS_PROGRESS_BLUR_PX}px`)
    expect(veil.style.display).toBe('block')
    runInNewContext(createUcasProgressBlurScript(), context)
    expect(nodes.size).toBe(2)
    expect(nodes.get('__lakeside_progress_blur_v1__')).toBe(veil)
    runInNewContext(createUcasProgressBlurHideScript(), context)
    expect(nodes.has('__lakeside_progress_blur_v1__')).toBe(false)
    runInNewContext(createUcasProgressBlurHideScript(), context)
    runInNewContext(createUcasProgressBlurScript(), context)
    expect(nodes.size).toBe(2)
  })
  it('keeps the visible blur radius consistent when desktop pages zoom out', () => {
    const { nodes, context } = fixture(.32)
    runInNewContext(createUcasProgressBlurScript(), context)
    expect(nodes.get('__lakeside_progress_blur_v1__').style['--lc-reading-blur']).toBe('3.75px')
  })
  it('leaves the indicator sharp with no second veil and preserves accessibility fallback', () => {
    const script = createUcasProgressOverlayScript({ value:50, phase:'personal', label:'正在读取' })
    expect(script).toContain('.lc-veil{display:none!important;')
    expect(script).toContain('transition-delay:.9s')
    const { nodes, context } = fixture()
    runInNewContext(createUcasProgressBlurScript(), context)
    const css = nodes.get('__lakeside_progress_blur_style_v2__').textContent
    expect(css).toContain('backdrop-filter:blur(')
    expect(css).toContain('background:rgba(225,237,246,0.02)')
    expect(css).toContain('prefers-reduced-transparency:reduce')
  })
  it('installs before the parser creates html and cannot resurrect after cancellation', () => {
    const { nodes, context } = fixture()
    let mutation: () => void = () => {}
    let disconnected = false
    const originalRoot = context.document.documentElement
    context.document.documentElement = null as any
    const sandbox = { ...context, MutationObserver: class {
      constructor(callback: () => void) { mutation = callback }
      observe() {}
      disconnect() { disconnected = true }
    } }
    runInNewContext(createUcasProgressBlurScript(), sandbox)
    expect(nodes.size).toBe(0)
    context.document.documentElement = originalRoot
    mutation()
    expect(nodes.has('__lakeside_progress_blur_v1__')).toBe(true)
    runInNewContext(createUcasProgressBlurHideScript(), sandbox)
    mutation()
    expect(disconnected).toBe(true)
    expect(nodes.has('__lakeside_progress_blur_v1__')).toBe(false)
  })
})
