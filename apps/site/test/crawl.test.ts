import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { allPages } from '../e2e/pages'
import { DIST } from './dist'

// The fish and plant lists link only the cards on their first page (the rest are built in the browser from the list's
// data file). Search engines still reach every species, breed and plant: the sitemap lists the indexable ones, and every
// one is linked from pages a crawler finds (its group's page, its genus and family pages, related species). This follows
// the links from each language's home page, as a crawler would, and expects to reach all of them.
const ITEM = /^\/(vi\/(ca|cay)|id\/(ikan|tanaman)|th\/(fish|plants))\/[^/]+\/$/

test('every species, breed and plant page is reached by following links from the home pages', () => {
  const pages = new Set(allPages(DIST))
  const html = (p: string) => readFileSync(join(DIST, p, 'index.html'), 'utf8')
  const seen = new Set<string>()
  let next = ['/vi/', '/id/', '/th/'].filter(p => pages.has(p))
  while (next.length) {
    for (const p of next) seen.add(p)
    next = [...new Set(next.flatMap(p => [...html(p).matchAll(/<a\b[^>]*?\shref="(\/[^"]*)"/g)].map(m => m[1]!.replace(/[?#].*$/, ''))))]
      .filter(p => pages.has(p) && !seen.has(p))
  }
  // A redirect stub (an old address) is not a page of its own.
  const items = [...pages].filter(p => ITEM.test(p) && !/http-equiv="refresh"/.test(html(p)))
  expect(items.length).toBeGreaterThan(0)
  expect(items.filter(p => !seen.has(p)), 'pages no link leads to').toEqual([])
}, 120_000) // the real build has some 4,000 pages
