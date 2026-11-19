import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Photo } from '@aq/schema'
import sharp from 'sharp'
import { expect, test } from 'vitest'
import { retainedOwnMark } from '../src/own-mark'
import { historyCandidates, returnShopPhotos, RETURNS_FILE, type History, type ReturnDeps } from '../src/shop-return'

// The return of Aquarium Glaser's photos the never-again list holds for a mark (the chief of staff, 19 Nov): only a photo
// the rule passes comes off the list, one at a time, with its reason in the step's own record; a refused one stays.

const ID = 'betta-x', PAGE = 'species/betta-x'
const SHOP = 'https://www.aquariumglaser.de/en/fish/betta_x_en/'
const jpeg = sharp({ create: { width: 64, height: 48, channels: 3, background: '#e83' } }).jpeg().toBuffer()
const g = (n: string) => `https://media.aquatome.com/glaser/${n}.webp`
const photo = (url: string, o: Partial<Photo> = {}): Photo => ({ url, width: 960, height: 720, licence: 'used with permission', author: 'Aquarium Glaser', sourceUrl: SHOP, source: 'glaser', ...o }) as Photo
const listed = (what: string, n = 'a') => `${what}: withheld [sha256:${n.repeat(64)}]`
const marked = { ocr: [], watermark: true, kind: 'logo', locations: ['bottom centre'] }

async function site(rejected: Record<string, string>, album: Photo[] = []) {
  const r = await mkdtemp(join(tmpdir(), 'aq-shop-return-'))
  await mkdir(join(r, 'content/species', ID), { recursive: true })
  await mkdir(join(r, 'content/gallery'), { recursive: true })
  await mkdir(join(r, 'engine-state'))
  await writeFile(join(r, 'content/species', ID, 'entity.json'), JSON.stringify({ id: ID, scientificName: 'Betta x', photos: [photo('https://media.example/clean.webp', { source: undefined, sourceUrl: 'https://example.org/clean', licence: 'CC BY' })] }))
  await writeFile(join(r, 'content/gallery', `${ID}.json`), JSON.stringify({ id: ID, photos: album, seen: 0, updatedAt: '' }))
  await writeFile(join(r, 'content/sources.json'), JSON.stringify({ glaser: { name: 'Sampletown Glaser', homepage: 'https://glaser.example.org' } }))
  await writeFile(join(r, 'engine-state/_photo-watermarks.json'), JSON.stringify(Object.fromEntries(Object.keys(rejected).map(u => [u, marked]))))
  await writeFile(join(r, 'engine-state/_photo-rejected.json'), JSON.stringify(rejected))
  return r
}
const json = async (r: string, f: string) => JSON.parse(await readFile(join(r, f), 'utf8'))

/** The screen's model: for the n-th photo it is shown in the run, `own[n]` (undefined: no answer to whose). Its prompts in `prompts`. */
function screen(own: (boolean | undefined)[], prompts: string[] = []): ReturnDeps {
  let shown = 0
  return {
    get: async () => new Uint8Array(await jpeg),
    look: async (_sheet, prompt) => {
      prompts.push(prompt)
      return { photos: [...prompt.matchAll(/^(\d+): /gm)].map(([, n]) => { const o = own[shown++]; return { n: Number(n), watermark: true, kind: 'logo' as const, locations: ['bottom centre'], ...(o === undefined ? {} : { own: o }) } }) }
    },
  }
}

test("a listed Glaser photo whose every mark is Glaser's own comes off the list and back in its page's album, waiting, with its kept record and the step's own record of why; a refused one stays listed and isn't asked again", async () => {
  const own = g('own'), other = g('other'), quiet = g('quiet')
  const r = await site({ [own]: listed('watermark'), [other]: listed('watermark', 'b'), [quiet]: listed('watermark', 'c') })
  const prompts: string[] = []
  const report = await returnShopPhotos(r, [own, other, quiet].map(u => ({ page: PAGE, photo: photo(u) })), screen([true, false, undefined], prompts), { today: '2026-11-20', limit: 5 })
  // The screen is told the shop's name and home page as we hold them, as for a new photo.
  expect(prompts[0]).toContain('taken from the web pages of the shop Sampletown Glaser (https://glaser.example.org)')
  expect(report.returned).toEqual([`${PAGE}: ${own}`])
  expect(report.refused).toEqual([`${PAGE}: ${other}`])
  expect(report.unanswered).toEqual([quiet])
  // The one that passed: off the list, back in the album waiting for the photo check, kept by the return step's record.
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual({ [other]: listed('watermark', 'b'), [quiet]: listed('watermark', 'c') })
  expect((await json(r, `content/gallery/${ID}.json`)).photos).toEqual([{ ...photo(own), unchecked: true }])
  const marks = await json(r, 'engine-state/_photo-watermarks.json')
  expect(marks[own].retainedOwnMark).toEqual({ source: 'glaser', sourceUrl: SHOP, owner: 'source', by: 'return' })
  expect(retainedOwnMark(own, marks[own])).toBe(true)
  expect(marks[other].retainedOwnMark).toBeUndefined()
  expect(await json(r, `engine-state/${RETURNS_FILE}`)).toEqual({
    [own]: { at: '2026-11-20', pages: [PAGE], answer: 'returned', was: listed('watermark'), why: "every mark the shop's own (the watermark screen)" },
    [other]: { at: '2026-11-20', pages: [PAGE], answer: 'refused', was: listed('watermark', 'b'), why: "a mark not the shop's own, or one the screen can't place" },
  })
  // Run again: the refused photo is not asked again and stays listed; the unanswered one is asked again.
  const again: string[] = []
  const second = await returnShopPhotos(r, [other, quiet].map(u => ({ page: PAGE, photo: photo(u) })), screen([false], again), { today: '2026-11-21', limit: 5 })
  expect(second.skipped).toEqual([`${PAGE}: ${other} (answered 2026-11-20)`])
  expect(again).toHaveLength(1)
  expect(Object.keys(await json(r, 'engine-state/_photo-rejected.json')).sort()).toEqual([other, quiet].sort())
})

test('a photo listed for anything but a mark, one not from the shop\'s own pages, one its page shows already or as a cleaned copy, and one with no page never comes back, and nothing is asked', async () => {
  const person = g('person'), elsewhere = g('elsewhere'), shown = g('shown'), cleaned = g('cleaned'), nowhere = g('nowhere')
  const rejected = { [person]: listed('people'), [elsewhere]: listed('watermark', 'b'), [shown]: listed('watermark', 'c'), [cleaned]: listed('watermark', 'd'), [nowhere]: listed('watermark', 'e') }
  const r = await site(rejected, [photo(shown), photo('https://media.aquatome.com/processed/x.webp', { original: { url: cleaned } } as Partial<Photo>)])
  const report = await returnShopPhotos(r, [
    { page: PAGE, photo: photo(person) },
    { page: PAGE, photo: photo(elsewhere, { sourceUrl: 'https://example.org/a-forum' }) },
    { page: PAGE, photo: photo(shown) },
    { page: PAGE, photo: photo(cleaned) },
    { page: 'species/no-such-fish', photo: photo(nowhere) },
  ], { get: async () => { throw new Error('nothing to fetch') }, look: async () => { throw new Error('nothing to ask') } }, { today: '2026-11-20', limit: 5 })
  expect(report.skipped).toEqual([
    `${PAGE}: ${person} (not listed for a mark)`,
    `${PAGE}: ${elsewhere} (not a screened shop's photo from its own pages)`,
    `${PAGE}: ${shown} (on the page already)`,
    `${PAGE}: ${cleaned} (on the page already)`,
    `species/no-such-fish: ${nowhere} (no such page)`,
  ])
  expect(await json(r, 'engine-state/_photo-rejected.json')).toEqual(rejected)
})

test("a page's history gives the listed shop photos it showed, each as the newest commit had it, from its own photos and its album", () => {
  const a = g('a'), b = g('b'), c = g('c')
  const files: Record<string, Record<string, unknown>> = {
    new: { [`content/${PAGE}/entity.json`]: { photos: [] }, [`content/gallery/${ID}.json`]: { photos: [photo(a, { caption: 'newer' })] } },
    old: { [`content/${PAGE}/entity.json`]: { photos: [photo(a, { caption: 'older' }), photo(b), photo(c, { sourceUrl: 'https://example.org/x' })] } },
  }
  const h: History = { commits: () => ['new', 'old'], show: (commit, path) => (files[commit]?.[path] ? JSON.stringify(files[commit]![path]) : undefined) }
  const rejected = { [a]: listed('watermark'), [b]: listed('people'), [c]: listed('watermark', 'b') }
  // b is listed for a person, c isn't from the shop's own pages: only a comes back, as the newest commit had it.
  expect(historyCandidates([PAGE, 'not a page'], rejected, h)).toEqual([{ page: PAGE, photo: photo(a, { caption: 'newer' }) }])
})

test("a kept record a person writes says on whose word and on what date, or keeps nothing (the chief of staff, 19 Nov)", async () => {
  const { compactScreen } = await import('../src/photo-observations')
  const rec = (k: object) => compactScreen({ ...marked, retainedOwnMark: { source: 'glaser', sourceUrl: SHOP, owner: 'source', ...k } })
  expect(retainedOwnMark(g('a'), rec({ by: 'person', word: { who: 'chief of staff', date: '2026-11-19' } }))).toBe(true)
  expect(retainedOwnMark(g('a'), rec({ by: 'person' }))).toBe(false)
  expect(rec({ by: 'person', word: { who: 'someone', date: '2026-11-19' } }).retainedOwnMark).toEqual({ source: 'glaser', sourceUrl: SHOP, owner: 'source', by: 'person' })
  expect(rec({ by: 'screen' }).retainedOwnMark).toEqual({ source: 'glaser', sourceUrl: SHOP, owner: 'source', by: 'screen' })
  // A record from before 19 Nov says neither, and still keeps.
  expect(retainedOwnMark(g('a'), rec({}))).toBe(true)
})
