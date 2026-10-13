import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { loadingMarkup, loadingVariants } from '../src/components/loading-preview'
import { createUcasProgressOverlayScript } from '../src/import/ucas'

describe('loading animation comparison', () => {
  it('provides the original and three distinct self-contained alternatives', () => {
    expect(loadingVariants.map(item => item.id)).toEqual(['original', 'arc', 'ticks', 'orbit'])
    expect(new Set(Object.values(loadingMarkup)).size).toBe(4)
    for (const markup of Object.values(loadingMarkup)) {
      expect(markup).toContain('aria-hidden="true"')
      expect(markup).toContain('class="lp-check"')
      expect(markup).not.toMatch(/<script|<foreignObject|\son\w+=|href=/i)
    }
    expect(loadingMarkup.ticks.match(/class="lp-tick"/g)).toHaveLength(12)
  })

  it('preserves the original dot geometry and completion path', () => {
    const production = createUcasProgressOverlayScript({ value: 0, phase: 'starting', label: '测试' })
    expect(production).toContain('i<18')
    expect(production).toContain('60+39*Math.cos(angle)')
    expect(production).toContain('M44 60 L53 69 L75 48')
    expect(loadingMarkup.original.match(/class="lp-dot"/g)).toHaveLength(18)
    const dots = [...loadingMarkup.original.matchAll(/cx="([^"]+)" cy="([^"]+)" r="2.7"/g)]
    for (const [, x, y] of dots) expect(Math.hypot(Number(x) - 60, Number(y) - 60)).toBeCloseTo(39)
    expect(loadingMarkup.original).toContain('cx="60" cy="21"')
    expect(loadingMarkup.original).toContain('M44 60 L53 69 L75 48')
  })

  it('moves the production and preview highlight clockwise without startup delays', () => {
    const production = createUcasProgressOverlayScript({ value: 0, phase: 'starting', label: '测试' })
    const initial = production.match(/dot\.style\.animationDelay=String\((.*?)\)\+'s'/)![1]
    const update = production.match(/else\{progressDot\.style\.animationDelay=String\((.*?)\)\+'s'/)![1]
    const delays = [...loadingMarkup.original.matchAll(/--pulse-delay:([^s]+)s/g)].map(match => Number(match[1]))
    expect(delays).toHaveLength(18)
    delays.forEach((delay, i) => {
      expect(delay).toBeLessThan(0)
      expect(runInNewContext(initial, { i })).toBeCloseTo(delay)
      expect(runInNewContext(update, { j: i })).toBeCloseTo(delay)
      // Positions increase clockwise (top -> right). Each next dot reaches
      // the 40% brightness peak one step later, including across the wrap.
      const next = (i + 1) % delays.length
      expect((delays[next] - delay + 1.45) % 1.45).toBeCloseTo(1.45 / 18)
    })
    expect(production).toContain("String(j*.012)+'s'") // completion unchanged
  })

  it('restores the production dot finish while other rings keep their matching cycle', () => {
    const production = createUcasProgressOverlayScript({ value: 0, phase: 'starting', label: '测试' })
    expect(production).toContain('stroke-dashoffset .5s cubic-bezier(.22,1,.36,1) .22s')
    expect(production).toContain('transition-delay:.9s')
    const session = readFileSync('src/import/ucas-import-session.ts', 'utf8')
    const finishMethod = session.slice(session.indexOf('private finish('), session.indexOf('private readPacket('))
    const holdMs = Number(finishMethod.match(/\}, (\d+)\)/)![1])
    expect(holdMs).toBe(2000)
    expect(holdMs).toBeGreaterThan((.9 + .9) * 1000)
    const source = readFileSync('src/components/ImportLoadingPreview.vue', 'utf8')
    expect(source).toContain('calc(.5s * var(--lp-speed)) cubic-bezier(.22,1,.36,1) calc(.22s * var(--lp-speed))')
    expect(source).toContain('transition-delay:calc(.9s * var(--lp-speed))')
    expect(source).toContain('animation:lp-rotate calc(var(--lp-cycle) * var(--lp-speed)) var(--lp-turn-ease)')
    expect(source).toContain('stroke-dashoffset calc(var(--lp-cycle) * var(--lp-speed)) var(--lp-turn-ease)')
    expect(source).toContain('var(--lp-cycle) + var(--lp-ring-start) + .1s')
  })

  it('keeps production and preview in sync with CSS-owned frames and reduced-motion end states', () => {
    const source = readFileSync('src/components/ImportLoadingPreview.vue', 'utf8')
    const production = createUcasProgressOverlayScript({ value: 0, phase: 'starting', label: '测试' })
    for (const duration of ['1.45s', '1.5s', '.22s', '.9s']) {
      expect(production).toContain(duration)
      expect(source).toContain(duration)
    }
    expect(source).not.toMatch(/requestAnimationFrame|setInterval/)
    expect(source).toContain('@media (prefers-reduced-motion:reduce)')
    expect(source).toContain('.loading-preview.is-complete :deep(.lp-dot) { opacity:0 !important; }')
    expect(source).toContain(':deep(svg)')
    expect(source).toContain(':deep(.lp-moving)')
  })
})
