import { copyFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
test('NC-licensed photos are never loaded; source photos follow the source publish gate', async () => {
  const local = await loadAll({ root, lang: 'vi', publicBuild: false })
  expect(local.species.find(s => s.id === 'alpha')!.photos.map(p => p.source ?? p.licence)).toEqual(['CC BY-SA 4.0', 'seriouslyfish', 'glaser'])
  const pub = await loadAll({ root, lang: 'vi', publicBuild: true })
  expect(pub.species.find(s => s.id === 'alpha')!.photos.map(p => p.source ?? p.licence)).toEqual(['CC BY-SA 4.0', 'seriouslyfish'])
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
test('changelog is gated by source in public builds and defaults to []', async () => {
  expect((await loadAll({ root, lang: 'vi', publicBuild: false })).changelog.map(e => e.id)).toEqual(['alpha', 'beta'])
  expect((await loadAll({ root, lang: 'vi', publicBuild: true })).changelog.map(e => e.id)).toEqual(['alpha'])
  const empty = await mkdtemp(join(tmpdir(), 'store-'))
  await copyFile(join(root, 'sources.json'), join(empty, 'sources.json'))
  expect((await loadAll({ root: empty, lang: 'vi', publicBuild: false })).changelog).toEqual([])
})

test('indexability counts only sources the build may show', async () => {
  const local = await loadAll({ root, lang: 'vi', publicBuild: false })
  expect(local.species.find(s => s.id === 'alpha')!.t.quality).toMatchObject({ score: 0.5, indexable: false })
  const pub = await loadAll({ root, lang: 'vi', publicBuild: true })
  expect(pub.species.find(s => s.id === 'alpha')!.t.quality).toMatchObject({ score: 0.9, indexable: true })
})

test('a breed whose address is already a species page stops the build', async () => {
  const { cp, mkdir, readFile, writeFile } = await import('node:fs/promises')
  const dir = await mkdtemp(join(tmpdir(), 'aq-breed-'))
  await cp(root, dir, { recursive: true })
  const slug = JSON.parse(await readFile(join(dir, 'species/alpha/vi.json'), 'utf8')).slug
  await mkdir(join(dir, 'breeds/clash'), { recursive: true })
  await writeFile(join(dir, 'breeds/clash/entity.json'), JSON.stringify({ id: 'clash', kind: 'hybrid', parents: [], care: {}, photos: [], sources: [], updatedAt: '2026-10-30' }))
  await writeFile(join(dir, 'breeds/clash/vi.json'), JSON.stringify({ slug, name: 'Cá lai', altNames: [], sections: {}, quality: { score: 0.9, indexable: true } }))
  await expect(loadAll({ root: dir, lang: 'vi', publicBuild: false })).rejects.toThrow(/already a species page/)
})
