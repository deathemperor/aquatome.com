import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { writeSnapshot } from '../src/snapshot'
import { attemptsAfter, errorKind, loadState, needsFetch, retryFirst, saveState, setSourceBlock, sourceBlockedSince, type UrlState } from '../src/state'

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
  // errors back off (6 h × attempts), give up after 3, and a newer lastmod always resets
  expect(needsFetch({ ...base, status: 'error', attempts: 1, updatedAt: '2026-10-27T22:00:00Z' }, '2026-10-01', now)).toBe(false)
  expect(needsFetch({ ...base, status: 'error', attempts: 1, updatedAt: '2026-10-27T17:00:00Z' }, '2026-10-01', now)).toBe(true)
  expect(needsFetch({ ...base, status: 'error', attempts: 3 }, '2026-10-01', now)).toBe(false)
  expect(needsFetch({ ...base, status: 'error', attempts: 3 }, '2026-10-02', now)).toBe(true)
})
// The failures Seriously Fish's state held on 2026-10-31: 115 pages from one browser crash, 9 from Claude's usage limit.
const CRASH = 'page.goto: Target page, context or browser has been closed'
const LIMIT = "claude failed (1): You've hit your 5-hour limit · resets 12:10pm (UTC)"

test('failures are told apart by their error: usage limit, transient, the page itself', () => {
  expect(errorKind(LIMIT)).toBe('usage')
  for (const e of [CRASH, 'fetch failed', 'net::ERR_CONNECTION_RESET', 'page.goto: Timeout 45000ms exceeded.', 'HTTP 503']) expect(errorKind(e)).toBe('transient')
  for (const e of ['HTTP 404', 'claude failed (1): no JSON in the reply', 'R2 upload 403', 'R2 upload: rate limit reached', undefined]) expect(errorKind(e)).toBe('other')
})
test('a usage limit uses no attempt; any other failure uses one', () => {
  const failed = { ...base, status: 'error' as const, attempts: 2 }
  expect(attemptsAfter(failed, LIMIT)).toBe(2)
  expect(attemptsAfter(undefined, LIMIT)).toBe(0)
  expect(attemptsAfter(failed, CRASH)).toBe(3)
  expect(attemptsAfter(base, 'HTTP 404')).toBe(1) // a processed page's attempts don't carry over
})
test('transient failures run again at the next run (no backoff), usage limits always; both go first', () => {
  const justNow = '2026-10-27T23:00:00Z'
  const crashed = { ...base, lastmod: undefined, status: 'error' as const, attempts: 1, error: CRASH, updatedAt: justNow }
  expect(needsFetch(crashed, undefined, now)).toBe(true)
  expect(needsFetch({ ...crashed, attempts: 3 }, undefined, now)).toBe(false)
  const limited = { ...crashed, error: LIMIT, attempts: 3 } // spent under the old rule
  expect(needsFetch(limited, undefined, now)).toBe(true)
  expect(needsFetch({ ...crashed, error: 'HTTP 404' }, undefined, now)).toBe(false) // the page's own fault keeps its backoff
  expect([crashed, limited].every(retryFirst)).toBe(true)
  expect(retryFirst({ ...crashed, error: 'HTTP 404' })).toBe(false)
  expect(retryFirst(undefined)).toBe(false)
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

test('source blocks are remembered for a day', async () => {
  const root = mkdtempSync(join(tmpdir(), 'st-'))
  expect(await sourceBlockedSince(root, 'planetcatfish')).toBeUndefined()
  await setSourceBlock(root, 'planetcatfish', '2026-10-28T00:00:00Z')
  expect(await sourceBlockedSince(root, 'planetcatfish')).toBe('2026-10-28T00:00:00Z')
  await setSourceBlock(root, 'planetcatfish', undefined)
  expect(await sourceBlockedSince(root, 'planetcatfish')).toBeUndefined()
})
