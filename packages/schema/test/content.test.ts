import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { isAllowedLicence, loadAll, resolveDataCard, slugify } from '../src/index'

const root = fileURLToPath(new URL('../../../apps/site/test/fixture-content', import.meta.url))
const load = () => loadAll({ root, lang: 'vi', publicBuild: false })

test('sample store loads with minimum counts', async () => {
  const c = await load()
  expect(c.species.length).toBeGreaterThanOrEqual(8)
  expect(c.plants.length).toBeGreaterThanOrEqual(3)
  expect(c.guides.length).toBeGreaterThanOrEqual(2)
  expect(c.glossary.length).toBeGreaterThanOrEqual(4)
})
test('every photo has an allowed licence and an author', async () => {
  const c = await load()
  for (const e of [...c.species, ...c.plants, ...c.guides]) for (const p of e.photos) {
    expect(isAllowedLicence(p.licence), p.url).toBe(true)
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
