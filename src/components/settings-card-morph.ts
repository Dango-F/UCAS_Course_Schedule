import type { SettingsSection } from './settings-route'

export type MotionOrigin = Exclude<SettingsSection, 'home'> | 'import'

export interface CardRect {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

const CARD_RADIUS: Record<MotionOrigin, number> = {
  semester: 21,
  display: 19,
  appearance: 19,
  widgets: 15,
  preview: 15,
  about: 15,
  import: 22,
}

const CARD_FILL: Record<MotionOrigin, string> = {
  semester: 'linear-gradient(125deg,#edf4fa,#f9fbfe)',
  display: '#ffffff',
  appearance: '#f3f8f7',
  widgets: '#ffffff',
  preview: '#ffffff',
  about: '#ffffff',
  import: '#f6f8fc',
}

/** Inset from the settings viewport to the clicked card, in CSS pixels. */
export function settingsCardMorphStyle(page: CardRect | null, card: CardRect | null, section: MotionOrigin): Record<string, string> | null {
  if (!page || !card || page.width < 1 || page.height < 1) return null
  const left = Math.max(0, Math.min(page.width, card.left - page.left))
  const top = Math.max(0, Math.min(page.height, card.top - page.top))
  const right = Math.max(0, Math.min(page.width, page.right - card.right))
  const bottom = Math.max(0, Math.min(page.height, page.bottom - card.bottom))
  if (page.width - left - right < 8 || page.height - top - bottom < 8) return null
  return {
    '--morph-top': `${top}px`,
    '--morph-right': `${right}px`,
    '--morph-bottom': `${bottom}px`,
    '--morph-left': `${left}px`,
    '--morph-radius': `${CARD_RADIUS[section]}px`,
    '--morph-fill': CARD_FILL[section],
  }
}

/** Fit a miniature of the full page inside the entry without changing its aspect ratio. */
export function settingsPageZoomStyle(page: CardRect | null, card: CardRect | null, section: MotionOrigin): Record<string, string> | null {
  if (!page || !card || page.width < 1 || page.height < 1) return null
  const left = Math.max(0, Math.min(page.width, card.left - page.left))
  const top = Math.max(0, Math.min(page.height, card.top - page.top))
  const right = Math.max(0, Math.min(page.width, page.right - card.right))
  const bottom = Math.max(0, Math.min(page.height, page.bottom - card.bottom))
  const width = page.width - left - right
  const height = page.height - top - bottom
  if (width < 8 || height < 8) return null
  const scale = Math.min(width / page.width, height / page.height)
  if (!Number.isFinite(scale) || scale <= 0) return null
  const miniatureWidth = page.width * scale
  const miniatureHeight = page.height * scale
  const visualRadius = Math.min(CARD_RADIUS[section], miniatureWidth * .18)
  return {
    '--zoom-x': `${left + (width - miniatureWidth) / 2}px`,
    '--zoom-y': `${top + (height - miniatureHeight) / 2}px`,
    '--zoom-scale': `${scale}`,
    // The radius is specified before scaling, so compensate once to keep
    // the miniature a softly rounded rectangle instead of a pill.
    '--zoom-radius': `${visualRadius / scale}px`,
  }
}

/** Preserve the entry's outline while preparing an aspect-safe destination. */
export function settingsCardPageStyle(page: CardRect | null, card: CardRect | null, section: MotionOrigin): Record<string, string> | null {
  const outline = settingsCardMorphStyle(page, card, section)
  if (!outline || !page || page.width < 1 || page.height < 1) return null
  const left = parseFloat(outline['--morph-left'])
  const top = parseFloat(outline['--morph-top'])
  const width = page.width - left - parseFloat(outline['--morph-right'])
  const height = page.height - top - parseFloat(outline['--morph-bottom'])
  // Keep the destination page uniformly scaled beneath the source-card
  // handoff; its contents stay hidden until the midpoint of the transition.
  const scale = Math.max(width / page.width, height / page.height)
  if (!Number.isFinite(scale) || scale <= 0) return null
  return {
    ...outline,
    '--zoom-x': `${left + (width - page.width * scale) / 2}px`,
    '--zoom-y': `${top}px`,
    '--zoom-scale': `${scale}`,
  }
}
