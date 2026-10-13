/** Total upward travel at the crest, including the existing 2px held lift. */
export const DEFAULT_HOP_PEAK = 5
export const MIN_HOP_PEAK = 2
export const MAX_HOP_PEAK = 9

export function normalizeHopPeak(value: unknown): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(number)
    ? Math.max(MIN_HOP_PEAK, Math.min(MAX_HOP_PEAK, Math.round(number)))
    : DEFAULT_HOP_PEAK
}
