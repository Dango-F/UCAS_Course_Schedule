/** Local, trusted SVG only. Never interpolate course data or remote HTML here. */
export const loadingVariants = [
  { id: 'original', name: '呼吸圆点', tag: '现用', description: '圆点依次呼吸，散开后描出圆环与对勾。' },
  { id: 'arc', name: '细线旋环', tag: '方案一', description: '一笔细弧匀速流转，轻轻收成一个确认。' },
  { id: 'ticks', name: '渐隐短线', tag: '方案二', description: '十二枚短线明暗交替，完成时只留下对勾。' },
  { id: 'orbit', name: '双弧回环', tag: '方案三', description: '两段圆弧同向回旋，闭合后落下对勾。' },
] as const

export type LoadingVariant = typeof loadingVariants[number]['id']
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" aria-hidden="true">${body}</svg>`
const ring = '<circle class="lp-ring" cx="60" cy="60" r="39" transform="rotate(-90 60 60)"/>'
const check = '<path class="lp-check" d="M44 60 L53 69 L75 48"/>'

// Match the production overlay in import/ucas.ts: 18 dots, r=39, 92px SVG,
// 1.45s pulse, 8px impact, 220ms ring delay, 900ms check delay. Keep isolated
// from the injected school-page overlay so previews cannot alter an import.
const dots = Array.from({ length: 18 }, (_, i) => {
  const angle = Math.PI * 2 * i / 18 - Math.PI / 2
  // Increasing phase delays follow the clockwise screen-space dot positions.
  // Subtract a full cycle so every dot is already animating on first paint.
  return `<circle class="lp-dot" cx="${60 + 39 * Math.cos(angle)}" cy="${60 + 39 * Math.sin(angle)}" r="2.7" style="--pulse-delay:${i * (1.45 / 18) - 1.45}s;--finish-delay:${i * .012}s;--dx:${8 * Math.cos(angle)}px;--dy:${8 * Math.sin(angle)}px"/>`
}).join('')
const ticks = Array.from({ length: 12 }, (_, i) =>
  `<path class="lp-tick" d="M60 21 V31" transform="rotate(${i * 30} 60 60)" style="--tick-delay:${i / 12 - 1}s"/>`
).join('')

/** Markup stays unchanged when state changes; CSS owns all animation frames. */
export const loadingMarkup: Record<LoadingVariant, string> = {
  original: svg(dots + ring + check),
  arc: `<div class="lp-moving">${svg('<circle class="lp-arc" cx="60" cy="60" r="39" transform="rotate(-90 60 60)"/>')}</div>${svg('<circle class="lp-track" cx="60" cy="60" r="39"/>' + ring + check)}`,
  ticks: svg(`<g class="lp-ticks">${ticks}</g>${check}`),
  orbit: `<div class="lp-moving">${svg('<circle class="lp-orbit" cx="60" cy="60" r="39"/><circle class="lp-orbit lp-orbit-secondary" cx="60" cy="60" r="39" transform="rotate(180 60 60)"/>')}</div>${svg(ring + check)}`,
}
