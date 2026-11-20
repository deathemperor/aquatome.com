import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { unlistCleared } from '../src/last-photo'
import { checkPagePhotos, type PhotoCheckDeps, type PhotoVerdict } from '../src/photo-check'

// The hold protects a photo a page already shows (the chief of staff, 20 Nov 2026, amending the rule of 14 Nov). A photo a
// step adds that the check calls dead, a person or a logo before any page showed it doesn't start showing, on an emptied
// page or as a page's only photo: it comes off and waits for a second look. On 20 Nov an emptied page's fill brought a dead
// fish that the old rule then held as the page's only photo, and readers saw it.
const jpeg = sharp({ create: { width: 64, height: 48, channels: 3, background: '#e83' } }).jpeg().toBuffer()
const url = (n: string) => `https://media.example/${n}.webp`
const photo = (n: string) => ({ url: url(n), thumb: url(`${n}-480`), width: 960, height: 720, licence: 'x', author: 'x', sourceUrl: 'x' })
const name = (u: string) => u.split('/').pop()!.replace('.webp', '')

/** A checkout as the cycle runs in: each page with the photos it showed, committed, as the run began. */
async function checkout(pages: Record<string, string[]>) {
  const r = await mkdtemp(join(tmpdir(), 'aq-unshown-'))
  await mkdir(join(r, 'engine-state'))
  await mkdir(join(r, 'docs/review'), { recursive: true })
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  for (const [id, ns] of Object.entries(pages)) await page(r, id, ns)
  const git = (...a: string[]) => execFileSync('git', a, { cwd: r, stdio: 'ignore' })
  git('init', '-q')
  git('add', '-A')
  git('-c', 'user.name=Sample Tester', '-c', 'user.email=tester@example.org', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'the run begins')
  return r
}
async function page(r: string, id: string, ns: string[]) {
  const dir = join(r, 'content/species', id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'entity.json'), `${JSON.stringify({ id, scientificName: `${id} fish`, photos: ns.map(photo) }, null, 2)}\n`)
  await writeFile(join(dir, 'vi.json'), JSON.stringify({ name: id }))
}
const json = async (r: string, f: string) => JSON.parse(await readFile(join(r, f), 'utf8'))
const photosOf = async (r: string, id: string) => ((await json(r, `content/species/${id}/entity.json`)).photos as { url: string }[]).map(p => name(p.url))

/** A model that answers from a table: photo name → verdict (unlisted: a typical "yes"). */
function model(table: Record<string, Partial<PhotoVerdict>>): PhotoCheckDeps {
  let fetched: string[] = []
  return {
    get: async u => { fetched.push(name(u)); return new Uint8Array(await jpeg) },
    look: async () => {
      const photos = fetched
      fetched = []
      return { photos: photos.map((p, i) => ({ n: i + 1, ok: 'yes', typical: true, note: p, person: false, ...table[p] }) as { n: number } & PhotoVerdict) }
    },
  }
}
const dead = { ok: 'dead', typical: false, note: 'a fish lying on a board' } as const

test('an emptied page the fill refills with a photo the check calls dead shows nothing, and the photo waits on the second look; one a page already showed is held as before', async () => {
  // aaa was emptied in an earlier run; bbb showed its photo when this run began.
  const r = await checkout({ aaa: [], bbb: ['b-dead'] })
  // This run's fill step brings aaa a photo from its source, and ccc a person and a logo.
  await page(r, 'aaa', ['a-dead'])
  await page(r, 'ccc', ['c-hand', 'c-logo'])
  const out = await checkPagePhotos(r, model({ 'a-dead': dead, 'b-dead': dead, 'c-hand': { person: true, note: 'held in a hand' }, 'c-logo': { logo: true, note: 'a logo' } }), { limit: 10 })
  expect(await photosOf(r, 'aaa')).toEqual([])
  expect(await photosOf(r, 'ccc')).toEqual([])
  expect(await photosOf(r, 'bbb')).toEqual(['b-dead'])
  expect(out.heads.held).toEqual([`species/bbb: ${url('b-dead')}`])
  expect(out.unshown.sort()).toEqual([`species/aaa: ${url('a-dead')}`, `species/ccc: ${url('c-hand')}`, `species/ccc: ${url('c-logo')}`])
  const sl = await json(r, 'engine-state/_photo-second-look.json')
  expect(Object.keys(sl).sort()).toEqual([url('a-dead'), url('b-dead'), url('c-hand'), url('c-logo')])
  expect(sl[url('a-dead')]).toMatchObject({ step: 'the photo check', pages: ['species/aaa'], unshown: true })
  expect(sl[url('a-dead')].why).toMatch(/^dead: withheld \[sha256:[0-9a-f]{64}\]$/)
  expect(sl[url('b-dead')].unshown).toBeUndefined()
  // The never-again list, which every step that adds photos skips, keeps the three from coming back; the held one isn't on it.
  expect(Object.keys(await json(r, 'engine-state/_photo-rejected.json')).sort()).toEqual([url('a-dead'), url('c-hand'), url('c-logo')])
  // Brought back by a step all the same, it comes off again in the next run; the held one stays, waiting for its look.
  await page(r, 'aaa', ['a-dead'])
  const again = await checkPagePhotos(r, model({}), { limit: 10 })
  expect(await photosOf(r, 'aaa')).toEqual([])
  expect(await photosOf(r, 'bbb')).toEqual(['b-dead'])
  expect(again.unshown).toEqual([`species/aaa: ${url('a-dead')}`])
})

test('a held page keeps what it showed and loses only the photo it never showed; a photo shown on another page is held there and here', async () => {
  const r = await checkout({ ddd: ['d-dead'], eee: ['shared'] })
  await page(r, 'ddd', ['d-dead', 'd-new'])
  await page(r, 'fff', ['shared'])
  const out = await checkPagePhotos(r, model({ 'd-dead': dead, 'd-new': dead, shared: dead }), { limit: 10 })
  expect(await photosOf(r, 'ddd')).toEqual(['d-dead'])
  expect(await photosOf(r, 'eee')).toEqual(['shared'])
  expect(await photosOf(r, 'fff')).toEqual(['shared'])
  expect(out.unshown).toEqual([`species/ddd: ${url('d-new')}`])
  expect(Object.keys(await json(r, 'engine-state/_photo-rejected.json'))).toEqual([url('d-new')])
})

test('where the start can\'t be told (no repository), every photo counts as shown: held as before', async () => {
  const r = await mkdtemp(join(tmpdir(), 'aq-unshown-norepo-'))
  await mkdir(join(r, 'engine-state'))
  await mkdir(join(r, 'docs/review'), { recursive: true })
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  await page(r, 'aaa', ['a-dead'])
  const out = await checkPagePhotos(r, model({ 'a-dead': dead }), { limit: 10 })
  expect(await photosOf(r, 'aaa')).toEqual(['a-dead'])
  expect(out.unshown).toEqual([])
  expect(out.heads.held).toEqual([`species/aaa: ${url('a-dead')}`])
})

test('a photo the second look marks as never shown comes off the page that holds it now, onto the never-again list, and waits for its look', async () => {
  // How the ones held before this rule, never shown before their verdict, stop showing: their records are marked.
  const r = await checkout({ ggg: ['g-dead'] })
  await writeFile(join(r, 'engine-state/_photo-second-look.json'), JSON.stringify({ [url('g-dead')]: { why: 'dead: withheld [sha256:0]', step: 'the photo check', pages: ['species/ggg'], at: '2026-11-20', unshown: true } }))
  const out = await checkPagePhotos(r, model({ 'g-dead': dead }), { limit: 10 })
  expect(await photosOf(r, 'ggg')).toEqual([])
  expect(out.heads.held).toEqual([])
  expect(out.unshown).toEqual([`species/ggg: ${url('g-dead')}`])
  const listed = await json(r, 'engine-state/_photo-rejected.json')
  expect(Object.keys(listed)).toEqual([url('g-dead')])
  expect(listed[url('g-dead')]).toMatch(/^dead: /)
  expect((await json(r, 'engine-state/_photo-second-look.json'))[url('g-dead')]).toMatchObject({ unshown: true, pages: ['species/ggg'] })
})

test('a second look that clears a photo taken off before it was shown takes it off the never-again list; an agree or no answer keeps it there', async () => {
  const r = await mkdtemp(join(tmpdir(), 'aq-unshown-clear-'))
  await mkdir(join(r, 'engine-state'))
  const rec = (n: string, look?: object) => ({ why: 'dead: withheld [sha256:0]', step: 'the photo check', pages: [`species/${n}`], at: '2026-11-20', unshown: true, ...(look ? { look } : {}) })
  await writeFile(join(r, 'engine-state/_photo-second-look.json'), JSON.stringify({
    [url('cleared')]: rec('cleared', { said: 'clear', by: 'the chief of staff', on: '2026-11-21' }),
    [url('agreed')]: rec('agreed', { said: 'agree', by: 'the chief of staff', on: '2026-11-21' }),
    [url('waits')]: rec('waits'),
    // A clear on a photo held where a page showed it touches no list.
    [url('shown')]: { ...rec('shown', { said: 'clear', by: 'the chief of staff', on: '2026-11-21' }), unshown: undefined },
  }))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [url('cleared')]: 'dead: withheld [sha256:0]', [url('agreed')]: 'dead: withheld [sha256:0]', [url('waits')]: 'dead: withheld [sha256:0]', [url('shown')]: 'watermark: a hand-listed logo' }))
  expect(await unlistCleared(r)).toEqual([url('cleared')])
  expect(Object.keys(await json(r, 'engine-state/_photo-rejected.json')).sort()).toEqual([url('agreed'), url('shown'), url('waits')])
  expect(await unlistCleared(r)).toEqual([])
})
