import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { writeSnapshot } from '../src/snapshot'
import { loadState, needsFetch, saveState, type UrlState } from '../src/state'

const now = new Date('2026-10-28T00:00:00Z')
const base: UrlState = { status: 'processed', entityIds: [], attempts: 1, updatedAt: '2026-10-20T00:00:00Z', lastmod: '2026-10-01' }

test('needsFetch truth table', () => {
  expect(needsFetch(undefined, undefined, now)).toBe(true)
  expect(needsFetch(base, '2026-10-01', now)).toBe(false)
  expect(needsFetch(base, '2026-10-05', now)).toBe(true)
  expect(needsFetch({ ...base, lastmod: undefined }, undefined, now)).toBe(false)
  expect(needsFetch({ ...base, lastmod: undefined, updatedAt: '2026-09-01T00:00:00Z' }, undefined, now)).toBe(true)
  expect(needsFetch({ ...base, status: 'blocked', updatedAt: '2026-10-25T00:00:00Z' }, '2026-10-27', now)).toBe(false)
  expect(needsFetch({ ...base, status: 'blocked', updatedAt: '2026-10-10T00:00:00Z' }, undefined, now)).toBe(true)
  expect(needsFetch({ ...base, status: 'error', attempts: 1 }, '2026-10-01', now)).toBe(true)
  expect(needsFetch({ ...base, status: 'error', attempts: 3 }, '2026-10-01', now)).toBe(false)
})
test('state round-trips with stable, sorted output', async () => {
  const root = mkdtempSync(join(tmpdir(), 'aq-state-'))
  await saveState(root, 'seriouslyfish', { 'https://b': base, 'https://a': { ...base, entityIds: ['x'] } })
  const raw = readFileSync(join(root, 'engine-state', 'seriouslyfish.json'), 'utf8')
  expect(raw.indexOf('https://a')).toBeLessThan(raw.indexOf('https://b'))
  const back = await loadState(root, 'seriouslyfish')
  await saveState(root, 'seriouslyfish', back)
  expect(readFileSync(join(root, 'engine-state', 'seriouslyfish.json'), 'utf8')).toBe(raw)
  expect(await loadState(root, 'glaser')).toEqual({})
})
test('snapshot hash ignores fetch time', async () => {
  const root = mkdtempSync(join(tmpdir(), 'aq-snap-'))
  const a = await writeSnapshot(root, 'seriouslyfish', 'https://www.seriouslyfish.com/species/paracheirodon-axelrodi', { title: 'T', outline: 'body' }, new Date('2026-10-01'))
  const b = await writeSnapshot(root, 'seriouslyfish', 'https://www.seriouslyfish.com/species/paracheirodon-axelrodi', { title: 'T', outline: 'body' }, new Date('2026-10-02'))
  expect(a.hash).toBe(b.hash)
  expect(a.path).toBe(join(root, 'sources', 'seriouslyfish', 'species-paracheirodon-axelrodi.md'))
  expect(readFileSync(a.path, 'utf8')).toMatch(/^url: https:\/\/www\.seriouslyfish\.com\/species\/paracheirodon-axelrodi\n/m)
})
