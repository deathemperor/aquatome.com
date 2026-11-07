import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'
import { loadAll, type Translation } from '@aq/schema'
import { checkPages, RATCHETED, ratcheted, RULES } from '../src/content-rules'
import { loadPages } from '../src/pages'
import { cardOf, cardProblems, readSummaries } from '../src/summaries'

// The real content/, not the test store, as a public build shows it. Each class of defect here has a fix the engine
// makes on every page each cycle, before the build (`pnpm engine sweep`, sweep.ts; `pnpm engine metric` for units), so a
// page that has one is a page the fix missed: fix the sweep, not the page. Only the kinds of page each fix covers
// (RATCHETED). Pages with one on 2026-11-01, of 2,599: the source site's comments or related posts 22, a heading left at
// the end 2, a repeated paragraph 12, a photo of another fish or a map 25, a card figure out of bounds 12, a title
// promising a count the text lacks 4, numbered labels out of order 1, an imperial figure 1.
test('no page has a defect the sweep fixes', async () => {
  const pages = await loadPages(fileURLToPath(new URL('../../../content', import.meta.url)))
  const { findings, errors } = checkPages(pages, RULES.filter(r => r.id in RATCHETED))
  expect(errors).toEqual([])
  const held = ratcheted(findings)
  const left = Object.fromEntries(Object.keys(RATCHETED).map(id => [id, held.filter(f => f.rule === id).map(f => `${f.page.path}: ${f.detail}`)]))
  expect(left, 'run pnpm engine sweep').toEqual(Object.fromEntries(Object.keys(RATCHETED).map(id => [id, []])))
}, 300_000) // every page of the real content, in three languages: about 100 s on 2,599 pages

// The owner's names of 2026-11-07. Listed, not swept: a page that gives a fish its old name beside the fish is written again.
test('no page calls a fish by the name it no longer has', async () => {
  const pages = await loadPages(fileURLToPath(new URL('../../../content', import.meta.url)))
  const { findings, errors } = checkPages(pages, RULES.filter(r => r.id === 'swapped-name'))
  expect(errors).toEqual([])
  expect(findings.map(f => `${f.page.path}: ${f.detail}`)).toEqual([])
}, 300_000)

// The owner, 2026-11-07: "fritz slim out is not for Vietnamese. I can effectively treat this with very cheap oxy già."
test('the blue-green algae guide leads Vietnamese readers to oxy già, cited, and the engine keeps it', async () => {
  const t = JSON.parse(await readFile(fileURLToPath(new URL('../../../content/guides/aquariumcoop-blogs-aquarium-blue-green-algae/vi.json', import.meta.url)), 'utf8')) as Translation
  expect(t.bodyFixed).toBe(true)
  expect(t.localNote!.html).toMatch(/^<h3>Ở Việt Nam/)
  expect(t.localNote!.html).toContain('oxy già 3%')
  expect(t.localNote!.html).toContain('3 ml cho mỗi 4 lít')
  expect(t.localNote!.refs.map(r => r.url)).toContain('https://aquariumbreeder.com/blue-green-algae-cyanobacteria-profile-and-how-to-remove/')
  expect(t.body).not.toContain('Một sản phẩm bạn có thể dùng là Fritz')
  // Not in another language's text: what's sold in Vietnam is about Vietnam.
  for (const lang of ['id', 'th']) expect(await readFile(fileURLToPath(new URL(`../../../content/guides/aquariumcoop-blogs-aquarium-blue-green-algae/${lang}.json`, import.meta.url)), 'utf8').catch(() => '')).not.toContain('Ở Việt Nam')
})

// A fish's summary states its card's figures, as the card is now: the sweep sends back any that doesn't (cardProblems).
// On 2026-11-07, 54 of 505 approved summaries didn't (size 27 figures, temperature 23, pH 18, hardness 10, difficulty 10,
// minimum tank 5): checked once when written, against a card that changed after (Cá neon vua: 23–27 °C, card 23–29 °C).
test('no approved summary states a figure its card doesn\'t show', async () => {
  const root = fileURLToPath(new URL('../../../content', import.meta.url))
  const cards = new Map((await loadAll({ root, lang: 'vi', publicBuild: true })).species.map(s => [s.id, cardOf(s)]))
  const left = (await readSummaries(root)).filter(s => s.review === 'approved' && cards.has(s.id)).flatMap(s => cardProblems(s, cards.get(s.id)!).map(p => `${s.id}: ${p}`))
  expect(left, 'run pnpm engine sweep').toEqual([])
}, 300_000) // the real content loaded once: about 60 s on a loaded machine
