import { nextTick, ref } from 'vue'

export type SettingsSection = 'home' | 'display' | 'appearance' | 'semester' | 'widgets' | 'preview' | 'about'
export const SETTINGS_ROUTE_DURATION = 340
export const SETTINGS_ROUTE_EXIT_DURATION = 200

// Keep the directory and the outgoing detail alive until the transform ends.
export function createSettingsRoute(reducedMotion: () => boolean, exitDuration = SETTINGS_ROUTE_DURATION) {
  const section = ref<SettingsSection>('home')
  const phase = ref<'idle' | 'entering' | 'open' | 'leaving'>('idle')
  const shown = ref(false)
  let startTimer: ReturnType<typeof setTimeout> | undefined
  let finishTimer: ReturnType<typeof setTimeout> | undefined
  let generation = 0
  let disposed = false
  function clearTimers() {
    clearTimeout(startTimer)
    clearTimeout(finishTimer)
    startTimer = finishTimer = undefined
  }
  function finish() {
    clearTimers()
    if (phase.value === 'leaving') {
      section.value = 'home'
      shown.value = false
      phase.value = 'idle'
    } else if (phase.value === 'entering') phase.value = 'open'
  }
  function armFallback(duration = SETTINGS_ROUTE_DURATION, grace = 160) {
    // animation completion normally comes from transitionend. Allow time for
    // the view bridge before falling back (backgrounding / missing events).
    finishTimer = setTimeout(finish, duration + grace)
  }
  function open(value: SettingsSection) {
    if (disposed || value === 'home' || (section.value !== 'home' && phase.value !== 'leaving')) return false
    const token = ++generation
    clearTimers()
    section.value = value
    phase.value = reducedMotion() ? 'open' : 'entering'
    shown.value = reducedMotion()
    if (!shown.value) nextTick(() => {
      if (disposed || token !== generation) return
      // Commit the offscreen starting position before changing transform.
      startTimer = setTimeout(() => {
        startTimer = undefined
        if (disposed || token !== generation) return
        shown.value = true
        armFallback()
      }, 32)
    })
    return true
  }
  function back() {
    if (disposed || section.value === 'home') return false
    if (phase.value === 'leaving') return true
    generation += 1
    clearTimers()
    const wasShown = shown.value
    phase.value = 'leaving'
    shown.value = false
    if (reducedMotion() || !wasShown) finish()
    // A missing WebView transitionend must not leave an offscreen page mounted
    // for another 160ms after the shorter return.
    else armFallback(exitDuration, exitDuration === SETTINGS_ROUTE_DURATION ? 160 : 48)
    return true
  }
  function transitionEnd() {
    if ((phase.value === 'entering' && shown.value) || phase.value === 'leaving') finish()
  }
  function disableMotion() {
    generation += 1
    clearTimers()
    if (phase.value === 'entering') shown.value = true
    finish()
  }
  return { section, phase, shown, open, back, transitionEnd, disableMotion,
    dispose() { disposed = true; generation += 1; clearTimers() } }
}
