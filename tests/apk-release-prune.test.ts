import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { apkReleasePrune, pruneReleaseAssets, releasePruneCandidates } from '../scripts/apk-release-prune.mjs'

const devSources = [
  { name: 'components/navigation-items.ts', text: 'export const SHOW_DEVELOPER_TOOLS = import.meta.env.DEV\n' },
  { name: 'pages/index/index.vue', text: '<GlassTestDashboard v-if="SHOW_DEVELOPER_TOOLS && activeTab === 3" />' },
  { name: 'components/GlassTestDashboard.vue', text: '<image src="/static/glass-lab/cloud-mountains.jpg"/><image src="/static/glass-lab/night-earth.jpg"/>' },
]
const temporaryRoots: string[] = []
afterEach(() => {
  for (const root of temporaryRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true })
})

describe('App release resource filtering', () => {
  it('excludes only the audited assets and unused auxiliary files', () => {
    expect(releasePruneCandidates(devSources)).toHaveLength(15)
    for (const required of ['__uniapppicker.js', 'uni-app-view.umd.js', 'static/ucas-portal-preload.js',
      'static/ucas-progress-overlay.html', 'static/ucas-reading-backdrop.js', 'static/ucas-logout-empty.json',
      'static/licenses/AndroidLiquidGlass-LICENSE.txt', 'static/licenses/AndroidLiquidGlass-NOTICE.txt']) {
      expect(releasePruneCandidates(devSources)).not.toContain(required)
    }
  })

  it('keeps artwork as soon as a source references it', () => {
    const sources = [...devSources, { name: 'components/New.vue', text: '<image src="/static/app-icon-1024.png" />' }]
    expect(releasePruneCandidates(sources)).not.toContain('static/app-icon-1024.png')
  })

  it('keeps photos if the test tab becomes a release feature', () => {
    const sources = devSources.map(source => ({ ...source, text: source.text.replace('import.meta.env.DEV', 'true') }))
    expect(releasePruneCandidates(sources)).not.toContain('static/glass-lab/cloud-mountains.jpg')
    expect(releasePruneCandidates(sources)).not.toContain('static/glass-lab/README.md')
  })

  it('keeps photos if another page uses the image or the test component', () => {
    for (const text of ['<image src="/static/glass-lab/night-earth.jpg"/>', '<GlassTestDashboard />']) {
      expect(releasePruneCandidates([...devSources, { name: 'pages/new/index.vue', text }]))
        .not.toContain('static/glass-lab/night-earth.jpg')
    }
  })

  it('keeps framework helpers when their features or direct file paths are used', () => {
    const sources = [...devSources, { name: 'components/New.vue', text: '<editor/><map/><barcode/>uni.chooseLocation();uni.scanCode();"__uniappautomator.js"' }]
    expect(releasePruneCandidates(sources).filter(filename => filename.startsWith('__uniapp'))).toEqual([])
    expect(releasePruneCandidates([...devSources, { name: 'new.ts', text: '"__uniappquill.js"' }])).not.toContain('__uniappquill.js')
    expect(releasePruneCandidates(devSources, true)).not.toContain('__uniappautomator.js')
  })

  it('does not enable filtering for development, watch, H5 or an explicit opt-out', () => {
    const env = { ...process.env }
    try {
      for (const settings of [
        { UNI_PLATFORM: 'app', NODE_ENV: 'development', LAKESIDE_APK_PRUNE: '' },
        { UNI_PLATFORM: 'h5', NODE_ENV: 'production', LAKESIDE_APK_PRUNE: '' },
        { UNI_PLATFORM: 'app', NODE_ENV: 'production', LAKESIDE_APK_PRUNE: '0' },
      ]) {
        Object.assign(process.env, settings)
        delete process.env.UNI_NODE_ENV
        const plugin = apkReleasePrune()
        ;(plugin.configResolved as Function)({ root: '/no-file-operations-expected', build: {} })
        ;(plugin.closeBundle as { handler: Function }).handler()
      }
      Object.assign(process.env, { UNI_PLATFORM: 'app', NODE_ENV: 'production', LAKESIDE_APK_PRUNE: '' })
      const watched = apkReleasePrune()
      ;(watched.configResolved as Function)({ root: '/no-file-operations-expected', build: { watch: {} } })
      ;(watched.closeBundle as { handler: Function }).handler()
    } finally { process.env = env }
  })

  it('touches only whitelisted generated copies and leaves runtime JS/CSS intact', () => {
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'lakeside-apk-prune-'))
    temporaryRoots.push(workspaceRoot)
    const sourceRoot = path.join(workspaceRoot, 'src')
    const outputRoot = path.join(workspaceRoot, 'dist/build/app')
    fs.mkdirSync(sourceRoot, { recursive: true })
    fs.mkdirSync(outputRoot, { recursive: true })
    fs.writeFileSync(path.join(sourceRoot, 'App.vue'), '<view/>')
    for (const filename of ['__uniappquill.js', '__uniapppicker.js', 'app-service.js', 'app-renderjs.js', 'app.css']) {
      fs.writeFileSync(path.join(outputRoot, filename), 'original bytes: ' + filename)
    }
    const result = pruneReleaseAssets({ workspaceRoot, sourceRoot, outputRoot })
    expect(result.files).toEqual(['__uniappquill.js'])
    expect(fs.readFileSync(path.join(sourceRoot, 'App.vue'), 'utf8')).toBe('<view/>')
    for (const filename of ['__uniapppicker.js', 'app-service.js', 'app-renderjs.js', 'app.css']) {
      expect(fs.readFileSync(path.join(outputRoot, filename), 'utf8')).toBe('original bytes: ' + filename)
    }
    expect(() => pruneReleaseAssets({ workspaceRoot, sourceRoot, outputRoot: sourceRoot })).toThrow('Not a generated')
    expect(() => pruneReleaseAssets({ workspaceRoot, sourceRoot, outputRoot: workspaceRoot })).toThrow('Not a generated')
  })
})
