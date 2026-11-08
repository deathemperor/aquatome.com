import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { computeContentStats } from '../scripts/content-stats'
import { pageSignals } from '../scripts/page-signals'
import type { PageSignals } from '../worker/admin/quality'
import { DIST } from './dist'

const CONTENT = fileURLToPath(new URL('./fixture-content', import.meta.url))
const ENGINE = fileURLToPath(new URL('./fixture-engine-state', import.meta.url))
const stats = computeContentStats({ contentRoot: CONTENT, engineState: ENGINE, dist: DIST, publicBuild: false, now: new Date('2026-11-02T21:00:00Z') })

test('page signals: each item page\'s engine key, its own score, the checkers\' findings, its last review, and whether it is fixed or lately rewritten', () => {
  // The fixture's engine state, with the reader-fit and reader-review checkers' files beside it.
  const engine = mkdtempSync(join(tmpdir(), 'signals-'))
  cpSync(ENGINE, engine, { recursive: true })
  writeFileSync(join(engine, '_fit.json'), JSON.stringify({ 'vi/species/boraras-brigittae': { hash: 'a1', findings: [{ check: 'units' }, { check: 'words' }, { check: 'source' }, { check: 'units' }] } }))
  writeFileSync(join(engine, '_reader.json'), JSON.stringify({ 'vi/species/boraras-brigittae': { findings: [] }, 'vi/guides/aquariumcoop-thay-nuoc': { findings: [{ k: 'c' }] } }))
  writeFileSync(join(engine, 'rewritten.json'), JSON.stringify({ 'vi/guides/aquariumcoop-thay-nuoc': { at: '2026-11-01T00:00:00Z', hash: 'b2' } }))
  const s = pageSignals({ contentRoot: CONTENT, engineState: engine, pages: stats.pages })
  expect(s.v).toBe(1)
  // [key, its quality score, the reader-fit checks it fails ("words" aside), reader-review findings, its last review's score
  // (the part that says why), fixed by hand, last rewritten]
  expect(s.pages['/ca/ca-boraras-do/']).toEqual(['vi/species/boraras-brigittae', 0.61, ['source', 'units'], 0, 0.61, false, null])
  expect(s.pages['/huong-dan/thay-nuoc-dung-cach/']).toEqual(['vi/guides/aquariumcoop-thay-nuoc', 0.6, null, 1, 0.6, false, '2026-11-01T00:00:00Z'])
  // A page no checker has looked at: nulls, not zeros.
  const plain = Object.values(s.pages).find(([k]) => k === 'vi/species/danio-margaritatus')!
  expect(plain.slice(2)).toEqual([null, null, null, false, null])
  // Every built item page that has an id is there, and only built pages.
  const built = new Set(Object.values(stats.pages ?? {}).flat().map(([path]) => path))
  expect(Object.keys(s.pages).every(p => built.has(p))).toBe(true)
  // A guide a person fixed by hand: the engine won't rewrite it, so the lists won't ask for it.
  const content = mkdtempSync(join(tmpdir(), 'signals-content-'))
  cpSync(CONTENT, content, { recursive: true })
  const guide = join(content, 'guides', 'aquariumcoop-thay-nuoc', 'vi.json')
  writeFileSync(guide, JSON.stringify({ ...JSON.parse(readFileSync(guide, 'utf8')), bodyFixed: true }))
  expect(pageSignals({ contentRoot: content, pages: stats.pages }).pages['/huong-dan/thay-nuoc-dung-cach/']![5]).toBe(true)
  // Without engine state (the fixture build, CI): the pages' own scores only.
  expect(pageSignals({ contentRoot: CONTENT, pages: stats.pages }).pages['/ca/ca-boraras-do/']).toEqual(['vi/species/boraras-brigittae', 0.61, null, null, null, false, null])
})

test('the build writes dist/_ab/page-signals.json, which the Worker reads (worker/admin/quality.ts loadSignals)', () => {
  const built = JSON.parse(readFileSync(join(DIST, '_ab', 'page-signals.json'), 'utf8')) as PageSignals
  expect(built).toEqual(pageSignals({ contentRoot: CONTENT, pages: stats.pages }))
})
