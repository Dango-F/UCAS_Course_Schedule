import { installGlassLens } from './glass-lens.js'
import { listenGlassPress } from './glass-press.js'
import { hopMaterialProgress } from './glass-selection-material.js'
import { normalizeHopPeak } from '../domain/navigation-hop'

const HOP_SETTLE_DURATION = 160
export const HOP_TRAVEL_DURATION = 200
export const HOP_LANDING_COMPRESS_DURATION = 125
export const HOP_LANDING_REBOUND_DURATION = 125
export const HOP_LANDING_DURATION = HOP_LANDING_COMPRESS_DURATION + HOP_LANDING_REBOUND_DURATION
// Keep the visual clock explicit for the navigation and its preview.
export const HOP_SQUASH_REBOUND_DURATION = HOP_LANDING_REBOUND_DURATION
export const HOP_SQUASH_DURATION = HOP_LANDING_COMPRESS_DURATION + HOP_SQUASH_REBOUND_DURATION
const HOP_HELD_LIFT = 2
const HOP_LANDING_STRETCH = .12
const HOP_LANDING_COMPRESSION = .15

// One bounded clock for both translation and inflation. No spring tail after
// arrival; interruption starts at the last rendered position and size.
export function hopFrame(from, to, startLift, endLift, elapsed, duration) {
  const t = Math.max(0, Math.min(1, elapsed / Math.max(1, duration)))
  const p = t * t * (3 - 2 * t)
  const travelling = Math.abs(to - from) > .001
  const pulse = travelling && endLift === 0 ? Math.sin(Math.PI * p) ** 2 * (1 - startLift) : 0
  return { position:t === 1 ? to : from + (to - from) * p,
    lift:t === 1 ? endLift : startLift + (endLift - startLift) * p + pulse, done:t === 1 }
}

// A separate flight arc makes page switches read as a hop. A stationary hold
// keeps its original 2px lift, and a mid-flight retarget starts at the current
// height rather than snapping back to the bar.
export function hopAirborne(start, elapsed, duration, travelling) {
  const t = Math.max(0, Math.min(1, elapsed / Math.max(1, duration)))
  const p = t * t * (3 - 2 * t)
  if (!travelling) return start * (1 - p)
  if (p < .5) {
    const up = 2 * p
    return start + (1 - start) * up * up * (3 - 2 * up)
  }
  const down = 2 * p - 1
  return 1 - down * down * (3 - 2 * down)
}

// The capsule arrives at its full size, compresses once under its own
// momentum, then recovers. This is separate from the airborne inflation.
export function hopLandingSquash(elapsed, reboundDuration = HOP_LANDING_REBOUND_DURATION) {
  if (elapsed <= HOP_LANDING_COMPRESS_DURATION) {
    const t = Math.max(0, elapsed / HOP_LANDING_COMPRESS_DURATION)
    return Math.sin(Math.PI * t / 2) ** 2
  }
  const t = Math.min(1, (elapsed - HOP_LANDING_COMPRESS_DURATION) / reboundDuration)
  return Math.cos(Math.PI * t / 2) ** 2
}

// Hop's vertical landing geometry; flow shares its clock, not these amplitudes.
export function hopLandingDeformation(squash) {
  return { stretch:1 + HOP_LANDING_STRETCH * squash, squeeze:1 - HOP_LANDING_COMPRESSION * squash }
}

// Shared with flow: take over BEFORE reaching an interior tab, retaining the
// incoming velocity instead of parking and starting a second sideways move.
export function landingInertiaReady(held, position, velocity, target, count = 3, overshoot = .06) {
  const remaining = target - position
  return !held && target > 0 && target < count - 1 && Math.abs(remaining) > .000001 && Math.abs(remaining) <= .1
    && remaining * velocity >= 0 && Math.abs(velocity)*HOP_LANDING_COMPRESS_DURATION <= 3*(Math.abs(remaining)+overshoot)
}

export function landingInertiaFrame(from, velocity, target, direction, elapsed, overshoot = .06, reboundDuration = HOP_LANDING_REBOUND_DURATION) {
  const duration = HOP_LANDING_COMPRESS_DURATION
  const landingDuration = duration + reboundDuration
  const peak = target + Math.sign(direction) * overshoot
  if (elapsed <= duration) {
    const t = Math.max(0, elapsed / duration), t2 = t * t, t3 = t2 * t
    return {
      value:(2*t3-3*t2+1)*from + (t3-2*t2+t)*duration*velocity + (-2*t3+3*t2)*peak,
      velocity:((6*t2-6*t)*from + (3*t2-4*t+1)*duration*velocity + (-6*t2+6*t)*peak)/duration
    }
  }
  const t = Math.min(1,(elapsed-duration)/reboundDuration)
  const amount = hopLandingSquash(elapsed,reboundDuration)
  return {value:target + (peak-target)*amount,
    velocity:elapsed >= landingDuration ? 0 : -(peak-target)*Math.PI*Math.sin(Math.PI*t)/(2*reboundDuration)}
}

// Solve the same flow handoff condition on the existing smoothstep flight.
// Its timestamp is independent of RAF cadence, including a delayed frame.
export function hopInertiaStart(from, to, duration) {
  const distance = Math.abs(to-from)
  let low = 0, high = 1
  for (let i = 0;i < 32;i++) {
    const t = (low+high)/2, p = t*t*(3-2*t)
    const remaining = distance*(1-p), velocity = distance*6*t*(1-t)/duration
    if (remaining > .1 || velocity*HOP_LANDING_COMPRESS_DURATION > 3*(remaining+.06)) low = t
    else high = t
  }
  return high*duration
}

// Match flow's wall-contact threshold: subpixel distance AND low incoming
// speed. Start compression while the last bit of travel is still in progress.
export function hopWallStart(from, to, duration, tabWidth) {
  const distance = Math.abs(to-from)*tabWidth
  let low = .5, high = 1
  for (let i = 0;i < 32;i++) {
    const t = (low+high)/2, p = t*t*(3-2*t)
    if (distance*(1-p) > .5 || distance*6*t*(1-t)/duration > .05) low = t
    else high = t
  }
  return high*duration
}

// Middle tabs expand around their own center, not a position-dependent pivot
// that would shift the face sideways during squash. Blend only near the walls.
export function hopTransformOrigin(position, count) {
  const last = count-1
  return Math.max(0,Math.min(100,position < .5 ? position*100 : position > last-.5 ? 100-(last-position)*100 : 50))
}

export function createHopNavigation(root, initial, select, clock) {
  const doc = root.ownerDocument, win = doc.defaultView
  const bar = root.querySelector('.glass-bar'), indicator = root.querySelector('.glass-selection')
  const light = root.querySelector('.glass-light')
  const buttons = [...root.querySelectorAll('[data-nav-index]')]
  const lens = installGlassLens(root, root.querySelector('.glass-surface'), initial.clarity)
  const selectorLens = installGlassLens(indicator, indicator.firstElementChild, initial.clarity, {selector:true})
  const media = win.matchMedia('(prefers-reduced-motion: reduce)')
  const listeners = []
  let config = initial, airHeight = normalizeHopPeak(initial.hopPeak) - HOP_HELD_LIFT
  let position = initial.activeIndex, lift = 0, airborne = 0, squash = 0, target = position
  let frame = 0, motion = null, press = null, destroyed = false, suppressUntil = 0
  let tabWidth = 1, barHeight = 56, measuredSize = ''
  let lightX = 0, lightY = 0, lightOffsetX = 0, lightOffsetY = 0
  let paintedLift, paintedPosition, paintedRise, paintedOrigin, paintedAngle, paintedStretch, paintedSqueeze
  let paintedLightX, paintedLightY
  const iconWeights = []
  const quiet = () => config.reducedMotion || media.matches
  const clamp = value => Math.max(0, Math.min(buttons.length - 1, value))
  function listen(node, type, fn, options) {
    node.addEventListener(type, fn, options)
    listeners.push(() => node.removeEventListener(type, fn, options))
  }
  function draw() {
    const amount = quiet() ? 0 : lift
    const rise = HOP_HELD_LIFT * amount + airHeight * (quiet() ? 0 : airborne)
    if (amount !== paintedLift) {
      const material = hopMaterialProgress(amount)
      root.classList.toggle('is-material-clear', material > 0)
      root.style.setProperty('--glass-material-progress', material.toFixed(4))
      root.style.setProperty('--glass-press', amount.toFixed(4))
      selectorLens.setStrength(amount)
    }
    const shape = hopLandingDeformation(config.qElastic === false ? 0 : squash)
    if (position !== paintedPosition || rise !== paintedRise) {
      indicator.style.transform = `translate3d(${position * 100}%,${-rise}px,0)`
    }
    const stretch = ((1 + .12 * amount) * shape.stretch).toFixed(4)
    const squeeze = ((1 + .38 * amount) * shape.squeeze).toFixed(4)
    if (paintedStretch !== stretch) indicator.style.setProperty('--glass-stretch', stretch)
    if (paintedSqueeze !== squeeze) indicator.style.setProperty('--glass-squeeze', squeeze)
    paintedStretch = stretch; paintedSqueeze = squeeze
    // Grow inward at the first/last tab so the capsule never leaves the screen.
    const origin = config.qElastic === false ? position / Math.max(1, buttons.length - 1) * 100 : hopTransformOrigin(position,buttons.length)
    if (origin !== paintedOrigin) indicator.style.setProperty('--hop-origin', `${origin}% 50%`)
    paintedOrigin = origin
    // Follow the finger while held; share the hop clock on release so the
    // highlight returns to the moving capsule without a jump or extra RAF tail.
    lightX = press
      ? press.x - press.left + (press.dragged ? 0 : (position - press.index) * tabWidth)
      : 4 + (position + .5) * tabWidth + lightOffsetX
    lightY = press ? press.y - press.top : barHeight / 2 - rise + lightOffsetY
    const angle = 145 + Math.max(-1,Math.min(1,(lightX-(4+(position+.5)*tabWidth))/tabWidth))*28
    if (angle !== paintedAngle) indicator.style.setProperty('--glass-reflection-angle', `${angle}deg`)
    paintedAngle = angle
    const x = lightX - barHeight * 1.05, y = lightY - barHeight * .7
    if (x !== paintedLightX || y !== paintedLightY) light.style.transform = `translate3d(${x}px,${y}px,0)`
    paintedLightX = x; paintedLightY = y
    if (amount !== paintedLift || position !== paintedPosition) buttons.forEach((button, index) => {
      const weight = Math.max(0, 1 - Math.abs(position - index)) * amount
      if (weight === iconWeights[index]) return
      iconWeights[index] = weight
      button.style.setProperty('--hop-icon-scale', (1 + .07 * weight).toFixed(4))
      button.style.setProperty('--hop-icon-y', `${-2 * weight}px`)
    })
    paintedPosition = position; paintedRise = rise; paintedLift = amount
  }
  function planLanding(flight, earliest = 0) {
    const {from, to, duration} = flight
    if (to === 0 || to === buttons.length-1) {
      return {at:Math.max(earliest, hopWallStart(from,to,duration,tabWidth)), wall:true}
    }
    const at = Math.max(earliest, hopInertiaStart(from,to,duration))
    const t = at / duration
    return {at, wall:false, from:hopFrame(from,to,0,0,at,duration).position,
      velocity:(to-from)*6*t*(1-t)/duration, direction:Math.sign(to-from)}
  }
  function tick(now) {
    frame = 0
    if (destroyed) return
    if (motion) {
      const elapsed = now-motion.start
      const state = hopFrame(motion.from, motion.to, motion.startLift, motion.endLift, elapsed, motion.duration)
      const t = Math.max(0, Math.min(1, elapsed / motion.duration))
      const remaining = 1 - t * t * (3 - 2 * t)
      lightOffsetX = motion.lightOffsetX * remaining
      lightOffsetY = motion.lightOffsetY * remaining
      position = state.position; lift = state.lift
      airborne = hopAirborne(motion.startAirborne, elapsed, motion.duration, Math.abs(motion.to - motion.from) > .001)
      if (motion.settling) {
        lift = motion.startLift+(motion.endLift-motion.startLift)*(1-remaining)
        airborne = motion.startAirborne*remaining
      }
      squash = motion.startSquash * remaining
      // Both flight and landing are sampled from the original tap. A missed
      // frame can cross their boundary without starting another animation.
      const landing = motion.landing
      if (landing && elapsed >= landing.at) {
        const age = elapsed - landing.at
        if (!landing.wall) position = landingInertiaFrame(landing.from,landing.velocity,motion.to,landing.direction,age,.06,HOP_SQUASH_REBOUND_DURATION).value
        squash += (1-squash)*hopLandingSquash(age,HOP_SQUASH_REBOUND_DURATION)
      }
      if (state.done && (!landing || elapsed >= landing.at + HOP_SQUASH_DURATION)) {
        position = motion.to
        squash = 0
        motion = null
      }
    }
    draw()
    if (motion) frame = clock.request(tick)
  }
  function requestDraw() { if (!destroyed && !frame) frame = clock.request(tick) }
  function move(to, endLift) {
    target = clamp(to)
    // Repeated activation/parent acknowledgement does not restart an ongoing
    // flight or its single inertial recovery.
    if (!quiet() && !press && endLift === 0 && motion?.to === target && motion.endLift === 0) return
    clock.cancel(frame); frame = 0
    if (quiet()) { motion = null; position = target; lift = airborne = squash = 0; lightOffsetX = lightOffsetY = 0; draw(); return }
    const distance = Math.abs(target - position)
    if (distance < .0001 && Math.abs(lift - endLift) < .0001 && airborne < .0001 && squash < .0001) { motion = null; lightOffsetX = lightOffsetY = 0; draw(); return }
    lightOffsetX = press ? 0 : lightX - (4 + (position + .5) * tabWidth)
    lightOffsetY = press ? 0 : lightY - (barHeight / 2 - HOP_HELD_LIFT * lift - airHeight * airborne)
    motion = {from:position,to:target,startLift:lift,startAirborne:airborne,startSquash:squash,endLift,lightOffsetX,lightOffsetY,start:win.performance.now(),duration:distance < .001 ? HOP_SETTLE_DURATION : HOP_TRAVEL_DURATION}
    if (!press && endLift === 0 && config.qElastic !== false && distance > .001) motion.landing = planLanding(motion)
    draw()
    frame = clock.request(tick)
  }
  function halt() {
    clock.cancel(frame); frame = 0; motion = null; press = null
    position = target = config.activeIndex; lift = airborne = squash = 0; lightOffsetX = lightOffsetY = 0; draw()
  }
  function resize() {
    const size = `${bar.clientWidth}x${bar.clientHeight}`
    if (size === measuredSize) return
    measuredSize = size
    tabWidth = Math.max(1, (bar.clientWidth - 8) / buttons.length)
    barHeight = bar.clientHeight || 56
    root.style.setProperty('--glass-light-width', `${barHeight * 2.1}px`)
    root.style.setProperty('--glass-light-height', `${barHeight * 1.4}px`)
    halt()
  }
  function finish(event, cancel = false) {
    if (!press || (event.pointerId != null && event.pointerId !== press.id)) return
    if (root.dataset.navIdle === 'true' || root.hasAttribute('inert') || root.dataset.navigationHidden === 'true') cancel = true
    const previous = press
    if (Number.isFinite(event.clientY) && (event.clientY < previous.top - 8 || event.clientY > previous.bottom + 8)) cancel = true
    if (Number.isFinite(event.clientX) && (event.clientX < previous.left - 4 || event.clientX > previous.right + 4)) cancel = true
    press = null
    const destination = cancel ? config.activeIndex : (previous.dragged ? Math.round(position) : previous.index)
    suppressUntil = win.performance.now() + 400
    move(destination, 0)
    if (!cancel) select(destination)
  }
  function onPointerDown(event) {
    if (root.dataset.navIdle === 'true' || root.hasAttribute('inert') || root.dataset.navigationHidden === 'true') return
    if (!bar.contains(event.target) || press || event.button > 0 || event.isPrimary === false) return
    const rect = bar.getBoundingClientRect()
    const index = clamp(Math.floor((event.clientX - rect.left - 4) / tabWidth))
    press = {id:event.pointerId,startX:event.clientX,x:event.clientX,y:event.clientY,top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,index,dragged:false}
    suppressUntil = 0
    move(index, 1)
  }
  function onPointerMove(event) {
    if (!press || press.id !== event.pointerId) return
    press.x = event.clientX; press.y = event.clientY
    const dx = event.clientX - press.startX
    if (!press.dragged && Math.abs(dx) >= 6) {
      press.dragged = true
      press.origin = position - dx / tabWidth
    }
    if (!press.dragged) { requestDraw(); return }
    // Direct position updates preserve finger following; only the inflation
    // finishes its short interpolation after a drag starts.
    position = clamp(press.origin + dx / tabWidth)
    if (motion) { motion.from = position; motion.to = position }
    requestDraw()
  }
  listenGlassPress(root, listen, onPointerDown, onPointerMove, finish, initial.allowPagePan)
  listen(root, 'click', event => {
    if (root.dataset.navIdle === 'true' || root.hasAttribute('inert') || root.dataset.navigationHidden === 'true') return
    const button = event.target.closest('[data-nav-index]')
    if (!button) return
    if (win.performance.now() < suppressUntil && event.detail !== 0) { event.preventDefault(); return }
    const index = Number(button.dataset.navIndex)
    move(index, 0); select(index)
  })
  listen(root, 'keydown', event => {
    if (root.dataset.navIdle === 'true' || root.hasAttribute('inert') || root.dataset.navigationHidden === 'true') return
    const button = event.target.closest('[data-nav-index]')
    if (!button || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    if (event.repeat) return
    suppressUntil = 0
    const index = Number(button.dataset.navIndex)
    move(index, 0); select(index)
  })
  listen(win, 'resize', resize, {passive:true})
  listen(win, 'blur', halt)
  listen(doc, 'visibilitychange', () => { if (doc.hidden) halt() })
  if (media.addEventListener) listen(media, 'change', () => { if (quiet()) halt() })
  const observer = win.ResizeObserver ? new win.ResizeObserver(resize) : null
  observer?.observe(bar)
  root.classList.add('is-hop')
  resize()
  function configure(next) {
    const changed = config.activeIndex !== next.activeIndex
    const changedQElastic = (config.qElastic !== false) !== (next.qElastic !== false)
    config = next; airHeight = normalizeHopPeak(next.hopPeak) - HOP_HELD_LIFT; lens.setClarity(next.clarity)
    if (changedQElastic && next.qElastic === false) {
      // Preserve the rendered position when cancelling inertia mid-recovery.
      // Return to the tab without a snap or a second inflation pulse.
      if (motion?.landing && !motion.landing.wall && win.performance.now()-motion.start >= motion.landing.at) {
        motion = {from:position,to:target,startLift:lift,startAirborne:airborne,startSquash:0,endLift:0,
          lightOffsetX,lightOffsetY,start:win.performance.now(),duration:HOP_SETTLE_DURATION,settling:true}
        requestDraw()
      }
      squash = 0
      if (motion) { motion.startSquash = 0; motion.landing = null }
      else { clock.cancel(frame); frame = 0 }
      draw()
    }
    if (changedQElastic && next.qElastic !== false && motion && !press && motion.endLift === 0 && !motion.settling && Math.abs(motion.to-motion.from) > .001) {
      motion.landing = planLanding(motion, win.performance.now()-motion.start)
    }
    root.classList.toggle('is-quiet', Boolean(next.reducedMotion))
    if (quiet()) halt()
    // Parent acknowledgement must not restart the clock already launched on tap.
    else if (changed && !press && target !== next.activeIndex) move(next.activeIndex, 0)
  }
  configure(initial)
  return { configure, suspend:halt, destroy() {
    destroyed = true; clock.cancel(frame); observer?.disconnect()
    listeners.forEach(remove => remove()); lens.destroy(); selectorLens.destroy()
    root.classList.remove('is-hop', 'is-material-clear'); root.style.removeProperty('--glass-press')
    root.style.removeProperty('--glass-material-progress')
    light.style.removeProperty('transform')
    root.style.removeProperty('--glass-light-width'); root.style.removeProperty('--glass-light-height')
    indicator.style.removeProperty('--hop-origin')
    indicator.style.removeProperty('--glass-reflection-angle')
    buttons.forEach(button => { button.style.removeProperty('--hop-icon-scale'); button.style.removeProperty('--hop-icon-y') })
  } }
}
