import { expect, test } from 'vitest'
import { strictLoadedContentEqual } from './helpers/glossary-content-equality'

test('strict loaded-content comparison retains undefined keys, Maps and Sets instead of hashing JSON', () => {
  const base = { photoWaits: undefined, data: { optional: undefined, map: new Map([['a', 1]]), set: new Set([1]) } }
  expect(strictLoadedContentEqual(base, { ...base, data: { ...base.data, map: new Map([['a', 1]]), set: new Set([1]) } }, [])).toBe(true)
  for (const data of [{ map: base.data.map, set: base.data.set }, { ...base.data, map: new Map([['a', 2]]) }, { ...base.data, set: new Set([2]) }]) {
    expect(strictLoadedContentEqual(base, { ...base, data }, [])).toBe(false)
  }
  expect(strictLoadedContentEqual(base, { data: base.data }, [])).toBe(false)
})

test('callback identity is not data equality: independently allocated callbacks must agree at every address', () => {
  const before = { photoWaits: (url: string) => url.endsWith('held.webp'), data: new Set([1]) }
  expect(strictLoadedContentEqual(before, { ...before, photoWaits: (url: string) => url.endsWith('held.webp') }, ['held.webp', 'clean.webp'])).toBe(true)
  expect(strictLoadedContentEqual(before, { ...before, photoWaits: () => false }, ['clean.webp', 'held.webp'])).toBe(false)
  expect(strictLoadedContentEqual(before, { ...before, photoWaits: undefined }, ['held.webp'])).toBe(false)
})
