import { readFileSync } from 'node:fs'
import { NodeTypes, parse, type ElementNode } from '@vue/compiler-dom'
import { expect, it } from 'vitest'

function sheetComponent(filename: string) {
  const source = readFileSync(new URL(`../src/components/${filename}.vue`, import.meta.url), 'utf8')
  const blocks = parse(source, { parseMode: 'sfc' }).children
    .filter((node): node is ElementNode => node.type === NodeTypes.ELEMENT)
  const template = blocks.find(block => block.tag === 'template')
  const roots = template?.children.filter((node): node is ElementNode => node.type === NodeTypes.ELEMENT)
  expect(roots).toHaveLength(1)
  const root = roots![0]
  const moduleScripts = blocks.filter(block => block.tag === 'script' && block.props.some(prop =>
    prop.type === NodeTypes.ATTRIBUTE && prop.name === 'lang' && prop.value?.content === 'renderjs'))
  return {
    tag: root.tag,
    conditional: root.props.some(prop => prop.type === NodeTypes.DIRECTIVE && prop.name === 'if'),
    renderModules: moduleScripts.length
  }
}

it('mounts the Android sheet animation module only when its native backdrop exists', () => {
  // On cold start the closed sheet renders a comment. Android applies every
  // renderjs module on a mounted component to its root with setAttribute.
  expect(sheetComponent('BottomSheet')).toEqual({ tag: 'SheetBackdrop', conditional: true, renderModules: 0 })
  expect(sheetComponent('SheetBackdrop')).toEqual({ tag: 'view', conditional: false, renderModules: 1 })
})
