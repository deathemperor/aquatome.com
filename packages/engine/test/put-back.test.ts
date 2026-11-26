import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterAll, afterEach, beforeEach, expect, test } from 'vitest'
import { screenDead, type DeadScreenDeps } from '../src/dead-screen'
import { dropFacePhotos, screenNewPhotos } from '../src/faces'
import { galleries, type GalleryDeps } from '../src/gallery'
import { mirrorPlan } from '../src/mirror-photos'
import { gitHistory, listAgreed, notePlaces, putBackCleared, waitingEntry, type History, type LeftPlace } from '../src/last-photo'
import { takeOffGuidesDead } from '../src/guides-dead'
import { compactRejection } from '../src/photo-observations'
import { checkPagePhotos, type PhotoCheckDeps, type PhotoVerdict } from '../src/photo-check'
import { sweep } from '../src/sweep'

// A photo off at its first verdict that the second look cleared goes back where it was, once (the chief of staff, 20 Nov
// 2026): every page and album it left, at its place there, from the repository's history.
const url = (n: string) => `https://media.aquatome.com/seriouslyfish/${n}.webp`
const photo = (n: string) => ({ url: url(n), width: 1200, height: 800, licence: 'dùng với sự cho phép', author: 'Seriously Fish', sourceUrl: 'https://www.seriouslyfish.com/x', source: 'seriouslyfish' })
const name = (u: string) => u.split('/').pop()!.replace('.webp', '')
const fish = (id: string, photos: object[]) => ({ id, scientificName: `${id} fish`, order: 'O', family: 'F', genus: id, group: 'g', places: [], dataCard: {}, sections: [], photos, videos: [], productSlots: [], updatedAt: '2026-11-01' })

async function store(pages: Record<string, string[]>, albums: Record<string, string[]> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'aq-put-back-'))
  const c = join(root, 'content')
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await mkdir(join(root, 'docs/review'), { recursive: true })
  await mkdir(join(c, 'gallery'), { recursive: true })
  await copyFile(new URL('../../../content/sources.json', import.meta.url), join(c, 'sources.json'))
  for (const [id, ns] of Object.entries(pages)) await page(root, id, ns)
  for (const [id, ns] of Object.entries(albums)) await album(root, id, ns)
  return root
}
async function page(root: string, id: string, ns: string[]) {
  const dir = join(root, 'content/species', id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'entity.json'), `${JSON.stringify(fish(id, ns.map(photo)), null, 2)}\n`)
  await writeFile(join(dir, 'vi.json'), JSON.stringify({ slug: id, name: id, altNames: [], sections: {}, quality: { score: 0.9, indexable: true } }))
}
const album = (root: string, id: string, ns: string[]) => writeFile(join(root, 'content/gallery', `${id}.json`), `${JSON.stringify({ id, photos: ns.map(photo), seen: ns.length, updatedAt: '2026-11-01' }, null, 2)}\n`)
const json = async (r: string, f: string) => JSON.parse(await readFile(join(r, f), 'utf8').catch(() => '{}'))
const photosOf = async (r: string, id: string) => ((await json(r, `content/species/${id}/entity.json`)).photos as { url: string }[]).map(p => name(p.url))
const albumOf = async (r: string, id: string) => (((await json(r, `content/gallery/${id}.json`)).photos ?? []) as { url: string }[]).map(p => name(p.url))

const why = compactRejection('dead: a fish on a board')
const cleared = (o: object = {}) => ({ why, step: 'the photo check', pages: ['species/aaa'], at: '2026-11-20', off: true, look: { said: 'clear', by: 'the chief of staff', on: '2026-11-21' }, ...o })
/** The history as git would read it: where a-dead stood on aaa's page and album before it left. */
const left: LeftPlace[] = [
  { file: 'content/species/aaa/entity.json', index: 1, photo: photo('a-dead'), times: 1 },
  { file: 'content/gallery/aaa.json', index: 0, photo: photo('a-dead'), times: 1 },
]
const SL = 'engine-state/_photo-second-look.json'
const ent = (ns: string[]) => ({ photos: ns.map(photo) })
/** g-dead's record, marked off at its first verdict. */
const marked = (o: object = {}) => ({ [url('g-dead')]: { why, step: 'the photo check', pages: ['species/aaa'], at: new Date().toISOString().slice(0, 10), off: true, ...o } })
async function repo(prefix: string) {
  const r = await mkdtemp(join(tmpdir(), prefix))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: r, encoding: 'utf8' })
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@example.org'); git('config', 'user.name', 'Sample Tester')
  const put = async (f: string, d: object) => { await mkdir(join(r, f, '..'), { recursive: true }); await writeFile(join(r, f), `${JSON.stringify(d, null, 2)}\n`) }
  return { r, git, put }
}
const counting = (places: LeftPlace[] | undefined) => { const calls: string[] = []; const h: History = async u => { calls.push(u); return places }; return { h, calls } }
async function clearedStore(entry: string | undefined = waitingEntry(why)) {
  const r = await store({ aaa: ['a-fish', 'a-other'] }, { aaa: ['a-album'] })
  await writeFile(join(r, 'engine-state/_photo-second-look.json'), JSON.stringify({ [url('a-dead')]: cleared() }))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify(entry === undefined ? {} : { [url('a-dead')]: entry }))
  return r
}

test('a cleared photo off at its first verdict goes back to every page and album it left, at its place, and its waiting entry goes', async () => {
  const r = await clearedStore()
  const { h, calls } = counting(left)
  const out = await sweep(r, { history: h, today: '2026-11-21' })
  expect(await photosOf(r, 'aaa')).toEqual(['a-fish', 'a-dead', 'a-other'])
  expect(await albumOf(r, 'aaa')).toEqual(['a-dead', 'a-album'])
  expect(out.putBack.sort()).toEqual([`content/gallery/aaa.json: ${url('a-dead')}`, `content/species/aaa/entity.json: ${url('a-dead')}`])
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({})
  expect((await json(r, 'engine-state/_photo-second-look.json'))[url('a-dead')].back).toBe('2026-11-21')
  // Once: the next pass reads no history and adds nothing, and a removal after it, on any step's word, stands.
  await page(r, 'aaa', ['a-fish', 'a-other'])
  const again = await sweep(r, { history: h, today: '2026-11-22' })
  expect(calls).toEqual([url('a-dead')])
  expect(again.putBack).toEqual([])
  expect(await photosOf(r, 'aaa')).toEqual(['a-fish', 'a-other'])
})

test("once back, a cleared photo stays through the check, the dead-fish screen, the face screen and the sweep's next pass, each of which can mark one off", async () => {
  const r = await store({ aaa: [] }, { aaa: [] })
  await writeFile(join(r, 'engine-state/_photo-second-look.json'), JSON.stringify({ [url('a-dead')]: cleared() }))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [url('a-dead')]: waitingEntry(why) }))
  // The page's only photo, and its album's: the case the first-verdict rule empties.
  await sweep(r, { history: async () => [{ ...left[0]!, index: 0 }, left[1]!] })
  expect(await photosOf(r, 'aaa')).toEqual(['a-dead'])
  const model: PhotoCheckDeps = {
    get: async () => new Uint8Array(await sharp({ create: { width: 64, height: 48, channels: 3, background: '#e83' } }).jpeg().toBuffer()),
    look: async () => ({ photos: [1, 2].map(n => ({ n, ok: 'dead', typical: false, note: 'a fish on a board', person: true, logo: false }) as { n: number } & PhotoVerdict) }),
  }
  await checkPagePhotos(r, model, { limit: 10 })
  let sheet: string[] = []
  const d: DeadScreenDeps = {
    get: async u => { sheet.push(u); return new Uint8Array(await sharp({ create: { width: 480, height: 360, channels: 3, background: '#468' } }).png().toBuffer()) },
    look: async () => { const tiles = sheet.map((_, i) => ({ n: i + 1, dead: true, note: 'a fish on a board' })); sheet = []; return { tiles } },
  }
  await screenDead(r, d, { limit: 48 })
  await dropFacePhotos(join(r, 'content'), join(r, 'engine-state/_photo-faces.json'), { get: async (u: string) => new TextEncoder().encode(u), detect: async (files: string[]) => files.map(() => 1) }, join(r, 'engine-state/_photo-rejected.json'), r)
  await sweep(r, { history: async () => { throw new Error('read again') } })
  expect(await photosOf(r, 'aaa')).toEqual(['a-dead'])
  expect(await albumOf(r, 'aaa')).toEqual(['a-dead'])
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({})
})

test('a cleared photo another reason put on the never-again list stays off, and is not tried again', async () => {
  const r = await clearedStore(compactRejection('people: a hand on the glass'))
  const { h, calls } = counting(left)
  const out = await sweep(r, { history: h, today: '2026-11-21' })
  expect(calls).toEqual([])
  expect(out.putBack).toEqual([])
  expect(out.putBackOff).toEqual([`${url('a-dead')}: on the never-again list as people`])
  expect(await photosOf(r, 'aaa')).toEqual(['a-fish', 'a-other'])
  expect((await json(r, 'engine-state/_photo-second-look.json'))[url('a-dead')].back).toBe('2026-11-21')
  expect((await sweep(r, { history: h })).putBackOff).toEqual([])
})

test('with no history to read here, nothing goes back and the record waits unmarked for a run that has it', async () => {
  const r = await clearedStore()
  const out = await sweep(r, { history: async () => undefined })
  expect(out.putBackUnread).toEqual([url('a-dead')])
  expect(await photosOf(r, 'aaa')).toEqual(['a-fish', 'a-other'])
  expect((await json(r, 'engine-state/_photo-second-look.json'))[url('a-dead')].back).toBeUndefined()
  await sweep(r, { history: async () => left })
  expect(await photosOf(r, 'aaa')).toEqual(['a-fish', 'a-dead', 'a-other'])
})

test('a page that already shows the photo again keeps it once; a page that is gone is passed over and reported', async () => {
  const r = await clearedStore()
  await page(r, 'aaa', ['a-dead', 'a-fish', 'a-other'])
  const out = await sweep(r, { history: async () => [...left, { file: 'content/species/gone/entity.json', index: 0, photo: photo('a-dead'), times: 1 }] })
  expect(await photosOf(r, 'aaa')).toEqual(['a-dead', 'a-fish', 'a-other'])
  expect(out.putBack).toEqual([`content/gallery/aaa.json: ${url('a-dead')}`])
  expect(out.putBackOff).toEqual([`${url('a-dead')}: content/species/gone/entity.json is gone`])
})

test('only the removal its mark made comes back: not a place it left again after coming back, nor a page its record does not name where the check refused it there', async () => {
  const r = await store({ aaa: ['a-fish'], bbb: ['b-fish'], ccc: ['c-fish'] })
  await writeFile(join(r, 'engine-state/_photo-second-look.json'), JSON.stringify({ [url('a-dead')]: cleared() }))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [url('a-dead')]: waitingEntry(why) }))
  // The check: dead on aaa (the page its record names, which the clear answers), another fish on bbb, the fish on ccc.
  const v = (ok: string) => ({ ok, typical: true, note: '', person: false, logo: false })
  await writeFile(join(r, 'engine-state/_photo-subjects.json'), JSON.stringify({ [url('a-dead')]: { aaa: v('dead'), bbb: v('other'), ccc: v('yes') } }))
  const at = (id: string, times = 1): LeftPlace => ({ file: `content/species/${id}/entity.json`, index: 1, photo: photo('a-dead'), times })
  const out = await sweep(r, { history: async () => [at('aaa'), at('bbb'), at('ccc', 2)], today: '2026-11-21' })
  expect(await photosOf(r, 'aaa')).toEqual(['a-fish', 'a-dead'])
  expect(await photosOf(r, 'bbb')).toEqual(['b-fish'])
  expect(await photosOf(r, 'ccc')).toEqual(['c-fish'])
  expect(out.putBackOff.sort()).toEqual([
    `${url('a-dead')}: it left content/species/ccc/entity.json again after it came back, and that removal stands`,
    `${url('a-dead')}: the check refused it on bbb`,
  ])
})

test("a reason on record always wins: on a page its record names, another fish in the subject record keeps it off that page and its album (Synodontis robbianus's album is the case); the dead fish there is what the clear answers", async () => {
  const r = await store({ aaa: ['a-fish'], rrr: ['r-fish'] }, { rrr: ['r-album'] })
  await writeFile(join(r, 'engine-state/_photo-second-look.json'), JSON.stringify({ [url('a-dead')]: cleared({ pages: ['species/aaa', 'species/rrr'] }) }))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [url('a-dead')]: waitingEntry(why) }))
  const v = (ok: string) => ({ ok, typical: true, note: '', person: false, logo: false })
  await writeFile(join(r, 'engine-state/_photo-subjects.json'), JSON.stringify({ [url('a-dead')]: { aaa: v('dead'), rrr: v('other') } }))
  const left = (file: string): LeftPlace => ({ file, index: 1, photo: photo('a-dead'), times: 1 })
  const out = await sweep(r, { history: async () => [left('content/species/aaa/entity.json'), left('content/species/rrr/entity.json'), left('content/gallery/rrr.json')], today: '2026-11-21' })
  expect(await photosOf(r, 'aaa')).toEqual(['a-fish', 'a-dead'])
  expect(await photosOf(r, 'rrr')).toEqual(['r-fish'])
  expect(await albumOf(r, 'rrr')).toEqual(['r-album'])
  expect(out.putBackOff).toEqual([`${url('a-dead')}: the check refused it on rrr`, `${url('a-dead')}: the check refused it on rrr`])
})

test('a guide it left takes it back too', async () => {
  const r = await clearedStore()
  await mkdir(join(r, 'content/guides/ggg'), { recursive: true })
  await writeFile(join(r, 'content/guides/ggg/entity.json'), `${JSON.stringify({ id: 'ggg', photos: [photo('g-1')] }, null, 2)}\n`)
  const out = await sweep(r, { history: async () => [...left, { file: 'content/guides/ggg/entity.json', index: 0, photo: photo('a-dead'), times: 1 }], today: '2026-11-21' })
  expect(out.putBack).toContain(`content/guides/ggg/entity.json: ${url('a-dead')}`)
  expect(((await json(r, 'content/guides/ggg/entity.json')).photos as { url: string }[]).map(p => name(p.url))).toEqual(['a-dead', 'g-1'])
})

test('the history from git: each page, album and guide file that showed the photo when it was marked off and that it left since, its place and entry just before it first left, and how often it left', async () => {
  const { r, git, put } = await repo('aq-put-back-git-')
  await put('content/species/ggg/entity.json', ent(['g1', 'g-dead', 'g2'])); await put('content/gallery/ggg.json', ent(['g-dead'])); await put('content/species/hhh/entity.json', ent(['h1']))
  await put('content/guides/care/entity.json', ent(['c1', 'g-dead']))
  await put(SL, {})
  git('add', '.'); git('commit', '-qm', 'pages')
  // Off its page and album at its first verdict, marked in the same commit; back on the page by a step, and off it again later.
  await put('content/species/ggg/entity.json', ent(['g1', 'g2'])); await put('content/gallery/ggg.json', ent([])); await put('content/guides/care/entity.json', ent(['c1'])); await put(SL, marked()); git('commit', '-qam', 'off')
  await put('content/species/ggg/entity.json', ent(['g-dead', 'g1', 'g2'])); git('commit', '-qam', 'back by a step')
  await put('content/species/ggg/entity.json', ent(['g1', 'g2'])); await put('content/species/hhh/entity.json', ent(['h1', 'h2'])); git('commit', '-qam', 'off again')
  const places = await gitHistory(r)(url('g-dead'), new Date().toISOString().slice(0, 10))
  expect(places?.sort((a, b) => a.file.localeCompare(b.file))).toEqual([
    { file: 'content/gallery/ggg.json', index: 0, photo: photo('g-dead'), times: 1, order: ['g-dead'].map(url) },
    { file: 'content/guides/care/entity.json', index: 1, photo: photo('g-dead'), times: 1, order: ['c1', 'g-dead'].map(url) },
    { file: 'content/species/ggg/entity.json', index: 1, photo: photo('g-dead'), times: 2, order: ['g1', 'g-dead', 'g2'].map(url) },
  ])
  // A mark before its record's day isn't read: records are dated by the day in UTC, and the day before is another's.
  const d = await mkdtemp(join(tmpdir(), 'aq-put-back-day-'))
  const at = (when: string, ...a: string[]) => execFileSync('git', a, { cwd: d, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_DATE: when, GIT_COMMITTER_DATE: when } })
  at('2026-11-18T12:00:00Z', 'init', '-q', '-b', 'main'); at('2026-11-18T12:00:00Z', 'config', 'user.email', 't@example.org'); at('2026-11-18T12:00:00Z', 'config', 'user.name', 'Sample Tester')
  const putIn = async (ns: string[], sl: object) => { await mkdir(join(d, 'content/species/ddd'), { recursive: true }); await mkdir(join(d, 'engine-state'), { recursive: true }); await writeFile(join(d, 'content/species/ddd/entity.json'), `${JSON.stringify(ent(ns), null, 2)}\n`); await writeFile(join(d, SL), JSON.stringify(sl)) }
  await putIn(['d1', 'g-dead'], {}); at('2026-11-18T12:00:00Z', 'add', '.'); at('2026-11-18T12:00:00Z', 'commit', '-qm', 'page')
  await putIn(['d1'], marked({ at: '2026-11-19' })); at('2026-11-19T23:30:00Z', 'commit', '-qam', 'off the day before')
  expect(await gitHistory(d)(url('g-dead'), '2026-11-20')).toEqual([])
  expect(await gitHistory(d)(url('g-dead'), '2026-11-19')).toMatchObject([{ file: 'content/species/ddd/entity.json', index: 1, photo: photo('g-dead'), times: 1 }])
  // Not a repository: nothing to read.
  expect(await gitHistory(await mkdtemp(join(tmpdir(), 'aq-put-back-none-')))(url('g-dead'), '2026-11-20')).toBeUndefined()
})

// The entries of photos taken off are kept in a private folder on the Mac, never in the public record (the chief of
// staff, 22 Nov): each test has its own, in the system's temp folder (the engine's tests have none: vitest.config.ts).
let kept = ''
beforeEach(async () => { kept = await mkdtemp(join(tmpdir(), 'aq-put-back-kept-')); process.env.AQ_PUT_BACK_ENTRIES = kept })
afterEach(() => rm(kept, { recursive: true, force: true }))
afterAll(() => { process.env.AQ_PUT_BACK_ENTRIES = 'off' })
const keptFor = async (u: string) => (await Promise.all((await readdir(kept)).map(async file => ({
  file: join(kept, file),
  entry: await json(kept, file),
})))).filter(k => k.entry.url === u)
const keptOf = async (u: string) => {
  const entries = await keptFor(u)
  return entries.length ? { places: Object.fromEntries(entries.map(k => [k.entry.file, k.entry.photo])) } : null
}
const today = () => new Date().toISOString().slice(0, 10)
const A = 'content/species/aaa/entity.json'
const capturedAt = (file: string, index: number) => ({ file, index, capture: expect.any(String) })

/** A store in a repository, aaa with no photo of its own committed, and the look's clear in a commit of its own. */
async function runRepo(albums: Record<string, string[]> = {}) {
  const r = await store({ aaa: [] }, albums)
  const git = (...a: string[]) => execFileSync('git', a, { cwd: r, encoding: 'utf8' })
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@example.org'); git('config', 'user.name', 'Sample Tester')
  git('add', '-A'); git('commit', '-qm', 'pages')
  const look = async (said: 'clear' | 'agree') => {
    const sl = await json(r, SL)
    for (const u of Object.keys(sl)) sl[u].look = { said, by: 'the chief of staff', on: today() }
    await writeFile(join(r, SL), `${JSON.stringify(sl, null, 2)}\n`)
    git('add', '-A'); git('commit', '-qm', 'the look')
  }
  return { r, git, clear: () => look('clear'), agree: () => look('agree') }
}
/** The dead-fish screen's model, calling every tile dead. */
function deadModel(): DeadScreenDeps {
  let sheet: string[] = []
  return {
    get: async u => { sheet.push(u); return new Uint8Array(await sharp({ create: { width: 480, height: 360, channels: 3, background: '#468' } }).png().toBuffer()) },
    look: async () => { const tiles = sheet.map((_, i) => ({ n: i + 1, dead: true, note: 'a fish on a board' })); sheet = []; return { tiles } },
  }
}

test('a photo taken off in the run that brought it, cleared, goes back to its place (the chief of staff, 22 Nov)', async () => {
  // A run makes one commit: a source read gives aaa its first photo and the dead-fish screen takes it off at its first
  // verdict, marked, before that commit, so no commit ever showed it on aaa.
  const { r, git, clear } = await runRepo()
  await page(r, 'aaa', ['a-new'])
  const entry = (await json(r, A)).photos[0]
  const screened = await screenDead(r, deadModel(), { limit: 48 })
  expect(screened.firstOff).toEqual([`${url('a-new')}: species/aaa`])
  expect(await photosOf(r, 'aaa')).toEqual([])
  // The record holds the file and the place; the entry, with its credit, is in the private folder alone.
  expect((await json(r, SL))[url('a-new')].left).toEqual([capturedAt(A, 0)])
  expect(await readFile(join(r, SL), 'utf8')).not.toContain(entry.author)
  expect((await keptOf(url('a-new'))).places).toEqual({ [A]: entry })
  git('add', '-A'); git('commit', '-qm', 'the run')
  await clear()
  const before = await stat(join(r, A))
  const out = await sweep(r, { history: gitHistory(r) })
  const after = await stat(join(r, A))
  expect(after.ino).not.toBe(before.ino)
  expect(after.mode).toBe(before.mode)
  expect(out.putBackOff).toEqual([])
  expect(out.putBack).toEqual([`${A}: ${url('a-new')}`])
  expect((await json(r, A)).photos).toEqual([entry])
  expect((await json(r, 'engine-state/_photo-rejected.json'))[url('a-new')]).toBeUndefined()
  // A fresh checkout can repeat a restore that stopped before its push.
  expect((await json(r, SL))[url('a-new')].left).toBeUndefined()
  expect(await keptOf(url('a-new'))).not.toBeNull()
  git('restore', '--', A, SL, 'engine-state/_photo-rejected.json')
  expect((await sweep(r, { history: gitHistory(r) })).putBack).toEqual([`${A}: ${url('a-new')}`])
  git('add', '-A'); git('commit', '-qm', 'the restore')
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  await putBackCleared(r, gitHistory(r))
  expect(await keptOf(url('a-new'))).toBeNull()
})

test('each step that takes a photo off at its first verdict notes where it stood: the faces step and the photo check too', async () => {
  // The faces step: a face on aaa's first photo, brought this run.
  const one = await runRepo()
  await page(one.r, 'aaa', ['a-new'])
  const entry = (await json(one.r, A)).photos[0]
  const out = await dropFacePhotos(join(one.r, 'content'), join(one.r, 'engine-state/_photo-faces.json'), { get: async (u: string) => new TextEncoder().encode(u), detect: async (files: string[]) => files.map(() => 1) }, join(one.r, 'engine-state/_photo-rejected.json'), one.r)
  expect(out.firstOff).toEqual([`${url('a-new')}: species/aaa`])
  expect((await json(one.r, SL))[url('a-new')].left).toEqual([capturedAt(A, 0)])
  expect((await keptOf(url('a-new'))).places).toEqual({ [A]: entry })
  one.git('add', '-A'); one.git('commit', '-qm', 'the run')
  await one.clear()
  expect((await sweep(one.r, { history: gitHistory(one.r) })).putBack).toEqual([`${A}: ${url('a-new')}`])
  expect((await json(one.r, A)).photos).toEqual([entry])

  // The photo check: dead on aaa's first photo, brought this run, with the hold on (a cap of 0).
  const two = await runRepo()
  await page(two.r, 'aaa', ['a-new'])
  const model: PhotoCheckDeps = {
    get: async () => new Uint8Array(await sharp({ create: { width: 64, height: 48, channels: 3, background: '#e83' } }).jpeg().toBuffer()),
    look: async () => ({ photos: [1, 2, 3, 4, 5, 6].map(n => ({ n, ok: 'dead', typical: false, note: 'a fish on a board', person: false, logo: false }) as { n: number } & PhotoVerdict) }),
  }
  const checked = await checkPagePhotos(two.r, model, { limit: 10, emptyCap: 0 })
  expect(checked.firstOff).toEqual([`species/aaa: ${url('a-new')}`])
  expect((await json(two.r, SL))[url('a-new')].left).toEqual([capturedAt(A, 0)])
  expect((await keptOf(url('a-new'))).places).toEqual({ [A]: entry })
  two.git('add', '-A'); two.git('commit', '-qm', 'the run')
  await two.clear()
  expect((await sweep(two.r, { history: gitHistory(two.r) })).putBack).toEqual([`${A}: ${url('a-new')}`])
})

test.each(['sweep', 'photo check then sweep'])('a same-cycle album copy taken off by %s goes back too', async (route) => {
  const gallery = 'content/gallery/aaa.json'
  const { r, git, clear } = await runRepo({ aaa: ['a-album'] })
  await album(r, 'aaa', ['a-album', 'a-new'])
  await page(r, 'aaa', ['a-new'])
  await screenDead(r, deadModel(), { limit: 48 })
  if (route === 'photo check then sweep') {
    await checkPagePhotos(r, {
      get: async () => { throw new Error('the fixture requests no photos') },
      look: async () => { throw new Error('the fixture requests no verdicts') },
    }, { limit: 0 })
    expect(await albumOf(r, 'aaa')).toEqual(['a-album'])
  }
  await sweep(r, { history: gitHistory(r) })
  expect(await photosOf(r, 'aaa')).toEqual([])
  expect(await albumOf(r, 'aaa')).toEqual(['a-album'])
  expect((await json(r, SL))[url('a-new')].left).toEqual([capturedAt(A, 0), capturedAt(gallery, 1)])
  git('add', '-A'); git('commit', '-qm', 'the run')
  await clear()
  const out = await sweep(r, { history: gitHistory(r) })
  expect(out.putBack.sort()).toEqual([`content/gallery/aaa.json: ${url('a-new')}`, `${A}: ${url('a-new')}`])
  expect(await photosOf(r, 'aaa')).toEqual(['a-new'])
  expect(await albumOf(r, 'aaa')).toEqual(['a-album', 'a-new'])
})

test("a run that can't read the private folder waits, unmarked, and the Mac's next puts it back; an entry the folder lost stays off, as before", async () => {
  const { r, git, clear } = await runRepo()
  await page(r, 'aaa', ['a-new'])
  await screenDead(r, deadModel(), { limit: 48 })
  git('add', '-A'); git('commit', '-qm', 'the run')
  await clear()
  // On GitHub, or with the folder off: everything is left as it was. Nothing goes back, nothing is reported kept off,
  // the record isn't stamped, and the waiting entry stays.
  const before = { record: await json(r, SL), rejected: await json(r, 'engine-state/_photo-rejected.json'), page: await json(r, A) }
  expect(before.rejected[url('a-new')]).toMatch(/^waiting:/)
  process.env.AQ_PUT_BACK_ENTRIES = 'off'
  const away = await sweep(r, { history: gitHistory(r) })
  expect(away.putBackUnread).toEqual([url('a-new')])
  expect(away.putBack).toEqual([])
  expect(away.putBackOff).toEqual([])
  expect(away.waitingOdd).toEqual([])
  expect({ record: await json(r, SL), rejected: await json(r, 'engine-state/_photo-rejected.json'), page: await json(r, A) }).toEqual(before)
  expect(await keptOf(url('a-new'))).not.toBeNull()
  process.env.AQ_PUT_BACK_ENTRIES = kept
  expect((await sweep(r, { history: gitHistory(r) })).putBack).toEqual([`${A}: ${url('a-new')}`])

  // The named private file may be temporarily unavailable. Keep the clear and its waiting entry until it returns.
  const two = await runRepo()
  await page(two.r, 'aaa', ['a-new'])
  await screenDead(two.r, deadModel(), { limit: 48 })
  two.git('add', '-A'); two.git('commit', '-qm', 'the run')
  await two.clear()
  const lostCapture = (await json(two.r, SL))[url('a-new')].left[0].capture
  const path = (await keptFor(url('a-new'))).find(entry => entry.entry.capture === lostCapture)!.file
  const saved = await readFile(path, 'utf8')
  await rm(path)
  const lost = await sweep(two.r, { history: gitHistory(two.r) })
  expect(lost.putBack).toEqual([])
  expect(lost.putBackOff).toEqual([])
  expect(lost.putBackUnread).toEqual([url('a-new')])
  expect(await photosOf(two.r, 'aaa')).toEqual([])
  expect((await json(two.r, SL))[url('a-new')].back).toBeUndefined()
  expect((await json(two.r, 'engine-state/_photo-rejected.json'))[url('a-new')]).toMatch(/^waiting:/)
  await writeFile(path, saved, { mode: 0o600 })
  expect((await sweep(two.r, { history: gitHistory(two.r) })).putBack).toEqual([`${A}: ${url('a-new')}`])
})

test.each(['capture', 'history'])('a place restored from %s survives a later place from another checkout', async method => {
  const { r, git, clear } = await runRepo({ aaa: [] })
  const u = url('a-new'), albumFile = 'content/gallery/aaa.json'
  await page(r, 'aaa', ['a-new'])
  if (method === 'history') {
    git('add', '-A'); git('commit', '-qm', 'a photo in history')
    process.env.AQ_PUT_BACK_ENTRIES = 'off'
  }
  await screenDead(r, deadModel(), { limit: 48 })
  process.env.AQ_PUT_BACK_ENTRIES = kept
  git('add', '-A'); git('commit', '-qm', 'the mark')
  const mark = (await json(r, SL))[u]
  const another = await store({})
  await writeFile(join(another, SL), JSON.stringify({ [u]: mark }))
  await notePlaces(another, new Map([[u, [{ file: albumFile, index: 0, photo: photo('a-new') }]]]))
  await clear()
  await sweep(r, { history: gitHistory(r) })
  expect((await json(r, SL))[u].settled).toEqual([expect.objectContaining({ file: A, index: 0 })])
  git('add', '-A'); git('commit', '-qm', 'page restored')
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  await putBackCleared(r, gitHistory(r))
  expect((await keptOf(u))!.places).toEqual({ [albumFile]: photo('a-new') })

  // A merge reopens only the album place. A runner without recovery data must leave the published page alone.
  const done = (await json(r, SL))[u]
  delete done.back
  done.left = (await json(another, SL))[u].left.filter((p: { file: string }) => p.file === albumFile)
  await writeFile(join(r, SL), JSON.stringify({ [u]: done }))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [u]: waitingEntry(mark.why) }))
  process.env.AQ_PUT_BACK_ENTRIES = 'off'
  const retry = await sweep(r, { history: gitHistory(r) })
  expect(retry.putBackUnread).toEqual([u])
  expect(retry.waitingBack).toEqual([])
  expect(await photosOf(r, 'aaa')).toEqual(['a-new'])
  expect((await json(r, 'engine-state/_photo-rejected.json'))[u]).toBeUndefined()
  process.env.AQ_PUT_BACK_ENTRIES = kept
  const restored = await sweep(r, { history: gitHistory(r) })
  expect(restored.putBack).toEqual([`${albumFile}: ${u}`])
  expect(await photosOf(r, 'aaa')).toEqual(['a-new'])
})

test.each(['page', 'album'])('pre-sweep steps keep the settled %s during a reopened clear', async destination => {
  const albumFile = 'content/gallery/aaa.json', u = url('a-new')
  const { r } = await runRepo({ aaa: destination === 'album' ? ['a-new'] : [] })
  if (destination === 'page') await page(r, 'aaa', ['a-new'])
  const settled = destination === 'page' ? A : albumFile
  const pending = settled === A ? albumFile : A
  const why = compactRejection('dead: held')
  await writeFile(join(r, SL), JSON.stringify({ [u]: {
    why, step: 'the dead-fish screen', pages: ['species/aaa'], at: today(), off: true,
    look: { said: 'clear', by: 'reviewer', on: today() }, settled: [{ file: settled, index: 0 }], left: [{ file: pending, index: 0 }],
  } }))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [u]: waitingEntry(why) }))
  process.env.AQ_PUT_BACK_ENTRIES = 'off'

  const unused = async () => { throw new Error('No source or model should be used in this test') }
  await dropFacePhotos(join(r, 'content'), join(r, 'engine-state/_photo-faces.json'), {
    get: async () => new Uint8Array(), detect: async files => files.map(() => 0),
  }, join(r, 'engine-state/_photo-rejected.json'), r)
  expect((await json(r, settled)).photos).toEqual([photo('a-new')])
  await checkPagePhotos(r, { get: unused, look: unused }, { limit: 0 })
  expect((await json(r, settled)).photos).toEqual([photo('a-new')])
  const deps: GalleryDeps = { get: unused, http: unused, look: unused, faces: unused, sleep: unused, now: () => new Date() }
  await galleries(r, deps, { sheets: 0, only: 'missing' })
  expect((await json(r, settled)).photos).toEqual([photo('a-new')])
  await sweep(r, { history: gitHistory(r) })
  expect((await json(r, settled)).photos).toEqual([photo('a-new')])
})

test('an unparseable destination keeps its clear pending and its private entry', async () => {
  const { r, git, clear } = await runRepo()
  const u = url('a-new')
  await page(r, 'aaa', ['a-new'])
  await screenDead(r, deadModel(), { limit: 48 })
  git('add', '-A'); git('commit', '-qm', 'the mark')
  await clear()
  await writeFile(join(r, A), '{')
  const res = await putBackCleared(r, gitHistory(r))
  expect(res).toEqual({ back: [], off: [], unread: [u] })
  expect((await json(r, SL))[u].left).toEqual([capturedAt(A, 0)])
  expect((await json(r, SL))[u].back).toBeUndefined()
  expect(await keptOf(u)).not.toBeNull()
})

test('history-only recovery restores the original order even for clears sorted by different URLs', async () => {
  const { r, git, clear } = await runRepo()
  const sequence = ['z-lead', 'm-body', 'a-third']
  await page(r, 'aaa', sequence)
  git('add', '-A'); git('commit', '-qm', 'photos already shown')
  process.env.AQ_PUT_BACK_ENTRIES = 'off'
  await screenDead(r, deadModel(), { limit: 48, photos: new Set(sequence.map(url)) })
  git('add', '-A'); git('commit', '-qm', 'the mark')
  await clear()
  await sweep(r, { history: gitHistory(r) })
  expect(await photosOf(r, 'aaa')).toEqual(sequence)
})

test('private entries survive an unpublished agreement and are removed after it reaches main', async () => {
  const { r, git, agree } = await runRepo()
  await page(r, 'aaa', ['a-new'])
  await screenDead(r, deadModel(), { limit: 48 })
  git('add', '-A'); git('commit', '-qm', 'the run')
  await agree()
  expect(await listAgreed(r)).toEqual([url('a-new')])
  await putBackCleared(r, gitHistory(r))
  expect(await keptOf(url('a-new'))).not.toBeNull()
  git('add', '-A'); git('commit', '-qm', 'the agreement')
  git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  await putBackCleared(r, gitHistory(r))
  expect(await keptOf(url('a-new'))).toBeNull()
})

test('an unreadable recovery entry or history leaves the marked clear pending for retry', async () => {
  const { r, git, clear } = await runRepo()
  await page(r, 'aaa', ['a-new'])
  await screenDead(r, deadModel(), { limit: 48 })
  git('add', '-A'); git('commit', '-qm', 'the run')
  await clear()
  const file = (await keptFor(url('a-new')))[0]!.file
  const saved = await readFile(file, 'utf8')
  const assertPending = async (history: History) => {
    const out = await sweep(r, { history })
    expect(out.putBackUnread).toEqual([url('a-new')])
    expect(out.putBackOff).toEqual([])
    expect(out.waitingOdd).toEqual([])
    expect((await json(r, SL))[url('a-new')].back).toBeUndefined()
    expect((await json(r, 'engine-state/_photo-rejected.json'))[url('a-new')]).toMatch(/^waiting:/)
  }
  await assertPending(async () => undefined)
  await writeFile(file, '{')
  await assertPending(gitHistory(r))
  await writeFile(file, saved)
  expect((await sweep(r, { history: gitHistory(r) })).putBack).toEqual([`${A}: ${url('a-new')}`])
})

test('a failure writing recovery data leaves the photo and its mark untouched', async () => {
  const { r } = await runRepo()
  await page(r, 'aaa', ['a-new'])
  const file = join(kept, 'not-a-directory')
  await writeFile(file, '')
  process.env.AQ_PUT_BACK_ENTRIES = file
  await expect(screenDead(r, deadModel(), { limit: 48 })).rejects.toThrow()
  expect(await photosOf(r, 'aaa')).toEqual(['a-new'])
  expect(await readFile(join(r, SL), 'utf8').catch(() => '{}')).toBe('{}')
})

test('two cleared photos go back in their original order', async () => {
  const { r, git, clear } = await runRepo()
  await page(r, 'aaa', ['z-lead', 'a-other'])
  await screenDead(r, deadModel(), { limit: 48, photos: new Set([url('z-lead'), url('a-other')]) })
  expect(await photosOf(r, 'aaa')).toEqual([])
  expect((await json(r, SL))[url('a-other')].left).toEqual([capturedAt(A, 1)])
  git('add', '-A'); git('commit', '-qm', 'the run')
  await clear()
  await sweep(r, { history: gitHistory(r) })
  expect(await photosOf(r, 'aaa')).toEqual(['z-lead', 'a-other'])
})

test('separate screenings preserve neighbors removed before the later snapshot', async () => {
  const { r, git, clear } = await runRepo()
  await page(r, 'aaa', ['a-face', 'b-dead'])
  await screenNewPhotos(join(r, 'content'), join(r, 'engine-state/_photo-faces.json'), {
    get: async u => Buffer.from(u),
    detect: async files => Promise.all(files.map(async file => (await readFile(file, 'utf8')).includes('a-face') ? 1 : 0)),
    dead: deadModel(),
  }, join(r, 'engine-state/_photo-rejected.json'), r)
  expect(await photosOf(r, 'aaa')).toEqual([])
  git('add', '-A'); git('commit', '-qm', 'both screenings')
  await clear()
  await sweep(r, { history: gitHistory(r) })
  expect(await photosOf(r, 'aaa')).toEqual(['a-face', 'b-dead'])
})

test('the first sweep removal counts once if the mark was published before the original write', async () => {
  const { r, git, clear } = await runRepo()
  const u = url('a-new')
  await page(r, 'aaa', ['a-new'])
  await screenDead(r, deadModel(), { limit: 48 })
  // Simulate the mark and private capture surviving a failed destructive write.
  await page(r, 'aaa', ['a-new'])
  git('add', '-A'); git('commit', '-qm', 'published mark with original still present')
  await sweep(r, { history: gitHistory(r) })
  expect(await photosOf(r, 'aaa')).toEqual([])
  git('add', '-A'); git('commit', '-qm', 'the first removal')
  await clear()
  await sweep(r, { history: gitHistory(r) })
  expect(await photosOf(r, 'aaa')).toEqual(['a-new'])
  expect((await json(r, SL))[u].back).toBeDefined()
})

test('the first removal of a later album copy counts from its own capture', async () => {
  const { r, git, clear } = await runRepo({ aaa: [] })
  const u = url('a-new'), albumFile = 'content/gallery/aaa.json'
  await page(r, 'aaa', ['a-new'])
  await screenDead(r, deadModel(), { limit: 48 })
  git('add', '-A'); git('commit', '-qm', 'mark and remove the page photo')
  await album(r, 'aaa', ['a-new'])
  await notePlaces(r, new Map([[u, [{ file: albumFile, index: 0, photo: photo('a-new') }]]]))
  git('add', '-A'); git('commit', '-qm', 'capture the later copy before its removal finished')
  await sweep(r, { history: gitHistory(r) })
  expect(await albumOf(r, 'aaa')).toEqual([])
  git('add', '-A'); git('commit', '-qm', 'remove the album copy for the first time')
  await clear()
  await sweep(r, { history: gitHistory(r) })
  expect(await photosOf(r, 'aaa')).toEqual(['a-new'])
  expect(await albumOf(r, 'aaa')).toEqual(['a-new'])
})

test('the published capture identifies its own metadata when checkouts mark the same place', async () => {
  const first = await runRepo()
  const second = await runRepo()
  const u = url('a-new')
  const entry = photo('a-new')
  const losing = { ...entry, caption: 'Earlier checkout' }
  const winning = { ...entry, caption: 'Published checkout' }
  for (const [run, own] of [[first, losing], [second, winning]] as const) {
    await page(run.r, 'aaa', ['a-new'])
    const entity = await json(run.r, A)
    await writeFile(join(run.r, A), JSON.stringify({ ...entity, photos: [own] }))
    await screenDead(run.r, deadModel(), { limit: 48 })
  }
  const losingRecord = (await json(first.r, SL))[u]
  const winningRecord = (await json(second.r, SL))[u]
  expect(losingRecord.left[0].capture).not.toBe(winningRecord.left[0].capture)
  second.git('add', '-A'); second.git('commit', '-qm', 'published mark')
  await second.clear()
  await sweep(second.r, { history: gitHistory(second.r) })
  expect((await json(second.r, A)).photos).toEqual([winning])
  expect(await keptFor(u)).toHaveLength(2)
  second.git('add', '-A'); second.git('commit', '-qm', 'published recovery')
  second.git('update-ref', 'refs/remotes/origin/main', 'HEAD')
  await putBackCleared(second.r, gitHistory(second.r))
  expect(await keptFor(u)).toEqual([])
})

test('the face pass captures a newly added mirror on an existing waiting mark', async () => {
  const { r, git, clear } = await runRepo()
  const source = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg'
  const mirror = `https://media.aquatome.com/${mirrorPlan(source)!.key}`
  const why = compactRejection('people: a face')
  const entry = { ...photo('a-new'), url: mirror, caption: 'Sample credit' }
  await writeFile(join(r, SL), JSON.stringify({ [source]: { why, step: 'face detection', at: today(), pages: ['species/aaa'], off: true } }))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [source]: waitingEntry(why) }))
  git('add', '-A'); git('commit', '-qm', 'the source is already waiting')
  await writeFile(join(r, A), JSON.stringify({ ...await json(r, A), photos: [entry] }))
  const none = async () => { throw new Error('The face pass needs no source or model') }
  await dropFacePhotos(join(r, 'content'), join(r, 'engine-state/_photo-faces.json'), { get: none, detect: none }, join(r, 'engine-state/_photo-rejected.json'), r)
  expect((await json(r, A)).photos).toEqual([])
  expect((await keptOf(source))!.places).toEqual({ [A]: entry })
  git('add', '-A'); git('commit', '-qm', 'the faces pass removed the new copy')
  await clear()
  await sweep(r, { history: gitHistory(r) })
  expect((await json(r, A)).photos).toEqual([entry])
})

test('gallery captures the mirrored album entry before removing it for the source URL', async () => {
  const { r, git, clear } = await runRepo()
  const source = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Example.jpg/1280px-Example.jpg'
  const mirrored = `https://media.aquatome.com/${mirrorPlan(source)!.key}`
  const data = { ...photo('a-new'), source: undefined, licence: 'CC BY 4.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg' }
  const entry = { ...data, url: mirrored, caption: 'Album version' }
  await page(r, 'aaa', ['a-new'])
  await writeFile(join(r, A), JSON.stringify({ ...await json(r, A), photos: [{ ...data, url: source }] }))
  await album(r, 'aaa', [])
  const galleryFile = 'content/gallery/aaa.json'
  await writeFile(join(r, galleryFile), JSON.stringify({ ...await json(r, galleryFile), photos: [entry] }))
  await screenDead(r, deadModel(), { limit: 48 })

  const unused = async () => { throw new Error('The gallery cleanup needs no source or model') }
  const deps: GalleryDeps = { get: unused, http: unused, look: unused, faces: unused, sleep: unused, now: () => new Date() }
  await galleries(r, deps, { sheets: 0, only: 'missing' })
  expect((await json(r, galleryFile)).photos).toEqual([])
  expect((await keptOf(source))?.places[galleryFile]).toEqual(entry)
  git('add', '-A'); git('commit', '-qm', 'screened and cleaned the album')
  await clear()
  await sweep(r, { history: gitHistory(r) })
  expect((await json(r, galleryFile)).photos).toEqual([entry])
})

test('a later independent removal stands even when only the private entry saw the original place', async () => {
  const { r, git, clear } = await runRepo()
  await page(r, 'aaa', ['a-new'])
  await screenDead(r, deadModel(), { limit: 48 })
  git('add', '-A'); git('commit', '-qm', 'the run')
  await page(r, 'aaa', ['a-new'])
  git('commit', '-qam', 'another appearance')
  await page(r, 'aaa', [])
  git('commit', '-qam', 'a later removal')
  await clear()
  const out = await sweep(r, { history: gitHistory(r) })
  expect(out.putBack).toEqual([])
  expect(out.putBackOff).toEqual([`${url('a-new')}: it left ${A} again after it came back, and that removal stands`])
  expect(await photosOf(r, 'aaa')).toEqual([])
})

test('places go only on a record marked off with no answer, once a file, and a record already there takes them too', async () => {
  const r = await store({})
  const at = today()
  await writeFile(join(r, SL), JSON.stringify({
    [url('m')]: { why, step: 'the photo check', pages: ['species/aaa'], at, off: true },
    [url('h')]: { why, step: 'the photo check', pages: ['species/aaa'], at },
    [url('c')]: { why, step: 'the photo check', pages: ['species/aaa'], at, off: true, look: { said: 'clear', by: 'the chief of staff', on: at } },
  }))
  const place = (n: string, file: string, index: number) => ({ file, index, photo: photo(n) })
  await notePlaces(r, new Map([
    [url('m'), [place('m', A, 2)]],
    [url('h'), [place('h', A, 0)]],
    [url('c'), [place('c', A, 0)]],
    [url('x'), [place('x', A, 0)]],
  ]))
  await notePlaces(r, new Map([[url('m'), [place('m', A, 5), place('m', 'content/gallery/aaa.json', 1)]]]))
  const sl = await json(r, SL)
  expect(sl[url('m')].left).toEqual([capturedAt(A, 2), capturedAt('content/gallery/aaa.json', 1)])
  expect((await keptOf(url('m'))).places).toEqual({ [A]: photo('m'), 'content/gallery/aaa.json': photo('m') })
  for (const n of ['h', 'c', 'x']) expect(await keptOf(url(n))).toBeNull()
  expect(sl[url('h')].left).toBeUndefined()
  expect(sl[url('c')].left).toBeUndefined()
  expect(sl[url('x')]).toBeUndefined()
})

test('independent checkouts keep different private places for the same marked photo', async () => {
  const one = await store({}), two = await store({})
  const u = url('shared')
  const mark = { why, step: 'the photo check', pages: ['species/aaa'], at: today(), off: true }
  await Promise.all([one, two].map(r => writeFile(join(r, SL), JSON.stringify({ [u]: mark }))))
  const page = { file: A, index: 0, photo: photo('shared') }
  const album = { file: 'content/gallery/aaa.json', index: 2, photo: { ...photo('shared'), caption: 'An album entry' } }
  await Promise.all([
    notePlaces(one, new Map([[u, [page]]])),
    notePlaces(two, new Map([[u, [album]]])),
  ])
  expect((await keptOf(u))!.places).toEqual({ [page.file]: page.photo, [album.file]: album.photo })
  expect((await json(one, SL))[u].left).toEqual([capturedAt(A, 0)])
  expect((await json(two, SL))[u].left).toEqual([capturedAt(album.file, 2)])
})

test("the history, along main's own line: a place that showed it at the mark and that a later run emptied counts; not one emptied before the mark or one it came to after; a parallel removal once, a merge's own removal, and a renamed page's old file", async () => {
  const today = new Date().toISOString().slice(0, 10)
  const sorted = (p: LeftPlace[] | undefined) => p?.sort((a, b) => a.file.localeCompare(b.file))
  // Taken off bbb by hand in the morning, then off aaa at its first verdict, and off eee in the next run on its waiting
  // entry (as a mark written by hand leaves it); later it shows on ccc and is taken off there by hand. aaa and eee are
  // the mark's; bbb and ccc aren't.
  const one = await repo('aq-put-back-before-')
  await one.put('content/species/aaa/entity.json', ent(['a1', 'g-dead'])); await one.put('content/species/bbb/entity.json', ent(['b1', 'g-dead'])); await one.put('content/species/eee/entity.json', ent(['e1', 'g-dead'])); await one.put(SL, {})
  one.git('add', '.'); one.git('commit', '-qm', 'pages')
  await one.put('content/species/bbb/entity.json', ent(['b1'])); one.git('commit', '-qam', 'off bbb by hand')
  await one.put('content/species/aaa/entity.json', ent(['a1'])); await one.put(SL, marked()); one.git('commit', '-qam', 'off at its first verdict')
  await one.put('content/species/eee/entity.json', ent(['e1'])); one.git('commit', '-qam', 'the next run, on its waiting entry')
  await one.put('content/species/ccc/entity.json', ent(['c1', 'g-dead'])); one.git('add', '.'); one.git('commit', '-qm', 'on ccc')
  await one.put('content/species/ccc/entity.json', ent(['c1'])); one.git('commit', '-qam', 'off ccc by hand')
  expect.soft(sorted(await gitHistory(one.r)(url('g-dead'), today))).toMatchObject([
    { file: 'content/species/aaa/entity.json', index: 1, photo: photo('g-dead'), times: 1 },
    { file: 'content/species/eee/entity.json', index: 1, photo: photo('g-dead'), times: 1 },
  ])
  // Not marked off at all: nothing of its history is the mark's.
  expect.soft(await gitHistory(one.r)(url('b1'), today)).toEqual([])

  // The same removal on a branch merged in, each side with a page of its own: it left aaa once.
  const two = await repo('aq-put-back-parallel-')
  await two.put('content/species/aaa/entity.json', ent(['a1', 'g-dead', 'a2'])); await two.put(SL, {})
  two.git('add', '.'); two.git('commit', '-qm', 'pages'); two.git('branch', 'side')
  await two.put('content/species/aaa/entity.json', ent(['a1', 'a2'])); await two.put('content/species/yyy/entity.json', ent(['y1'])); await two.put(SL, marked()); two.git('add', '.'); two.git('commit', '-qm', 'off at its first verdict')
  two.git('checkout', '-q', 'side')
  await two.put('content/species/aaa/entity.json', ent(['a1', 'a2'])); await two.put('content/species/zzz/entity.json', ent(['z1'])); two.git('add', '.'); two.git('commit', '-qm', 'the same removal elsewhere')
  two.git('checkout', '-q', 'main'); two.git('merge', '-q', '--no-edit', 'side')
  expect.soft(await gitHistory(two.r)(url('g-dead'), today)).toMatchObject([{ file: 'content/species/aaa/entity.json', index: 1, photo: photo('g-dead'), times: 1 }])

  // Off aaa at the mark, made in a merge; it shows on bbb only after; a later merge takes it off bbb and ddd, which showed
  // it at the mark. The merges' own removals count, from places that showed it at the mark: aaa and ddd.
  const three = await repo('aq-put-back-merge-')
  await three.put('content/species/aaa/entity.json', ent(['a1', 'g-dead'])); await three.put('content/species/ddd/entity.json', ent(['d1', 'g-dead'])); await three.put(SL, {})
  three.git('add', '.'); three.git('commit', '-qm', 'pages')
  const merging = async (branch: string, page: string, change: () => Promise<void>) => {
    three.git('checkout', '-q', '-b', branch)
    await three.put(`content/species/${page}/entity.json`, ent([`${page}1`])); three.git('add', '.'); three.git('commit', '-qm', `a page elsewhere, ${page}`)
    three.git('checkout', '-q', 'main'); three.git('merge', '-q', '--no-ff', '--no-commit', branch)
    await change(); three.git('add', '.'); three.git('commit', '-qm', `merge ${branch}`)
  }
  await merging('side', 'zzz', async () => { await three.put('content/species/aaa/entity.json', ent(['a1'])); await three.put(SL, marked()) })
  await three.put('content/species/bbb/entity.json', ent(['b1', 'g-dead'])); three.git('add', '.'); three.git('commit', '-qm', 'on bbb')
  await merging('later', 'yyy', async () => { await three.put('content/species/bbb/entity.json', ent(['b1'])); await three.put('content/species/ddd/entity.json', ent(['d1'])) })
  expect.soft(sorted(await gitHistory(three.r)(url('g-dead'), today))).toMatchObject([
    { file: 'content/species/aaa/entity.json', index: 1, photo: photo('g-dead'), times: 1 },
    { file: 'content/species/ddd/entity.json', index: 1, photo: photo('g-dead'), times: 1 },
  ])

  // Its page renamed in the commit that took it off: the old file is the place it left (the put-back reports it gone).
  const four = await repo('aq-put-back-rename-')
  await four.put('content/species/aaa/entity.json', ent(['a1', 'a2', 'a3', 'g-dead'])); await four.put(SL, {})
  four.git('add', '.'); four.git('commit', '-qm', 'pages')
  four.git('mv', 'content/species/aaa', 'content/species/aab')
  await four.put('content/species/aab/entity.json', ent(['a1', 'a2', 'a3'])); await four.put(SL, marked()); four.git('add', '.'); four.git('commit', '-qm', 'renamed, and off at its first verdict')
  expect.soft(await gitHistory(four.r)(url('g-dead'), today)).toMatchObject([{ file: 'content/species/aaa/entity.json', index: 3, photo: photo('g-dead'), times: 1 }])
})

// A guide's part photo and frame the guides' dead-fish screen took off (guides-dead.ts), cleared by a person's look.
const stockPage = 'https://commons.wikimedia.org/wiki/File:Example.jpg'
const stock = { ...photo('s-dead'), sourceUrl: stockPage }
const frame = { url: url('f-dead'), t: 60, width: 1280, height: 720 }
const guideAfter = { id: 'ggg', photos: [], video: { figures: [{ heading: 'one', moments: [{ url: url('f-live'), t: 30, width: 1280, height: 720 }] }, { heading: 'two', moments: [] }] } }
const guideBefore = { id: 'ggg', photos: [], video: { figures: [{ heading: 'one', photo: stock, moments: [{ url: url('f-live'), t: 30, width: 1280, height: 720 }] }, { heading: 'two', moments: [frame] }] } }
const hashOf = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`

test("a guide's part photo and frame a person cleared go back to their parts, and leave the part-photo list for that guide; an entry for every guide stays", async () => {
  const r = await store({})
  const G = 'content/guides/ggg/entity.json'
  await mkdir(join(r, 'content/guides/ggg'), { recursive: true })
  await writeFile(join(r, G), `${JSON.stringify(guideAfter, null, 2)}\n`)
  const rec = { why, step: 'the dead-fish screen', pages: ['guides/ggg'], at: '2026-11-26', off: true, look: { said: 'clear', by: 'the chief of staff', on: '2026-11-27' } }
  await writeFile(join(r, SL), JSON.stringify({ [stock.url]: rec, [frame.url]: rec }))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [stock.url]: waitingEntry(why), [frame.url]: waitingEntry(why) }))
  const byHand = 'https://commons.wikimedia.org/wiki/File:Other.jpg'
  await writeFile(join(r, 'engine-state/_part-photos-off.json'), JSON.stringify({ [hashOf(stockPage)]: { why, guides: ['ggg', 'hhh'] }, [frame.url]: { why, guides: ['ggg'], seconds: [60] }, [byHand]: { why: 'by hand' } }))
  const history: History = async u => (u === stock.url
    ? [{ file: G, index: -1, photo: stock, times: 1, path: ['video', 'figures', 0, 'photo'] }]
    : [{ file: G, index: 0, photo: frame, times: 1, path: ['video', 'figures', 1, 'moments'] }])
  const out = await putBackCleared(r, history, '2026-11-27')
  expect(out.back.sort()).toEqual([`${G}: ${frame.url}`, `${G}: ${stock.url}`].sort())
  expect(await json(r, G)).toEqual(guideBefore)
  expect(await json(r, 'engine-state/_part-photos-off.json')).toEqual({ [hashOf(stockPage)]: { why, guides: ['hhh'] }, [byHand]: { why: 'by hand' } })
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({})
  // A part that's gone (the guide written again) is reported, and nothing is put in its place.
  await writeFile(join(r, G), `${JSON.stringify({ id: 'ggg', photos: [], video: { figures: [] } }, null, 2)}\n`)
  await writeFile(join(r, SL), JSON.stringify({ [frame.url]: rec }))
  expect((await putBackCleared(r, history, '2026-11-27')).off).toEqual([`${frame.url}: its part of ${G} is gone`])
})

test("a guide's part is found by its heading: one a step dropped once it had no picture comes back at its place, and a part that moved up takes its own picture back", async () => {
  const r = await store({})
  const G = 'content/guides/ggg/entity.json'
  await mkdir(join(r, 'content/guides/ggg'), { recursive: true })
  // Part two, left with no picture, was dropped (stripPhotos), and part three moved up to its place.
  const three = { url: url('f-three'), t: 90, width: 1280, height: 720 }
  const now = { id: 'ggg', photos: [], video: { figures: [{ heading: 'one', moments: [] }, { heading: 'three', moments: [] }] } }
  await writeFile(join(r, G), `${JSON.stringify(now, null, 2)}\n`)
  const rec = { why, step: 'the guide photo check', pages: ['guides/ggg'], at: '2026-11-26', off: true, look: { said: 'clear', by: 'the chief of staff', on: '2026-11-27' } }
  await writeFile(join(r, SL), JSON.stringify({ [frame.url]: rec, [three.url]: rec }))
  const history: History = async u => (u === frame.url
    ? [{ file: G, index: 0, photo: frame, times: 1, path: ['video', 'figures', 1, 'moments'], heading: 'two' }]
    : [{ file: G, index: 0, photo: three, times: 1, path: ['video', 'figures', 2, 'moments'], heading: 'three' }])
  expect((await putBackCleared(r, history, '2026-11-27')).back).toHaveLength(2)
  expect((await json(r, G)).video.figures).toEqual([{ heading: 'one', moments: [] }, { heading: 'two', moments: [frame] }, { heading: 'three', moments: [three] }])
})

test("a same-cycle stock photo and frame return from private recovery even if their original part was dropped", async () => {
  // Taken off in the run that brought them: no commit showed them, so history has no place for either.
  const r = await store({})
  const G = 'content/guides/ggg/entity.json'
  await mkdir(join(r, 'content/guides/ggg'), { recursive: true })
  await writeFile(join(r, G), `${JSON.stringify(guideBefore, null, 2)}\n`)
  // Another guide's entry on the same stock photo stays.
  await writeFile(join(r, 'engine-state/_part-photos-off.json'), JSON.stringify({ [hashOf(stockPage)]: { why, guides: ['hhh'] } }))
  await takeOffGuidesDead(r, new Map([[stock.url, 'a fish on a board'], [frame.url, 'a fish on a board']]), 'the dead-fish screen')
  const marked = await json(r, SL)
  expect(marked[stock.url].parts).toEqual([hashOf(stockPage)])
  expect(marked[frame.url].parts).toEqual([frame.url])
  expect(Object.keys(await json(r, 'engine-state/_part-photos-off.json')).sort()).toEqual([frame.url, hashOf(stockPage)].sort())
  expect(marked[stock.url].left).toEqual([{ ...capturedAt(G, -1), path: ['video', 'figures', 0, 'photo'] }])
  expect(marked[frame.url].left).toEqual([{ ...capturedAt(G, 0), path: ['video', 'figures', 1, 'moments'] }])
  expect(await readFile(join(r, SL), 'utf8')).not.toContain(stock.author)
  await writeFile(join(r, G), JSON.stringify({ ...guideAfter, video: { figures: [guideAfter.video.figures[0]] } }))
  const on = new Date().toISOString().slice(0, 10)
  for (const u of [stock.url, frame.url]) marked[u].look = { said: 'clear', by: 'the chief of staff', on }
  await writeFile(join(r, SL), JSON.stringify(marked))
  const out = await putBackCleared(r, async () => [])
  expect(out.back.sort()).toEqual([`${G}: ${frame.url}`, `${G}: ${stock.url}`].sort())
  expect(await json(r, G)).toEqual(guideBefore)
  expect(await json(r, 'engine-state/_part-photos-off.json')).toEqual({ [hashOf(stockPage)]: { why, guides: ['hhh'] } })
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({})
})

test("the history from git finds a guide's part photo and frame where they stood, by their part", async () => {
  const { r, git, put } = await repo('aq-put-back-guide-')
  const G = 'content/guides/ggg/entity.json'
  await put(G, guideBefore); await put(SL, {})
  git('add', '.'); git('commit', '-qm', 'guide')
  const today = new Date().toISOString().slice(0, 10)
  const rec = { why, step: 'the dead-fish screen', pages: ['guides/ggg'], at: today, off: true }
  await put(G, guideAfter); await put(SL, { [stock.url]: rec, [frame.url]: rec }); git('commit', '-qam', 'off')
  expect(await gitHistory(r)(stock.url, today)).toMatchObject([{ file: G, index: -1, photo: stock, times: 1, path: ['video', 'figures', 0, 'photo'], heading: 'one' }])
  expect(await gitHistory(r)(frame.url, today)).toMatchObject([{ file: G, index: 0, photo: frame, times: 1, path: ['video', 'figures', 1, 'moments'], heading: 'two' }])
  // A later step drops the part left with no picture; once cleared, the frame goes back under its heading.
  await put(G, { ...guideAfter, video: { figures: [guideAfter.video.figures[0]] } }); git('commit', '-qam', 'empty part dropped')
  await put(SL, { [frame.url]: { ...rec, look: { said: 'clear', by: 'the chief of staff', on: today } } }); git('commit', '-qam', 'cleared')
  expect((await putBackCleared(r, gitHistory(r), today)).back).toEqual([`${G}: ${frame.url}`])
  expect((await json(r, G)).video.figures).toEqual([guideAfter.video.figures[0], { heading: 'two', moments: [frame] }])
})
