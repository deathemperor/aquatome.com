import { fileURLToPath } from 'node:url'
import { loadAll } from '@aq/schema'
import { expect, test } from 'vitest'
import { appIndex, cardSrc, unsplashCredits, type AppIndex } from '../src/lib/app-index'
import { photoCredit } from '../src/lib/cite'
import { smallSrc } from '../src/lib/img'
import { isUnsplash } from '../src/lib/unsplash'

// Unsplash asks for its line wherever its photo shows, in view: the app draws it under a card's or a row's photo from
// the index's `credits` (docs/governance.md, Photos, Credits). The fixture's Pigeon Blood discus leads with one.
const root = fileURLToPath(new URL('./fixture-content', import.meta.url))

/** Every string in `v`, deep. */
const strings = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : []

test.each(['vi', 'id', 'th', 'ms'] as const)('%s: every Unsplash photo the index shows has its line, and no other photo has one', async lang => {
  const c = await loadAll({ root, lang, publicBuild: false })
  const index = appIndex(lang, c)
  const shown = strings({ ...index, credits: undefined }).filter(s => /^https:\/\/images\.unsplash\.com\//.test(s))
  if (lang === 'vi') expect(shown.length).toBeGreaterThan(0)
  for (const s of shown) expect(index.credits?.[s]?.text, s).toMatch(/Unsplash/)
  // Only Unsplash's: every other photo is credited on the page it opens.
  for (const [src, credit] of Object.entries(index.credits ?? {})) {
    expect(shown).toContain(src)
    expect(credit.licence).toBe('Unsplash License')
  }
})

test('the Pigeon Blood discus\'s row carries its photographer, as its page credits the photo', async () => {
  const c = await loadAll({ root, lang: 'vi', publicBuild: false })
  const breed = c.breeds.find(b => b.id === 'pigeon-blood-discus')!
  const photo = breed.photos.find(p => isUnsplash(p.licence))!
  const item = appIndex('vi', c).items.find(i => i.id === 'pigeon-blood-discus')!
  expect(item.img).toBe(cardSrc(photo))
  expect(appIndex('vi', c).credits?.[item.img!]).toEqual(photoCredit('vi', photo))
})

test('a photo shown anywhere in the index is credited at the address it is shown at: a day\'s, a week\'s, a chip\'s', async () => {
  const c = await loadAll({ root, lang: 'vi', publicBuild: false })
  const photo = c.breeds.find(b => b.id === 'pigeon-blood-discus')!.photos.find(p => isUnsplash(p.licence))!
  const bare: AppIndex = { version: 1, lang: 'vi', items: [], home: { groups: [], fish: [], plants: [], guides: [] } as unknown as AppIndex['home'], labels: {} as AppIndex['labels'], places: [] }
  const home = { ...bare.home, today: { img: photo.url }, week: { hero: [{ path: '/vi/ca/x/', img: smallSrc(photo) }] }, chips: [{ img: cardSrc(photo) }] }
  const credits = unsplashCredits('vi', { ...bare, home: home as unknown as AppIndex['home'] }, c)
  for (const at of [photo.url, smallSrc(photo), cardSrc(photo)]) expect(credits[at]).toEqual(photoCredit('vi', photo))
  // None shown, none credited.
  expect(unsplashCredits('vi', bare, c)).toEqual({})
})
