import { cp, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GallerySchema, loadAll } from '@aq/schema'
import { expect, test } from 'vitest'
import { breedGallery } from '../src/lib/breeds'
import { GALLERY_MIN } from '../src/lib/gallery'
import { distinctPhotos } from '../src/lib/pictures'

const fixture = fileURLToPath(new URL('./fixture-content', import.meta.url))

// The engine's gallery step writes a breed's gallery as a species' (content/gallery/<breed id>.json, best picks and kinds).
test('a breed\'s gallery file follows its page photos, and gives it a gallery page once they reach 6', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aq-breed-gallery-'))
  await cp(fixture, root, { recursive: true })
  const photo = (i: number) => ({
    url: `https://media.aquatome.com/commons/g${i}.webp`, width: 1280, height: 960, licence: 'CC BY-SA 4.0', author: 'A',
    sourceUrl: `https://commons.wikimedia.org/wiki/File:G${i}.jpg`, caption: `Cá đĩa bồ câu ${i}`, best: i === 1, kind: 'form',
  })
  const gallery = (n: number) => writeFile(join(root, 'gallery/pigeon-blood-discus.json'), JSON.stringify(GallerySchema.parse({
    id: 'pigeon-blood-discus', photos: Array.from({ length: n }, (_, i) => photo(i + 1)), seen: n, updatedAt: '2026-11-04', builtAt: '2026-11-04',
  })))
  const shown = async () => {
    const c = await loadAll({ root, lang: 'vi', publicBuild: false })
    const b = c.breeds.find(x => x.id === 'pigeon-blood-discus')!
    return { b, photos: breedGallery(c, b), page: distinctPhotos(c, breedGallery(c, b)) }
  }
  // Its page has 2 photos: the second, then the gallery's 4, are 5, one short of a gallery page (anh.astro's rule).
  await gallery(4)
  let s = await shown()
  expect(s.b.photos).toHaveLength(2)
  expect(s.photos.map(p => p.sourceUrl)).toEqual([s.b.photos[1]!.sourceUrl, ...[1, 2, 3, 4].map(i => `https://commons.wikimedia.org/wiki/File:G${i}.jpg`)])
  expect(s.page.length).toBeLessThan(GALLERY_MIN)
  await gallery(5)
  s = await shown()
  expect(s.page).toHaveLength(GALLERY_MIN)
})
