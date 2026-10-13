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

// Preserve the optical rim, but only soften fine aliasing: a clear lens should
// not erase the small course lettering behind the center of a compact bar.
export function lensGeometry(height) {
  const h = Math.max(1, Number.isFinite(height) ? height : 56)
  return { rim: Math.min(h / 2, 16, h * 2 / 9), amount: Math.min(10, h * 5 / 36), blur: Math.min(.8, Math.max(.4, h * .6 / 56)) }
}
let lensSequence = 0

// A narrow, weaker rim for the moving selector. No second blur/saturation pass.
export function selectorLensGeometry(height) {
  const h = Math.max(1, Number.isFinite(height) ? height : 48)
  return { rim: Math.min(6, h / 8), amount: Math.min(2.5, h / 19.2), blur: 0 }
}

/** Generate the displacement map only on mount/size change, not on slider input. */
export function installGlassLens(root, surface, initialClarity, options = {}) {
  const selector = options.selector === true
  // Only the stationary outer capsule gets the folded edge; leave the moving
  // selector's material and frame-by-frame work exactly as before.
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
  svg.innerHTML = `<defs><filter id="${id}" filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" x="0" y="0" color-interpolation-filters="sRGB">${spectralFilterPrimitives(dispersed)}</filter></defs>`
  svg.dataset.glassOptics = dispersed ? 'seven-spectrum' : 'single'
  svg.dataset.depthEffect = String(depth && !edgeMirror)
  svg.dataset.opticalMode = edgeMirror ? 'vertical-compressed-fold' : 'refraction'
  svg.dataset.edgeMirror = String(edgeMirror)
  root.appendChild(svg)
  const maps = [...svg.querySelectorAll('feImage')]
  const displacements = [...svg.querySelectorAll('feDisplacementMap')]
  const lensFilter = svg.querySelector('filter')
  const filter = `saturate(1.5) blur(0.6px) url(#${id})`
  // SVG backdrop filters are not interoperable. Enable the port on the
  // Chromium/WebView path we verify; other engines retain CSS glass material.
  const supported = /(?:Chrome|Chromium|Edg)\//.test(win.navigator.userAgent) && win.CSS?.supports('backdrop-filter', filter)
  const reduced = win.matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more)')
  let lastSize = '', disposed = false, mapReady = false
  let strength = 0, lastScale = '', lastSelectorFilter = ''
  let clarity = normalizeGlassClarity(initialClarity), geometry = lensGeometry(56)
  function applySelector() {
    const available = supported && !reduced.matches && mapReady
    const enabled = available && strength > 0
    const scale = (opticalMapScale(geometry.amount, dispersed, edgeMirror) * strength).toFixed(4)
    if (scale !== lastScale) { displacements.forEach(node => node.setAttribute('scale', scale)); lastScale = scale }
    // Keep the same backdrop pipeline throughout a contact. At zero strength
    // every spectral displacement is identity; only the cached scale changes.
    // Replacing url() with brightness() at each endpoint can flash the layer.
    const value = available ? `url(#${id})` : ''
    if (value !== lastSelectorFilter) {
      if (value) surface.style.setProperty('--glass-selector-filter', value)
      else surface.style.removeProperty('--glass-selector-filter')
      lastSelectorFilter = value
    }
    const renderer = reduced.matches ? 'opaque' : enabled ? 'svg-refraction' : 'inactive'
    if (root.dataset.glassRenderer !== renderer) root.dataset.glassRenderer = renderer
  }
  function applyMaterial() {
    if (disposed) return
    if (selector) { applySelector(); return }
    const profile = glassClarityProfile(clarity)
    const blur = (geometry.blur * profile.blurFactor).toFixed(2)
    surface.style.setProperty('--glass-blur', `${blur}px`)
    root.style.setProperty('--glass-surface-alpha', profile.surfaceAlpha.toFixed(4))
    root.style.setProperty('--glass-selection-alpha', profile.selectionAlpha.toFixed(4))
    if (!supported || reduced.matches || !mapReady) {
      surface.style.removeProperty('backdrop-filter')
      root.dataset.glassRenderer = reduced.matches ? 'opaque' : 'blur-fallback'
    } else {
      surface.style.backdropFilter = `saturate(1.5) blur(${blur}px) url(#${id})`
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
    const key = `${width}x${height}`
    try {
      if (key !== lastSize) {
        const canvas = doc.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) throw new Error('Canvas unavailable')
        maps.forEach((map, index) => {
          const data = ctx.createImageData(width, height)
          data.data.set(createOpticalMap(width, height, geometry.rim, geometry.amount, depth, dispersed ? SPECTRAL_SAMPLES[index].offset : 0, dispersed, edgeMirror))
          ctx.putImageData(data, 0, 0)
          map.setAttribute('href', canvas.toDataURL())
        })
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
      surface.style.removeProperty('--glass-blur')
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
      if (disposed || next === clarity) return
      clarity = next
      // No layout reads, PNG encoding or gesture animation restarts.
      applyMaterial()
    }
  }
}
