import { expectControlledRejections } from './photo-privacy-assertions'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { LlmError } from '../src/claude'
import type { DeadScreenDeps } from '../src/dead-screen'
import { NEW_PHOTO_SHEETS, screenNewPhotos } from '../src/faces'

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
  expectControlledRejections(Object.fromEntries(Object.entries(rejected).filter(([u]) => u !== m('b-dead'))), { [m('a-dead')]: 'dead', [m('c-face')]: 'people' })
  expect(Object.keys(await json(root, 'engine-state/_dead-screen.json')).sort()).toEqual([m('a-dead'), m('a-live'), m('b-dead'), m('c-live')])
  // Each judged now, none is owed.
  expect(await owed(root)).toEqual([])

  // The next run: nothing new to the face finder, so nothing is sent and no model is called.
  const next = deps()
  expect(await run(root, next.d)).toEqual({ faces: expect.objectContaining({ checked: 0, screened: [] }), owed: 0 })
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
  await chmod(join(again, 'content/species/a/entity.json'), 0o444)
  const failed = await run(again, deps().d)
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
