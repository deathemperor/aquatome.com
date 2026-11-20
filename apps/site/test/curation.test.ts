import { expect, test } from 'vitest'
import { CardSchema, CurationSchema, type Curation, type Photo } from '@aq/schema'
import { appIndex } from '../src/lib/app-index'
import { curationFor, type Faces } from '../src/lib/curation'
import { getContent } from '../src/lib/content'

// The editorial calendar (content/curation.json) as each language's app index carries it: Hôm nay's days, the week's
// theme, Khám phá's top cards and shelves, and a fish's loop.
const IMG = 'https://media.aquatome.com/commons/0000000000000001.webp'
const LOOP = {
  src: 'https://media.aquatome.com/loops/apistogramma-cacatuoides-1.mp4', poster: 'https://media.aquatome.com/loops/apistogramma-cacatuoides-1.webp',
  w: 1080, h: 1080, seconds: 6, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', author: 'Someone', source: 'https://commons.wikimedia.org/wiki/File:X.webm',
}
const YT_LOOP = {
  src: 'https://media.aquatome.com/loops/paracheirodon-axelrodi-1.mp4', poster: 'https://media.aquatome.com/loops/paracheirodon-axelrodi-1.webp',
  w: 1080, h: 1080, seconds: 8, licence: 'CC BY 3.0', licenceUrl: 'https://creativecommons.org/licenses/by/3.0/', author: 'A channel',
  source: 'https://www.youtube.com/watch?v=XeeAEokdrR0', title: 'A title', frame: 'fill',
}
const YT_RECORD = { cut: { from: 266, to: 275 }, checkedAt: '2026-11-08', snapshot: 'https://web.archive.org/web/20261108154552/https://www.youtube.com/watch?v=XeeAEokdrR0' }
const calendar: Curation = CurationSchema.parse({
  version: 1,
  weeks: [
    {
      from: '2026-11-09', to: '2026-11-15', theme: { vi: 'Trời trở lạnh', ms: 'Musim tengkujuh' },
      hero: [{ page: 'species/paracheirodon-axelrodi', img: IMG }, { page: 'species/apistogramma-cacatuoides', img: IMG, title: { vi: 'Cá lùn Nam Mỹ' } }, { page: 'species/no-such-fish' }],
      shelves: [
        { id: 'can-suoi', title: { vi: 'Cần sưởi khi trời lạnh' }, pages: ['species/symphysodon-aequifasciatus', 'species/pterophyllum-scalare', 'species/mikrogeophagus-ramirezi', 'species/apistogramma-cacatuoides'] },
        { id: 'chi-mot', title: { vi: 'Thiếu', ms: 'Kurang' }, pages: ['species/apistogramma-cacatuoides', 'breeds/flowerhorn-cichlid', 'species/no-such-fish'] },
      ],
    },
    { from: '2026-11-16', to: '2026-11-22', theme: { vi: 'Bể nhỏ' } },
  ],
  days: [
    { date: '2026-11-07', fish: 'species/paracheirodon-innesi', img: IMG },
    { date: '2026-11-09', fish: 'species/paracheirodon-axelrodi', img: IMG, guide: 'guides/aquariumcoop-blogs-aquarium-5-gallon-fish', by: { ms: { fish: 'species/apistogramma-cacatuoides', img: IMG } } },
    { date: '2026-11-10', fish: 'breeds/flowerhorn-cichlid', img: IMG, guide: 'guides/setup-be-dau-tien', story: { page: 'guides/setup-be-dau-tien', eyebrow: { vi: 'Bể đầu tiên' }, title: { vi: 'Set bể từ đầu' } } },
  ],
  loops: { 'apistogramma-cacatuoides': { ...LOOP, replace: 'when better footage comes' }, 'paracheirodon-axelrodi': { ...YT_LOOP, ...YT_RECORD } },
})
const index = async (lang: 'vi' | 'ms', today = '2026-11-10') => appIndex(lang, await getContent(lang), new Map(), (await getContent('vi')).species, { calendar, today })
const pathOf = (ix: Awaited<ReturnType<typeof index>>, id: string) => ix.items.find(i => i.id === id)?.path

test('Hôm nay gets the days from yesterday on, each pick at its address in the language', async () => {
  const vi = await index('vi')
  expect(vi.home.days?.map(d => d.date)).toEqual(['2026-11-09', '2026-11-10'])
  const [mon, tue] = vi.home.days!
  // Its guide names no photo: the card shows the picture the guide's page opens on.
  expect(mon).toEqual({ date: '2026-11-09', fish: pathOf(vi, 'paracheirodon-axelrodi'), img: IMG, guide: expect.stringMatching(/^\/vi\/huong-dan\/.+\/$/), guideImg: expect.stringMatching(/^https:\/\/media\.aquatome\.com\/.+\.webp$/) })
  expect(tue!.fish).toBe(pathOf(vi, 'flowerhorn-cichlid'))
  expect(tue!.story).toEqual({ path: tue!.guide, eyebrow: 'Bể đầu tiên', title: 'Set bể từ đầu' })
})

test('a language gets its own picks, and loses those it has no page for', async () => {
  const ms = await index('ms')
  const [mon, tue] = ms.home.days!
  // Its own fish for Monday; the guide it has, at its Malay address.
  expect(mon!.fish).toBe(pathOf(ms, 'apistogramma-cacatuoides'))
  expect(mon!.fish).toMatch(/^\/ms\//)
  expect(mon!.guide).toMatch(/^\/ms\//)
  // Tuesday's guide and story have no Malay page: only the fish is left, with no Vietnamese words.
  expect(tue).toEqual({ date: '2026-11-10', fish: pathOf(ms, 'flowerhorn-cichlid'), img: IMG })
})

test('Khám phá gets this week\'s theme, top cards and shelves, in its language or not at all', async () => {
  const vi = await index('vi')
  expect(vi.home.week).toEqual({ from: '2026-11-09', to: '2026-11-15', theme: 'Trời trở lạnh' })
  expect(vi.home.hero).toEqual([
    { path: pathOf(vi, 'paracheirodon-axelrodi'), img: IMG },
    { path: pathOf(vi, 'apistogramma-cacatuoides'), img: IMG, title: 'Cá lùn Nam Mỹ' },
  ])
  expect(vi.home.shelves?.map(s => [s.id, s.paths.length])).toEqual([['can-suoi', 4]])
  const ms = await index('ms')
  expect(ms.home.week?.theme).toBe('Musim tengkujuh')
  // A shelf titled only in Vietnamese isn't shown in Malay, nor one with under three of its fish there.
  expect(ms.home.shelves).toBeUndefined()
  expect(ms.home.hero?.map(h => h.title)).toEqual([undefined])
  expect((await index('vi', '2026-11-16')).home.week?.theme).toBe('Bể nhỏ')
  expect((await index('vi', '2026-11-30')).home.week).toBeUndefined()
})

test('a fish with a loop carries it in every language that lists it, without the media lead\'s note on replacing it', async () => {
  for (const lang of ['vi', 'ms'] as const) expect((await index(lang)).items.find(i => i.id === 'apistogramma-cacatuoides')?.loop, lang).toEqual(LOOP)
  expect((await index('vi')).items.filter(i => i.loop).length).toBe(2)
})

test("a loop cut from YouTube reaches the app with its title for the credit and how a card frames it, and without the licence record", async () => {
  expect((await index('vi')).items.find(i => i.id === 'paracheirodon-axelrodi')?.loop).toEqual(YT_LOOP)
})

test('without a calendar the index has none of it', async () => {
  const ix = appIndex('vi', await getContent('vi'))
  for (const k of ['days', 'week', 'hero', 'shelves'] as const) expect(ix.home[k]).toBeUndefined()
})

test('a day\'s card is in each index whose language it is written in, within its days, with its sources and the pages it is about', async () => {
  const source = { url: 'https://example.org/paper', title: 'A paper', publisher: 'A journal', date: '2001-05-01', accessed: '2026-11-08' }
  const entity = CardSchema.parse({ id: 'trivia-x', type: 'trivia', about: ['species/paracheirodon-axelrodi', 'species/no-such-fish'], sources: [source], show: { from: '2026-11-09', until: '2026-11-10' }, updatedAt: '2026-11-08' })
  const t = { eyebrow: 'Có thể bạn chưa biết', title: 'Một điều về cá', body: '<p>Theo một bài báo năm 2001.</p>' }
  const cal = CurationSchema.parse({ version: 1, weeks: [], days: [{ date: '2026-11-10', card: 'cards/trivia-x' }, { date: '2026-11-11', card: 'cards/trivia-x' }] })
  const vi = { ...(await getContent('vi')), cards: [{ ...entity, t }] }
  const ix = appIndex('vi', vi, new Map(), vi.species, { calendar: cal, today: '2026-11-10' })
  // 11 Nov is past its days: that day has nothing left, and isn't listed.
  expect(ix.home.days).toEqual([{
    date: '2026-11-10',
    card: { id: 'trivia-x', type: 'trivia', ...t, sources: [{ title: 'A paper', publisher: 'A journal', date: '2001-05-01', url: 'https://example.org/paper' }], about: [pathOf(ix, 'paracheirodon-axelrodi')] },
  }])
  // A language it isn't written in (or where the gate holds it back, which the loader leaves out) has no card.
  const ms = await getContent('ms')
  expect(appIndex('ms', ms, new Map(), (await getContent('vi')).species, { calendar: cal, today: '2026-11-10' }).home.days).toBeUndefined()
})

test('a page the planner found failing reader fit is left out of the top cards, the shelves and a story', async () => {
  const off = CurationSchema.parse({ ...calendar, off: { 'species/apistogramma-cacatuoides': 'reader fit: units', 'guides/setup-be-dau-tien': 'reader fit: source' } })
  const vi = appIndex('vi', await getContent('vi'), new Map(), (await getContent('vi')).species, { calendar: off, today: '2026-11-10' })
  expect(vi.home.hero?.map(h => h.path)).toEqual([pathOf(vi, 'paracheirodon-axelrodi')])
  expect(vi.home.shelves?.[0]?.paths).not.toContain(pathOf(vi, 'apistogramma-cacatuoides'))
  expect(vi.home.days?.find(d => d.date === '2026-11-10')).toEqual({ date: '2026-11-10', fish: pathOf(vi, 'flowerhorn-cichlid'), img: IMG })
})

test("a picture the build holds back for the watermark screen is left off the calendar's day, guide, story and top card", async () => {
  const OTHER = 'https://media.aquatome.com/commons/0000000000000002.webp'
  const cur = CurationSchema.parse({
    version: 1,
    weeks: [{ from: '2026-11-09', to: '2026-11-15', theme: { vi: 'Tuần' }, hero: [{ page: 'species/a', img: IMG }, { page: 'species/b', img: OTHER }] }],
    days: [{ date: '2026-11-11', fish: 'species/a', img: IMG, guide: 'guides/g', guideImg: IMG, story: { page: 'species/b', img: IMG } }],
  })
  const of = (waits?: (address: string) => boolean) => curationFor(cur, 'vi', '2026-11-11', ref => `/${ref}/`, [], waits)
  expect(of().days).toEqual([{ date: '2026-11-11', fish: '/species/a/', img: IMG, guide: '/guides/g/', guideImg: IMG, story: { path: '/species/b/', img: IMG } }])
  const held = of(address => address === IMG)
  expect(held.days).toEqual([{ date: '2026-11-11', fish: '/species/a/', guide: '/guides/g/', story: { path: '/species/b/' } }])
  expect(held.hero).toEqual([{ path: '/species/a/' }, { path: '/species/b/', img: OTHER }])
  // The app's index hands the build's own list over.
  const vi = await getContent('vi')
  const ix = appIndex('vi', { ...vi, photoWaits: address => address === IMG }, new Map(), vi.species, { calendar, today: '2026-11-10' })
  expect(ix.home.days?.length).toBe(2)
  expect([...ix.home.days!, ...ix.home.hero!].filter(x => x.img)).toEqual([])
})

// The chief of staff's line (16 Nov): a picture that stands for more than one fish never shows a held, failed or marked
// photo. The planner named the days' and the week's pictures before some went on `avoid`, so the build checks them again:
// the page's cardPhoto (Photo Sourcing's map) instead, else the pick goes, since with no picture the app shows the page's
// own head, the photo on `avoid`.
test("a day's fish and a top card whose photo went on avoid take the page's cardPhoto, else the pick goes", () => {
  const OTHER = 'https://media.aquatome.com/commons/0000000000000002.webp', CARD = 'https://media.aquatome.com/commons/0000000000000003-large.webp'
  const cur = CurationSchema.parse({
    version: 1,
    weeks: [{ from: '2026-11-09', to: '2026-11-15', theme: { vi: 'Tuần' }, hero: [{ page: 'species/a', img: IMG }, { page: 'species/b', img: OTHER }, { page: 'species/c', img: IMG }] }],
    days: [{ date: '2026-11-11', fish: 'species/a', img: IMG, guide: 'guides/g' }, { date: '2026-11-12', fish: 'species/c', img: IMG }, { date: '2026-11-13', fish: 'species/b', img: OTHER }],
  })
  const of = (faces?: Faces, waits?: (address: string) => boolean) => curationFor(cur, 'vi', '2026-11-11', ref => `/${ref}/`, [], waits, undefined, undefined, faces)
  expect(of().days?.map(d => [d.fish, d.img])).toEqual([['/species/a/', IMG], ['/species/c/', IMG], ['/species/b/', OTHER]])
  expect(of().hero?.map(h => h.img)).toEqual([IMG, OTHER, IMG])
  const faces: Faces = { avoided: u => u === IMG, instead: ref => (ref === 'species/a' ? CARD : undefined) }
  // a's page has a cardPhoto; c's has none, so its day goes without a fish, and with nothing else that day it goes.
  expect(of(faces).days).toEqual([{ date: '2026-11-11', fish: '/species/a/', img: CARD, guide: '/guides/g/' }, { date: '2026-11-13', fish: '/species/b/', img: OTHER }])
  expect(of(faces).hero).toEqual([{ path: '/species/a/', img: CARD }, { path: '/species/b/', img: OTHER }])
  // A cardPhoto the watermark screen holds back is none.
  expect(of(faces, u => u === CARD).hero).toEqual([{ path: '/species/b/', img: OTHER }])
})

test("the app's index asks avoid by the photo, whichever copy the calendar names, and gives a cardPhoto's large copy", async () => {
  const vi = await getContent('vi')
  const pic = (n: number, large: boolean) => ({ url: `https://media.aquatome.com/commons/${String(n).padStart(16, '0')}.webp`, width: 1600, height: 1200, licence: 'CC BY 4.0', author: 'a', sourceUrl: 'https://example.org', ...(large ? { large: { url: `https://media.aquatome.com/commons/${String(n).padStart(16, '0')}-large.webp`, width: 1600, height: 1200 } } : {}) }) as Photo
  const head = pic(4, true), next = pic(5, true)
  const c = { ...vi, species: vi.species.map(s => (s.id === 'paracheirodon-axelrodi' ? { ...s, photos: [head, next] } : s)) }
  const parsed = CurationSchema.parse({
    ...calendar,
    weeks: [{ ...calendar.weeks[0], hero: [{ page: 'species/paracheirodon-axelrodi', img: head.large!.url }] }],
    days: [{ date: '2026-11-10', fish: 'species/paracheirodon-axelrodi', img: head.large!.url }],
    avoid: { [head.url]: 'engine: held for a second look' },
  })
  // The map is Photo Sourcing's (on main Wed 18); the site reads it as optional.
  const ix = (cardPhoto?: Record<string, string>) => appIndex('vi', c, new Map(), vi.species, { calendar: { ...parsed, ...(cardPhoto ? { cardPhoto } : {}) } as Curation, today: '2026-11-10' }).home
  expect([ix().days, ix().hero]).toEqual([undefined, undefined])
  const withMap = ix({ 'paracheirodon-axelrodi': next.url })
  expect(withMap.days?.map(d => d.img)).toEqual([next.large!.url])
  expect(withMap.hero?.map(h => h.img)).toEqual([next.large!.url])
})

test('Tìm\'s suggested searches reach each language\'s index as written; a language with none gets no section', async () => {
  const vi = ['betta', 'cá vàng', 'bảy màu', 'tép', 'rêu java', 'bệnh đốm trắng', 'rêu hại', 'chu trình nitơ']
  const ms = ['laga', 'guppy', 'udang', 'louhan', 'arowana', 'molly', 'discus', 'penapis']
  const cur = CurationSchema.parse({ version: 1, weeks: [], days: [], searches: { vi, ms } })
  expect(curationFor(cur, 'vi', '2026-11-12', ref => `/${ref}/`).searches).toEqual(vi)
  expect('searches' in curationFor(cur, 'th', '2026-11-12', ref => `/${ref}/`)).toBe(false)
  const ix = appIndex('ms', await getContent('ms'), new Map(), (await getContent('vi')).species, { calendar: { ...calendar, searches: { vi, ms } }, today: '2026-11-10' })
  expect(ix.home.searches).toEqual(ms)
})
