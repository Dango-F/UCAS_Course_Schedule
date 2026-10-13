import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const source = readFileSync(new URL('../src/static/ucas-reading-backdrop.js', import.meta.url), 'utf8')

function renderer(data: string | null) {
  const nodes = new Map<string, any>(), frames: Array<() => void> = [], acks = new Map<string, string>()
  const createElement = () => ({
    id: '', style: { cssText: '' }, isConnected: false, children: [] as any[],
    setAttribute: vi.fn(), appendChild(node: any) { this.children.push(node) },
    remove() { nodes.delete(this.id); this.isConnected = false },
  })
  const document = {
    getElementById: (id: string) => nodes.get(id), createElement, addEventListener: vi.fn(),
    body: { appendChild(node: any) { nodes.set(node.id, node); node.isConnected = true } },
  }
  class Image {
    style = { cssText: '' }; naturalWidth = 320; value = ''; onload = () => {}; onerror = () => {}
    set src(value: string) { this.value = value; this.onload() }
    get src() { return this.value }
  }
  const read = vi.fn(() => data)
  const window: any = { plus: { nativeObj: { Bitmap: { getBitmapById: () => ({ toBase64Data: read }) } }, storage: { setItem: (key: string, value: string) => acks.set(key, value) } } }
  runInNewContext(source, { window, document, Image, requestAnimationFrame: (fn: () => void) => frames.push(fn) })
  return { api: window.__lakesideReadingBackdrop, nodes, read, acks, paint: () => { while (frames.length) frames.shift()!() } }
}

describe('native reading Bitmap decoding', () => {
  it.each([
    ['data:image/null;base64,iVBORw0KGgoAAAANSUhEUg==', 'data:image/png;base64,'],
    ['data:image/null;base64,/9j/4AAQSkZJRgABAQ==', 'data:image/jpeg;base64,'],
    ['data:image/jepg;base64,/9j/4AAQSkZJRgABAQ==', 'data:image/jpeg;base64,'],
  ])('accepts real image bytes despite the native MIME label: %s', (data, prefix) => {
    const f = renderer(data)
    f.api.setBitmap('bitmap', 'reading', 1.2, .02, true)
    const root = f.nodes.get('__lakeside_reading_backdrop__')
    expect(root.children[0].src.startsWith(prefix)).toBe(true)
    expect(root.children[0].style.cssText).toContain('filter:blur(1.2px)')
    expect(f.acks.size).toBe(0)
    f.paint()
    expect(f.acks.get('__lakeside_backdrop_ready__:reading')).toBe('ready')
    f.api.setBitmap('bitmap', 'reading', 1.2, .02, true)
    expect(f.nodes.get('__lakeside_reading_backdrop__')).toBe(root)
    expect(f.read).toHaveBeenCalledOnce()
    f.api.clear()
    expect(f.nodes.size).toBe(0)
  })

  it.each([null, 'data:image/null;base64,not-image-bytes'])('does not acknowledge an empty or invalid snapshot', data => {
    const f = renderer(data)
    f.api.setBitmap('bitmap', 'reading', 1.2, .02, true)
    f.paint()
    expect(f.nodes.size).toBe(0)
    expect(f.acks.size).toBe(0)
  })
})
