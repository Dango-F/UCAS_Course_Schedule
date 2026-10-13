import { installGlassLens } from './glass-lens.js'
import { createHopNavigation, hopLandingSquash, landingInertiaReady, landingInertiaFrame, HOP_LANDING_COMPRESS_DURATION } from './glass-hop.js'
import { flowMaterialFrame } from './glass-selection-material.js'
import { createGlassTouchLight } from './glass-touch-light.js'

export function tabAt(x, left, width, count = 4) { return Math.max(0, Math.min(count - 1, Math.floor((x - left) / width * count))) }

// Velocity affects only the material, never the position under the finger.
export function glassVelocity(previous, dx, dt) {
  if (!Number.isFinite(dx) || !Number.isFinite(dt) || dt <= 0) return previous
  const sample = Math.max(-3, Math.min(3, dx / dt))
  return previous + (sample - previous) * (1 - Math.exp(-dt / 32))
}
export function glassDeformation(velocity) {
  const speed = Number.isFinite(velocity) ? Math.abs(velocity) : 0
  const stretch = 1.015 + .08 * (1 - Math.exp(-speed / .65))
  return { stretch, squeeze: .985 / Math.sqrt(stretch) }
}
export function draggedTab(startIndex, dx, width, count = 4) {
  return Math.max(0, Math.min(count - 1, startIndex + dx / (width / count)))
}

// Analytic critically damped spring: stable at 60/90/120Hz; velocity survives
// retargeting. Values use tabs (or normalized pressure) and milliseconds.
export function glassSpring(value, velocity, target, dt, frequency = .03) {
  const elapsed = Math.max(0, dt)
  const delta = value - target, b = velocity + frequency * delta
  const decay = Math.exp(-frequency * elapsed)
  const next = target + (delta + b * elapsed) * decay
  const speed = (velocity - frequency * b * elapsed) * decay
  return Math.abs(next - target) < .0005 && Math.abs(speed) < .00003
    ? { value:target, velocity:0 } : { value:next, velocity:speed }
}

export function boundedGlassStretch(stretch, position, tabWidth, count) {
  const room = 3.5 + Math.min(position, count - 1 - position) * tabWidth
  return Math.min(stretch, 1 + 2 * Math.max(0, room) / Math.max(1, tabWidth))
}

// Flow alone: restore resting tint on visual arrival (within half a pixel),
// without waiting for the pressure/shape/light springs to reach exact zero.
export function flowMaterialClear(held, position, target, tabWidth) {
  return Boolean(held || Math.abs(position - target) * tabWidth > .5)
}

// Couple impact to visible arrival, not the spring's much later exact zero.
// A fast reversal can briefly cross the target: do not count that as arrival.
export function flowImpactReady(held, position, velocity, target, tabWidth) {
  return !flowMaterialClear(held, position, target, tabWidth) && Math.abs(velocity * tabWidth) <= .05
}

export const FLOW_BRAKE_OVERSHOOT = .06
export const FLOW_LANDING_REBOUND_DURATION = 125
export const FLOW_LANDING_DURATION = HOP_LANDING_COMPRESS_DURATION + FLOW_LANDING_REBOUND_DURATION
export function flowBrakeReady(held, position, velocity, target, count = 3) {
  return landingInertiaReady(held,position,velocity,target,count,FLOW_BRAKE_OVERSHOOT)
}

// One position clock for approach, inertial overshoot and recovery. Hermite
// interpolation preserves the incoming speed; the capsule never parks first.
export function flowBrakeFrame(from, velocity, target, direction, elapsed) {
  return landingInertiaFrame(from,velocity,target,direction,elapsed,FLOW_BRAKE_OVERSHOOT,FLOW_LANDING_REBOUND_DURATION)
}

export function flowWallReady(held, position, velocity, target, count = 3) {
  if (target !== 0 && target !== count-1) return false
  // The brake gate depends on relative distance/speed only. Relabel the wall
  // as an interior target to reuse exactly the same incoming-motion test.
  return flowBrakeReady(held,1+position-target,velocity,1)
}

export function flowWallFrame(from, velocity, target, direction, elapsed, count = 3) {
  const state = flowBrakeFrame(from,velocity,target,direction,elapsed)
  // A wall absorbs the curve's overshoot as deformation, not travel outside
  // the capsule. Approach and compression still share one uninterrupted clock.
  const value = Math.max(0,Math.min(count-1,state.value))
  return {value,velocity:value === state.value ? state.velocity : 0}
}

export function flowWallOrigin(from, position, target, origin) {
  const wall = target === 0 ? 0 : 100
  const remaining = Math.min(1,Math.abs(position-target)/Math.max(.000001,Math.abs(from-target)))
  return wall+(origin-wall)*remaining
}

export function flowImpactProgress(elapsed, destination, count = 3) {
  const wall = destination === 0 || destination === count - 1
  if (elapsed <= HOP_LANDING_COMPRESS_DURATION) {
    // Contact has immediate momentum: start with nonzero slope rather than
    // the almost invisible first frames of the braking curve's sine squared.
    const t = Math.max(0, elapsed / HOP_LANDING_COMPRESS_DURATION)
    const contact = Math.sin(Math.PI * t / 2)
    // Braking starts promptly too, but stays softer than an abrupt wall hit.
    // Both terms finish at the original peak with zero slope.
    return wall ? contact : (contact + hopLandingSquash(elapsed,FLOW_LANDING_REBOUND_DURATION)) / 2
  }
  return hopLandingSquash(elapsed,FLOW_LANDING_REBOUND_DURATION)
}

// Flow responds to horizontal momentum with a lighter 125ms impact / 125ms
// recovery. Shift is a percentage of width.
export function flowLandingDeformation(amount, destination, direction, count = 3) {
  const t = Math.max(0, Math.min(1, Number.isFinite(amount) ? amount : 0))
  if (destination === 0 || destination === count - 1) {
    return {stretch:1 - .12 * t, squeeze:1 + .15 * t, shift:0, origin:destination === 0 ? 0 : 100}
  }
  // Forward bias now comes from the capsule's actual inertial position, not
  // a second face translation after its wrapper has already stopped.
  return {stretch:1 + .035 * t, squeeze:1 + .018 * t, shift:0, origin:50}
}

export function createGlassNavigation(root, initial, select) {
  const touchLight = createGlassTouchLight(root, initial)
  let mode = initial.navMotion === 'hop' ? 'hop' : 'flow'
  const create = config => mode === 'hop' ? createHopNavigation(root, config, select) : createFlowNavigation(root, config, select)
  let controller = create(initial)
  return {
    configure(next) {
      touchLight.configure(next)
      const nextMode = next.navMotion === 'hop' ? 'hop' : 'flow'
      if (nextMode !== mode) { controller.destroy(); mode = nextMode; controller = create(next) }
      else controller.configure(next)
    },
    suspend() { touchLight.suspend(); controller.suspend() },
    destroy() { touchLight.destroy(); controller.destroy() }
  }
}

function createFlowNavigation(root, initial, select) {
  const doc = root.ownerDocument, win = doc.defaultView
  const bar = root.querySelector('.glass-bar'), indicator = root.querySelector('.glass-selection')
  const light = root.querySelector('.glass-light')
  const buttons = Array.from(root.querySelectorAll('[data-nav-index]'))
  const tabCount = buttons.length
  const lens = installGlassLens(root, root.querySelector('.glass-surface'), initial.clarity)
  const selectorLens = installGlassLens(indicator, indicator.firstElementChild, initial.clarity, {selector:true})
  let material = 0, materialMotion = null
  const listeners = []
  let config = initial, press = null
  let destroyed = false, suppressClickUntil = 0
  let paintFrame = 0, lastFrame = 0
  let position = { value:config.activeIndex, velocity:0 }, target = config.activeIndex
  let pressure = { value:0, velocity:0 }
  let stretch = {value:1, velocity:0}, squeeze = {value:1, velocity:0}
  let landing = null, landingPending = false, impactAmount = {value:0, velocity:0}
  let wallTailOrigin = null
  let brakeSuppressedTarget = null
  let travelDirection = 0, impactPosition = target, impactDirection = 0, impactOffsetX = 0
  let lightX = {value:0, velocity:0}, lightY = {value:0, velocity:0}
  let releaseSpeed = 0, releaseTime = 0
  let tabWidth = 1, barHeight = 56, measuredSize = ''
  const motionPreference = win.matchMedia('(prefers-reduced-motion: reduce)')
  const quiet = () => config.reducedMotion || motionPreference.matches
  const qElastic = () => config.qElastic !== false
  function listen(target, type, fn, options) {
    target.addEventListener(type, fn, options)
    listeners.push(() => target.removeEventListener(type, fn, options))
  }
  function requestPaint() {
    if (destroyed || paintFrame) return
    lastFrame = win.performance.now()
    paintFrame = win.requestAnimationFrame(paint)
  }
  function writeMaterial(speed, dt = 0) {
    if (quiet()) { material = 0; materialMotion = null }
    if (materialMotion) {
      const state = flowMaterialFrame(materialMotion.from, materialMotion.held,
        win.performance.now() - materialMotion.start, materialMotion.distance, Math.abs(position.value - target) * tabWidth)
      material = state.value
      if (state.done) materialMotion = null
    }
    root.classList.toggle('is-material-clear', material > 0)
    root.style.setProperty('--glass-material-progress', material.toFixed(4))
    const progress = quiet() ? 0 : Math.max(0, Math.min(1, pressure.value))
    selectorLens.setStrength(progress)
    const shape = qElastic() ? glassDeformation(speed) : {stretch:1, squeeze:1}
    const targetStretch = 1 + (shape.stretch - 1) * progress, targetSqueeze = 1 + (shape.squeeze - 1) * progress
    // Both approaches blend from the rendered travelling shape. A wall must
    // not reset its shape/pivot first and launch a second movement after rest.
    if (!qElastic()) {
      // Optics/pressure keep their own clocks; disabling elastic motion fixes
      // both dimensions immediately, including any interrupted shape tail.
      stretch = {value:1, velocity:0}; squeeze = {value:1, velocity:0}
    } else if (landing?.kind === 'brake' || landing?.inertial) {
      const remainder = win.performance.now()-landing.start >= HOP_LANDING_COMPRESS_DURATION ? 0 : 1-impactAmount.value
      stretch = {value:1+(landing.stretch-1)*remainder,velocity:0}
      squeeze = {value:1+(landing.squeeze-1)*remainder,velocity:0}
    } else {
      stretch = quiet() || landing ? {value:1, velocity:0} : glassSpring(stretch.value, stretch.velocity, targetStretch, dt, .04)
      squeeze = quiet() || landing ? {value:1, velocity:0} : glassSpring(squeeze.value, squeeze.velocity, targetSqueeze, dt, .04)
    }
    const landingShape = flowLandingDeformation(qElastic() ? impactAmount.value : 0, impactPosition, impactDirection, tabCount)
    impactOffsetX = landingShape.shift * tabWidth / 100
    indicator.style.transform = `translate3d(${position.value * 100}%,0,0)`
    indicator.style.setProperty('--glass-stretch', (boundedGlassStretch(stretch.value, position.value, tabWidth, tabCount) * landingShape.stretch).toFixed(4))
    indicator.style.setProperty('--glass-squeeze', (squeeze.value * landingShape.squeeze).toFixed(4))
    indicator.style.setProperty('--glass-flow-impact-x', `${landingShape.shift.toFixed(4)}%`)
    // Pin the wall-facing edge during collision, but center the ordinary
    // velocity deformation and the directional braking at interior tabs.
    const origin = landing?.inertial
      ? flowWallOrigin(landing.from,position.value,landing.target,landing.origin)
      : landing ? landingShape.origin : impactAmount.value > 0 ? wallTailOrigin ?? landingShape.origin : 50
    indicator.style.setProperty('--hop-origin', `${origin}% 50%`)
    root.style.setProperty('--glass-press', progress.toFixed(4))
    return Boolean(materialMotion || landing) || impactAmount.value !== 0 || impactAmount.velocity !== 0 || stretch.value !== targetStretch || squeeze.value !== targetSqueeze || stretch.velocity !== 0 || squeeze.velocity !== 0
  }
  function beginMaterial(held) {
    // Keep the current impact's shape AND direction on interruption. They
    // recover during the new move; only a new arrival replaces the descriptor.
    if (landing?.kind === 'brake' && landing.target === target) brakeSuppressedTarget = target
    else if (brakeSuppressedTarget !== target) brakeSuppressedTarget = null
    if (landing?.inertial) wallTailOrigin = parseFloat(indicator.style.getPropertyValue('--hop-origin')) || 0
    else if (landing) wallTailOrigin = null
    landing = null
    landingPending = qElastic() && brakeSuppressedTarget !== target && (landingPending || Math.abs(position.value - target) > .001)
    materialMotion = {from:material, held, start:win.performance.now(), distance:Math.abs(position.value - target) * tabWidth}
  }
  function halt() {
    win.cancelAnimationFrame(paintFrame); paintFrame = 0
    press = null
    root.classList.remove('is-pressed', 'is-dragging')
    target = config.activeIndex
    position = {value:target, velocity:0}; pressure = {value:0, velocity:0}
    stretch = {value:1, velocity:0}; squeeze = {value:1, velocity:0}; releaseSpeed = 0
    landing = null; landingPending = false; impactAmount = {value:0, velocity:0}
    wallTailOrigin = null
    brakeSuppressedTarget = null
    travelDirection = impactDirection = impactOffsetX = 0; impactPosition = target
    material = 0; materialMotion = null
    lightX = {value:4 + (target + .5) * tabWidth, velocity:0}; lightY = {value:barHeight / 2, velocity:0}
    light.style.transform = `translate3d(${lightX.value - barHeight * 1.05}px,${lightY.value - barHeight * .7}px,0)`
    indicator.style.setProperty('--glass-reflection-angle', '145deg')
    writeMaterial(0)
  }
  function resize() {
    const size = `${bar.clientWidth}x${bar.clientHeight}`
    // Mobile viewport notifications need not change the bar's geometry.
    // Preserve the live contact, material and optics in that case.
    if (size === measuredSize) return
    measuredSize = size
    tabWidth = Math.max(1, (bar.clientWidth - 8) / tabCount)
    barHeight = bar.clientHeight || 56
    root.style.setProperty('--glass-light-width', `${barHeight * 2.1}px`)
    root.style.setProperty('--glass-light-height', `${barHeight * 1.4}px`)
    halt()
  }
  function paint(now) {
    paintFrame = 0
    if (destroyed) return
    const dt = Math.min(64, Math.max(0, now - lastFrame)); lastFrame = now
    const age = press ? Math.max(0, now - press.time) : 240
    const decayed = press ? press.velocity * Math.exp(-age / 55) : 0
    const moving = age < 240 && Math.abs(decayed) > .025
    const previousPosition = position.value
    if (press?.dragged) position = {value:press.position, velocity:0}
    else if (!quiet() && landing?.kind === 'brake') position = flowBrakeFrame(landing.from,landing.velocity,target,impactDirection,now-landing.start)
    else if (!quiet() && landing?.inertial) position = flowWallFrame(landing.from,landing.velocity,target,impactDirection,now-landing.start,tabCount)
    else position = quiet() ? {value:target, velocity:0} : glassSpring(position.value, position.velocity, target, dt)
    // Bounds avoid edge overshoot after a very fast reversal.
    if (position.value < 0 || position.value > tabCount - 1) position = {value:Math.max(0, Math.min(tabCount - 1, position.value)), velocity:0}
    // Actual incoming motion is authoritative, including a spring reversal or
    // cancelled drag; the last clicked target alone can imply the wrong side.
    if (Math.abs(position.value - previousPosition) > .0000001) travelDirection = Math.sign(position.value - previousPosition)
    if (quiet() || !qElastic()) { landing = null; landingPending = false; impactAmount = {value:0, velocity:0} }
    else if (!landing && landingPending && flowBrakeReady(press,position.value,position.velocity,target,tabCount)) {
      landing = {kind:'brake',target,start:now,from:position.value,velocity:position.velocity,stretch:stretch.value,squeeze:squeeze.value}
      landingPending = false
      impactPosition = target; impactDirection = Math.sign(position.velocity) || travelDirection
    }
    else if (!landing && landingPending && flowWallReady(press,position.value,position.velocity,target,tabCount)) {
      landing = {kind:'wall',inertial:true,target,start:now,from:position.value,velocity:position.velocity,
        stretch:Number(indicator.style.getPropertyValue('--glass-stretch')) || 1,
        squeeze:Number(indicator.style.getPropertyValue('--glass-squeeze')) || 1,
        origin:parseFloat(indicator.style.getPropertyValue('--hop-origin')) || 0}
      landingPending = false
      impactPosition = target; impactDirection = Math.sign(position.velocity) || travelDirection
    }
    else if (!landing && landingPending && (target === 0 || target === tabCount-1) && flowImpactReady(press, position.value, position.velocity, target, tabWidth)) {
      // A completed stationary hold retains its original release response;
      // it has no incoming approach velocity to hand off to the wall curve.
      landing = {kind:'wall',target,start:now}; landingPending = false
      impactPosition = target; impactDirection = travelDirection
    }
    if (landing) {
      const elapsed = now - landing.start
      impactAmount = {value:flowImpactProgress(elapsed, impactPosition, tabCount), velocity:0}
      if ((landing.kind === 'brake' || landing.inertial) && (previousPosition-target)*(position.value-target) <= 0) {
        material = 0; materialMotion = null
      }
      if (elapsed >= FLOW_LANDING_DURATION) {
        if (landing.kind === 'brake' || landing.inertial) {position = {value:target,velocity:0};stretch = squeeze = {value:1,velocity:0}}
        landing = null; impactAmount = {value:0, velocity:0}
      }
    } else impactAmount = glassSpring(impactAmount.value, impactAmount.velocity, 0, dt, .04)
    const travelling = Math.abs(position.value - target) > .002 && !press?.dragged
    // Without Q elasticity, travel must not keep the selector's refractive
    // rim/inner highlight alive after arrival. A real finger press still has
    // its normal glass response, but releasing it clears the optics at once.
    const pressureTarget = quiet() || landing?.kind === 'brake' ? 0 : (press || (qElastic() && travelling) ? 1 : 0)
    pressure = quiet() || (!qElastic() && !press)
      ? {value:0, velocity:0}
      : glassSpring(pressure.value, pressure.velocity, pressureTarget, dt, .038)
    const releaseAge = Math.max(0, now - releaseTime)
    const tail = releaseAge < 500 ? Math.abs(releaseSpeed) * Math.exp(-releaseAge / 90) : 0
    const tailMoving = !quiet() && !press && tail > .025
    const shapeMoving = writeMaterial(press?.dragged ? (moving ? decayed : 0) : Math.max(Math.abs(position.velocity * tabWidth), tailMoving ? tail : 0), dt)
    const centerX = 4 + (position.value + .5) * tabWidth + impactOffsetX, centerY = barHeight / 2
    if (press) {
      lightX = {value:press.x - press.left + 4, velocity:0}; lightY = {value:press.y - press.top, velocity:0}
    } else {
      lightX = pressure.value === 0 ? {value:centerX, velocity:0} : glassSpring(lightX.value, lightX.velocity, centerX, dt, .025)
      lightY = pressure.value === 0 ? {value:centerY, velocity:0} : glassSpring(lightY.value, lightY.velocity, centerY, dt, .025)
    }
    light.style.transform = `translate3d(${lightX.value - barHeight * 1.05}px,${lightY.value - barHeight * .7}px,0)`
    const lightMoving = !press && pressure.value > 0 && (lightX.value !== centerX || lightY.value !== centerY || lightX.velocity !== 0 || lightY.velocity !== 0)
    indicator.style.setProperty('--glass-reflection-angle', `${145 + Math.max(-1,Math.min(1,(lightX.value-centerX)/tabWidth))*28}deg`)
    if ((!quiet() && moving) || tailMoving || shapeMoving || lightMoving || (!press?.dragged && (position.value !== target || position.velocity !== 0)) || pressure.value !== pressureTarget || pressure.velocity !== 0) {
      paintFrame = win.requestAnimationFrame(paint)
    }
  }
  function finishPress(event, cancel = false) {
    if (!press || (event.pointerId != null && event.pointerId !== press.id)) return
    if (root.dataset.navIdle === 'true' || root.hasAttribute('inert') || root.dataset.navigationHidden === 'true') cancel = true
    const previous = press
    // A vertical exit is cancellation, not an accidental tab activation.
    if (!cancel && Number.isFinite(event.clientY) && (event.clientY < previous.top - 8 || event.clientY > previous.top + barHeight + 8)) cancel = true
    if (!cancel && Number.isFinite(event.clientX) && (event.clientX < previous.left - 4 || event.clientX > previous.left + previous.width + 4)) cancel = true
    if (previous.dragged) position = {value:previous.position, velocity:0}
    releaseTime = win.performance.now()
    releaseSpeed = previous.velocity * Math.exp(-Math.max(0, releaseTime - previous.time) / 55)
    press = null
    root.classList.remove('is-pressed', 'is-dragging')
    target = cancel ? config.activeIndex : Math.round(previous.position)
    beginMaterial(false)
    // uni-app can consume the subsequent native click when recognizing touch
    // taps. Commit both taps and drags here; ignore a duplicate physical click.
    suppressClickUntil = win.performance.now() + 400
    if (!cancel) select(target)
    requestPaint()
  }
  function onPointerDown(event) {
    if (root.dataset.navIdle === 'true' || root.hasAttribute('inert') || root.dataset.navigationHidden === 'true') return
    if (!bar.contains(event.target) || event.button > 0 || press || event.isPrimary === false) return
    const rect = bar.getBoundingClientRect()
    // A new deliberate tap must not be swallowed by the previous drag's click guard.
    suppressClickUntil = 0
    releaseSpeed = 0
    const index = tabAt(event.clientX, rect.left + 4, rect.width - 8, tabCount)
    press = { id:event.pointerId, start:event.clientX, x:event.clientX, y:event.clientY, top:rect.top,
      left:rect.left + 4, width:rect.width - 8, index, position:index, dragged:false, velocity:0, time:win.performance.now() }
    target = index
    beginMaterial(true)
    root.classList.add('is-pressed')
    requestPaint()
  }
  function onPointerMove(event) {
    if (!press || event.pointerId !== press.id) return
    const now = win.performance.now()
    press.velocity = glassVelocity(press.velocity, event.clientX - press.x, now - press.time)
    press.x = event.clientX; press.y = event.clientY; press.time = now
    if (!press.dragged && Math.abs(press.x - press.start) >= 6) {
      // Take over the visible position, including an interrupted settling spring.
      press.origin = Math.abs(position.value - press.index) < .002 ? press.index : position.value - (press.x - press.start) / (press.width / tabCount)
      press.dragged = true
    }
    if (press.dragged) {
      root.classList.add('is-dragging')
      // Preserve the initial grab point: no jump when pressed off-center.
      press.position = draggedTab(press.origin, press.x - press.start, press.width, tabCount)
      if (qElastic() && Math.abs(press.position - position.value) > .001) landingPending = true
      target = press.position
    }
    requestPaint()
  }
  function onClick(event) {
    if (root.dataset.navIdle === 'true' || root.hasAttribute('inert') || root.dataset.navigationHidden === 'true') return
    const button = event.target.closest('[data-nav-index]')
    if (!button) return
    if (win.performance.now() < suppressClickUntil && event.detail !== 0) { event.preventDefault(); suppressClickUntil = 0; return }
    const destination = Number(button.dataset.navIndex)
    // Repeated activation acknowledges the current move; do not park and
    // launch another overshoot merely because the same tab was clicked again.
    if (landing && destination === target) { select(target); return }
    target = destination
    beginMaterial(false)
    requestPaint(); select(target)
  }
  listen(root, 'pointerdown', onPointerDown, {passive:true})
  listen(doc, 'pointermove', onPointerMove, {passive:true})
  listen(doc, 'pointerup', event => finishPress(event), {passive:true})
  listen(doc, 'pointercancel', event => finishPress(event, true), {passive:true})
  listen(root, 'click', onClick)
  listen(win, 'resize', resize, {passive:true})
  listen(win, 'blur', halt)
  listen(doc, 'visibilitychange', () => { if (doc.hidden) halt() })
  if (motionPreference.addEventListener) listen(motionPreference, 'change', () => { if (quiet()) halt() })
  function configure(next) {
    const changedTab = config.activeIndex !== next.activeIndex
    const changedQElastic = (config.qElastic !== false) !== (next.qElastic !== false)
    config = next
    lens.setClarity(config.clarity)
    root.classList.toggle('is-quiet', config.reducedMotion)
    root.classList.toggle('is-flow-shadow-disabled', !qElastic())
    if (changedQElastic) {
      // Keep the position/material and any held finger response. Remove the
      // automatic travel optics immediately when Q elasticity is switched off.
      landing = null; impactAmount = {value:0, velocity:0}; brakeSuppressedTarget = null
      wallTailOrigin = null
      landingPending = qElastic() && Math.abs(position.value - target) > .001
      if (!qElastic() && !press) pressure = {value:0, velocity:0}
      writeMaterial(Math.abs(position.velocity * tabWidth))
      requestPaint()
    }
    if (!press && changedTab && target !== config.activeIndex) { target = config.activeIndex; beginMaterial(false); requestPaint() }
    if (quiet()) halt()
  }
  const resizeObserver = win.ResizeObserver ? new win.ResizeObserver(resize) : null
  resizeObserver?.observe(bar)
  resize()
  configure(initial)
  return {
    configure,
    suspend:halt,
    destroy() {
      destroyed = true
      win.cancelAnimationFrame(paintFrame)
      listeners.forEach(remove => remove())
      resizeObserver?.disconnect()
      lens.destroy()
      selectorLens.destroy()
      root.classList.remove('is-material-clear', 'is-pressed', 'is-dragging', 'is-flow-shadow-disabled')
      root.style.removeProperty('--glass-press')
      root.style.removeProperty('--glass-material-progress')
      indicator.style.removeProperty('--glass-reflection-angle')
      indicator.style.removeProperty('--hop-origin')
      indicator.style.removeProperty('--glass-flow-impact-x')
      light.style.removeProperty('transform')
      root.style.removeProperty('--glass-light-width'); root.style.removeProperty('--glass-light-height')
    }
  }
}
