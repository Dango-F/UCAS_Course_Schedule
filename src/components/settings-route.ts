import { nextTick, ref } from 'vue'

export type SettingsSection = 'home' | 'display' | 'appearance' | 'semester' | 'widgets' | 'preview' | 'about'
export type SlidePhase = 'idle' | 'entering' | 'open' | 'leaving'
export const SETTINGS_ROUTE_DURATION = 340
export const SETTINGS_ROUTE_EXIT_DURATION = 150
export const IMPORT_ROUTE_EXIT_DURATION = SETTINGS_ROUTE_EXIT_DURATION

export function createSettingsRoute(reducedMotion: () => boolean, exitDuration = SETTINGS_ROUTE_EXIT_DURATION) {
  const section = ref<SettingsSection>('home')
  const phase = ref<SlidePhase>('idle')
  const epoch = ref(0)
  let timer: ReturnType<typeof setTimeout> | undefined
  let committed = false
  let viewOwnsMotion = false
  let disposed = false

  function viewStarted(expectedEpoch: number, expectedPhase: SlidePhase) {
    if (disposed || expectedEpoch !== epoch.value || expectedPhase !== phase.value) return
    viewOwnsMotion = true
    committed = true
    clearTimeout(timer)
  }

  function transitionEnd(expectedEpoch = epoch.value, expectedPhase = phase.value) {
    if (disposed || expectedEpoch !== epoch.value || expectedPhase !== phase.value) return
    clearTimeout(timer)
    if (phase.value === 'entering') phase.value = 'open'
    else if (phase.value === 'leaving') {
      section.value = 'home'
      phase.value = 'idle'
    }
  }

  function open(value: SettingsSection) {
    if (disposed || value === 'home' || (section.value !== 'home' && phase.value !== 'leaving')) return false
    clearTimeout(timer)
    const current = ++epoch.value
    section.value = value
    phase.value = reducedMotion() ? 'open' : 'entering'
    committed = false
    viewOwnsMotion = false
    if (phase.value === 'entering') nextTick(() => {
      if (disposed || current !== epoch.value || phase.value !== 'entering') return
      committed = true
      if (viewOwnsMotion) return
      // A backgrounded WebView can omit transitionend.
      timer = setTimeout(() => transitionEnd(current, 'entering'), SETTINGS_ROUTE_DURATION + 160)
    })
    return true
  }

  function back() {
    if (disposed || section.value === 'home') return false
    if (phase.value === 'leaving') return true
    clearTimeout(timer)
    const visible = committed || phase.value === 'open'
    const current = epoch.value
    phase.value = 'leaving'
    if (reducedMotion() || !visible) transitionEnd()
    else timer = setTimeout(() => transitionEnd(current, 'leaving'), exitDuration + 48)
    return true
  }

  return { section, phase, epoch, open, back, viewStarted, transitionEnd, disableMotion: () => transitionEnd(),
    dispose() { disposed = true; clearTimeout(timer) } }
}
