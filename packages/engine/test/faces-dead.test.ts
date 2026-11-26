import { execFileSync } from 'node:child_process'
import { expectControlledRejections } from './photo-privacy-assertions'
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, onTestFinished, test, vi } from 'vitest'
import { loadAll, mirrorPlan } from '@aq/schema'
import * as imageWrites from '../src/image-cache-write'
import { LlmError } from '../src/claude'
import { acknowledgeAlbumTakeOffs, screenDead, type DeadScreenDeps } from '../src/dead-screen'
import { galleries, type GalleryDeps } from '../src/gallery'
import { gitHistory, putBackCleared, waitingEntry } from '../src/last-photo'
import { checkPagePhotos } from '../src/photo-check'
import { sweep } from '../src/sweep'
import { dropFacePhotos, NEW_PHOTO_SHEETS, screenNewPhotos } from '../src/faces'

// The faces step screens the photos new to it for dead fish too, before the push (the chief of staff, 21 Nov 2026).
const m = (name: string) => `https://m/${name}.webp`
const photo = (name: string) => ({ url: m(name), width: 960, height: 640, licence: 'CC BY 4.0', author: 'Sample Tester', sourceUrl: 'https://example.org/x' })
const video = (youtubeId: string) => ({ youtubeId, title: youtubeId, durationSec: 300, lang: 'en' })

// Species a: its head was judged by the face finder in an earlier run; a new dead fish and a new live one follow it, and
// a video. Species b, a new page: its one photo, a dead fish. Species c: a new photo with a face, and a new live fish.
async function store() {
  const root = await mkdtemp(join(tmpdir(), 'faces-dead-'))
  const put = async (path: string, data: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), `${JSON.stringify(data, null, 2)}\n`) }
  await put('content/species/a/entity.json', { id: 'a', photos: [photo('a-old'), photo('a-dead'), photo('a-live')], videos: [video('deadthumb01')] })
  await put('content/species/b/entity.json', { id: 'b', photos: [photo('b-dead')], videos: [] })
  await put('content/species/c/entity.json', { id: 'c', photos: [photo('c-face'), photo('c-live')], videos: [] })
  await put('engine-state/_photo-faces.json', { [m('a-old')]: 0 })
  // a's head was judged by the screen too, in that earlier run.
  await put('engine-state/_dead-screen.json', { [m('a-old')]: { dead: false, note: 'live fish in a tank' } })
  await mkdir(join(root, 'content/gallery'), { recursive: true })
  return root
}
const json = async (root: string, path: string) => JSON.parse(await readFile(join(root, path), 'utf8'))
const urls = async (root: string, id: string) => (await json(root, `content/species/${id}/entity.json`)).photos.map((p: { url: string }) => p.url)

function deps(o: { stop?: boolean; unreadable?: string } = {}) {
  const sent: string[] = []
  let sheet: string[] = []
  const dead: DeadScreenDeps = {
    get: async u => { sent.push(u); if (u === o.unreadable) throw new Error('HTTP 503'); sheet.push(u); return new Uint8Array(await sharp({ create: { width: 480, height: 360, channels: 3, background: '#468' } }).png().toBuffer()) },
    look: async () => {
      if (o.stop) throw new LlmError('usage limit')
      const tiles = sheet.map((u, i) => ({ n: i + 1, dead: /-dead\./.test(u), note: /-dead\./.test(u) ? 'fish on a tape measure' : 'live fish in a tank' }))
      sheet = []
      return { tiles }
    },
  }
  return {
    sent,
    d: {
      get: async (u: string) => { if (u === o.unreadable) throw new Error('HTTP 503'); return new TextEncoder().encode(u) },
      detect: async (files: string[]) => Promise.all(files.map(async f => ((await readFile(f, 'utf8')).includes('-face') ? 1 : 0))),
      dead,
    },
  }
}
const owed = async (root: string) => Object.keys(await json(root, 'engine-state/_photo-dead-owed.json'))
const run = (root: string, d: ReturnType<typeof deps>['d']) =>
  screenNewPhotos(join(root, 'content'), join(root, 'engine-state/_photo-faces.json'), d, join(root, 'engine-state/_photo-rejected.json'), root)

test('the faces step screens the photos new to it for dead fish, wherever they stand on the page, and nothing else; a dead one is off at this push', async () => {
  const root = await store()
  const { d, sent } = deps()
  const r = await run(root, d)
  // Not the head the face finder judged before, not the video, not the photo it took off for a face.
  expect(sent).toEqual([m('a-dead'), m('a-live'), m('b-dead'), m('c-live')])
  expect(r.faces.removed).toEqual([`species/c/entity.json: ${m('c-face')}`])
  expect(r.dead).toMatchObject({ sheets: 1, judged: 4, left: 0, failed: [], stopped: '' })
  expect(r.dead!.dead).toEqual([`${m('a-dead')}: dead screen dead`])
  expect(await urls(root, 'a')).toEqual([m('a-old'), m('a-live')])
  expect((await json(root, 'content/species/a/entity.json')).videos).toHaveLength(1)
  // b's one photo never passed the check: its first verdict takes it off, marked for a second look (last-photo.ts).
  expect(r.dead!.firstOff).toEqual([`${m('b-dead')}: species/b`])
  expect(await urls(root, 'b')).toEqual([])
  expect((await json(root, 'engine-state/_photo-second-look.json'))[m('b-dead')]).toMatchObject({ step: 'the dead-fish screen', pages: ['species/b'], off: true })
  const rejected = await json(root, 'engine-state/_photo-rejected.json')
  expect(rejected[m('b-dead')]).toMatch(/^waiting: /)
  // At the face pass, c's other photo is still owed. Its first face verdict takes it off with a second-look mark.
  expect(r.faces.firstOff).toEqual([`${m('c-face')}: species/c`])
  expect(rejected[m('c-face')]).toMatch(/^waiting: /)
  expectControlledRejections({ [m('a-dead')]: rejected[m('a-dead')] }, { [m('a-dead')]: 'dead' })
  expect(Object.keys(await json(root, 'engine-state/_dead-screen.json')).sort()).toEqual([m('a-dead'), m('a-live'), m('a-old'), m('b-dead'), m('c-live')])
  // Each judged now, none is owed.
  expect(await owed(root)).toEqual([])

  // The next run: nothing new to the face finder, so nothing is sent and no model is called.
  const next = deps()
  expect(await run(root, next.d)).toMatchObject({ faces: { checked: 0, screened: [] }, owed: 0, albums: { sheets: 0, left: 0 } })
  expect(next.sent).toEqual([])
})

test("the faces step's dead-fish screen takes at most its sheets a run; what's left is owed, off every public page, and asked first in the next run", async () => {
  const root = await mkdtemp(join(tmpdir(), 'faces-dead-'))
  const many = Array.from({ length: NEW_PHOTO_SHEETS * 12 + 3 }, (_, i) => photo(`p${String(i).padStart(3, '0')}-live`))
  await mkdir(join(root, 'content/species/a'), { recursive: true })
  await mkdir(join(root, 'engine-state'))
  await writeFile(join(root, 'content/species/a/entity.json'), JSON.stringify({ id: 'a', photos: many }))
  const first = deps()
  const r = await run(root, first.d)
  expect(r).toMatchObject({ dead: { sheets: NEW_PHOTO_SHEETS, judged: NEW_PHOTO_SHEETS * 12, left: 3 }, owed: 3 })
  const left = [m('p168-live'), m('p169-live'), m('p170-live')]
  expect(await owed(root)).toEqual(left)
  // A new photo on the next run comes after the ones owed before.
  const e = JSON.parse(await readFile(join(root, 'content/species/a/entity.json'), 'utf8'))
  e.photos.unshift(photo('a000-live'))
  await writeFile(join(root, 'content/species/a/entity.json'), JSON.stringify(e))
  const next = deps()
  await run(root, next.d)
  expect(next.sent).toEqual([...left, m('a000-live')])
  expect(await owed(root)).toEqual([])
})

test("a stop at the step's line leaves the face pass as written and every page as it was; a failure of the screen doesn't fail the step", async () => {
  const root = await store()
  const stopped = await run(root, deps({ stop: true }).d)
  expect(stopped.dead).toMatchObject({ judged: 0, stopped: 'usage limit', dead: [] })
  expect(await json(root, 'engine-state/_photo-faces.json')).toEqual({ [m('a-old')]: 0, [m('a-dead')]: 0, [m('a-live')]: 0, [m('b-dead')]: 0, [m('c-face')]: 1, [m('c-live')]: 0 })
  expect(await urls(root, 'a')).toEqual([m('a-old'), m('a-dead'), m('a-live')])
  expect(await urls(root, 'b')).toEqual([m('b-dead')])
  // The new photos still on a page are owed (not the one the face pass took off), so none shows until judged.
  expect(await owed(root)).toEqual([m('a-dead'), m('a-live'), m('b-dead'), m('c-live')])
  // The photo check asks one in the meantime: it leaves the list unasked; the screen asks the rest in the next run.
  await writeFile(join(root, 'engine-state/_photo-subjects.json'), JSON.stringify({ [m('c-live')]: { c: { ok: 'yes', typical: true, note: '', logo: false } } }))
  const next = deps()
  await run(root, next.d)
  expect(next.sent).toEqual([m('a-dead'), m('a-live'), m('b-dead')])
  expect(await owed(root)).toEqual([])
  expect(await urls(root, 'a')).toEqual([m('a-old'), m('a-live')])

  // A page the screen can't write: the step still ends, its face pass kept, the failure said.
  const again = await store()
  const unwritable = join(again, 'content/species/a')
  await chmod(unwritable, 0o555)
  const failed = await run(again, deps().d).finally(() => chmod(unwritable, 0o755))
  expect(failed.deadFailed).toMatch(/^photo operation unavailable \[sha256:[0-9a-f]{64}\]$/)
  expect(failed.faces.removed).toEqual([`species/c/entity.json: ${m('c-face')}`])
  expect(Object.keys(await json(again, 'engine-state/_photo-faces.json'))).toHaveLength(6)
  // The list was written before the screen ran, so the failure leaves every new photo owed.
  expect(await owed(again)).toEqual([m('a-dead'), m('a-live'), m('b-dead'), m('c-live')])
})

test('a new photo neither the face finder nor the screen could read stays owed; one the never-again list has leaves the list', async () => {
  const root = await store()
  const first = await run(root, deps({ unreadable: m('c-live') }).d)
  expect(first.faces.failed).toHaveLength(1)
  expect(first.dead!.failed).toHaveLength(1)
  expect(await owed(root)).toEqual([m('c-live')])
  // Listed never-again by hand in the meantime: it no longer waits on the screen, which doesn't ask it.
  const rejected = await json(root, 'engine-state/_photo-rejected.json')
  await writeFile(join(root, 'engine-state/_photo-rejected.json'), JSON.stringify({ ...rejected, [m('c-live')]: 'rejected: by hand' }))
  const next = deps()
  await run(root, next.d)
  expect(next.sent).toEqual([])
  expect(await owed(root)).toEqual([])
})

test("the list takes the photos new to the face finder before its record does: a list that can't be written stops the step with the record and the pages as they were, and the next run screens them", async () => {
  const root = await store()
  // A folder stands where the list goes: nothing can be written there.
  await mkdir(join(root, 'engine-state/_photo-dead-owed.json'))
  const first = deps()
  await expect(run(root, first.d)).rejects.toThrow()
  expect(await json(root, 'engine-state/_photo-faces.json')).toEqual({ [m('a-old')]: 0 })
  expect(await urls(root, 'c')).toEqual([m('c-face'), m('c-live')])
  expect(first.sent).toEqual([])
  // Written again: the photos are new to the face finder, so the screen is sent each one.
  await rm(join(root, 'engine-state/_photo-dead-owed.json'), { recursive: true })
  const next = deps()
  await run(root, next.d)
  expect(next.sent).toEqual([m('a-dead'), m('a-live'), m('b-dead'), m('c-live')])
  expect(await owed(root)).toEqual([])
})

test("the screen owes every photo of a fish or plant page that no look has judged, however it came into the face finder's record: one read before the screen, not one the check asked or a person looked at", async () => {
  // The chief of staff, 22 Nov 2026: a pages run begun on the code from before the screen read 111 new photos into the
  // face finder's record, and the screen, owing only photos new to that record, never would have looked at them.
  const root = await mkdtemp(join(tmpdir(), 'faces-dead-'))
  const put = async (path: string, data: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), `${JSON.stringify(data, null, 2)}\n`) }
  await put('content/species/d/entity.json', { id: 'd', photos: [photo('d-read'), photo('d-asked'), photo('d-cleared'), photo('d-read-dead')], videos: [] })
  await put('content/plants/p/entity.json', { id: 'p', photos: [{ ...photo('p-read'), altered: [{ method: 'lanczos3-upscale' }], original: { url: m('p-original-dead') } }] })
  // A guide's photos are the guides' own looks' (guide-photos.ts), not this screen's.
  await put('content/guides/g/entity.json', { id: 'g', photos: [photo('g-read')] })
  await mkdir(join(root, 'content/gallery'), { recursive: true })
  // Every one read by the face finder before this run: none is new to it.
  await put('engine-state/_photo-faces.json', Object.fromEntries(['d-read', 'd-asked', 'd-cleared', 'd-read-dead', 'p-read', 'p-original-dead', 'g-read'].map(n => [m(n), 0])))
  await put('engine-state/_photo-subjects.json', { [m('d-asked')]: { d: { ok: 'yes', typical: true, note: '', logo: false } } })
  await put('engine-state/_photo-second-look.json', { [m('d-cleared')]: { why: 'watermark: withheld [sha256:' + '0'.repeat(64) + ']', step: 'the watermark screen', pages: ['species/d'], at: '2026-11-20', look: { said: 'clear', by: 'the chief of staff', on: '2026-11-21' } } })
  const { d, sent } = deps()
  const r = await run(root, d)
  expect(r.faces.checked).toBe(0)
  expect(sent).toEqual([m('d-read'), m('d-read-dead'), m('p-read'), m('p-original-dead')])
  expect(r.dead).toMatchObject({ judged: 4, left: 0 })
  // Permission is off, so the original is the only version this plant page could show. The original stays in the
  // alteration record, but its first dead verdict makes it wait for a person, even though the stored URL is different.
  expect(r.dead!.firstOff).toContain(`${m('p-original-dead')}: plants/p`)
  expect((await json(root, 'content/plants/p/entity.json')).photos[0].original.url).toBe(m('p-original-dead'))
  expect((await json(root, 'engine-state/_photo-rejected.json'))[m('p-original-dead')]).toMatch(/^waiting: /)
  // Off at this push, as a new photo's dead verdict is: d keeps its other photos.
  expect(await urls(root, 'd')).toEqual([m('d-read'), m('d-asked'), m('d-cleared')])
  expect(await owed(root)).toEqual([])
  // Judged now: the next run owes none and calls no model.
  const next = deps()
  expect(await run(root, next.d)).toMatchObject({ faces: { checked: 0 }, owed: 0, albums: { sheets: 0, left: 0 } })
  expect(next.sent).toEqual([])
})

async function onePage(photos: object[]) {
  const root = await mkdtemp(join(tmpdir(), 'faces-dead-'))
  await mkdir(join(root, 'content/species/a'), { recursive: true })
  await mkdir(join(root, 'content/gallery'), { recursive: true })
  await mkdir(join(root, 'engine-state'))
  await writeFile(join(root, 'content/species/a/entity.json'), JSON.stringify({ id: 'a', photos }))
  return root
}

test('a rejected alteration keeps its held original in the entity and paired album', async () => {
  const original = photo('original-dead')
  const altered = { ...original, url: m('altered-dead'), altered: [{ method: 'lanczos3-upscale' }], original: { url: original.url, width: original.width, height: original.height } }
  const root = await onePage([altered])
  await writeFile(join(root, 'content/gallery/a.json'), JSON.stringify({ id: 'a', photos: [altered] }))
  await writeFile(join(root, 'engine-state/_photo-check.json'), JSON.stringify({ [original.url]: { ok: 'yes', typical: true } }))
  const { d } = deps()
  const out = await run(root, d)
  expect(out.dead!.held).toEqual([`${original.url}: species/a`])
  expect((await json(root, 'content/species/a/entity.json')).photos).toEqual([altered])
  expect((await json(root, 'content/gallery/a.json')).photos).toEqual([altered])
  expect((await json(root, 'engine-state/_dead-screen.json'))[altered.url].dead).toBe(true)
  expect((await json(root, 'engine-state/_photo-rejected.json'))[altered.url]).toMatch(/^dead: /)

  const unused = async () => { throw new Error('No source is needed for cleanup') }
  await galleries(root, { get: unused, http: unused, look: unused, faces: unused, sleep: unused, now: () => new Date() }, { only: 'missing', sheets: 0 })
  const marks = await json(root, 'engine-state/_photo-second-look.json')
  marks[original.url].look = { said: 'clear', by: 'reviewer', on: '2026-11-26' }
  await writeFile(join(root, 'engine-state/_photo-second-look.json'), JSON.stringify(marks))
  expect((await json(root, 'content/gallery/a.json')).photos).toEqual([altered])
})

test('an unreadable sibling does not remove the only previously passed photo', async () => {
  const old = photo('old-dead'), pending = photo('unreadable')
  const root = await onePage([old, pending])
  await writeFile(join(root, 'engine-state/_photo-check.json'), JSON.stringify({ [old.url]: { ok: 'yes', typical: true } }))
  const flagged = await run(root, deps({ unreadable: pending.url }).d)
  expect(flagged.dead!.held).toEqual([`${old.url}: species/a`])
  expect(await urls(root, 'a')).toEqual([old.url, pending.url])
  expect(await owed(root)).toEqual([pending.url])
})

test('a failed rejection write does not release an original with a dead verdict', async () => {
  const original = photo('original-dead'), live = photo('live')
  const altered = { ...original, url: m('altered'), altered: [{ method: 'lanczos3-upscale' }], original: { url: original.url } }
  const root = await onePage([altered, live])
  await writeFile(join(root, 'content/gallery/a.json'), JSON.stringify({ id: 'a', photos: [altered] }))
  const rejected = join(root, 'engine-state/_photo-rejected.json')
  await mkdir(rejected)
  const failed = await run(root, deps().d)
  expect(failed.deadFailed).toBeDefined()
  expect(await owed(root)).toContain(original.url)
  await expect(readFile(join(root, 'engine-state/_dead-screen.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  await rm(rejected, { recursive: true })
  expect((await run(root, deps().d)).dead!.dead).toEqual([`${original.url}: dead screen dead`])
  expectControlledRejections(await json(root, 'engine-state/_photo-rejected.json'), { [original.url]: 'dead' })
})

async function publicFixture(photos: object[], albums: object[], urls: string[]) {
  const root = await mkdtemp(join(tmpdir(), 'faces-dead-public-'))
  const content = join(root, 'content')
  const state = join(root, 'engine-state')
  await cp(new URL('../../schema/test/fixtures/store/', import.meta.url), content, { recursive: true })
  const file = join(content, 'species/alpha/entity.json')
  const entity = JSON.parse(await readFile(file, 'utf8'))
  await writeFile(file, JSON.stringify({ ...entity, photos, videos: [] }))
  await mkdir(join(content, 'gallery'), { recursive: true })
  await writeFile(join(content, 'gallery/alpha.json'), JSON.stringify({ id: 'alpha', photos: albums, seen: albums.length, updatedAt: '2026-11-26' }))
  await mkdir(state, { recursive: true })
  await writeFile(join(state, '_photo-watermarks.json'), JSON.stringify(Object.fromEntries(urls.map(u => [u, { ocr: [] }]))))
  const publicView = () => loadAll({ root: content, lang: 'vi', publicBuild: true })
  return { root, state, file, publicView }
}

test.each([false, true])('the face finder holds a passed last photo while its sibling owes the dead-fish screen (original: %s)', async useOriginal => {
  const flagged = photo('passed-face'), pending = photo('unreadable')
  const altered = {
    ...pending, url: m('altered-live'),
    altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'a'.repeat(64) }],
    original: { url: pending.url, width: pending.width, height: pending.height },
  }
  const sibling = useOriginal ? altered : pending
  const { root, state, publicView } = await publicFixture([flagged, sibling], [], [flagged.url, sibling.url, pending.url])
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify(useOriginal ? { [sibling.url]: { dead: false } } : {}))
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [sibling.url]: 0 }))
  await writeFile(join(state, '_photo-check.json'), JSON.stringify({ [flagged.url]: { ok: 'yes', person: false, logo: false } }))

  const report = await run(root, deps({ unreadable: pending.url }).d)
  expect(report.faces.held).toEqual([`${flagged.url}: species/alpha`])
  expect(report.owed).toBe(1)
  expect(await owed(root)).toEqual([pending.url])
  const view = await publicView()
  expect(view.species.find(page => page.id === 'alpha')?.photos.map(p => p.url)).toEqual([flagged.url])
  expect(view.photoWaits!(pending.url)).toBe(true)
  expect((await json(root, 'engine-state/_photo-second-look.json'))[flagged.url])
    .toMatchObject({ step: 'face detection', pages: ['species/alpha'] })
})

test.each(['face detection', 'the dead-fish screen'])('an unseen sibling cannot displace the last photo flagged by %s', async step => {
  const flagged = photo(step === 'face detection' ? 'passed-face' : 'passed-dead')
  const pending = photo('face-fetch-fails')
  const { root, state, publicView } = await publicFixture([flagged, pending], [], [flagged.url, pending.url])
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [pending.url]: { dead: false } }))
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify(step === 'face detection' ? {} : { [flagged.url]: 0 }))
  await writeFile(join(state, '_photo-check.json'), JSON.stringify({ [flagged.url]: {
    ok: 'yes', person: false, ...(step === 'face detection' ? { logo: false } : {}),
  } }))
  await run(root, deps({ unreadable: pending.url }).d)
  const view = await publicView()
  expect(view.species.find(page => page.id === 'alpha')?.photos.map(p => p.url)).toEqual([flagged.url])
  expect(view.photoWaits!(pending.url)).toBe(true)
  expect((await json(root, 'engine-state/_photo-second-look.json'))[flagged.url]).toMatchObject({ step, pages: ['species/alpha'] })
})

test('a face flagged on a stored alteration leaves the passing original in the page and album', async () => {
  const original = photo('passed-original')
  const flagged = {
    ...original, url: m('altered-face'),
    altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'b'.repeat(64) }],
    original: { url: original.url, width: original.width, height: original.height },
  }
  const { root, state, publicView } = await publicFixture([flagged], [flagged], [flagged.url, original.url])
  await writeFile(join(state, '_dead-screen.json'), '{}')
  await writeFile(join(state, '_photo-check.json'), JSON.stringify({ [original.url]: { ok: 'yes', person: false, logo: false } }))
  await run(root, deps().d)
  const view = await publicView()
  const page = view.species.find(p => p.id === 'alpha')!
  expect(page.photos).toEqual([expect.objectContaining({ url: original.url, author: original.author })])
  expect(view.galleries.alpha).toEqual([expect.objectContaining({ url: original.url, author: original.author })])
  expect(view.photoWaits!(flagged.url)).toBe(true)
})

test.each([false, true])('a fallback original waits for its own face result, including its album copy (mirrored: %s)', async mirrored => {
  const source = 'https://upload.wikimedia.org/wikipedia/commons/a/ab/original-face.jpg'
  const original = { ...photo('original-face'), url: mirrored ? source : m('original-face') }
  const albumUrl = mirrored ? `https://media.aquatome.com/${mirrorPlan(source)!.key}` : original.url
  const altered = {
    ...original, url: m('altered-clean'),
    altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'c'.repeat(64) }],
    original: { url: original.url, width: original.width, height: original.height },
  }
  const album = mirrored ? { ...photo('album'), url: albumUrl } : altered
  const { root, state, publicView } = await publicFixture([altered], [album], [altered.url, original.url, albumUrl])
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [altered.url]: { dead: false }, [original.url]: { dead: false }, [albumUrl]: { dead: false } }))
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [altered.url]: 0, ...(mirrored ? { [albumUrl]: 0 } : {}) }))
  const hidden = async () => {
    const content = await publicView()
    expect(content.species.find(p => p.id === 'alpha')?.photos).toEqual([])
    expect(content.galleries.alpha).toBeUndefined()
    expect(content.photoWaits!(original.url)).toBe(true)
    expect(content.photoWaits!(albumUrl)).toBe(true)
  }
  await hidden()
  expect((await run(root, deps({ unreadable: original.url }).d)).faces.failed).toHaveLength(1)
  await hidden()
  const read = await run(root, deps().d)
  expect(read.faces.screened).toEqual([original.url])
  expect(read.faces.firstOff).toEqual([`${original.url}: species/alpha`])
  await hidden()
})

test.each(['face detection', 'the standalone screen', 'the standalone screen with a withheld host'])('an unavailable original cannot count as a replacement in %s', async step => {
  const byFace = step === 'face detection'
  const byHost = step.endsWith('withheld host')
  const head = photo(byFace ? 'passed-face' : 'passed-dead')
  const original = { ...photo('original-live'), ...(byHost ? { url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/sample.jpg' } : {}) }
  const altered = {
    ...original, url: m('altered-with-mark'),
    altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'd'.repeat(64) }],
    original: { url: original.url, width: original.width, height: original.height },
  }
  const { root, state, publicView } = await publicFixture([head, altered], [], [head.url, original.url, altered.url])
  await writeFile(join(state, '_photo-check.json'), JSON.stringify({ [head.url]: { ok: 'yes', person: false, ...(byFace ? { logo: false } : {}) } }))
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [original.url]: 0, ...(byFace ? {} : { [head.url]: 0 }) }))
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [original.url]: { dead: false } }))
  await writeFile(join(state, '_photo-rejected.json'), JSON.stringify({ [altered.url]: byHost ? 'dead: withheld' : 'watermark: withheld' }))
  const d = deps().d
  const held = byFace ? (await run(root, d)).faces.held : (await screenDead(root, d.dead, { limit: 12 })).held
  expect(held).toContain(`${head.url}: species/alpha`)
  await sweep(root, { history: async () => [] })
  expect((await publicView()).species.find(p => p.id === 'alpha')?.photos.map(p => p.url)).toEqual([head.url])
})

test.each(['face detection', 'the dead-fish screen'])('a mirror being rejected by %s cannot displace a passed last photo', async step => {
  const byFace = step === 'face detection'
  const head = photo(byFace ? 'passed-face' : 'passed-dead')
  const name = byFace ? 'other-face.jpg' : 'other-dead.jpg'
  const source = `https://upload.wikimedia.org/wikipedia/commons/a/ab/${name}`
  const mirror = { ...photo('mirror'), url: `https://media.aquatome.com/${mirrorPlan(source)!.key}` }
  const wrapper = {
    ...photo('wrapper-live'),
    altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'e'.repeat(64) }],
    original: { url: source, width: mirror.width, height: mirror.height },
  }
  const { root, state, file, publicView } = await publicFixture([head, mirror], [], [head.url, mirror.url, source, wrapper.url])
  const other = join(root, 'content/species/second')
  await mkdir(other)
  const entity = JSON.parse(await readFile(file, 'utf8'))
  await writeFile(join(other, 'entity.json'), JSON.stringify({ ...entity, id: 'second', photos: [wrapper] }))
  await writeFile(join(state, '_photo-check.json'), JSON.stringify({ [head.url]: { ok: 'yes', person: false, ...(byFace ? { logo: false } : {}) } }))
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({
    [mirror.url]: { dead: false }, [wrapper.url]: { dead: false }, ...(byFace ? { [source]: { dead: false } } : {}),
  }))
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({
    [mirror.url]: 0, [wrapper.url]: 0, ...(byFace ? {} : { [head.url]: 0, [source]: 0 }),
  }))

  await run(root, deps().d)
  expect((await json(root, 'engine-state/_photo-second-look.json'))[head.url])
    .toMatchObject({ step, pages: ['species/alpha'] })
  expect((await publicView()).species.find(p => p.id === 'alpha')?.photos.map(p => p.url)).toEqual([head.url])
})

test.each([
  ['face detection', false], ['the dead-fish screen', false],
  ['face detection', 'pending'], ['the dead-fish screen', 'pending'],
  ['face detection', 'non-commercial'], ['the dead-fish screen', 'non-commercial'],
] as const)('%s records a page that only serves the verdict’s mirror (album lead: %s)', async (step, albumLead) => {
  const byFace = step === 'face detection'
  const name = byFace ? 'prior-face.jpg' : 'prior-dead.jpg'
  const source = { ...photo('source'), url: `https://upload.wikimedia.org/wikipedia/commons/a/ab/${name}` }
  const mirror = { ...photo('mirror'), url: `https://media.aquatome.com/${mirrorPlan(source.url)!.key}` }
  const sibling = photo('sibling-live')
  const pending = photo('pending-own')
  const unchecked = { ...photo('unchecked-sibling'), unchecked: true }
  const generated = {
    ...photo('generated'),
    generated: { model: 'sample', driverModel: 'sample', date: '2026-11-26', prompt: 'example', referenceHash: 'e'.repeat(64) },
  }
  const nc = [41, 42].map(id => ({
    ...photo(`non-commercial-${id}`), licence: 'CC BY-NC 4.0', sourceUrl: `https://www.inaturalist.org/photos/${id}`,
    url: `https://media.aquatome.com/inaturalist/${id}.webp`,
  }))
  const own = albumLead === 'non-commercial' ? [...nc, generated] : albumLead ? [pending, generated] : [mirror]
  const { root, state, file, publicView } = await publicFixture(own, albumLead ? [mirror, unchecked] : [],
    [mirror.url, source.url, sibling.url, pending.url, generated.url, unchecked.url, ...nc.map(p => p.url)])
  const entity = JSON.parse(await readFile(file, 'utf8'))
  const other = join(root, 'content/species/second')
  await mkdir(other)
  await writeFile(join(other, 'entity.json'), JSON.stringify({ ...entity, id: 'second', photos: [source, sibling] }))
  await writeFile(join(state, '_photo-check.json'), JSON.stringify({ [mirror.url]: { ok: 'yes', person: false, ...(byFace ? { logo: false } : {}) } }))
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [mirror.url]: { dead: false }, [sibling.url]: { dead: false }, [generated.url]: { dead: false }, ...Object.fromEntries(nc.map(p => [p.url, { dead: false }])) }))
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [mirror.url]: 0, [sibling.url]: 0, [generated.url]: 0, ...Object.fromEntries(nc.map(p => [p.url, 0])), ...(byFace ? {} : { [source.url]: 0 }) }))

  await run(root, deps({ unreadable: albumLead ? pending.url : undefined }).d)
  expect((await json(root, 'engine-state/_photo-second-look.json'))[source.url]).toMatchObject({ step, pages: ['species/alpha'] })
  expect((await publicView()).species.find(p => p.id === 'alpha')?.photos.map(p => p.url)).toEqual([mirror.url])
})

test.each([
  { both: false, hotlinkAlsoOnPage: false }, { both: true, hotlinkAlsoOnPage: false }, { both: false, hotlinkAlsoOnPage: true },
])('one clear restores the credited mirror (%j)', async ({ both, hotlinkAlsoOnPage }) => {
  const source = { ...photo('source'), url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/prior-dead.jpg' }
  const mirror = { ...photo('mirror'), url: `https://media.aquatome.com/${mirrorPlan(source.url)!.key}`, author: 'Sample mirror credit' }
  const sibling = photo('sibling-live')
  const { root, state, file, publicView } = await publicFixture(hotlinkAlsoOnPage ? [source, mirror] : [mirror], [], [mirror.url, source.url, sibling.url])
  const entity = JSON.parse(await readFile(file, 'utf8'))
  const other = join(root, 'content/species/second')
  await mkdir(other)
  await writeFile(join(other, 'entity.json'), JSON.stringify({ ...entity, id: 'second', photos: [source, sibling] }))
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ ...(both ? {} : { [mirror.url]: { dead: false } }), [sibling.url]: { dead: false } }))
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [mirror.url]: 0, [sibling.url]: 0, [source.url]: 0 }))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@example.org'); git('config', 'user.name', 'Sample Tester')
  git('add', '.'); git('commit', '-qm', 'page with the credited mirror')

  vi.stubEnv('AQ_PUT_BACK_ENTRIES', join(root, 'private-put-back'))
  onTestFinished(() => { vi.unstubAllEnvs() })
  const { d } = deps()
  if (both) d.dead.look = async () => ({ tiles: [1, 2].map(n => ({ n, dead: true, note: '' })) })
  const out = await run(root, d)
  expect(out.dead?.firstOff).toHaveLength(1)
  await sweep(root, { history: gitHistory(root) })
  expect(await urls(root, 'alpha')).toEqual([])
  git('add', '.'); git('commit', '-qm', 'first refusal removed the mirror')
  const marks = await json(root, 'engine-state/_photo-second-look.json')
  expect(Object.keys(marks)).toHaveLength(1)
  const address = Object.keys(marks)[0]!
  if (!both) expect(address).toBe(source.url)
  expect(marks[address].pages).toContain('species/alpha')
  marks[address].look = { said: 'clear', by: 'reviewer', on: '2026-11-26' }
  await writeFile(join(state, '_photo-second-look.json'), JSON.stringify(marks))
  const cleared = await sweep(root, { history: gitHistory(root) })
  expect(cleared.putBack).toContain(`content/species/alpha/entity.json: ${mirror.url}`)
  expect((await publicView()).species.find(p => p.id === 'alpha')?.photos).toEqual([expect.objectContaining({ url: mirror.url, author: mirror.author })])

  await writeFile(join(state, '_photo-subjects.json'), JSON.stringify({
    [mirror.url]: { alpha: { ok: 'dead', note: '', person: false, logo: false } },
  }))
  const unused = async () => { throw new Error('This test uses a cached photo-check verdict') }
  await checkPagePhotos(root, { get: unused, look: unused }, { limit: 0 })
  expect(await urls(root, 'alpha')).toEqual([mirror.url])
  expect((await json(root, 'engine-state/_photo-rejected.json'))[mirror.url]).toBeUndefined()
})

test.each(['face detection', 'the dead-fish screen'])('a sibling waiting on its watermark result cannot displace the last passed photo in %s', async step => {
  const flagged = photo(step === 'face detection' ? 'passed-face' : 'passed-dead')
  const pending = photo('watermark-pending')
  const { root, state, publicView } = await publicFixture([flagged, pending], [], [flagged.url])
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [pending.url]: { dead: false } }))
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [pending.url]: 0, ...(step === 'face detection' ? {} : { [flagged.url]: 0 }) }))
  await writeFile(join(state, '_photo-check.json'), JSON.stringify({ [flagged.url]: {
    ok: 'yes', person: false, ...(step === 'face detection' ? { logo: false } : {}),
  } }))
  await run(root, deps().d)
  const view = await publicView()
  expect(view.species.find(page => page.id === 'alpha')?.photos.map(p => p.url)).toEqual([flagged.url])
  expect(view.photoWaits!(pending.url)).toBe(true)
  expect((await json(root, 'engine-state/_photo-second-look.json'))[flagged.url]).toMatchObject({ step, pages: ['species/alpha'] })
})

test.each(['face detection', 'the dead-fish screen'])('a sibling from a withdrawn source cannot displace the last passed photo in %s', async step => {
  const flagged = photo(step === 'face detection' ? 'passed-face' : 'passed-dead')
  const withdrawn = { ...photo('withdrawn'), source: 'glaser' }
  const { root, state, publicView } = await publicFixture([flagged, withdrawn], [], [flagged.url, withdrawn.url])
  const sources = await json(root, 'content/sources.json')
  sources.glaser = { name: 'Sample source', homepage: 'https://example.org', publish: false }
  await writeFile(join(root, 'content/sources.json'), JSON.stringify(sources))
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [withdrawn.url]: { dead: false } }))
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [withdrawn.url]: 0, ...(step === 'face detection' ? {} : { [flagged.url]: 0 }) }))
  await writeFile(join(state, '_photo-check.json'), JSON.stringify({ [flagged.url]: {
    ok: 'yes', person: false, ...(step === 'face detection' ? { logo: false } : {}),
  } }))

  await run(root, deps().d)
  expect((await json(root, 'engine-state/_photo-second-look.json'))[flagged.url]).toMatchObject({ step, pages: ['species/alpha'] })
  expect((await publicView()).species.find(page => page.id === 'alpha')?.photos.map(p => p.url)).toEqual([flagged.url])
})

test('a photo with a no-derivatives licence cannot replace a previously passed photo', async () => {
  const flagged = photo('passed-dead'), withheld = { ...photo('withheld'), licence: 'CC BY-ND 4.0' }
  const { root, state, publicView } = await publicFixture([flagged, withheld], [], [flagged.url, withheld.url])
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [withheld.url]: { dead: false } }))
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [flagged.url]: 0, [withheld.url]: 0 }))
  await writeFile(join(state, '_photo-check.json'), JSON.stringify({ [flagged.url]: { ok: 'yes', person: false } }))

  await run(root, deps().d)

  expect((await json(root, 'engine-state/_photo-second-look.json'))[flagged.url]).toMatchObject({ pages: ['species/alpha'] })
  expect((await publicView()).species.find(page => page.id === 'alpha')?.photos.map(p => p.url)).toEqual([flagged.url])
})

test.each([false, true])('an unapproved owner crop cannot replace a passed photo (veto: %s)', async veto => {
  const flagged = photo('passed-dead')
  const crop = { ...photo('crop'), source: 'glaser', ownerCrop: { id: 'sample', pixelHash: 'a'.repeat(64) } }
  const { root, state, publicView } = await publicFixture([flagged, crop], [], [flagged.url, crop.url])
  const sources = await json(root, 'content/sources.json')
  sources.glaser = {
    name: 'Sample source', homepage: 'https://example.org', publish: 'photos',
    permission: { date: '2026-11-26', file: 'fixture', scope: [], ...(veto ? { markRemoval: { allowed: false } } : {}) },
  }
  await writeFile(join(root, 'content/sources.json'), JSON.stringify(sources))
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [crop.url]: { dead: false } }))
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [crop.url]: 0, [flagged.url]: 0 }))
  await writeFile(join(state, '_photo-check.json'), JSON.stringify({ [flagged.url]: { ok: 'yes', person: false } }))

  await run(root, deps().d)
  expect((await json(root, 'engine-state/_photo-second-look.json'))[flagged.url]).toMatchObject({ pages: ['species/alpha'] })
  expect((await publicView()).species.find(page => page.id === 'alpha')?.photos.map(p => p.url)).toEqual([flagged.url])
})

test('a first people refusal hides both addresses even if its rejection write fails', async () => {
  const source = { ...photo('source'), url: 'https://live.staticflickr.com/123/456_abc.jpg' }
  const mirror = { ...photo('mirror'), url: `https://media.aquatome.com/${mirrorPlan(source.url)!.key}` }
  const { root, state, publicView } = await publicFixture([source], [mirror], [source.url, mirror.url])
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [source.url]: 0, [mirror.url]: 0 }))
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [source.url]: { dead: false }, [mirror.url]: { dead: false } }))
  const rejected = join(state, '_photo-rejected.json')
  await mkdir(rejected)
  const { d } = deps()
  await expect(checkPagePhotos(root, {
    get: d.dead.get, look: async () => ({ photos: [{ n: 1, ok: 'yes', typical: false, person: true, logo: false, note: 'sample' }] }),
  }, { only: 'alpha', limit: 1 })).rejects.toThrow()
  await rm(rejected, { recursive: true })

  const mark = (await json(root, 'engine-state/_photo-second-look.json'))[source.url]
  expect(mark).toMatchObject({ off: true, why: expect.stringMatching(/^people:/) })
  const view = await publicView()
  expect(view.species.find(page => page.id === 'alpha')?.photos).toEqual([])
  expect(view.galleries.alpha).toBeUndefined()
  expect(view.photoWaits!(source.url)).toBe(true)
  expect(view.photoWaits!(mirror.url)).toBe(true)
})

test('a rejection for the stored URL on another page preserves the cleared original across retries and sweep', async () => {
  const original = photo('original-clear')
  const stored = photo('stored-dead')
  const sibling = photo('live-sibling')
  const alteration = {
    ...stored,
    altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'd'.repeat(64) }],
    original: { url: original.url, width: original.width, height: original.height },
  }
  const { root, state, file, publicView } = await publicFixture([alteration, sibling], [alteration, sibling], [stored.url, original.url, sibling.url])
  const entity = JSON.parse(await readFile(file, 'utf8'))
  const other = join(root, 'content/species/second')
  await mkdir(other)
  await writeFile(join(other, 'entity.json'), JSON.stringify({ ...entity, id: 'second', photos: [stored] }))
  await writeFile(join(state, '_photo-check.json'), JSON.stringify({ [original.url]: { ok: 'yes', person: false, logo: false } }))
  await writeFile(join(state, '_dead-screen.json'), '{}')
  expect((await run(root, deps().d)).dead?.firstOff).toContain(`${stored.url}: species/second`)
  const rejected = await json(root, 'engine-state/_photo-rejected.json')
  const mark = await json(root, 'engine-state/_photo-second-look.json')
  const why = mark[stored.url].why
  mark[original.url] = { why, step: 'the dead-fish screen', pages: ['species/alpha'], at: '2026-11-26', off: true,
    look: { said: 'clear', by: 'reviewer', on: '2026-11-26' } }
  rejected[original.url] = waitingEntry(why)
  await writeFile(join(state, '_photo-rejected.json'), JSON.stringify(rejected))
  await writeFile(join(state, '_photo-second-look.json'), JSON.stringify(mark))
  await writeFile(join(state, '_photo-subjects.json'), JSON.stringify({
    [stored.url]: { alpha: { ok: 'dead', logo: false }, second: { ok: 'dead', logo: false } },
  }))
  await run(root, deps().d)
  expect(JSON.parse(await readFile(file, 'utf8')).photos.map((p: { url: string }) => p.url)).toContain(stored.url)
  await sweep(root, { history: async () => [] })
  const content = await publicView()
  expect(content.species.find(p => p.id === 'alpha')?.photos).toEqual([expect.objectContaining({ url: original.url, author: original.author }), expect.objectContaining({ url: sibling.url })])
  expect(content.galleries.alpha).toEqual([expect.objectContaining({ url: original.url, author: original.author }), expect.objectContaining({ url: sibling.url })])
  expect(content.photoWaits!(stored.url)).toBe(true)
})

test('the standalone screen asks about the displayed original even when the stored head has a verdict', async () => {
  const stored = photo('stored'), original = photo('ordinary-original')
  const root = await onePage([{
    ...stored, altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'e'.repeat(64) }],
    original: { url: original.url, width: original.width, height: original.height },
  }])
  await writeFile(join(root, 'engine-state/_dead-screen.json'), JSON.stringify({ [stored.url]: { dead: false } }))
  const { d, sent } = deps()
  expect((await screenDead(root, d.dead, { limit: 1 })).judged).toBe(1)
  expect(sent).toEqual([original.url])
})

test('a retry under the other address does not create a second first-refusal mark', async () => {
  const source = 'https://live.staticflickr.com/123/456_abc.jpg'
  const mirror = { ...photo('mirror'), url: `https://media.aquatome.com/${mirrorPlan(source)!.key}` }
  const { root, state, publicView } = await publicFixture([mirror], [], [mirror.url])
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [mirror.url]: 0 }))
  await writeFile(join(state, '_photo-second-look.json'), JSON.stringify({
    [source]: { why: 'dead: withheld', pages: ['species/alpha'], at: '2026-11-26', step: 'the dead-fish screen', off: true },
  }))
  const { d } = deps()
  d.dead.look = async () => ({ tiles: [{ n: 1, dead: true, note: 'fish on a board' }] })

  await run(root, d)

  expect(Object.keys(await json(root, 'engine-state/_photo-second-look.json'))).toEqual([source])
  expect((await publicView()).photoWaits!(mirror.url)).toBe(true)
})

test.each([
  { keepHotlink: false, nonCommercial: false }, { keepHotlink: true, nonCommercial: false }, { keepHotlink: true, nonCommercial: true },
])('Git recovery restores the credited mirror (%j)', async ({ keepHotlink, nonCommercial }) => {
  const source = nonCommercial
    ? { ...photo('source'), url: 'https://static.inaturalist.org/photos/42/large.jpg', licence: 'CC BY-NC 4.0', sourceUrl: 'https://www.inaturalist.org/photos/42' }
    : { ...photo('source'), url: 'https://upload.wikimedia.org/wikipedia/commons/a/ab/Example.jpg' }
  const mirror = { ...source, url: `https://media.aquatome.com/${mirrorPlan(source.url)!.key}`, author: 'Sample mirror credit' }
  const { root, state, file, publicView } = await publicFixture([source, mirror], [], [source.url, mirror.url])
  const entity = await json(root, 'content/species/alpha/entity.json')
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@example.org'); git('config', 'user.name', 'Sample Tester')
  git('add', '.'); git('commit', '-qm', 'two addresses')

  const day = new Date().toISOString().slice(0, 10)
  await writeFile(join(state, '_photo-second-look.json'), JSON.stringify({
    [source.url]: { why: 'dead: withheld', pages: ['species/alpha'], at: day, step: 'the dead-fish screen', off: true },
  }))
  await writeFile(file, JSON.stringify({ ...entity, photos: [source] }))
  git('add', '.'); git('commit', '-qm', 'marked off and removed the mirror')
  if (!keepHotlink) {
    await writeFile(file, JSON.stringify({ ...entity, photos: [] }))
    git('add', '.'); git('commit', '-qm', 'removed the hotlink later')
  }
  const history = gitHistory(root)
  expect(await history(source.url, day)).toMatchObject([{ index: 1, photo: mirror, times: 1 }])
  const marks = await json(root, 'engine-state/_photo-second-look.json')
  marks[source.url].look = { said: 'clear', by: 'reviewer', on: day }
  await writeFile(join(state, '_photo-second-look.json'), JSON.stringify(marks))
  await sweep(root, { history })
  expect(await urls(root, 'alpha')).toEqual([mirror.url])
  expect((await publicView()).species.find(page => page.id === 'alpha')?.photos.map(p => p.url)).toEqual([mirror.url])
})

test('a first dead verdict on a mirror takes effect through a watermark hold at the source', async () => {
  const source = 'https://live.staticflickr.com/123/456_abc.jpg'
  const mirror = { ...photo('mirror'), url: `https://media.aquatome.com/${mirrorPlan(source)!.key}` }
  const { root, state, publicView } = await publicFixture([mirror], [mirror], [mirror.url])
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [mirror.url]: 0 }))
  await writeFile(join(state, '_photo-second-look.json'), JSON.stringify({
    [source]: { why: 'watermark: logo', pages: ['species/alpha'], at: '2026-11-26', step: 'the watermark screen' },
  }))
  const { d } = deps()
  d.dead.look = async () => ({ tiles: [{ n: 1, dead: true, note: 'fish on a board' }] })

  await run(root, d)

  const mark = (await json(root, 'engine-state/_photo-second-look.json'))[mirror.url]
  expect(mark).toMatchObject({ off: true })
  expect((await json(root, 'engine-state/_photo-rejected.json'))[mirror.url]).toBe(waitingEntry(mark.why))
  expect((await publicView()).photoWaits!(mirror.url)).toBe(true)
})

test('an unjudged owned source keeps its album mirror off until the source is judged', async () => {
  const source = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Sample.jpg/1280px-Sample.jpg'
  const mirrored = `https://media.aquatome.com/${mirrorPlan(source)!.key}`
  const p = photo('fish')
  const { state, publicView } = await publicFixture([{ ...p, url: source }], [{ ...p, url: mirrored }], [source, mirrored])
  await writeFile(join(state, '_dead-screen.json'), '{}')
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [source]: 0, [mirrored]: 0 }))
  const before = await publicView()
  expect(before.galleries.alpha).toBeUndefined()
  expect(before.photoWaits!(mirrored)).toBe(true)
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [source]: { dead: false } }))
  const after = await publicView()
  expect(after.galleries.alpha?.map(photo => photo.url)).toEqual([mirrored])
  expect(after.photoWaits!(mirrored)).toBe(false)
})

test('a rejected source URL keeps its mirrored fallback off the page, album and direct lookup', async () => {
  const source = 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Example.jpg/1280px-Example.jpg'
  const mirrored = `https://media.aquatome.com/${mirrorPlan(source)!.key}`
  const altered = {
    ...photo('altered'),
    altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'e'.repeat(64) }],
    original: { url: mirrored, width: 960, height: 640 },
  }
  const { root, state, publicView } = await publicFixture([altered], [altered], [altered.url, mirrored])
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [altered.url]: { dead: false }, [mirrored]: { dead: false } }))
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [altered.url]: 0, [mirrored]: 0 }))
  await writeFile(join(state, '_photo-rejected.json'), JSON.stringify({ [source]: 'dead: withheld' }))
  const content = await publicView()
  expect(content.species.find(page => page.id === 'alpha')!.photos).toEqual([])
  expect(content.galleries.alpha).toBeUndefined()
  expect(content.photoWaits!(mirrored)).toBe(true)
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [altered.url]: { dead: false } }))
  const { d, sent } = deps()
  expect((await run(root, d)).owed).toBe(0)
  expect(sent).toEqual([])
})

test('an incomplete cached verdict waits on the site and gets a fresh screen', async () => {
  const candidate = photo('missing-verdict')
  const { root, state, publicView } = await publicFixture([candidate], [candidate], [candidate.url])
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [candidate.url]: {} }))
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [candidate.url]: 0 }))
  const before = await publicView()
  expect(before.photoWaits!(candidate.url)).toBe(true)
  expect(before.galleries.alpha).toBeUndefined()

  const { d, sent } = deps()
  expect((await run(root, d)).owed).toBe(0)
  expect(sent).toEqual([candidate.url])
  expect((await publicView()).species.find(page => page.id === 'alpha')?.photos.map(p => p.url)).toEqual([candidate.url])
})

test('the sweep finishes a direct removal when the rejected URL still carries an original on another page', async () => {
  const original = photo('fallback-live'), stored = photo('stored-dead'), live = photo('sibling-live')
  const altered = {
    ...stored,
    original: { url: original.url, width: original.width, height: original.height },
    altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'a'.repeat(64) }],
  }
  const { root, state, file, publicView } = await publicFixture([altered, live], [altered], [stored.url, original.url, live.url])
  const entity = await json(root, 'content/species/alpha/entity.json')
  const direct = join(root, 'content/species/direct')
  await mkdir(direct)
  await writeFile(join(direct, 'entity.json'), JSON.stringify({ ...entity, id: 'direct', photos: [stored, live] }))

  await run(root, deps().d)
  expect((await json(root, 'engine-state/_photo-rejected.json'))[stored.url]).toMatch(/^dead: /)
  // A checkout can still have the direct entry when the verdict has been saved and its page write interrupted.
  await writeFile(join(direct, 'entity.json'), JSON.stringify({ ...entity, id: 'direct', photos: [stored, live] }))
  await sweep(root)

  expect(await urls(root, 'direct')).toEqual([live.url])
  expect(JSON.parse(await readFile(file, 'utf8')).photos).toContainEqual(altered)
  expect((await publicView()).galleries.alpha?.map(p => p.url)).toContain(original.url)
})

test('a rejection write failure cannot release the album copy on retry', async () => {
  const live = photo('live'), dead = photo('second-dead')
  const { root, state, file, publicView } = await publicFixture([live, dead], [dead], [live.url, dead.url])
  const rejected = join(state, '_photo-rejected.json')
  await mkdir(rejected)
  expect((await run(root, deps().d)).deadFailed).toBeDefined()
  expect(JSON.parse(await readFile(file, 'utf8')).photos).toEqual([live, dead])
  await rm(rejected, { recursive: true })
  expect((await publicView()).galleries.alpha).toBeUndefined()
  const retry = await run(root, deps().d)
  expect(retry.dead?.dead).toContain(`${dead.url}: dead screen dead`)
  const content = await publicView()
  expect(content.species.find(s => s.id === 'alpha')!.photos.map(p => p.url)).toEqual([live.url])
  expect(content.galleries.alpha).toBeUndefined()
})

test.each(['one pass', 'two passes'])('a first-off original stays recoverable in both copies after %s', async (timing) => {
  const original = photo('original-dead')
  const altered = {
    ...original, url: m('altered-dead'),
    original: { url: original.url, width: original.width, height: original.height },
    altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'a'.repeat(64) }],
  }
  const { root, state, publicView } = await publicFixture([altered], [altered], [altered.url, original.url])
  const flagged = await run(root, deps({ unreadable: timing === 'two passes' ? altered.url : undefined }).d)
  expect(flagged.dead?.firstOff).toContain(`${original.url}: species/alpha`)
  if (timing === 'two passes') {
    expect(flagged.owed).toBe(1)
    const retried = await run(root, deps().d)
    expect(retried.dead?.dead).toContain(`${altered.url}: dead screen dead`)
    expect(retried.owed).toBe(0)
  }
  expect((await publicView()).galleries.alpha).toBeUndefined()
  const looksFile = join(state, '_photo-second-look.json')
  const marks = JSON.parse(await readFile(looksFile, 'utf8'))
  marks[original.url].look = { said: 'clear', by: 'reviewer', on: '2026-11-26' }
  await writeFile(looksFile, JSON.stringify(marks))
  await putBackCleared(root, async () => [])
  const restored = await publicView()
  expect(restored.species.find(s => s.id === 'alpha')!.photos[0]).toMatchObject({ url: original.url, author: original.author })
  expect(restored.galleries.alpha![0]).toMatchObject({ url: original.url, author: original.author })
  expect(restored.photoWaits!(altered.url)).toBe(true)
})

test('the standalone screen also holds a passed head whose sibling is unjudged', async () => {
  const old = photo('head-dead'), pending = photo('unjudged')
  const root = await onePage([old, pending])
  await writeFile(join(root, 'engine-state/_photo-check.json'), JSON.stringify({ [old.url]: { ok: 'yes', typical: true } }))
  const out = await screenDead(root, deps().d.dead, { limit: 1 })
  expect(out.held).toEqual([`${old.url}: species/a`])
  expect(await urls(root, 'a')).toEqual([old.url, pending.url])
})

test("after the photos it owes, the screen takes album photos no look of its own or a person's has judged, the photo check's verdict or not: a dead one leaves its album at this push, even when it is the page's last", async () => {
  // The chief of staff, 22 Nov 2026: about 1 in 20 album photos was a catch, whatever the photo check had said.
  const root = await mkdtemp(join(tmpdir(), 'faces-dead-'))
  const put = async (path: string, data: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), `${JSON.stringify(data, null, 2)}\n`) }
  await put('content/species/e/entity.json', { id: 'e', photos: [photo('e-own'), photo('e-checked-dead')], videos: [] })
  await put('content/species/f/entity.json', { id: 'f', photos: [], videos: [] })
  await put('content/gallery/e.json', { id: 'e', seen: 4, updatedAt: '2026-11-22', photos: [photo('e-checked-dead'), photo('e-live'), photo('e-screened'), photo('e-cleared')] })
  // f shows no own photo: its one album photo is its last.
  await put('content/gallery/f.json', { id: 'f', seen: 1, updatedAt: '2026-11-22', photos: [photo('f-only-dead')] })
  await put('engine-state/_photo-faces.json', { [m('e-own')]: 0, [m('e-checked-dead')]: 0 })
  await put('engine-state/_dead-screen.json', { [m('e-own')]: { dead: false, note: 'live fish in a tank' }, [m('e-screened')]: { dead: false, note: 'live fish in a tank' } })
  await put('engine-state/_photo-subjects.json', {
    [m('e-checked-dead')]: { e: { ok: 'yes', typical: true, note: '', logo: false } },
    [m('f-only-dead')]: { f: { ok: 'yes', typical: true, note: '', logo: false } },
  })
  await put('engine-state/_photo-second-look.json', { [m('e-cleared')]: { why: 'watermark: withheld [sha256:' + '0'.repeat(64) + ']', step: 'the watermark screen', pages: ['species/e'], at: '2026-11-20', look: { said: 'clear', by: 'the chief of staff', on: '2026-11-21' } } })
  const album = async (id: string) => (await json(root, `content/gallery/${id}.json`)).photos.map((p: { url: string }) => p.url)
  const withAlbums = (dd: ReturnType<typeof deps>['d']) => screenNewPhotos(join(root, 'content'), join(root, 'engine-state/_photo-faces.json'), dd, join(root, 'engine-state/_photo-rejected.json'), root, { albumSheets: 1 })
  // None by default, until the chief of staff sets the pace: a hand run gives the sheets. The step says how many wait.
  const none = deps()
  expect(await run(root, none.d)).toEqual({ faces: expect.objectContaining({ checked: 0 }), owed: 0, albums: expect.objectContaining({ sheets: 0, judged: 0, left: 3 }) })
  expect(none.sent).toEqual([])
  const { d, sent } = deps()
  const r = await withAlbums(d)
  expect(r.dead).toBeUndefined()
  expect(sent).toEqual([m('e-checked-dead'), m('e-live'), m('f-only-dead')])
  expect(r.albums).toMatchObject({ sheets: 1, judged: 3, left: 0, failed: [] })
  expect(r.albums!.dead).toEqual([`${m('e-checked-dead')}: dead screen dead`, `${m('f-only-dead')}: dead screen dead`])
  expect(await album('e')).toEqual([m('e-live'), m('e-screened'), m('e-cleared')])
  // Its copy among the page's own photos (a head picked from the album) is off the page at the same push.
  expect(await urls(root, 'e')).toEqual([m('e-own')])
  expect((await json(root, 'content/gallery/e.json')).seen).toBe(4)
  // The album verdict takes off f's only photo even though the photo check previously passed it.
  expect(r.albums!.firstOff).toEqual([])
  expect(r.albums!.held).toEqual([])
  expect(await album('f')).toEqual([])
  const rejected = await json(root, 'engine-state/_photo-rejected.json')
  expectControlledRejections(rejected, { [m('e-checked-dead')]: 'dead', [m('f-only-dead')]: 'dead' })
  // Album photos are never on the owed list: none of them waits on a public page for this.
  expect(await owed(root)).toEqual([])
  // Judged now: the next run sends none.
  const next = deps()
  expect(await withAlbums(next.d)).toMatchObject({ faces: { checked: 0 }, owed: 0, albums: { sheets: 0, judged: 0, left: 0 } })
  expect(next.sent).toEqual([])
  // A failed image is still owed and gets another turn.
  await put('content/gallery/f.json', { id: 'f', seen: 1, updatedAt: '2026-11-22', photos: [photo('f-unreadable')] })
  const failed = deps({ unreadable: m('f-unreadable') })
  expect((await withAlbums(failed.d)).albums).toMatchObject({ sheets: 0, judged: 0, left: 1, failed: [expect.any(String)] })
  const retry = deps()
  expect((await withAlbums(retry.d)).albums).toMatchObject({ sheets: 1, judged: 1, left: 0, failed: [] })
  expect(retry.sent).toEqual([m('f-unreadable')])
})

test('an album can owe the original beneath an alteration with a verdict', async () => {
  const root = await mkdtemp(join(tmpdir(), 'faces-dead-'))
  const gallery = join(root, 'content/gallery')
  const state = join(root, 'engine-state')
  await mkdir(gallery, { recursive: true })
  await mkdir(state, { recursive: true })
  await writeFile(join(gallery, 'a.json'), JSON.stringify({
    id: 'a', photos: [{ ...photo('upscaled'), altered: [{ method: 'lanczos3-upscale' }], original: { url: m('original-dead') } }],
  }))
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [m('upscaled')]: { dead: false } }))
  const { d, sent } = deps()
  const r = await screenNewPhotos(join(root, 'content'), join(state, '_photo-faces.json'), d, join(state, '_photo-rejected.json'), root, { albumSheets: 1 })
  expect(sent).toEqual([m('original-dead')])
  expect(r.albums).toMatchObject({ judged: 1, left: 0, dead: [expect.stringContaining(m('original-dead'))] })
  expectControlledRejections(await json(root, 'engine-state/_photo-rejected.json'), { [m('original-dead')]: 'dead' })
})

test('the album photos take the sheets a run allows, after every photo the screen owes; the rest wait for later runs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'faces-dead-'))
  const put = async (path: string, data: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), `${JSON.stringify(data, null, 2)}\n`) }
  await put('content/species/g/entity.json', { id: 'g', photos: [photo('g-new-live')], videos: [] })
  await put('content/gallery/g.json', { id: 'g', seen: 15, updatedAt: '2026-11-22', photos: Array.from({ length: 15 }, (_, i) => photo(`g${String(i).padStart(2, '0')}-live`)) })
  await mkdir(join(root, 'engine-state'), { recursive: true })
  const { d, sent } = deps()
  const r = await screenNewPhotos(join(root, 'content'), join(root, 'engine-state/_photo-faces.json'), d, join(root, 'engine-state/_photo-rejected.json'), root, { albumSheets: 1 })
  expect(sent[0]).toBe(m('g-new-live'))
  expect(sent.slice(1)).toEqual(Array.from({ length: 12 }, (_, i) => m(`g${String(i).padStart(2, '0')}-live`)))
  expect(r).toMatchObject({ owed: 0, dead: { judged: 1 }, albums: { sheets: 1, judged: 12, left: 3 } })
  // A stop at the step's line on the owed photos leaves the albums for the next run.
  const again = await mkdtemp(join(tmpdir(), 'faces-dead-'))
  await mkdir(join(again, 'content/species/g'), { recursive: true })
  await mkdir(join(again, 'content/gallery'), { recursive: true })
  await mkdir(join(again, 'engine-state'), { recursive: true })
  await writeFile(join(again, 'content/species/g/entity.json'), JSON.stringify({ id: 'g', photos: [photo('g-new-live')], videos: [] }))
  await writeFile(join(again, 'content/gallery/g.json'), JSON.stringify({ id: 'g', seen: 1, updatedAt: '2026-11-22', photos: [photo('g-album-live')] }))
  const stopped = deps({ stop: true })
  const s = await screenNewPhotos(join(again, 'content'), join(again, 'engine-state/_photo-faces.json'), stopped.d, join(again, 'engine-state/_photo-rejected.json'), again)
  expect(s.dead).toMatchObject({ stopped: 'usage limit' })
  expect(s.albums).toMatchObject({ sheets: 0, left: 1 })
  expect(stopped.sent).toEqual([m('g-new-live')])

  // An unanswered tile keeps the page photo owed even when the sheet returned without throwing.
  const unanswered = deps()
  const incomplete = { ...unanswered.d, dead: { ...unanswered.d.dead, look: async () => ({ tiles: [] }) } }
  const pending = await screenNewPhotos(join(again, 'content'), join(again, 'engine-state/_photo-faces.json'), incomplete, join(again, 'engine-state/_photo-rejected.json'), again, { albumSheets: 1 })
  expect(pending).toMatchObject({ owed: 1, dead: { judged: 0, failed: [] } })
  expect(pending.albums).toMatchObject({ sheets: 0, left: 1 })
  expect(unanswered.sent).toEqual([m('g-new-live')])
})


async function albumFixture(photos: ReturnType<typeof photo>[]) {
  const root = await mkdtemp(join(tmpdir(), 'faces-album-'))
  const state = join(root, 'engine-state')
  const file = join(root, 'content/gallery/a.json')
  await mkdir(state, { recursive: true })
  await mkdir(join(root, 'content/gallery'), { recursive: true })
  await writeFile(file, JSON.stringify({ id: 'a', photos, seen: photos.length, updatedAt: '2026-11-26' }))
  return { root, state, file }
}

test.each([false, true])('an album pass applies a held verdict and preserves recovery (source hold: %s)', async sourceHold => {
  const source = 'https://live.staticflickr.com/123/456_abc.jpg'
  const dead = { ...photo('held-dead'), ...(sourceHold ? { url: `https://media.aquatome.com/${mirrorPlan(source)!.key}` } : {}) }
  const reviewUrl = sourceHold ? source : dead.url
  const { root, state, file } = await albumFixture([dead])
  const markFile = join(state, '_photo-second-look.json')
  await cp(new URL('../../schema/test/fixtures/store/sources.json', import.meta.url), join(root, 'content/sources.json'))
  await mkdir(join(root, 'content/species/a'), { recursive: true })
  await writeFile(join(root, 'content/species/a/entity.json'), JSON.stringify({ id: 'a', photos: [dead] }))
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [dead.url]: { dead: true, note: '' } }))
  await writeFile(markFile, JSON.stringify({
    [reviewUrl]: { why: 'dead: withheld', step: 'the dead-fish screen', at: '2026-11-26', pages: ['species/a'] },
  }))
  const { d, sent } = deps()
  vi.stubEnv('AQ_PUT_BACK_ENTRIES', join(root, 'private-put-back'))
  try {
    const out = await screenDead(root, d.dead, { limit: 0, albums: true })
    expect(out).toMatchObject({ sheets: 0, judged: 0, left: 0, dead: [expect.stringContaining(dead.url)] })
    expect(sent).toEqual([])
    expect(JSON.parse(await readFile(file, 'utf8')).photos).toEqual([])
    expect(await urls(root, 'a')).toEqual([])

    const marks = await json(root, 'engine-state/_photo-second-look.json')
    expect(marks[reviewUrl]).toMatchObject({ off: true, left: expect.arrayContaining([
      expect.objectContaining({ file: 'content/species/a/entity.json', index: 0 }),
      expect.objectContaining({ file: 'content/gallery/a.json', index: 0 }),
    ]) })
    marks[reviewUrl].look = { said: 'clear', by: 'reviewer', on: '2026-11-26' }
    await writeFile(markFile, JSON.stringify(marks))
    await sweep(root, { history: async () => [] })
    expect(await urls(root, 'a')).toEqual([dead.url])
    expect(JSON.parse(await readFile(file, 'utf8')).photos).toEqual([dead])
    expect((await screenDead(root, d.dead, { limit: 12, albums: true })).dead).toEqual([])
  } finally { vi.unstubAllEnvs() }
})

test.each([false, true])('a dead alteration is reported once and its original survives gallery and face cleanup (kept mark: %s)', async keptMark => {
  const original = { ...photo('original-live'), ...(keptMark ? { url: 'https://media.aquatome.com/glaser/sample.webp' } : {}) }
  const altered = {
    ...photo('stored-dead'),
    altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'b'.repeat(64) }],
    original: { url: original.url, width: original.width, height: original.height },
  }
  const { root, state, file } = await albumFixture([altered])
  await cp(new URL('../../schema/test/fixtures/store/sources.json', import.meta.url), join(root, 'content/sources.json'))
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [original.url]: { dead: false }, [altered.url]: { dead: true } }))
  if (keptMark) {
    await writeFile(join(state, '_photo-rejected.json'), JSON.stringify({ [original.url]: 'watermark: withheld' }))
    await writeFile(join(state, '_photo-watermarks.json'), JSON.stringify({ [original.url]: {
      ocr: [], watermark: true, retainedOwnMark: { owner: 'source', source: 'glaser', sourceUrl: 'https://www.aquariumglaser.de/sample/' },
    } }))
  }
  const own = join(root, 'content/species/a/entity.json')
  await mkdir(join(own, '..'), { recursive: true })
  await writeFile(own, JSON.stringify({ id: 'a', photos: [altered] }))
  const { d, sent } = deps()
  expect((await screenDead(root, d.dead, { limit: 12, albums: true })).dead).toEqual([expect.stringContaining(altered.url)])
  expect((await json(root, 'engine-state/_photo-rejected.json'))[altered.url]).toMatch(/^dead: /)
  expect(JSON.parse(await readFile(file, 'utf8')).photos).toEqual([altered])
  expect(await screenDead(root, d.dead, { limit: 12, albums: true })).toMatchObject({ sheets: 0, judged: 0, left: 0, dead: [] })
  expect(sent).toEqual([])
  const unused = async () => { throw new Error('Gallery cleanup needs no source or model') }
  const cleanup: GalleryDeps = { get: unused, http: unused, look: unused, faces: unused, sleep: unused, now: () => new Date() }
  await galleries(root, cleanup, { sheets: 0, only: 'missing' })
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [original.url]: 0, [altered.url]: 0 }))
  await run(root, d)
  expect(JSON.parse(await readFile(file, 'utf8')).photos).toEqual([altered])
  expect(JSON.parse(await readFile(own, 'utf8')).photos).toEqual([altered])
})

test.each(['screen cache', 'page rejection'])('zero album sheets apply a known take-off from the %s to the album and guide', async source => {
  const dead = photo('known-dead')
  const { root, state, file } = await albumFixture([dead])
  const guide = join(root, 'content/guides/example/entity.json')
  await mkdir(join(guide, '..'), { recursive: true })
  await writeFile(guide, JSON.stringify({ photos: [dead] }))
  if (source === 'screen cache') await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [dead.url]: { dead: true } }))
  else await writeFile(join(state, '_photo-rejected.json'), JSON.stringify({ [dead.url]: 'dead: withheld' }))
  const { d, sent } = deps()
  const out = await screenDead(root, d.dead, { limit: 0, albums: true })
  expect(out).toMatchObject({ sheets: 0, left: 0, dead: [expect.stringContaining(dead.url)] })
  expect(JSON.parse(await readFile(file, 'utf8')).photos).toEqual([])
  expect(JSON.parse(await readFile(guide, 'utf8')).photos).toEqual([])
  expect((await screenDead(root, d.dead, { limit: 0, albums: true })).dead).toEqual([])
  expect(sent).toEqual([])
})

test('a zero-sheet take-off leaves an independent permanent rejection in place', async () => {
  const dead = photo('known-dead')
  const { root, state, file } = await albumFixture([dead])
  const rejected = { [dead.url]: 'dead: withheld' }
  await writeFile(join(state, '_photo-rejected.json'), JSON.stringify(rejected))
  await writeFile(join(state, '_photo-second-look.json'), JSON.stringify({
    [dead.url]: { why: 'watermark: held', pages: ['species/a'], at: '2026-11-26', step: 'the watermark screen' },
  }))

  const result = await screenDead(root, deps().d.dead, { limit: 0, albums: true })

  expect(result).toMatchObject({ sheets: 0, pendingTakeOffs: 0, dead: [expect.stringContaining(dead.url)] })
  expect((await json(root, 'engine-state/_photo-rejected.json'))[dead.url]).toMatch(/^dead: /)
  expect(JSON.parse(await readFile(file, 'utf8')).photos).toEqual([])
})

test('a retained album original does not strand a dead alias in a guide stock slot', async () => {
  const source = 'https://live.staticflickr.com/123/456_abc.jpg'
  const mirror = `https://media.aquatome.com/${mirrorPlan(source)!.key}`
  const original = photo('original-live')
  const stored = { ...photo('stored'), url: mirror, altered: [{ method: 'lanczos3-upscale' }], original }
  const { root, state, file } = await albumFixture([stored])
  const guide = join(root, 'content/guides/example/entity.json')
  await mkdir(join(guide, '..'), { recursive: true })
  await writeFile(guide, JSON.stringify({ video: { figures: [{ photo: { ...photo('stock'), url: source }, moments: [] }] } }))
  await writeFile(join(state, '_photo-rejected.json'), JSON.stringify({ [source]: 'dead: withheld' }))
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [original.url]: { dead: false } }))

  const result = await screenDead(root, deps().d.dead, { limit: 0, albums: true })

  expect(result).toMatchObject({ dead: [expect.stringContaining(mirror)], pendingTakeOffs: 0, left: 0 })
  expect(JSON.parse(await readFile(guide, 'utf8')).video.figures).toEqual([])
  expect(JSON.parse(await readFile(file, 'utf8')).photos).toEqual([stored])
  expect((await screenDead(root, deps().d.dead, { limit: 0, albums: true })).dead).toEqual([])
})

test('a hold that cannot be captured is reported as a pending take-off', async () => {
  const dead = photo('known-dead')
  const { root, state, file } = await albumFixture([dead])
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [dead.url]: { dead: true } }))
  await writeFile(join(state, '_photo-second-look.json'), JSON.stringify({
    [dead.url]: { why: 'dead: held', pages: ['species/a'], at: '2026-11-26', step: 'the dead-fish screen' },
  }))

  expect(await screenDead(root, deps().d.dead, { limit: 0, albums: true })).toMatchObject({ left: 0, pendingTakeOffs: 1, dead: [] })
  expect(JSON.parse(await readFile(file, 'utf8')).photos).toEqual([dead])
})

test.each(['_dead-screen.json', '_photo-watermarks.json'])('an unreadable %s returns no album balance', async filename => {
  const { root, state } = await albumFixture([photo('photo')])
  await mkdir(join(state, filename))
  await expect(screenDead(root, deps().d.dead, { limit: 0, albums: true })).rejects.toThrow()
})

test('a human clear at a source address satisfies the album’s mirror without another tile', async () => {
  const source = 'https://live.staticflickr.com/123/456_abc.jpg'
  const mirror = { ...photo('mirror'), url: `https://media.aquatome.com/${mirrorPlan(source)!.key}` }
  const { root, state } = await albumFixture([mirror])
  await writeFile(join(state, '_photo-second-look.json'), JSON.stringify({
    [source]: { why: 'dead: withheld', pages: ['species/a'], at: '2026-11-26', step: 'the dead-fish screen',
      look: { on: '2026-11-26', said: 'clear', by: 'reviewer' } },
  }))
  const { d, sent } = deps()
  expect(await screenDead(root, d.dead, { limit: 12, albums: true })).toMatchObject({ sheets: 0, judged: 0, left: 0 })
  expect(sent).toEqual([])
})

test.each(['missing album directory', 'unreadable guide'])('an incomplete inventory fails for a %s', async condition => {
  const dead = photo('known-dead')
  const { root, state } = await albumFixture([dead])
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [dead.url]: { dead: true } }))
  if (condition === 'missing album directory') await rm(join(root, 'content/gallery'), { recursive: true })
  else await mkdir(join(root, 'content/guides/example/entity.json'), { recursive: true })
  const { d, sent } = deps()
  await expect(screenDead(root, d.dead, { limit: 0, albums: true })).rejects.toThrow()
  expect(sent).toEqual([])
})

test('an unreadable album reports a failed count rather than a cleared backlog', async () => {
  const { root } = await albumFixture([])
  await mkdir(join(root, 'content/gallery/unreadable.json'))
  const { d, sent } = deps()
  const result = await run(root, d)
  expect(result.albums).toBeUndefined()
  expect(result.albumsFailed).toBeDefined()
  expect(sent).toEqual([])
})

test('conflicting album answers leave their tile owed and repeated identical answers count once', async () => {
  const a = photo('a'), b = photo('b')
  const { root, state, file } = await albumFixture([a, b])
  const { d } = deps()
  const out = await screenDead(root, { ...d.dead, look: async () => ({ tiles: [
    { n: 1, dead: true, note: '' }, { n: 1, dead: false, note: '' },
    { n: 2, dead: false, note: '' }, { n: 2, dead: false, note: '' },
  ] }) }, { limit: 12, albums: true })
  expect(out).toMatchObject({ sheets: 1, judged: 1, left: 1, dead: [], failed: [`${a.url}: conflicting screen answers`] })
  expect(Object.keys(JSON.parse(await readFile(join(state, '_dead-screen.json'), 'utf8')))).toEqual([b.url])
  expect(JSON.parse(await readFile(file, 'utf8')).photos).toEqual([a, b])
})

test('a whole window of corrupt album images still lets a later readable photo advance', async () => {
  const corrupt = Array.from({ length: 12 }, (_, i) => photo(`corrupt-${i}`))
  const readable = photo('readable')
  const { root, state } = await albumFixture([...corrupt, readable])
  const real = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#468' } }).png().toBuffer()
  const sent: string[] = []
  const d: DeadScreenDeps = {
    get: async u => { sent.push(u); return u === readable.url ? real : Buffer.from('incorrect media type') },
    look: async () => ({ tiles: [{ n: 1, dead: false, note: '' }] }),
  }
  const first = await screenDead(root, d, { limit: 12, albums: true })
  expect(first).toMatchObject({ sheets: 0, judged: 0, left: 13 })
  expect(first.failed).toHaveLength(12)
  expect(sent).toEqual(corrupt.map(p => p.url))
  sent.length = 0
  const second = await screenDead(root, d, { limit: 12, albums: true })
  expect(sent[0]).toBe(readable.url)
  expect(second).toMatchObject({ sheets: 1, judged: 1, left: 12 })
  expect(Object.keys(JSON.parse(await readFile(join(state, '_dead-screen.json'), 'utf8')))).toEqual([readable.url])
})

test('an album photo whose shop watermark was kept still owes the dead-fish screen', async () => {
  const p = { ...photo('kept'), url: 'https://media.aquatome.com/glaser/sample.webp' }
  const { root, state } = await albumFixture([p])
  await writeFile(join(state, '_photo-rejected.json'), JSON.stringify({ [p.url]: 'watermark: withheld' }))
  await writeFile(join(state, '_photo-watermarks.json'), JSON.stringify({ [p.url]: {
    ocr: [], watermark: true, retainedOwnMark: { owner: 'source', source: 'glaser', sourceUrl: 'https://www.aquariumglaser.de/sample/' },
  } }))
  const { d, sent } = deps()
  expect(await screenDead(root, d.dead, { limit: 0, albums: true })).toMatchObject({ judged: 0, left: 1 })
  expect(sent).toEqual([])
  expect(await screenDead(root, d.dead, { limit: 12, albums: true })).toMatchObject({ judged: 1, left: 0 })
  expect(sent).toEqual([p.url])
})

test('a confirmed dead verdict takes effect before the sweep copies the mark to the rejection list', async () => {
  const dead = photo('known-dead')
  const { root, state, file } = await albumFixture([dead])
  const why = 'dead: withheld'
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [dead.url]: { dead: true } }))
  await writeFile(join(state, '_photo-second-look.json'), JSON.stringify({
    [dead.url]: { why, pages: ['species/a'], at: '2026-11-26', step: 'the dead-fish screen',
      look: { said: 'agree', by: 'reviewer', on: '2026-11-26' } },
  }))
  const { d, sent } = deps()
  const report = await screenDead(root, d.dead, { limit: 0, albums: true })
  expect(report).toMatchObject({ sheets: 0, left: 0, pendingTakeOffs: 0, dead: [expect.stringContaining(dead.url)] })
  expect(JSON.parse(await readFile(file, 'utf8')).photos).toEqual([])
  expectControlledRejections(await json(root, 'engine-state/_photo-rejected.json'), { [dead.url]: 'dead' })
  expect(sent).toEqual([])
})

test.each([false, true])('a failed breed write leaves its album entry available for retry (watermark hold: %s)', async held => {
  const dead = photo('known-dead')
  const { root, state, file } = await albumFixture([dead])
  const breed = join(root, 'content/breeds/beta/entity.json')
  await mkdir(join(breed, '..'), { recursive: true })
  await writeFile(breed, JSON.stringify({ id: 'beta', photos: [dead] }))
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [dead.url]: { dead: true } }))
  if (held) {
    vi.stubEnv('AQ_PUT_BACK_ENTRIES', join(root, 'private-put-back'))
    onTestFinished(() => { vi.unstubAllEnvs() })
    await writeFile(join(state, '_photo-second-look.json'), JSON.stringify({
      [dead.url]: { why: 'watermark: withheld', pages: ['breeds/beta'], at: '2026-11-26', step: 'the watermark screen' },
    }))
    await writeFile(join(state, '_photo-rejected.json'), JSON.stringify({ [dead.url]: waitingEntry('watermark: withheld') }))
  }
  const replace = imageWrites.replacePhotoDocument
  const failing = vi.spyOn(imageWrites, 'replacePhotoDocument').mockImplementation(async (path, bytes) => {
    if (path === breed) throw new Error('simulated breed write failure')
    await replace(path, bytes)
  })
  const { d } = deps()
  try {
    await expect(screenDead(root, d.dead, { limit: 0, albums: true })).rejects.toThrow('simulated breed write failure')
  } finally { failing.mockRestore() }
  expect(JSON.parse(await readFile(file, 'utf8')).photos).toEqual([dead])

  expect((await screenDead(root, d.dead, { limit: 0, albums: true })).dead).toEqual([expect.stringContaining(dead.url)])
  expect(JSON.parse(await readFile(breed, 'utf8')).photos).toEqual([])
  expect(JSON.parse(await readFile(file, 'utf8')).photos).toEqual([])
  expect((await screenDead(root, d.dead, { limit: 0, albums: true })).dead).toEqual([])
})

test('face cleanup keeps a waiting stock slot and a separately eligible stock original', async () => {
  const waiting = photo('waiting-stock')
  const original = photo('stock-original')
  const stored = {
    ...photo('stored-dead'),
    altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'a'.repeat(64) }],
    original: { url: original.url, width: original.width, height: original.height },
  }
  const { root, state } = await albumFixture([waiting, stored])
  const figureFile = join(root, 'content/guides/sample/entity.json')
  await mkdir(join(figureFile, '..'), { recursive: true })
  const guide = { id: 'sample', video: { figures: [{ photo: waiting }, { photo: stored }] } }
  await writeFile(figureFile, JSON.stringify(guide))
  const rejected = join(state, '_photo-rejected.json')
  await writeFile(rejected, JSON.stringify({ [waiting.url]: waitingEntry('dead: withheld'), [stored.url]: 'dead: withheld' }))
  const { d } = deps()
  await dropFacePhotos(join(root, 'content'), join(state, '_photo-faces.json'), d, rejected, root)
  expect(JSON.parse(await readFile(figureFile, 'utf8'))).toEqual(guide)
})

test('an unreadable watermark record stops cleanup before a shop original can be removed', async () => {
  const shop = { ...photo('shop'), source: 'example' }
  const { root, state, file } = await albumFixture([shop])
  const page = join(root, 'content/species/a/entity.json')
  await mkdir(join(page, '..'), { recursive: true })
  await writeFile(page, JSON.stringify({ id: 'a', photos: [shop] }))
  await writeFile(join(state, '_photo-rejected.json'), JSON.stringify({ [shop.url]: 'watermark: withheld' }))
  await mkdir(join(state, '_photo-watermarks.json'))

  await expect(run(root, deps().d)).rejects.toThrow()
  expect(JSON.parse(await readFile(page, 'utf8')).photos).toEqual([shop])
  const unused = async () => { throw new Error('No source in this test') }
  await expect(galleries(root, { get: unused, http: unused, look: unused, faces: unused, sleep: unused, now: () => new Date() },
    { sheets: 0 })).rejects.toThrow()
  expect(JSON.parse(await readFile(file, 'utf8')).photos).toEqual([shop])
})

test.each([false, true])('multiple non-commercial replacements cannot displace the last passed head (same address: %s)', async sameAddress => {
  const head = photo('passed-dead')
  const nc = [41, 42].map(id => ({
    ...photo(`non-commercial-${id}`),
    url: `https://media.aquatome.com/inaturalist/${sameAddress ? 41 : id}.webp`,
    sourceUrl: `https://www.inaturalist.org/photos/${id}`,
    licence: 'CC BY-NC 4.0',
  }))
  const { root, state, publicView } = await publicFixture([head, ...nc], [], [head.url, ...nc.map(p => p.url)])
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify(Object.fromEntries(nc.map(p => [p.url, { dead: false }]))))
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify(Object.fromEntries([head, ...nc].map(p => [p.url, 0]))))
  await writeFile(join(state, '_photo-check.json'), JSON.stringify({ [head.url]: { ok: 'yes', person: false } }))

  const result = await run(root, deps().d)

  expect(result.dead?.held).toEqual([`${head.url}: species/alpha`])
  expect((await publicView()).species.find(page => page.id === 'alpha')?.photos.map(p => p.url)).toEqual([head.url])
})

test('an unanswered source hold cannot replace a clear on its mirror', async () => {
  const source = { ...photo('source'), url: 'https://live.staticflickr.com/123/456_abc.jpg' }
  const mirror = { ...source, url: `https://media.aquatome.com/${mirrorPlan(source.url)!.key}` }
  const { root, state, publicView } = await publicFixture([source, mirror], [mirror], [source.url, mirror.url])
  const marks = {
    [source.url]: { why: 'watermark: logo', pages: ['species/alpha'], at: '2026-11-25', step: 'the watermark screen' },
    [mirror.url]: { why: 'dead: withheld', pages: ['species/alpha'], at: '2026-11-26', step: 'the dead-fish screen', off: true, back: '2026-11-26',
      look: { said: 'clear', by: 'reviewer', on: '2026-11-26' } },
  }
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [source.url]: 0, [mirror.url]: 0 }))
  await writeFile(join(state, '_dead-screen.json'), '{}')
  await writeFile(join(state, '_photo-second-look.json'), JSON.stringify(marks))
  const { d, sent } = deps()
  d.dead.look = async () => { throw new Error('The photo already received a human clear') }

  await run(root, d)

  expect(sent).toEqual([])
  expect(await json(root, 'engine-state/_photo-second-look.json')).toEqual(marks)
  expect((await publicView()).galleries.alpha?.map(p => p.url)).toEqual([mirror.url])
})

test('the photo check cannot replace a clear on the mirror with a first refusal at an unanswered source hold', async () => {
  const source = { ...photo('source'), url: 'https://live.staticflickr.com/123/456_abc.jpg' }
  const mirror = { ...source, url: `https://media.aquatome.com/${mirrorPlan(source.url)!.key}` }
  const { root, state, publicView } = await publicFixture([source, mirror], [mirror], [source.url, mirror.url])
  const marks = {
    [source.url]: { why: 'watermark: logo', pages: ['species/alpha'], at: '2026-11-25', step: 'the watermark screen' },
    [mirror.url]: { why: 'dead: withheld', pages: ['species/alpha'], at: '2026-11-26', step: 'the dead-fish screen', off: true, back: '2026-11-26',
      look: { said: 'clear', by: 'reviewer', on: '2026-11-26' } },
  }
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [source.url]: 0, [mirror.url]: 0 }))
  await writeFile(join(state, '_dead-screen.json'), '{}')
  await writeFile(join(state, '_photo-second-look.json'), JSON.stringify(marks))
  let fetched = 0
  const check = await checkPagePhotos(root, {
    get: async () => { fetched++; return new Uint8Array(await sharp({ create: { width: 80, height: 60, channels: 3, background: '#468' } }).png().toBuffer()) },
    look: async () => ({ photos: Array.from({ length: fetched }, (_, i) => ({ n: i + 1, ok: 'dead' as const, typical: false, person: false, logo: false, note: '' })) }),
  }, { limit: 1 })

  expect(check.judged).toBeGreaterThan(0)
  expect(check.blocked).toEqual([])
  expect(await json(root, 'engine-state/_photo-second-look.json')).toEqual(marks)
  expect((await publicView()).galleries.alpha?.map(p => p.url)).toEqual([mirror.url])
})

test('an agreed watermark rejection keeps a fallback original off the page and album', async () => {
  const original = photo('marked-original')
  const stored = {
    ...photo('alteration'), altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'a'.repeat(64) }],
    original: { url: original.url, width: original.width, height: original.height },
  }
  const { root, state, publicView } = await publicFixture([stored], [stored], [stored.url, original.url])
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [stored.url]: { dead: false }, [original.url]: { dead: false } }))
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [stored.url]: 0, [original.url]: 0 }))
  await writeFile(join(state, '_photo-watermarks.json'), JSON.stringify({ [stored.url]: { ocr: [] }, [original.url]: { ocr: [], watermark: true } }))
  await writeFile(join(state, '_photo-second-look.json'), JSON.stringify({
    [original.url]: { why: 'watermark: withheld', pages: ['species/alpha'], at: '2026-11-26', step: 'the watermark screen',
      look: { said: 'agree', by: 'reviewer', on: '2026-11-26' } },
  }))

  await sweep(root, { history: async () => [] })

  expect((await json(root, 'engine-state/_photo-rejected.json'))[original.url]).toMatch(/^watermark: /)
  const view = await publicView()
  expect(view.species.find(page => page.id === 'alpha')?.photos).toEqual([])
  expect(view.galleries.alpha).toBeUndefined()
  expect(view.photoWaits!(original.url)).toBe(true)
})

test.each(['watermark', 'fallback', 'withdrawn'])('a non-commercial replacement survives while its sibling is withheld by %s', async condition => {
  const fallback = condition === 'fallback'
  const head = photo('passed-dead'), pending = photo('pending-mark')
  const nc = {
    ...photo('non-commercial'), url: 'https://media.aquatome.com/inaturalist/42.webp',
    sourceUrl: 'https://www.inaturalist.org/photos/42', licence: 'CC BY-NC 4.0',
  }
  const sibling = fallback ? {
    ...photo('upscale'), altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'a'.repeat(64) }],
    original: { url: pending.url, width: pending.width, height: pending.height },
  } : condition === 'withdrawn' ? { ...pending, source: 'glaser' } : pending
  const { root, state, publicView } = await publicFixture([head, sibling, nc], [], [head.url, nc.url, ...(condition !== 'watermark' ? [sibling.url] : [])])
  if (condition === 'withdrawn') {
    const sources = await json(root, 'content/sources.json')
    sources.glaser = { name: 'Sample source', homepage: 'https://example.org', publish: false }
    await writeFile(join(root, 'content/sources.json'), JSON.stringify(sources))
  }
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [nc.url]: { dead: false }, [pending.url]: { dead: false }, ...(fallback ? { [sibling.url]: { dead: false } } : {}) }))
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [head.url]: 0, [nc.url]: 0, [pending.url]: 0, ...(fallback ? { [sibling.url]: 0 } : {}) }))
  await writeFile(join(state, '_photo-check.json'), JSON.stringify({ [head.url]: { ok: 'yes', person: false } }))

  await run(root, deps().d)
  await sweep(root, { history: async () => [] })

  expect((await publicView()).species.find(page => page.id === 'alpha')?.photos.map(p => p.url)).toEqual([nc.url])
})

test.each([false, true])('a retained shop watermark leaves an unjudged original retryable (alteration refused: %s)', async refuseAlteration => {
  const original = { ...photo('retained-live'), url: 'https://media.aquatome.com/glaser/retained-live.webp' }
  const stored = {
    ...photo(refuseAlteration ? 'stored-dead' : 'stored-upscale'), altered: [{ method: 'lanczos3-upscale', date: '2026-11-26', originalHash: 'b'.repeat(64) }],
    original: { url: original.url, width: original.width, height: original.height },
  }
  const { root, state, publicView } = await publicFixture([stored], [stored], [stored.url, original.url])
  await writeFile(join(state, '_photo-watermarks.json'), JSON.stringify({
    [original.url]: { ocr: [], watermark: true, retainedOwnMark: {
      source: 'glaser', sourceUrl: 'https://www.aquariumglaser.de/sample/', owner: 'source', by: 'screen',
    } },
    [stored.url]: { ocr: [] },
  }))
  await writeFile(join(state, '_photo-rejected.json'), JSON.stringify({ [original.url]: 'watermark: withheld' }))
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [stored.url]: 0, [original.url]: 0 }))
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify(refuseAlteration ? {} : { [stored.url]: { dead: false } }))
  if (refuseAlteration) {
    const first = deps({ unreadable: original.url })
    expect((await run(root, first.d)).owed).toBe(1)
    expect(await owed(root)).toEqual([original.url])
    expect((await json(root, 'content/species/alpha/entity.json')).photos).toEqual([stored])
    expect((await publicView()).galleries.alpha).toBeUndefined()
  }
  const { d, sent } = deps()
  expect((await publicView()).photoWaits!(original.url)).toBe(true)
  expect((await run(root, d)).owed).toBe(0)
  expect(sent).toEqual([original.url])
  const view = await publicView()
  expect(view.species.find(page => page.id === 'alpha')?.photos.map(p => p.url)).toEqual([original.url])
  expect(view.galleries.alpha?.map(p => p.url)).toEqual([original.url])
})


test('a failed second album write preserves both applied take-offs for the next report', async () => {
  const first = photo('first-dead'), second = photo('second-dead')
  const { root, state, file } = await albumFixture([first])
  const other = join(root, 'content/gallery/b.json')
  await writeFile(other, JSON.stringify({ id: 'b', photos: [second] }))
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [first.url]: { dead: true }, [second.url]: { dead: true } }))
  const replace = imageWrites.replacePhotoDocument
  const failing = vi.spyOn(imageWrites, 'replacePhotoDocument').mockImplementation(async (path, bytes) => {
    if (path === other) throw new Error('simulated second album write failure')
    await replace(path, bytes)
  })
  const { d } = deps()
  try {
    await expect(screenDead(root, d.dead, { limit: 0, albums: true })).rejects.toThrow('simulated second album write failure')
  } finally { failing.mockRestore() }
  expect(JSON.parse(await readFile(file, 'utf8')).photos).toEqual([])
  expect(JSON.parse(await readFile(other, 'utf8')).photos).toEqual([second])

  const retry = await screenDead(root, d.dead, { limit: 0, albums: true })
  expect(retry.dead).toEqual([expect.stringContaining(first.url), expect.stringContaining(second.url)])
  expect(JSON.parse(await readFile(other, 'utf8')).photos).toEqual([])
  expect(retry.albumBatches).toEqual([{ id: expect.stringMatching(/^[a-f0-9]{64}$/), urls: [first.url, second.url] }])
  // The caller could lose the first report after its files were changed. The same batch stays available.
  const repeated = await screenDead(root, d.dead, { limit: 0, albums: true })
  expect(repeated.dead).toEqual([])
  expect(repeated.albumBatches).toEqual(retry.albumBatches)
  expect(await acknowledgeAlbumTakeOffs(root, retry.albumBatches[0]!.id)).toBe(2)
  expect(await acknowledgeAlbumTakeOffs(root, retry.albumBatches[0]!.id)).toBe(0)
  expect((await screenDead(root, d.dead, { limit: 0, albums: true })).albumBatches).toEqual([])
})

test('an album take-off keeps a waiting guide stock slot through photo check, sweep and human clear', async () => {
  const dead = photo('held-dead')
  const { root, state, file, publicView } = await publicFixture([dead], [dead], [dead.url])
  const guide = join(root, 'content/guides/sample/entity.json')
  await mkdir(join(guide, '..'), { recursive: true })
  const figures = [{ heading: 'Sample part', photo: dead, moments: [] }]
  await writeFile(guide, JSON.stringify({ id: 'sample', photos: [], video: { figures } }))
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [dead.url]: { dead: true } }))
  await writeFile(join(state, '_photo-faces.json'), JSON.stringify({ [dead.url]: 0 }))
  await writeFile(join(state, '_photo-second-look.json'), JSON.stringify({
    [dead.url]: { why: 'dead: withheld', pages: ['species/alpha'], at: '2026-11-26', step: 'the dead-fish screen' },
  }))
  vi.stubEnv('AQ_PUT_BACK_ENTRIES', join(root, 'private-put-back'))
  onTestFinished(() => { vi.unstubAllEnvs() })
  const { d } = deps()

  expect((await screenDead(root, d.dead, { limit: 0, albums: true })).dead).toHaveLength(1)
  const unused = async () => { throw new Error('the fixture must not fetch or judge a photo') }
  await checkPagePhotos(root, { get: unused, look: unused }, { limit: 0, fill: 0 })
  expect(JSON.parse(await readFile(guide, 'utf8')).video.figures).toEqual(figures)
  await sweep(root, { history: async () => [] })
  expect(JSON.parse(await readFile(guide, 'utf8')).video.figures).toEqual(figures)
  const marks = await json(root, 'engine-state/_photo-second-look.json')
  marks[dead.url].look = { said: 'clear', by: 'reviewer', on: '2026-11-26' }
  await writeFile(join(state, '_photo-second-look.json'), JSON.stringify(marks))
  await sweep(root, { history: async () => [] })

  expect(JSON.parse(await readFile(guide, 'utf8')).video.figures).toEqual(figures)
  expect(JSON.parse(await readFile(file, 'utf8')).photos).toEqual([dead])
  expect((await publicView()).galleries.alpha?.map(p => p.url)).toEqual([dead.url])
})

test('agreement with a face hold supersedes an approved shop watermark', async () => {
  const shop = { ...photo('shop'), url: 'https://media.aquatome.com/glaser/shop-face.webp' }
  const { root, state, publicView } = await publicFixture([shop], [shop], [shop.url])
  await writeFile(join(state, '_photo-watermarks.json'), JSON.stringify({
    [shop.url]: { ocr: [], watermark: true, retainedOwnMark: {
      source: 'glaser', sourceUrl: 'https://www.aquariumglaser.de/sample/', owner: 'source', by: 'screen',
    } },
  }))
  await writeFile(join(state, '_photo-rejected.json'), JSON.stringify({ [shop.url]: 'watermark: withheld' }))
  await writeFile(join(state, '_photo-check.json'), JSON.stringify({ [shop.url]: { ok: 'yes', logo: false, person: false } }))
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [shop.url]: { dead: false } }))

  expect((await run(root, deps().d)).faces.held).toEqual([`${shop.url}: species/alpha`])
  expect((await publicView()).galleries.alpha?.map(p => p.url)).toEqual([shop.url])
  const marks = await json(root, 'engine-state/_photo-second-look.json')
  expect(marks[shop.url].off).toBeUndefined()
  marks[shop.url].look = { said: 'agree', by: 'reviewer', on: '2026-11-26' }
  await writeFile(join(state, '_photo-second-look.json'), JSON.stringify(marks))

  await sweep(root, { history: async () => [] })

  expectControlledRejections(await json(root, 'engine-state/_photo-rejected.json'), { [shop.url]: 'people' })
  const view = await publicView()
  expect(view.species.find(page => page.id === 'alpha')?.photos).toEqual([])
  expect(view.galleries.alpha).toBeUndefined()
})

test('an unreadable source permission record stops the dead screen before it removes a passed photo', async () => {
  const only = { ...photo('sole-dead'), source: 'glaser' }
  const root = await onePage([only])
  await writeFile(join(root, 'engine-state/_photo-check.json'), JSON.stringify({ [only.url]: { ok: 'yes', person: false } }))
  await mkdir(join(root, 'content/sources.json'))
  const { d, sent } = deps()

  await expect(screenDead(root, d.dead, { limit: 1 })).rejects.toThrow()
  expect(sent).toEqual([])
  expect(await urls(root, 'a')).toEqual([only.url])
  await expect(readFile(join(root, 'engine-state/_photo-rejected.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
})

test('a mirrored cached death uses the matching older watermark review at its source address', async () => {
  const source = 'https://live.staticflickr.com/123/456_abc.jpg'
  const mirror = { ...photo('held-dead'), url: `https://media.aquatome.com/${mirrorPlan(source)!.key}` }
  const { root, state, file } = await albumFixture([mirror])
  const why = 'watermark: withheld'
  await writeFile(join(state, '_photo-second-look.json'), JSON.stringify({
    [source]: { why, step: 'the watermark screen', pages: ['species/alpha'], at: '2026-11-26' },
  }))
  await writeFile(join(state, '_photo-rejected.json'), JSON.stringify({ [source]: waitingEntry(why), [mirror.url]: waitingEntry(why) }))
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [mirror.url]: { dead: true } }))
  vi.stubEnv('AQ_PUT_BACK_ENTRIES', join(root, 'private-put-back'))
  onTestFinished(() => { vi.unstubAllEnvs() })

  const report = await screenDead(root, deps().d.dead, { limit: 0, albums: true })
  expect(report.dead).toEqual([expect.stringContaining(mirror.url)])
  expect(JSON.parse(await readFile(file, 'utf8')).photos).toEqual([])
})

test('a failed take-off receipt leaves the album present for replay after the sweep', async () => {
  const dead = photo('dead')
  const { root, state, file } = await albumFixture([dead])
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [dead.url]: { dead: true } }))
  const replace = imageWrites.writeImageCache
  const failing = vi.spyOn(imageWrites, 'writeImageCache').mockImplementation(async (path, data) => {
    if (path.endsWith('_photo-album-dead-takeoffs.json')) throw new Error('simulated receipt failure')
    await replace(path, data)
  })
  const d = deps().d.dead
  try {
    await expect(screenDead(root, d, { limit: 0, albums: true })).rejects.toThrow('simulated receipt failure')
  } finally { failing.mockRestore() }
  await writeFile(join(root, 'content/sources.json'), '{}')
  await sweep(root, { history: async () => [] })
  expect(JSON.parse(await readFile(file, 'utf8')).photos).toEqual([dead])
  expect((await screenDead(root, d, { limit: 0, albums: true })).albumBatches).toEqual([{ id: expect.any(String), urls: [dead.url] }])
})

test('a batch acknowledged during the next judgment does not appear again', async () => {
  const first = photo('first-dead'), next = photo('next-dead')
  const { root, state, file } = await albumFixture([first])
  await writeFile(join(state, '_dead-screen.json'), JSON.stringify({ [first.url]: { dead: true } }))
  const before = await screenDead(root, deps().d.dead, { limit: 0, albums: true })
  const acknowledged = before.albumBatches[0]!.id
  await writeFile(file, JSON.stringify({ id: 'alpha', photos: [next] }))
  const { d } = deps()
  const look = d.dead.look
  d.dead.look = async (...args) => {
    expect(await acknowledgeAlbumTakeOffs(root, acknowledged)).toBe(1)
    return look(...args)
  }

  const after = await screenDead(root, d.dead, { limit: 1, albums: true })
  expect(after.albumBatches).toEqual([{ id: expect.any(String), urls: [next.url] }])
  expect(await acknowledgeAlbumTakeOffs(root, acknowledged)).toBe(0)
})
