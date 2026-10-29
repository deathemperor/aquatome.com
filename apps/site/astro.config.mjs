import { defineConfig } from 'astro/config'

export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  outDir: process.env.OUT_DIR ?? './dist',
  trailingSlash: 'always',
  // Inline all CSS (~45 KB, ~10 KB gzipped): no render-blocking stylesheet requests on a first mobile visit.
  build: { format: 'directory', inlineStylesheets: 'always' },
})
