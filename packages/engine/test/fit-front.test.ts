import { expect, test } from 'vitest'
import { fitKey } from '../src/fit'
import { firstRun, frontEarly, frontHeld, orderFront } from '../src/fit-front'
import list from '../src/fit-front.json'
import type { Page } from '../src/pages'

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

const front = { cleared: false, first: '2026-11-13T08:00:00+07:00', front: [] as string[] }

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
  expect(frontHeld({ ...front, cleared: true }, ran)).toBe(false)
})

test('the front list file parses and names each page once', () => {
  expect(typeof list.cleared).toBe('boolean')
  expect(Number.isNaN(Date.parse(list.first))).toBe(false)
  expect(list.front.every(k => /^vi\/(species|plants|guides)\/[^/]+$/.test(k))).toBe(true)
  expect(new Set(list.front).size).toBe(list.front.length)
  expect(list.about).toMatch(/cleared/)
  expect(list.about).toMatch(/first/)
  expect(list.about).toMatch(/front/)
})
