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
  expect(holds[only.url]).toMatchObject({ page: PAGE, by: 'the chief of staff', places: [{ file: 'content/species/fish-a/entity.json', at: 0, photo: only }] })
  expect(holds[second.url].calendar).toEqual(['content/curation.json: 2026-11-27'])
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
  expect(await releaseCreditHolds(r, read)).toEqual({ back: [own.url], off: [agency.url] })
  expect((await json(join(r, 'content/guides/list/entity.json'))).photos).toEqual([own, kept])
  const rejected = await json(join(r, 'engine-state/_photo-rejected.json'))
  expect(Object.keys(rejected).sort()).toEqual([agency.url, unread.url].sort())
  expect(Object.keys(await json(join(r, CREDIT_HOLDS)))).toEqual([unread.url])
  // The record of what each read found keeps the kinds.
  await recordCredits(r, read)
  expect(Object.keys(await json(join(r, PHOTO_CREDITS))).sort()).toEqual([own.url, agency.url].sort())
})
