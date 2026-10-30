import { writeFileSync } from 'node:fs'
import { defineConfig } from 'astro/config'
import { missing, PAGES, routeIn } from './src/lib/i18n.ts'

/** Other languages: the Vietnamese page files mounted again at each language's addresses (see src/lib/i18n.ts). */
function i18nRoutes() {
  return {
    name: 'aq-i18n',
    hooks: {
      'astro:config:setup': ({ injectRoute }) => {
        for (const [lang, files] of Object.entries(PAGES)) for (const file of files) injectRoute({ pattern: routeIn(lang, file), entrypoint: `./src/pages/vi/${file}` })
      },
      // A page that showed Vietnamese text to another language's reader fails the build, listing the strings to translate.
      // I18N_MISSING_OUT=<file>: write them there instead (input for packages/engine/scripts/translate-ui.ts).
      'astro:build:done': () => {
        const gaps = [...missing].filter(([, s]) => s.size)
        if (process.env.I18N_MISSING_OUT) return writeFileSync(process.env.I18N_MISSING_OUT, JSON.stringify(Object.fromEntries(gaps.map(([l, s]) => [l, [...s].sort()])), null, 1))
        if (gaps.length) throw new Error(`Untranslated UI text (add to src/i18n/<lang>.json):\n${gaps.map(([lang, s]) => `${lang}: ${[...s].map(x => JSON.stringify(x)).join(', ')}`).join('\n')}`)
      },
    },
  }
}

export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  outDir: process.env.OUT_DIR ?? './dist',
  trailingSlash: 'always',
  // Inline all CSS (~45 KB, ~10 KB gzipped): no render-blocking stylesheet requests on a first mobile visit.
  build: { format: 'directory', inlineStylesheets: 'always' },
  integrations: [i18nRoutes()],
})
