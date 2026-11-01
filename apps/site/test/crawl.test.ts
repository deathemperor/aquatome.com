import { expect, test } from 'vitest'
import { DIST } from './dist'
import { unreached } from './reach'

// The fish, plant and guide lists link only the cards on their first page (the rest are built in the browser from the list's
// data file), and so do the group, taxon and origin pages. Search engines still reach every species, breed and plant: the
// sitemap lists the indexable ones, and every one is linked from pages a crawler finds (a list's numbered pages, its
// group's numbered pages, related species). This follows the links from each language's home page, as a crawler would,
// and expects to reach all of them. test/list-growth.test.ts does the same on a build with lists longer than a page.
test('every species, breed, plant and guide page is reached by following links from the home pages', () => {
  const r = unreached(DIST)
  expect(r.items).toBeGreaterThan(0)
  expect(r.unreached, 'pages no link leads to').toEqual([])
}, 120_000) // the real build has some 4,000 pages
