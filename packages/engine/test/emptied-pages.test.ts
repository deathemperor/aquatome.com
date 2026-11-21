import { execFileSync } from 'node:child_process'
import { access, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as schema from '@aq/schema'
import { loadAll, PHOTO_SCREEN_FILE } from '@aq/schema'
import { expect, test } from 'vitest'
import { GALLERY_MIN } from '../../../apps/site/src/lib/gallery'
import { albumOf, hasAlbum } from '../../../apps/site/src/lib/photo-page'
import { EMPTIED_FILE, listEmptied, LOADER_FILES, showingPhotos, SITE_GALLERY_MIN } from '../src/emptied-pages'
import { priorityFish } from '../src/priority-fish'

// A fish page our removals left with no photo goes first for new photos, and stops at its first shown photo (the chief
// of staff, 21 Nov 2026). "Shows a photo" is the site's own rule.
const url = (n: string) => `https://media.test/commons/${n}.webp`
const photo = (n: string, licence = 'CC BY 4.0') => ({ url: url(n), width: 1200, height: 800, licence, author: 'Sample Tester', sourceUrl: `https://example.org/${n}` })
// A page has a section the site may show, or the loader has no page to show (load.ts).
const fish = (id: string, photos: object[], text = true) => ({ id, scientificName: `${id} fish`, order: 'O', family: 'F', genus: id, group: 'g', places: [], dataCard: {}, sections: text ? [{ key: 'habitat', source: 'seriouslyfish', sourceUrl: `https://example.org/${id}`, html: '<p>A fish.</p>' }] : [], photos, videos: [], productSlots: [], updatedAt: '2026-11-01' })
const breed = (id: string, photos: object[]) => ({ id, kind: 'variety', parents: [], care: {}, photos, sources: [], updatedAt: '2026-11-01' })
const vi = (slug: string) => ({ slug, name: slug, altNames: [], sections: {}, quality: { score: 0.9, indexable: true } })
const judged = { ocr: [] }, owed = { ocr: [{ t: 'some text', c: 0.9, at: 'bottom right' }] }

/** A repository's root with content and engine-state: pages, albums and the watermark screen's record. */
async function store(o: { species?: Record<string, string[]>; breeds?: Record<string, string[]>; albums?: Record<string, string[]>; waiting?: string[]; closed?: string[] }) {
  const r = await mkdtemp(join(tmpdir(), 'aq-emptied-test-'))
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  await mkdir(join(r, 'engine-state'), { recursive: true })
  await copyFile(new URL('../../../content/sources.json', import.meta.url), join(r, 'content/sources.json'))
  const put = async (f: string, d: object) => { await mkdir(join(r, f, '..'), { recursive: true }); await writeFile(join(r, f), `${JSON.stringify(d, null, 2)}\n`) }
  const all: string[] = []
  const pics = (ns: string[]) => ns.map(n => { all.push(n); return photo(n, o.closed?.includes(n) ? 'All rights reserved' : 'CC BY 4.0') })
  for (const [id, ns] of Object.entries(o.species ?? {})) { await put(`content/species/${id}/entity.json`, fish(id, pics(ns))); await put(`content/species/${id}/vi.json`, vi(`ca-${id}`)) }
  for (const [id, ns] of Object.entries(o.breeds ?? {})) { await put(`content/breeds/${id}/entity.json`, breed(id, pics(ns))); await put(`content/breeds/${id}/vi.json`, vi(`giong-${id}`)) }
  for (const [id, ns] of Object.entries(o.albums ?? {})) await put(`content/gallery/${id}.json`, { id, photos: pics(ns), seen: ns.length, updatedAt: '2026-11-01' })
  await put(`engine-state/${PHOTO_SCREEN_FILE}`, Object.fromEntries(all.map(n => [url(n), o.waiting?.includes(n) ? owed : judged])))
  return { r, put }
}
const disk = (r: string) => (p: string) => readFile(join(r, p), 'utf8').catch(() => undefined)

test("the engine's rule is the site's: a page shows a photo when the loader leaves it one of its own, or its album shows", async () => {
  expect(SITE_GALLERY_MIN).toBe(GALLERY_MIN)
  const { r, put } = await store({
    species: { own: ['o1'], waits: ['w1'], album: [], none: [], closed: ['c1'], hushed: ['h1'] },
    albums: { album: ['al1'], waits: ['w2'] },
    breeds: { 'with-one': ['b1'], 'with-none': [] },
    waiting: ['w1', 'w2'], closed: ['c1'],
  })
  // The one voice takes hushed's only section off, so the site has no page for it, photo or not.
  await put('content/one-voice.json', { hushed: { habitat: false } })
  const refs = ['species/own', 'species/waits', 'species/album', 'species/none', 'species/closed', 'species/hushed', 'breeds/with-one', 'breeds/with-none']
  const engine = await showingPhotos(refs, disk(r))
  const c = await loadAll({ root: join(r, 'content'), lang: 'vi', publicBuild: true })
  const site = new Map([
    ...c.species.map(s => [`species/${s.id}`, s.photos.length > 0 || hasAlbum(albumOf(c, 'species', s))] as const),
    ...c.breeds.map(b => [`breeds/${b.id}`, b.photos.length > 0 || hasAlbum(albumOf(c, 'breeds', b))] as const),
  ])
  expect([...engine].sort()).toEqual([...site].sort())
  expect([...engine].filter(([, shows]) => shows).map(([ref]) => ref).sort()).toEqual(['breeds/with-one', 'species/album', 'species/own'])
  expect(engine.has('species/hushed')).toBe(false)
})

test("every file the site's loader reads is copied for the engine's rule, or named as deciding nothing of whether a fish page shows a photo", async () => {
  const src = await readFile(new URL('../../schema/src/load.ts', import.meta.url), 'utf8')
  const read = new Set<string>()
  for (const m of src.matchAll(/join\(root, '([^']+)'/g)) read.add(m[1]!)
  for (const m of src.matchAll(/stateRecord(?:<[^(]*>)?\(root, ([A-Z_]+)\)/g)) {
    const name = (schema as Record<string, unknown>)[m[1]!]
    expect(typeof name, `${m[1]} is @aq/schema's`).toBe('string')
    read.add(name as string)
  }
  expect(read).toContain('one-voice.json')
  expect(read).toContain(PHOTO_SCREEN_FILE)
  const placed = new Set<string>(Object.values(LOADER_FILES).flat())
  expect([...read].filter(f => !placed.has(f)).sort()).toEqual([])
})

test('a run that leaves a fish page with no photo lists it, dated; one emptied before the run, one still showing a photo, one that lost its text, and one listed already are not listed again', async () => {
  const { r, put } = await store({ species: { gone: ['g1'], still: ['s1', 's2'], before: [], album: [], quiet: ['q1'] }, albums: { album: ['a1'] } })
  await put(`engine-state/${EMPTIED_FILE}`, { 'species/listed': '2026-11-20' })
  await put('content/species/listed/entity.json', fish('listed', [photo('l1')])); await put('content/species/listed/vi.json', vi('ca-listed'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: r, encoding: 'utf8' })
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@example.org'); git('config', 'user.name', 'Sample Tester')
  git('add', '.'); git('commit', '-qm', 'pages')
  // This run's steps: off gone's page, one of still's two, album's one album photo, and listed's last.
  await put('content/species/gone/entity.json', fish('gone', []))
  await put('content/species/still/entity.json', fish('still', [photo('s2')]))
  await put('content/gallery/album.json', { id: 'album', photos: [], seen: 1, updatedAt: '2026-11-01' })
  await put('content/species/listed/entity.json', fish('listed', []))
  // quiet's last section goes, its photo stays: the site has no page for it, which is no page left without a photo.
  await put('content/species/quiet/entity.json', fish('quiet', [photo('q1')], false))
  expect(await listEmptied(r, '2026-11-21')).toEqual(['species/album', 'species/gone'])
  expect(JSON.parse(await readFile(join(r, 'engine-state', EMPTIED_FILE), 'utf8'))).toEqual({ 'species/album': '2026-11-21', 'species/gone': '2026-11-21', 'species/listed': '2026-11-20' })
  // Run again with nothing more taken off: nothing new.
  expect(await listEmptied(r, '2026-11-22')).toEqual([])
  // A listed page that's gone (folded into another) leaves the list, so it names only pages that exist.
  await rm(join(r, 'content/species/gone'), { recursive: true })
  expect(await listEmptied(r, '2026-11-22')).toEqual([])
  expect(Object.keys(JSON.parse(await readFile(join(r, 'engine-state', EMPTIED_FILE), 'utf8')))).toEqual(['species/album', 'species/listed'])
  // Not a repository: nothing to compare with.
  const { r: bare } = await store({ species: { x: [] } })
  expect(await listEmptied(bare, '2026-11-21')).toEqual([])
})

test("a page emptied by this run's removal and main's together is listed on main as it is now, after the run caught up", async () => {
  const { r, put } = await store({ species: { pair: ['p1'] }, albums: { pair: ['a1'] } })
  const git = (...a: string[]) => execFileSync('git', a, { cwd: r, encoding: 'utf8' })
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@example.org'); git('config', 'user.name', 'Sample Tester')
  git('add', '.'); git('commit', '-qm', 'pages')
  git('switch', '-q', '-c', 'run'); git('branch', '-q', '--set-upstream-to=main')
  // Main takes pair's album photo off; the run, its own photo. Each alone leaves it one.
  git('switch', '-q', 'main')
  await put('content/gallery/pair.json', { id: 'pair', photos: [], seen: 1, updatedAt: '2026-11-01' })
  git('commit', '-qam', 'main: the album photo off')
  git('switch', '-q', 'run')
  await put('content/species/pair/entity.json', fish('pair', []))
  git('commit', '-qam', 'run: its own photo off')
  // The run catches up (git pull --rebase): now both are off, and nothing differs from HEAD.
  git('rebase', '-q', 'main')
  expect(git('status', '--porcelain', '--', 'content')).toBe('')
  expect(await listEmptied(r, '2026-11-21')).toEqual(['species/pair'])
})

test("an emptied page is taken first until its first shown photo; the owner's fish keep their six; oldest day first", async () => {
  const { r, put } = await store({ species: { found: ['f1'], empty: [], owners: ['w1'] } })
  // textless has no section the site may show: no page to find photos for.
  await put('content/species/textless/entity.json', fish('textless', [], false)); await put('content/species/textless/vi.json', vi('ca-textless'))
  await put(`engine-state/${EMPTIED_FILE}`, { 'species/found': '2026-11-20', 'species/empty': '2026-11-21', 'species/textless': '2026-11-20' })
  await put('engine-state/_priority-fish.json', { 'species/owners': '2026-11-16' })
  expect(await priorityFish(r)).toEqual(['species/owners', 'species/empty'])
  // The owner's list wins for a page on both: one photo doesn't end its turn.
  await put(`engine-state/${EMPTIED_FILE}`, { 'species/owners': '2026-11-20', 'species/empty': '2026-11-21' })
  expect(await priorityFish(r)).toEqual(['species/owners', 'species/empty'])
})

test('the committed emptied list holds only fish pages that exist, each with a day, and merges by key', async () => {
  const list = JSON.parse(await readFile(new URL(`../../../engine-state/${EMPTIED_FILE}`, import.meta.url), 'utf8')) as Record<string, string>
  for (const [ref, day] of Object.entries(list)) {
    expect(ref).toMatch(/^(species|breeds)\/[a-z0-9-]+$/)
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    await access(new URL(`../../../content/${ref}/entity.json`, import.meta.url))
  }
  expect(await readFile(new URL('../../../.gitattributes', import.meta.url), 'utf8')).toMatch(new RegExp(`^engine-state/${EMPTIED_FILE.replace('.', '\\.')} merge=jsonmap$`, 'm'))
})
