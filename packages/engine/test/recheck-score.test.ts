import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { applySourceRechecks, sourceTextHash } from '../src/recheck-score'
import { logReviews } from '../src/review-log'

const put = async (root: string, path: string, v: unknown) => { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), JSON.stringify(v)) }

const sf = { key: 'diet', source: 'seriouslyfish', sourceUrl: 'u', html: '<p>Diet from seriouslyfish</p>' }
const gl = { key: 'diet', source: 'glaser', sourceUrl: 'u', html: '<p>Diet from glaser</p>' }
const viText = { 'diet:seriouslyfish': '<p>ăn gì</p>', 'diet:glaser': '<p>glaser</p>' }
const hash = sourceTextHash([{ id: 'diet:seriouslyfish', en: sf.html, vi: viText['diet:seriouslyfish'] }])
const glaserHash = sourceTextHash([{ id: 'diet:glaser', en: gl.html, vi: viText['diet:glaser'] }])

const quality = (by: Record<string, number>) => {
  const score = Math.min(...Object.values(by))
  return { score, indexable: score >= 0.75, bySource: by, ...(score < 0.75 ? { reason: 'score' as const } : {}) }
}

/** A kept recheck of one source, and the page it would raise. `textHash` omitted when the review logged none. */
async function page(root: string, by: Record<string, number>, o: { score?: number; textHash?: string; source?: string; thin?: boolean } = {}) {
  const source = o.source ?? 'seriouslyfish'
  const sections = o.thin ? [gl] : [sf, gl]
  await put(root, 'content/species/x/entity.json', { id: 'x', sections })
  await put(root, 'content/species/x/vi.json', { slug: 'x', name: 'X', sections: o.thin ? { 'diet:glaser': viText['diet:glaser'] } : viText, quality: quality(by) })
  const r = { score: o.score ?? 0.93, notes: ['fine'] }
  await logReviews(root, 'translation', { id: 'species/x', lang: 'vi', part: source }, [r], r, { now: new Date('2026-11-06T15:35:03Z'), recheck: true, ...(o.textHash ? { textHash: o.textHash } : {}) })
}

const read = async (root: string) => JSON.parse(await readFile(join(root, 'content/species/x/vi.json'), 'utf8'))

test('a passing recheck of the text still on the page raises that source, and the page score is the minimum', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rs-'))
  await page(root, { seriouslyfish: 0.6, glaser: 0.8 }, { textHash: hash })
  expect(await applySourceRechecks(root)).toEqual(['species/x'])
  expect((await read(root)).quality).toEqual({ score: 0.8, indexable: true, bySource: { seriouslyfish: 0.93, glaser: 0.8 } })
  const after = await readFile(join(root, 'content/species/x/vi.json'), 'utf8')
  expect(await applySourceRechecks(root)).toEqual([])
  expect(await readFile(join(root, 'content/species/x/vi.json'), 'utf8')).toBe(after)
})

test('a recheck under the bar, of other text, or below the score already there, leaves the page', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rs-'))
  await page(root, { seriouslyfish: 0.6, glaser: 0.8 }, { score: 0.7, textHash: hash })
  expect(await applySourceRechecks(root)).toEqual([])
  expect((await read(root)).quality.bySource.seriouslyfish).toBe(0.6)

  const other = await mkdtemp(join(tmpdir(), 'rs-'))
  await page(other, { seriouslyfish: 0.6, glaser: 0.8 }, { textHash: 'not-this-text' })
  expect(await applySourceRechecks(other)).toEqual([])
  expect((await read(other)).quality.score).toBe(0.6)

  // No hash, and this folder is not a git checkout, so the text cannot be proved.
  const unproved = await mkdtemp(join(tmpdir(), 'rs-'))
  await page(unproved, { seriouslyfish: 0.6, glaser: 0.8 })
  expect(await applySourceRechecks(unproved)).toEqual([])
  expect((await read(unproved)).quality.score).toBe(0.6)

  const higher = await mkdtemp(join(tmpdir(), 'rs-'))
  await page(higher, { seriouslyfish: 0.95, glaser: 0.9 }, { score: 0.8, textHash: hash })
  const before = await readFile(join(higher, 'content/species/x/vi.json'), 'utf8')
  expect(await applySourceRechecks(higher)).toEqual([])
  expect(await readFile(join(higher, 'content/species/x/vi.json'), 'utf8')).toBe(before)
})

test('a thin page takes the higher source score and stays closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rs-'))
  await page(root, { glaser: 0.6 }, { source: 'glaser', thin: true, score: 0.9, textHash: glaserHash })
  expect(await applySourceRechecks(root)).toEqual(['species/x'])
  expect((await read(root)).quality).toEqual({ score: 0.9, indexable: false, bySource: { glaser: 0.9 }, reason: 'thin' })
})
