import { expect, it } from 'vitest'
import { captureLoadingDotPhase } from '../src/import/loading-dot-phase'

it('captures every breathing dot before the first impact style write', () => {
  let written = false
  const styles = ['.23', '.71', '1'].map((opacity, index) => ({
    opacity, transform: `matrix(${.72 + index * .12}, 0, 0, 1, 0, 0)`
  }))
  const captured = styles.map(() => new Map<string, string>())
  const dots = styles.map((phase, i) => ({
    ownerDocument: { defaultView: { getComputedStyle() { expect(written).toBe(false); return phase } } },
    style: { setProperty(name: string, value: string) { written = true; captured[i].set(name, value) } }
  }))
  captureLoadingDotPhase(dots as unknown as NodeListOf<SVGCircleElement>)
  expect(captured.map(values => [...values.values()])).toEqual(styles.map(phase => [phase.opacity, phase.transform]))
})
