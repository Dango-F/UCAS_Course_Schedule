import { defineStore } from 'pinia'
import { ref } from 'vue'
import { DEFAULT_GLASS_CLARITY, normalizeGlassClarity } from '../domain/glass-material'
import { DEFAULT_HOP_PEAK, normalizeHopPeak } from '../domain/navigation-hop'

const STORAGE_KEY = 'lakeside:glass-clarity:v1'
const MOTION_KEY = 'lakeside:nav-motion:v1'
const Q_ELASTIC_KEY = 'lakeside:nav-q-elastic:v1'
const TOUCH_LIGHT_KEY = 'lakeside:glass-touch-light:v1'
const HOP_PEAK_KEY = 'lakeside:nav-hop-peak:v1'
const VISIBILITY_KEY = 'lakeside:nav-visibility:v1'
const SETTINGS_MOTION_KEY = 'lakeside:settings-motion:v1'
export type NavigationMotion = 'flow' | 'hop'
export type NavigationVisibility = 'fixed' | 'auto'
function readVisibility(): NavigationVisibility {
  try { return uni.getStorageSync(VISIBILITY_KEY) === 'auto' ? 'auto' : 'fixed' } catch { return 'fixed' }
}
export type SettingsMotion = 'card' | 'slide' | 'page' | 'shape'
function readMotion(): NavigationMotion {
  try { return uni.getStorageSync(MOTION_KEY) === 'flow' ? 'flow' : 'hop' } catch { return 'hop' }
}
function readQElastic(): boolean {
  try { return uni.getStorageSync(Q_ELASTIC_KEY) !== false } catch { return true }
}
function readTouchLight(): boolean {
  try { return uni.getStorageSync(TOUCH_LIGHT_KEY) !== false } catch { return true }
}
function readHopPeak(): number {
  try { return normalizeHopPeak(uni.getStorageSync(HOP_PEAK_KEY)) } catch { return DEFAULT_HOP_PEAK }
}
function readSettingsMotion(): SettingsMotion {
  try {
    const saved = uni.getStorageSync(SETTINGS_MOTION_KEY)
    return saved === 'card' || saved === 'page' || saved === 'shape' ? saved : 'slide'
  } catch { return 'slide' }
}

function readClarity(): number {
  try {
    const raw = uni.getStorageSync(STORAGE_KEY)
    return normalizeGlassClarity(typeof raw === 'string' ? JSON.parse(raw) : raw)
  } catch { return DEFAULT_GLASS_CLARITY }
}

export const useAppearanceStore = defineStore('appearance', () => {
  const glassTouchLight = ref(readTouchLight())
  const touchLightSaveError = ref(false)
  function setGlassTouchLight(value: boolean) {
    glassTouchLight.value = Boolean(value)
    try { uni.setStorageSync(TOUCH_LIGHT_KEY, glassTouchLight.value); touchLightSaveError.value = false }
    catch { touchLightSaveError.value = true }
  }
  const navVisibility = ref<NavigationVisibility>(readVisibility())
  const visibilitySaveError = ref(false)
  function setNavVisibility(value: NavigationVisibility) {
    navVisibility.value = value === 'auto' ? 'auto' : 'fixed'
    try { uni.setStorageSync(VISIBILITY_KEY, navVisibility.value); visibilitySaveError.value = false }
    catch { visibilitySaveError.value = true }
  }
  const navMotion = ref<NavigationMotion>(readMotion())
  const motionSaveError = ref(false)
  function setNavMotion(value: NavigationMotion) {
    navMotion.value = value === 'hop' ? 'hop' : 'flow'
    try { uni.setStorageSync(MOTION_KEY, navMotion.value); motionSaveError.value = false }
    catch { motionSaveError.value = true }
  }
  const navHopPeak = ref(readHopPeak())
  const qElastic = ref(readQElastic())
  const qElasticSaveError = ref(false)
  function setQElastic(value: boolean) {
    qElastic.value = Boolean(value)
    try { uni.setStorageSync(Q_ELASTIC_KEY, qElastic.value); qElasticSaveError.value = false }
    catch { qElasticSaveError.value = true }
  }
  const hopPeakSaveError = ref(false)
  let savedHopPeak = navHopPeak.value
  function previewHopPeak(value: unknown) { navHopPeak.value = normalizeHopPeak(value) }
  function saveHopPeak(value: unknown = navHopPeak.value): boolean {
    previewHopPeak(value)
    if (savedHopPeak === navHopPeak.value && !hopPeakSaveError.value) return true
    try {
      uni.setStorageSync(HOP_PEAK_KEY, navHopPeak.value)
      savedHopPeak = navHopPeak.value
      hopPeakSaveError.value = false
      return true
    } catch {
      hopPeakSaveError.value = true
      return false
    }
  }
  const settingsMotion = ref<SettingsMotion>(readSettingsMotion())
  const settingsMotionSaveError = ref(false)
  function setSettingsMotion(value: SettingsMotion) {
    settingsMotion.value = value === 'card' || value === 'page' || value === 'shape' ? value : 'slide'
    try { uni.setStorageSync(SETTINGS_MOTION_KEY, settingsMotion.value); settingsMotionSaveError.value = false }
    catch { settingsMotionSaveError.value = true }
  }
  const glassClarity = ref(readClarity())
  const saveError = ref(false)
  let savedClarity = glassClarity.value

  // No storage writes while the user's finger is moving.
  function previewClarity(value: unknown) { glassClarity.value = normalizeGlassClarity(value) }
  function saveClarity(value: unknown = glassClarity.value): boolean {
    previewClarity(value)
    if (savedClarity === glassClarity.value && !saveError.value) return true
    try {
      uni.setStorageSync(STORAGE_KEY, glassClarity.value)
      savedClarity = glassClarity.value
      saveError.value = false
      return true
    } catch {
      saveError.value = true
      return false
    }
  }
  return { glassTouchLight, touchLightSaveError, setGlassTouchLight, glassClarity, saveError, previewClarity, saveClarity, navMotion, motionSaveError, setNavMotion, qElastic, qElasticSaveError, setQElastic, navHopPeak, hopPeakSaveError, previewHopPeak, saveHopPeak, navVisibility, visibilitySaveError, setNavVisibility, settingsMotion, settingsMotionSaveError, setSettingsMotion }
})
