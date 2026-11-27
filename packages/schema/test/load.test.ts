import { copyFile, cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, vi } from 'vitest'
import { cardShownIn, GUIDE_UNJUDGED_LIMIT, loadAll, UNJUDGED_DEAD_LIMIT, UNREAD_FACES_LIMIT, type Section, type Translation } from '../src/index'
import { oneVoice, withLocalNote } from '../src/load'

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

test('a breed\'s care figure the engine hid is left off its page', async () => {
  const { cp, mkdir, writeFile } = await import('node:fs/promises')
  const dir = await mkdtemp(join(tmpdir(), 'aq-care-'))
  await cp(root, dir, { recursive: true })
  await mkdir(join(dir, 'breeds/huyet-long'), { recursive: true })
  await writeFile(join(dir, 'breeds/huyet-long/entity.json'), JSON.stringify({ id: 'huyet-long', kind: 'variety', parents: [], care: { sizeCm: [{ source: 0, value: 90 }], tankCm: [{ source: 0, value: 150, hidden: 'shorter than twice the fish (90 cm)' }] }, photos: [], sources: [], updatedAt: '2026-10-30' }))
  await writeFile(join(dir, 'breeds/huyet-long/vi.json'), JSON.stringify({ slug: 'huyet-long', name: 'Huyết Long', altNames: [], sections: {}, quality: { score: 0.9, indexable: true } }))
  const b = (await loadAll({ root: dir, lang: 'vi', publicBuild: true })).breeds.find(x => x.id === 'huyet-long')!
  expect(b.care).toEqual({ sizeCm: [{ source: 0, value: 90 }] })
})

test('a gallery photo the photo check has not judged yet is on no page, and counts towards no album', async () => {
  const { cp, mkdir, writeFile } = await import('node:fs/promises')
  const dir = await mkdtemp(join(tmpdir(), 'aq-unchecked-'))
  await cp(root, dir, { recursive: true })
  const photo = (n: number) => ({ url: `https://x/${n}.jpg`, width: 4, height: 3, licence: 'CC BY 4.0', author: 'A', sourceUrl: `https://x/${n}` })
  await mkdir(join(dir, 'gallery'))
  await writeFile(join(dir, 'gallery/alpha.json'), JSON.stringify({ id: 'alpha', seen: 3, updatedAt: '2026-11-11', photos: [photo(1), { ...photo(2), unchecked: true }, { ...photo(3), best: true, kind: 'male' }] }))
  // A gallery whose every photo waits is no gallery yet.
  await writeFile(join(dir, 'gallery/beta.json'), JSON.stringify({ id: 'beta', seen: 1, updatedAt: '2026-11-11', photos: [{ ...photo(4), unchecked: true }] }))
  for (const publicBuild of [true, false]) {
    const c = await loadAll({ root: dir, lang: 'vi', publicBuild })
    expect(c.galleries.alpha!.map(p => p.url)).toEqual(['https://x/1.jpg', 'https://x/3.jpg'])
    expect(c.galleries.beta).toBeUndefined()
  }
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
  const id = await loadAll({ root: dir, lang: 'id', publicBuild: false })
  expect(id.places.map(p => p.id)).toEqual(['asia'])
  // A place with no page in a language still has its name there: a fish's range names rivers no fish lists (a Thai
  // page named four Vietnamese rivers in Vietnamese while their Thai names went unread, 2026-11-08).
  expect(id.placeNames).toEqual({ asia: 'asia', europe: 'europe' })
})

// The chief of staff, 14 Nov 2026: a place's name that fails when judged alone shows the source's name until it passes;
// one a batch scored low but no one judged alone shows as it is (no blanket step back: most of them are right). "Hue"
// for the Hue River on an Indonesian fish page is the case.
test("a place name judged alone and failed is no name in that language; one a batch scored low and no one judged alone stays", async () => {
  const { cp, mkdir, readFile, writeFile } = await import('node:fs/promises')
  const dir = await mkdtemp(join(tmpdir(), 'aq-place-judged-'))
  await cp(root, dir, { recursive: true })
  const alpha = JSON.parse(await readFile(join(dir, 'species/alpha/entity.json'), 'utf8'))
  await writeFile(join(dir, 'species/alpha/entity.json'), JSON.stringify({ ...alpha, places: ['hue-river', 'kayan-river', 'borneo'] }))
  await writeFile(join(dir, 'species/alpha/id.json'), await readFile(join(dir, 'species/alpha/vi.json'), 'utf8'))
  const names: Record<string, [string, object]> = {
    'hue-river': ['Hue', { nameCheck: { ok: false, score: 0.1, at: '2026-11-16T05:00:00Z', why: 'a river cut to its city' } }],
    'kayan-river': ['Kayan', {}],
    borneo: ['Kalimantan', { nameCheck: { ok: true, score: 0.95, at: '2026-11-16T05:00:00Z' } }],
  }
  for (const [id, [name, more]] of Object.entries(names)) {
    await mkdir(join(dir, 'places', id), { recursive: true })
    await writeFile(join(dir, 'places', id, 'entity.json'), JSON.stringify({ id, kind: id === 'borneo' ? 'region' : 'river' }))
    await writeFile(join(dir, 'places', id, 'vi.json'), JSON.stringify({ slug: id, name: id, altNames: [], sections: {}, quality: { score: 1, indexable: true } }))
    await writeFile(join(dir, 'places', id, 'id.json'), JSON.stringify({ slug: id, name, altNames: [], sections: {}, quality: { score: 0.05, indexable: false }, ...more }))
  }
  const id = await loadAll({ root: dir, lang: 'id', publicBuild: false })
  expect(id.placeNames).toEqual({ 'kayan-river': 'Kayan', borneo: 'Kalimantan' })
  expect(id.places.map(p => p.id).sort()).toEqual(['borneo', 'kayan-river'])
})

test('a page the reader-fit gate holds back in a language is no page there where the site asks, and the engine still reads it', async () => {
  const { cp, mkdir, readFile, writeFile } = await import('node:fs/promises')
  const dir = await mkdtemp(join(tmpdir(), 'aq-held-'))
  await cp(root, dir, { recursive: true })
  const held = { checks: ['kit'], at: '2026-11-08' }
  const hold = async (file: string, from = file) => writeFile(join(dir, file), JSON.stringify({ ...JSON.parse(await readFile(join(dir, from), 'utf8')), held }))
  await hold('species/beta/vi.json')
  // alpha's Indonesian page is held, and asia is the only place it comes from.
  const alpha = JSON.parse(await readFile(join(dir, 'species/alpha/entity.json'), 'utf8'))
  await writeFile(join(dir, 'species/alpha/entity.json'), JSON.stringify({ ...alpha, places: ['asia'] }))
  await hold('species/alpha/id.json', 'species/alpha/vi.json')
  await mkdir(join(dir, 'places/asia'), { recursive: true })
  await writeFile(join(dir, 'places/asia/entity.json'), JSON.stringify({ id: 'asia', kind: 'continent' }))
  for (const l of ['vi', 'id']) await writeFile(join(dir, 'places/asia', `${l}.json`), JSON.stringify({ slug: 'asia', name: 'asia', altNames: [], sections: {}, quality: { score: 0.9, indexable: true } }))

  const site = (lang: 'vi' | 'id') => loadAll({ root: dir, lang, publicBuild: false, leaveOutHeld: true })
  expect((await site('vi')).species.map(s => s.id)).toEqual(['alpha'])
  const id = await site('id')
  expect(id.species).toEqual([])
  expect(id.places).toEqual([])
  // The engine reads every page, the held ones too, to read them again and let them out.
  const engine = await loadAll({ root: dir, lang: 'vi', publicBuild: false })
  expect(engine.species.map(s => [s.id, s.t.held])).toEqual([['alpha', undefined], ['beta', held]])
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

test('a public build shows no photo from a host that sets third-party cookies; a local one does', async () => {
  const store = await mkdtemp(join(tmpdir(), 'store-'))
  await cp(root, store, { recursive: true })
  const file = join(store, 'species', 'alpha', 'entity.json')
  const e = JSON.parse(await readFile(file, 'utf8'))
  e.photos.push({ url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/2/29/A.jpg/960px-A.jpg', width: 960, height: 640, licence: 'CC BY 4.0', author: 'A', sourceUrl: 'https://commons.wikimedia.org/wiki/File:A.jpg' })
  await writeFile(file, JSON.stringify(e))
  const urls = async (publicBuild: boolean) => (await loadAll({ root: store, lang: 'vi', publicBuild })).species.find(s => s.id === 'alpha')!.photos.map(p => p.url)
  expect(await urls(true)).not.toContain('https://thumb.wikimedia.org/wikipedia/commons/thumb/2/29/A.jpg/960px-A.jpg')
  expect(await urls(false)).toContain('https://thumb.wikimedia.org/wikipedia/commons/thumb/2/29/A.jpg/960px-A.jpg')
})

test("a public build shows no new photo the dead-fish screen still owes a look: it waits on a page, in an album and by address, and shows by itself once off the list", async () => {
  const { mkdir } = await import('node:fs/promises')
  const site = await mkdtemp(join(tmpdir(), 'aq-dead-owed-'))
  const store = join(site, 'content')
  await cp(root, store, { recursive: true })
  const photo = (name: string) => ({ url: `https://media.test/${name}.webp`, width: 960, height: 640, licence: 'CC BY 4.0', author: 'A', sourceUrl: `https://x/${name}` })
  const file = join(store, 'species', 'alpha', 'entity.json')
  const e = JSON.parse(await readFile(file, 'utf8'))
  e.photos = [photo('commons/judged'), photo('commons/owed')]
  await writeFile(file, JSON.stringify(e))
  await mkdir(join(store, 'gallery'))
  await writeFile(join(store, 'gallery/alpha.json'), JSON.stringify({ id: 'alpha', seen: 2, updatedAt: '2026-11-21', photos: [photo('commons/album-owed'), photo('commons/album')] }))
  // The watermark screen has read every one, with no text on any: only the dead-fish screen's list holds them.
  await mkdir(join(site, 'engine-state'))
  const all = ['commons/judged', 'commons/owed', 'commons/album-owed', 'commons/album']
  await writeFile(join(site, 'engine-state', '_photo-watermarks.json'), JSON.stringify(Object.fromEntries(all.map(n => [`https://media.test/${n}.webp`, { ocr: [] }]))))
  const owedFile = join(site, 'engine-state', '_photo-dead-owed.json')
  await writeFile(owedFile, JSON.stringify({ 'https://media.test/commons/owed.webp': '2026-11-21', 'https://media.test/commons/album-owed.webp': '2026-11-21' }))
  const shown = async (publicBuild: boolean) => {
    const c = await loadAll({ root: store, lang: 'vi', publicBuild })
    const short = (u: string) => u.replace('https://media.test/', '').replace('.webp', '')
    return { own: c.species.find(s => s.id === 'alpha')!.photos.map(p => short(p.url)), album: (c.galleries.alpha ?? []).map(p => short(p.url)) }
  }
  expect(await shown(true)).toEqual({ own: ['commons/judged'], album: ['commons/album'] })
  // The engine's own reads see every photo: it is in content, waiting, not refused.
  expect(await shown(false)).toEqual({ own: ['commons/judged', 'commons/owed'], album: ['commons/album-owed', 'commons/album'] })
  // By address too (the calendar), a thumb's and a larger copy's.
  const c = await loadAll({ root: store, lang: 'vi', publicBuild: true })
  expect(['commons/owed', 'commons/owed-480', 'commons/owed-large', 'commons/judged'].filter(n => c.photoWaits!(`https://media.test/${n}.webp`)))
    .toEqual(['commons/owed', 'commons/owed-480', 'commons/owed-large'])
  // Off the list (a faces step found it judged by the screen or the check): each shows by itself in the next build.
  await writeFile(owedFile, '{}')
  expect(await shown(true)).toEqual({ own: ['commons/judged', 'commons/owed'], album: ['commons/album-owed', 'commons/album'] })
})

test("a public build shows no own photo of a species or plant page that no look has judged for a dead fish, owed or not: it waits there, in an album and by address; the site's build counts them, fails past the limit and without the screen's record", async () => {
  // The chief of staff, 22 Nov 2026: 111 photos from a run begun before the screen reached the face finder's record
  // unowed, and only a list put them right. The build holds the line by the looks themselves.
  const { mkdir, rm } = await import('node:fs/promises')
  const site = await mkdtemp(join(tmpdir(), 'aq-dead-look-'))
  const store = join(site, 'content')
  await cp(root, store, { recursive: true })
  const photo = (name: string) => ({ url: `https://media.test/${name}.webp`, width: 960, height: 640, licence: 'CC BY 4.0', author: 'A', sourceUrl: `https://x/${name}` })
  const write = (file: string, x: unknown) => writeFile(join(store, file), JSON.stringify(x))
  const alpha = JSON.parse(await readFile(join(store, 'species', 'alpha', 'entity.json'), 'utf8'))
  const alphaVi = JSON.parse(await readFile(join(store, 'species', 'alpha', 'vi.json'), 'utf8'))
  await write('species/alpha/entity.json', { ...alpha, photos: [photo('by-screen'), photo('by-check'), photo('by-person'), photo('by-none')] })
  await mkdir(join(store, 'plants', 'moss'), { recursive: true })
  await write('plants/moss/entity.json', { id: 'moss', scientificName: 'Mossus testus', difficulty: 1, light: 'low', co2: 'none', growth: 'slow', placement: ['foreground'], sections: alpha.sections, photos: [photo('plant-none')], productSlots: [], updatedAt: '2026-11-21' })
  await write('plants/moss/vi.json', { ...alphaVi, slug: 'trang-moss' })
  await mkdir(join(store, 'gallery'))
  // An album's own photos aren't this rule's yet: only a page's own copy makes one wait.
  await write('gallery/alpha.json', { id: 'alpha', seen: 2, updatedAt: '2026-11-21', photos: [photo('by-none'), photo('album')] })
  const all = ['by-screen', 'by-check', 'by-person', 'by-none', 'plant-none', 'album']
  const state = (f: string, x: unknown) => writeFile(join(site, 'engine-state', f), JSON.stringify(x))
  await mkdir(join(site, 'engine-state'))
  // The watermark screen and the face finder have read every one; nothing is on the owed list.
  await state('_photo-watermarks.json', Object.fromEntries(all.map(n => [`https://media.test/${n}.webp`, { ocr: [] }])))
  await state('_photo-faces.json', Object.fromEntries(all.map(n => [`https://media.test/${n}.webp`, 0])))
  await state('_photo-dead-owed.json', {})
  await state('_photo-guides.json', {})
  // Judged: by the screen, by the photo check (a verdict that asked about dead fish has `logo`), by a person's clear.
  await state('_dead-screen.json', { 'https://media.test/by-screen.webp': { dead: false } })
  await state('_photo-subjects.json', { 'https://media.test/by-check.webp': { alpha: { ok: 'yes', logo: false } }, 'https://media.test/by-none.webp': { alpha: { logo: false } } })
  await state('_photo-second-look.json', { 'https://media.test/by-person.webp': { why: 'x', step: 'the watermark screen', pages: ['species/alpha'], at: '2026-11-20', look: { said: 'clear', by: 'the chief of staff', on: '2026-11-21' } } })
  const short = (u: string) => u.replace('https://media.test/', '').replace('.webp', '')
  const shown = async (publicBuild: boolean) => {
    const c = await loadAll({ root: store, lang: 'vi', publicBuild })
    return { fish: c.species.find(x => x.id === 'alpha')!.photos.map(p => short(p.url)), plant: c.plants.find(x => x.id === 'moss')!.photos.map(p => short(p.url)), album: (c.galleries.alpha ?? []).map(p => short(p.url)) }
  }
  expect(await shown(true)).toEqual({ fish: ['by-screen', 'by-check', 'by-person'], plant: [], album: ['album'] })
  // The engine's own reads see every photo.
  expect(await shown(false)).toEqual({ fish: ['by-screen', 'by-check', 'by-person', 'by-none'], plant: ['plant-none'], album: ['by-none', 'album'] })
  // By address too, a thumb's and a larger copy's.
  const c = await loadAll({ root: store, lang: 'vi', publicBuild: true })
  expect(['by-none', 'by-none-480', 'by-none-large', 'by-screen'].filter(n => c.photoWaits!(`https://media.test/${n}.webp`))).toEqual(['by-none', 'by-none-480', 'by-none-large'])
  // The site's build says how many wait, and fails past the limit.
  const said = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await loadAll({ root: store, lang: 'vi', publicBuild: true, photoScreen: 'required' })
    expect(said.mock.calls.map(a => String(a[0])).filter(l => l.includes('dead fish'))).toEqual(['vi: 2 own photos of species and plant pages wait, no look has judged them for a dead fish'])
    const many = Array.from({ length: UNJUDGED_DEAD_LIMIT - 1 }, (_, i) => photo(`many-${i}`))
    const named = [...all, ...many.map(p => short(p.url))]
    await state('_photo-watermarks.json', Object.fromEntries(named.map(n => [`https://media.test/${n}.webp`, { ocr: [] }])))
    await state('_photo-faces.json', Object.fromEntries(named.map(n => [`https://media.test/${n}.webp`, 0])))
    await write('species/alpha/entity.json', { ...alpha, photos: [photo('by-screen'), photo('by-check'), photo('by-person'), photo('by-none'), ...many] })
    await expect(loadAll({ root: store, lang: 'vi', publicBuild: true, photoScreen: 'required' })).rejects.toThrow(`vi: ${UNJUDGED_DEAD_LIMIT + 1} own photos of species and plant pages that no look has judged for a dead fish`)
    // A rejection already recorded across the queue keeps the entry off without adding to the build limit.
    await state('_photo-rejected.json', Object.fromEntries(many.map(p => [p.url, 'people: rejected'])))
    const allowed = await loadAll({ root: store, lang: 'vi', publicBuild: true, photoScreen: 'required' })
    expect(allowed.species.find(p => p.id === 'alpha')!.photos.map(p => short(p.url))).toEqual(['by-screen', 'by-check', 'by-person'])
    await state('_photo-rejected.json', {})
    // At the limit it builds.
    await write('species/alpha/entity.json', { ...alpha, photos: [photo('by-screen'), photo('by-check'), photo('by-person'), photo('by-none'), ...many.slice(1)] })
    await loadAll({ root: store, lang: 'vi', publicBuild: true, photoScreen: 'required' })
  } finally {
    said.mockRestore()
  }
  // Judged (a faces step has run): each shows by itself in the next build.
  await write('species/alpha/entity.json', { ...alpha, photos: [photo('by-screen'), photo('by-check'), photo('by-person'), photo('by-none')] })
  await state('_dead-screen.json', { 'https://media.test/by-screen.webp': { dead: false }, 'https://media.test/by-none.webp': { dead: false }, 'https://media.test/plant-none.webp': { dead: false } })
  expect(await shown(true)).toEqual({ fish: ['by-screen', 'by-check', 'by-person', 'by-none'], plant: ['plant-none'], album: ['by-none', 'album'] })
  // With no screen record beside the real content the site's build fails; a root with none (the fixture build) has no rule.
  await rm(join(site, 'engine-state', '_dead-screen.json'))
  await expect(loadAll({ root: store, lang: 'vi', publicBuild: true, photoScreen: 'required' })).rejects.toThrow("the dead-fish screen's record is missing")
  expect((await shown(true)).fish).toEqual(['by-screen', 'by-check', 'by-person', 'by-none'])
})

test("a public build shows no guide photo or stock photo the guides' own look hasn't judged: it waits there and by address, shows once judged, and the site's build counts them, fails past the limit and without the record", async () => {
  // The chief of staff, 22 Nov 2026: a new guide photo or stock photo showed for hours before its look. The look first,
  // as a video guide's stills already wait for theirs.
  const { mkdir, rm } = await import('node:fs/promises')
  const site = await mkdtemp(join(tmpdir(), 'aq-guide-look-'))
  const store = join(site, 'content')
  await cp(root, store, { recursive: true })
  const photo = (name: string) => ({ url: `https://media.test/${name}.webp`, width: 960, height: 640, licence: 'CC BY 4.0', author: 'A', sourceUrl: `https://x/${name}` })
  const alpha = JSON.parse(await readFile(join(store, 'species', 'alpha', 'entity.json'), 'utf8'))
  const alphaVi = JSON.parse(await readFile(join(store, 'species', 'alpha', 'vi.json'), 'utf8'))
  const guide = (photos: object[]) => ({ id: 'g', kind: 'care', source: alpha.sections[0].source, sourceUrl: 'https://x/g', html: '<p>x</p>', photos, mentions: [], updatedAt: '2026-11-21', video: { youtubeId: 'abcdefghijk', title: 't', channel: 'Sample channel', channelUrl: 'https://example.org/c', durationSec: 300, publishedAt: '2026-11-01', chapters: [], thumb: { url: 'https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg', width: 1280, height: 720 }, figures: [{ heading: 'One', photo: photo('stock-looked'), moments: [] }, { heading: 'Two', photo: photo('stock-new'), moments: [] }] } })
  await mkdir(join(store, 'guides', 'g'), { recursive: true })
  const write = (file: string, x: unknown) => writeFile(join(store, file), JSON.stringify(x))
  await write('guides/g/entity.json', guide([photo('guide-looked'), photo('guide-new')]))
  await write('guides/g/vi.json', { ...alphaVi, slug: 'trang-g' })
  const all = ['guide-looked', 'guide-new', 'stock-looked', 'stock-new']
  const state = (f: string, x: unknown) => writeFile(join(site, 'engine-state', f), JSON.stringify(x))
  await mkdir(join(site, 'engine-state'))
  await state('_photo-watermarks.json', Object.fromEntries(all.map(n => [`https://media.test/${n}.webp`, { ocr: [] }])))
  await state('_photo-faces.json', Object.fromEntries(all.map(n => [`https://media.test/${n}.webp`, 0])))
  await state('_dead-screen.json', {})
  const looked = (names: string[]) => state('_photo-guides.json', Object.fromEntries(names.map(n => [`https://media.test/${n}.webp`, { person: false, mark: false, brand: false, note: '' }])))
  await state('_photo-guides.json', {
    'https://media.test/guide-looked.webp': { person: false, mark: false, brand: false },
    'https://media.test/stock-looked.webp': { person: false, mark: false, brand: false },
    'https://media.test/stock-new.webp': { person: false },
  })
  const short = (u: string) => u.replace('https://media.test/', '').replace('.webp', '')
  const shown = async (publicBuild: boolean) => {
    const g = (await loadAll({ root: store, lang: 'vi', publicBuild })).guides.find(x => x.id === 'g')!
    return { own: g.photos.map(p => short(p.url)), stock: (g.video?.figures ?? []).flatMap(f => (f.photo ? [short(f.photo.url)] : [])) }
  }
  expect(await shown(true)).toEqual({ own: ['guide-looked'], stock: ['stock-looked'] })
  // The engine's own reads see every photo.
  expect(await shown(false)).toEqual({ own: ['guide-looked', 'guide-new'], stock: ['stock-looked', 'stock-new'] })
  const originalGuide = guide([photo('guide-looked'), photo('guide-new')])
  const shop = { ...photo('shop'), url: 'https://media.aquatome.com/glaser/kept.webp',
    sourceUrl: 'https://www.aquariumglaser.de/example/' }
  const readState = async (name: string) => JSON.parse(await readFile(join(site, 'engine-state', name), 'utf8'))
  const priorMarks = await readState('_photo-watermarks.json')
  const priorFaces = await readState('_photo-faces.json')
  const priorLooks = await readState('_photo-guides.json')
  await write('guides/g/entity.json', guide([shop]))
  await state('_photo-watermarks.json', { ...priorMarks,
    [shop.url]: { ocr: [], watermark: true, retainedOwnMark: { source: 'glaser', sourceUrl: shop.sourceUrl, owner: 'source' } },
  })
  await state('_photo-faces.json', { ...priorFaces, [shop.url]: 0 })
  await state('_photo-guides.json', { ...priorLooks, [shop.url]: { person: false, mark: true, brand: false } })
  await state('_photo-rejected.json', { [shop.url]: 'watermark: retained mark' })
  expect((await loadAll({ root: store, lang: 'vi', publicBuild: true })).guides.find(g => g.id === 'g')?.photos.map(p => p.url))
    .toEqual([shop.url])
  await write('guides/g/entity.json', originalGuide)
  await state('_photo-watermarks.json', priorMarks)
  await state('_photo-faces.json', priorFaces)
  await state('_photo-guides.json', priorLooks)
  await rm(join(site, 'engine-state', '_photo-rejected.json'))
  const c = await loadAll({ root: store, lang: 'vi', publicBuild: true })
  expect(['guide-new', 'guide-new-480', 'stock-new-large', 'guide-looked'].filter(n => c.photoWaits!(`https://media.test/${n}.webp`))).toEqual(['guide-new', 'guide-new-480', 'stock-new-large'])
  const said = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await loadAll({ root: store, lang: 'vi', publicBuild: true, photoScreen: 'required' })
    expect(said.mock.calls.map(a => String(a[0])).filter(l => l.includes("guides' own look"))).toEqual(["vi: 2 guide photos and stock photos wait, the guides' own look hasn't judged them"])
    // Past the limit the site's build fails; at it, it builds.
    const many = Array.from({ length: GUIDE_UNJUDGED_LIMIT - 1 }, (_, i) => photo(`many-${i}`))
    const named = [...all, ...many.map(p => short(p.url))]
    await state('_photo-watermarks.json', Object.fromEntries(named.map(n => [`https://media.test/${n}.webp`, { ocr: [] }])))
    await state('_photo-faces.json', Object.fromEntries(named.map(n => [`https://media.test/${n}.webp`, 0])))
    await write('guides/g/entity.json', guide([photo('guide-looked'), photo('guide-new'), ...many]))
    await expect(loadAll({ root: store, lang: 'vi', publicBuild: true, photoScreen: 'required' })).rejects.toThrow(`vi: ${GUIDE_UNJUDGED_LIMIT + 1} guide photos and stock photos the guides' own look hasn't judged`)
    await state('_photo-rejected.json', { [many[0]!.url]: 'dead: withheld' })
    const retryable = await loadAll({ root: store, lang: 'vi', publicBuild: true, photoScreen: 'required' })
    expect(retryable.photoWaits!(many[0]!.url)).toBe(true)
    await rm(join(site, 'engine-state', '_photo-rejected.json'))
    await write('guides/g/entity.json', guide([photo('guide-looked'), photo('guide-new'), ...many.slice(1)]))
    await loadAll({ root: store, lang: 'vi', publicBuild: true, photoScreen: 'required' })
    await write('guides/g/entity.json', guide([photo('guide-looked'), photo('guide-new'), ...many]))
    await write('guides/g/vi.json', { ...alphaVi, slug: 'trang-g', name: 'Hướng dẫn nuôi cá platy' })
    await state('_photo-guides.json', Object.fromEntries(named.map(n => [
      photo(n).url, { person: false, mark: false, brand: false, ...(n.startsWith('stock-') ? { other: { platy: false }, answeredSubjects: ['platy'] } : {}) },
    ])))
    await expect(loadAll({ root: store, lang: 'vi', publicBuild: true, photoScreen: 'required' }))
      .rejects.toThrow(`vi: ${GUIDE_UNJUDGED_LIMIT + 1} guide photos and stock photos the guides' own look hasn't judged`)
    await write('guide-legacy-photo-uses.json', [['g', 'platy', photo('guide-looked').url]])
    const legacy = await loadAll({ root: store, lang: 'vi', publicBuild: true })
    expect(legacy.guides.find(x => x.id === 'g')?.photos).toEqual([])
    await state('_photo-guides.json', {
      [photo('guide-looked').url]: { person: false, mark: false, brand: false, other: { platy: false } },
      [photo('guide-new').url]: { person: false, mark: false, brand: false, other: { platy: false } },
    })
    expect((await shown(true)).own).toEqual(['guide-looked'])
    await write('guide-legacy-photo-uses.json', [['g', 'guppy', photo('guide-looked').url]])
    expect((await shown(true)).own).toEqual([])
    await state('_photo-guides.json', {
      [photo('guide-looked').url]: { person: false, mark: false, brand: false, other: { platy: false }, answeredSubjects: ['platy'] },
    })
    expect((await shown(true)).own).toEqual(['guide-looked'])
    await write('guides/g/vi.json', { ...alphaVi, slug: 'trang-g' })
  } finally {
    said.mockRestore()
  }
  // Judged: each shows by itself in the next build.
  await write('guides/g/entity.json', guide([photo('guide-looked'), photo('guide-new')]))
  await looked(all)
  expect(await shown(true)).toEqual({ own: ['guide-looked', 'guide-new'], stock: ['stock-looked', 'stock-new'] })
  await write('guides/g/vi.json', { ...alphaVi, slug: 'trang-g', name: 'Hướng dẫn nuôi cá platy' })
  const passed = { person: false, mark: false, brand: false }
  await state('_photo-guides.json', {
    [photo('guide-looked').url]: { ...passed, other: { arowana: false, platy: false }, answeredSubjects: ['arowana', 'platy'] },
    [photo('guide-new').url]: { ...passed, other: { arowana: false }, answeredSubjects: ['arowana'] },
    [photo('stock-looked').url]: { ...passed, other: { platy: true }, answeredSubjects: ['platy'] },
    [photo('stock-new').url]: { ...passed, other: { platy: false }, answeredSubjects: ['platy'] },
  })
  expect(await shown(true)).toEqual({ own: ['guide-looked'], stock: ['stock-new'] })
  await write('guides/g/vi.json', { ...alphaVi, slug: 'trang-g' })
  await looked(all)
  // With an alteration withdrawn the served original needs its own verdict.
  const original = photo('original')
  const altered = {
    ...photo('guide-looked'), original: { url: original.url, width: original.width, height: original.height },
    altered: [{ method: 'lanczos3-upscale', date: '2026-11-10', originalHash: 'a'.repeat(64) }],
  }
  await write('guides/g/entity.json', guide([altered]))
  await state('_photo-watermarks.json', Object.fromEntries([...all, 'original'].map(n => [photo(n).url, { ocr: [] }])))
  await state('_photo-faces.json', Object.fromEntries([...all, 'original'].map(n => [photo(n).url, 0])))
  expect((await shown(true)).own).toEqual([])
  await looked([...all, 'original'])
  expect((await shown(true)).own).toEqual(['original'])
  await write('guides/g/entity.json', guide([photo('guide-looked'), photo('guide-new')]))
  // With no record beside the real content the site's build fails; a root with none (the fixture build) has no rule.
  await rm(join(site, 'engine-state', '_photo-guides.json'))
  await expect(loadAll({ root: store, lang: 'vi', publicBuild: true, photoScreen: 'required' })).rejects.toThrow("the guides' own look's record is missing")
  await state('_photo-guides.json', {})
  await rm(join(site, 'engine-state', '_photo-guides.json'))
  expect(await shown(true)).toEqual({ own: ['guide-looked', 'guide-new'], stock: ['stock-looked', 'stock-new'] })
})

test("a public build shows no own photo of a species, plant or guide page the face finder has never read: it waits there, in an album and by address, shows once read, and the site's build counts them and fails past the limit", async () => {
  const { mkdir } = await import('node:fs/promises')
  const site = await mkdtemp(join(tmpdir(), 'aq-unread-'))
  const store = join(site, 'content')
  await cp(root, store, { recursive: true })
  const photo = (name: string) => ({ url: `https://media.test/${name}.webp`, width: 960, height: 640, licence: 'CC BY 4.0', author: 'A', sourceUrl: `https://x/${name}` })
  const write = (file: string, x: unknown) => writeFile(join(store, file), JSON.stringify(x))
  const alphaFile = join(store, 'species', 'alpha', 'entity.json')
  const alpha = JSON.parse(await readFile(alphaFile, 'utf8'))
  const alphaVi = JSON.parse(await readFile(join(store, 'species', 'alpha', 'vi.json'), 'utf8'))
  await write('species/alpha/entity.json', { ...alpha, photos: [photo('fish-read'), photo('fish-unread')] })
  await mkdir(join(store, 'gallery'))
  // An album's own photos aren't the face finder's (they wait for the photo check): only a page's own copy makes one wait.
  await write('gallery/alpha.json', { id: 'alpha', seen: 2, updatedAt: '2026-11-21', photos: [photo('fish-unread'), photo('album')] })
  for (const [kind, id, e] of [
    ['plants', 'moss', { id: 'moss', scientificName: 'Mossus testus', difficulty: 1, light: 'low', co2: 'none', growth: 'slow', placement: ['foreground'], sections: alpha.sections, photos: [photo('plant-unread')], productSlots: [], updatedAt: '2026-11-21' }],
    ['guides', 'g', { id: 'g', kind: 'care', source: alpha.sections[0].source, sourceUrl: 'https://x/g', html: '<p>x</p>', photos: [photo('guide-read'), photo('guide-unread')], mentions: [], updatedAt: '2026-11-21' }],
    // The face finder doesn't read a breed's photos: they don't wait for it.
    ['breeds', 'b', { id: 'b', kind: 'hybrid', parents: [], care: {}, photos: [photo('breed')], sources: [], updatedAt: '2026-11-21' }],
  ] as const) {
    await mkdir(join(store, kind, id), { recursive: true })
    await write(`${kind}/${id}/entity.json`, e)
    await write(`${kind}/${id}/vi.json`, { ...alphaVi, slug: `trang-${id}` })
  }
  // The watermark screen has read every one, with no text: only the face finder's record holds them. A record of no
  // face is a read.
  const all = ['fish-read', 'fish-unread', 'album', 'plant-unread', 'guide-read', 'guide-unread', 'breed']
  await mkdir(join(site, 'engine-state'))
  await writeFile(join(site, 'engine-state', '_photo-watermarks.json'), JSON.stringify(Object.fromEntries(all.map(n => [`https://media.test/${n}.webp`, { ocr: [] }]))))
  // And the dead-fish screen has judged every one: only the face finder's record holds them here.
  const judgedAll = (names: string[]) => writeFile(join(site, 'engine-state', '_dead-screen.json'), JSON.stringify(Object.fromEntries(names.map(n => [`https://media.test/${n}.webp`, { dead: false }]))))
  await judgedAll(all)
  // And the guides' own look has judged the guide's photos.
  await writeFile(join(site, 'engine-state', '_photo-guides.json'), JSON.stringify(Object.fromEntries(['guide-read', 'guide-unread'].map(n => [`https://media.test/${n}.webp`, { person: false, mark: false, brand: false, note: '' }]))))
  const facesFile = join(site, 'engine-state', '_photo-faces.json')
  await writeFile(facesFile, JSON.stringify({ 'https://media.test/fish-read.webp': 0, 'https://media.test/guide-read.webp': 0 }))
  const short = (u: string) => u.replace('https://media.test/', '').replace('.webp', '')
  const shown = async (publicBuild: boolean) => {
    const c = await loadAll({ root: store, lang: 'vi', publicBuild })
    const own = (xs: { id: string; photos: { url: string }[] }[], id: string) => xs.find(x => x.id === id)!.photos.map(p => short(p.url))
    return { fish: own(c.species, 'alpha'), album: (c.galleries.alpha ?? []).map(p => short(p.url)), plant: own(c.plants, 'moss'), guide: own(c.guides, 'g'), breed: own(c.breeds, 'b') }
  }
  expect(await shown(true)).toEqual({ fish: ['fish-read'], album: ['album'], plant: [], guide: ['guide-read'], breed: ['breed'] })
  // The engine's own reads see every photo.
  expect(await shown(false)).toEqual({ fish: ['fish-read', 'fish-unread'], album: ['fish-unread', 'album'], plant: ['plant-unread'], guide: ['guide-read', 'guide-unread'], breed: ['breed'] })
  // By address too (the calendar), a thumb's and a larger copy's.
  const c = await loadAll({ root: store, lang: 'vi', publicBuild: true })
  expect(['fish-unread', 'fish-unread-480', 'fish-unread-large', 'fish-read', 'breed'].filter(n => c.photoWaits!(`https://media.test/${n}.webp`)))
    .toEqual(['fish-unread', 'fish-unread-480', 'fish-unread-large'])
  // The site's build (the real content) says how many wait.
  const said = vi.spyOn(console, 'log').mockImplementation(() => {})
  try {
    await loadAll({ root: store, lang: 'vi', publicBuild: true, photoScreen: 'required' })
    expect(said.mock.calls.map(a => String(a[0])).filter(l => l.includes('face finder'))).toEqual(['vi: 3 own photos of species, plant and guide pages wait, the face finder has never read them'])
    // Past the limit it is a lost or damaged record: the site's build fails. An engine step's public read still hides them.
    const many = Array.from({ length: UNREAD_FACES_LIMIT - 2 }, (_, i) => photo(`many-${i}`))
    await write('species/alpha/entity.json', { ...alpha, photos: [photo('fish-read'), photo('fish-unread'), ...many] })
    await writeFile(join(site, 'engine-state', '_photo-watermarks.json'), JSON.stringify(Object.fromEntries([...all, ...many.map(p => short(p.url))].map(n => [`https://media.test/${n}.webp`, { ocr: [] }]))))
    await judgedAll([...all, ...many.map(p => short(p.url))])
    await expect(loadAll({ root: store, lang: 'vi', publicBuild: true, photoScreen: 'required' })).rejects.toThrow(`vi: ${UNREAD_FACES_LIMIT + 1} own photos of species, plant and guide pages the face finder has never read`)
    expect((await shown(true)).fish).toEqual(['fish-read'])
    // A listed URL cannot be retried by faces and still stays off the page.
    const rejectedFile = join(site, 'engine-state', '_photo-rejected.json')
    await writeFile(rejectedFile, JSON.stringify({ [many[0]!.url]: 'dead: withheld' }))
    const retryable = await loadAll({ root: store, lang: 'vi', publicBuild: true, photoScreen: 'required' })
    expect(retryable.photoWaits!(many[0]!.url)).toBe(true)
    const { rm } = await import('node:fs/promises')
    await rm(rejectedFile)
    // At the limit it builds.
    await write('species/alpha/entity.json', { ...alpha, photos: [photo('fish-read'), photo('fish-unread'), ...many.slice(1)] })
    await loadAll({ root: store, lang: 'vi', publicBuild: true, photoScreen: 'required' })
  } finally {
    said.mockRestore()
  }
  // After the face step, the cached positive result keeps its photo off both the page and its album.
  await write('species/alpha/entity.json', { ...alpha, photos: [photo('fish-read'), photo('fish-unread')] })
  await writeFile(facesFile, JSON.stringify(Object.fromEntries(['fish-read', 'fish-unread', 'plant-unread', 'guide-read', 'guide-unread'].map(n => [`https://media.test/${n}.webp`, n === 'fish-unread' ? 2 : 0]))))
  expect(await shown(true)).toEqual({ fish: ['fish-read'], album: ['album'], plant: ['plant-unread'], guide: ['guide-read', 'guide-unread'], breed: ['breed'] })
  // With no record beside the real content, the site's build fails: it can't tell a read photo from one never read.
  const { rm } = await import('node:fs/promises')
  await rm(facesFile)
  await expect(loadAll({ root: store, lang: 'vi', publicBuild: true, photoScreen: 'required' })).rejects.toThrow("the face finder's record is missing")
})

test("an own photo the face finder has never read waits wherever it shows, whatever its page's translations say: in an album in a language its page has no text in, and its page held back", async () => {
  const { mkdir } = await import('node:fs/promises')
  const site = await mkdtemp(join(tmpdir(), 'aq-unread-owner-'))
  const store = join(site, 'content')
  await cp(root, store, { recursive: true })
  const photo = (name: string) => ({ url: `https://media.test/${name}.webp`, width: 960, height: 640, licence: 'CC BY 4.0', author: 'A', sourceUrl: `https://x/${name}` })
  const write = (file: string, x: unknown) => writeFile(join(store, file), JSON.stringify(x))
  const alpha = JSON.parse(await readFile(join(store, 'species', 'alpha', 'entity.json'), 'utf8'))
  const alphaVi = JSON.parse(await readFile(join(store, 'species', 'alpha', 'vi.json'), 'utf8'))
  // alpha has Vietnamese and Indonesian text. Its album shows a photo each of two other pages' own and one of its own.
  await write('species/alpha/id.json', { ...alphaVi, slug: 'ikan-alpha' })
  await mkdir(join(store, 'gallery'))
  await write('gallery/alpha.json', { id: 'alpha', seen: 3, updatedAt: '2026-11-22', photos: [photo('vi-only'), photo('held'), photo('album')] })
  // vionly has Vietnamese text only; heldback is held back in Vietnamese, its only language.
  for (const [id, own, t] of [['vionly', 'vi-only', alphaVi], ['heldback', 'held', { ...alphaVi, held: { checks: ['harm'], at: '2026-11-20' } }]] as const) {
    await mkdir(join(store, 'species', id), { recursive: true })
    await write(`species/${id}/entity.json`, { ...alpha, id, scientificName: `Testus ${id}`, photos: [photo(own)] })
    await write(`species/${id}/vi.json`, { ...t, slug: `ca-${id}` })
  }
  const names = ['vi-only', 'held', 'album']
  await mkdir(join(site, 'engine-state'))
  await writeFile(join(site, 'engine-state', '_photo-watermarks.json'), JSON.stringify(Object.fromEntries(names.map(n => [`https://media.test/${n}.webp`, { ocr: [] }]))))
  const facesFile = join(site, 'engine-state', '_photo-faces.json')
  await writeFile(facesFile, '{}')
  const short = (u: string) => u.replace('https://media.test/', '').replace('.webp', '')
  const shown = async (lang: 'vi' | 'id') => {
    const c = await loadAll({ root: store, lang, publicBuild: true, leaveOutHeld: true })
    return { album: (c.galleries.alpha ?? []).map(p => short(p.url)), waits: names.filter(n => c.photoWaits!(`https://media.test/${n}.webp`)) }
  }
  expect(await shown('id')).toEqual({ album: ['album'], waits: ['vi-only', 'held'] })
  expect(await shown('vi')).toEqual({ album: ['album'], waits: ['vi-only', 'held'] })
  // Read: each shows.
  await writeFile(facesFile, JSON.stringify({ 'https://media.test/vi-only.webp': 0, 'https://media.test/held.webp': 0 }))
  expect(await shown('id')).toEqual({ album: names, waits: [] })
})

test('a public build shows no photo the watermark screen still owes a look: it waits, and shows by itself once judged', async () => {
  const { mkdir, rm, utimes } = await import('node:fs/promises')
  const site = await mkdtemp(join(tmpdir(), 'aq-screen-'))
  const store = join(site, 'content')
  await cp(root, store, { recursive: true })
  const photo = (name: string) => ({ url: `https://media.test/${name}.webp`, width: 960, height: 640, licence: 'CC BY 4.0', author: 'A', sourceUrl: `https://x/${name}` })
  const file = join(store, 'species', 'alpha', 'entity.json')
  const e = JSON.parse(await readFile(file, 'utf8'))
  const own = ['commons/no-text', 'commons/text', 'commons/text-judged', 'scotcat/logo-source', 'commons/never-read']
  e.photos = own.map(photo)
  await writeFile(file, JSON.stringify(e))
  await mkdir(join(store, 'gallery'))
  await writeFile(join(store, 'gallery/alpha.json'), JSON.stringify({ id: 'alpha', seen: 2, updatedAt: '2026-11-11', photos: [photo('commons/album-text'), photo('commons/album-no-text')] }))
  const text = [{ t: '© a credit', c: 0.9, at: 'bottom right' }]
  const record: Record<string, unknown> = {
    'https://media.test/commons/no-text.webp': { ocr: [] },
    'https://media.test/commons/text.webp': { ocr: text },
    'https://media.test/commons/text-judged.webp': { ocr: text, watermark: false, kind: 'none', what: '' },
    'https://media.test/scotcat/logo-source.webp': { ocr: [] },
    'https://media.test/commons/album-text.webp': { ocr: text },
    'https://media.test/commons/album-no-text.webp': { ocr: [] },
  }
  const recordFile = join(site, 'engine-state', '_photo-watermarks.json')
  await mkdir(join(site, 'engine-state'))
  let written = 0
  const write = async () => { await writeFile(recordFile, JSON.stringify(record)); written += 5; await utimes(recordFile, new Date(), new Date(Date.now() + written * 1000)) }
  await write()
  const shown = async (publicBuild: boolean) => {
    const c = await loadAll({ root: store, lang: 'vi', publicBuild })
    const short = (u: string) => u.replace('https://media.test/', '').replace('.webp', '')
    return { own: c.species.find(s => s.id === 'alpha')!.photos.map(p => short(p.url)), album: (c.galleries.alpha ?? []).map(p => short(p.url)) }
  }
  // Text the model has not judged, a logo source's photo it has not judged, and a photo the reader never read all wait.
  expect(await shown(true)).toEqual({ own: ['commons/no-text', 'commons/text-judged'], album: ['commons/album-no-text'] })
  // The engine's own reads see every photo: the photo is still in content, waiting, not refused.
  expect(await shown(false)).toEqual({ own, album: ['commons/album-text', 'commons/album-no-text'] })
  // Judged clean, each shows by itself in the next build; the reader's read lets a photo with no text show.
  for (const name of ['commons/text', 'scotcat/logo-source', 'commons/album-text']) record[`https://media.test/${name}.webp`] = { ocr: name.endsWith('text') ? text : [], watermark: false, kind: 'none', what: '' }
  record['https://media.test/commons/never-read.webp'] = { ocr: [] }
  await write()
  expect(await shown(true)).toEqual({ own, album: ['commons/album-text', 'commons/album-no-text'] })
  // The calendar names a picture by address alone, so the build answers for an address, a thumb's and a larger copy's
  // too: nothing waits once judged.
  const held = async (...names: string[]) => { const c = await loadAll({ root: store, lang: 'vi', publicBuild: true }); return names.filter(n => c.photoWaits!(`https://media.test/${n}.webp`)) }
  expect(await held(...own, ...own.map(n => `${n}-480`), ...own.map(n => `${n}-large`))).toEqual([])

  // A video guide's section photos and stills, and an equipment guide's head picture, wait the same way.
  const waits = photo('commons/section-text'), clear = photo('commons/section-no-text')
  const still = (name: string) => ({ t: 1, url: `https://media.test/${name}.webp`, width: 1280, height: 720, caption: 'c' })
  const section = (await loadAll({ root: store, lang: 'vi', publicBuild: false })).species.find(x => x.id === 'alpha')!.sections[0]!
  await mkdir(join(store, 'guides', 'g'), { recursive: true })
  await writeFile(join(store, 'guides', 'g', 'entity.json'), JSON.stringify({
    id: 'g', kind: 'care', source: section.source, sourceUrl: 'https://x/g', html: '<h2>One</h2><h2>Two</h2>', photos: [], mentions: [], updatedAt: '2026-11-11',
    video: { youtubeId: 'abcdefghijk', title: 'T', channel: 'C', channelUrl: 'https://x/c', durationSec: 60, chapters: [], figures: [{ heading: 'One', moments: [still('stills/text'), still('stills/no-text')], photo: waits }, { heading: 'Two', moments: [], photo: clear }] },
  }))
  await writeFile(join(store, 'guides', 'g', 'vi.json'), await readFile(join(store, 'species', 'alpha', 'vi.json'), 'utf8'))
  const equip = (category: string, hero: object, types: object[]) => ({ category, name: category, lead: '', intro: '', hero, types, choose: [], mistakes: [], faq: [] })
  await mkdir(join(store, 'equipment'))
  await writeFile(join(store, 'equipment/loc.json'), JSON.stringify(equip('loc', waits, [{ id: 'a', name: 'A', match: 'a', desc: '', pick: '', buy: 'a', photo: clear }])))
  await writeFile(join(store, 'equipment/den.json'), JSON.stringify(equip('den', waits, [])))
  Object.assign(record, {
    [waits.url]: { ocr: text }, [clear.url]: { ocr: [] },
    'https://media.test/stills/text.webp': { ocr: text }, 'https://media.test/stills/no-text.webp': { ocr: [] },
  })
  await write()
  const c = await loadAll({ root: store, lang: 'vi', publicBuild: true })
  const figures = c.guides.find(g => g.id === 'g')!.video!.figures!
  expect(figures.map(f => [f.photo?.url, f.moments.map(m => m.url)])).toEqual([[undefined, ['https://media.test/stills/no-text.webp']], [clear.url, []]])
  // A type's photo stands in for a head that waits; with none to stand in, the guide waits too.
  expect(c.equipment.map(e => [e.category, e.hero.url])).toEqual([['loc', clear.url]])
  expect(await held('commons/section-text', 'commons/section-text-large', 'commons/section-text-480', 'stills/text', 'commons/section-no-text', 'stills/no-text'))
    .toEqual(['commons/section-text', 'commons/section-text-large', 'commons/section-text-480', 'stills/text'])
  // A picture this build did not load (on a page this language lacks, or one the gate holds) is asked of the record:
  // one it owes a look waits, one it judged clean shows, and one it does not know waits.
  const elsewhere = 'https://media.test/commons/elsewhere-text.webp', clean = 'https://media.test/commons/elsewhere-clean.webp'
  Object.assign(record, { [elsewhere]: { ocr: text }, [clean]: { ocr: text, watermark: false, kind: 'none', what: '' } })
  await write()
  const asked = ['commons/elsewhere-text', 'commons/elsewhere-text-large', 'commons/elsewhere-clean', 'commons/elsewhere-clean-large', 'commons/elsewhere-clean-480', 'commons/unknown']
  expect(await held(...asked)).toEqual(['commons/elsewhere-text', 'commons/elsewhere-text-large', 'commons/unknown'])
  // A build with no screen answers for none.
  expect((await loadAll({ root: store, lang: 'vi', publicBuild: false })).photoWaits).toBeUndefined()
  // The record is read again when it changes with its modified time put back: at another size, then at the same size.
  const { stat } = await import('node:fs/promises')
  const rewrite = async () => { const at = await stat(recordFile); await writeFile(recordFile, JSON.stringify(record)); await utimes(recordFile, at.atime, at.mtime); return at }
  record['https://media.test/commons/unknown.webp'] = { ocr: [] }
  const grown = await rewrite()
  expect((await stat(recordFile)).mtimeMs).toBe(grown.mtimeMs)
  expect(await held(...asked)).toEqual(['commons/elsewhere-text', 'commons/elsewhere-text-large'])
  ;[record[elsewhere], record[clean]] = [record[clean], record[elsewhere]]
  const same = await rewrite()
  expect([(await stat(recordFile)).mtimeMs, (await stat(recordFile)).size]).toEqual([same.mtimeMs, same.size])
  expect(await held(...asked)).toEqual(['commons/elsewhere-clean', 'commons/elsewhere-clean-large', 'commons/elsewhere-clean-480'])

  // A build of the real content stops without the record: a missing one must not show every photo unscreened.
  await rm(recordFile)
  await expect(loadAll({ root: store, lang: 'vi', publicBuild: true, photoScreen: 'required' })).rejects.toThrow(/watermark screen's record is missing/)
  // A root with no record beside it (the fixture build, a test's store) has no screen.
  expect((await shown(true)).own).toEqual(own)
})

test('a photos-only source shows its photos in a public build, and nothing written from its text', async () => {
  const { mkdir } = await import('node:fs/promises')
  const store = await mkdtemp(join(tmpdir(), 'store-'))
  await cp(root, store, { recursive: true })
  const sources = JSON.parse(await readFile(join(store, 'sources.json'), 'utf8'))
  sources.diendancacanh = { name: 'Diễn Đàn Cá Cảnh', homepage: 'https://www.diendancacanh.com', publish: 'photos', permission: { date: '2026-11-01', file: 'owner statement', scope: ['photos'] } }
  await writeFile(join(store, 'sources.json'), JSON.stringify(sources))
  const file = join(store, 'species', 'alpha', 'entity.json')
  const e = JSON.parse(await readFile(file, 'utf8'))
  e.sections.push({ key: 'notes', source: 'diendancacanh', sourceUrl: 'https://www.diendancacanh.com/threads/x.1/', html: '<p>Forum text</p>' })
  e.photos.push({ url: 'https://media.test/diendancacanh/d.webp', width: 500, height: 400, licence: 'dùng với sự cho phép', author: 'vnreddevil / Diễn Đàn Cá Cảnh', sourceUrl: 'https://www.diendancacanh.com/threads/x.1/', source: 'diendancacanh' })
  e.dataCard.ph = [...(e.dataCard.ph ?? []), { source: 'diendancacanh', value: { min: 6, max: 7 } }]
  await writeFile(file, JSON.stringify(e))
  await mkdir(join(store, 'guides', 'forum-guide'), { recursive: true })
  await writeFile(join(store, 'guides', 'forum-guide', 'entity.json'), JSON.stringify({ id: 'forum-guide', kind: 'care', source: 'diendancacanh', sourceUrl: 'https://www.diendancacanh.com/threads/x.1/', html: '', photos: [], mentions: [], updatedAt: '2026-11-01' }))
  await writeFile(join(store, 'guides', 'forum-guide', 'vi.json'), JSON.stringify({ slug: 'bai-dien-dan', name: 'Bài diễn đàn', altNames: [], sections: {}, body: '<p>x</p>', quality: { score: 0.9, indexable: true } }))

  const pub = await loadAll({ root: store, lang: 'vi', publicBuild: true })
  const alpha = pub.species.find(s => s.id === 'alpha')!
  expect(alpha.photos.map(p => p.source)).toContain('diendancacanh')
  expect(alpha.sections.map(s => s.source)).not.toContain('diendancacanh')
  expect(alpha.dataCard.ph?.map(v => v.source) ?? []).not.toContain('diendancacanh')
  expect(pub.guides.map(g => g.id)).not.toContain('forum-guide')
  expect(pub.sources.diendancacanh?.publish).toBe('photos')
  // A local build shows everything, as for any source.
  const local = await loadAll({ root: store, lang: 'vi', publicBuild: false })
  expect(local.guides.map(g => g.id)).toContain('forum-guide')
})

// /id/ikan/datz-siam/ failed the live check for Vietnamese on Indonesian pages (2026-11-01): "sungai Đồng Nai".
test('Indonesian and Thai text marks the Vietnamese names in it as Vietnamese; Vietnamese pages are left as written', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'store-'))
  await cp(root, dir, { recursive: true })
  const vi = JSON.parse(await readFile(join(dir, 'species/alpha/vi.json'), 'utf8'))
  const key = Object.keys(vi.sections)[0]!
  const html = '<p>Ditemukan di sungai Đồng Nai, Vietnam.</p>'
  await writeFile(join(dir, 'species/alpha/id.json'), JSON.stringify({ ...vi, sections: { [key]: html } }))
  await writeFile(join(dir, 'species/alpha/vi.json'), JSON.stringify({ ...vi, sections: { ...vi.sections, [key]: '<p>Sống ở sông Đồng Nai.</p>' } }))
  const alpha = async (lang: 'vi' | 'id') => (await loadAll({ root: dir, lang, publicBuild: false })).species.find(s => s.id === 'alpha')!.t.sections[key]
  expect(await alpha('id')).toBe('<p>Ditemukan di sungai <span lang="vi">Đồng Nai</span>, Vietnam.</p>')
  expect(await alpha('vi')).toBe('<p>Sống ở sông Đồng Nai.</p>')
})

test('a local note goes first in the text, as read everywhere; a guide without one is as stored', () => {
  const t = { slug: 's', name: 'n', altNames: [], sections: {}, body: '<p>nguồn</p>', quality: { score: 1, indexable: true } }
  const localNote = { html: '<h3>Ở Việt Nam</h3>', refs: [{ url: 'https://a.test/', title: 'A' }] }
  expect(withLocalNote({ ...t, localNote }).body).toBe('<h3>Ở Việt Nam</h3><p>nguồn</p>')
  expect(withLocalNote(t)).toEqual(t)
})

test("the app's cards: those the gate holds back in a language are left out there, and a photo the build may not show goes, not the card", async () => {
  const vi = await loadAll({ root, lang: 'vi', publicBuild: true })
  expect(vi.cards.map(c => c.id)).toEqual(['betta-tet', 'new-rasbora'])
  expect(vi.cards[0]!.t.title).toBe('Hội thi cá betta')
  expect(vi.cards[0]!.photo?.licence).toBe('CC BY-SA 4.0')
  expect(vi.cards[1]!.photo).toBeUndefined()
  expect(vi.cards[1]!.about).toEqual([])
  // Thai: held there; Indonesian: not written.
  expect((await loadAll({ root, lang: 'th', publicBuild: true })).cards).toEqual([])
  expect((await loadAll({ root, lang: 'id', publicBuild: true })).cards).toEqual([])
})

test("an event card in one of the readers' countries shows only in its language: a fair in Bangkok is Thai only, its Vietnamese card the translators' source", async () => {
  const dir = await mkdtemp(join(tmpdir(), 'store-'))
  await cp(root, dir, { recursive: true })
  const file = join(dir, 'cards/betta-tet/entity.json')
  const e = JSON.parse(await readFile(file, 'utf8'))
  await writeFile(file, JSON.stringify({ ...e, event: { ...e.event, place: 'Bangkok', country: 'TH' } }))
  await writeFile(join(dir, 'cards/betta-tet/th.json'), JSON.stringify({ eyebrow: 'งานประกวด', title: 'งานประกวดปลากัด', body: '<p>ที่กรุงเทพฯ</p>' }))
  expect((await loadAll({ root: dir, lang: 'vi', publicBuild: true })).cards.map(c => c.id)).toEqual(['new-rasbora'])
  expect((await loadAll({ root: dir, lang: 'th', publicBuild: true })).cards.map(c => c.id)).toEqual(['betta-tet'])
  expect(cardShownIn({ event: { country: 'BN' } }, 'ms')).toBe(true)
  expect(cardShownIn({ event: { country: 'JP' } }, 'vi')).toBe(true)
  expect(cardShownIn({}, 'id')).toBe(true)
})

test('a heading with one voice shows that source alone, and only once this language has its text', () => {
  const block = (key: string, source: string) => ({ key, source, sourceUrl: `https://x/${source}`, html: 'x' }) as Section
  const sections = [block('waterConditions', 'glaser'), block('waterConditions', 'seriouslyfish'), block('diet', 'glaser')]
  const shown = (t: Record<string, string>) => oneVoice({ sections, t: { sections: t } as unknown as Translation }, { waterConditions: 'seriouslyfish' }).sections.map(s => `${s.key}:${s.source}`)
  expect(shown({ 'waterConditions:glaser': 'a', 'waterConditions:seriouslyfish': 'b', 'diet:glaser': 'c' })).toEqual(['waterConditions:seriouslyfish', 'diet:glaser'])
  expect(shown({ 'waterConditions:glaser': 'a', 'diet:glaser': 'c' })).toEqual(['waterConditions:glaser', 'waterConditions:seriouslyfish', 'diet:glaser'])
  expect(oneVoice({ sections, t: { sections: {} } as unknown as Translation }, undefined).sections).toEqual(sections)
  // No voice: the heading is off, whichever sources wrote under it, and the others stay.
  const none = oneVoice({ sections, t: { sections: { 'waterConditions:glaser': 'a', 'waterConditions:seriouslyfish': 'b', 'diet:glaser': 'c' } } as unknown as Translation }, { waterConditions: false })
  expect(none.sections.map(s => `${s.key}:${s.source}`)).toEqual(['diet:glaser'])
  // Its text goes too, so nothing that reads the page's text (the gate's checks, the summary) reads what readers don't see.
  expect(Object.keys(none.t.sections)).toEqual(['diet:glaser'])
})

// The owner, 15 Nov 2026: "what does each look like?". A kind's photo passes the screen the term's own photos pass: one
// the build may not show leaves its kind without a photo, never a photo it may not show.
test('a glossary kind\'s photo passes the same screen as the term\'s photos', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aq-glossary-kinds-'))
  await cp(root, dir, { recursive: true })
  const photos = JSON.parse(await readFile(join(dir, 'species/alpha/entity.json'), 'utf8')).photos as { url: string }[]
  const ids = ['ok', 'nc', 'seriouslyfish', 'glaser']
  await mkdir(join(dir, 'glossary/lua'), { recursive: true })
  await writeFile(join(dir, 'glossary/lua/entity.json'), JSON.stringify({ id: 'lua', en: 'Driftwood', photos, kinds: photos.map((photo, i) => ({ id: ids[i], photo })) }))
  await writeFile(join(dir, 'glossary/lua/vi.json'), JSON.stringify({ slug: 'lua', name: 'Lũa', altNames: [], sections: {}, definition: 'Gỗ.', quality: { score: 0.9, indexable: true } }))
  const kinds = async (publicBuild: boolean) => {
    const g = (await loadAll({ root: dir, lang: 'vi', publicBuild })).glossary.find(x => x.id === 'lua')!
    for (const k of g.kinds!) expect(k.photo.url).toBe(photos[ids.indexOf(k.id)]!.url)
    return g.kinds!.map(k => k.id)
  }
  expect(await kinds(false)).toEqual(['ok', 'seriouslyfish', 'glaser'])
  expect(await kinds(true)).toEqual(['ok', 'seriouslyfish'])
})
