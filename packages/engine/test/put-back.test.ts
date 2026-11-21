import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { screenDead, type DeadScreenDeps } from '../src/dead-screen'
import { dropFacePhotos } from '../src/faces'
import { gitHistory, waitingEntry, type History, type LeftPlace } from '../src/last-photo'
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
  { file: 'content/species/aaa/entity.json', index: 1, photo: photo('a-dead') },
  { file: 'content/gallery/aaa.json', index: 0, photo: photo('a-dead') },
]
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

test('a page that already shows the photo again keeps it once; a page that is gone is skipped', async () => {
  const r = await clearedStore()
  await page(r, 'aaa', ['a-dead', 'a-fish', 'a-other'])
  const out = await sweep(r, { history: async () => [...left, { file: 'content/species/gone/entity.json', index: 0, photo: photo('a-dead') }] })
  expect(await photosOf(r, 'aaa')).toEqual(['a-dead', 'a-fish', 'a-other'])
  expect(out.putBack).toEqual([`content/gallery/aaa.json: ${url('a-dead')}`])
})

test('the history from git: each page and album file the photo left, its place and entry just before, the latest leaving file by file', async () => {
  const r = await mkdtemp(join(tmpdir(), 'aq-put-back-git-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: r, encoding: 'utf8' })
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@example.org'); git('config', 'user.name', 'Sample Tester')
  const ent = (ns: string[]) => ({ photos: ns.map(photo) })
  const put = async (f: string, d: object) => { await mkdir(join(r, f, '..'), { recursive: true }); await writeFile(join(r, f), `${JSON.stringify(d, null, 2)}\n`) }
  await put('content/species/ggg/entity.json', ent(['g1', 'g-dead', 'g2'])); await put('content/gallery/ggg.json', ent(['g-dead'])); await put('content/species/hhh/entity.json', ent(['h1']))
  git('add', '.'); git('commit', '-qm', 'pages')
  // Off its page and album at its first verdict; back on the page by a step, and off it again later.
  await put('content/species/ggg/entity.json', ent(['g1', 'g2'])); await put('content/gallery/ggg.json', ent([])); git('commit', '-qam', 'off')
  await put('content/species/ggg/entity.json', ent(['g-dead', 'g1', 'g2'])); git('commit', '-qam', 'back by a step')
  await put('content/species/ggg/entity.json', ent(['g1', 'g2'])); await put('content/species/hhh/entity.json', ent(['h1', 'h2'])); git('commit', '-qam', 'off again')
  const places = await gitHistory(r)(url('g-dead'), new Date().toISOString().slice(0, 10))
  expect(places?.sort((a, b) => a.file.localeCompare(b.file))).toEqual([
    { file: 'content/gallery/ggg.json', index: 0, photo: photo('g-dead') },
    { file: 'content/species/ggg/entity.json', index: 0, photo: photo('g-dead') },
  ])
  // Not a repository: nothing to read.
  expect(await gitHistory(await mkdtemp(join(tmpdir(), 'aq-put-back-none-')))(url('g-dead'), '2026-11-20')).toBeUndefined()
})
