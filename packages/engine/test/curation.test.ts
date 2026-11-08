import { readFileSync } from 'node:fs'
import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { CurationSchema, type Curation } from '@aq/schema'
import { across, candidates, cardWorthy, checkCalendar, LARGE_PX, plan, problem, TAGS, type Candidate } from '../src/curation'

const big = (n: number) => `https://media.aquatome.com/commons/${n.toString(16).padStart(16, '0')}.webp`
const fish = (id: string, o: Partial<Candidate> & { px?: number } = {}): Candidate => {
  const url = big(id.length * 7919)
  const px = o.px ?? 1200
  return {
    kind: 'species', id, ref: `species/${id}`, path: `/vi/ca/${id}/`, name: id, fit: true, indexable: true, demand: 0,
    facts: { places: [], coldwater: false }, photo: { square: { url, px }, wide: { url, px } }, checked: { [url]: { square: px, wide: px } }, ...o,
  }
}
const guide = (id: string, o: Partial<Candidate> = {}): Candidate => ({ ...fish(id, { px: 600 }), kind: 'guides', ref: `guides/${id}`, path: `/vi/huong-dan/${id}/`, ...o })
const empty: Curation = CurationSchema.parse({ version: 1, weeks: [], days: [] })

test('a photo fills a card by its pixels across once cropped to the card\'s shape', () => {
  expect(across({ width: 1200, height: 800 }, 'square')).toBe(762)
  expect(across({ width: 1200, height: 800 }, 'wide')).toBe(1200)
  expect(across({ width: 1200, height: 1280 }, 'square')).toBe(1200)
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
  expect(cardWorthy(big(1), 'a', v, {})).toBe(true)
  expect(cardWorthy(big(1), 'a', v, { [big(1)]: 'a sick fish' })).toBe(false)
  expect(cardWorthy(big(2), 'a', v, {})).toBe(false)
  expect(cardWorthy(big(3), 'a', v, {})).toBe(false)
  expect(cardWorthy(big(4), 'b', v, {}, true)).toBe(false)
  // A guide's photo with no verdict has passed the face and watermark checks only: allowed, a person looks at it.
  expect(cardWorthy(big(5), 'g', v, {}, true)).toBe(true)
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
  expect(checkCalendar(calendar, cands, '2026-11-09', 3)).toEqual([])
  // Three fish with a big enough photo and three guides can't fill five days without one coming back: the last two
  // are left for the app's rotation.
  const more = plan(empty, cands, '2026-11-09', 5)
  expect(more.report.empty).toEqual(['2026-11-12 fish', '2026-11-12 guide', '2026-11-13 fish', '2026-11-13 guide'])
  expect(new Set(more.calendar.days.map(d => d.fish).filter(Boolean)).size).toBe(more.calendar.days.filter(d => d.fish).length)
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
  expect(calendar.days.map(d => d.fish)).toEqual(['species/listed', 'species/a', undefined])
  expect(report.empty).toContain('2026-11-18 fish')
  // A pick already in the calendar that the week's tags no longer take is replaced, unless a person chose it.
  const big30 = cands[1]!
  const was = CurationSchema.parse({ ...cur, days: [{ date: '2026-11-16', fish: big30.ref, img: big30.photo.square!.url }] })
  expect(plan(was, cands, '2026-11-16', 1).report.replaced).toEqual([{ date: '2026-11-16', slot: 'fish', was: 'species/big', why: "doesn't match this week's tags (nano)" }])
  const chosen = CurationSchema.parse({ ...cur, days: [{ date: '2026-11-16', fish: big30.ref, img: big30.photo.square!.url, fixed: true }] })
  expect(plan(chosen, cands, '2026-11-16', 1).calendar.days[0]!.fish).toBe('species/big')
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
