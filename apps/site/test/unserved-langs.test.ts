import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { LANG, WRITTEN_LANGS } from '@aq/schema/langs'
import { DIST } from './dist'

// A language the engine writes and the site doesn't serve yet (the language table's `served: false`): its files land with
// the engine's pushes, here as the fixture's, and nothing on the built site may show them. The fixture has one of each kind
// the engine writes, named so that a page built from one would be found here. None is unserved since Malay went live
// (malay.test.ts has its pages): the next language's row brings its fixture files, and their names into NAMED.
const unserved = WRITTEN_LANGS.filter(l => !LANG[l].served)
// The unserved language's fixture names (Malay's were "Uji Melayu" and "Ikan laga jantan", now on its pages).
const NAMED: RegExp[] = []
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p] })
const texts = files(DIST).filter(f => /\.(html|json|xml|txt|md)$/.test(f))

test('no page, list or app file of it on the built site', () => {
  for (const l of unserved) {
    const { prefix, html, og } = LANG[l]
    expect(existsSync(join(DIST, prefix)), prefix).toBe(false)
    expect(existsSync(join(DIST, 'app', `${l}.json`)), `/app/${l}.json`).toBe(false)
    expect(existsSync(join(DIST, 'app/latest', `${l}.json`)), `/app/latest/${l}.json`).toBe(false)
    expect(readFileSync(join(DIST, 'sitemap.xml'), 'utf8'), 'sitemap').not.toContain(`${prefix}/`)
    for (const f of texts) {
      const s = readFileSync(f, 'utf8')
      if (NAMED.some(re => re.test(s))) expect.fail(`${f} shows the fixture's ${l} text`)
      if (!f.endsWith('.html')) continue
      for (const said of [`hreflang="${html}"`, `lang="${html}"`, `href="${prefix}/`, `content="${og}"`]) expect(s.includes(said), `${f}: ${said}`).toBe(false)
    }
  }
})

test('the dashboard\'s counts leave it out', () => {
  const stats = readFileSync(join(DIST, '_ab/content.json'), 'utf8')
  for (const l of unserved) expect(stats, l).not.toContain(`"${l}":`)
})
