import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import { apkReleasePrune } from './scripts/apk-release-prune.mjs'

export default defineConfig({ plugins: [uni(), apkReleasePrune()], server: { strictPort: true } })
