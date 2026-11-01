import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { imperialLeft, isAllowedLicence, loadAll, resolveDataCard, slugify } from '../src/index'

const root = fileURLToPath(new URL('../../../apps/site/test/fixture-content', import.meta.url))
const load = () => loadAll({ root, lang: 'vi', publicBuild: false })

test('sample store loads with minimum counts', async () => {
  const c = await load()
  expect(c.species.length).toBeGreaterThanOrEqual(8)
  expect(c.plants.length).toBeGreaterThanOrEqual(3)
  expect(c.guides.length).toBeGreaterThanOrEqual(2)
  expect(c.glossary.length).toBeGreaterThanOrEqual(4)
})
test('every photo has an allowed licence, or is from a listed source (its publish gate decides), and an author', async () => {
  const c = await load()
  for (const e of [...c.species, ...c.plants, ...c.guides]) for (const p of e.photos) {
    expect(p.source ? c.sources[p.source] !== undefined : isAllowedLicence(p.licence), p.url).toBe(true)
    expect(p.author.length, p.url).toBeGreaterThan(0)
  }
})
test('slugs derive from names and are unique per kind', async () => {
  const c = await load()
  for (const list of [c.species, c.plants, c.guides, c.glossary]) {
    for (const e of list) expect(e.t.slug).toBe(slugify(e.t.name))
    expect(new Set(list.map(e => e.t.slug)).size).toBe(list.length)
  }
})
test('fixtures cover the review-focus edge cases', async () => {
  const c = await load()
  expect(c.species.some(s => !s.dataCard.gh && !s.sections.some(x => x.key === 'dimorphism'))).toBe(true)
  expect(c.species.some(s => resolveDataCard(s.dataCard.tempC ?? [])?.conflict)).toBe(true)
  expect(c.species.some(s => !s.t.quality.indexable)).toBe(true)
})
test('every species place id exists', async () => {
  const c = await load()
  const ids = new Set(c.places.map(p => p.id))
  for (const s of c.species) for (const p of s.places) expect(ids.has(p), `${s.id}→${p}`).toBe(true)
})

// The real content/, not the test store: readers in Vietnam, Indonesia and Thailand use °C, cm and litres. The engine
// writes fish, plant and breed pages in metric (`pnpm engine metric` runs before each engine build); a figure in °F,
// inches, feet or gallons here is one a writer left. Reference lists and quoted labels ("elevation 650 feet'") stay as
// published. 263 pages had them on 2026-11-01 ("20–30°C (68–86°F)", "bể 10 gallon").
test('fish, plant and breed pages give figures in metric only', async () => {
  const content = fileURLToPath(new URL('../../../content', import.meta.url))
  const left: string[] = []
  for (const kind of ['species', 'plants', 'breeds']) for (const id of await readdir(join(content, kind))) for (const lang of ['vi', 'id', 'th']) {
    const page = await readFile(join(content, kind, id, `${lang}.json`), 'utf8').then(s => JSON.parse(s), () => null) as
      { sections?: Record<string, string>; body?: string; summary?: string[]; faq?: { q: string; a: string }[] } | null
    if (!page) continue
    const texts = [...Object.entries(page.sections ?? {}).filter(([k]) => !k.startsWith('references:')).map(([, v]) => v),
      page.body ?? '', ...(page.summary ?? []), ...(page.faq ?? []).flatMap(f => [f.q, f.a])]
    for (const t of texts) for (const x of imperialLeft(t)) left.push(`${kind}/${id}/${lang}: ${x}`)
  }
  expect(left, 'run pnpm engine metric').toEqual([])
}, 60_000) // every page of the real content
