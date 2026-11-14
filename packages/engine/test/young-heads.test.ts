import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import type { Photo } from '@aq/schema'
import type { Verdicts } from '../src/curation'
import { leadChoice, screenLeads, type LeadDeps } from '../src/lead-photo'
import { checkPagePhotos, PHOTO_CHECK_SCHEMA, recheckCandidates, type PhotoCheckDeps, type PhotoVerdict } from '../src/photo-check'
import { grownFirst, grownHead } from '../src/young-heads'

// A photo the photo check calls young doesn't lead while one of the page's own it calls grown may lead in its place (the
// chief of staff, 15 Nov, after the Deocata pipefish page led with its young among snails). The case the rule is for, the
// Adonis pleco's: a young head the check passed but not as typical, and a grown photo behind it, not typical either.

const ID = 'acanthicus-x'
const url = (n: string) => `https://media.example/${n}.webp`
const name = (u: string) => u.split('/').pop()!.replace('.webp', '')
const photo = (n: string, caption = 'Acanthicus x'): Photo => ({ url: url(n), width: 1600, height: 1200, licence: 'x', author: 'a', sourceUrl: 'https://example.org/x', caption })
const jpeg = sharp({ create: { width: 64, height: 48, channels: 3, background: '#468' } }).jpeg().toBuffer()
const v = (o: Partial<PhotoVerdict>): PhotoVerdict => ({ ok: 'yes', typical: false, note: '', person: false, logo: false, ...o })
const verdicts = (subjects: Record<string, Record<string, PhotoVerdict>>, o: Partial<Verdicts> = {}): Verdicts => ({ subjects, legacy: {}, rejected: {}, faces: {}, ...o })
const refuse = (what: string) => async () => { throw new Error(`no ${what} in this test`) }

test('the check asks the age in the same question, and stores it only for a photo it passes', () => {
  const item = PHOTO_CHECK_SCHEMA.properties.photos.items
  expect(item.required).toContain('young')
  expect(item.properties.young).toEqual({ type: 'boolean' })
})

test('a grown photo may lead in a young one\'s place whether or not it is typical; not when it has a person, a logo, a face, is listed or is a guide\'s', () => {
  const p = photo('grown')
  const at = (o: Partial<PhotoVerdict>, extra: Partial<Verdicts> = {}) => grownHead(verdicts({ [p.url]: { [ID]: v(o) } }, extra))(p, ID)
  expect(at({ young: false })).toBe(true)
  expect(at({ young: false, typical: true })).toBe(true)
  expect(at({})).toBe(false) // not asked
  expect(at({ young: true })).toBe(false)
  expect(at({ young: false, person: true })).toBe(false)
  expect(at({ young: false, logo: true })).toBe(false)
  expect(at({ young: false, guide: true })).toBe(false)
  expect(at({ young: false, ok: 'unsure' })).toBe(false)
  expect(at({ young: false }, { faces: { [p.url]: 1 } })).toBe(false)
  expect(at({ young: false }, { rejected: { [p.url]: 'x' } })).toBe(false)
  expect(at({ young: false }, { kept: u => u === p.url })).toBe(false)
  expect(grownHead(verdicts({ [p.url]: { [ID]: v({ young: false }) } }))({ ...p, caption: 'Acanthicus x, sick, with fin rot' }, ID)).toBe(false)
})

test('grownFirst: the first grown photo takes a young head\'s place, the rest keep their order; nothing moves otherwise', () => {
  const ps = ['ai', 'young', 'other', 'grown', 'grown2'].map(n => ({ url: n, ...(n === 'ai' ? { generated: true } : {}) }))
  const young = (p: { url: string }) => p.url === 'young', grown = (p: { url: string }) => p.url.startsWith('grown')
  expect(grownFirst(ps, young, grown).map(p => p.url)).toEqual(['ai', 'grown', 'young', 'other', 'grown2'])
  expect(grownFirst(ps, () => false, grown)).toBe(ps)
  expect(grownFirst(ps, young, () => false)).toBe(ps)
  const again = grownFirst(ps, young, grown)
  expect(grownFirst(again, young, grown)).toBe(again)
})

test('the lead step: a young head gives way to the page\'s own grown photo, and a young photo never takes the lead from a head that isn\'t young', () => {
  const young = photo('young'), grown = photo('grown'), other = photo('other')
  const age = (p: Photo) => (p.url === young.url ? true : p.url === grown.url ? false : undefined)
  // Neither passes as a card (not typical): only the young rule moves the head.
  expect(leadChoice([young, other, grown], [], () => false, {}, undefined, undefined, undefined, age)).toEqual({ lead: grown })
  expect(leadChoice([young, other, grown], [], () => false, {})).toBeUndefined()
  // Run again on the order it wrote: nothing.
  expect(leadChoice([grown, young, other], [], () => false, {}, undefined, undefined, undefined, age)).toBeUndefined()
  // Named no worse than the head, as the check and the sweep require: a grown photo its source names only to the genus
  // doesn't take a species-named young head's place, though nothing on the page passes as a card (Grok's read).
  const genus = (p: Photo) => (p.url === grown.url ? 2 : 0)
  expect(leadChoice([young, grown], [], () => false, {}, undefined, genus, undefined, age)).toBeUndefined()
  expect(leadChoice([young, other, grown], [], () => false, {}, undefined, (p: Photo) => (p.url === young.url ? 1 : p.url === grown.url ? 1 : 2), undefined, age)).toEqual({ lead: grown })
  // A young photo the check also called typical passes as a card. Compared with a grown head and said to be as good, it
  // would take the lead, and the young rule would give it back each cycle; it doesn't.
  const said = { [grown.url]: { [young.url]: false } }
  expect(leadChoice([grown, young], [], p => p.url === young.url, said)).toEqual({ lead: young })
  expect(leadChoice([grown, young], [], p => p.url === young.url, said, undefined, undefined, undefined, age)).toBeUndefined()
})

/** A page with its own photos, in this order, and the photo check's verdicts on it. */
async function site(photos: Photo[], subjects: Record<string, PhotoVerdict | undefined> = {}, picks: Record<string, string> = {}) {
  const r = await mkdtemp(join(tmpdir(), 'aq-young-'))
  await mkdir(join(r, 'content/species', ID), { recursive: true })
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  await mkdir(join(r, 'engine-state'))
  await mkdir(join(r, 'docs/review'), { recursive: true })
  await writeFile(join(r, 'content/species', ID, 'entity.json'), `${JSON.stringify({ id: ID, scientificName: 'Acanthicus x', photos }, null, 2)}\n`)
  await writeFile(join(r, 'content/species', ID, 'vi.json'), JSON.stringify({ name: 'Cá x' }))
  await writeFile(join(r, 'content/curation.json'), JSON.stringify({ version: 1, weeks: [], days: [], loops: {}, avoid: {}, off: {} }))
  const plain = { ocr: [], watermark: false, kind: 'none' }
  await writeFile(join(r, 'engine-state/_photo-watermarks.json'), JSON.stringify(Object.fromEntries(photos.map(p => [p.url, plain]))))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), '{}')
  await writeFile(join(r, 'engine-state/_photo-subjects.json'), JSON.stringify(Object.fromEntries(Object.entries(subjects).filter(([, x]) => x).map(([u, x]) => [u, { [ID]: x }]))))
  await writeFile(join(r, 'engine-state/_photo-head-picks.json'), JSON.stringify(picks))
  return r
}
const order = async (r: string) => (JSON.parse(await readFile(join(r, 'content/species', ID, 'entity.json'), 'utf8')).photos as Photo[]).map(p => name(p.url))
const stored = async (r: string) => JSON.parse(await readFile(join(r, 'engine-state/_photo-subjects.json'), 'utf8')) as Record<string, Record<string, PhotoVerdict>>

/** The photo check's model: every photo the fish, not typical; young for the names in `young`, grown for the rest. */
function model(young: string[], answersAge = true): PhotoCheckDeps & { asked: string[] } {
  let fetched: string[] = []
  const asked: string[] = []
  return {
    asked,
    get: async u => { fetched.push(u); asked.push(name(u)); return new Uint8Array(await jpeg) },
    look: async () => {
      const photos = fetched.map((u, i) => ({ n: i + 1, ok: 'yes', typical: false, note: 'x', person: false, logo: false, ...(answersAge ? { young: young.includes(name(u)) } : {}) }) as { n: number } & PhotoVerdict)
      fetched = []
      return { photos }
    },
  }
}
const check = (r: string, d: PhotoCheckDeps, recheck?: Set<string>) => checkPagePhotos(r, d, { limit: 10, only: ID, emptyCap: 99, ...(recheck ? { recheck } : {}) })

test('the photo check: the Adonis shape, a young head and a grown photo behind it, neither typical; the grown one leads, and a second run changes nothing', async () => {
  const r = await site([photo('young'), photo('other'), photo('grown')])
  await check(r, model(['young', 'other']))
  expect(await order(r)).toEqual(['grown', 'young', 'other'])
  const s = await stored(r)
  expect([s[url('young')]![ID]!.young, s[url('grown')]![ID]!.young]).toEqual([true, false])
  const again = model([])
  await check(r, again)
  expect(again.asked).toEqual([])
  expect(await order(r)).toEqual(['grown', 'young', 'other'])
})

test('the photo check: an answer with no age is "can\'t tell", which the question counts as grown, so a head is asked once; nothing moves', async () => {
  const r = await site([photo('young'), photo('grown')])
  await check(r, model(['young'], false))
  expect(await order(r)).toEqual(['young', 'grown'])
  expect(Object.values(await stored(r)).map(x => x[ID]!.young)).toEqual([false, false])
  expect([...(await recheckCandidates(r)).keys()]).toEqual([])
})

test('the photo check: a grown photo its source names only to the genus doesn\'t take a young head\'s place', async () => {
  const r = await site([photo('young'), photo('grown', 'Acanthicus sp.')])
  await check(r, model(['young']))
  expect(await order(r)).toEqual(['young', 'grown'])
})

test('a head a person picked stays first, young or not, in the photo check and the lead step', async () => {
  const r = await site([photo('young'), photo('grown')], {}, { [`species/${ID}`]: url('young') })
  await check(r, model(['young']))
  expect(await order(r)).toEqual(['young', 'grown'])
  const lead = await screenLeads(r, { get: refuse('fetch'), look: refuse('model') } as LeadDeps, { limit: 5 })
  expect(lead.changed).toEqual([])
  expect(await order(r)).toEqual(['young', 'grown'])
})

test('the lead step leaves a species-named young head before a grown photo its source names only to the genus', async () => {
  const r = await site([photo('young'), photo('grown', 'Acanthicus sp.')], { [url('young')]: v({ young: true }), [url('grown')]: v({ young: false }) })
  const lead = await screenLeads(r, { get: refuse('fetch'), look: refuse('model') } as LeadDeps, { limit: 5 })
  expect(lead.changed).toEqual([])
  expect(await order(r)).toEqual(['young', 'grown'])
})

test('the lead step moves a young head behind the page\'s grown photo, once', async () => {
  const r = await site([photo('young'), photo('grown')], { [url('young')]: v({ young: true }), [url('grown')]: v({ young: false }) })
  const first = await screenLeads(r, { get: refuse('fetch'), look: refuse('model') } as LeadDeps, { limit: 5 })
  expect(first.changed).toEqual([`species/${ID}: ${url('young')} -> ${url('grown')}`])
  expect(await order(r)).toEqual(['grown', 'young'])
  expect((await screenLeads(r, { get: refuse('fetch'), look: refuse('model') } as LeadDeps, { limit: 5 })).changed).toEqual([])
})

test('the heads judged before the check asked the age are asked again with their pages\' other passed photos, once; then the rule acts', async () => {
  const old = (o: Partial<PhotoVerdict> = {}) => v(o) // judged before the age question: no `young`
  const r = await site([photo('young'), photo('other'), photo('grown')], { [url('young')]: old(), [url('other')]: old({ ok: 'unsure' }), [url('grown')]: old() })
  // A page whose head the check passed as typical isn't asked.
  const typical = await site([photo('young'), photo('grown')], { [url('young')]: old({ typical: true }), [url('grown')]: old() })
  expect([...(await recheckCandidates(typical)).keys()]).toEqual([])
  const due = await recheckCandidates(r)
  expect(Object.fromEntries([...due].map(([u, why]) => [name(u), why]))).toEqual({ young: 'young not asked', grown: 'young not asked' })
  const d = model(['young'])
  await check(r, d, new Set(due.keys()))
  expect(d.asked.sort()).toEqual(['grown', 'young'])
  expect(await order(r)).toEqual(['grown', 'young', 'other'])
  // The answers are kept as stored: nothing is due again.
  expect([...(await recheckCandidates(r)).keys()]).toEqual([])
  const again = model([])
  await check(r, again)
  expect(again.asked).toEqual([])
})

test('a run that isn\'t the recheck leaves heads judged before the age question to it', async () => {
  const r = await site([photo('young'), photo('grown')], { [url('young')]: v({}), [url('grown')]: v({}) })
  const d = model(['young'])
  await check(r, d)
  expect(d.asked).toEqual([])
  expect(await order(r)).toEqual(['young', 'grown'])
})
