import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, onTestFinished, test, vi } from 'vitest'
import { mirrorPlan, photoWaitsFor } from '@aq/schema'
import { screenDead, type DeadScreenDeps } from '../src/dead-screen'
import { dropFacePhotos } from '../src/faces'
import { listAgreed, unlistCleared, waitingEntry } from '../src/last-photo'
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
  vi.stubEnv('AQ_PUT_BACK_ENTRIES', join(root, 'private-put-back'))
  onTestFinished(() => { vi.unstubAllEnvs() })
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

test('a failed rejection write leaves the new subject verdict unpublished', async () => {
  const r = await store({ aaa: ['a-dead', 'a-live'] })
  await mkdir(join(r, 'engine-state/_photo-rejected.json'))
  await expect(checkPagePhotos(r, model({ 'a-dead': dead }), { limit: 10 })).rejects.toThrow()
  expect((await json(r, 'engine-state/_photo-subjects.json'))[url('a-dead')]).toBeUndefined()
  expect(await photosOf(r, 'aaa')).toEqual(['a-dead', 'a-live'])
})

test.each(['dead-fish look', 'public host'])('the photo check and sweep keep a last passed photo when its sibling is withheld by the %s rule', async why => {
  const setSibling = async (root: string) => {
    if (why !== 'public host') return
    const p = photo('a-pending')
    const original = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Sample.jpg'
    const wrapper = {
      ...p,
      altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'f'.repeat(64) }],
      original: { url: original, width: p.width, height: p.height },
    }
    await writeFile(join(root, 'content/species/aaa/entity.json'), JSON.stringify(fish('aaa', [photo('a-dead'), wrapper])))
    await writeFile(join(root, 'engine-state/_dead-screen.json'), JSON.stringify({ [url('a-dead')]: { dead: false }, [p.url]: { dead: false }, [original]: { dead: false } }))
    await writeFile(join(root, 'engine-state/_photo-rejected.json'), JSON.stringify({ [p.url]: 'dead: withheld' }))
  }
  const r = await store({ aaa: ['a-dead', 'a-pending'] }, { 'a-dead': { aaa: oldPass } })
  const state = (name: string, record: object) => writeFile(join(r, 'engine-state', name), JSON.stringify(record))
  if (why === 'dead-fish look') await state('_photo-dead-owed.json', { [url('a-pending')]: '2026-11-26' })
  await state('_dead-screen.json', { [url('a-dead')]: { dead: false } })
  await setSibling(r)
  const out = await checkPagePhotos(r, model({ 'a-dead': dead }), { limit: 1, emptyCap: 0 })
  expect(out.heads.held).toContain(`species/aaa: ${url('a-dead')}`)
  expect(await photosOf(r, 'aaa')).toContain('a-dead')

  const independent = await store({ aaa: ['a-dead', 'a-pending'] }, { 'a-dead': { aaa: { ...dead, logo: false } } })
  await writeFile(join(independent, 'engine-state/_dead-screen.json'), JSON.stringify({ [url('a-dead')]: { dead: false } }))
  await setSibling(independent)
  const swept = await sweep(independent, { history: async () => [] })
  expect(swept.refusedHeld.some(row => row.startsWith('species/aaa'))).toBe(true)
  expect(await photosOf(independent, 'aaa')).toContain('a-dead')
})

test.each(['photo check', 'sweep'])('the %s holds the last visible photo if multiple non-commercial siblings would remain', async step => {
  const r = await store({ aaa: ['a-dead'] }, { 'a-dead': { aaa: step === 'sweep' ? { ...dead, logo: false, person: false } : oldPass } })
  const nc = [41, 42].map(id => ({
    url: `https://media.aquatome.com/inaturalist/${id}.webp`, width: 1200, height: 800,
    sourceUrl: `https://www.inaturalist.org/photos/${id}`, licence: 'CC BY-NC 4.0', author: 'Sample Tester',
  }))
  const own = [photo('a-dead'), ...nc]
  await writeFile(join(r, 'content/species/aaa/entity.json'), JSON.stringify(fish('aaa', own)))
  await writeFile(join(r, 'engine-state/_dead-screen.json'), JSON.stringify(Object.fromEntries(own.map(p => [p.url, { dead: false }]))))
  await writeFile(join(r, 'engine-state/_photo-faces.json'), JSON.stringify(Object.fromEntries(own.map(p => [p.url, 0]))))
  if (step === 'photo check') {
    const out = await checkPagePhotos(r, model({ 'a-dead': dead }), { limit: 1, emptyCap: 0 })
    expect(out.heads.held).toContain(`species/aaa: ${url('a-dead')}`)
  } else {
    const out = await sweep(r, { history: async () => [] })
    expect(out.refusedHeld.some(row => row.startsWith('species/aaa'))).toBe(true)
  }
  expect((await photosOf(r, 'aaa'))[0]).toBe('a-dead')
})

test('a verdict on the stored photo holds the last visible original if the edit would delete both', async () => {
  const r = await store({ aaa: ['altered'] })
  const original = photo('original')
  const altered = {
    ...photo('altered'), altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'd'.repeat(64) }],
    original: { url: original.url, width: original.width, height: original.height },
  }
  const file = 'content/species/aaa/entity.json'
  await writeFile(join(r, file), JSON.stringify(fish('aaa', [altered])))
  const checked = await checkPagePhotos(r, model({ altered: { ok: 'other', typical: false } }), { limit: 10, emptyCap: 0 })
  expect(checked.heads.held).toContain(`species/aaa: ${altered.url}`)
  expect((await json(r, file)).photos).toEqual([altered])
})

test.each([[false, false], [true, false], [false, true], [true, true]])('another page’s refusal holds a last original (alteration also refused: %s, mirror: %s)', async (both, mirror) => {
  const r = await store({ aaa: ['altered'], bbb: ['original', 'b-live'] })
  const source = mirror ? 'https://upload.wikimedia.org/wikipedia/commons/a/ab/original.webp' : url('original')
  const original = { ...photo('original'), url: mirror ? `https://media.aquatome.com/${mirrorPlan(source)!.key}` : source }
  await writeFile(join(r, 'content/species/bbb/entity.json'), JSON.stringify(fish('bbb', [{ ...photo('original'), url: source }, photo('b-live')])))
  await writeFile(join(r, 'engine-state/_photo-subjects.json'), JSON.stringify({ [original.url]: { bbb: oldPass } }))
  const altered = {
    ...photo('altered'), altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'c'.repeat(64) }],
    original: { url: original.url, width: original.width, height: original.height },
  }
  const file = 'content/species/aaa/entity.json'
  await writeFile(join(r, file), JSON.stringify(fish('aaa', [altered])))
  const checked = await checkPagePhotos(r, model({ original: dead, ...(both ? { altered: dead } : {}) }), { limit: 10, emptyCap: 0 })
  expect(checked.heads.held).toContain(`species/aaa: ${altered.url}`)
  expect((await json(r, 'engine-state/_photo-second-look.json'))[source]).toMatchObject({
    why: expect.stringMatching(/^dead:/), pages: ['species/aaa'],
  })
  expect((await json(r, 'engine-state/_photo-rejected.json'))[source]).toBeUndefined()
  expect((await json(r, file)).photos).toEqual([altered])
  expect(await photosOf(r, 'bbb')).toEqual(['b-live'])
})

test('one photo check keeps a fallback original marked off for recovery alongside its rejected alteration', async () => {
  const r = await store({ aaa: ['altered', 'a-live'], bbb: ['original'] })
  const original = photo('original')
  const altered = {
    ...photo('altered'), altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'e'.repeat(64) }],
    original: { url: original.url, width: original.width, height: original.height },
  }
  const afile = 'content/species/aaa/entity.json', album = 'content/gallery/aaa.json'
  await writeFile(join(r, afile), JSON.stringify(fish('aaa', [altered, photo('a-live')])))
  await writeFile(join(r, album), JSON.stringify({ id: 'aaa', photos: [altered], seen: 1, updatedAt: '2026-11-26' }))
  const checked = await checkPagePhotos(r, model({ altered: dead, original: dead }), { limit: 10, emptyCap: 0 })
  expect(checked.firstOff).toContain(`species/bbb: ${original.url}`)
  expect((await json(r, afile)).photos).toContainEqual(altered)
  expect((await json(r, album)).photos).toContainEqual(altered)
  expect((await json(r, 'engine-state/_photo-rejected.json'))[original.url]).toMatch(/^waiting: /)
})

test('a first dead verdict with a watermark withholds the bare original for the same review', async () => {
  const r = await store({ aaa: ['wrapper'], bbb: ['original'] })
  const original = photo('original')
  const wrapper = { ...photo('wrapper'), altered: [{ method: 'lanczos3-upscale' }], original }
  await writeFile(join(r, 'content/species/aaa/entity.json'), JSON.stringify(fish('aaa', [wrapper])))
  const report = await checkPagePhotos(r, model({ wrapper: { ...dead, logo: true } }), { limit: 10, emptyCap: 0 })

  expect(report.firstOff).toHaveLength(1)
  const marks = await json(r, 'engine-state/_photo-second-look.json')
  expect(marks[wrapper.url]).toMatchObject({ why: expect.stringMatching(/^watermark:/), off: true,
    pages: ['species/aaa', 'species/bbb'], originals: [original.url] })
  const waits = photoWaitsFor({ secondLook: marks })
  expect(waits(original.url)).toBe(true)
  expect(waits(wrapper.url)).toBe(true)
})

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

test("on a page only first verdicts empty, its album's first-verdict photos wait marked like the page's own; on a page that keeps a photo, its album's go on the never-again list as before", async () => {
  // The chief of staff, 21 Nov 2026 (the put-back's second point, (a)): those album photos are the page's last hope of a
  // picture, the same reason the page's own wait.
  const r = await store({ mmm: ['m-dead'], nnn: ['n-dead', 'n-fish'] })
  const album = (id: string, ns: string[]) => writeFile(join(r, `content/gallery/${id}.json`), `${JSON.stringify({ id, photos: ns.map(photo), seen: 1, updatedAt: '2026-11-21' }, null, 2)}\n`)
  await album('mmm', ['m-album-dead', 'm-album-fish'])
  await album('nnn', ['n-album-dead'])
  const out = await checkPagePhotos(r, model({ 'm-dead': dead, 'm-album-dead': dead, 'n-dead': dead, 'n-album-dead': dead }), { limit: 10 })
  const albumOf = async (id: string) => ((await json(r, `content/gallery/${id}.json`)).photos as { url: string }[]).map(p => name(p.url))
  expect(await photosOf(r, 'mmm')).toEqual([])
  expect(await albumOf('mmm')).toEqual(['m-album-fish'])
  expect(out.firstOff.sort()).toEqual([`species/mmm: ${url('m-album-dead')}`, `species/mmm: ${url('m-dead')}`])
  const sl = await json(r, 'engine-state/_photo-second-look.json')
  expect(Object.keys(sl).sort()).toEqual([url('m-album-dead'), url('m-dead')])
  expect(sl[url('m-album-dead')]).toMatchObject({ step: 'the photo check', pages: ['species/mmm'], off: true })
  // The page that keeps a photo: its own dead and its album's dead go as before, listed dead with no second look.
  expect(await photosOf(r, 'nnn')).toEqual(['n-fish'])
  expect(await albumOf('nnn')).toEqual([])
  const listed = await json(r, 'engine-state/_photo-rejected.json')
  expect(listed[url('m-dead')]).toBe(waitingEntry(sl[url('m-dead')].why))
  expect(listed[url('m-album-dead')]).toBe(waitingEntry(sl[url('m-album-dead')].why))
  expect(listed[url('n-dead')]).toMatch(/^dead: /)
  expect(listed[url('n-album-dead')]).toMatch(/^dead: /)
  expect(out.rejected).toBe(2)
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

test('one photo on two pages, the only photo on one and one of several on the other: it comes off both, as one waiting record, not a refusal on one page and a wait on the other', async () => {
  const r = await store({ jjj: ['j-dead'], kkk: ['j-dead', 'k-fish'] })
  const out = await checkPagePhotos(r, model({ 'j-dead': dead }), { limit: 10 })
  expect(await photosOf(r, 'jjj')).toEqual([])
  expect(await photosOf(r, 'kkk')).toEqual(['k-fish'])
  expect(out.firstOff).toEqual([`species/jjj: ${url('j-dead')}`])
  expect(out.rejected).toBe(0)
  // One record, naming the page it would have emptied, and its waiting entry: nothing refuses it outright.
  const sl = await json(r, 'engine-state/_photo-second-look.json')
  expect(Object.keys(sl)).toEqual([url('j-dead')])
  expect(sl[url('j-dead')]).toMatchObject({ step: 'the photo check', pages: ['species/jjj'], off: true })
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({ [url('j-dead')]: waitingEntry(sl[url('j-dead')].why) })
})

test.each([false, true])('the other address of a first refusal joins the same wait (different verdict: %s)', async mixed => {
  const r = await store({ jjj: [], kkk: [] })
  const source = 'https://live.staticflickr.com/123/456_abc.jpg'
  const mirror = `https://media.aquatome.com/${mirrorPlan(source)!.key}`
  await writeFile(join(r, 'content/species/jjj/entity.json'), JSON.stringify(fish('jjj', [{ ...photo('mirror'), url: mirror }])))
  await writeFile(join(r, 'content/species/kkk/entity.json'), JSON.stringify(fish('kkk', [{ ...photo('source'), url: source }, photo('live')])))

  await checkPagePhotos(r, model({ [name(source)]: dead, [name(mirror)]: mixed ? { person: true } : dead }), { limit: 10 })

  const marks = await json(r, 'engine-state/_photo-second-look.json')
  expect(marks[mirror]).toMatchObject({ pages: ['species/jjj'], off: true })
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({ [mirror]: waitingEntry(marks[mirror].why) })
})

test('retrying a source copy under its mirror’s wait makes no new rejection', async () => {
  const r = await store({ jjj: [], kkk: [] }, { live: { kkk: { ...oldPass, logo: false, person: false } } })
  const source = 'https://live.staticflickr.com/123/456_abc.jpg'
  const mirror = `https://media.aquatome.com/${mirrorPlan(source)!.key}`
  const mark = { why: compactRejection('dead: sample'), pages: ['species/jjj'], at: '2026-11-26', step: 'the photo check', off: true }
  await writeFile(join(r, 'content/species/kkk/entity.json'), JSON.stringify(fish('kkk', [{ ...photo('source'), url: source }, photo('live')])))
  await writeFile(join(r, 'engine-state/_photo-second-look.json'), JSON.stringify({ [mirror]: mark }))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [mirror]: waitingEntry(mark.why) }))
  const unused = async () => { throw new Error('The waiting source copy needs no additional look') }

  const result = await checkPagePhotos(r, { get: unused, look: unused }, { limit: 10 })

  expect(result.failed).toEqual([])
  expect(await photosOf(r, 'kkk')).toEqual(['live'])
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({ [mirror]: waitingEntry(mark.why) })
})

test('a new source refusal preserves a mirror wrapper carrying a separately eligible original', async () => {
  const r = await store({ jjj: [], kkk: [] })
  const source = 'https://live.staticflickr.com/123/456_abc.jpg'
  const mirror = `https://media.aquatome.com/${mirrorPlan(source)!.key}`
  const original = photo('original')
  const stored = { ...photo('altered'), url: mirror, altered: [{ method: 'lanczos3-upscale' }],
    original: { url: original.url, width: original.width, height: original.height } }
  const file = 'content/species/jjj/entity.json'
  await writeFile(join(r, file), JSON.stringify(fish('jjj', [stored, photo('second-live')])))
  await writeFile(join(r, 'content/species/kkk/entity.json'), JSON.stringify(fish('kkk', [{ ...photo('source'), url: source }, photo('live')])))
  await checkPagePhotos(r, model({ [name(source)]: dead }), { limit: 10 })
  expect((await json(r, file)).photos).toContainEqual(stored)
  expect((await json(r, 'engine-state/_photo-rejected.json'))[source]).toMatch(/^dead: /)
})

test('a durable first refusal preserves a separately eligible original when the rejection write failed', async () => {
  const r = await store({ jjj: [] })
  const source = 'https://live.staticflickr.com/123/456_abc.jpg'
  const mirror = `https://media.aquatome.com/${mirrorPlan(source)!.key}`
  const original = photo('original')
  const stored = { ...photo('altered'), url: mirror, altered: [{ method: 'lanczos3-upscale' }],
    original: { url: original.url, width: original.width, height: original.height } }
  const file = 'content/species/jjj/entity.json'
  await writeFile(join(r, file), JSON.stringify(fish('jjj', [stored])))
  await writeFile(join(r, 'engine-state/_photo-second-look.json'), JSON.stringify({
    [source]: { why: compactRejection('dead: sample'), pages: ['species/kkk'], at: '2026-11-26', step: 'the photo check', off: true },
  }))
  await checkPagePhotos(r, model({}), { limit: 10 })
  expect((await json(r, file)).photos).toEqual([stored])
})

test.each(['photo check', 'sweep'])('the %s holds the last visible album photo even with an unchecked sibling', async step => {
  const r = await store({ jjj: [] }, {
    visible: { jjj: { ...oldPass, ok: 'other', person: false, logo: false } },
  })
  const file = 'content/gallery/jjj.json'
  await writeFile(join(r, file), JSON.stringify({ id: 'jjj', seen: 2, updatedAt: '2026-11-26', photos: [photo('visible'), { ...photo('pending'), unchecked: true }] }))

  if (step === 'photo check') await checkPagePhotos(r, model({}), { limit: 0 })
  else await sweep(r)

  expect((await json(r, file)).photos.map((p: { url: string }) => p.url)).toEqual([url('visible'), url('pending')])
  expect((await json(r, 'engine-state/_photo-second-look.json'))[url('visible')]).toMatchObject({ pages: ['species/jjj'] })
})

test('a dead verdict given before the rule, on a page\'s only photo, is held as before: the rule acts on new verdicts only', async () => {
  // A verdict the check kept from an earlier run (it asked about people, so it isn't asked again).
  const r = await store({ rrr: ['r-dead'] }, { 'r-dead': { rrr: { ok: 'dead', typical: false, person: false, logo: false, note: 'on ice' } } })
  const out = await checkPagePhotos(r, model({}), { limit: 10 })
  expect(await photosOf(r, 'rrr')).toEqual(['r-dead'])
  expect(out.firstOff).toEqual([])
  expect(out.heads.held).toEqual([`species/rrr: ${url('r-dead')}`])
})

test("a fresh verdict of anything else beside an old dead verdict isn't a first verdict: the photo is held as before", async () => {
  // x-old's dead verdict on aaa is from before; this run judges it on bbb for the first time, and calls it a live fish.
  const r = await store({ aaa: ['x-old'], bbb: ['x-old', 'b-fish'] }, { 'x-old': { aaa: { ...dead, person: false, logo: false } } })
  const out = await checkPagePhotos(r, model({}), { limit: 10 })
  expect(out.judged).toBeGreaterThan(0)
  expect(await photosOf(r, 'aaa')).toEqual(['x-old'])
  expect(out.firstOff).toEqual([])
  expect(out.heads.held).toContain(`species/aaa: ${url('x-old')}`)
  expect((await json(r, 'engine-state/_photo-second-look.json'))[url('x-old')]?.off).toBeUndefined()
})

test("a hold on another reason with no answer doesn't keep a photo from its first verdict: it comes off and its record takes the mark", async () => {
  // Each page's only photo is held for a mark (the watermark screen's hold), and has never passed the check.
  const r = await store({ aaa: ['a-mark'], bbb: ['b-mark'], ccc: ['c-mark'], ddd: ['d-mark'] }, { 'd-mark': { ddd: oldPass } })
  const markHold = (id: string) => ({ why: compactRejection('watermark: a logo bottom left'), step: 'the watermark screen', pages: [`species/${id}`], at: '2026-11-19' })
  const holds = { [url('a-mark')]: markHold('aaa'), [url('b-mark')]: markHold('bbb'), [url('c-mark')]: markHold('ccc'), [url('d-mark')]: markHold('ddd') }
  await writeFile(join(r, 'engine-state/_photo-second-look.json'), JSON.stringify(holds))
  // The dead-fish screen on b-mark and the face screen on c-mark, which run before the check has judged them.
  let sheet: string[] = []
  const d: DeadScreenDeps = {
    get: async u => { sheet.push(u); return new Uint8Array(await sharp({ create: { width: 480, height: 360, channels: 3, background: '#468' } }).png().toBuffer()) },
    look: async () => { const tiles = sheet.map((u, i) => ({ n: i + 1, dead: /b-mark\.webp$/.test(u), note: 'a fish on a board' })); sheet = []; return { tiles } },
  }
  const dead2 = await screenDead(r, d, { limit: 48 })
  expect(dead2.firstOff).toEqual([`${url('b-mark')}: species/bbb`])
  expect(await photosOf(r, 'bbb')).toEqual([])
  const faces = await dropFacePhotos(join(r, 'content'), join(r, 'engine-state/_photo-faces.json'), { get: async (u: string) => new TextEncoder().encode(u), detect: async (files: string[]) => Promise.all(files.map(async f => ((await readFile(f, 'utf8')).includes('c-mark') ? 1 : 0))) }, join(r, 'engine-state/_photo-rejected.json'), r)
  expect(faces.firstOff).toEqual([`${url('c-mark')}: species/ccc`])
  expect(await photosOf(r, 'ccc')).toEqual([])
  let sl = await json(r, 'engine-state/_photo-second-look.json')
  // The check: a-mark is a dead fish; d-mark passed before, so its dead verdict leaves it held.
  const out = await checkPagePhotos(r, model({ 'a-mark': dead, 'd-mark': dead }), { limit: 10 })
  expect(await photosOf(r, 'aaa')).toEqual([])
  expect(await photosOf(r, 'ddd')).toEqual(['d-mark'])
  expect(out.firstOff).toEqual([`species/aaa: ${url('a-mark')}`])
  sl = await json(r, 'engine-state/_photo-second-look.json')
  expect(sl[url('a-mark')]).toMatchObject({ step: 'the photo check', pages: ['species/aaa'], off: true })
  expect(sl[url('a-mark')].why).toMatch(/^dead: /)
  expect(sl[url('d-mark')]).toEqual(holds[url('d-mark')])
  expect((await json(r, 'engine-state/_photo-rejected.json'))[url('a-mark')]).toBe(waitingEntry(sl[url('a-mark')].why))
  sl = await json(r, 'engine-state/_photo-second-look.json')
  expect(sl[url('b-mark')]).toMatchObject({ step: 'the dead-fish screen', off: true })
  expect(sl[url('c-mark')]).toMatchObject({ step: 'face detection', off: true })
  const listed = await json(r, 'engine-state/_photo-rejected.json')
  expect(listed[url('b-mark')]).toBe(waitingEntry(sl[url('b-mark')].why))
  expect(listed[url('c-mark')]).toBe(waitingEntry(sl[url('c-mark')].why))
})

test('a photo marked off at its first verdict whose waiting entry is missing comes off a page with other photos in the next check', async () => {
  const r = await store({ eee: ['e-back', 'e-fish'] }, { 'e-back': { eee: { ...dead, person: false, logo: false } } })
  await writeFile(join(r, 'engine-state/_photo-second-look.json'), JSON.stringify({ [url('e-back')]: { why: compactRejection('dead: a fish on a board'), step: 'the photo check', pages: ['species/zzz'], at: '2026-11-20', off: true } }))
  await checkPagePhotos(r, model({}), { limit: 10 })
  expect(await photosOf(r, 'eee')).toEqual(['e-fish'])
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

test("a face found now on a photo that never passed, on a page that keeps others, goes on the never-again list: the sweep takes its album copy, and after a reread a hold on another reason doesn't keep it", async () => {
  const r = await store({ fff: ['f-face', 'f-fish'] })
  // f-face is in fff's album too, and held for a mark with no answer.
  await writeFile(join(r, 'content/gallery/fff.json'), `${JSON.stringify({ id: 'fff', photos: [photo('f-face')], seen: 1, updatedAt: '2026-11-20' }, null, 2)}\n`)
  await writeFile(join(r, 'engine-state/_photo-second-look.json'), JSON.stringify({ [url('f-face')]: { why: compactRejection('watermark: a logo bottom left'), step: 'the watermark screen', pages: ['species/fff'], at: '2026-11-19' } }))
  const rej = join(r, 'engine-state/_photo-rejected.json')
  const deps = { get: async (u: string) => new TextEncoder().encode(u), detect: async (files: string[]) => Promise.all(files.map(async f => ((await readFile(f, 'utf8')).includes('f-face') ? 1 : 0))) }
  const out = await dropFacePhotos(join(r, 'content'), join(r, 'engine-state/_photo-faces.json'), deps, rej, r)
  expect(await photosOf(r, 'fff')).toEqual(['f-fish'])
  expect(out.firstOff).toEqual([])
  expect((await json(r, 'engine-state/_photo-rejected.json'))[url('f-face')]).toMatch(/^people: withheld \[sha256:[0-9a-f]{64}\]$/)
  await sweep(r)
  expect(((await json(r, 'content/gallery/fff.json')).photos as { url: string }[]).map(p => name(p.url))).toEqual([])
  // A reread of its source puts it back on the page: it comes off again.
  await page(r, 'fff', ['f-face', 'f-fish'])
  await dropFacePhotos(join(r, 'content'), join(r, 'engine-state/_photo-faces.json'), deps, rej, r)
  expect(await photosOf(r, 'fff')).toEqual(['f-fish'])
})

test("a photo marked off whose never-again entry is a mark the shop's own kept is off all the same; an agree makes the entry the verdict's own", async () => {
  const r = await store({ ggg: ['g-fish'] })
  const g = 'https://media.aquatome.com/glaser/g-dead.webp'
  const file = join(r, 'content/species/ggg/entity.json')
  const withG = async () => { const e = JSON.parse(await readFile(file, 'utf8')); e.photos.push({ ...photo('x'), url: g, source: 'glaser', author: 'Aquarium Glaser', sourceUrl: 'https://www.aquariumglaser.de/x' }); await writeFile(file, `${JSON.stringify(e, null, 2)}\n`) }
  await withG()
  await writeFile(join(r, 'engine-state/_photo-watermarks.json'), JSON.stringify({ [g]: { ocr: [], watermark: true, kind: 'logo', retainedOwnMark: { source: 'glaser', sourceUrl: 'https://www.aquariumglaser.de/x', owner: 'source' } } }))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [g]: compactRejection('watermark: the shop logo') }))
  const rec = { why: compactRejection('dead: a fish on a board'), step: 'the photo check', pages: ['species/ggg'], at: '2026-11-20', off: true }
  await writeFile(join(r, 'engine-state/_photo-second-look.json'), JSON.stringify({ [g]: rec }))
  const out = await sweep(r)
  const shownOn = async () => ((await json(r, 'content/species/ggg/entity.json')).photos as { url: string }[]).map(p => p.url)
  expect(await shownOn()).toEqual([url('g-fish')])
  expect(out.waitingOdd).toEqual([`${g}: its never-again entry is another kind's, left in force`])
  await writeFile(join(r, 'engine-state/_photo-second-look.json'), JSON.stringify({ [g]: { ...rec, look: { said: 'agree', by: 'the chief of staff', on: '2026-11-20' } } }))
  await sweep(r)
  expect((await json(r, 'engine-state/_photo-rejected.json'))[g]).toBe(rec.why)
  expect(await json(r, 'engine-state/_photo-second-look.json')).toEqual({})
  // Put back on the page, it comes off: a dead fish's entry, which no kept mark lifts.
  await withG()
  await sweep(r)
  expect(await shownOn()).toEqual([url('g-fish')])
})

test("a refused photo a glossary term borrowed from a fish page leaves the term too; a kind left with no photo has no record", async () => {
  const r = await store({ sss: ['s-dead', 's-fish'] })
  const term = join(r, 'content/glossary/term')
  await mkdir(term, { recursive: true })
  await writeFile(join(term, 'entity.json'), `${JSON.stringify({ id: 'term', en: 'term', photos: [photo('s-dead')], kinds: [{ id: 'one', photo: photo('s-dead') }, { id: 'two', photo: photo('s-fish') }] }, null, 2)}\n`)
  const other = join(r, 'content/glossary/other')
  await mkdir(other, { recursive: true })
  await writeFile(join(other, 'entity.json'), `${JSON.stringify({ id: 'other', en: 'other', kinds: [{ id: 'only', photo: photo('s-dead') }] }, null, 2)}\n`)
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [url('s-dead')]: compactRejection('dead: a fish on a board') }))
  await sweep(r)
  expect(await photosOf(r, 'sss')).toEqual(['s-fish'])
  const t = await json(r, 'content/glossary/term/entity.json')
  expect(t.photos).toEqual([])
  expect(t.kinds.map((k: { id: string; photo: { url: string } }) => [k.id, name(k.photo.url)])).toEqual([['two', 's-fish']])
  expect('kinds' in (await json(r, 'content/glossary/other/entity.json'))).toBe(false)
})

test("an agree on a photo marked off whose waiting entry is for another reason makes the entry the record's reason", async () => {
  const r = await store({ hhh: ['h-fish'] })
  const rec = { why: compactRejection('dead: a fish on a board'), step: 'the photo check', pages: ['species/hhh'], at: '2026-11-20', off: true, look: { said: 'agree', by: 'the chief of staff', on: '2026-11-20' } }
  await writeFile(join(r, 'engine-state/_photo-second-look.json'), JSON.stringify({ [url('h-dead')]: rec }))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [url('h-dead')]: waitingEntry(compactRejection('people: another reason')) }))
  const out = await sweep(r)
  expect((await json(r, 'engine-state/_photo-rejected.json'))[url('h-dead')]).toBe(rec.why)
  expect(await json(r, 'engine-state/_photo-second-look.json')).toEqual({})
  expect(out.waitingOdd).toEqual([])
})

test("an agree on an unmarked record whose never-again entry is a waiting one gives the entry the record's reason: two runs' records can meet so in a merge", async () => {
  const r = await store({ aaa: ['a-fish'] })
  const why = compactRejection('dead: a fish on a board')
  const rec = { why, step: 'the watermark screen', pages: ['species/aaa'], at: '2026-11-20', look: { said: 'agree', by: 'the chief of staff', on: '2026-11-21' } }
  await writeFile(join(r, 'engine-state/_photo-second-look.json'), JSON.stringify({ [url('a-dead')]: rec }))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [url('a-dead')]: waitingEntry(compactRejection('dead: on a tray')) }))
  expect(await listAgreed(r)).toEqual([url('a-dead')])
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({ [url('a-dead')]: why })
  expect(await json(r, 'engine-state/_photo-second-look.json')).toEqual({})
})

test("a clear takes the waiting entry off the never-again list, and where a step puts the photo back no verdict takes it off again; an agree gives the entry the verdict's own reason and the record leaves", async () => {
  const r = await store({ mmm: ['m-dead'], nnn: ['n-dead'] })
  vi.stubEnv('AQ_PUT_BACK_ENTRIES', 'off')
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

test("a photo marked off at its first verdict with no waiting entry: the sweep writes the entry back and takes the photo off again; one listed for another kind keeps that kind", async () => {
  const r = await store({ ooo: ['o-listed', 'o-fish'], ppp: ['p-dead', 'p-fish'], sss: ['s-dead', 's-fish'], www: ['w-mark', 'w-fish'] })
  const rec = (why: string, id: string) => ({ why: compactRejection(why), step: 'the photo check', pages: [`species/${id}`], at: '2026-11-20', off: true })
  const p = rec('dead: a fish on a board', 'ppp'), q = rec('people: a hand', 'sss'), w = rec('dead: on a tray', 'www')
  await writeFile(join(r, 'engine-state/_photo-second-look.json'), JSON.stringify({ [url('p-dead')]: p, [url('s-dead')]: q, [url('w-mark')]: w }))
  // p-dead's entry is missing, so a step put it back on its page; s-dead's waits for another reason; w-mark is listed for a mark.
  const mark = compactRejection('watermark: a logo bottom left')
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [url('o-listed')]: compactRejection('dead: on ice'), [url('s-dead')]: waitingEntry('people: another reason'), [url('w-mark')]: mark }))
  vi.stubEnv('AQ_PUT_BACK_ENTRIES', join(r, 'private-put-back'))
  const out = await sweep(r).finally(() => vi.unstubAllEnvs())
  expect(out.waitingBack.sort()).toEqual([url('p-dead'), url('s-dead')])
  const listed = await json(r, 'engine-state/_photo-rejected.json')
  expect(listed[url('p-dead')]).toBe(waitingEntry(p.why))
  expect(listed[url('s-dead')]).toBe(waitingEntry(q.why))
  expect(listed[url('w-mark')]).toBe(mark)
  expect(out.waitingOdd).toEqual([`${url('w-mark')}: its never-again entry is another kind's, left in force`])
  // Every listed photo comes off: the mismatch loosened nothing.
  expect(await photosOf(r, 'ppp')).toEqual(['p-fish'])
  expect(await photosOf(r, 'sss')).toEqual(['s-fish'])
  expect(await photosOf(r, 'www')).toEqual(['w-fish'])
  expect(await photosOf(r, 'ooo')).toEqual(['o-fish'])
  // The record still waits for its look, and the next pass finds the two agree.
  expect(Object.keys(await json(r, 'engine-state/_photo-second-look.json')).sort()).toEqual([url('p-dead'), url('s-dead'), url('w-mark')])
  expect((await sweep(r)).waitingBack).toEqual([])
})

test("a waiting entry with no second-look record stays in force while the raw entry waits for recovery", async () => {
  const r = await store({ qqq: ['q-wait', 'q-fish'], ooo: ['o-listed', 'o-fish'] })
  const waiting = waitingEntry(compactRejection('dead: a fish on a board'))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [url('q-wait')]: waiting, [url('o-listed')]: compactRejection('dead: on ice') }))
  const out = await sweep(r)
  expect(out.waitingOdd).toEqual([`${url('q-wait')}: no second-look record marked for it, kept off`])
  expect(out.waitingBack).toEqual([])
  expect(await photosOf(r, 'qqq')).toEqual(['q-wait', 'q-fish'])
  expect(await photosOf(r, 'ooo')).toEqual(['o-fish'])
  expect((await json(r, 'engine-state/_photo-rejected.json'))[url('q-wait')]).toBe(waiting)
  // A record whose answer is "clear" doesn't lift an entry that isn't its own waiting entry.
  await writeFile(join(r, 'engine-state/_photo-second-look.json'), JSON.stringify({ [url('q-wait')]: { why: compactRejection('dead: something else'), step: 'the photo check', pages: ['species/qqq'], at: '2026-11-20', off: true, look: { said: 'clear', by: 'the chief of staff', on: '2026-11-20' } } }))
  const again = await sweep(r)
  expect(again.unlisted).toEqual([])
  expect((await json(r, 'engine-state/_photo-rejected.json'))[url('q-wait')]).toBe(waiting)
  expect(again.waitingOdd).toEqual([`${url('q-wait')}: no second-look record marked for it, kept off`])
})

test('a pending source watermark cannot count its mirror as a replacement for a passed last photo', async () => {
  const r = await store({ aaa: [], bbb: [] }, { 'a-dead': { aaa: oldPass } })
  const source = 'https://live.staticflickr.com/123/456_abc.jpg'
  const mirror = `https://media.aquatome.com/${mirrorPlan(source)!.key}`
  const photoAt = (address: string) => ({ ...photo('sample'), url: address, source: undefined, licence: 'CC BY 4.0' })
  await writeFile(join(r, 'content/species/aaa/entity.json'), JSON.stringify(fish('aaa', [photo('a-dead'), photoAt(mirror)])))
  await writeFile(join(r, 'content/species/bbb/entity.json'), JSON.stringify(fish('bbb', [photoAt(source), photo('b-live')])))
  const checked = await checkPagePhotos(r, model({ 'a-dead': dead, [name(source)]: { logo: true } }), { limit: 10, emptyCap: 0 })

  expect(checked.heads.held).toContain(`species/aaa: ${url('a-dead')}`)
  expect(await photosOf(r, 'aaa')).toEqual(['a-dead', name(mirror)])
  expect((await json(r, 'engine-state/_photo-rejected.json'))[source]).toBeUndefined()
})

test('an existing whole-photo source rejection also excludes its mirror as a replacement', async () => {
  const r = await store({ aaa: [] }, { 'a-dead': { aaa: oldPass } })
  const source = 'https://live.staticflickr.com/123/456_abc.jpg'
  const mirror = `https://media.aquatome.com/${mirrorPlan(source)!.key}`
  const sibling = { ...photo('sample'), url: mirror, source: undefined, licence: 'CC BY 4.0' }
  await writeFile(join(r, 'content/species/aaa/entity.json'), JSON.stringify(fish('aaa', [photo('a-dead'), sibling])))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ [source]: 'not the subject' }))
  const checked = await checkPagePhotos(r, model({ 'a-dead': dead }), { limit: 10, emptyCap: 0 })

  expect(checked.heads.held).toContain(`species/aaa: ${url('a-dead')}`)
  expect(await photosOf(r, 'aaa')).toContain('a-dead')
})

test('a first dead verdict on a square crop does not take off a separately passed mirror', async () => {
  const r = await store({ aaa: [], bbb: [] })
  const square = 'https://live.staticflickr.com/123/456_abc_q.jpg'
  const mirror = `https://media.aquatome.com/${mirrorPlan(square)!.key}`
  const photoAt = (address: string) => ({ ...photo('sample'), url: address, source: undefined, licence: 'CC BY 4.0' })
  await writeFile(join(r, 'content/species/aaa/entity.json'), JSON.stringify(fish('aaa', [photoAt(square)])))
  await writeFile(join(r, 'content/species/bbb/entity.json'), JSON.stringify(fish('bbb', [photoAt(mirror)])))
  await writeFile(join(r, 'engine-state/_photo-check.json'), JSON.stringify({ [mirror]: oldPass }))
  const report = await checkPagePhotos(r, model({ [name(square)]: dead, [name(mirror)]: dead }), { limit: 10, emptyCap: 0 })

  expect(report.heads.held).toEqual([`species/bbb: ${mirror}`])
  expect(await photosOf(r, 'aaa')).toEqual([])
  expect(await photosOf(r, 'bbb')).toEqual([name(mirror)])
  const reviews = await json(r, 'engine-state/_photo-second-look.json')
  expect(reviews[square]).toMatchObject({ off: true, pages: ['species/aaa'] })
  expect(reviews[mirror]).toMatchObject({ pages: ['species/bbb'] })
  expect(reviews[mirror].off).toBeUndefined()
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({ [square]: waitingEntry(reviews[square].why) })
})

test('a held mirror also suppresses a new watermark refusal at its source', async () => {
  const r = await store({ aaa: [], bbb: [] }, { 'a-live': { aaa: oldPass } })
  const source = 'https://live.staticflickr.com/123/456_abc.jpg'
  const mirror = `https://media.aquatome.com/${mirrorPlan(source)!.key}`
  const photoAt = (address: string) => ({ ...photo('sample'), url: address, source: undefined, licence: 'CC BY 4.0' })
  await writeFile(join(r, 'content/species/aaa/entity.json'), JSON.stringify(fish('aaa', [photoAt(mirror)])))
  await writeFile(join(r, 'content/species/bbb/entity.json'), JSON.stringify(fish('bbb', [photoAt(source), photo('a-live')])))
  const checked = await checkPagePhotos(r, model({ [name(source)]: { logo: true }, [name(mirror)]: { logo: true } }), { limit: 10 })

  expect(checked.heads.held).toContain(`species/aaa: ${mirror}`)
  const listed = await json(r, 'engine-state/_photo-rejected.json')
  expect(listed[mirror]).toBeUndefined()
  expect(listed[source]).toBeUndefined()
})

test('a first dead verdict reaches the page using its mirror despite a different exact verdict there', async () => {
  const r = await store({ aaa: [], bbb: [] })
  const source = 'https://live.staticflickr.com/123/456_abc.jpg'
  const mirror = `https://media.aquatome.com/${mirrorPlan(source)!.key}`
  const photoAt = (address: string) => ({ ...photo('sample'), url: address, source: undefined, licence: 'CC BY 4.0' })
  await writeFile(join(r, 'content/species/aaa/entity.json'), JSON.stringify(fish('aaa', [photoAt(mirror)])))
  await writeFile(join(r, 'content/species/bbb/entity.json'), JSON.stringify(fish('bbb', [photoAt(source), photo('b-live')])))
  await checkPagePhotos(r, model({ [name(source)]: dead, [name(mirror)]: { logo: true } }), { limit: 10 })

  expect(await photosOf(r, 'aaa')).toEqual([])
  expect(await json(r, 'engine-state/_photo-second-look.json')).toEqual({
    [source]: expect.objectContaining({ off: true, pages: ['species/aaa'] }),
  })
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({
    [source]: expect.stringMatching(/^waiting:/),
  })
})

test("a logo refusal on an alteration holds another page's sole bare original", async () => {
  const r = await store({ aaa: ['a-altered', 'a-live'], bbb: ['b-original'] })
  const original = photo('b-original')
  const altered = { ...photo('a-altered'), altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'a'.repeat(64) }], original }
  await writeFile(join(r, 'content/species/aaa/entity.json'), JSON.stringify(fish('aaa', [altered, photo('a-live')])))
  const checked = await checkPagePhotos(r, model({ 'a-altered': { logo: true } }), { limit: 10 })
  expect(checked.heads.held).toContain(`species/bbb: ${original.url}`)
  expect(await photosOf(r, 'bbb')).toEqual(['b-original'])
  expect(await json(r, 'engine-state/_photo-rejected.json')).not.toHaveProperty(original.url)
  expect((await json(r, 'engine-state/_photo-second-look.json'))[altered.url].originals).toEqual([original.url])
})
