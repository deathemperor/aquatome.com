import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { fitKey } from '../src/fit'
import { firstRun, frontEarly, frontHeld, frontPlan, laneFirst, offLane, orderFront, type HeldMark } from '../src/fit-front'
import list from '../src/fit-front.json'
import type { Page } from '../src/pages'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const page = (kind: Page['kind'], id: string) => ({ lang: 'vi' as const, kind, id })
const key = (p: { lang: Page['lang']; kind: Page['kind']; id: string }) => fitKey(p as Page)

test('front-list pages come first, in the list\'s order, then the rest in the order given; a missing key is dropped and no page is repeated', () => {
  const a = page('species', 'a')
  const b = page('plants', 'b')
  const g = page('guides', 'g')
  const c = page('breeds', 'c')
  const front = [key(a), 'vi/species/missing', key(b), key(a)]
  const pages = [g, a, b, a, c]
  expect(orderFront({ front }, pages).map(key)).toEqual([key(a), key(b), key(g), key(c)])
})

const front = { cleared: false as boolean | string, lane: false, first: '2026-11-13T08:00:00+07:00', front: [] as string[] }

test('nothing on the front list runs before first, or with a first that is no date', () => {
  expect(frontEarly(front, new Date('2026-11-13T07:59:59+07:00'))).toBe(true)
  expect(frontEarly(front, new Date('2026-11-13T08:00:00+07:00'))).toBe(false)
  expect(frontEarly({ first: 'soon' }, new Date('2026-11-14T00:00:00Z'))).toBe(true)
})

const none = { rewritten: [], notKept: [], skipped: [], failed: [], stopped: '' }

test('a run that got no page to an outcome is not the first run: a limit before its first page leaves the next cycle free', () => {
  expect(firstRun(none, '2026-11-13T02:00:00.000Z')).toBeUndefined()
  expect(firstRun({ ...none, stopped: 'vi/species/a: claude failed: the engine\'s daily limit reached for fit-rewrite' }, '2026-11-13T02:00:00.000Z')).toBeUndefined()
  expect(frontHeld(front, undefined)).toBe(false)
})

test('the first run is kept as its command printed it, and holds the next until the list is cleared', () => {
  const ran = firstRun({ ...none, rewritten: ['vi/species/a sections.care (0.86)'], notKept: ['vi/species/b body (0.61: thin)'], stopped: 'vi/species/c: claude failed: usage limit' }, '2026-11-13T02:00:00.000Z')
  expect(ran).toEqual({ at: '2026-11-13T02:00:00.000Z', rewritten: ['vi/species/a sections.care (0.86)'], notKept: ['vi/species/b body (0.61: thin)'], skipped: [], failed: [], stopped: 'vi/species/c: claude failed: usage limit' })
  expect(frontHeld(front, ran)).toBe(true)
  // Nothing kept is still a first run to look at.
  expect(frontHeld(front, firstRun({ ...none, skipped: ['vi/species/a body: the rewrite changed nothing'] }, '2026-11-13T02:00:00.000Z'))).toBe(true)
  // One-shot (the chief of staff, 14 Nov 2026): cleared names the run on file; the run that goes writes its own, and the
  // one after is held again by itself. A true set by hand no longer lets every run through.
  expect(frontHeld({ ...front, cleared: ran!.at }, ran)).toBe(false)
  const next = firstRun({ ...none, rewritten: ['vi/species/d body (0.9)'] }, '2026-11-14T05:00:00.000Z')
  expect(frontHeld({ ...front, cleared: ran!.at }, next)).toBe(true)
  expect(frontHeld({ ...front, cleared: true }, ran)).toBe(true)
})

const mark = (at: string, checks = ['source']): HeldMark => ({ checks, at })

test('the lane: pages the gate held new go first, newest first, whatever the hold; a video guide, a gallery post, or one held for harm, a kit or a dose, stays out', () => {
  const a = page('species', 'a'), b = page('guides', 'b'), c = page('plants', 'c'), v = page('guides', 'youtube-x'), h = page('guides', 'h'), live = page('species', 'live')
  const g = page('guides', '2hraquarist-blogs-aquascaping-ideas-herry-rasio-4')
  const held = new Map([[key(a), mark('2026-11-13')], [key(b), mark('2026-11-14')], [key(c), mark('2026-11-14')], [key(v), mark('2026-11-14')], [key(h), mark('2026-11-14', ['harm'])], [key(g), mark('2026-11-14')]])
  expect(laneFirst([live, a, b, v, c, h, g], held).map(key)).toEqual([key(b), key(c), key(a)])
  const ran = firstRun({ ...none, rewritten: ['vi/species/live body (0.9)'] }, '2026-11-13T02:00:00.000Z')!
  const list = { ...front, lane: true, front: [key(live)] }
  // Held: the front list's pages alone wait; the lane, then every other page.
  const shut = frontPlan(list, ran, [live, a, b, v, c, h], held)
  expect(shut.held).toBe(true)
  expect(shut.order.map(key)).toEqual([key(b), key(c), key(a), key(v), key(h)])
  // Cleared: the lane, then the front list, then the rest, each page once.
  const open = frontPlan({ ...list, cleared: ran.at }, ran, [live, a, b, v, c, h], held)
  expect(open.order.map(key)).toEqual([key(b), key(c), key(a), key(live), key(v), key(h)])
  // The lane shut: the hold as before.
  expect(frontPlan({ ...list, lane: false }, ran, [live, a, b], held).order).toEqual([])
  // What goes on file is the run's front-list and live outcomes, never the lane's alone.
  const out = { rewritten: ['vi/guides/b (0.9)', 'vi/species/live body (0.88)'], notKept: ['vi/species/a sections.care (0.6: thin)'], skipped: ['vi/plants/c: a person fixed its text'], failed: [] }
  expect(offLane(out, open.lane)).toEqual({ rewritten: ['vi/species/live body (0.88)'], notKept: [], skipped: [], failed: [] })
  expect(firstRun(offLane({ ...out, rewritten: ['vi/guides/b (0.9)'] }, open.lane), '2026-11-14T05:00:00.000Z')).toBeUndefined()
})

test('the front list file parses and names each page once', () => {
  // False, or the at of the run on file the chief of staff has read (one-shot).
  expect(list.cleared === false || !Number.isNaN(Date.parse(String(list.cleared)))).toBe(true)
  expect(typeof list.lane).toBe('boolean')
  expect(list.about).toMatch(/lane/)
  expect(Number.isNaN(Date.parse(list.first))).toBe(false)
  expect(list.front.every(k => /^vi\/(species|plants|guides|breeds)\/[^/]+$/.test(k))).toBe(true)
  expect(new Set(list.front).size).toBe(list.front.length)
  expect(list.about).toMatch(/cleared/)
  expect(list.about).toMatch(/first/)
  expect(list.about).toMatch(/front/)
})

test('the four Tết breed pages come last, after the 24 the first run was ruled on', () => {
  // The chief of staff, 2026-11-12: Hôm nay's red and gold fish before Tết (cards by 18 Jan) need these passing by
  // 11 Jan, so they go at the end of the list, leaving the first run's pages as they were.
  expect(list.front).toHaveLength(32)
  expect(list.front.slice(0, 24).every(k => !k.startsWith('vi/breeds/'))).toBe(true)
  expect(list.front.slice(24, 28)).toEqual(['vi/breeds/koi', 'vi/breeds/ranchu-goldfish', 'vi/breeds/ryukin-goldfish', 'vi/breeds/butterfly-koi'])
})

test("the Khám phá shelves' four guides come after them: three for keeping the tank warm, and feeding over Tết", () => {
  // The Curation Lead and the chief of staff, 2026-11-13: guides for the 21–27 Dec winter shelf and the Tết shelf
  // (25 Jan–7 Feb) that fail reader fit for real. The seasons guide's winter night in a cold room was the check's
  // mistake, mended first (fit.ts, CLIMATE_NOTE); its gallon rule and unnamed shop are real.
  expect(list.front.slice(28)).toEqual([
    'vi/guides/seriouslyfish-articles-heating-the-aquarium',
    'vi/guides/aquariumcoop-blogs-aquarium-how-to-choose-the-right-aquarium-heater',
    'vi/guides/aquatome-cham-soc-ca-canh-mua-he-va-mua-dong-mua-mua',
    'vi/guides/aquatome-cho-ca-an-khi-vang-nha-di-xa-va-dip-tet',
  ])
  for (const k of list.front.slice(28)) expect(existsSync(join(ROOT, 'content/guides', k.split('/')[2]!, 'vi.json')), k).toBe(true)
})
