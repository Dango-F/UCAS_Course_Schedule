import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { apkReleasePrune } from './scripts/apk-release-prune.mjs'
import { createRequire } from 'node:module'

// HBuilderX invokes the app compiler directly, without npm's prebuild hook.
if (['app', 'app-plus'].includes(process.env.UNI_PLATFORM || '')) {
  createRequire(import.meta.url)('./scripts/generate-widget-small-cap.cjs')
}

export default defineConfig({ plugins: [uni(), apkReleasePrune()], server: { strictPort: true } })
