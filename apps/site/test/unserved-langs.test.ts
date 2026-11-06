import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { LANG, WRITTEN_LANGS } from '@aq/schema/langs'
import { DIST } from './dist'

// A language the engine writes and the site doesn't serve yet (the language table's `served: false`): its files land with
// the engine's pushes, here as the fixture's, and nothing on the built site may show them. The fixture has one of each kind
// the engine writes, named so that a page built from one would be found here.
const unserved = WRITTEN_LANGS.filter(l => !LANG[l].served)
const FIXTURE = fileURLToPath(new URL('./fixture-content', import.meta.url))
const NAMED = /Uji Melayu|Ikan laga jantan/
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? files(p) : [p] })
const texts = files(DIST).filter(f => /\.(html|json|xml|txt|md)$/.test(f))

test("the fixture carries a file of each kind the engine writes in a language the site doesn't serve", () => {
  expect(unserved).toContain('ms')
  for (const f of ['species/apistogramma-cacatuoides', 'plants/alternanthera-reineckii-mini', 'guides/aquariumcoop-blogs-aquarium-5-gallon-fish', 'breeds/flowerhorn-cichlid', 'glossary/ca-dan', 'places/asia']) expect(existsSync(join(FIXTURE, f, 'ms.json')), f).toBe(true)
  expect(existsSync(join(FIXTURE, 'captions/ms.json'))).toBe(true)
  expect(existsSync(join(FIXTURE, 'equipment/ms/loc.json'))).toBe(true)
})

test('no page, list or app file of it on the built site', () => {
  for (const l of unserved) {
    const { prefix, html, og } = LANG[l]
    expect(existsSync(join(DIST, prefix)), prefix).toBe(false)
    expect(existsSync(join(DIST, 'app', `${l}.json`)), `/app/${l}.json`).toBe(false)
    expect(existsSync(join(DIST, 'app/latest', `${l}.json`)), `/app/latest/${l}.json`).toBe(false)
    expect(readFileSync(join(DIST, 'sitemap.xml'), 'utf8'), 'sitemap').not.toContain(`${prefix}/`)
    for (const f of texts) {
      const s = readFileSync(f, 'utf8')
      if (NAMED.test(s)) expect.fail(`${f} shows the fixture's ${l} text`)
      if (!f.endsWith('.html')) continue
      for (const said of [`hreflang="${html}"`, `lang="${html}"`, `href="${prefix}/`, `content="${og}"`]) expect(s.includes(said), `${f}: ${said}`).toBe(false)
    }
  }
})

test('the dashboard\'s counts leave it out', () => {
  const stats = readFileSync(join(DIST, '_ab/content.json'), 'utf8')
  for (const l of unserved) expect(stats, l).not.toContain(`"${l}":`)
})
