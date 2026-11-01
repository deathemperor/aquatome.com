import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { checkPages, RATCHETED, RULES } from '../src/content-rules'
import { loadPages } from '../src/pages'

// The real content/, not the test store, as a public build shows it. Each class of defect here has a fix the engine
// makes on every page each cycle, before the build (`pnpm engine sweep`, sweep.ts), so a page that has one is a page the
// sweep missed: fix the sweep, not the page. Counts on 2026-11-01, 2,599 pages: the source site's comments or related
// posts on 6, empty headings 10, a repeated paragraph 13, a photo of another fish or a map 44, a card figure out of
// bounds 12, a title promising a count the text lacks 7, imperial units 9, numbered labels out of order 1.
test('no page has a defect the sweep fixes', async () => {
  const pages = await loadPages(fileURLToPath(new URL('../../../content', import.meta.url)))
  const { findings, errors } = checkPages(pages, RULES.filter(r => RATCHETED.includes(r.id)))
  expect(errors).toEqual([])
  const left = Object.fromEntries(RATCHETED.map(id => [id, findings.filter(f => f.rule === id).map(f => `${f.page.path}: ${f.detail}`)]))
  expect(left, 'run pnpm engine sweep').toEqual(Object.fromEntries(RATCHETED.map(id => [id, []])))
}, 180_000) // every page of the real content, in three languages
