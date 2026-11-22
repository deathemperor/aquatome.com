import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { PHRASES, phraseRun } from '../src/phrases'
import { LISTED_ON, listedBy, marksFor, rewriteMarks, sentText, writeReport } from '../src/rewrite-marks'
import { rewriteExisting, type RewriteState } from '../src/vi-backfill'

const put = async (root: string, path: string, v: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), JSON.stringify(v)) }
const guide = (root: string, slug: string, body: string) => Promise.all([
  put(root, `guides/${slug}/entity.json`, { id: slug, source: 'aquariumcoop', html: '' }),
  put(root, `guides/${slug}/vi.json`, { slug, name: slug, body, quality: { score: 0.85, indexable: true } }),
])
const rec = (at: string, more: Partial<RewriteState[string]> = {}) => ({ at, rewritten: 1, of: 1, scores: [0.9], v: 2, ...more })
const opts = { mode: 'fix' as const }

async function setup(state: RewriteState, pages: Record<string, string>) {
  const root = join(await mkdtemp(join(tmpdir(), 'aq-marks-')), 'content') // engine-state beside it, as in the repository
  for (const [slug, body] of Object.entries(pages)) await guide(root, slug, body)
  const file = join(root, '..', 'vi-rewrite.json')
  await writeFile(file, JSON.stringify(state))
  return { root, file }
}

// A row added to the list after this step goes here, never in the table: the step marks none of its words.
const ADDED_SINCE: string[] = []
test('the table holds every row on the list, each on the day it reached the rewrite', () => {
  const says = (PHRASES.vi ?? []).map(p => p.say)
  expect(Object.keys(LISTED_ON).filter(s => !says.includes(s))).toEqual([])
  expect(says.filter(s => !LISTED_ON[s])).toEqual(ADDED_SINCE)
  expect(Object.values(LISTED_ON).filter(d => d === '2026-11-08')).toHaveLength(61)
  expect(Object.entries(LISTED_ON).filter(([, d]) => d === '2026-11-12').map(([s]) => s).sort()).toEqual(['nửa tá', 'thài lài', 'thủng lỗ đầu', 'trùn chỉ đỏ'])
})

test('a word counts only for a page rewritten on a later day than its row reached the rewrite', () => {
  expect(listedBy('phần lớn', '2026-11-08')).toBe(false)
  expect(listedBy('phần lớn', '2026-11-09')).toBe(true)
  expect(listedBy('nửa tá', '2026-11-12')).toBe(false)
  expect(listedBy('nửa tá', '2026-11-13')).toBe(true)
  expect(listedBy('a row added later', '2026-12-01')).toBe(false)
  // As --phrases matches it: the word as written, lower-cased; a 12 Nov row's word not yet on a page of 12 Nov.
  expect(marksFor('["Phần lớn cá… nửa tá con"]', '2026-11-12', PHRASES.vi!)).toEqual(['phần lớn'])
  expect(marksFor('["Phần lớn cá… nửa tá con"]', '2026-11-13', PHRASES.vi!).sort()).toEqual(['nửa tá', 'phần lớn'])
})

test('a word counts only in the part the rewrite read', () => {
  const page = { body: '<p>Phần lớn cá.</p>', definition: 'Dù vậy là…', faq: [{ q: 'Khó không?', a: 'Nhìn chung là dễ.' }] }
  expect(sentText('guides', page, 'aquariumcoop')).toBe(page.body) // a guide's body, never its questions
  expect(sentText('guides', page, 'youtube')).toBe('') // a video guide's body went to no rewrite
  expect(sentText('guides', { ...page, bodyFixed: true }, 'aquariumcoop')).toBe('') // nor a body a person fixed
  expect(sentText('glossary', page)).toBe(page.definition)
  expect(sentText('species', page)).toContain('Nhìn chung') // a fish or plant page: all of it, as --phrases reads it
})

test('marks what a page kept from a rewrite made with its word listed; the rest stays for --phrases, as its own dry run picks', async () => {
  const state: RewriteState = {
    'guides/slip': rec('2026-11-15'), // rewritten whole with the list: its word is a slip, marked
    'guides/same-day': rec('2026-11-08'), // the day the list landed: not marked
    'guides/before': rec('2026-11-02'), // before the list: not marked
    'guides/kept': rec('2026-11-15', { rewritten: 0, scores: [0.6] }), // the reviewer refused it: its text wasn't rewritten, not marked
    'guides/partial': rec('2026-11-15', { rewritten: 1, of: 2, scores: [0.9, 0.6] }), // one part refused, which one unknown: not marked
    'guides/failed': rec('2026-11-15', { rewritten: 0, error: 'boom' }), // the rewrite failed: not marked
    'guides/failed-quiet': rec('2026-11-15', { rewritten: 0, error: '' }), // failed with no message: still a failure
    'guides/marked': rec('2026-11-20', { phrases: ['dù vậy'] }), // marked already: left as it is
    'guides/no-marks': rec('2026-11-15', { phrases: [] }), // an empty list is no marks: marked
    'guides/late-row': rec('2026-11-12'), // has a 12 Nov row's word on 12 Nov: that word stays, the other is marked
    'guides/faq-only': rec('2026-11-15'), // its word is only in an FAQ answer, which the rewrite never sent: not marked
  }
  const { root, file } = await setup(state, {
    slip: '<p>Phần lớn cá sống ở suối.</p>',
    'same-day': '<p>Phần lớn cá sống ở suối.</p>',
    before: '<p>Phần lớn cá sống ở suối.</p>',
    kept: '<p>Dù vậy, cá vẫn khỏe.</p>',
    partial: '<p>Phần lớn cá sống ở suối.</p>',
    failed: '<p>Dù vậy, cá vẫn khỏe.</p>',
    'failed-quiet': '<p>Dù vậy, cá vẫn khỏe.</p>',
    marked: '<p>Dù vậy, cá vẫn khỏe. Nhìn chung là ổn.</p>',
    'no-marks': '<p>Dù vậy, cá vẫn khỏe.</p>',
    'late-row': '<p>Phần lớn cá đẻ nửa tá trứng.</p>',
    'faq-only': '<p>Cá dễ nuôi.</p>',
    never: '<p>Nhìn chung cá dễ nuôi.</p>', // never rewritten: --phrases takes it up
    clean: '<p>Cá dễ nuôi.</p>', // no listed word: never due
  })
  await put(root, 'guides/faq-only/vi.json', { slug: 'faq-only', name: 'F', body: '<p>Cá dễ nuôi.</p>', faq: [{ q: 'Khó không?', a: 'Nhìn chung là dễ.' }], quality: { score: 0.85, indexable: true } })
  const before = await readFile(file, 'utf8')
  const dry = await rewriteMarks(root, file, { dry: true, opts })
  expect(await readFile(file, 'utf8')).toBe(before)
  const r = await rewriteMarks(root, file, { opts })
  expect(r).toEqual(dry)
  expect(r.marked.sort()).toEqual(['guides/late-row', 'guides/no-marks', 'guides/slip'])
  expect([r.records, r.skipped, r.partial, r.eligible]).toEqual([11, 3, 2, 6])
  const after = JSON.parse(await readFile(file, 'utf8')) as RewriteState
  expect(after['guides/slip']!.phrases).toEqual(['phần lớn'])
  expect(after['guides/no-marks']!.phrases).toEqual(['dù vậy'])
  expect(after['guides/late-row']!.phrases).toEqual(['phần lớn'])
  for (const id of ['guides/same-day', 'guides/before', 'guides/kept', 'guides/partial', 'guides/failed', 'guides/failed-quiet', 'guides/marked', 'guides/faq-only']) expect(after[id]).toEqual(state[id])
  const ids = (xs: string[]) => xs.map(x => x.split(' ')[0]).sort()
  expect(ids(r.dueBefore)).toEqual(['guides/before', 'guides/failed', 'guides/failed-quiet', 'guides/faq-only', 'guides/kept', 'guides/late-row', 'guides/marked', 'guides/never', 'guides/no-marks', 'guides/partial', 'guides/same-day', 'guides/slip'])
  expect(ids(r.dueAfter)).toEqual(['guides/before', 'guides/failed', 'guides/failed-quiet', 'guides/faq-only', 'guides/kept', 'guides/late-row', 'guides/marked', 'guides/never', 'guides/partial', 'guides/same-day'])
  expect([r.afterRecorded, r.afterNever, r.parts]).toEqual([9, 1, 10])
  // The count is the rewrite's own: with the record as written, --phrases takes up exactly the pages left.
  const real = await rewriteExisting(root, file, { llm: async () => { throw new Error('no model') }, opts, now: () => new Date() }, { limit: Infinity, ...phraseRun('vi'), dry: true })
  expect(ids(real.done)).toEqual(ids(r.dueAfter))
  expect(r.byRow['phần lớn']).toEqual({ rewrittenWith: 4, stillHave: 2, leftWith: 3 })
  expect(r.byRow['nửa tá']).toEqual({ rewrittenWith: 3, stillHave: 0, leftWith: 1 })
  // A second run marks nothing more.
  const again = await rewriteMarks(root, file, { opts })
  expect(again.marked).toEqual([])
  expect(await readFile(file, 'utf8')).toBe(`${JSON.stringify(after, null, 2)}\n`)
})

test('the record is written whole, and not at all if it changed during the run; the report never goes over a file', async () => {
  const { root, file } = await setup({ 'guides/slip': rec('2026-11-15') }, { slip: '<p>Phần lớn cá sống ở suối.</p>' })
  const changed = JSON.stringify({ 'guides/slip': rec('2026-11-15'), 'guides/new': rec('2026-11-22') })
  await expect(rewriteMarks(root, file, { opts, beforeWrite: () => writeFile(file, changed) })).rejects.toThrow('changed while the marks were made')
  expect(await readFile(file, 'utf8')).toBe(changed)
  expect(await readdir(join(file, '..'))).not.toContainEqual(expect.stringContaining('.marks-'))
  const r = await rewriteMarks(root, file, { opts })
  expect(r.marked).toEqual(['guides/slip'])
  await expect(writeReport(file, r)).rejects.toThrow()
  expect(JSON.parse(await readFile(file, 'utf8'))['guides/slip'].phrases).toEqual(['phần lớn'])
  const out = join(root, '..', 'report.json')
  await writeReport(out, r)
  expect(JSON.parse(await readFile(out, 'utf8')).marked).toEqual(['guides/slip'])
})
