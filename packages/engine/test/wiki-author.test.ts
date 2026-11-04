import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { authorText, tidyAuthor, tidyCredits } from '../src/wiki-author'

test("Commons' placeholder author and a renamed user give the user's name", () => {
  // File:Gold_Ram_Cichlid.JPG, as the Artist field reads.
  expect(authorText('No machine-readable author provided. RuthJM~commonswiki assumed (based on copyright claims).')).toBe('RuthJM')
  expect(authorText('No machine-readable author provided. Fred Hsu assumed (based on copyright claims).')).toBe('Fred Hsu')
  expect(authorText('<a href="//commons.wikimedia.org/wiki/User:Raf24~commonswiki">Raf24~commonswiki</a>')).toBe('Raf24')
  expect(tidyAuthor('A-kun--a~commonswiki')).toBe('A-kun--a')
  // Left as they are: a name with a tilde of its own, a sentence that only looks like the placeholder.
  expect(tidyAuthor('Ann~Marie')).toBe('Ann~Marie')
  expect(tidyAuthor('No machine-readable author provided.')).toBe('No machine-readable author provided.')
})

test('stored Wikimedia credits are tidied in place on pages and galleries; others and the layout untouched', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cr-'))
  await mkdir(join(root, 'species', 'a'), { recursive: true })
  await mkdir(join(root, 'gallery'), { recursive: true })
  const placeholder = 'No machine-readable author provided. RuthJM~commonswiki assumed (based on copyright claims).'
  const page = { photos: [
    { url: 'https://media.aquatome.com/commons/1.webp', author: placeholder, sourceUrl: 'https://commons.wikimedia.org/wiki/File:Gold_Ram_Cichlid.JPG' },
    // Not from Wikimedia: someone may well write their name so.
    { url: 'https://media.aquatome.com/x/2.webp', author: 'Raf24~commonswiki', sourceUrl: 'https://www.flickr.com/photos/x/2' },
  ], sections: [{ photos: [{ author: placeholder, sourceUrl: 'https://commons.wikimedia.org/wiki/File:B.jpg' }] }] }
  const pageRaw = `${JSON.stringify(page, null, 2)}\n`
  await writeFile(join(root, 'species', 'a', 'entity.json'), pageRaw)
  const gallery = { id: 'a', photos: [{ author: 'Raf24~commonswiki', sourceUrl: 'https://commons.wikimedia.org/wiki/File:C.jpg' }] }
  await writeFile(join(root, 'gallery', 'a.json'), JSON.stringify(gallery, null, 1))

  expect(await tidyCredits(root)).toEqual({ files: 2, authors: 3 })
  const after = await readFile(join(root, 'species', 'a', 'entity.json'), 'utf8')
  expect(after).toBe(pageRaw.replaceAll(JSON.stringify(placeholder), '"RuthJM"'))
  expect(JSON.parse(after).photos[1].author).toBe('Raf24~commonswiki')
  expect(JSON.parse(await readFile(join(root, 'gallery', 'a.json'), 'utf8')).photos[0].author).toBe('Raf24')
  // Run again: nothing left to do.
  expect(await tidyCredits(root)).toEqual({ files: 0, authors: 0 })
})
