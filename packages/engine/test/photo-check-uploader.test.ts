import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { afterEach, expect, test } from 'vitest'
import { nameStep } from '../src/ceiling'
import { checkPagePhotos, type PhotoCheckDeps, type PhotoVerdict } from '../src/photo-check'

// An album photo the check answers "another fish": the same run judges that album's other photos from the same uploader
// that have no verdict for the page, and nothing else (the chief of staff, 2026-11-16).

const jpeg = sharp({ create: { width: 64, height: 48, channels: 3, background: '#3a8' } }).jpeg().toBuffer()
const url = (n: string) => `https://example.org/media/${n}.webp`
const name = (u: string) => u.split('/').pop()!.replace('.webp', '')
const ANGLER = 'Sampletown angler'
const DIVER = 'Sampletown diver'
type P = { author?: string; authorUrl?: string; site?: 'inat' | 'commons'; waits?: boolean }
const photo = (n: string, p: P = {}) => ({
  url: url(n), width: 960, height: 720, licence: 'CC BY 4.0', author: p.author ?? DIVER, ...(p.authorUrl ? { authorUrl: p.authorUrl } : {}),
  sourceUrl: p.site === 'commons' ? `https://commons.example.org/wiki/File:${n}.jpg` : `https://inat.example.org/photos/${n}`,
  ...(p.waits ? { unchecked: true } : {}),
})
const seen: Partial<PhotoVerdict> = { ok: 'yes', typical: true, note: '', logo: false, person: false }
/** Five photos by another uploader, so a page's first sheet is full and its photos that wait are left for later. */
const five = (id: string) => [1, 2, 3, 4, 5].map(i => photo(`${id}-f${i}`))

type Page = { id: string; own?: ReturnType<typeof photo>[]; album: ReturnType<typeof photo>[] }
/** Each page has a lead the check has passed; `verdicts`: photo name → page → verdict already recorded. */
async function root(pages: Page[], verdicts: Record<string, Record<string, Partial<PhotoVerdict>>> = {}) {
  const r = await mkdtemp(join(tmpdir(), 'aq-pc-uploader-'))
  await mkdir(join(r, 'engine-state'))
  await mkdir(join(r, 'docs/review'), { recursive: true })
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  const cache: Record<string, Record<string, Partial<PhotoVerdict>>> = {}
  for (const p of pages) {
    const dir = join(r, 'content/species', p.id)
    await mkdir(dir, { recursive: true })
    const sci = p.id.split('-').map((w, i) => (i ? w : w[0]!.toUpperCase() + w.slice(1))).join(' ')
    await writeFile(join(dir, 'entity.json'), `${JSON.stringify({ id: p.id, scientificName: sci, photos: [photo(`${p.id}-lead`), ...(p.own ?? [])] }, null, 2)}\n`)
    await writeFile(join(dir, 'vi.json'), JSON.stringify({ name: p.id }))
    await writeFile(join(r, 'content/gallery', `${p.id}.json`), `${JSON.stringify({ id: p.id, photos: p.album, seen: 0, updatedAt: '' }, null, 2)}\n`)
    cache[url(`${p.id}-lead`)] = { [p.id]: seen }
  }
  for (const [n, by] of Object.entries(verdicts)) cache[url(n)] = { ...cache[url(n)], ...by }
  await writeFile(join(r, 'engine-state/_photo-subjects.json'), JSON.stringify(cache))
  return r
}
const judged = async (r: string, page: string) =>
  Object.entries(JSON.parse(await readFile(join(r, 'engine-state/_photo-subjects.json'), 'utf8')) as Record<string, Record<string, unknown>>)
    .filter(([, by]) => page in by).map(([u]) => name(u)).sort()

/** A model that answers from a table: photo name → verdict (unlisted: "yes"). Records each sheet's photos. */
function model(table: Record<string, Partial<PhotoVerdict>>, onLook?: () => Promise<void>): PhotoCheckDeps & { seen: string[][] } {
  let fetched: string[] = []
  const sheets: string[][] = []
  return {
    seen: sheets,
    get: async u => { fetched.push(name(u)); return new Uint8Array(await jpeg) },
    look: async () => {
      const photos = fetched
      fetched = []
      sheets.push(photos)
      await onLook?.()
      return { photos: photos.map((p, i) => ({ n: i + 1, ok: 'yes', typical: true, young: false, note: p, logo: false, person: false, ...table[p] }) as { n: number } & PhotoVerdict) }
    },
  }
}

afterEach(() => {
  process.env.ENGINE_COST_LOG = 'off'
  nameStep(undefined)
})

test('"another fish" for an album photo: the same run judges that album\'s photos from the same uploader with no verdict yet, past the run\'s limit', async () => {
  const r = await root([
    {
      id: 'aaa-fish',
      album: [
        photo('trig', { author: ANGLER }), ...five('aaa-fish'),
        photo('same-name', { author: ANGLER, waits: true }),
        // The trigger has no author's page, so the name decides.
        photo('same-name-own-page', { author: ANGLER, authorUrl: 'https://example.org/people/1', waits: true }),
        photo('other-site', { author: ANGLER, site: 'commons', waits: true }),
        photo('other-author', { author: 'Sampletown keeper', waits: true }),
        photo('judged-before', { author: ANGLER, waits: true }),
      ],
    },
    { id: 'bbb-fish', album: [photo('other-album', { author: ANGLER, waits: true })] },
    {
      id: 'ccc-fish',
      album: [
        photo('trig-page', { author: ANGLER, authorUrl: 'https://example.org/people/1' }), ...five('ccc-fish'),
        // Both have an author's page: it decides, whatever the name says.
        photo('same-page', { author: 'Sampletown A. angler', authorUrl: 'https://example.org/people/1', waits: true }),
        photo('other-page', { author: ANGLER, authorUrl: 'https://example.org/people/2', waits: true }),
        photo('name-only', { author: ANGLER, waits: true }),
      ],
    },
  ], { 'judged-before': { 'aaa-fish': seen } })
  const d = model({ trig: { ok: 'other', note: 'a guppy' }, 'trig-page': { ok: 'other', note: 'a platy' } })
  const out = await checkPagePhotos(r, d, { limit: 2 })
  expect(d.seen).toEqual([
    ['trig', 'aaa-fish-f1', 'aaa-fish-f2', 'aaa-fish-f3', 'aaa-fish-f4', 'aaa-fish-f5'],
    ['trig-page', 'ccc-fish-f1', 'ccc-fish-f2', 'ccc-fish-f3', 'ccc-fish-f4', 'ccc-fish-f5'],
    ['same-name', 'same-name-own-page'],
    ['same-page', 'name-only'],
  ])
  expect(out.uploaderPhotos).toBe(4)
  expect(await judged(r, 'aaa-fish')).not.toContain('other-site')
  expect(await judged(r, 'aaa-fish')).not.toContain('other-author')
  expect(await judged(r, 'bbb-fish')).toEqual(['bbb-fish-lead'])
  expect(await judged(r, 'ccc-fish')).not.toContain('other-page')
})

/** Two pages laid out alike: `aaa-fish`'s first photo is answered "another fish" (the control), `bbb-fish`'s `answer`. */
const pair = (bbb: Partial<Page> = {}) => root([
  { id: 'aaa-fish', album: [photo('aaa-trig', { author: ANGLER }), ...five('aaa-fish'), photo('aaa-sib', { author: ANGLER, waits: true })] },
  { id: 'bbb-fish', album: [photo('bbb-trig', { author: ANGLER }), ...five('bbb-fish'), photo('bbb-sib', { author: ANGLER, waits: true })], ...bbb },
])
const control = ['aaa-trig', 'aaa-fish-f1', 'aaa-fish-f2', 'aaa-fish-f3', 'aaa-fish-f4', 'aaa-fish-f5']

test.each(['dead', 'none', 'unsure', 'yes'] as const)('"%s" for an album photo starts nothing', async answer => {
  const r = await pair()
  const d = model({ 'aaa-trig': { ok: 'other' }, 'bbb-trig': { ok: answer } })
  await checkPagePhotos(r, d, { limit: 2, emptyCap: 99 })
  expect(d.seen).toEqual([control, ['bbb-trig', 'bbb-fish-f1', 'bbb-fish-f2', 'bbb-fish-f3', 'bbb-fish-f4', 'bbb-fish-f5'], ['aaa-sib']])
  expect(await judged(r, 'bbb-fish')).not.toContain('bbb-sib')
})

test('a verdict recorded before the run starts nothing: an old "no", or "another fish" from an earlier run', async () => {
  const six = (id: string) => [...five(id), photo(`${id}-f6`)]
  const r = await root([
    { id: 'aaa-fish', album: [photo('aaa-trig', { author: ANGLER }), ...five('aaa-fish'), photo('aaa-sib', { author: ANGLER, waits: true })] },
    { id: 'bbb-fish', album: [photo('bbb-old', { author: ANGLER }), ...six('bbb-fish'), photo('bbb-sib', { author: ANGLER, waits: true })] },
    { id: 'ccc-fish', album: [photo('ccc-old', { author: ANGLER }), ...six('ccc-fish'), photo('ccc-sib', { author: ANGLER, waits: true })] },
  ], {
    'bbb-old': { 'bbb-fish': { ok: 'no', typical: false, note: 'a map', person: false } },
    'ccc-old': { 'ccc-fish': { ok: 'other', typical: false, note: 'a guppy', person: false, logo: false } },
  })
  const d = model({ 'aaa-trig': { ok: 'other' } })
  await checkPagePhotos(r, d, { limit: 3, emptyCap: 99 })
  expect(d.seen.at(-1)).toEqual(['aaa-sib'])
  expect(d.seen).toHaveLength(4)
  expect(await judged(r, 'bbb-fish')).not.toContain('bbb-sib')
  expect(await judged(r, 'ccc-fish')).not.toContain('ccc-sib')
})

test('"another fish" for a page\'s own photo starts nothing, for its other own photos or its album', async () => {
  // bbb-fish's own photos fill two sheets; the run's limit leaves the second, with `own-sib`, for later.
  const r = await pair({
    own: [photo('own-trig', { author: ANGLER }), ...five('bbb-fish'), photo('own-sib', { author: ANGLER })],
    album: [photo('album-sib', { author: ANGLER, waits: true })],
  })
  const d = model({ 'aaa-trig': { ok: 'other' }, 'own-trig': { ok: 'other' } })
  await checkPagePhotos(r, d, { limit: 2, emptyCap: 99 })
  expect(d.seen).toEqual([control, ['own-trig', 'bbb-fish-f1', 'bbb-fish-f2', 'bbb-fish-f3', 'bbb-fish-f4', 'bbb-fish-f5'], ['aaa-sib']])
  expect(await judged(r, 'bbb-fish')).not.toContain('own-sib')
  expect(await judged(r, 'bbb-fish')).not.toContain('album-sib')
})

test('one step: a photo the second round judges "another fish" starts nothing', async () => {
  const r = await root([{
    id: 'aaa-fish',
    album: [
      photo('trig', { author: ANGLER }), ...five('aaa-fish'),
      // The trigger's uploader by name; then that photo's uploader by the author's page, but not the trigger's.
      photo('step-one', { author: ANGLER, authorUrl: 'https://example.org/people/1', waits: true }),
      photo('step-two', { author: 'Sampletown fisher', authorUrl: 'https://example.org/people/1', waits: true }),
    ],
  }])
  const d = model({ trig: { ok: 'other' }, 'step-one': { ok: 'other' } })
  await checkPagePhotos(r, d, { limit: 1, emptyCap: 99 })
  expect(d.seen.slice(1)).toEqual([['step-one']])
  expect(await judged(r, 'aaa-fish')).toContain('step-one')
  expect(await judged(r, 'aaa-fish')).not.toContain('step-two')
})

test("the step's daily line stops the second round like any sheet: no call past it, nothing judged", async () => {
  const sibs = Array.from({ length: 7 }, (_, i) => photo(`sib-${i}`, { author: ANGLER, waits: true }))
  const r = await root([{ id: 'aaa-fish', album: [photo('trig', { author: ANGLER }), ...five('aaa-fish'), ...sibs] }])
  // The first sheet reaches the line: from then on the step's log says a sheet costs more than the day has left.
  const d = model({ trig: { ok: 'other' } }, async () => {
    const log = join(r, 'aquatome-cost-test.jsonl')
    await writeFile(log, `${JSON.stringify({ at: new Date().toISOString(), step: 'check-photos', piece: 'last', pieceUsd: 10000, finished: true })}\n`)
    process.env.ENGINE_COST_LOG = log
    nameStep('check-photos')
  })
  const out = await checkPagePhotos(r, d, { limit: 1, emptyCap: 99 })
  expect(d.seen).toHaveLength(1)
  expect(out.uploaderPhotos).toBe(0)
  expect(out.stopped).toBeTruthy()
  expect(await judged(r, 'aaa-fish')).toEqual(['aaa-fish-f1', 'aaa-fish-f2', 'aaa-fish-f3', 'aaa-fish-f4', 'aaa-fish-f5', 'aaa-fish-lead', 'trig'])
})
