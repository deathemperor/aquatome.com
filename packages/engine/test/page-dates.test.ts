import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { expect, test } from 'vitest'
import { isPageFile, updatePageDates, visibleHash } from '../src/page-dates'

const content = async (files: Record<string, unknown>) => {
  const dir = await mkdtemp(join(tmpdir(), 'page-dates-'))
  await put(dir, files)
  return dir
}
const put = async (dir: string, files: Record<string, unknown>) => {
  for (const [f, v] of Object.entries(files)) {
    await mkdir(dirname(join(dir, f)), { recursive: true })
    await writeFile(join(dir, f), JSON.stringify(v))
  }
}
const ledger = async (dir: string) => JSON.parse(await readFile(join(dir, 'page-dates.json'), 'utf8')) as Record<string, string>
const dayOf = (l: Record<string, string>, f: string) => l[f]?.slice(0, 10)

const VI = { slug: 'x', name: 'Cá X', sections: { care: '<p>a</p>' }, quality: { score: 0.8, indexable: true } }

test('a page\'s file is dated the day it is first seen, and keeps that date while what a reader sees stands', async () => {
  const dir = await content({ 'species/x/vi.json': VI })
  await updatePageDates(dir, '2026-11-01')
  await put(dir, { 'species/x/vi.json': { ...VI, quality: { score: 0.9, indexable: false }, nameFixed: true, redirectFrom: ['y'] } })
  await updatePageDates(dir, '2026-11-05')
  expect(dayOf(await ledger(dir), 'species/x/vi.json')).toBe('2026-11-01')
})

test('a change a reader sees moves the date to that day', async () => {
  const dir = await content({ 'species/x/vi.json': VI })
  await updatePageDates(dir, '2026-11-01')
  await put(dir, { 'species/x/vi.json': { ...VI, sections: { care: '<p>b</p>' } } })
  await updatePageDates(dir, '2026-11-05')
  expect(dayOf(await ledger(dir), 'species/x/vi.json')).toBe('2026-11-05')
})

test('the same fields written in another order are the same page; photos in another order are not', () => {
  expect(visibleHash({ a: 1, b: { c: 2, d: 3 } })).toBe(visibleHash({ b: { d: 3, c: 2 }, a: 1 }))
  expect(visibleHash({ photos: ['a', 'b'] })).not.toBe(visibleHash({ photos: ['b', 'a'] }))
})

// The list is every field a reader never sees, as content had them on 2026-11-10. A new field named one of these would
// stop moving the date without a word, so a change to this list is a decision.
test('the bookkeeping left out of a page\'s date, at any depth', () => {
  const page = { name: 'x', prices: [{ vnd: 1 }], sources: [{ url: 'u' }], range: { records: [{ place: 'p' }] } }
  const stamped = {
    ...page, updatedAt: 't', quality: { score: 1 }, held: { checks: [], at: 'd' }, nameFixed: true, bodyFixed: true, redirectFrom: ['y'],
    generatedAt: 't', builtAt: 't', seen: ['u'], speciesUpdatedAt: 't',
    prices: [{ vnd: 1, at: 'd' }], sources: [{ url: 'u', at: 'd' }], range: { records: [{ place: 'p', fetched: 'd' }] },
  }
  expect(visibleHash(stamped)).toBe(visibleHash(page))
  expect(visibleHash({ ...page, prices: [{ vnd: 2, at: 'd' }] })).not.toBe(visibleHash(page))
  // A summary reaches the page when it is approved: that's a change a reader sees.
  expect(visibleHash({ summary: 's', review: 'approved' })).not.toBe(visibleHash({ summary: 's', review: 'draft' }))
})

test('a file gone from content leaves the record; keys are sorted, a run with nothing new doesn\'t rewrite it', async () => {
  const dir = await content({ 'species/b/vi.json': VI, 'species/a/vi.json': VI })
  await updatePageDates(dir, '2026-11-01')
  expect(Object.keys(await ledger(dir))).toEqual(['species/a/vi.json', 'species/b/vi.json'])
  const same = await updatePageDates(dir, '2026-11-02')
  expect(same.changed).toBe(0)
  await rm(join(dir, 'species/b'), { recursive: true })
  expect((await updatePageDates(dir, '2026-11-03')).changed).toBe(1)
  expect(Object.keys(await ledger(dir))).toEqual(['species/a/vi.json'])
})

test('every kind of page\'s files is dated, and nothing else in content', () => {
  for (const f of ['species/x/entity.json', 'species/x/th.json', 'breeds/x/vi.json', 'plants/x/id.json', 'guides/x/vi.json', 'glossary/x/vi.json', 'products/x/vi.json', 'materials/lua/entity.json', 'materials/lua/vi.json', 'gallery/x.json', 'summaries/x.json', 'equipment/den.json', 'equipment/th/den.json']) expect(isPageFile(f), f).toBe(true)
  for (const f of ['page-dates.json', 'picture-hashes.json', 'changelog.json', 'sources.json', 'captions/th.json', 'series/x.json', 'species/x/notes.txt']) expect(isPageFile(f), f).toBe(false)
})
