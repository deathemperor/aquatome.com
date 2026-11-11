import { expect, test } from 'vitest'
import { fitKey } from '../src/fit'
import { frontEarly, frontHeld, orderFront } from '../src/fit-front'
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

test('a run is not held when nothing has been tried', () => {
  expect(frontHeld(front, {})).toBe(false)
})

test('a run is not held when the only try is older than first', () => {
  expect(frontHeld(front, { 'vi/species/a': { at: '2026-11-08T10:00:00.000Z' } })).toBe(false)
  expect(frontHeld(front, { 'vi/species/a': { at: '2026-11-13T07:59:59+07:00' } })).toBe(false)
})

test('a run is held when a try is at or after first and the list is not cleared', () => {
  expect(frontHeld(front, { 'vi/species/a': { at: '2026-11-13T08:00:00+07:00' } })).toBe(true)
  expect(frontHeld(front, { 'vi/species/old': { at: '2026-11-08T10:00:00.000Z' }, 'vi/species/new': { at: '2026-11-13T09:00:00+07:00' } })).toBe(true)
})

test('a cleared list is not held', () => {
  expect(frontHeld({ ...front, cleared: true }, { 'vi/species/a': { at: '2026-11-14T00:00:00.000Z' } })).toBe(false)
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
