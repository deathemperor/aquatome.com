import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { allTraces, logReviews, type Review } from '../src/review-log'
import { faultsOf, reviewReport } from '../src/review-report'

const at = (h: number) => new Date(Date.UTC(2026, 10, 6, h))

test('faults are named by the words reviewers use; a note naming two counts in both; the rest are other', () => {
  expect(faultsOf('Remove the invented products "Dennerle Scapers Flow". The transcript never names the filter.')).toEqual(['unsupported'])
  expect(faultsOf('"Bể mẫu" is repeated many times and reads like talking about the video.')).toEqual(['names-source', 'repetition', 'wording'])
  expect(faultsOf('The transcript is garbled, yet the guide states firm specifics. Tone down.')).toEqual(['overstated'])
  expect(faultsOf('Item 7: "merumput alga" is awkward; use "memakan alga".')).toEqual(['wording'])
  expect(faultsOf('Says 5 gallons where the English has 5 litres')).toEqual(['figures'])
  expect(faultsOf('The FAQ answer about lids is vague.')).toEqual(['other'])
})

test('the report: per kind, pages under the bar by their last kept review, faults ranked by pages, notes quoted with their pages', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rr-'))
  const log = (kind: 'video-guide' | 'translation' | 'localize', id: string, lang: string, tries: Review[], kept: Review | undefined, h: number, part?: string) =>
    logReviews(root, kind, { id, lang, ...(part ? { part } : {}) }, tries, kept, { now: at(h) })
  const a: Review = { score: 0.5, notes: ['Remove the invented price list: the video gives no prices.', 'The intro, summary and FAQ repeat the same points.'] }
  const b: Review = { score: 0.6, notes: ['Invents a dosing schedule the transcript never gives.'] }
  await log('video-guide', 'guides/youtube-a', 'vi', [a], a, 1)
  await log('video-guide', 'guides/youtube-b', 'vi', [b], b, 1)
  // c was under the bar, then rewritten above it: not under the bar now, its old notes not counted.
  const cOld: Review = { score: 0.4, notes: ['Copies whole sentences from the transcript.'] }
  await log('video-guide', 'guides/youtube-c', 'vi', [cOld], cOld, 1)
  const cNew: Review = { score: 0.85, notes: [] }
  await log('video-guide', 'guides/youtube-c', 'vi', [{ score: 0.5, notes: ['not kept'] }, cNew], cNew, 2)
  // A species reviewed per source: under the bar when one source's text is.
  await log('translation', 'species/x', 'vi', [{ score: 0.9, notes: [] }], { score: 0.9, notes: [] }, 1, 'glaser')
  const sf: Review = { score: 0.7, notes: ['Omits the breeding section.'] }
  await log('translation', 'species/x', 'vi', [sf], sf, 1, 'seriouslyfish')
  const th: Review = { score: 0.6, notes: [] }
  await log('localize', 'species/x', 'th', [th], th, 1)

  const md = reviewReport(await allTraces(root))
  expect(md).toContain('| video-guide | 3 | 2 (vi 2) | 2 |')
  expect(md).toContain('| translation | 1 | 1 (vi 1) | 1 |')
  expect(md).toContain('| localize | 1 | 1 (th 1) | 0 |')
  const video = md.slice(md.indexOf('## video-guide'), md.indexOf('## translation'))
  expect(video).toContain('2 of 3 pages under the bar.')
  // Invented (2 pages) ranks above repetition (1 page); the rewritten guide's old notes are gone.
  expect(video.indexOf('| Says what the source doesn\'t (invented, added) | 2 | 2 |')).toBeGreaterThan(-1)
  expect(video.indexOf('| Says what the source doesn\'t')).toBeLessThan(video.indexOf('| Repeats itself'))
  expect(video).not.toContain('Copies whole sentences')
  expect(video).not.toContain('not kept')
  expect(video).toContain('- Remove the invented price list: the video gives no prices. — vi/guides/youtube-a, 0.50')
  expect(md).toContain('- Omits the breeding section. — vi/species/x (seriouslyfish), 0.70')
  expect(md.slice(md.indexOf('## localize'))).toContain('Their reviews left no notes.')
})
