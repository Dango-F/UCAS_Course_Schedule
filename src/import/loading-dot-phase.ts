// Runs both in the preview and in the local progress overlay's WebView.
// Read the whole group before writing, once when the user sees completion.
export function captureLoadingDotPhase(dots: NodeListOf<SVGCircleElement>): void {
  const phases = Array.from(dots, dot => {
    const style = dot.ownerDocument.defaultView!.getComputedStyle(dot)
    return { dot, opacity: style.opacity, transform: style.transform }
  })
  for (const { dot, opacity, transform } of phases) {
    dot.style.setProperty('--dot-start-opacity', opacity)
    dot.style.setProperty('--dot-start-transform', transform)
  }
}
