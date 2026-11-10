import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import type { Photo } from '@aq/schema'
import { leadChoice, screenLeads, TRIES, type LeadDeps } from '../src/lead-photo'

const jpeg = sharp({ create: { width: 64, height: 48, channels: 3, background: '#468' } }).jpeg().toBuffer()
const url = (n: string) => `https://media.example/${n}.webp`
const name = (u: string) => u.split('/').pop()!.replace('.webp', '')
const photo = (n: string, width = 1000, height = 667): Photo => ({ url: url(n), width, height, licence: 'x', author: 'a', sourceUrl: 'x' })
const big = (n: string) => photo(n, 1600, 1400)
const yes = () => true

test('a head big enough for the card stays; a page with no photo takes the first that passes, the gallery\'s best first', () => {
  expect(leadChoice([big('head')], [big('other')], yes, {})).toBeUndefined()
  expect(leadChoice([], [big('plain'), { ...big('chosen'), best: true }], yes, {})).toEqual({ lead: { ...big('chosen'), best: true } })
  expect(leadChoice([], [photo('small')], yes, {})).toBeUndefined()
})

test('a large copy counts for the head and for what could replace it', () => {
  const withLarge = { ...photo('head', 960, 640), large: { url: url('head-large'), width: 1800, height: 1200 } }
  expect(leadChoice([withLarge], [big('other')], yes, {})).toBeUndefined()
})

test("a small head waits for the model's answer, gives way to a yes, and tries the next photo after a no; a photo that doesn't pass is never asked about", () => {
  const head = photo('head'), own = big('own'), gal = big('gal')
  const passes = (p: Photo) => p.url !== url('fails')
  expect(leadChoice([head, big('fails'), own], [gal], passes, {})).toEqual({ ask: { head, photo: own } })
  expect(leadChoice([head, own], [gal], passes, { [own.url]: { [head.url]: true } })).toEqual({ lead: own })
  expect(leadChoice([head, own], [gal], passes, { [own.url]: { [head.url]: false } })).toEqual({ ask: { head, photo: gal } })
  expect(leadChoice([head, own], [gal], passes, { [own.url]: { [head.url]: false }, [gal.url]: { [head.url]: false } })).toBeUndefined()
})

test('at most a few photos a fish are asked about', () => {
  const head = photo('head')
  const many = Array.from({ length: TRIES + 2 }, (_, i) => big(`g${i}`))
  const allNo = Object.fromEntries(many.slice(0, TRIES).map(p => [p.url, { [head.url]: false }]))
  expect(leadChoice([head], many, yes, allNo)).toBeUndefined()
})

async function store(fish: Record<string, { photos: Photo[]; gallery?: object[] }>, days: object[] = []) {
  const root = await mkdtemp(join(tmpdir(), 'lead-photos-'))
  await mkdir(join(root, 'engine-state'))
  await mkdir(join(root, 'content/gallery'), { recursive: true })
  const subjects: Record<string, Record<string, object>> = {}
  for (const [id, f] of Object.entries(fish)) {
    await mkdir(join(root, 'content/species', id), { recursive: true })
    await writeFile(join(root, 'content/species', id, 'entity.json'), `${JSON.stringify({ id, photos: f.photos }, null, 2)}\n`)
    if (f.gallery) await writeFile(join(root, 'content/gallery', `${id}.json`), JSON.stringify({ id, photos: f.gallery }))
    for (const p of [...f.photos, ...(f.gallery ?? [])] as Photo[]) (subjects[p.url] ??= {})[id] = { ok: 'yes', typical: true, note: '', person: false, logo: false }
  }
  await writeFile(join(root, 'engine-state/_photo-subjects.json'), JSON.stringify(subjects))
  await writeFile(join(root, 'content/curation.json'), JSON.stringify({ version: 1, weeks: [], days, loops: {}, avoid: {}, off: {} }))
  return root
}
const entity = async (root: string, id: string) => JSON.parse(await readFile(join(root, 'content/species', id, 'entity.json'), 'utf8')) as { photos: (Photo & { best?: boolean })[] }

function model(answer: (photo: string) => boolean) {
  const seen: string[][] = []
  let got: string[] = []
  const d: LeadDeps = {
    get: async u => { got.push(name(u)); return new Uint8Array(await jpeg) },
    look: async () => {
      const sheet = got; got = []
      seen.push(sheet)
      return { pairs: Array.from({ length: sheet.length / 2 }, (_, i) => ({ n: i + 1, asWell: answer(sheet[2 * i + 1]!) })) }
    },
  }
  return { d, seen }
}

test('the Altum: a head too small for the card gives way to a gallery photo the model says is as good, and it stays there on the next run', async () => {
  // The owner (2026-11-10): the card and the page showed different photos, and the head was 608 px across.
  const root = await store({ altum: { photos: [photo('head', 960, 638)], gallery: [{ ...big('gal'), best: true, kind: 'portrait', caption: 'c' }] } })
  const { d, seen } = model(() => true)
  const r = await screenLeads(root, d, { limit: 5 })
  expect(seen).toEqual([['head', 'gal']])
  expect(r.changed).toEqual([`species/altum: ${url('head')} -> ${url('gal')}`])
  const after = await entity(root, 'altum')
  expect(after.photos.map(p => name(p.url))).toEqual(['gal', 'head'])
  expect(after.photos[0]).not.toHaveProperty('best')
  expect(after.photos[0]).not.toHaveProperty('kind')
  expect((await screenLeads(root, d, { limit: 5 })).changed).toEqual([])
  expect(seen).toHaveLength(1)
})

test('a no leaves the head, and the next photo is asked in the same run; no answer changes nothing', async () => {
  const root = await store({ a: { photos: [photo('head')], gallery: [big('tiny-fish'), big('fine')] }, b: { photos: [photo('b-head')], gallery: [big('b-no')] } })
  const { d, seen } = model(p => p === 'fine')
  const r = await screenLeads(root, d, { limit: 5 })
  expect(seen.flat()).toEqual(['head', 'tiny-fish', 'b-head', 'b-no', 'head', 'fine'])
  expect((await entity(root, 'a')).photos.map(p => name(p.url))).toEqual(['fine', 'head'])
  expect((await entity(root, 'b')).photos.map(p => name(p.url))).toEqual(['b-head'])
  expect(r.changed).toHaveLength(1)

  const root2 = await store({ a: { photos: [photo('head')], gallery: [big('gal')] } })
  const none = await screenLeads(root2, model(yes).d, { limit: 0 })
  expect(none).toMatchObject({ sheets: 0, waiting: 1, changed: [] })
  expect((await entity(root2, 'a')).photos.map(p => name(p.url))).toEqual(['head'])
})

test("a photo on the calendar's avoid list doesn't lead; --calendar touches only the coming days' fish, which are asked about first", async () => {
  const days = [{ date: '2099-01-01', fish: 'species/zzz' }]
  const fish = { aaa: { photos: [photo('a-head')], gallery: [big('a-gal')] }, zzz: { photos: [photo('z-head')], gallery: [big('z-avoided'), big('z-gal')] } }
  const root = await store(fish, days)
  const cal = JSON.parse(await readFile(join(root, 'content/curation.json'), 'utf8'))
  await writeFile(join(root, 'content/curation.json'), JSON.stringify({ ...cal, avoid: { [url('z-avoided')]: 'a ruler in the picture' } }))
  const { d, seen } = model(yes)
  await screenLeads(root, d, { limit: 1, calendar: true })
  expect(seen).toEqual([['z-head', 'z-gal']])
  expect((await entity(root, 'zzz')).photos.map(p => name(p.url))).toEqual(['z-gal', 'z-head'])
  expect((await entity(root, 'aaa')).photos.map(p => name(p.url))).toEqual(['a-head'])
})
