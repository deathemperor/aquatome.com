import { expect, test } from 'vitest'
import { appIndex } from '../src/lib/app-index'
import { fishDoc, listedPaths } from '../src/lib/app-page'
import { getContent } from '../src/lib/content'
import { speciesItems } from '../src/lib/list-data'

// A fish with no photo of its own (a page the photo check leaves with none, as a river it calls "none"): the app's page
// file has no lead and its feed no picture, and the fish list's data file gives its tile none, so the list's script draws
// the "no photo yet" plate (e2e/no-photo.spec.ts holds the site's tile, page and share picture).
test('a fish with no photo: no lead in the app\'s page file, no picture in its feed or the fish list\'s data file', async () => {
  const vi = await getContent('vi')
  const listed = new Set(appIndex('vi', vi).items.filter(i => i.kind === 'fish').map(i => i.id))
  const was = vi.species.find(s => listed.has(s.id) && s.photos.length)!
  const s = { ...was, photos: [] }
  const bare = { ...vi, species: vi.species.map(x => (x.id === s.id ? s : x)), galleries: { ...vi.galleries, [s.id]: [] } }
  const doc = await fishDoc('vi', bare, s, listedPaths('vi', bare))
  expect(doc.lead).toBeUndefined()
  expect(JSON.stringify(doc)).not.toContain(was.photos[0]!.url)
  const item = appIndex('vi', bare).items.find(i => i.id === s.id)
  expect(item).toMatchObject({ kind: 'fish' })
  expect(item?.img).toBeUndefined()
  expect(speciesItems([s], [null])[0]?.photo).toBeUndefined()
})
