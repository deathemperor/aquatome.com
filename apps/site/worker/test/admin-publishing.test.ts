import { expect, test } from 'vitest'
import type { ContentStats, Totals } from '../admin/content'
import { PUBLISHING_DAYS, publishingOf } from '../admin/publishing'

// The nightly saves (kept at 20:17 UTC under that UTC day) and this build's totals, Vietnamese, for the four kinds.
const T = (fish: number, guide: number, videoGuide: number, plant: number): Totals => ({
  kinds: Object.fromEntries(Object.entries({ fish, guide, videoGuide, plant }).map(([k, vi]) => [k, { vi, id: 0, th: 0, ms: 0 }])) as Totals['kinds'],
  built: null, sources: {}, photos: { pages: 0, gallery: 0 },
})
// Work waiting: a fish source with 30 pages waiting, a plant source with none, 12 videos in the queue.
const stats = (totals: Totals, o: { builtAt?: string; fishWaiting?: number; videos?: number } = {}) => ({
  builtAt: o.builtAt ?? '2026-11-14T03:30:00Z', totals,
  sources: { seriouslyfish: { name: 'Seriously Fish', fish: 1700, plant: 0, guide: 0 }, tropica: { name: 'Tropica', fish: 0, plant: 150, guide: 0 } },
  engine: {
    sources: [{ id: 'seriouslyfish', name: 'Seriously Fish', waiting: o.fishWaiting ?? 30 }, { id: 'tropica', name: 'Tropica', waiting: 0 }],
    videos: { waiting: o.videos ?? 12 },
  },
}) as unknown as ContentStats
const TZ = 'Asia/Ho_Chi_Minh'
const NOW = new Date('2026-11-14T04:00:00Z') // Sat 14 Nov, 11:00 in Vietnam: before tonight's save, so the open day is 14 Nov

test('each kind: the night\'s count less the night before, today so far from the build, a night not saved is null, a loss no bar', () => {
  const snaps = [
    { day: '2026-11-10', totals: T(2374, 552, 774, 183) },
    { day: '2026-11-11', totals: T(2435, 578, 848, 184) },
    // 12 Nov: no save.
    { day: '2026-11-13', totals: T(2433, 579, 863, 184) },
  ]
  const p = publishingOf(NOW, TZ, stats(T(2503, 628, 882, 184)), snaps)!
  expect(p.kinds.map(k => [k.key, k.label, k.total])).toEqual([['fish', 'Species pages', '2,503'], ['guide', 'Guides', '628'], ['videoGuide', 'Video guides', '882'], ['plant', 'Plant pages', '184']])
  const fish = p.kinds[0]!.bars
  expect(fish.days).toHaveLength(PUBLISHING_DAYS)
  expect(fish.days.slice(-4)).toEqual(['2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14'])
  expect(fish.today).toBe(PUBLISHING_DAYS - 1)
  // 11 Nov +61; 12 Nov not saved; 13 Nov −2 (since the 11th's save), drawn as none; today +70 so far.
  expect(fish.values.slice(-4)).toEqual([61, null, 0, 70])
  expect(fish.readouts.slice(-4)).toEqual([
    { title: '+61 species pages', detail: 'Wed 11 Nov' }, { title: 'Not counted', detail: 'Thu 12 Nov · no count was kept that night' },
    { title: '2 fewer', detail: 'Fri 13 Nov' }, { title: '+70 species pages', detail: 'Sat 14 Nov so far' },
  ])
  expect(p.kinds[3]!.bars.readouts.at(-1)).toEqual({ title: 'None added', detail: 'Sat 14 Nov so far' })
  expect(p.missing).toBe('No count was kept that night.')
  // Days before the first save have no count either; the first save's day was counted, with none before it to compare.
  expect(fish.values[0]).toBeNull()
  expect(fish.readouts[fish.days.indexOf('2026-11-10')]).toEqual({ title: 'Not counted', detail: 'Tue 10 Nov · the first count, with none before it' })
  expect(fish.readouts[fish.days.indexOf('2026-11-09')]).toEqual({ title: 'Not counted', detail: 'Mon 9 Nov · no count was kept that night' })
  expect(p).not.toHaveProperty('quiet')
})

test('a save every night from the first day shown: only that first day has no bar, and nothing says a night went uncounted', () => {
  const first = Date.parse('2026-10-18T00:00:00Z')
  const snaps = Array.from({ length: PUBLISHING_DAYS - 1 }, (_, i) => ({ day: new Date(first + i * 86_400_000).toISOString().slice(0, 10), totals: T(2000 + i, 500, 800, 180) }))
  const p = publishingOf(NOW, TZ, stats(T(2030, 500, 800, 180)), snaps)!
  const fish = p.kinds[0]!.bars
  expect(fish.days[0]).toBe('2026-10-18')
  expect(fish.values.map(v => v === null)).toEqual([true, ...Array(PUBLISHING_DAYS - 1).fill(false)])
  expect(fish.readouts[0]).toEqual({ title: 'Not counted', detail: 'Sun 18 Oct · the first count, with none before it' })
  expect(p).not.toHaveProperty('missing')
})

test('a kind that added nothing for 24 hours while it has work waiting has stalled, since it last grew; one with nothing waiting or no reading hasn\'t', () => {
  const snaps = [{ day: '2026-11-11', totals: T(2400, 570, 840, 184) }, { day: '2026-11-12', totals: T(2435, 578, 848, 184) }, { day: '2026-11-13', totals: T(2435, 579, 863, 184) }]
  const p = publishingOf(NOW, TZ, stats(T(2435, 590, 870, 184)), snaps)!
  // Fish last grew at the 12 Nov save (03:17 on the 13th in Vietnam), 31 hours ago, with 30 pages waiting.
  expect(p.kinds[0]!.stalled).toEqual({ since: '2026-11-12T20:17:00.000Z', text: 'No new species pages since Fri 13 Nov, 3:17' })
  // Plants are flat too, but their source has nothing waiting; guides and video guides grew in this build.
  expect(p.kinds.slice(1).map(k => k.stalled)).toEqual([undefined, undefined, undefined])
  // Nothing waiting for fish: not stalled. Under 24 hours since it grew: not stalled.
  expect(publishingOf(NOW, TZ, stats(T(2435, 590, 870, 184), { fishWaiting: 0 }), snaps)!.kinds[0]).not.toHaveProperty('stalled')
  expect(publishingOf(new Date('2026-11-13T19:00:00Z'), TZ, stats(T(2435, 590, 870, 184)), snaps.slice(0, 2))!.kinds[0]).not.toHaveProperty('stalled')
})

test('every kind still for 24 hours is the engine: one line, since the newest growth, and no kind stalled on its own', () => {
  // Design, 14 Nov: on Thu 12 every kind added 0.
  const snaps = [{ day: '2026-11-10', totals: T(2374, 552, 774, 183) }, { day: '2026-11-11', totals: T(2435, 578, 848, 184) }, { day: '2026-11-12', totals: T(2435, 578, 848, 184) }]
  const p = publishingOf(new Date('2026-11-13T12:00:00Z'), TZ, stats(T(2435, 578, 848, 184), { builtAt: '2026-11-13T09:00:00Z' }), snaps)!
  expect(p.quiet).toEqual({ since: '2026-11-11T20:17:00.000Z', text: 'Nothing new since Thu 12 Nov, 3:17' })
  expect(p.kinds.every(k => !('stalled' in k))).toBe(true)
  // Nothing saved yet: no part.
  expect(publishingOf(NOW, TZ, stats(T(1, 1, 1, 1)), [])).toBeUndefined()
})
