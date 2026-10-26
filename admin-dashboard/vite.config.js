import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The admin site is a single page. Static hosts serve 404.html for unknown paths, so a direct link or refresh on
// e.g. /users still loads the app (the Render rewrite /* -> /index.html does the same with status 200).
const spaFallback = () => ({
  name: 'spa-404-fallback',
  apply: 'build',
  writeBundle(options) {
    const dir = options.dir || resolve('dist')
    copyFileSync(resolve(dir, 'index.html'), resolve(dir, '404.html'))
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), spaFallback()],
  server: {
    port: 5173,
    strictPort: true,
  },
})
