/*
 * Copyright 2025 Kyant
 * Licensed under the Apache License, Version 2.0.
 * See src/static/licenses/AndroidLiquidGlass-LICENSE.txt.
 *
 * Modified for Lakeside: AGSL rounded-rect SDF/refraction translated to a
 * capsule-only JS displacement map for SVG backdrop filters. No native code
 * or background screenshots are executed/captured by this implementation.
 * Source: Kyant0/AndroidLiquidGlass, internal/Shaders.kt, commit 65ab177.
 */
import { glassClarityProfile, normalizeGlassClarity } from '../domain/glass-material'
import { createOpticalMap, spectralFilterPrimitives, SPECTRAL_SAMPLES, opticalMapScale } from './glass-spectrum.js'
import { createGlassBackdropAdaptation } from './glass-adaptive.js'

/** Inward sampling offset, in CSS pixels. Interior remains undistorted. */
export function capsuleRefraction(x, y, width, height, rim = 16, amount = 10) {
  const radius = Math.min(width, height) / 2
  const cx = x - width / 2, cy = y - height / 2
  // Capsule SDF: distance from the closest point on its center segment.
  const segment = Math.max(0, width / 2 - radius)
  const dx = cx - Math.max(-segment, Math.min(segment, cx))
  const length = Math.hypot(dx, cy)
  const distance = length - radius
  if (distance >= 0 || distance <= -rim || !length) return [0, 0]
  const t = 1 + distance / rim
  const displacement = -amount * (1 - Math.sqrt(Math.max(0, 1 - t * t)))
  return [displacement * dx / length, displacement * cy / length]
}

export function createCapsuleMap(width, height, rim = 16, amount = 10) {
  const pixels = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const [dx, dy] = capsuleRefraction(x + .5, y + .5, width, height, rim, amount)
    const index = (y * width + x) * 4
    pixels[index] = 255 * (.5 + dx / (2 * amount))
    pixels[index + 1] = 255 * (.5 + dy / (2 * amount))
    pixels[index + 2] = 128
    pixels[index + 3] = 255
  }
  return pixels
}

export function lensGeometry(height) {
  const h = Math.max(1, Number.isFinite(height) ? height : 56)
  return {
    rim: Math.min(h / 2, 16, h * 2 / 9),
    amount: Math.min(10, h * 5 / 36),
    blur: Math.min(.8, Math.max(.4, h * .6 / 56))
  }
}
let lensSequence = 0
// Main bar and preview can live in separate renderjs bundles in one WebView.
const mapCacheKey = Symbol.for('lakeside.glass.optical-map-urls.v2')
const maxCachedSizes = 8

// The selector bends the glyphs through a narrow rim and keeps its center clear.
export function selectorLensGeometry(height) {
  const h = Math.max(1, Number.isFinite(height) ? height : 48)
  return { rim: Math.min(9, h * 9 / 48), amount: Math.min(6.5, h * 6.5 / 48) }
}
const SELECTOR_REST_STRENGTH = .5

// The parked preview can prepare one wavelength at a time. A visible lens
// finishes the same cache entry synchronously before it displays its filter.
function encodedMaps(doc, width, height, pixelRatio, selector, dispersed, depth, deadline) {
  const density = selector ? Math.min(3, Math.max(2, Math.ceil(pixelRatio))) : 1
  const cache = doc[mapCacheKey] || (doc[mapCacheKey] = new Map())
  const key = [width, height, density, pixelRatio, selector, dispersed, depth].join('/')
  const entry = cache.get(key) || { urls: [], nextRow: 0, scratch: null }
  cache.delete(key)
  cache.set(key, entry)
  if (cache.size > maxCachedSizes) cache.delete(cache.keys().next().value)
  const count = selector && dispersed ? SPECTRAL_SAMPLES.length : 1
  if (entry.urls.length === count) return entry.urls
  if (!entry.scratch) {
    const canvas = doc.createElement('canvas')
    canvas.width = width * density
    canvas.height = height * density
    // This CPU-only scratch canvas avoids a synchronous GPU readback.
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) throw new Error('Canvas unavailable')
    entry.scratch = { canvas, ctx, image: ctx.createImageData(canvas.width, canvas.height) }
  }
  const { canvas, ctx, image } = entry.scratch
  const geometry = selector ? selectorLensGeometry(height) : lensGeometry(height)
  // A 120 Hz WebView commonly grants only 1–5 ms of idle time. Keep the
  // unfinished rows, including when the real preview claims them mid-map.
  while (entry.urls.length < count && (!deadline || deadline.timeRemaining() >= 1.5)) {
    if (entry.nextRow < image.height) {
      const to = deadline ? Math.min(entry.nextRow + 4, image.height) : image.height
      const offset = selector && dispersed ? SPECTRAL_SAMPLES[entry.urls.length].offset : 0
      createOpticalMap(width, height, geometry.rim, geometry.amount, depth, offset, dispersed, !selector, density, selector, 1 / pixelRatio,
        { pixels: image.data, from: entry.nextRow, to })
      entry.nextRow = to
    }
    if (entry.nextRow === image.height && (!deadline || deadline.timeRemaining() >= 1.5)) {
      ctx.putImageData(image, 0, 0)
      const url = canvas.toDataURL()
      if (url === 'data:,') throw new Error('Empty glass map')
      entry.urls.push(url)
      entry.nextRow = 0
      if (deadline) break
    }
  }
  if (entry.urls.length === count) entry.scratch = null
  return entry.urls
}

export function preparePreviewMaps(root) {
  const doc = root.ownerDocument, win = doc.defaultView
  if (!win.requestIdleCallback || !/(?:Chrome|Chromium|Edg)\//.test(win.navigator.userAgent)
    || !win.CSS?.supports('backdrop-filter', 'url(#glass)')
    || win.matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more)').matches) return
  let index = 0
  let idle = 0, layout = null, children = null
  function schedule() { if (!idle) idle = win.requestIdleCallback(prepare) }
  function stopObserving() { layout?.disconnect(); children?.disconnect(); layout = children = null }
  function prepare(deadline) {
    idle = 0
    if (doc.hidden) return
    // Android may deliver the renderjs binding before it inserts the preview
    // children. Resolve the actual laid-out surfaces in the view's own DOM.
    const surface = root.querySelector(index === 0 ? '.glass-surface' : '.glass-selection > :first-child')
    if (!root.isConnected || !surface?.clientWidth || !surface.clientHeight) {
      if (!layout && win.ResizeObserver) {
        layout = new win.ResizeObserver(schedule)
        layout.observe(surface || root)
      }
      if (!children && !surface && win.MutationObserver) {
        children = new win.MutationObserver(schedule)
        children.observe(root, {childList:true, subtree:true})
      }
      return
    }
    stopObserving()
    if (deadline.timeRemaining() >= 1.5) {
      const selector = index === 1
      try {
        const urls = encodedMaps(doc, surface.clientWidth, surface.clientHeight, selector ? Math.max(1, win.devicePixelRatio || 1) : 1, selector, true, true, deadline)
        if (urls.length === (selector ? SPECTRAL_SAMPLES.length : 1)) index++
      } catch { return }
    }
    if (index < 2) schedule()
  }
  schedule()
  return () => { stopObserving(); win.cancelIdleCallback(idle) }
}

/** Generate the displacement map only on mount/size change, not on slider input. */
export function installGlassLens(root, surface, initialClarity, options = {}) {
  const selector = options.selector === true
  let clarity = normalizeGlassClarity(initialClarity)
  // The outer capsule keeps its mirrored edge. The moving selector uses a
  // rounded refraction profile for the tab glyphs beneath it.
  const edgeMirror = !selector
  const dispersed = options.chromaticAberration !== false, depth = options.depthEffect !== false
  const doc = root.ownerDocument, win = doc.defaultView
  const ns = 'http://www.w3.org/2000/svg'
  const svg = doc.createElementNS(ns, 'svg')
  svg.setAttribute('aria-hidden', 'true')
  svg.style.cssText = 'position:absolute;width:0;height:0;pointer-events:none'
  // Separate renderjs bundles can each have their own module counter. Reserve
  // an unused DOM id so the settings preview never samples the real bar's map.
  let id
  do { id = `lakeside-nav-refraction-${++lensSequence}` } while (doc.getElementById(id))
  svg.innerHTML = `<defs><filter id="${id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" color-interpolation-filters="sRGB">${spectralFilterPrimitives(dispersed, selector, edgeMirror)}</filter></defs>`
  svg.dataset.glassOptics = dispersed ? 'seven-spectrum' : 'single'
  svg.dataset.depthEffect = String(depth && !edgeMirror)
  svg.dataset.opticalMode = edgeMirror ? 'vertical-compressed-fold' : 'refraction'
  svg.dataset.edgeMirror = String(edgeMirror)
  root.appendChild(svg)
  const maps = [...svg.querySelectorAll('feImage')]
  const displacements = [...svg.querySelectorAll('feDisplacementMap')]
  const lensFilter = svg.querySelector('filter')
  const refractionFilter = `url(#${id})`
  // SVG backdrop filters are not interoperable. Enable the port on the
  // Chromium/WebView path we verify; other engines retain CSS glass material.
  const supported = /(?:Chrome|Chromium|Edg)\//.test(win.navigator.userAgent) && win.CSS?.supports('backdrop-filter', refractionFilter)
  const reduced = win.matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more)')
  let lastSize = '', disposed = false, mapReady = false
  let strength = 0, lastScale = '', lastSelectorFilter = ''
  let geometry = lensGeometry(56)
  function applySelector() {
    const available = supported && !reduced.matches && mapReady
    const refraction = SELECTOR_REST_STRENGTH + (1 - SELECTOR_REST_STRENGTH) * strength
    const scale = (opticalMapScale(geometry.amount, dispersed) * refraction).toFixed(4)
    if (scale !== lastScale) { displacements.forEach(node => node.setAttribute('scale', scale)); lastScale = scale }
    // Use the cached rim both at rest and through contact. Pressure only
    // changes the displacement scale, so the compositing order stays stable.
    const value = available ? refractionFilter : ''
    if (value !== lastSelectorFilter) {
      if (value) surface.style.setProperty('--glass-selector-filter', value)
      else surface.style.removeProperty('--glass-selector-filter')
      lastSelectorFilter = value
    }
    const renderer = reduced.matches ? 'opaque' : available ? 'svg-refraction' : 'inactive'
    if (root.dataset.glassRenderer !== renderer) root.dataset.glassRenderer = renderer
  }
  function applyMaterial() {
    if (disposed) return
    if (selector) { applySelector(); return }
    const profile = glassClarityProfile(clarity)
    // The outer surface softens page content before it reaches the selector.
    // The selector's separate filter still samples the navigation artwork sharply.
    const blur = Number((geometry.blur * profile.blurFactor).toFixed(2))
    const baseFilter = blur > 0 ? `saturate(1.5) blur(${blur}px)` : 'saturate(1.5)'
    surface.style.setProperty('--glass-base-filter', baseFilter)
    root.style.setProperty('--glass-surface-alpha', profile.surfaceAlpha.toFixed(4))
    root.style.setProperty('--glass-selection-alpha', profile.selectionAlpha.toFixed(4))
    if (!supported || reduced.matches || !mapReady) {
      surface.style.removeProperty('backdrop-filter')
      root.dataset.glassRenderer = reduced.matches ? 'opaque' : 'blur-fallback'
    } else {
      surface.style.backdropFilter = `${baseFilter} ${refractionFilter}`
      root.dataset.glassRenderer = 'svg-refraction'
    }
  }
  function update() {
    if (disposed) return
    const width = Math.round(surface.clientWidth), height = Math.round(surface.clientHeight)
    if (!width || !height) return
    geometry = selector ? selectorLensGeometry(height) : lensGeometry(height)
    if (!supported || reduced.matches) {
      applyMaterial()
      return
    }
    // clientWidth/Height ignore the transient press/show transform.
    const pixelRatio = selector ? Math.max(1, win.devicePixelRatio || 1) : 1
    const key = `${width}x${height}@${pixelRatio}`
    try {
      if (key !== lastSize) {
        const urls = encodedMaps(doc, width, height, pixelRatio, selector, dispersed, depth)
        maps.forEach((map, index) => map.setAttribute('href', urls[index]))
        // Percentages inside a zero-size SVG can produce a uniform, displaced
        // backdrop instead of our map. Keep every optical coordinate in pixels.
        for (const node of [...maps, lensFilter]) {
          node.setAttribute('width', String(width)); node.setAttribute('height', String(height))
        }
        if (!selector) displacements.forEach(node => node.setAttribute('scale', String(opticalMapScale(geometry.amount, dispersed, edgeMirror))))
        lastSize = key
      }
      mapReady = true
    } catch {
      mapReady = false
    }
    applyMaterial()
  }
  const observer = win.ResizeObserver ? new win.ResizeObserver(update) : null
  observer?.observe(surface)
  win.addEventListener('resize', update)
  reduced.addEventListener?.('change', update)
  update()
  const adaptation = selector ? null : createGlassBackdropAdaptation(root)
  function destroy() {
    disposed = true
    adaptation?.destroy()
    observer?.disconnect()
    win.removeEventListener('resize', update)
    reduced.removeEventListener?.('change', update)
    if (selector) {
      surface.style.removeProperty('--glass-selector-filter')
      delete root.dataset.glassRenderer
    } else {
      surface.style.removeProperty('backdrop-filter')
      surface.style.removeProperty('--glass-base-filter')
      root.style.removeProperty('--glass-surface-alpha')
      root.style.removeProperty('--glass-selection-alpha')
    }
    svg.remove()
  }
  return {
    destroy,
    setStrength(value) {
      const next = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0
      if (disposed || !selector || next === strength) return
      strength = next
      // Animate only a scalar; never read layout or re-encode the cached map.
      applySelector()
    },
    setClarity(value) {
      const next = normalizeGlassClarity(value)
      if (disposed || selector || next === clarity) return
      clarity = next
      // No layout reads, PNG encoding or gesture animation restarts.
      applyMaterial()
    }
  }
}
