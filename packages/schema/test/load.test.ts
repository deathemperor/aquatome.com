import { copyFile, cp, mkdtemp, readFile, writeFile } from 'node:fs/promises'
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
  // Two breeds on one address, too.
  await writeFile(join(dir, 'breeds/clash/vi.json'), JSON.stringify({ slug: 'ca-lai', name: 'Cá lai', altNames: [], sections: {}, quality: { score: 0.9, indexable: true } }))
  await cp(join(dir, 'breeds/clash'), join(dir, 'breeds/clash-2'), { recursive: true })
  await writeFile(join(dir, 'breeds/clash-2/entity.json'), JSON.stringify({ id: 'clash-2', kind: 'hybrid', parents: [], care: {}, photos: [], sources: [], updatedAt: '2026-10-30' }))
  await expect(loadAll({ root: dir, lang: 'vi', publicBuild: false })).rejects.toThrow(/already a breed page/)
})

test('Vietnamese photo captions are shown translated in another language, or left off until they are', async () => {
  const { cp, mkdir, readFile, writeFile } = await import('node:fs/promises')
  const dir = await mkdtemp(join(tmpdir(), 'aq-captions-'))
  await cp(root, dir, { recursive: true })
  await writeFile(join(dir, 'species/alpha/id.json'), await readFile(join(dir, 'species/alpha/vi.json'), 'utf8'))
  const photo = { url: 'https://x/1.jpg', width: 4, height: 3, licence: 'CC BY 4.0', author: 'A', sourceUrl: 'https://x/1' }
  await mkdir(join(dir, 'gallery'))
  await writeFile(join(dir, 'gallery/alpha.json'), JSON.stringify({ id: 'alpha', seen: 3, updatedAt: '2026-10-31', photos: [
    { ...photo, caption: 'Cá alpha đực trong bể thủy sinh' }, { ...photo, caption: 'Cá alpha cái' }, { ...photo, caption: 'Male, aquarium trade' },
  ] }))
  await mkdir(join(dir, 'captions'))
  await writeFile(join(dir, 'captions/id.json'), JSON.stringify({ 'Cá alpha đực trong bể thủy sinh': 'Ikan alpha jantan di akuarium' }))
  const id = await loadAll({ root: dir, lang: 'id', publicBuild: false })
  expect(id.galleries.alpha!.map(p => p.caption)).toEqual(['Ikan alpha jantan di akuarium', undefined, 'Male, aquarium trade'])
  const vi = await loadAll({ root: dir, lang: 'vi', publicBuild: false })
  expect(vi.galleries.alpha!.map(p => p.caption)).toEqual(['Cá alpha đực trong bể thủy sinh', 'Cá alpha cái', 'Male, aquarium trade'])
})

test('another language has only the equipment guides translated into it', async () => {
  const { cp, mkdir, writeFile } = await import('node:fs/promises')
  const dir = await mkdtemp(join(tmpdir(), 'aq-equip-'))
  await cp(root, dir, { recursive: true })
  const photo = { url: 'https://x/1.jpg', width: 4, height: 3, licence: 'CC BY 4.0', author: 'A', sourceUrl: 'https://x/1' }
  const guide = (category: string, name: string) => ({ category, name, lead: '', intro: '', hero: photo, types: [], choose: [], mistakes: [], faq: [] })
  await mkdir(join(dir, 'equipment/id'), { recursive: true })
  await writeFile(join(dir, 'equipment/loc.json'), JSON.stringify(guide('loc', 'Lọc')))
  await writeFile(join(dir, 'equipment/den.json'), JSON.stringify(guide('den', 'Đèn')))
  await writeFile(join(dir, 'equipment/id/loc.json'), JSON.stringify({ ...guide('loc', 'Filter'), quality: { score: 0.9, indexable: true } }))
  expect((await loadAll({ root: dir, lang: 'vi', publicBuild: false })).equipment.map(e => e.name)).toEqual(['Đèn', 'Lọc'])
  expect((await loadAll({ root: dir, lang: 'id', publicBuild: false })).equipment.map(e => e.name)).toEqual(['Filter'])
  expect((await loadAll({ root: dir, lang: 'th', publicBuild: false })).equipment).toEqual([])
})

test('another language has only the places one of its fish comes from; Vietnamese has every place', async () => {
  const { cp, mkdir, readFile, writeFile } = await import('node:fs/promises')
  const dir = await mkdtemp(join(tmpdir(), 'aq-places-'))
  await cp(root, dir, { recursive: true })
  const alpha = JSON.parse(await readFile(join(dir, 'species/alpha/entity.json'), 'utf8'))
  await writeFile(join(dir, 'species/alpha/entity.json'), JSON.stringify({ ...alpha, places: ['asia'] }))
  await writeFile(join(dir, 'species/alpha/id.json'), await readFile(join(dir, 'species/alpha/vi.json'), 'utf8'))
  for (const id of ['asia', 'europe']) {
    await mkdir(join(dir, 'places', id), { recursive: true })
    await writeFile(join(dir, 'places', id, 'entity.json'), JSON.stringify({ id, kind: 'continent' }))
    for (const l of ['vi', 'id']) await writeFile(join(dir, 'places', id, `${l}.json`), JSON.stringify({ slug: id, name: id, altNames: [], sections: {}, quality: { score: 0.9, indexable: true } }))
  }
  expect((await loadAll({ root: dir, lang: 'vi', publicBuild: false })).places.map(p => p.id).sort()).toEqual(['asia', 'europe'])
  expect((await loadAll({ root: dir, lang: 'id', publicBuild: false })).places.map(p => p.id)).toEqual(['asia'])
})

test('a translation whose entity was removed is no page, not a broken build', async () => {
  const { cp, mkdir, rm, writeFile } = await import('node:fs/promises')
  const dir = await mkdtemp(join(tmpdir(), 'aq-orphan-'))
  await cp(root, dir, { recursive: true })
  await mkdir(join(dir, 'places/gone'), { recursive: true })
  await writeFile(join(dir, 'places/gone/vi.json'), JSON.stringify({ slug: 'gone', name: 'Gone', altNames: [], sections: {}, quality: { score: 0.9, indexable: true } }))
  await rm(join(dir, 'species/beta/entity.json'))
  const c = await loadAll({ root: dir, lang: 'vi', publicBuild: false })
  expect(c.places).toEqual([])
  expect(c.species.map(s => s.id)).toEqual(['alpha'])
})

test('a thin species page is out of search with its reason, at every build: an in-depth source brings it back', async () => {
  const { cp, readFile, writeFile } = await import('node:fs/promises')
  const dir = await mkdtemp(join(tmpdir(), 'aq-depth-'))
  await cp(root, dir, { recursive: true })
  // beta: one Glaser note, recorded indexable when it was made.
  const beta = (c: Awaited<ReturnType<typeof loadAll>>) => c.species.find(s => s.id === 'beta')!.t.quality
  expect(beta(await loadAll({ root: dir, lang: 'vi', publicBuild: false }))).toEqual({ score: 0.9, indexable: false, reason: 'thin' })
  // An engine run (or two jobs' work merged) adds a Seriously Fish section; the file still says thin.
  const file = join(dir, 'species/beta/entity.json')
  const e = JSON.parse(await readFile(file, 'utf8'))
  await writeFile(file, JSON.stringify({ ...e, sections: [...e.sections, { key: 'diet', source: 'seriouslyfish', sourceUrl: 'https://www.seriouslyfish.com/species/testus-beta', html: '<p>Omnivore.</p>' }] }))
  await writeFile(join(dir, 'species/beta/vi.json'), JSON.stringify({ slug: 'ca-beta', name: 'Cá beta', altNames: [], sections: {}, quality: { score: 0.9, indexable: false, reason: 'thin' } }))
  expect(beta(await loadAll({ root: dir, lang: 'vi', publicBuild: false }))).toEqual({ score: 0.9, indexable: true })
  // A low score still keeps it out, now for that reason.
  await writeFile(join(dir, 'species/beta/vi.json'), JSON.stringify({ slug: 'ca-beta', name: 'Cá beta', altNames: [], sections: {}, quality: { score: 0.6, indexable: false, reason: 'thin' } }))
  expect(beta(await loadAll({ root: dir, lang: 'vi', publicBuild: false }))).toEqual({ score: 0.6, indexable: false, reason: 'score' })
})

test('a tank length that is its source\'s tank volume is left off the card', async () => {
  const store = await mkdtemp(join(tmpdir(), 'store-'))
  await cp(root, store, { recursive: true })
  const file = join(store, 'species', 'alpha', 'entity.json')
  const e = JSON.parse(await readFile(file, 'utf8'))
  e.dataCard.tankCm = [{ source: 'seriouslyfish', value: 60 }, { source: 'glaser', value: 284 }]
  e.sections.push({ key: 'aquariumSize', source: 'glaser', sourceUrl: 'https://x', html: '<p>About 75 gallons (about 284 litres).</p>' },
    { key: 'aquariumSize', source: 'seriouslyfish', sourceUrl: 'https://y', html: '<p>A tank 60 cm long.</p>' })
  await writeFile(file, JSON.stringify(e))
  const alpha = (await loadAll({ root: store, lang: 'vi', publicBuild: false })).species.find(s => s.id === 'alpha')!
  expect(alpha.dataCard.tankCm).toEqual([{ source: 'seriouslyfish', value: 60 }])
})
