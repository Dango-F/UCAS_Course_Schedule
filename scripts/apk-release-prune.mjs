import fs from 'node:fs'
import path from 'node:path'
/** @typedef {{ name: string, text: string }} Source */
/** @typedef {{ workspaceRoot: string, sourceRoot: string, outputRoot: string, automation?: boolean }} PruneOptions */

// Only build copies are removed. Source files, routes, JS/CSS and native
// libraries stay untouched; development and H5 builds do not use this filter.
const artwork = [
  'static/app-icon-1024.png', 'static/app-icon.svg',
  'static/lakeside-logo-1024.png', 'static/lakeside-logo.svg',
  'static/glass-river-light.svg',
]
const labPhotos = ['static/glass-lab/cloud-mountains.jpg', 'static/glass-lab/night-earth.jpg']
const helpers = [
  { files: ['__uniappquill.js', '__uniappquillhighlight.js', '__uniappquillimageresize.js'], used: /<\s*editor\b|\bcreateEditorContext\b|__uniappquill/i },
  { files: ['__uniappchooselocation.js', '__uniappopenlocation.js'], used: /\b(?:chooseLocation|openLocation)\b|<\s*map\b|\bplus\s*\.\s*maps\b/ },
  { files: ['__uniappscan.js'], used: /\bscanCode\b|<\s*barcode\b|\bplus\s*\.\s*barcode\b/ },
  { files: ['__uniappautomator.js'], used: /__uniappautomator/ },
]

/** @param {string} root @param {string} target */
function within(root, target) {
  const relative = path.relative(root, target)
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative)
}

/** @param {string} root @returns {Source[]} */
function readSources(root) {
  /** @type {Source[]} */
  const sources = []
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      // A symlinked source could hide additional uses. Do not prune in that case.
      if (entry.isSymbolicLink()) throw new Error('Symlinked input: ' + entry.name)
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(filename)
      else if (/\.(?:vue|ts|js|html|json|css|scss)$/.test(entry.name)) {
        sources.push({ name: path.relative(root, filename).replaceAll('\\', '/'), text: fs.readFileSync(filename, 'utf8') })
      }
    }
  }
  visit(root)
  return sources
}

/** @param {Source[]} sources @param {boolean} automation */
export function releasePruneCandidates(sources, automation = false) {
  const allText = sources.map(source => source.text).join('\n')
  const candidates = artwork.filter(filename => !allText.includes(path.posix.basename(filename)))
  const index = sources.find(source => source.name === 'pages/index/index.vue')?.text || ''
  const navigation = sources.find(source => source.name === 'components/navigation-items.ts')?.text || ''
  const labIsDevOnly = /export\s+const\s+SHOW_DEVELOPER_TOOLS\s*=\s*import\.meta\.env\.DEV\s*(?:;|$)/m.test(navigation)
    && /<GlassTestDashboard\b[^>]*v-if=["']SHOW_DEVELOPER_TOOLS\s*&&[^"']*["']/.test(index)
    && (index.match(/<GlassTestDashboard\b/g) || []).length === 1
    && !sources.some(source => source.name !== 'pages/index/index.vue'
      && source.name !== 'components/GlassTestDashboard.vue' && source.text.includes('GlassTestDashboard'))
  if (labIsDevOnly) {
    const unusedPhotos = labPhotos.filter(filename => !sources.some(source =>
      source.name !== 'components/GlassTestDashboard.vue' && source.text.includes(path.posix.basename(filename))))
    candidates.push(...unusedPhotos)
    if (unusedPhotos.length === labPhotos.length) candidates.push('static/glass-lab/README.md')
  }
  for (const helper of helpers) {
    if (automation && helper.files.includes('__uniappautomator.js')) continue
    if (!helper.used.test(allText) && !helper.files.some(filename => allText.includes(filename))) candidates.push(...helper.files)
  }
  return candidates
}

/** @param {PruneOptions} options */
export function pruneReleaseAssets(options) {
  const workspace = fs.realpathSync(options.workspaceRoot)
  const source = fs.realpathSync(options.sourceRoot)
  const output = fs.realpathSync(options.outputRoot)
  // Accept only known generated-resource trees. No recursive deletion and no
  // deletion from source, backups, node_modules, an APK, or the workspace root.
  const generatedRoots = ['dist/build', 'unpackage/resources', 'unpackage/dist/build']
  if (!within(workspace, output) || output === source || within(source, output)
    || !generatedRoots.some(root => within(path.join(workspace, root), output))) {
    throw new Error('Not a generated App output directory: ' + output)
  }
  const candidates = releasePruneCandidates(readSources(source), options.automation)
  const result = { files: [], bytes: 0 }
  for (const filename of candidates) {
    const target = path.resolve(output, filename)
    if (!within(output, target) || !fs.existsSync(target)) continue
    const stat = fs.lstatSync(target)
    if (!stat.isFile() || stat.isSymbolicLink() || !within(output, fs.realpathSync(target))) continue
    fs.unlinkSync(target)
    result.files.push(filename)
    result.bytes += stat.size
  }
  return result
}

/** @returns {import('vite').Plugin} */
export function apkReleasePrune() {
  /** @type {PruneOptions | undefined} */
  let options
  return {
    name: 'lakeside:apk-release-prune',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      const platform = process.env.UNI_PLATFORM
      if (!['app', 'app-plus'].includes(platform || '') || config.build.watch
        || (process.env.UNI_NODE_ENV || process.env.NODE_ENV) !== 'production'
        || process.env.LAKESIDE_APK_PRUNE === '0') return
      options = {
        workspaceRoot: config.root,
        sourceRoot: process.env.UNI_INPUT_DIR || path.join(config.root, 'src'),
        outputRoot: process.env.UNI_OUTPUT_DIR || path.resolve(config.root, config.build.outDir),
        automation: Boolean(process.env.UNI_AUTOMATOR_WS_ENDPOINT || process.env.UNI_AUTOMATOR_CONFIG),
      }
    },
    closeBundle: {
      order: 'post',
      sequential: true,
      handler() {
        if (!options) return
        try {
          const result = pruneReleaseAssets(options)
          if (result.files.length) console.info(`[APK resources] Excluded ${result.files.length} unused build copies (${(result.bytes / 1024).toFixed(1)} KiB before APK compression).`)
        } catch (error) {
          // Keeping extra resources is safer than guessing when inputs change.
          console.warn('[APK resources] Kept resources; filtering skipped:', error)
        }
      },
    },
  }
}
