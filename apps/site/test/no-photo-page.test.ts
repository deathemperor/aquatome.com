import { expect, test } from 'vitest'
import { appIndex } from '../src/lib/app-index'
import { fishDoc, listedPaths } from '../src/lib/app-page'
import { getContent } from '../src/lib/content'
import { speciesItems } from '../src/lib/list-data'

// A fish with no photo of its own (the fixture's harlequin rasbora; a page the photo check leaves with none, as a river it
// calls "none"): the app's page file has no lead and its feed no picture, and the fish list's data file gives its tile none,
// so the list's script draws the "no photo yet" plate (e2e/no-photo.spec.ts holds the site's page, tile and share picture).
test('a fish with no photo: no lead in the app\'s page file, no picture in its feed or the fish list\'s data file', async () => {
  const vi = await getContent('vi')
  const s = vi.species.find(x => x.id === 'trigonostigma-heteromorpha')!
  expect(s.photos).toEqual([])
  const doc = await fishDoc('vi', vi, s, listedPaths('vi', vi))
  expect(doc.lead).toBeUndefined()
  expect(JSON.stringify(doc)).not.toContain('media.aquatome.com')
  const item = appIndex('vi', vi).items.find(i => i.id === s.id)
  expect(item).toMatchObject({ kind: 'fish' })
  expect(item?.img).toBeUndefined()
  expect(speciesItems([s], [undefined])[0]?.photo).toBeUndefined()
})
