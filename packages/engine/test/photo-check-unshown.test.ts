import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { screenDead, type DeadScreenDeps } from '../src/dead-screen'
import { dropFacePhotos } from '../src/faces'
import { listAgreed, listsDisagree, unlistCleared, waitingEntry } from '../src/last-photo'
import { compactRejection } from '../src/photo-observations'
import { checkPagePhotos, type PhotoCheckDeps, type PhotoVerdict } from '../src/photo-check'
import { sweep } from '../src/sweep'

// What the last-photo hold protects is a photo that PASSED the check before (the chief of staff, 20 Nov 2026, amending
// the rule of 14 Nov). A photo's first verdict of dead or a person, on a photo that never passed, takes it off every page,
// even a page's last photo, and it waits for a second look marked on both lists. On 20 Nov an emptied fish page took a
// new photo from its source, the check called it dead in the same run, and the hold kept it as the page's only photo.
const jpeg = sharp({ create: { width: 64, height: 48, channels: 3, background: '#e83' } }).jpeg().toBuffer()
const url = (n: string) => `https://media.aquatome.com/seriouslyfish/${n}.webp`
const photo = (n: string) => ({ url: url(n), width: 1200, height: 800, licence: 'dùng với sự cho phép', author: 'Seriously Fish', sourceUrl: 'https://www.seriouslyfish.com/x', source: 'seriouslyfish' })
const name = (u: string) => u.split('/').pop()!.replace('.webp', '')
const fish = (id: string, photos: object[]) => ({ id, scientificName: `${id} fish`, order: 'O', family: 'F', genus: id, group: 'g', places: [], dataCard: {}, sections: [], photos, videos: [], productSlots: [], updatedAt: '2026-10-01' })
/** A pass from before the check asked about people: the check asks it again. */
const oldPass = { ok: 'yes', typical: true, note: 'a live fish' }

async function store(pages: Record<string, string[]>, subjects: Record<string, Record<string, object>> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'aq-first-off-'))
  const c = join(root, 'content')
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await mkdir(join(root, 'docs/review'), { recursive: true })
  await mkdir(join(c, 'gallery'), { recursive: true })
  await copyFile(new URL('../../../content/sources.json', import.meta.url), join(c, 'sources.json'))
  for (const [id, ns] of Object.entries(pages)) await page(root, id, ns)
  await writeFile(join(root, 'engine-state/_photo-subjects.json'), JSON.stringify(Object.fromEntries(Object.entries(subjects).map(([n, by]) => [url(n), by]))))
  return root
}
async function page(root: string, id: string, ns: string[]) {
  const dir = join(root, 'content/species', id)
  await mkdir(dir, { recursive: true })
  await writeFile(join(dir, 'entity.json'), `${JSON.stringify(fish(id, ns.map(photo)), null, 2)}\n`)
  await writeFile(join(dir, 'vi.json'), JSON.stringify({ slug: id, name: id, altNames: [], sections: {}, quality: { score: 0.9, indexable: true } }))
}
const json = async (r: string, f: string) => JSON.parse(await readFile(join(r, f), 'utf8').catch(() => '{}'))
const photosOf = async (r: string, id: string) => ((await json(r, `content/species/${id}/entity.json`)).photos as { url: string }[]).map(p => name(p.url))

/** A model that answers from a table: photo name → verdict (unlisted: a typical "yes"). */
function model(table: Record<string, Partial<PhotoVerdict>>): PhotoCheckDeps {
  let fetched: string[] = []
  return {
    get: async u => { fetched.push(name(u)); return new Uint8Array(await jpeg) },
    look: async () => {
      const photos = fetched
      fetched = []
      return { photos: photos.map((p, i) => ({ n: i + 1, ok: 'yes', typical: true, note: p, person: false, logo: false, ...table[p] }) as { n: number } & PhotoVerdict) }
    },
  }
}
const dead = { ok: 'dead', typical: false, note: 'a fish lying on a board' } as const
const hashOf = (why: string) => /\[sha256:([0-9a-f]{64})\]$/.exec(why)?.[1]

test('an emptied page the fill refills with a photo the check calls dead shows nothing, and the photo waits for a second look marked on both lists; a photo that passed before is held as before', async () => {
  // aaa was emptied; this run's fill brings it a photo the check has never judged. bbb's only photo passed before. ccc
  // takes a photo of a person; ddd a photo with a logo, which stays under the rule of 14 Nov.
  const r = await store({ aaa: ['a-dead'], bbb: ['b-dead'], ccc: ['c-hand'], ddd: ['d-logo'] }, { 'b-dead': { bbb: oldPass } })
  const out = await checkPagePhotos(r, model({ 'a-dead': dead, 'b-dead': dead, 'c-hand': { person: true, note: 'held in a hand' }, 'd-logo': { logo: true, note: 'a logo' } }), { limit: 10 })
  expect(await photosOf(r, 'aaa')).toEqual([])
  expect(await photosOf(r, 'ccc')).toEqual([])
  expect(await photosOf(r, 'bbb')).toEqual(['b-dead'])
  expect(await photosOf(r, 'ddd')).toEqual(['d-logo'])
  expect(out.heads.held.sort()).toEqual([`species/bbb: ${url('b-dead')}`, `species/ddd: ${url('d-logo')}`])
  expect(out.firstOff.sort()).toEqual([`species/aaa: ${url('a-dead')}`, `species/ccc: ${url('c-hand')}`])
  // Marked on the second look, with the pages it left.
  const sl = await json(r, 'engine-state/_photo-second-look.json')
  expect(Object.keys(sl).sort()).toEqual([url('a-dead'), url('b-dead'), url('c-hand'), url('d-logo')])
  expect(sl[url('a-dead')]).toMatchObject({ step: 'the photo check', pages: ['species/aaa'], off: true })
  expect(sl[url('a-dead')].why).toMatch(/^dead: withheld \[sha256:[0-9a-f]{64}\]$/)
  expect(sl[url('c-hand')]).toMatchObject({ pages: ['species/ccc'], off: true })
  expect(sl[url('b-dead')].off).toBeUndefined()
  expect(sl[url('d-logo')].off).toBeUndefined()
  // Marked on the never-again list, which every step that adds photos skips: its waiting entry has the record's hash. Not
  // counted refused; the held photos aren't on it.
  const listed = await json(r, 'engine-state/_photo-rejected.json')
  expect(listed).toEqual({ [url('a-dead')]: waitingEntry(sl[url('a-dead')].why), [url('c-hand')]: waitingEntry(sl[url('c-hand')].why) })
  expect(listed[url('a-dead')]).toMatch(/^waiting: withheld \[sha256:[0-9a-f]{64}\]$/)
  expect(hashOf(listed[url('a-dead')])).toBe(hashOf(sl[url('a-dead')].why))
  expect(out.rejected).toBe(0)
  expect(out.blocked).toEqual([])
  // Brought back all the same, it comes off again in the next run and the page isn't held.
  await page(r, 'aaa', ['a-dead'])
  const again = await checkPagePhotos(r, model({}), { limit: 10 })
  expect(await photosOf(r, 'aaa')).toEqual([])
  expect(again.heads.held).not.toContain(`species/aaa: ${url('a-dead')}`)
  expect(await photosOf(r, 'bbb')).toEqual(['b-dead'])
})

test('a held page keeps the photo that passed before and loses the one judged for the first time; a photo that passed on another page is held here too', async () => {
  const r = await store({ eee: ['e-old', 'e-new'], fff: ['shared'], ggg: ['shared'] }, { 'e-old': { eee: oldPass }, shared: { fff: oldPass } })
  const out = await checkPagePhotos(r, model({ 'e-old': dead, 'e-new': dead, shared: dead }), { limit: 10 })
  expect(await photosOf(r, 'eee')).toEqual(['e-old'])
  expect(await photosOf(r, 'fff')).toEqual(['shared'])
  expect(await photosOf(r, 'ggg')).toEqual(['shared'])
  expect(out.firstOff).toEqual([`species/eee: ${url('e-new')}`])
  expect(Object.keys(await json(r, 'engine-state/_photo-rejected.json'))).toEqual([url('e-new')])
})

test('a first verdict on a page that keeps other photos goes as before: off, on the never-again list as dead, no second look', async () => {
  const r = await store({ hhh: ['h-dead', 'h-fish'] })
  const out = await checkPagePhotos(r, model({ 'h-dead': dead }), { limit: 10 })
  expect(await photosOf(r, 'hhh')).toEqual(['h-fish'])
  expect(out.firstOff).toEqual([])
  expect(out.rejected).toBe(1)
  expect((await json(r, 'engine-state/_photo-rejected.json'))[url('h-dead')]).toMatch(/^dead: /)
  expect(await json(r, 'engine-state/_photo-second-look.json')).toEqual({})
})

test('a dead verdict given before the rule, on a page\'s only photo, is held as before: the rule acts on new verdicts only', async () => {
  // A verdict the check kept from an earlier run (it asked about people, so it isn't asked again).
  const r = await store({ rrr: ['r-dead'] }, { 'r-dead': { rrr: { ok: 'dead', typical: false, person: false, logo: false, note: 'on ice' } } })
  const out = await checkPagePhotos(r, model({}), { limit: 10 })
  expect(await photosOf(r, 'rrr')).toEqual(['r-dead'])
  expect(out.firstOff).toEqual([])
  expect(out.heads.held).toEqual([`species/rrr: ${url('r-dead')}`])
})

test("the dead-fish screen's first verdict on a page's only photo that never passed takes it off, marked; one that passed before is held", async () => {
  const r = await store({ iii: ['i-dead'], jjj: ['j-dead'] })
  // jjj's photo passed the check's first version, which didn't ask about dead fish, so the screen still looks at it.
  await writeFile(join(r, 'engine-state/_photo-check.json'), JSON.stringify({ [url('j-dead')]: { ok: 'yes', typical: true, note: 'a live fish' } }))
  let sheet: string[] = []
  const d: DeadScreenDeps = {
    get: async u => { sheet.push(u); return new Uint8Array(await sharp({ create: { width: 480, height: 360, channels: 3, background: '#468' } }).png().toBuffer()) },
    look: async () => { const tiles = sheet.map((u, i) => ({ n: i + 1, dead: /-dead\.webp$/.test(u), note: 'a fish on a board' })); sheet = []; return { tiles } },
  }
  const out = await screenDead(r, d, { limit: 48 })
  expect(await photosOf(r, 'iii')).toEqual([])
  expect(await photosOf(r, 'jjj')).toEqual(['j-dead'])
  expect(out.firstOff).toEqual([`${url('i-dead')}: species/iii`])
  expect(out.held).toEqual([`${url('j-dead')}: species/jjj`])
  expect(out.dead).toEqual([])
  const sl = await json(r, 'engine-state/_photo-second-look.json')
  expect(sl[url('i-dead')]).toMatchObject({ step: 'the dead-fish screen', pages: ['species/iii'], off: true })
  expect(sl[url('j-dead')].off).toBeUndefined()
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({ [url('i-dead')]: waitingEntry(sl[url('i-dead')].why) })
})

test("the face screen's first verdict on a page's only photo that never passed takes it off, marked; one that passed before is held", async () => {
  const r = await store({ kkk: ['k-face'], lll: ['l-face'] }, { 'l-face': { lll: { ...oldPass, person: false } } })
  const faces = join(r, 'engine-state/_photo-faces.json')
  const deps = { get: async (u: string) => new TextEncoder().encode(u), detect: async (files: string[]) => files.map(() => 1) }
  const out = await dropFacePhotos(join(r, 'content'), faces, deps, join(r, 'engine-state/_photo-rejected.json'), r)
  expect(await photosOf(r, 'kkk')).toEqual([])
  expect(await photosOf(r, 'lll')).toEqual(['l-face'])
  expect(out.firstOff).toEqual([`${url('k-face')}: species/kkk`])
  expect(out.held).toEqual([`${url('l-face')}: species/lll`])
  const sl = await json(r, 'engine-state/_photo-second-look.json')
  expect(sl[url('k-face')]).toMatchObject({ step: 'face detection', pages: ['species/kkk'], off: true })
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({ [url('k-face')]: waitingEntry(sl[url('k-face')].why) })
  // A face found in an earlier run, on what is now a page's only photo, is held as before: the rule acts on new verdicts only.
  await page(r, 'kkk', ['k-face'])
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), '{}')
  const { [url('k-face')]: _, ...rest } = sl
  await writeFile(join(r, 'engine-state/_photo-second-look.json'), JSON.stringify(rest))
  const later = await dropFacePhotos(join(r, 'content'), faces, deps, join(r, 'engine-state/_photo-rejected.json'), r)
  expect(await photosOf(r, 'kkk')).toEqual(['k-face'])
  expect(later.firstOff).toEqual([])
  expect(later.held).toContain(`${url('k-face')}: species/kkk`)
})

test("a clear takes the waiting entry off the never-again list and the photo can come back at the next run; an agree gives the entry the verdict's own reason and the record leaves", async () => {
  const r = await store({ mmm: ['m-dead'], nnn: ['n-dead'] })
  await checkPagePhotos(r, model({ 'm-dead': dead, 'n-dead': dead }), { limit: 10 })
  const file = join(r, 'engine-state/_photo-second-look.json')
  const sl = await json(r, 'engine-state/_photo-second-look.json')
  const why = { m: sl[url('m-dead')].why, n: sl[url('n-dead')].why }
  sl[url('m-dead')].look = { said: 'clear', by: 'the chief of staff', on: '2026-11-21' }
  sl[url('n-dead')].look = { said: 'agree', by: 'the chief of staff', on: '2026-11-21' }
  await writeFile(file, JSON.stringify(sl))
  expect(await listAgreed(r)).toEqual([url('n-dead')])
  expect(await unlistCleared(r)).toEqual([url('m-dead')])
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({ [url('n-dead')]: why.n })
  expect(Object.keys(await json(r, 'engine-state/_photo-second-look.json'))).toEqual([url('m-dead')])
  expect(why.m).toMatch(/^dead: /)
  // The next run brings the cleared photo back, and no verdict takes it off again.
  await page(r, 'mmm', ['m-dead'])
  await checkPagePhotos(r, model({}), { limit: 10 })
  expect(await photosOf(r, 'mmm')).toEqual(['m-dead'])
})

test("while the second look and the never-again list disagree on a marked photo, the sweep takes nothing off on the list's word", async () => {
  const r = await store({ ooo: ['o-listed', 'o-fish'], ppp: ['p-dead'] })
  const rec = { why: compactRejection('dead: a fish on a board'), step: 'the photo check', pages: ['species/ppp'], at: '2026-11-20', off: true }
  await writeFile(join(r, 'engine-state/_photo-second-look.json'), JSON.stringify({ [url('p-dead')]: rec }))
  // The marked photo's waiting entry is missing: the lists disagree.
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [url('o-listed')]: compactRejection('dead: on ice') }))
  expect(listsDisagree(await json(r, 'engine-state/_photo-second-look.json'), await json(r, 'engine-state/_photo-rejected.json'))).toEqual([`${url('p-dead')}: marked on the second look, not waiting on the never-again list`])
  const first = await sweep(r)
  expect(first.disagree).toHaveLength(1)
  expect(await photosOf(r, 'ooo')).toEqual(['o-listed', 'o-fish'])
  // A waiting entry with no record disagrees too.
  expect(listsDisagree({}, { [url('q')]: waitingEntry(rec.why) })).toEqual([`${url('q')}: waiting on the never-again list, not marked on the second look`])
  // Once they agree, the list's photos come off.
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [url('o-listed')]: compactRejection('dead: on ice'), [url('p-dead')]: waitingEntry(rec.why) }))
  const second = await sweep(r)
  expect(second.disagree).toEqual([])
  expect(await photosOf(r, 'ooo')).toEqual(['o-fish'])
  expect(await photosOf(r, 'ppp')).toEqual([])
})
