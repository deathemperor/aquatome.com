import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { loadAll } from '../src/index'

const root = fileURLToPath(new URL('./fixtures/store', import.meta.url))
const bad = fileURLToPath(new URL('./fixtures/bad', import.meta.url))

test('local load returns every translated species', async () => {
  const c = await loadAll({ root, lang: 'vi', publicBuild: false })
  expect(c.species.map(s => s.id).sort()).toEqual(['alpha', 'beta'])
  expect(c.species.find(s => s.id === 'alpha')?.sections).toHaveLength(2)
  expect(c.sources.glaser?.publish).toBe(false)
})
test('public build strips un-cleared sources and drops empty species', async () => {
  const c = await loadAll({ root, lang: 'vi', publicBuild: true })
  expect(c.species.map(s => s.id)).toEqual(['alpha'])
  expect(c.species[0]!.sections.map(s => s.source)).toEqual(['seriouslyfish'])
})
test('NC-licensed photos are never loaded', async () => {
  const c = await loadAll({ root, lang: 'vi', publicBuild: false })
  expect(c.species.find(s => s.id === 'alpha')!.photos.map(p => p.licence)).toEqual(['CC BY-SA 4.0'])
})
test('species without a translation is skipped', async () => {
  const c = await loadAll({ root, lang: 'vi', publicBuild: false })
  expect(c.species.some(s => s.id === 'gamma')).toBe(false)
})
test('localized entity carries its translation', async () => {
  const c = await loadAll({ root, lang: 'vi', publicBuild: false })
  expect(c.species.find(s => s.id === 'alpha')!.t.slug).toBe('ca-alpha')
})
test('malformed entity.json rejects with its path', async () => {
  await expect(loadAll({ root: bad, lang: 'vi', publicBuild: false })).rejects.toThrow(/broken[\\/]entity\.json/)
})
test('public build strips data-card values from un-cleared sources', async () => {
  const c = await loadAll({ root, lang: 'vi', publicBuild: true })
  const alpha = c.species[0]!
  expect(alpha.dataCard.tempC?.map(v => v.source)).toEqual(['seriouslyfish'])
  expect(alpha.dataCard.gh).toBeUndefined()
})
