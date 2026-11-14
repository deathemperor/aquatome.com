import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { applyCreditReads, CREDIT_HOLDS, creditReadKind, HOLD_NOTE, holdForCreditRead, pageCredits, PHOTO_CREDITS, recordCredits, releaseCreditHolds, type PhotoCredit } from '../src/credit-reads'
import { photoKey } from '../src/source-photos'

// Invented names throughout: no real person or agency.
const SITE = 'The Example Pets'
const terms = { refusedCredits: ['Example Pictures'] }
const media = { urlFor: (k: string) => `https://media.test/${k}` }
const PAGE = 'https://www.example-pets.test/fish-list'
const photo = (n: string, extra: object = {}) => ({ url: `https://media.test/examplepets/${n}.webp`, width: 1200, height: 800, licence: 'x', author: SITE, source: 'sprucepets', sourceUrl: PAGE, ...extra })
const json = async (f: string) => JSON.parse(await readFile(f, 'utf8'))

async function root(files: Record<string, unknown>) {
  const r = await mkdtemp(join(tmpdir(), 'credit-reads-'))
  for (const [f, v] of Object.entries(files)) { await mkdir(join(r, f, '..'), { recursive: true }); await writeFile(join(r, f), `${JSON.stringify(v, null, 2)}\n`) }
  await mkdir(join(r, 'engine-state'), { recursive: true })
  return r
}

test("a credit's kind: the site's own photographer or illustrator, a picture agency the record names, another party, or none", () => {
  expect(creditReadKind('The Example / Ann Example', SITE, terms)).toBe('own')
  expect(creditReadKind('Credit: The Example / Ann Example', SITE, terms)).toBe('own')
  expect(creditReadKind('Illustration: The Example Pets', SITE, terms)).toBe('own')
  expect(creditReadKind('somehandle/Example Pictures', SITE, terms)).toBe('agency')
  expect(creditReadKind('Example Pictures', SITE, terms)).toBe('agency')
  expect(creditReadKind('Bo Example/Flickr', SITE, terms)).toBe('other')
  expect(creditReadKind('Bo Example', SITE, terms)).toBe('other')
  // "The" alone is no site's name.
  expect(creditReadKind('The / Bo Example', SITE, terms)).toBe('other')
  expect(creditReadKind('', SITE, terms)).toBe('none')
  expect(creditReadKind(undefined, SITE, terms)).toBe('none')
})

test('a read page gives each photo of ours its credit kind by the address we store it under, a picture\'s copies one credit, the line as a hash', () => {
  const images = [
    { src: '/img/fish-a.jpg', alt: 'a', credit: 'The Example / Ann Example' },
    { src: '/img/fish-a-800x600.jpg', alt: 'a' },
    { src: '/img/fish-b.jpg', alt: 'b', credit: 'somehandle/Example Pictures' },
    { src: '/img/fish-c.jpg', alt: 'c' },
  ]
  const c = pageCredits(images, PAGE, 'sprucepets', SITE, terms, media, '2026-11-28')
  const at = (src: string) => c[media.urlFor(photoKey('sprucepets', new URL(src, PAGE).href))]
  expect(at('/img/fish-a.jpg')).toMatchObject({ kind: 'own', page: PAGE })
  expect(at('/img/fish-a-800x600.jpg')).toMatchObject({ kind: 'own' })
  expect(at('/img/fish-b.jpg')).toMatchObject({ kind: 'agency' })
  expect(at('/img/fish-c.jpg')).toEqual({ page: PAGE, kind: 'none', at: '2026-11-28' })
  expect(JSON.stringify(c)).not.toMatch(/Example/)
  expect(at('/img/fish-b.jpg')!.line).toMatch(/^sha256:[0-9a-f]{64}$/)
})

test("a rights hold a person decided takes even a page's last photo off, kept with its place; a credit read's own verdict on a last photo waits for a second look", async () => {
  const only = photo('only'), first = photo('first'), second = photo('second'), lone = photo('lone')
  const r = await root({
    'content/species/fish-a/entity.json': { id: 'fish-a', photos: [only] },
    'content/guides/list/entity.json': { id: 'list', photos: [first, second] },
    'content/species/fish-b/entity.json': { id: 'fish-b', photos: [lone] },
    'content/curation.json': { days: [{ date: '2026-11-27', guide: 'guides/list', guideImg: second.url }, { date: '2026-11-28', guideImg: 'https://media.test/other.webp' }] },
  })
  // The rights hold: the chief of staff's decision, not a step's verdict. The last-photo guard has no say.
  const h = await holdForCreditRead(r, [only.url, second.url], 'the chief of staff', '2026-11-14', 'credits unread')
  expect(h).toEqual({ held: [only.url, second.url], places: 2, calendar: 1 })
  expect((await json(join(r, 'content/species/fish-a/entity.json'))).photos).toEqual([])
  expect((await json(join(r, 'content/guides/list/entity.json'))).photos).toEqual([first])
  expect((await json(join(r, 'content/curation.json'))).days).toEqual([{ date: '2026-11-27', guide: 'guides/list' }, { date: '2026-11-28', guideImg: 'https://media.test/other.webp' }])
  const holds = await json(join(r, CREDIT_HOLDS))
  expect(holds[only.url]).toMatchObject({ page: PAGE, by: 'the chief of staff', places: [{ file: 'content/species/fish-a/entity.json', path: ['photos'], at: 0, photo: only }] })
  expect(holds[second.url].calendar).toEqual([{ file: 'content/curation.json', date: '2026-11-27', guide: 'guides/list' }])
  const rejected = await json(join(r, 'engine-state/_photo-rejected.json'))
  expect(rejected[only.url]).toBe(HOLD_NOTE)
  // A credit read's verdict is the engine's: on a page's only photo it is held for a second look, not taken off.
  await recordCredits(r, { [lone.url]: { page: PAGE, kind: 'other', line: `sha256:${'a'.repeat(64)}`, at: '2026-11-28' } })
  expect(await applyCreditReads(r)).toEqual({ removed: [], held: [lone.url] })
  expect((await json(join(r, 'content/species/fish-b/entity.json'))).photos).toEqual([lone])
  expect(Object.keys(await json(join(r, 'engine-state/_photo-second-look.json')))).toEqual([lone.url])
})

test("the credit read releases a held photo of the site's own back to its place and off the never-again list; another party's stays off; one the read didn't find stays held", async () => {
  const own = photo('own'), agency = photo('agency'), unread = photo('unread'), kept = photo('kept')
  const r = await root({
    'content/guides/list/entity.json': { id: 'list', photos: [own, kept, agency, unread] },
    'engine-state/_photo-rejected.json': {},
  })
  await holdForCreditRead(r, [own.url, agency.url, unread.url], 'the chief of staff', '2026-11-14', 'credits unread')
  expect((await json(join(r, 'content/guides/list/entity.json'))).photos).toEqual([kept])
  const read: Record<string, PhotoCredit> = { [own.url]: { page: PAGE, kind: 'own', line: 'sha256:x', at: '2026-11-28' }, [agency.url]: { page: PAGE, kind: 'agency', line: 'sha256:y', at: '2026-11-28' } }
  expect(await releaseCreditHolds(r, read)).toEqual({ back: [own.url], off: [agency.url], stuck: [] })
  expect((await json(join(r, 'content/guides/list/entity.json'))).photos).toEqual([own, kept])
  const rejected = await json(join(r, 'engine-state/_photo-rejected.json'))
  expect(Object.keys(rejected).sort()).toEqual([agency.url, unread.url].sort())
  expect(Object.keys(await json(join(r, CREDIT_HOLDS)))).toEqual([unread.url])
  // The record of what each read found keeps the kinds.
  await recordCredits(r, read)
  expect(Object.keys(await json(join(r, PHOTO_CREDITS))).sort()).toEqual([own.url, agency.url].sort())
})

test("released photos go back in the order they stood, nested lists and the calendar card too; one rejected for another reason while held stays off", async () => {
  // Addresses that sort against their places (b's before a's), so a release in address order would misplace them.
  const a = photo('za'), b = photo('yb'), c = photo('c'), deep = photo('deep'), other = photo('other')
  const r = await root({
    'content/guides/list/entity.json': { id: 'list', photos: [a, b, c], sections: [{ key: 'x', photos: [deep, c] }] },
    'content/species/fish-c/entity.json': { id: 'fish-c', photos: [other, c] },
    'content/curation.json': { days: [{ date: '2026-11-27', guide: 'guides/list', guideImg: b.url }] },
  })
  await holdForCreditRead(r, [a.url, b.url, deep.url, other.url], 'the chief of staff', '2026-11-14', 'credits unread')
  expect(await json(join(r, 'content/guides/list/entity.json'))).toEqual({ id: 'list', photos: [c], sections: [{ key: 'x', photos: [c] }] })
  // Meanwhile another check puts one on the never-again list for a reason of its own.
  const rejected = await json(join(r, 'engine-state/_photo-rejected.json'))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify({ ...rejected, [other.url]: `watermark: withheld [sha256:${'d'.repeat(64)}]` }))
  const own = (u: string): PhotoCredit => ({ page: PAGE, kind: 'own', line: 'sha256:x', at: '2026-11-28' })
  // Released in the order of their addresses (b before a), yet each list gets its order back.
  expect(await releaseCreditHolds(r, { [b.url]: own(b.url), [a.url]: own(a.url), [deep.url]: own(deep.url), [other.url]: own(other.url) })).toEqual({ back: [deep.url, b.url, a.url], off: [other.url], stuck: [] })
  expect(await json(join(r, 'content/guides/list/entity.json'))).toEqual({ id: 'list', photos: [a, b, c], sections: [{ key: 'x', photos: [deep, c] }] })
  expect((await json(join(r, 'content/curation.json'))).days).toEqual([{ date: '2026-11-27', guide: 'guides/list', guideImg: b.url }])
  expect((await json(join(r, 'content/species/fish-c/entity.json'))).photos).toEqual([c])
  expect(Object.keys(await json(join(r, 'engine-state/_photo-rejected.json')))).toEqual([other.url])
})

test("a hold takes a photo only from where it can put it back: one shown in a figure stops the hold before anything is written", async () => {
  const shown = photo('shown')
  const files = { 'content/guides/fig/entity.json': { id: 'fig', figures: [{ photo: shown }] }, 'content/species/fish-d/entity.json': { id: 'fish-d', photos: [shown] } }
  const r = await root(files)
  await expect(holdForCreditRead(r, [shown.url], 'the chief of staff', '2026-11-14', 'credits unread')).rejects.toThrow(/content\/guides\/fig\/entity.json/)
  expect(await json(join(r, 'content/species/fish-d/entity.json'))).toEqual(files['content/species/fish-d/entity.json'])
})

test("a returning photo finds its place by its neighbours and its list by what names it, whatever moved while it was held; a place that's gone keeps it held; a release repeated changes nothing more", async () => {
  const [a, b, c, d, x, y] = ['a', 'b', 'c', 'd', 'x', 'y'].map(n => photo(n))
  const r = await root({
    'content/guides/list/entity.json': { id: 'list', photos: [a, b, c, d], sections: [{ key: 'one', source: 's', photos: [x] }, { key: 'two', source: 's', photos: [y] }] },
    'content/guides/gone/entity.json': { id: 'gone', sections: [{ key: 'three', source: 's', photos: [x] }] },
  })
  await holdForCreditRead(r, [b.url, c.url, x.url], 'the chief of staff', '2026-11-14', 'credits unread')
  // While they're held, another step takes a off, the sections change order, and one section goes.
  const file = join(r, 'content/guides/list/entity.json'), g = await json(file)
  await writeFile(file, JSON.stringify({ ...g, photos: [d], sections: [g.sections[1], g.sections[0]] }))
  const gone = join(r, 'content/guides/gone/entity.json')
  await writeFile(gone, JSON.stringify({ id: 'gone', sections: [] }))
  const own = (): PhotoCredit => ({ page: PAGE, kind: 'own', line: 'sha256:x', at: '2026-11-28' })
  const read = { [b.url]: own(), [c.url]: own(), [x.url]: own() }
  const holdsBefore = await readFile(join(r, CREDIT_HOLDS), 'utf8')
  expect(await releaseCreditHolds(r, read)).toEqual({ back: [b.url, c.url, x.url], off: [], stuck: [x.url] })
  const after = await json(file)
  expect(after.photos).toEqual([b, c, d])
  expect(after.sections).toEqual([{ key: 'two', source: 's', photos: [y] }, { key: 'one', source: 's', photos: [x] }])
  const holds = await json(join(r, CREDIT_HOLDS))
  expect(Object.keys(holds)).toEqual([x.url])
  expect(holds[x.url].places).toEqual([expect.objectContaining({ file: 'content/guides/gone/entity.json' })])
  expect(await json(join(r, 'engine-state/_photo-rejected.json'))).toEqual({})
  // As if the holds had never been written (a failure after the never-again list): the next release finishes the job.
  await writeFile(join(r, CREDIT_HOLDS), holdsBefore)
  await releaseCreditHolds(r, read)
  expect((await json(file)).photos).toEqual([b, c, d])
  expect((await json(file)).sections[1].photos).toEqual([x])
  expect(await json(join(r, 'engine-state/_photo-rejected.json'))).toEqual({})
})
