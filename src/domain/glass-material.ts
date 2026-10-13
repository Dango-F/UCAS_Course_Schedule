/** A visual control, not a physical light-transmission percentage. */
export const DEFAULT_GLASS_CLARITY = 100

const BALANCED_GLASS_CLARITY = 80

export function normalizeGlassClarity(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(100, Math.round(value))) : DEFAULT_GLASS_CLARITY
}

/** Keep 80 as the balanced material while reserving 100 for maximum clarity. */
export function glassClarityProfile(value: unknown) {
  const clarity = normalizeGlassClarity(value)
  if (clarity <= BALANCED_GLASS_CLARITY) {
    const haze = 1 - clarity / BALANCED_GLASS_CLARITY
    return { blurFactor: 1 + 3 * haze, surfaceAlpha: .06 + .19 * haze, selectionAlpha: .04 + .06 * haze }
  }
  const clear = (clarity - BALANCED_GLASS_CLARITY) / (100 - BALANCED_GLASS_CLARITY)
  return { blurFactor: 1 - clear * 2 / 3, surfaceAlpha: .06 - .04 * clear, selectionAlpha: .04 - .015 * clear }
}
