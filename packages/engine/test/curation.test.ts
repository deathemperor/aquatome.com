import { readdirSync, readFileSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { CurationSchema, LANGS, type Curation } from '@aq/schema'
import { across, candidates, cardsOf, cardWorthy, checkCalendar, fishProblem as problemOf, heldBy, HERO_COUNT, LARGE_PX, plan, problem, readVerdicts, TAGS, type Candidate } from '../src/curation'
import { countedYes, pickStands, readPersonYes, YES_PER_WEEK } from '../src/person-yes'

const big = (n: number) => `https://media.aquatome.com/commons/${n.toString(16).padStart(16, '0')}.webp`
const fish = (id: string, o: Partial<Candidate> & { px?: number } = {}): Candidate => {
  const url = big(id.length * 7919)
  const px = o.px ?? 1200
  return {
    kind: 'species', id, ref: `species/${id}`, path: `/vi/ca/${id}/`, name: id, fit: true, indexable: true, demand: 0,
    facts: { places: [], coldwater: false }, photo: { square: { url, px }, guide: { url, px }, wide: { url, px } }, checked: { [url]: { square: px, guide: px, wide: px } }, head: { url, px: { square: px, guide: px, wide: px } }, langs: [...LANGS], ...o,
  }
}
const guide = (id: string, o: Partial<Candidate> = {}): Candidate => ({ ...fish(id, { px: 600 }), kind: 'guides', ref: `guides/${id}`, path: `/vi/huong-dan/${id}/`, ...o })
const empty: Curation = CurationSchema.parse({ version: 1, weeks: [], days: [] })

test('a photo fills a card by its pixels across once cropped to the card\'s shape', () => {
  expect(across({ width: 1200, height: 800 }, 'square')).toBe(762)
  expect(across({ width: 1200, height: 800 }, 'wide')).toBe(1200)
  expect(across({ width: 1200, height: 1280 }, 'square')).toBe(1200)
})

test("a story naming a fish page takes its head photo, but not one the second look holds or a check refused", () => {
  const ok = fish('sss', { px: 2000 })
  const cur = CurationSchema.parse({ version: 1, weeks: [], days: [{ date: '2026-11-09', story: { page: 'species/sss' } }] })
  expect(plan(cur, [ok, fish('a'), fish('b')], '2026-11-09', 1).calendar.days[0]!.story).toEqual({ page: 'species/sss', img: ok.head!.url })
  const held = { ...ok, headFails: 'held for a second look' }
  expect(plan(cur, [held, fish('a'), fish('b')], '2026-11-09', 1).calendar.days[0]!.story).toEqual({ page: 'species/sss' })
})

test('a guide or story card takes a 16:9 photo: a video still fills it that a fish card would crop to half', async () => {
  const still = { width: 1280, height: 720 }
  expect(across(still, 'guide')).toBe(1280)
  expect(across(still, 'square')).toBe(686)
  const { headOf, photosFor } = await import('../src/curation')
  const ph = (n: number) => ({ url: big(n), ...still, licence: 'CC BY 4.0', author: 'a', sourceUrl: 'https://example.org' })
  const g = { ...guide('g1'), ...photosFor([ph(7)], () => true), head: headOf([ph(7)], () => true) }
  const smallest = [{ ...ph(8), width: 640, height: 360 }]
  const small = { ...guide('g2'), ...photosFor(smallest, () => true), head: headOf(smallest, () => true) }
  // A guide kept from an earlier plan gets its photo; one whose photos are all too small is kept, without one.
  const cur = CurationSchema.parse({ version: 1, weeks: [], days: [
    { date: '2026-11-09', guide: 'guides/g1', story: { page: 'guides/g1' } },
    { date: '2026-11-10', guide: 'guides/g2', guideImg: big(8) },
  ] })
  const { calendar, report } = plan(cur, [fish('a'), fish('b'), g, small], '2026-11-09', 2)
  expect(report.replaced).toEqual([])
  expect(calendar.days[0]).toMatchObject({ guide: 'guides/g1', guideImg: big(7), story: { page: 'guides/g1', img: big(7) } })
  expect(calendar.days[1]!.guide).toBe('guides/g2')
  expect(calendar.days[1]!.guideImg).toBeUndefined()
  expect(checkCalendar(calendar, [fish('a'), fish('b'), g, small], '2026-11-09', 2)).toEqual([])
})

test('two guides of the same kind or source never run on consecutive days', () => {
  const g = (id: string, group: string) => guide(id, { group })
  const cands = [fish('a'), fish('b'), fish('c'), g('d1', 'disease'), g('d2', 'disease'), g('s1', 'setup')]
  const { calendar } = plan(empty, cands, '2026-11-09', 3)
  const kinds = calendar.days.map(d => cands.find(c => c.ref === d.guide)?.group)
  expect(kinds).toEqual(['disease', 'setup', 'disease'])
  // Nor two from one source, whatever their kinds.
  const blog = [fish('a'), fish('b'), guide('b1', { group: 'care', source: 'blog' }), guide('b2', { group: 'setup', source: 'blog' }), guide('v1', { group: 'disease', source: 'video' })]
  expect(plan(empty, blog, '2026-11-09', 2).calendar.days.map(d => d.guide)).toEqual(['guides/b1', 'guides/v1'])
})

test('a page is featured only if it passes reader fit and has a checked photo big enough for the card', () => {
  expect(problem(fish('a'), 'square')).toBeUndefined()
  expect(problem(fish('a', { fit: false, fitWhy: 'held: units' }), 'square')).toBe('reader fit: held: units')
  expect(problem(fish('a', { px: LARGE_PX - 1 }), 'square')).toMatch(/under 1140/)
  expect(problem(fish('a'), 'square', big(1))).toMatch(/isn't one of the page's checked photos/)
  expect(problem(undefined, 'square')).toBe('no such page')
  // A guide's card without a photo needs none; with one, it must be big enough.
  expect(problem(guide('g'), 'square', undefined, { photo: false })).toBeUndefined()
  expect(problem(guide('g', { fit: false, fitWhy: 'price' }), 'square', undefined, { photo: false })).toBe('reader fit: price')
})

test('a photo leads a card only when judged the right subject, typical, with no person, logo or face', () => {
  const v = { subjects: { [big(1)]: { a: { ok: 'yes' as const, typical: true, note: '' } }, [big(2)]: { a: { ok: 'yes' as const, typical: true, note: '', person: true } }, [big(3)]: { a: { ok: 'yes' as const, typical: false, note: '' } } }, legacy: {}, rejected: {}, faces: { [big(4)]: 1 } }
  expect(cardWorthy({ url: big(1) }, 'a', v, {})).toBe(true)
  expect(cardWorthy({ url: big(1) }, 'a', v, { [big(1)]: 'a sick fish' })).toBe(false)
  expect(cardWorthy({ url: big(2) }, 'a', v, {})).toBe(false)
  expect(cardWorthy({ url: big(3) }, 'a', v, {})).toBe(false)
  expect(cardWorthy({ url: big(4) }, 'b', v, {}, true)).toBe(false)
  // A guide's photo with no verdict has passed the face and watermark checks only: allowed, a person looks at it.
  expect(cardWorthy({ url: big(5) }, 'g', v, {}, true)).toBe(true)
  // A fish its source's caption calls unwell, or names a split fin of, never leads a card. A guide's photo is not asked.
  expect(cardWorthy({ url: big(1), caption: 'Adult male.' }, 'a', v, {})).toBe(true)
  expect(cardWorthy({ url: big(1), caption: 'Adult specimen with slight caudal-fin damage.' }, 'a', v, {})).toBe(false)
  expect(cardWorthy({ url: big(1), caption: 'Skinny juvenile.' }, 'a', v, {})).toBe(false)
  expect(cardWorthy({ url: big(5), caption: 'A fish with a damaged tail fin.' }, 'g', v, {}, true)).toBe(true)
})

test('the planner fills every day from the week\'s list in order, never the same fish within four weeks', () => {
  const cands = [fish('a'), fish('b'), fish('c'), fish('small', { px: 900 }), guide('g1'), guide('g2'), guide('g3')]
  const cur = CurationSchema.parse({ version: 1, weeks: [{ from: '2026-11-09', to: '2026-11-15', theme: { vi: 'x' }, fish: ['species/c', 'species/small', 'species/b'], guides: ['guides/g2'] }], days: [] })
  const { calendar, report } = plan(cur, cands, '2026-11-09', 3)
  expect(calendar.days.map(d => d.fish)).toEqual(['species/c', 'species/b', 'species/a'])
  expect(calendar.days[0]!.guide).toBe('guides/g2')
  // The card's photo is set from the page's checked photos; a guide's only when big enough (here none is).
  expect(calendar.days[0]!.img).toBe(cands[2]!.photo.square!.url)
  expect(calendar.days.some(d => d.guideImg)).toBe(false)
  expect(report.empty).toEqual([])
  // The week has no tags, so only its own list fills its top cards: c and b (small's photo is too small). The check says so.
  expect(checkCalendar(calendar, cands, '2026-11-09', 3)).toEqual(['week 2026-11-09: 2 top cards of 5'])
  // Three fish with a big enough photo and three guides can't fill five days without one coming back: the last two
  // are left for the app's rotation.
  const more = plan(empty, cands, '2026-11-09', 5)
  expect(more.report.empty).toEqual(['2026-11-12 fish', '2026-11-12 guide', '2026-11-13 fish', '2026-11-13 guide'])
  expect(new Set(more.calendar.days.map(d => d.fish).filter(Boolean)).size).toBe(more.calendar.days.filter(d => d.fish).length)
})

test('a fish with a loop moves up on its own, but never past the week\'s own list', () => {
  const cands = [fish('a'), fish('b'), fish('c'), guide('g1'), guide('g2'), guide('g3')]
  const loop = { src: 'https://media.aquatome.com/loops/c-1.mp4', poster: 'https://media.aquatome.com/loops/c-1.webp', w: 1080, h: 1080, seconds: 8, licence: 'CC0', licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', author: 'x', source: 'https://commons.wikimedia.org/wiki/File:C.webm' }
  const looped = CurationSchema.parse({ version: 1, weeks: [], days: [], loops: { c: loop } })
  // Alike but for the loop, a and b would come first by name.
  expect(plan(empty, cands, '2026-11-09', 1).calendar.days[0]!.fish).toBe('species/a')
  const { calendar } = plan(looped, cands, '2026-11-09', 1)
  expect(calendar.days[0]!.fish).toBe('species/c')
  expect(calendar.days[0]!.why).toMatch(/has a loop/)
  const listed = CurationSchema.parse({ ...looped, weeks: [{ from: '2026-11-09', to: '2026-11-15', theme: { vi: 'x' }, fish: ['species/b'] }] })
  expect(plan(listed, cands, '2026-11-09', 2).calendar.days.map(d => d.fish)).toEqual(['species/b', 'species/c'])
})

test('a week takes one video guide, after its own list and before the rest', () => {
  const v = (id: string, o: Partial<Candidate> = {}) => guide(id, { source: 'youtube', ...o })
  const a = (id: string) => guide(id, { source: id, demand: 50 })
  const cands = [fish('f1'), fish('f2'), fish('f3'), fish('f4'), a('a1'), a('a2'), a('a3'), v('v1'), v('v2')]
  const week = { from: '2026-11-09', to: '2026-11-15', theme: { vi: 'x' } }
  const guides = (cur: Curation) => plan(cur, cands, '2026-11-09', 4).calendar.days.map(d => d.guide)
  // The articles' searches would fill every day; the week still gets one video, and only one.
  expect(guides(CurationSchema.parse({ version: 1, weeks: [week], days: [] }))).toEqual(['guides/v1', 'guides/a1', 'guides/a2', 'guides/a3'])
  // The week's own list first.
  expect(guides(CurationSchema.parse({ version: 1, weeks: [{ ...week, guides: ['guides/a3'] }], days: [] }))).toEqual(['guides/a3', 'guides/v1', 'guides/a1', 'guides/a2'])
  // A week that has its video guide already takes no other.
  const kept = CurationSchema.parse({ version: 1, weeks: [week], days: [{ date: '2026-11-12', guide: 'guides/v2', fixed: true }] })
  expect(guides(kept)).toEqual(['guides/a1', 'guides/a2', 'guides/a3', 'guides/v2'])
  // A day outside every week takes the nearest week's theme, not a video for it.
  expect(guides(CurationSchema.parse({ version: 1, weeks: [{ ...week, from: '2026-11-02', to: '2026-11-08' }], days: [] }))).toEqual(['guides/a1', 'guides/a2', 'guides/a3', 'guides/v1'])
})

test('a chosen day is kept while it passes; a pick that stops passing is replaced and said why', () => {
  const cands = [fish('a'), fish('b'), guide('g1'), guide('g2')]
  const cur = CurationSchema.parse({ version: 1, weeks: [], days: [{ date: '2026-11-09', fish: 'species/a', img: cands[0]!.photo.square!.url, guide: 'guides/g1', fixed: true }] })
  expect(plan(cur, cands, '2026-11-09', 1).report.kept).toEqual(['2026-11-09 fish', '2026-11-09 guide'])
  const held = cands.map(c => (c.id === 'a' ? { ...c, fit: false, fitWhy: 'held: price' } : c))
  const { calendar, report } = plan(cur, held, '2026-11-09', 1)
  expect(report.replaced).toEqual([{ date: '2026-11-09', slot: 'fish', was: 'species/a', why: 'reader fit: held: price' }])
  expect(calendar.days[0]).toMatchObject({ fish: 'species/b', guide: 'guides/g1' })
  expect(calendar.days[0]!.fixed).toBeUndefined()
  expect(checkCalendar(cur, held, '2026-11-09', 1)).toEqual(['2026-11-09 fish species/a: reader fit: held: price'])
})

test('a day\'s card is there to show: written in a language the gate lets out, within its days; the planner leaves it be', async () => {
  const root = await mkdtemp(join(tmpdir(), 'curation-cards-'))
  const card = (id: string, langs: Record<string, object>) => Promise.all([
    mkdir(join(root, 'content', 'cards', id), { recursive: true }).then(() => writeFile(join(root, 'content', 'cards', id, 'entity.json'), JSON.stringify({
      id, type: 'trivia', sources: [{ url: 'https://example.org/a', title: 'A', publisher: 'P', date: '2026-11-01', accessed: '2026-11-08' }], show: { from: '2026-11-10', until: '2026-11-11' }, updatedAt: '2026-11-08',
    }))).then(() => Promise.all(Object.entries(langs).map(([lang, t]) => writeFile(join(root, 'content', 'cards', id, `${lang}.json`), JSON.stringify({ eyebrow: 'e', title: 't', body: '<p>b</p>', ...t }))))),
  ])
  await card('ok', { vi: {}, th: { held: { checks: ['elsewhere'], at: '2026-11-08' } } })
  await card('held', { vi: { held: { checks: ['source'], at: '2026-11-08' } } })
  // A card whose files don't parse is listed, and the rest still read.
  await mkdir(join(root, 'content', 'cards', 'broken'), { recursive: true })
  await writeFile(join(root, 'content', 'cards', 'broken', 'entity.json'), JSON.stringify({ id: 'broken', type: 'trivia', show: { from: '2026-11-10', until: '2026-11-11' }, updatedAt: '2026-11-08' }))
  await mkdir(join(root, 'content', 'cards', 'not-json'), { recursive: true })
  await writeFile(join(root, 'content', 'cards', 'not-json', 'entity.json'), '{')
  const cards = await cardsOf(root)
  expect(cards.get('cards/broken')).toEqual({ bad: 'sources: Invalid input: expected array, received undefined' })
  expect(cards.get('cards/not-json')).toMatchObject({ bad: expect.stringMatching(/JSON/) })
  expect(cards.get('cards/ok')).toEqual({ show: { from: '2026-11-10', until: '2026-11-11' }, langs: ['vi'] })
  // A fair in Bangkok shows only in Thai: its Vietnamese card is the translators' source.
  const e = JSON.parse(await readFile(join(root, 'content', 'cards', 'ok', 'entity.json'), 'utf8'))
  await mkdir(join(root, 'content', 'cards', 'fair'), { recursive: true })
  await writeFile(join(root, 'content', 'cards', 'fair', 'entity.json'), JSON.stringify({ ...e, id: 'fair', type: 'event', event: { start: '2026-11-10', end: '2026-11-11', place: 'Bangkok', country: 'TH', organiser: 'A club' } }))
  for (const lang of ['vi', 'th']) await writeFile(join(root, 'content', 'cards', 'fair', `${lang}.json`), JSON.stringify({ eyebrow: 'e', title: 't', body: '<p>b</p>' }))
  expect((await cardsOf(root)).get('cards/fair')).toMatchObject({ langs: ['th'] })
  // A photo used by its source's permission names that source, or no build shows it (the marimo card, 14 Nov).
  const photo = { url: 'https://media.aquatome.com/aquariumcoop/57f2673d7472a8f2.webp', width: 1000, height: 667, licence: 'dùng với sự cho phép', author: 'Aquarium Co-op', sourceUrl: 'https://www.aquariumcoop.com/x' }
  for (const [id, ph] of [['unsourced', photo], ['sourced', { ...photo, source: 'aquariumcoop' }]] as const) {
    await mkdir(join(root, 'content', 'cards', id), { recursive: true })
    await writeFile(join(root, 'content', 'cards', id, 'entity.json'), JSON.stringify({ ...e, id, photo: ph }))
    await writeFile(join(root, 'content', 'cards', id, 'vi.json'), JSON.stringify({ eyebrow: 'e', title: 't', body: '<p>b</p>' }))
  }
  const withPhotos = await cardsOf(root)
  expect(withPhotos.get('cards/sourced')).toEqual({ show: e.show, langs: ['vi'] })
  const photoDays = CurationSchema.parse({ version: 1, weeks: [], days: ['unsourced', 'sourced'].map(id => ({ date: '2026-11-10', fish: 'species/a', guide: 'guides/g', card: `cards/${id}` })) })
  expect(checkCalendar(photoDays, [fish('a'), guide('g')], '2026-11-10', 0, withPhotos).filter(x => x.includes(' card '))).toEqual([
    '2026-11-10 card cards/unsourced: its photo names no source, and a build shows a photo under "dùng với sự cho phép" only by its source\'s permission',
  ])
  const cands = [fish('a'), guide('g')]
  const day = (date: string, card: string) => ({ date, fish: 'species/a', img: cands[0]!.photo.square!.url, guide: 'guides/g', card })
  const cur = CurationSchema.parse({ version: 1, weeks: [], days: [day('2026-11-10', 'cards/ok'), day('2026-11-12', 'cards/ok'), day('2026-11-13', 'cards/held'), day('2026-11-14', 'cards/none'), day('2026-11-15', 'cards/broken')] })
  // 10 Nov's card passes; the others don't.
  expect(checkCalendar(cur, cands, '2026-11-10', 1, cards)).toEqual([
    '2026-11-12 card cards/ok: outside its days, 2026-11-10 to 2026-11-11',
    '2026-11-13 card cards/held: held back or unwritten in every language',
    '2026-11-14 card cards/none: no such card',
    "2026-11-15 card cards/broken: its files don't parse: sources: Invalid input: expected array, received undefined",
  ])
  expect(plan(cur, cands, '2026-11-10', 1).calendar.days[0]!.card).toBe('cards/ok')
})

test('a page the top cards, shelves or a story name that fails reader fit is listed off, and comes back once it passes', () => {
  const cands = [fish('a'), fish('b'), fish('c'), fish('bad', { fit: false, fitWhy: 'units' }), guide('g1'), guide('g2', { fit: false, fitWhy: 'source' })]
  const week = { from: '2026-11-09', to: '2026-11-15', theme: { vi: 'x' }, hero: [{ page: 'species/a' }, { page: 'species/bad' }], shelves: [{ id: 's', title: { vi: 'y' }, pages: ['species/a', 'species/b', 'species/bad', 'species/gone'] }] }
  const old = { from: '2026-11-02', to: '2026-11-08', theme: { vi: 'z' }, hero: [{ page: 'species/bad' }] }
  const cur = CurationSchema.parse({ version: 1, weeks: [old, week], days: [{ date: '2026-11-09', story: { page: 'guides/g2' } }] })
  const { calendar } = plan(cur, cands, '2026-11-09', 1)
  // A past week's picks aren't read.
  expect(calendar.off).toEqual({ 'guides/g2': 'reader fit: source', 'species/bad': 'reader fit: units', 'species/gone': 'no such page' })
  expect(checkCalendar(calendar, cands, '2026-11-09', 1).filter(x => !x.includes(': no ') && !x.includes('top cards of'))).toEqual([])
  const fixed = cands.map(c => (c.fit ? c : { ...c, fit: true, fitWhy: undefined }))
  expect(plan(calendar, fixed, '2026-11-09', 1).calendar.off).toEqual({ 'species/gone': 'no such page' })
})

test('the calendar in the repository parses, and names no page twice on Hôm nay within four weeks', () => {
  const cur = CurationSchema.parse(JSON.parse(readFileSync(new URL('../../../content/curation.json', import.meta.url), 'utf8')))
  const picks = cur.days.flatMap(d => [d.fish, d.guide].filter((x): x is string => !!x).map(ref => ({ ref, t: Date.parse(d.date) })))
  for (const a of picks) for (const b of picks) if (a !== b && a.ref === b.ref) expect(Math.abs(a.t - b.t), a.ref).toBeGreaterThanOrEqual(28 * 86400_000)
  // Every day has its fish's card photo.
  for (const d of cur.days) if (d.fish) expect(d.img, d.date).toBeDefined()
})

test('a week with tags takes only fish that match one, or that are on its own list', () => {
  const nano = (id: string) => fish(id, { facts: { places: [], coldwater: false, sizeMax: 3, schoolMin: 6 } })
  const cands = [nano('a'), fish('big', { facts: { places: [], coldwater: false, sizeMax: 30 } }), fish('listed', { facts: { places: [], coldwater: false, sizeMax: 40 } }), guide('g1'), guide('g2'), guide('g3')]
  const cur = CurationSchema.parse({ version: 1, weeks: [{ from: '2026-11-16', to: '2026-11-22', theme: { vi: 'Bể nhỏ' }, tags: ['nano'], fish: ['species/listed'] }], days: [] })
  const { calendar, report } = plan(cur, cands, '2026-11-16', 3)
  // When no fish of the tags is left, a day takes any fish rather than none, and says so.
  expect(calendar.days.map(d => d.fish)).toEqual(['species/listed', 'species/a', 'species/big'])
  expect(calendar.days[2]!.why).toContain("no fish of this week's tags (nano) is left")
  expect(report.empty).not.toContain('2026-11-18 fish')
  // A pick already in the calendar that the week's tags no longer take is replaced, unless a person chose it.
  const big30 = cands[1]!
  const was = CurationSchema.parse({ ...cur, days: [{ date: '2026-11-16', fish: big30.ref, img: big30.photo.square!.url }] })
  expect(plan(was, cands, '2026-11-16', 1).report.replaced).toEqual([{ date: '2026-11-16', slot: 'fish', was: 'species/big', why: "doesn't match this week's tags (nano)" }])
  const chosen = CurationSchema.parse({ ...cur, days: [{ date: '2026-11-16', fish: big30.ref, img: big30.photo.square!.url, fixed: true }] })
  // Filling the day's guide leaves it a person's day, so the next plan keeps its fish too.
  const once = plan(chosen, cands, '2026-11-16', 1).calendar
  expect(once.days[0]).toMatchObject({ fish: 'species/big', fixed: true })
  expect(once.days[0]!.guide).toBeDefined()
  expect(plan(once, cands, '2026-11-16', 1).calendar.days[0]).toMatchObject({ fish: 'species/big', fixed: true })
})

test('a tag goes by the page\'s own figures: a koi whose page says 20 °C is no cold fish, nor a 90 cm tank\'s tetra or a lone ram a small schooling one', () => {
  const f = { places: [], coldwater: false }
  expect(TAGS.cold!({ ...f, coldwater: true, tempMin: 20 })).toBe(false)
  expect(TAGS.cold!({ ...f, coldwater: true })).toBe(true)
  expect(TAGS.cold!({ ...f, tempMin: 16 })).toBe(true)
  expect(TAGS.nano!({ ...f, sizeMax: 3, tankCm: 45, schoolMin: 6 })).toBe(true)
  expect(TAGS.nano!({ ...f, sizeMax: 4, tankCm: 90, schoolMin: 6 })).toBe(false)
  expect(TAGS.nano!({ ...f, sizeMax: 1.5, invert: true, schoolMin: 10 })).toBe(false)
  // Small, but kept alone or in pairs: no fish for a week of small schooling fish.
  expect(TAGS.nano!({ ...f, sizeMax: 4, tankCm: 60 })).toBe(false)
  // Native by the page's native range, not by where it was recorded.
  expect(TAGS.local!({ ...f, places: ['vietnam', 'thailand'], native: ['TH'] })).toBe(false)
  expect(TAGS.local!({ ...f, places: ['vietnam'] })).toBe(true)
})

test('a breed\'s card can use a checked photo from its gallery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'curation-'))
  await cp(new URL('../../../apps/site/test/fixture-content', import.meta.url), join(root, 'content'), { recursive: true })
  const url = 'https://images.unsplash.com/photo-1000000000007-flowerhorn7?ixid=fixture&w=1280&q=80&fm=jpg&fit=max'
  await mkdir(join(root, 'engine-state'))
  await writeFile(join(root, 'engine-state', '_photo-subjects.json'), JSON.stringify({ [url]: { 'flowerhorn-cichlid': { ok: 'yes', typical: true, note: '' } } }))
  const fh = (await candidates(root)).find(c => c.ref === 'breeds/flowerhorn-cichlid')
  expect(fh?.photo.square?.url).toBe(url)
})

test("a card's photo is its page's head photo or none: never another, however big", async () => {
  // The owner (2026-11-10): the Altum on Hôm nay was a different photo from the one its page opened on.
  const url = 'https://media.aquatome.com/commons/1111111111111111.webp'
  const bigger = 'https://media.aquatome.com/commons/2222222222222222.webp'
  const head = (px: number) => ({ url, px: { square: px, guide: px, wide: px } })
  const best = { square: { url: bigger, px: 1600 }, guide: { url: bigger, px: 1600 }, wide: { url: bigger, px: 1600 } }
  const checked = { [url]: { square: 1200, guide: 1200, wide: 1200 }, [bigger]: { square: 1600, guide: 1600, wide: 1600 } }
  const a = fish('aaaa', { head: head(1200), photo: best, checked })
  const days = [{ date: '2026-11-09', fish: 'species/aaaa', img: bigger, guide: 'guides/gg', guideImg: bigger, story: { page: 'guides/gg', img: bigger } }]
  const g = guide('gg', { head: head(1200), photo: best, checked })
  const before = CurationSchema.parse({ version: 1, weeks: [], days })
  expect(checkCalendar(before, [a, g], '2026-11-09', 1)).toEqual([
    "2026-11-09 fish species/aaaa: its card's photo isn't the page's head photo",
    "2026-11-09 guide guides/gg: its card's photo isn't the page's head photo",
    "2026-11-09 story guides/gg: its card's photo isn't the page's head photo",
  ])
  const { calendar } = plan(before, [a, g], '2026-11-09', 1)
  expect(calendar.days[0]).toMatchObject({ fish: 'species/aaaa', img: url, guideImg: url, story: { page: 'guides/gg', img: url } })
  expect(checkCalendar(calendar, [a, g], '2026-11-09', 1)).toEqual([])

  // A guide whose head is too small, or isn't checked, has no card photo, though a bigger one is there.
  const small = guide('gg', { head: head(1000), photo: best, checked })
  expect(plan(before, [a, small], '2026-11-09', 1).calendar.days[0]!.guideImg).toBeUndefined()
  const unchecked = guide('gg', { head: undefined, photo: best, checked })
  expect(plan(before, [a, unchecked], '2026-11-09', 1).calendar.days[0]!.guideImg).toBeUndefined()
})

test('a fish whose head photo is under the rule stays off the calendar, however big its gallery photos are', () => {
  const big1 = fish('big1'), small = fish('small', { head: { url: 'https://media.aquatome.com/commons/3333333333333333.webp', px: { square: 608, guide: 900, wide: 900 } } })
  expect(problemOf(small)).toBe('head photo 608 px across, under 1140')
  expect(problemOf(fish('none', { head: undefined }))).toBe('no checked head photo')
  const cur = CurationSchema.parse({ version: 1, weeks: [], days: [{ date: '2026-11-09', fish: 'species/small', img: small.photo.square!.url }] })
  const { calendar, report } = plan(cur, [small, big1, guide('gg')], '2026-11-09', 1)
  expect(calendar.days[0]!.fish).toBe('species/big1')
  expect(report.replaced).toEqual([{ date: '2026-11-09', slot: 'fish', was: 'species/small', why: 'head photo 608 px across, under 1140' }])
})

test("a head's address is its large copy's, and its size is that copy's; a head that doesn't pass isn't one", async () => {
  const { headOf } = await import('../src/curation')
  const p = { url: big(1), width: 960, height: 640, large: { url: big(2), width: 1800, height: 1200 }, licence: 'x', author: 'a', sourceUrl: 'x' }
  expect(headOf([p], () => true)).toEqual({ url: big(2), px: { square: 1143, guide: 1800, wide: 1800 } })
  expect(headOf([p], () => false)).toBeUndefined()
  expect(headOf([], () => true)).toBeUndefined()
})

const heroWeek = (hero: { page: string; img?: string }[]) => CurationSchema.parse({
  version: 1, weeks: [{ from: '2026-11-09', to: '2026-11-15', theme: { vi: 'x' }, hero }], days: [],
})
/** The check's lines about the top cards themselves, not the week's count. */
const cardLines = (xs: string[]) => xs.filter(x => x.includes(' hero '))

test("Khám phá's top card that opens a fish's page shows that page's head photo", () => {
  const other = 'https://media.aquatome.com/commons/5555555555555555.webp'
  const fishHead = 'https://media.aquatome.com/commons/6666666666666666.webp'
  const px = { square: 1400, guide: 1400, wide: 1400 }
  const a = fish('aaaa', { head: { url: fishHead, px }, checked: { [fishHead]: px, [other]: px } })
  const cur = heroWeek([{ page: 'species/aaaa', img: other }])
  expect(cardLines(checkCalendar(cur, [a], '2026-11-09', 0))).toEqual([
    "week 2026-11-09 hero species/aaaa: its card's photo isn't the page's head photo",
  ])
  const { calendar, report } = plan(cur, [a], '2026-11-09', 0)
  expect(calendar.weeks[0]!.hero[0]!.img).toBe(fishHead)
  expect(report.heroes).toEqual([`2026-11-09 species/aaaa: ${other} -> ${fishHead}`])
  expect(cardLines(checkCalendar(calendar, [a], '2026-11-09', 0))).toEqual([])
})

test("a Khám phá card over a head too small for it takes the head anyway, and the check reports the head", () => {
  const smallHead = 'https://media.aquatome.com/commons/7777777777777777.webp'
  const smallImg = 'https://media.aquatome.com/commons/8888888888888888.webp'
  const wide = { square: 1400, guide: 1400, wide: 800 }
  const big = { square: 1600, guide: 1600, wide: 1600 }
  const small = fish('small', { head: { url: smallHead, px: wide }, checked: { [smallHead]: wide, [smallImg]: big } })
  const cur = heroWeek([{ page: 'species/small', img: smallImg }])
  const { calendar, report } = plan(cur, [small], '2026-11-09', 0)
  expect(calendar.weeks[0]!.hero[0]!.img).toBe(smallHead)
  expect(report.heroes).toEqual([`2026-11-09 species/small: ${smallImg} -> ${smallHead}`])
  expect(cardLines(checkCalendar(calendar, [small], '2026-11-09', 0))).toEqual([
    'week 2026-11-09 hero species/small: head photo 800 px across, under 1140',
  ])
})

test("a Khám phá card that opens a guide keeps its photo and today's check", () => {
  const g = guide('gg')
  const cur = heroWeek([{ page: 'guides/gg', img: g.head!.url }])
  const { calendar, report } = plan(cur, [g], '2026-11-09', 0)
  expect(calendar.weeks[0]!.hero[0]).toEqual(cur.weeks[0]!.hero[0])
  expect(cardLines(checkCalendar(cur, [g], '2026-11-09', 0))).toEqual([
    'week 2026-11-09 hero guides/gg: photo 600 px across, under 1140',
  ])
  expect(report.heroes).toEqual([])
})

test("a planned week has no hidden top card: a fish that shows takes its place, and the check fails on one", () => {
  const other = 'https://media.aquatome.com/commons/5555555555555555.webp'
  const cands = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => fish(id))
  const hidden = fish('hidden', { fit: false, fitWhy: 'source' })
  const cur = { ...heroWeek([{ page: 'species/hidden', img: other }, { page: 'species/a' }]), off: { 'species/hidden': 'reader fit: source' } }
  expect(checkCalendar(cur, [hidden, ...cands], '2026-11-09', 0)).toContain('week 2026-11-09 hero species/hidden: reader fit: source')
  const { calendar, report } = plan(cur, [hidden, ...cands], '2026-11-09', 0)
  const hero = calendar.weeks[0]!.hero
  // In its place, so the week's order holds; then the week fills to five.
  expect(hero.map(h => h.page)).toEqual(['species/b', 'species/a', 'species/c', 'species/d', 'species/e'])
  expect(hero.length).toBe(HERO_COUNT)
  expect(hero.every(h => h.img === cands.find(c => c.ref === h.page)!.head!.url)).toBe(true)
  expect(report.heroes).toContain('2026-11-09 species/hidden out (reader fit: source), species/b in')
  expect(checkCalendar(calendar, [hidden, ...cands], '2026-11-09', 0)).toEqual([])
  expect(calendar.off).toEqual({})
})

test("a week fills its top cards from its own list first, never with a fish another week has within four weeks, nor one with a poor head", () => {
  const cands = ['a', 'b', 'c', 'listed', 'twice', 'small', 'far'].map(id => fish(id, { px: id === 'small' ? 800 : 1200 }))
  const week = (from: string, to: string, hero: string[], fish: string[] = []) => ({ from, to, theme: { vi: 'x' }, fish: fish.map(f => `species/${f}`), hero: hero.map(page => ({ page: `species/${page}` })) })
  const cur = CurationSchema.parse({
    version: 1, days: [],
    weeks: [week('2026-10-05', '2026-10-11', ['far']), week('2026-11-02', '2026-11-08', ['twice']), week('2026-11-09', '2026-11-15', ['a'], ['twice', 'listed', 'b', 'c', 'far', 'small'])],
  })
  const { calendar } = plan(cur, cands, '2026-11-09', 0)
  // The listed fish first; the one on last week's top cards isn't taken though listed; the one five weeks back may come.
  expect(calendar.weeks[2]!.hero.map(h => h.page)).toEqual(['species/a', 'species/listed', 'species/b', 'species/c', 'species/far'])
  // A past week is left as it was.
  expect(calendar.weeks[1]).toEqual(cur.weeks[1])
  expect(checkCalendar(calendar, cands, '2026-11-09', 0)).toEqual([])
  expect(checkCalendar(cur, cands, '2026-11-09', 0)).toContain(`week 2026-11-09: 1 top cards of ${HERO_COUNT}`)
})

test("a week's top cards fill first with fish every language has a page for, and a hand-picked card stays", () => {
  // The first on the list scores higher but has no Malay page; the second has every language.
  const listed = fish('listed', { langs: ['vi', 'id', 'th'] }), everywhere = fish('everywhere')
  const picked = fish('picked', { langs: ['vi'] }), hidden = fish('hidden', { fit: false, fitWhy: 'source' })
  const cur = CurationSchema.parse({
    version: 1, days: [],
    weeks: [{ from: '2026-11-09', to: '2026-11-15', theme: { vi: 'x' }, fish: ['species/listed', 'species/everywhere'], hero: [{ page: 'species/picked' }, { page: 'species/hidden' }] }],
  })
  const { calendar } = plan(cur, [listed, everywhere, picked, hidden], '2026-11-09', 0)
  expect(calendar.weeks[0]!.hero.map(h => h.page)).toEqual(['species/picked', 'species/everywhere', 'species/listed'])
})

test("a week with no tags fills its top cards only from its own list", () => {
  const cur = CurationSchema.parse({ version: 1, days: [], weeks: [{ from: '2026-11-30', to: '2026-12-06', theme: { vi: 'Cá châu Phi' }, fish: ['species/african'], hero: [] }] })
  const { calendar } = plan(cur, [fish('african', { langs: ['vi'] }), fish('elsewhere')], '2026-11-30', 0)
  expect(calendar.weeks[0]!.hero.map(h => h.page)).toEqual(['species/african'])
})

test("a fish whose head Hôm nay's card cuts is no day's fish, and stays a week's top card", () => {
  // Ids of different lengths: the helper's photo address follows the id's length.
  const cut = fish('cut'), whole = fish('whole'), why = 'its snout falls outside the card'
  const cur = CurationSchema.parse({
    version: 1, todayCut: { [cut.head!.url]: why },
    weeks: [{ from: '2026-11-09', to: '2026-11-15', theme: { vi: 'x' }, fish: ['species/cut', 'species/whole'], hero: [{ page: 'species/cut', img: cut.head!.url }] }],
    days: [{ date: '2026-11-09', fish: 'species/cut', img: cut.head!.url }],
  })
  const problem = `Hôm nay's card cuts its head photo: ${why}`
  // A day that carries it is named, and the planner puts another fish there and on no day puts it back.
  expect(checkCalendar(cur, [cut, whole], '2026-11-09', 1)).toContain(`2026-11-09 fish species/cut: ${problem}`)
  const { calendar, report } = plan(cur, [cut, whole], '2026-11-09', 3)
  expect(report.replaced).toEqual([{ date: '2026-11-09', slot: 'fish', was: 'species/cut', why: problem }])
  expect(calendar.days.map(d => d.fish)).toEqual(['species/whole', undefined, undefined])
  // Khám phá's wide card still shows it, on its head.
  expect(calendar.weeks[0]!.hero[0]).toEqual({ page: 'species/cut', img: cut.head!.url })
  expect(checkCalendar(calendar, [cut, whole], '2026-11-09', 1).filter(x => x.includes('species/cut'))).toEqual([])
})

test("the planner reads the fish's boxes, whatever the site's switch", async () => {
  const root = await mkdtemp(join(tmpdir(), 'curation-'))
  await cp(new URL('../../../apps/site/test/fixture-content', import.meta.url), join(root, 'content'), { recursive: true })
  const url = 'https://images.unsplash.com/photo-1000000000001-pigeonblood1?ixid=fixture&w=1280&q=80&fm=jpg&fit=max'
  await mkdir(join(root, 'engine-state'))
  await writeFile(join(root, 'engine-state', '_photo-subjects.json'), JSON.stringify({ [url]: { 'pigeon-blood-discus': { ok: 'yes', typical: true, note: '' } } }))
  const head = async () => (await candidates(root)).find(c => c.ref === 'breeds/pigeon-blood-discus')?.head
  expect(await head()).toMatchObject({ url })
  expect((await head())?.cut).toBeUndefined()
  // A discus along the whole 4:3 photo: either card cuts it.
  await writeFile(join(root, 'engine-state', '_photo-boxes.json'), JSON.stringify({ [url]: { x: 0.02, y: 0.3, w: 0.96, h: 0.4 } }))
  expect((await head())?.cut).toBe(true)
})

test("a fish whose head Hôm nay's card, centred, would cut by more than 5% (its box) is no day's fish, unless a person set the day", async () => {
  const { headOf } = await import('../src/curation')
  const photo = (subject?: { x0: number; y0: number; x1: number; y1: number }) => ({ url: big(1), width: 1600, height: 1200, licence: 'CC BY 4.0', author: 'a', sourceUrl: 'https://x/', ...(subject ? { subject } : {}) })
  // The card is wider than tall, narrower than the photo: it cuts the photo's sides. A fish along the photo's length is cut
  // at either card shape; one in the middle isn't; no box (none found yet) isn't taken for a cut.
  expect(headOf([photo({ x0: 40, y0: 400, x1: 1560, y1: 800 })], () => true)?.cut).toBe(true)
  expect(headOf([photo({ x0: 500, y0: 400, x1: 1100, y1: 800 })], () => true)?.cut).toBeUndefined()
  expect(headOf([photo()], () => true)?.cut).toBeUndefined()
  // A square photo: both cards cut its top and bottom, the two-line card (362/278) more. A fish from 70 to 930 down it fits the
  // one-line card and loses 10.7% on the two-line one.
  const square = { ...photo({ x0: 100, y0: 70, x1: 900, y1: 930 }), width: 1000, height: 1000 }
  expect(headOf([square], () => true)?.cut).toBe(true)
  expect(headOf([{ ...square, subject: { x0: 100, y0: 100, x1: 900, y1: 900 } }], () => true)?.cut).toBeUndefined()
  const cut = fish('cut'), whole = fish('whole')
  cut.head = { ...cut.head!, cut: true }
  const problem = "Hôm nay's card cuts the fish in its head photo by more than 5% (its box)"
  const cur = CurationSchema.parse({
    version: 1, weeks: [{ from: '2026-11-09', to: '2026-11-15', theme: { vi: 'x' }, fish: ['species/cut', 'species/whole'] }],
    days: [{ date: '2026-11-09', fish: 'species/cut', img: cut.head!.url }],
  })
  expect(checkCalendar(cur, [cut, whole], '2026-11-09', 1)).toContain(`2026-11-09 fish species/cut: ${problem}`)
  const { calendar, report } = plan(cur, [cut, whole], '2026-11-09', 2)
  expect(report.replaced).toEqual([{ date: '2026-11-09', slot: 'fish', was: 'species/cut', why: problem }])
  expect(calendar.days.map(d => d.fish)).toEqual(['species/whole', undefined])
  // A day a person set keeps its fish (the Siamese tiger fish, shown whole, 23 Nov: the chief of staff decides by 21 Nov).
  const chosen = CurationSchema.parse({ ...cur, days: [{ ...cur.days[0]!, fixed: true }] })
  expect(plan(chosen, [cut, whole], '2026-11-09', 1).calendar.days[0]!.fish).toBe('species/cut')
  expect(checkCalendar(chosen, [cut, whole], '2026-11-09', 1).filter(x => x.includes('species/cut'))).toEqual([])
})

test('a day filled between planned days differs in kind of fish from the day after too', () => {
  const tetra = (id: string, o: Partial<Candidate> = {}) => fish(id, { group: 'tetras', ...o })
  // The 10th is planned with a tetra; the 9th, filled now, would take the better-scoring tetra but for the day after it.
  const cur = CurationSchema.parse({ version: 1, weeks: [], days: [{ date: '2026-11-10', fish: 'species/t1', img: tetra('t1').head!.url }] })
  const cands = [tetra('t1'), tetra('t22', { demand: 500 }), fish('catfish', { group: 'catfish' })]
  const { calendar } = plan(cur, cands, '2026-11-09', 2)
  expect(calendar.days.map(d => d.fish)).toEqual(['species/catfish', 'species/t1'])
})

test('planning Khám phá cards does not change the calendar it was given', () => {
  const other = 'https://media.aquatome.com/commons/5555555555555555.webp'
  const a = fish('aaaa')
  const cur = heroWeek([{ page: 'species/aaaa', img: other }])
  const given = structuredClone(cur)
  plan(cur, [a], '2026-11-09', 0)
  expect(cur).toEqual(given)
})

test("a language's own picks follow the same rule: a card's photo is the page's head", () => {
  const a = fish('aaaa'), g = guide('gg')
  const other = 'https://media.aquatome.com/commons/4444444444444444.webp'
  const cur = CurationSchema.parse({ version: 1, weeks: [], days: [{ date: '2026-11-09', fish: 'species/aaaa', img: a.head!.url, guide: 'guides/gg', by: { id: { img: other } } }] })
  expect(checkCalendar(cur, [a, g], '2026-11-09', 1)).toEqual(["2026-11-09 id: its card's photo isn't the page's head photo"])
})

test('Tìm\'s suggested searches are eight a language, or none, and the planner keeps them as written', () => {
  const eight = ['betta', 'cá vàng', 'bảy màu', 'tép', 'rêu java', 'bệnh đốm trắng', 'rêu hại', 'chu trình nitơ']
  const cur = CurationSchema.parse({ version: 1, weeks: [], days: [], searches: { vi: eight } })
  expect(plan(cur, [fish('a')], '2026-11-12', 1).calendar.searches).toEqual({ vi: eight })
  // Seven, a search listed twice (in any case), or a blank one: the file doesn't read.
  for (const bad of [eight.slice(1), [...eight.slice(0, 7), 'Betta'], [...eight.slice(1), ' ']])
    expect(CurationSchema.safeParse({ version: 1, weeks: [], days: [], searches: { vi: bad } }).success, JSON.stringify(bad)).toBe(false)
  expect(empty.searches).toEqual({})
})

test("a person's yes stands for the check's over its \"can't tell\" only, from two who may say yes, neither of them its proposer, naming the look-alike and a mark on the fish's body, five a week at most", async () => {
  const yes = { proposer: 'Photo Sourcing', approvers: ['the chief of staff', 'Curation'], on: '2026-11-19', lookAlike: 'Channa argus', mark: 'the rows of round dark blotches along the flank' }
  const counted = countedYes({
    [big(1)]: { a: yes },
    [big(2)]: { a: { ...yes, proposer: 'Curation' } }, // the proposer is one of the two
    [big(3)]: { a: { ...yes, approvers: ['the chief of staff', 'a reader'] } }, // one who may not say yes
    [big(4)]: { a: { ...yes, mark: ' ' } }, // no mark
    [big(5)]: { a: { ...yes, lookAlike: undefined } }, // no look-alike
    [big(6)]: { a: { ...yes, on: 'soon' } }, // no day
    [big(7)]: { a: { ...yes, approvers: ['Curation', 'Curation'] } }, // one person twice
    [big(8)]: { a: { ...yes, approvers: ['Curation'] } }, // one yes
    [big(9)]: { a: { ...yes, mark: 'the lettering in the corner' } }, // a mark that isn't on the fish
    [big(10)]: { a: { ...yes, mark: 'the "X" on its side' } }, // a quoted word
  })
  expect(Object.keys(counted)).toEqual([big(1)])
  // Five a week, Monday to Sunday, earliest first; the next week counts afresh.
  const week = Object.fromEntries([...Array(7)].map((_, i) => [big(20 + i), { a: { ...yes, on: `2026-11-${16 + i}` } }]))
  week[big(30)] = { a: { ...yes, on: '2026-11-23' } }
  expect(Object.keys(countedYes(week)).sort()).toEqual([...[0, 1, 2, 3, 4].map(i => big(20 + i)), big(30)].sort())
  expect(YES_PER_WEEK).toBe(5)

  const v = (ok: string, x: object = {}) => ({ subjects: { [big(1)]: { a: { ok, typical: true, note: '', ...x } as never } }, legacy: {}, rejected: {}, faces: {}, personYes: counted })
  expect(cardWorthy({ url: big(1) }, 'a', v('unsure'), {})).toBe(true)
  expect(cardWorthy({ url: big(1) }, 'a', { ...v('unsure'), personYes: {} }, {})).toBe(false)
  // A firm no stands: another fish, no fish, dead; and so do the check's own typical, person and logo answers.
  for (const ok of ['other', 'none', 'dead']) expect(cardWorthy({ url: big(1) }, 'a', v(ok), {})).toBe(false)
  expect(cardWorthy({ url: big(1) }, 'a', v('unsure', { typical: false }), {})).toBe(false)
  expect(cardWorthy({ url: big(1) }, 'a', v('unsure', { person: true }), {})).toBe(false)
  expect(cardWorthy({ url: big(1) }, 'a', v('unsure', { logo: true }), {})).toBe(false)
  // For its own page only, and not a verdict against a guide's caption.
  const other = { subjects: { [big(1)]: { b: { ok: 'unsure', typical: true, note: '' } as never } }, legacy: {}, rejected: {}, faces: {}, personYes: counted }
  expect(cardWorthy({ url: big(1) }, 'b', other, {})).toBe(false)
  expect(cardWorthy({ url: big(1) }, 'a', v('unsure', { guide: true }), {})).toBe(false)
  // A "can't tell" against a guide's caption is not the page's own: the older verdict it falls back to stands.
  expect(cardWorthy({ url: big(1) }, 'a', { ...v('unsure', { guide: true }), legacy: { [big(1)]: { ok: 'other', typical: true, note: '' } as never } }, {})).toBe(false)
  // Avoided, rejected or a face: no yes overrides those.
  expect(cardWorthy({ url: big(1) }, 'a', v('unsure'), { [big(1)]: 'head outside the crop' })).toBe(false)

  // The engine reads it from engine-state and keeps only what counts.
  const root = await mkdtemp(join(tmpdir(), 'aq-yes-'))
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'engine-state/_photo-person-yes.json'), JSON.stringify({ [big(1)]: { a: yes }, [big(2)]: { a: { ...yes, proposer: 'Curation' } } }))
  expect(Object.keys((await readVerdicts(root)).personYes!)).toEqual([big(1)])
})

test("a person's yes names people as they are, on a real day; the owner's alone counts; a malformed record stops nothing", async () => {
  const yes = { proposer: 'Photo Sourcing', approvers: ['the chief of staff', 'Curation'], on: '2026-11-19', lookAlike: 'Channa argus', mark: 'the rows of round dark blotches along the flank' }
  const counted = countedYes({
    [big(1)]: { a: yes },
    [big(2)]: { a: { ...yes, proposer: 'Curation ' } }, // the proposer, with a space after
    [big(3)]: { a: { ...yes, proposer: 'curation' } }, // the proposer, in small letters
    [big(4)]: { a: { ...yes, approvers: ['Curation', ' curation'] } }, // one person twice
    [big(5)]: { a: { ...yes, approvers: [' The chief of staff', 'CURATION'] } }, // the two, written loosely: counts
    [big(6)]: { a: { ...yes, approvers: ['the owner'] } }, // the owner alone: counts
    [big(7)]: { a: { ...yes, proposer: 'the owner', approvers: ['The owner'] } }, // the owner may always
    [big(8)]: { a: { ...yes, approvers: ['the owner', 'a reader'] } }, // one who may not say yes, beside the owner
    [big(9)]: { a: { ...yes, on: '2026-02-30' } }, // no such day
    [big(10)]: { a: { ...yes, on: '2026-11-31' } },
    [big(11)]: { a: { ...yes, on: '2026-13-01' } },
    [big(12)]: { a: { ...yes, on: '2026-11-19T00:00' } },
    [big(13)]: { a: null }, // malformed: none of these count, and the rest still do
    [big(14)]: { a: 'yes' },
    [big(15)]: null,
    [big(16)]: ['a'],
    [big(17)]: { a: { ...yes, approvers: 'the chief of staff, Curation' } },
    [big(18)]: { a: { ...yes, approvers: [1, 2] } },
    [big(19)]: { a: { ...yes, proposer: 7 } },
  })
  expect(Object.keys(counted).sort()).toEqual([big(1), big(5), big(6), big(7)].sort())
  for (const bad of [null, [], 'x', 3]) expect(countedYes(bad)).toEqual({})
  // A week crosses a month's end: Monday 30 Nov to Sunday 6 Dec is one week.
  const days = ['2026-11-29', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04', '2026-12-06']
  const turn = Object.fromEntries(days.map((on, i) => [big(40 + i), { a: { ...yes, on } }]))
  expect(Object.keys(countedYes(turn)).sort()).toEqual([0, 1, 2, 3, 4, 5].map(i => big(40 + i)).sort())

  // Read from engine-state: a malformed entry doesn't stop the reader, and a pick on a photo with a yes written for its
  // page lapses unless that yes counts.
  const root = await mkdtemp(join(tmpdir(), 'aq-yes-'))
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, 'engine-state/_photo-person-yes.json'), JSON.stringify({ [big(1)]: { a: yes, b: null }, [big(15)]: null, [big(16)]: ['a'] }))
  const read = await readPersonYes(root)
  expect(Object.keys(read.counted)).toEqual([big(1)])
  const unsure = { [big(1)]: { a: { ok: 'unsure', typical: true, note: '' }, b: { ok: 'unsure', typical: true, note: '' } } } as never
  expect(pickStands('species/a', big(1), unsure, read)).toBe(true)
  expect(pickStands('species/b', big(1), unsure, read)).toBe(false)
  expect(pickStands('species/c', big(16), unsure, read)).toBe(true)
  expect(Object.keys((await readVerdicts(root)).personYes!)).toEqual([big(1)])
  await writeFile(join(root, 'engine-state/_photo-person-yes.json'), '[]')
  expect(await readPersonYes(root)).toEqual({ raw: {}, counted: {} })
  // A key named "__proto__", at either level, is a key like any other: no reader throws, and no object gains a field.
  await writeFile(join(root, 'engine-state/_photo-person-yes.json'), `{"__proto__":{"__proto__":${JSON.stringify({ ...yes, approvers: ['the owner'] })}}}`)
  const odd = await readPersonYes(root)
  expect(Object.keys(odd.counted)).toEqual(['__proto__'])
  expect(Object.keys(odd.counted['__proto__']!)).toEqual(['__proto__'])
  expect(pickStands('species/__proto__', '__proto__', {}, odd)).toBe(false)
  expect(({} as Record<string, unknown>).proposer).toBeUndefined()
  expect(Object.keys((await readVerdicts(root)).personYes!)).toEqual(['__proto__'])
})

test("no engine step writes the person's-yes record: a pull request changes it", () => {
  const dir = new URL('../src/', import.meta.url)
  const files = readdirSync(dir).filter(f => f.endsWith('.ts'))
  const naming = files.filter(f => readFileSync(new URL(f, dir), 'utf8').includes('_photo-person-yes.json'))
  expect(naming).toEqual(['person-yes.ts'])
  expect(readFileSync(new URL('person-yes.ts', dir), 'utf8')).not.toMatch(/writeFile\(|appendFile\(|rename\(/)
})

test("the avoid list's engine entries: each page's held or refused photos up to its first that passes; a person's entries stay; last run's are rebuilt", async () => {
  const { ENGINE_AVOID, headAvoid, withEngineAvoid } = await import('../src/curation')
  const u = (n: number) => `https://media.aquatome.com/commons/${n.toString(16).padStart(16, '0')}.webp`
  const ph = (n: number, o: { large?: number } = {}) => ({
    url: u(n), width: 1600, height: 1200, licence: 'CC BY 4.0', author: 'Sample Shooter', sourceUrl: 'https://example.org/a',
    ...(o.large ? { large: { url: u(o.large), width: 2400, height: 1800 } } : {}),
  })
  const yes = { ok: 'yes', typical: true, note: '' } as const
  const v = {
    subjects: {
      [u(1)]: { a: { ok: 'unsure', typical: false, note: '' } },
      [u(2)]: { a: { ...yes, logo: true } },
      [u(3)]: { a: yes },
      [u(4)]: { a: { ok: 'other', typical: false, note: '' } },
      [u(5)]: { b: { ok: 'dead', typical: false, note: '' } },
      [u(7)]: { b: yes },
      [u(8)]: { c: yes },
      [u(10)]: { c: { ...yes, typical: false } },
      [u(11)]: { c: yes },
    },
    legacy: {}, rejected: {}, faces: {},
  } as Awaited<ReturnType<typeof readVerdicts>>
  const pages = [
    // can't tell, then a mark a person listed, then one that passes: the walk stops there, so the "other" after it isn't listed.
    { id: 'a', photos: [ph(1), ph(2), ph(3), ph(4)] },
    // one no check has judged yet is passed over, not listed; a dead fish is listed with its large copy.
    { id: 'b', photos: [ph(6), ph(5, { large: 9 }), ph(7)] },
    // the second look holds one whatever its verdict; then one that isn't typical; then one that passes.
    { id: 'c', photos: [ph(8), ph(10), ph(11)] },
  ]
  const hand = { [u(2)]: 'a wholesaler banner, listed by a person' }
  const engine = headAvoid(pages, v, hand, url => url === u(8))
  expect(engine).toEqual({
    [u(1)]: `${ENGINE_AVOID}the check can't tell`,
    [u(5)]: `${ENGINE_AVOID}a dead fish`,
    [u(9)]: `${ENGINE_AVOID}a dead fish`,
    [u(8)]: `${ENGINE_AVOID}held for a second look`,
    [u(10)]: `${ENGINE_AVOID}not typical`,
  })
  // Rebuilt: last run's engine entry for a photo that passes now goes; a person's entries stay, first and as they were.
  const avoid = { [u(99)]: `${ENGINE_AVOID}another fish`, [u(2)]: hand[u(2)]!, [u(98)]: 'a ruler in the picture' }
  const next = withEngineAvoid(avoid, engine)
  expect(Object.keys(next)).toEqual([u(2), u(98), ...Object.keys(engine).sort()])
  expect(next[u(2)]).toBe(hand[u(2)])
  expect(u(99) in next).toBe(false)
})

test("a page led by a non-commercial photo: its head is on the engine's avoid list, whatever its verdict, and gives the faces for more than one fish no photo (the chief of staff's rule, 17 Nov)", async () => {
  const { cardPhotos, ENGINE_AVOID, headAvoid, refusedWhy, withEngineAvoid } = await import('../src/curation')
  const u = (n: number) => `https://media.aquatome.com/inaturalist/${n}.webp`
  const nc = { url: u(1), width: 1600, height: 1200, licence: 'CC BY-NC 4.0', author: 'Sample Shooter', sourceUrl: 'https://www.inaturalist.org/photos/1', large: { url: u(2), width: 2400, height: 1800 } }
  const v = { subjects: { [u(1)]: { a: { ok: 'yes', typical: true, note: '' } } }, legacy: {}, rejected: {}, faces: {} } as Awaited<ReturnType<typeof readVerdicts>>
  // The day's card and the hero read the same reason (candidates' headFails).
  expect(refusedWhy(nc, 'a', v, {}, () => false)).toBe('a non-commercial photo')
  const engine = headAvoid([{ id: 'a', photos: [nc] }], v, {}, () => false)
  expect(engine).toEqual({ [u(1)]: `${ENGINE_AVOID}a non-commercial photo`, [u(2)]: `${ENGINE_AVOID}a non-commercial photo` })
  expect(cardPhotos([{ id: 'a', photos: [nc] }], v, {}, () => false, withEngineAvoid({}, engine))).toEqual({})
})

test("a page whose head is on avoid gives the faces for more than one fish its first photo that passes and isn't on avoid; a page whose head passes or isn't judged gives none", async () => {
  const { cardPhotos, headAvoid, withEngineAvoid } = await import('../src/curation')
  const u = (n: number) => `https://media.aquatome.com/commons/${n.toString(16).padStart(16, '0')}.webp`
  const ph = (n: number) => ({ url: u(n), width: 1600, height: 1200, licence: 'CC BY 4.0', author: 'Sample Shooter', sourceUrl: 'https://example.org/a' })
  const yes = { ok: 'yes', typical: true, note: '' } as const
  const v = {
    subjects: {
      [u(1)]: { a: { ok: 'unsure', typical: false, note: '' } }, [u(3)]: { a: yes },
      [u(4)]: { b: yes }, [u(5)]: { b: { ok: 'dead', typical: false, note: '' } },
      [u(7)]: { c: yes },
      [u(8)]: { d: { ok: 'other', typical: false, note: '' } },
      [u(10)]: { e: yes }, [u(11)]: { e: yes },
    },
    legacy: {}, rejected: {}, faces: {},
  } as Awaited<ReturnType<typeof readVerdicts>>
  const pages = [
    // its head the check can't tell; one no check has judged is passed over; the first that passes is the card's.
    { id: 'a', photos: [ph(1), ph(2), ph(3), ph(14)] },
    // its head passes: none (the head is the card's photo), whatever comes after it.
    { id: 'b', photos: [ph(4), ph(5)] },
    // its head not judged yet: none, as the site shows that head.
    { id: 'c', photos: [ph(6), ph(7)] },
    // its head another fish and nothing after it passes: none, and the face moves on.
    { id: 'd', photos: [ph(8), ph(9)] },
    // its head held for a second look, or listed by a person: the next that passes.
    { id: 'e', photos: [ph(12), ph(10)] },
    { id: 'f', photos: [ph(13), ph(11)] },
    // an AI picture first is passed over as the site passes it; a shop's kept-mark photo is never the card's.
    { id: 'g', photos: [{ ...ph(20), generated: { model: 'sample' } as never }, ph(21), ph(22)] },
    { id: 'k', photos: [ph(23), ph(24), ph(25)] },
    // a photo that passes here but another page refuses is on avoid by its address: the next that passes.
    { id: 'h', photos: [ph(30), ph(31), ph(32)] },
    { id: 'i', photos: [ph(31)] },
    // a head a person listed by its large copy, the address a card loads: the next that passes.
    { id: 'j', photos: [{ ...ph(33), large: { url: u(133), width: 2400, height: 1800 } }, ph(34)] },
  ]
  const dead = { ok: 'dead', typical: false, note: '' } as const
  const v2 = {
    ...v,
    subjects: {
      ...v.subjects, [u(11)]: { f: yes }, [u(12)]: { e: yes }, [u(13)]: { f: yes }, [u(14)]: { a: yes },
      [u(21)]: { g: dead }, [u(22)]: { g: yes }, [u(23)]: { k: yes }, [u(24)]: { k: yes }, [u(25)]: { k: yes },
      [u(30)]: { h: dead }, [u(31)]: { h: yes, i: { ok: 'other', typical: false, note: '' } }, [u(32)]: { h: yes },
      [u(33)]: { j: yes }, [u(34)]: { j: yes },
    },
    kept: (url: string) => url === u(23) || url === u(24),
  } as Awaited<ReturnType<typeof readVerdicts>>
  const hand = { [u(13)]: 'a ruler in the picture', [u(133)]: 'a ruler in the picture' }
  const held = (url: string) => url === u(12)
  // The list as the run writes it: a person's entries and every page's refused photos.
  const avoid = withEngineAvoid(hand, headAvoid(pages, v2, hand, held))
  expect(u(31) in avoid).toBe(true)
  const card = cardPhotos(pages, v2, hand, held, avoid)
  expect(card).toEqual({ a: u(3), e: u(10), f: u(11), g: u(22), k: u(25), h: u(32), j: u(34) })
  // None of them is on the list, by either address.
  const all: { url: string; large?: { url: string } }[] = pages.flatMap(p => p.photos)
  for (const url of Object.values(card)) for (const x of [url, all.find(p => p.url === url)?.large?.url]) if (x) expect(x in avoid).toBe(false)
  // The planner carries the map, and the calendar's schema keeps it on the way back in (the site reads the file).
  const cur = CurationSchema.parse({ version: 1, weeks: [], days: [] })
  const { calendar } = plan({ ...cur, cardPhoto: { a: u(3) } }, [], '2026-11-17', 0)
  expect(CurationSchema.parse(JSON.parse(JSON.stringify(calendar))).cardPhoto).toEqual({ a: u(3) })
})

test("a week's top card whose page's head a check refused or the second look holds goes out, and a fish that passes takes its place", () => {
  const old = 'https://media.aquatome.com/commons/5555555555555555.webp'
  const cands = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => fish(id))
  // Its head no longer passes: no head, and why. Before, the card kept its old picture.
  const failed = fish('failed', { head: undefined, headFails: "the check can't tell" })
  // Its head passes the card rule but the second look holds it: first in line by its address, and never taken, neither
  // in a refused card's place nor to make five, nor as a day's fish.
  const held = fish('aa-held', { headFails: 'held for a second look' })
  expect(held.head).toBeDefined()
  expect(problemOf(held)).toBe('head photo: held for a second look')
  const cur = heroWeek([{ page: 'species/failed', img: old }, { page: 'species/a' }])
  const { calendar, report } = plan(cur, [failed, held, ...cands], '2026-11-09', 0)
  const hero = calendar.weeks[0]!.hero
  expect(hero.map(h => h.page)).not.toContain('species/failed')
  expect(hero.map(h => h.page)).not.toContain('species/aa-held')
  expect(hero.some(h => h.img === old)).toBe(false)
  expect(report.heroes).toContain("2026-11-09 species/failed out (head photo: the check can't tell), species/b in")
})

test('held for a second look: a photo waiting for an answer, or agreed and not yet on the never-again list; one a person cleared is not', () => {
  const u = (n: number) => `https://media.aquatome.com/commons/${n.toString(16).padStart(16, '0')}.webp`
  const at = '2026-11-16'
  const entry = { why: 'its page would be left with nothing', step: 'the photo check', pages: ['sample-fish'], at }
  const held = heldBy({
    [u(1)]: entry,
    [u(2)]: { ...entry, look: { said: 'agree', by: 'Sample Keeper', on: at } },
    [u(3)]: { ...entry, look: { said: 'clear', by: 'Sample Keeper', on: at } },
  })
  expect([u(1), u(2), u(3), u(4)].map(held)).toEqual([true, true, false, false])
})
