// A page can be recreated after navigation; the launch composition plays once
// per application process, never each time the app returns from the background.
let claimed = false
let safetyTimer: ReturnType<typeof setTimeout> | undefined

export function claimLaunchScreen(): boolean {
  if (claimed) return false
  claimed = true
  return true
}

export function closeNativeLaunchScreen(): void {
  if (safetyTimer !== undefined) { clearTimeout(safetyTimer); safetyTimer = undefined }
  // #ifdef APP-PLUS
  try { plus.navigator.closeSplashscreen() } catch { /* Unsupported preview base. */ }
  // #endif
}

export function protectNativeLaunchScreen(): void {
  // This also covers a first-page mount error: never leave a manual splash open.
  // #ifdef APP-PLUS
  safetyTimer = setTimeout(closeNativeLaunchScreen, 2500)
  // #endif
}
