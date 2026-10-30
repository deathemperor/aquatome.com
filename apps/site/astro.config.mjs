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
      'astro:build:done': () => {
        const gaps = [...missing].filter(([, s]) => s.size).map(([lang, s]) => `${lang}: ${[...s].map(x => JSON.stringify(x)).join(', ')}`)
        if (gaps.length) throw new Error(`Untranslated UI text (add to src/i18n/<lang>.json):\n${gaps.join('\n')}`)
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
