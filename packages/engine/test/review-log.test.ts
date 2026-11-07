import { execFileSync } from 'node:child_process'
import { copyFile, mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { itemReviews, KEEP, lastKept, logReviews, readReviews, type Review } from '../src/review-log'

const REPO = fileURLToPath(new URL('../../..', import.meta.url))
const at = (h: number) => new Date(Date.UTC(2026, 10, 6, h))

test('a page keeps its newest reviews first, KEEP of them, each run\'s rewrite before its first version', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rl-'))
  const page = { id: 'guides/youtube-a1', lang: 'vi' }
  for (let run = 0; run < 4; run++) {
    const first: Review = { score: 0.6, notes: [`run ${run}: copies the transcript`] }
    const again: Review = { score: 0.8, notes: [] }
    await logReviews(root, 'video-guide', page, [first, again], again, { now: at(run), model: 'sonnet' })
  }
  const kept = (await readReviews(root, 'video-guide'))['vi/guides/youtube-a1']!
  expect(kept).toHaveLength(KEEP)
  expect(kept.slice(0, 2)).toEqual([
    { at: '2026-11-06T03:00:00Z', model: 'sonnet', score: 0.8, notes: [], attempt: 'rewrite', kept: true },
    { at: '2026-11-06T03:00:00Z', model: 'sonnet', score: 0.6, notes: ['run 3: copies the transcript'], attempt: 'first', kept: false },
  ])
  // The oldest run is gone.
  expect(kept.map(t => t.notes[0]).filter(Boolean)).toEqual(['run 3: copies the transcript', 'run 2: copies the transcript', 'run 1: copies the transcript'])
})

test('notes are capped (10 a review, 400 characters a note); a run whose page was not written keeps nothing as kept', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rl-'))
  const page = { id: 'species/x', lang: 'vi', part: 'seriouslyfish' }
  await logReviews(root, 'translation', page, [{ score: 0.5, notes: Array.from({ length: 12 }, (_, i) => `${i} ${'x'.repeat(500)}`) }], undefined, { now: at(1) })
  const [t] = (await readReviews(root, 'translation'))['vi/species/x#seriouslyfish']!
  expect(t!.notes).toHaveLength(10)
  expect(t!.notes[0]).toHaveLength(400)
  expect(t!.notes[0]!.endsWith('…')).toBe(true)
  expect(t!.kept).toBe(false)
})

test('a read while this process is writing the file waits for the write: a redo running beside another read half a file', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rl-'))
  const r: Review = { score: 0.6, notes: ['Adds a dose the video never gives'] }
  const writing = logReviews(root, 'video-guide', { id: 'guides/youtube-a1', lang: 'vi' }, [r], r, { now: at(1) })
  expect(Object.keys(await readReviews(root, 'video-guide'))).toEqual(['vi/guides/youtube-a1'])
  expect(await lastKept(root, { id: 'guides/youtube-a1', lang: 'vi' }, ['video-guide'])).toMatchObject({ score: 0.6 })
  await writing
})

test('pages reviewed at once in one process all land (summaries run several pages at a time)', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rl-'))
  await Promise.all(Array.from({ length: 20 }, (_, i) => { const r = { score: 1, notes: [] }; return logReviews(root, 'summary', { id: `species/s${i}`, lang: 'vi' }, [r], r) }))
  expect(Object.keys(await readReviews(root, 'summary'))).toHaveLength(20)
})

test('the last kept review of a page: newest across kinds, a part matching its own and the whole page\'s, a version not kept skipped', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rl-'))
  const sf = { id: 'species/x', lang: 'vi', part: 'seriouslyfish' }
  const translated: Review = { score: 0.6, notes: ['omits the breeding section'] }
  await logReviews(root, 'translation', sf, [translated], translated, { now: at(1) })
  await logReviews(root, 'translation', { ...sf, part: 'glaser' }, [{ score: 0.9, notes: ['glaser note'] }], undefined, { now: at(2) })
  // A rewrite that was not kept: the page still has the translation.
  await logReviews(root, 'vi-rewrite', sf, [{ score: 0.5, notes: ['worse'] }], undefined, { now: at(3) })
  expect(await lastKept(root, sf, ['translation', 'vi-rewrite'])).toMatchObject({ kind: 'translation', part: 'seriouslyfish', notes: ['omits the breeding section'] })
  expect(await lastKept(root, { ...sf, lang: 'id' }, ['translation', 'vi-rewrite'])).toBeUndefined()
  const kept: Review = { score: 0.8, notes: ['stiff'] }
  await logReviews(root, 'vi-rewrite', sf, [kept], kept, { now: at(4) })
  expect(await lastKept(root, sf, ['translation', 'vi-rewrite'])).toMatchObject({ kind: 'vi-rewrite', notes: ['stiff'] })
  expect(await lastKept(root, sf, ['translation'])).toMatchObject({ kind: 'translation' })
})

test('a batch review as one item\'s: its notes and the batch\'s general ones', () => {
  const r: Review = { score: 0.6, notes: ['"Sungai Mekong" should be "Mekong"', '"Amazonas" is fine', 'Several names are in English'] }
  const names = [['mekong', 'Sông Mê Kông', 'Sungai Mekong'], ['amazon', 'Sông Amazon', 'Amazonas']]
  const mine = itemReviews([r], r, names, 0)
  expect(mine.tries[0]).toEqual({ score: 0.6, notes: ['"Sungai Mekong" should be "Mekong"', 'Several names are in English'] })
  expect(mine.kept).toBe(mine.tries[0])
})

test('as a git merge driver: the video job and the rewrite part logging reviews at once rebase cleanly, both kept', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'rl-git-'))
  const git = (...a: string[]) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' })
  git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't')
  git('config', 'merge.jsonmap.driver', `node ${join(REPO, 'scripts/merge-json-map.mjs')} %O %A %B`)
  // The repository's own attributes: engine-state/reviews/*.json goes through the jsonmap driver.
  await copyFile(join(REPO, '.gitattributes'), join(dir, '.gitattributes'))
  const one = (score: number): Review => ({ score, notes: [`scored ${score}`] })
  const log = (kind: 'video-guide' | 'localize', id: string, lang: string, score: number, h: number) => { const r = one(score); return logReviews(dir, kind, { id, lang }, [r], r, { now: at(h) }) }
  await log('video-guide', 'guides/youtube-a', 'vi', 0.9, 0)
  await log('localize', 'species/a', 'id', 0.9, 0)
  git('add', '.'); git('commit', '-qm', 'base')
  git('checkout', '-qb', 'videos')
  await log('video-guide', 'guides/youtube-a', 'vi', 0.7, 1)
  await log('video-guide', 'guides/youtube-b', 'vi', 0.6, 1)
  await log('localize', 'species/b', 'id', 0.6, 1)
  git('add', '.'); git('commit', '-qm', 'videos')
  git('checkout', '-q', 'main')
  // The same places in the files: a plain text merge conflicts here.
  await log('video-guide', 'guides/youtube-c', 'vi', 0.8, 2)
  await log('localize', 'species/c', 'id', 0.5, 2)
  git('commit', '-qam', 'rewrite part')
  git('checkout', '-q', 'videos'); git('rebase', '-q', 'main')
  const videos = JSON.parse(await readFile(join(dir, 'engine-state/reviews/video-guide.json'), 'utf8'))
  expect(Object.keys(videos).sort()).toEqual(['vi/guides/youtube-a', 'vi/guides/youtube-b', 'vi/guides/youtube-c'])
  expect(videos['vi/guides/youtube-a'].map((t: { score: number }) => t.score)).toEqual([0.7, 0.9])
  expect(Object.keys(JSON.parse(await readFile(join(dir, 'engine-state/reviews/localize.json'), 'utf8'))).sort()).toEqual(['id/species/a', 'id/species/b', 'id/species/c'])
})
