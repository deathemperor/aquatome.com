import { expect, test } from 'vitest'
import { appIndex } from '../src/lib/app-index'
import { fishDoc, listedPaths } from '../src/lib/app-page'
import { getContent } from '../src/lib/content'
import { largeOf } from '../src/lib/img'

// A photo's large copy (1,200 px or more on its short side, the engine's large-photos.ts) is what the app's large layouts
// read. It's on the index item, so the app picks a page's header and a card's layout before the page arrives, and on the
// page's own photos, for the gallery and the full-screen viewer. A photo without one gets the smaller layout.
const LARGE = { url: 'https://media.aquatome.com/commons/0000000000000001-1600.webp', width: 1520, height: 1200 }

test("an index item carries its photo's large copy, and an item whose photo has none carries none", async () => {
  const ix = appIndex('vi', await getContent('vi'))
  expect(ix.items.find(i => i.id === 'paracheirodon-axelrodi')?.large).toEqual(LARGE)
  const without = ix.items.filter(i => i.kind === 'fish' && i.img && i.id !== 'paracheirodon-axelrodi')
  expect(without.length).toBeGreaterThan(0)
  for (const i of without) expect(i.large, i.id).toBeUndefined()
})

test("a fish page's lead photo carries its large copy", async () => {
  const c = await getContent('vi')
  const d = await fishDoc('vi', c, c.species.find(s => s.id === 'paracheirodon-axelrodi')!, listedPaths('vi', c))
  expect(d.lead?.large).toEqual(LARGE)
})

test('a large copy under 1,200 px on its short side is left out, so the app gives that photo the smaller layout', () => {
  const photo = (width: number, height: number) => ({ url: 'https://x/p.webp', width: 1200, height: 800, large: { url: 'https://x/p-large.webp', width, height } })
  expect(largeOf(photo(1520, 1200)).large).toEqual({ url: 'https://x/p-large.webp', width: 1520, height: 1200 })
  expect(largeOf(photo(999, 675)).large).toBeUndefined()
  expect(largeOf(photo(2400, 1165)).large).toBeUndefined()
})
