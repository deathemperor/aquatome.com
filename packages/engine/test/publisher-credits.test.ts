import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { creditAfter, namePublisherCredits, tiedCredit } from '../src/publisher-credits'
import { snapshotName } from '../src/snapshot'
import { SOURCE_PHOTO_LICENCE } from '../src/source-photos'

// Made-up names and pages only: a test never holds a real photographer's (the chief of staff, 17 Nov 2026).
const lines = (...l: string[]) => l

test('the credit after a caption is the line as printed: a name, a handle, a person with an organisation, after a copyright sign or not', () => {
  expect(tiedCredit('Adult male', lines('Adult male Ann Example'))).toEqual({ name: 'Ann Example' })
  expect(tiedCredit('Peat bogs are acidic', lines('Peat bogs are acidic © Bo Sample'))).toEqual({ name: 'Bo Sample' })
  expect(tiedCredit('Wild form.', lines('Wild form.. © C. D. Sample et al.'))).toEqual({ name: 'C. D. Sample et al.' })
  expect(tiedCredit('Juvenile.', lines('Juvenile.Examplehandle'))).toEqual({ name: 'Examplehandle' })
  expect(tiedCredit('Juvenile.', lines('Juvenile.4242'))).toEqual({ name: '4242' })
  expect(tiedCredit('Female', lines('Female Ann Example/example.org'))).toEqual({ name: 'Ann Example/example.org' })
  expect(tiedCredit('Female', lines('Female Ann van der Sample'))).toEqual({ name: 'Ann van der Sample' })
  // The caption is the first words of a longer one: the name is still what follows the sign.
  expect(tiedCredit('A pond', lines('A pond near Sampletown, after the rains © Ann Example'))).toEqual({ name: 'Ann Example' })
  // The same name twice is one credit.
  expect(creditAfter(' © Ann Example © Ann Example')).toEqual({ name: 'Ann Example' })
})

test("a photo whose line can't be told for certain keeps its publisher's name alone, with why", () => {
  // A caption that is only the fish's name, and a paragraph of the page that opens with it: not a credit.
  expect(tiedCredit('Examplia sampla', lines('Examplia sampla is a small cichlid from Sampletown. It lives in still water.'))).toEqual({ why: 'not a credit' })
  expect(tiedCredit('Examplia sampla', lines('Examplia sampla lives among sedges'))).toEqual({ why: 'not a credit' })
  // One more word of the caption in lower case reads as the caption going on, not as a handle.
  expect(tiedCredit('Male', lines('Male specimen'))).toEqual({ why: 'not a credit' })
  expect(tiedCredit('Male', lines('Male Ann Example', 'Male Bo Sample'))).toEqual({ why: 'two lines for its caption' })
  expect(tiedCredit('Pair', lines('Pair © Ann Example © Bo Sample'))).toEqual({ why: 'two credits in its line' })
  expect(tiedCredit('Pair', lines('Pair'))).toEqual({ why: 'caption not in the stored copy' })
  expect(tiedCredit('', lines('Ann Example'))).toEqual({ why: 'no caption' })
  expect(tiedCredit('x'.repeat(200), lines(`${'x'.repeat(200)} Ann Example`))).toEqual({ why: 'caption cut' })
  expect(tiedCredit('Pair', undefined)).toEqual({ why: 'no stored copy' })
})

const page = 'https://www.seriouslyfish.example/species/examplia-sampla/'
const photo = (n: number, caption?: string, author = 'Seriously Fish') => ({ url: `https://media.aquatome.com/seriouslyfish/${n}.webp`, width: 800, height: 600, licence: SOURCE_PHOTO_LICENCE, author, sourceUrl: page, ...(caption ? { caption } : {}), source: 'seriouslyfish' })

test("every photo credited to Seriously Fish alone gets its photographer from the page's stored copy, on pages, albums and the glossary, and nothing else in a file changes", async () => {
  const root = await mkdtemp(join(tmpdir(), 'pc-'))
  const at = (...p: string[]) => join(root, ...p)
  for (const d of [['content', 'species', 'examplia-sampla'], ['content', 'gallery'], ['content', 'glossary', 'la-kho'], ['sources', 'seriouslyfish']]) await mkdir(at(...d), { recursive: true })
  await writeFile(at('content', 'sources.json'), JSON.stringify({ seriouslyfish: { name: 'Seriously Fish' }, commons: { name: 'Wikimedia Commons' } }))
  await writeFile(at('sources', 'seriouslyfish', `${snapshotName(page)}.md`), ['---', `url: ${page}`, '---', '', 'Examplia sampla is a fish of Sampletown. It lives in still water.', 'Adult male Ann Example', 'Female © Bo Sample', 'Pair Ann Example', 'Pair Bo Sample'].join('\n'))
  const entity = { id: 'examplia-sampla', photos: [
    photo(1, 'Adult male'),
    photo(2, 'Female'),
    photo(3, 'Pair'), // two lines for one caption
    photo(4, 'Examplia sampla'), // the page's own text, not a credit
    photo(5, 'Adult male', 'Cy Sample / Seriously Fish'), // already named
    { ...photo(6, 'Adult male'), source: undefined, author: 'Wikimedia Commons', licence: 'CC BY 4.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg' },
  ] }
  const entityRaw = `${JSON.stringify(entity, null, 2)}\n`
  await writeFile(at('content', 'species', 'examplia-sampla', 'entity.json'), entityRaw)
  // The album's copy of the first photo has no caption: it takes the line its page's copy ties to.
  await writeFile(at('content', 'gallery', 'examplia-sampla.json'), `${JSON.stringify({ id: 'examplia-sampla', photos: [photo(1), photo(7, 'Female')] }, null, 2)}\n`)
  await writeFile(at('content', 'glossary', 'la-kho', 'entity.json'), `${JSON.stringify({ id: 'la-kho', kinds: [{ photo: photo(2, 'Female') }] }, null, 2)}\n`)

  const r = await namePublisherCredits(root)
  expect(r.named).toEqual({ seriouslyfish: 5 })
  expect(r.files).toBe(3)
  const after = await readFile(at('content', 'species', 'examplia-sampla', 'entity.json'), 'utf8')
  expect(JSON.parse(after).photos.map((p: { author: string }) => p.author)).toEqual(['Ann Example / Seriously Fish', 'Bo Sample / Seriously Fish', 'Seriously Fish', 'Seriously Fish', 'Cy Sample / Seriously Fish', 'Wikimedia Commons'])
  // Only the two credit lines changed.
  expect(after).toBe(entityRaw.replace('"author": "Seriously Fish"', '"author": "Ann Example / Seriously Fish"').replace('"author": "Seriously Fish"', '"author": "Bo Sample / Seriously Fish"'))
  expect(JSON.parse(await readFile(at('content', 'gallery', 'examplia-sampla.json'), 'utf8')).photos.map((p: { author: string }) => p.author)).toEqual(['Ann Example / Seriously Fish', 'Bo Sample / Seriously Fish'])
  expect(JSON.parse(await readFile(at('content', 'glossary', 'la-kho', 'entity.json'), 'utf8')).kinds[0].photo.author).toBe('Bo Sample / Seriously Fish')
  // The ones left are listed by file, address and why, and no name.
  expect(r.untied).toEqual([
    { file: join('content', 'species', 'examplia-sampla', 'entity.json'), url: photo(3).url, why: 'two lines for its caption' },
    { file: join('content', 'species', 'examplia-sampla', 'entity.json'), url: photo(4).url, why: 'not a credit' },
  ])
  // Run again: nothing left to name, and the files stay as they are.
  expect(await namePublisherCredits(root)).toEqual({ named: {}, files: 0, untied: r.untied })
  expect(await readFile(at('content', 'species', 'examplia-sampla', 'entity.json'), 'utf8')).toBe(after)
})

test('one picture is credited one way wherever it is: copies that tie to different lines keep the publisher alone', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pc-'))
  const at = (...p: string[]) => join(root, ...p)
  for (const d of [['content', 'species', 'a'], ['content', 'gallery'], ['sources', 'seriouslyfish']]) await mkdir(at(...d), { recursive: true })
  await writeFile(at('content', 'sources.json'), JSON.stringify({ seriouslyfish: { name: 'Seriously Fish' } }))
  await writeFile(at('sources', 'seriouslyfish', `${snapshotName(page)}.md`), ['---', `url: ${page}`, '---', 'Male Ann Example', 'Male in colour Bo Sample', 'Female Cy Sample', 'Spawning Dee Sample'].join('\n'))
  await writeFile(at('content', 'species', 'a', 'entity.json'), `${JSON.stringify({ photos: [photo(1, 'Male in colour'), photo(3, 'Female')] }, null, 2)}\n`)
  // "Male" alone starts two lines, so the album's copy of photo 1 can't tie by itself: it takes its page copy's line.
  // Photo 3's two copies tie to two different lines: both keep the publisher alone.
  await writeFile(at('content', 'gallery', 'a.json'), `${JSON.stringify({ photos: [photo(1, 'Male'), photo(2, 'Male'), photo(3, 'Spawning')] }, null, 2)}\n`)
  const r = await namePublisherCredits(root)
  expect(r.named).toEqual({ seriouslyfish: 2 })
  expect(JSON.parse(await readFile(at('content', 'gallery', 'a.json'), 'utf8')).photos.map((p: { author: string }) => p.author)).toEqual(['Bo Sample / Seriously Fish', 'Seriously Fish', 'Seriously Fish'])
  expect(JSON.parse(await readFile(at('content', 'species', 'a', 'entity.json'), 'utf8')).photos.map((p: { author: string }) => p.author)).toEqual(['Bo Sample / Seriously Fish', 'Seriously Fish'])
  expect(r.untied).toEqual([
    { file: join('content', 'species', 'a', 'entity.json'), url: photo(3).url, why: 'two lines across its copies' },
    { file: join('content', 'gallery', 'a.json'), url: photo(2).url, why: 'two lines for its caption' },
    { file: join('content', 'gallery', 'a.json'), url: photo(3).url, why: 'two lines across its copies' },
  ])
})
