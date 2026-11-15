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
  expect(tidyAuthor('Foo~enwiki')).toBe('Foo')
  expect(tidyAuthor('Foo~wikimedia')).toBe('Foo~wikimedia')
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
  // The same renamed user beside a Commons credit in one file: tidied there too.
  const gallery = { id: 'a', photos: [{ author: 'Raf24~commonswiki', sourceUrl: 'https://commons.wikimedia.org/wiki/File:C.jpg' },
    { author: 'Raf24~commonswiki', sourceUrl: 'https://www.flickr.com/photos/x/3' }] }
  await writeFile(join(root, 'gallery', 'a.json'), JSON.stringify(gallery, null, 1))

  expect(await tidyCredits(root)).toEqual({ files: 2, authors: 4 })
  const after = await readFile(join(root, 'species', 'a', 'entity.json'), 'utf8')
  expect(after).toBe(pageRaw.replaceAll(JSON.stringify(placeholder), '"RuthJM"'))
  expect(JSON.parse(after).photos[1].author).toBe('Raf24~commonswiki')
  expect(JSON.parse(await readFile(join(root, 'gallery', 'a.json'), 'utf8')).photos.map((p: { author: string }) => p.author)).toEqual(['Raf24', 'Raf24'])
  // Run again: nothing left to do.
  expect(await tidyCredits(root)).toEqual({ files: 0, authors: 0 })
})

// A made-up address on a reserved domain: a test never holds a real person's (the chief of staff, 16 Nov 2026).
const address = 'someone@example.org'

test('a Commons credit holds no email address: the name before it stays, and a field with only the address credits Commons', () => {
  // As an Artist field reads when its photographer asks to be mailed (the koi's, 16 Nov 2026), with a made-up name.
  const artist = `<a href="//commons.wikimedia.org/wiki/User:Photographer">Photographer</a> (<a href="//commons.wikimedia.org/wiki/User_talk:Photographer">Photographer</a>) I'd appreciate if you could mail me (${address}) if you want to use this picture out of the Wikimedia project scope. This file is licensed under the Creative Commons Attribution-Share Alike 4.0 International license.`
  expect(authorText(artist)).toBe('Photographer')
  expect(tidyAuthor(`A. Photographer <${address}>`)).toBe('A. Photographer')
  expect(tidyAuthor(`A. Photographer, ${address}`)).toBe('A. Photographer')
  expect(tidyAuthor(`A. Photographer ${address}`)).toBe('A. Photographer')
  expect(tidyAuthor(address)).toBe('Wikimedia Commons')
  expect(tidyAuthor(`A. Photographer ${address}.`)).toBe('A. Photographer')
  // As the field comes, HTML: the brackets escaped, or the "@" itself (a reader's catch, 16 Nov 2026).
  expect(authorText(`A. Photographer &lt;${address}&gt;`)).toBe('A. Photographer')
  expect(authorText(`A. Photographer &lt;${address.replace('@', '&#64;')}&gt;`)).toBe('A. Photographer')
  expect(authorText(`A. Photographer (${address.replace('@', '&#x40;')})`)).toBe('A. Photographer')
  // No address: the field as it was, escaped brackets and all.
  expect(tidyAuthor('Photograph by A. Photographer (www.example.org).')).toBe('Photograph by A. Photographer (www.example.org).')
  expect(tidyAuthor('A. Photographer &lt;Studio&gt;')).toBe('A. Photographer &lt;Studio&gt;')
})

test('a stored Commons credit with an email address keeps only the name, in place; the next run finds nothing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cr-'))
  await mkdir(join(root, 'gallery'), { recursive: true })
  const credit = `Photographer (Photographer) I'd appreciate if you could mail me (${address}) if you want to use this picture out of the Wikimedia project scope.`
  const gallery = { id: 'koi', photos: [
    { author: credit, sourceUrl: 'https://commons.wikimedia.org/wiki/File:K.jpg' },
    { author: 'B. Other', sourceUrl: 'https://commons.wikimedia.org/wiki/File:L.jpg' },
  ] }
  const raw = `${JSON.stringify(gallery, null, 2)}\n`
  await writeFile(join(root, 'gallery', 'koi.json'), raw)

  expect(await tidyCredits(root)).toEqual({ files: 1, authors: 1 })
  const after = await readFile(join(root, 'gallery', 'koi.json'), 'utf8')
  expect(after).toBe(raw.replace(JSON.stringify(credit), '"Photographer"'))
  expect(after).not.toContain('@')
  expect(await tidyCredits(root)).toEqual({ files: 0, authors: 0 })
})
