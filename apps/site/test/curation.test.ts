import { expect, test } from 'vitest'
import { CurationSchema, type Curation } from '@aq/schema'
import { appIndex } from '../src/lib/app-index'
import { getContent } from '../src/lib/content'

// The editorial calendar (content/curation.json) as each language's app index carries it: Hôm nay's days, the week's
// theme, Khám phá's top cards and shelves, and a fish's loop.
const IMG = 'https://media.aquatome.com/commons/0000000000000001.webp'
const LOOP = {
  src: 'https://media.aquatome.com/loops/apistogramma-cacatuoides-1.mp4', poster: 'https://media.aquatome.com/loops/apistogramma-cacatuoides-1.webp',
  w: 1080, h: 1080, seconds: 6, licence: 'CC BY 4.0', licenceUrl: 'https://creativecommons.org/licenses/by/4.0/', author: 'Someone', source: 'https://commons.wikimedia.org/wiki/File:X.webm',
}
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
  loops: { 'apistogramma-cacatuoides': { ...LOOP, replace: 'when better footage comes' } },
})
const index = async (lang: 'vi' | 'ms', today = '2026-11-10') => appIndex(lang, await getContent(lang), new Map(), (await getContent('vi')).species, { calendar, today })
const pathOf = (ix: Awaited<ReturnType<typeof index>>, id: string) => ix.items.find(i => i.id === id)?.path

test('Hôm nay gets the days from yesterday on, each pick at its address in the language', async () => {
  const vi = await index('vi')
  expect(vi.home.days?.map(d => d.date)).toEqual(['2026-11-09', '2026-11-10'])
  const [mon, tue] = vi.home.days!
  expect(mon).toEqual({ date: '2026-11-09', fish: pathOf(vi, 'paracheirodon-axelrodi'), img: IMG, guide: expect.stringMatching(/^\/vi\/huong-dan\/.+\/$/) })
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
  expect((await index('vi')).items.filter(i => i.loop).length).toBe(1)
})

test('without a calendar the index has none of it', async () => {
  const ix = appIndex('vi', await getContent('vi'))
  for (const k of ['days', 'week', 'hero', 'shelves'] as const) expect(ix.home[k]).toBeUndefined()
})
