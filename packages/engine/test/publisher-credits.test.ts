import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { creditAfter, creditCounts, namePictureLines, namePublisherCredits, pageCredit, PAGE_CREDITS, pictureCredit, tiedCredit } from '../src/publisher-credits'
import { snapshotName } from '../src/snapshot'
import { SOURCE_PHOTO_LICENCE } from '../src/source-photos'

// Made-up names and pages only: a test never holds a real photographer's (the chief of staff, 17 Nov 2026).
// Seriously Fish's stored copy prints a credit without a copyright sign right after its caption, with no space between
// ("Adult maleAnn Example"), as every such line on main did on 19 Nov; the lines here are written that way.
const lines = (...l: string[]) => l

test('the credit after a caption is the line as printed: a name, a handle, a person with an organisation, after a copyright sign or not', () => {
  expect(tiedCredit('Adult male', lines('Adult maleAnn Example'))).toEqual({ name: 'Ann Example' })
  expect(tiedCredit('Peat bogs are acidic', lines('Peat bogs are acidic © Bo Sample'))).toEqual({ name: 'Bo Sample' })
  expect(tiedCredit('Wild form.', lines('Wild form.. © C. D. Sample et al.'))).toEqual({ name: 'C. D. Sample et al.' })
  expect(tiedCredit('Juvenile.', lines('Juvenile.Examplehandle'))).toEqual({ name: 'Examplehandle' })
  expect(tiedCredit('Juvenile.', lines('Juvenile.4242'))).toEqual({ name: '4242' })
  expect(tiedCredit('Female', lines('FemaleAnn Example/example.org'))).toEqual({ name: 'Ann Example/example.org' })
  expect(tiedCredit('Female', lines('FemaleAnn van der Sample'))).toEqual({ name: 'Ann van der Sample' })
  // The same name twice is one credit.
  expect(creditAfter(' © Ann Example © Ann Example')).toEqual({ name: 'Ann Example' })
})

test("a photo whose line can't be told for certain keeps its publisher's name alone, with why", () => {
  // A caption that is only the fish's name, and a paragraph of the page that opens with it: not a credit.
  expect(tiedCredit('Examplia sampla', lines('Examplia sampla is a small cichlid from Sampletown. It lives in still water.'))).toEqual({ why: 'not a credit' })
  expect(tiedCredit('Examplia sampla', lines('Examplia sampla lives among sedges'))).toEqual({ why: 'not a credit' })
  // One more word of the caption in lower case reads as the caption going on, not as a handle.
  expect(tiedCredit('Male', lines('Male specimen'))).toEqual({ why: 'not a credit' })
  expect(tiedCredit('Male', lines('MaleAnn Example', 'MaleBo Sample'))).toEqual({ why: 'two lines for its caption' })
  // A caption that is the first words of another picture's longer one doesn't take that picture's credit, with a sign
  // or without one (where the credit would follow the caption with no space).
  expect(tiedCredit('Male', lines('Male in colour © Bo Sample'))).toEqual({ why: 'not a credit' })
  expect(tiedCredit('A pond', lines('A pond near Sampletown, after the rains © Ann Example'))).toEqual({ why: 'not a credit' })
  expect(tiedCredit('Male', lines('Male JuvenileAnn Example'))).toEqual({ why: 'not a credit' })
  // The caption alone on a line is another picture's caption or this one's with its credit elsewhere: either, so neither.
  expect(tiedCredit('Male', lines('Male', 'MaleAnn Example'))).toEqual({ why: 'two lines for its caption' })
  // A sentence of the page is not a credit, its full stop at the end or not; a paper's authors with "et al." are.
  expect(tiedCredit('Examplia sampla', lines('Examplia samplaThese fish swim together.'))).toEqual({ why: 'not a credit' })
  expect(tiedCredit('Examplia sampla', lines('Examplia samplaThese fish swim together!'))).toEqual({ why: 'not a credit' })
  expect(tiedCredit('Pair', lines('PairAnn Example et al.'))).toEqual({ name: 'Ann Example et al.' })
  expect(tiedCredit('Pair', lines('PairAnn Example.'))).toEqual({ name: 'Ann Example.' })
  expect(tiedCredit('Pair', lines('PairAnn van der Example.'))).toEqual({ name: 'Ann van der Example.' })
  expect(tiedCredit('Pair', lines('PairAnn Le A.B.'))).toEqual({ name: 'Ann Le A.B.' })
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
  await writeFile(at('sources', 'seriouslyfish', `${snapshotName(page)}.md`), ['---', `url: ${page}`, '---', '', 'Examplia sampla is a fish of Sampletown. It lives in still water.', 'Adult maleAnn Example', 'Female © Bo Sample', 'PairAnn Example', 'PairBo Sample'].join('\n'))
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
  await writeFile(at('sources', 'seriouslyfish', `${snapshotName(page)}.md`), ['---', `url: ${page}`, '---', 'MaleAnn Example', 'Male in colourBo Sample', 'FemaleCy Sample', 'SpawningDee Sample'].join('\n'))
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

test('a copy already named counts among its picture\'s copies: one that ties to another line keeps the publisher alone, and one with no caption takes the name', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pc-'))
  const at = (...p: string[]) => join(root, ...p)
  for (const d of [['content', 'species', 'a'], ['content', 'gallery'], ['sources', 'seriouslyfish']]) await mkdir(at(...d), { recursive: true })
  await writeFile(at('content', 'sources.json'), JSON.stringify({ seriouslyfish: { name: 'Seriously Fish' } }))
  await writeFile(at('sources', 'seriouslyfish', `${snapshotName(page)}.md`), ['---', `url: ${page}`, '---', 'Adult maleAnn Example'].join('\n'))
  // The page's copies are named already, in a file with no photo credited to the publisher alone.
  await writeFile(at('content', 'species', 'a', 'entity.json'), `${JSON.stringify({ photos: [photo(1, 'Adult male', 'Cy Sample / Seriously Fish'), photo(2, 'Adult male', 'Cy Sample / Seriously Fish')] }, null, 2)}\n`)
  await writeFile(at('content', 'gallery', 'a.json'), `${JSON.stringify({ photos: [photo(1, 'Adult male'), photo(2)] }, null, 2)}\n`)
  const r = await namePublisherCredits(root)
  expect(JSON.parse(await readFile(at('content', 'gallery', 'a.json'), 'utf8')).photos.map((p: { author: string }) => p.author)).toEqual(['Seriously Fish', 'Cy Sample / Seriously Fish'])
  expect(r.named).toEqual({ seriouslyfish: 1 })
  expect(r.untied).toEqual([{ file: join('content', 'gallery', 'a.json'), url: photo(1).url, why: 'two lines across its copies' }])
  expect(JSON.parse(await readFile(at('content', 'species', 'a', 'entity.json'), 'utf8')).photos.map((p: { author: string }) => p.author)).toEqual(['Cy Sample / Seriously Fish', 'Cy Sample / Seriously Fish'])
})

// Aquarium Glaser prints one line for every picture on a page ("Text & photos: <name>"): the chief of staff, 17 Nov 2026.
const GLASER = PAGE_CREDITS.glaser!

test("a page-wide line names every photo from its page, one person and nothing more; else the publisher alone, with why", () => {
  expect(pageCredit('Male', lines('Examplia sampla is from Sampletown.', 'Text & photos: Ann Example'), GLASER)).toEqual({ name: 'Ann Example' })
  expect(pageCredit(undefined, lines('For sale to the trade. Text & Photos: Ann van der Example.'), GLASER)).toEqual({ name: 'Ann van der Example' })
  // The same line twice is one; two people's lines on one page, or one line naming two, are neither's.
  expect(pageCredit('Male', lines('Text & photos: Ann Example', 'Text and photos: Ann Example'), GLASER)).toEqual({ name: 'Ann Example' })
  expect(pageCredit('Male', lines('Text & photos: Ann Example', 'Text & photo: Bo Sample'), GLASER)).toEqual({ why: 'two lines for its page' })
  expect(pageCredit('Male', lines('Text & photos: Ann Example & Bo Sample'), GLASER)).toEqual({ why: 'more than one person' })
  expect(pageCredit('Male', lines('Text & photos: Ann Example and Bo Sample'), GLASER)).toEqual({ why: 'more than one person' })
  // A line that goes on past the name is not a credit.
  expect(pageCredit('Male', lines('Text & photos: Ann Example from Sample 7, updated 4/2009'), GLASER)).toEqual({ why: 'not a credit' })
  expect(pageCredit('Male', lines('Text & photos: Ann Example …and please visit our homepage'), GLASER)).toEqual({ why: 'not a credit' })
  // A photo whose own caption prints another credit keeps the publisher alone; its own credit that is the line's person doesn't.
  expect(pageCredit('Male, photo: Bo Sample', lines('Text & photos: Ann Example'), GLASER)).toEqual({ why: 'its own line differs' })
  expect(pageCredit('Male © Ann Example', lines('Text & photos: Ann Example'), GLASER)).toEqual({ name: 'Ann Example' })
  expect(pageCredit('Male', lines('Examplia sampla is from Sampletown.'), GLASER)).toEqual({ why: 'no line for its page' })
  expect(pageCredit('Male', undefined, GLASER)).toEqual({ why: 'no stored copy' })
})

test("the sweep names every photo from Aquarium Glaser's pages by the page's line, and lists the ones its guard keeps alone", async () => {
  const root = await mkdtemp(join(tmpdir(), 'pc-'))
  const at = (...p: string[]) => join(root, ...p)
  const one = 'https://www.aquarium-glaser.example/en/fish/examplia-sampla/', two = 'https://www.aquarium-glaser.example/en/fish/examplia-duo/'
  for (const d of [['content', 'species', 'a'], ['content', 'gallery'], ['sources', 'glaser']]) await mkdir(at(...d), { recursive: true })
  await writeFile(at('content', 'sources.json'), JSON.stringify({ glaser: { name: 'Aquarium Glaser' } }))
  await writeFile(at('sources', 'glaser', `${snapshotName(one)}.md`), ['---', `url: ${one}`, '---', 'Examplia sampla lives near Sampletown.', 'Text & photos: Ann Example'].join('\n'))
  await writeFile(at('sources', 'glaser', `${snapshotName(two)}.md`), ['---', `url: ${two}`, '---', 'Text & photos: Ann Example & Bo Sample'].join('\n'))
  const g = (n: number, sourceUrl: string, caption?: string) => ({ url: `https://media.aquatome.com/glaser/${n}.webp`, width: 800, height: 600, licence: SOURCE_PHOTO_LICENCE, author: 'Aquarium Glaser', source: 'glaser', sourceUrl, ...(caption ? { caption } : {}) })
  await writeFile(at('content', 'species', 'a', 'entity.json'), `${JSON.stringify({ photos: [g(1, one, 'Male'), g(2, two, 'Pair')] }, null, 2)}\n`)
  await writeFile(at('content', 'gallery', 'a.json'), `${JSON.stringify({ photos: [g(1, one), g(3, one, 'Female'), g(4, one, 'Juvenile, photo: Bo Sample')] }, null, 2)}\n`)
  const r = await namePublisherCredits(root)
  expect(r.named).toEqual({ glaser: 3 })
  expect(JSON.parse(await readFile(at('content', 'species', 'a', 'entity.json'), 'utf8')).photos.map((p: { author: string }) => p.author)).toEqual(['Ann Example / Aquarium Glaser', 'Aquarium Glaser'])
  expect(JSON.parse(await readFile(at('content', 'gallery', 'a.json'), 'utf8')).photos.map((p: { author: string }) => p.author)).toEqual(['Ann Example / Aquarium Glaser', 'Ann Example / Aquarium Glaser', 'Aquarium Glaser'])
  expect(r.untied).toEqual([
    { file: join('content', 'species', 'a', 'entity.json'), url: g(2, two).url, why: 'more than one person' },
    { file: join('content', 'gallery', 'a.json'), url: g(4, one).url, why: 'its own line differs' },
  ])
  expect(await creditCounts(root)).toEqual({ glaser: { named: 3, alone: 2 } })
})

test("a picture's line, as its page prints it, names the photo: the publisher's own photographer by the name after the slash; none for an agency, the publisher alone or a sentence", () => {
  const terms = { refusedCredits: ['Example Pictures'] }
  expect(pictureCredit('Ann Example', 'Seriously Fish')).toBe('Ann Example')
  expect(pictureCredit('Photo: Ann Example', 'Seriously Fish')).toBe('Ann Example')
  expect(pictureCredit('The Example / Ann Example', 'The Example Pets')).toBe('Ann Example')
  expect(pictureCredit('Ann Example/example.org', 'Seriously Fish')).toBe('Ann Example/example.org')
  expect(pictureCredit('Credit: The Example Pets', 'The Example Pets')).toBeUndefined()
  expect(pictureCredit('Example Pictures', 'The Example Pets', terms)).toBeUndefined()
  expect(pictureCredit('these fish swim together.', 'Seriously Fish')).toBeUndefined()
  expect(pictureCredit(undefined, 'Seriously Fish')).toBeUndefined()
})

test("a read page's pictures name our photos credited to its publisher alone, wherever they are; a picture whose copies print two lines names none", async () => {
  const root = await mkdtemp(join(tmpdir(), 'pc-'))
  const at = (...p: string[]) => join(root, ...p)
  for (const d of [['content', 'species', 'a'], ['content', 'gallery']]) await mkdir(at(...d), { recursive: true })
  const read = 'https://www.example.org/fish/examplia-sampla/'
  const urlFor = (k: string) => `https://media.aquatome.com/${k}`
  const ours = (src: string, author = 'The Example Pets') => ({ url: urlFor(`sprucepets/${src}`), width: 800, height: 600, licence: SOURCE_PHOTO_LICENCE, author, source: 'sprucepets', sourceUrl: read })
  const { photoKey } = await import('../src/source-photos')
  const key = (src: string) => photoKey('sprucepets', `https://www.example.org/img/${src}`).replace('sprucepets/', '')
  await writeFile(at('content', 'species', 'a', 'entity.json'), `${JSON.stringify({ photos: [ours(key('a.jpg')), ours(key('b.jpg')), ours(key('c.jpg'), 'Cy Sample / The Example Pets')] }, null, 2)}\n`)
  const original = ours(key('a.jpg'))
  const wrapper = { ...original, url: urlFor('sprucepets/alteration.webp'), altered: [{ method: 'lanczos3-upscale' }],
    original: { url: original.url, width: original.width, height: original.height } }
  await writeFile(at('content', 'gallery', 'a.json'), `${JSON.stringify({ photos: [wrapper] }, null, 2)}\n`)
  const images = [
    { src: '/img/a.jpg', alt: 'a', credit: 'The Example / Ann Example' },
    { src: '/img/b.jpg', alt: 'b', credit: 'Bo Sample' },
    { src: '/img/b-300x200.jpg', alt: 'b', credit: 'Di Sample' },
    { src: '/img/c.jpg', alt: 'c', credit: 'Ann Example' },
  ]
  expect(await namePictureLines(root, 'sprucepets', 'The Example Pets', images, read, urlFor)).toBe(2)
  expect(JSON.parse(await readFile(at('content', 'species', 'a', 'entity.json'), 'utf8')).photos.map((p: { author: string }) => p.author)).toEqual(['Ann Example / The Example Pets', 'The Example Pets', 'Cy Sample / The Example Pets'])
  expect(JSON.parse(await readFile(at('content', 'gallery', 'a.json'), 'utf8')).photos[0].author).toBe('Ann Example / The Example Pets')
})

test("a copy that shows another credit, or a line the guard refuses, keeps every copy of its photo with the publisher alone", async () => {
  // Found in Codex's read, 20 Nov 2026: an album copy with no caption took the page's line though the page's copy of the
  // same photo printed another credit.
  const root = await mkdtemp(join(tmpdir(), 'pc-'))
  const at = (...p: string[]) => join(root, ...p)
  const one = 'https://www.aquarium-glaser.example/en/fish/examplia-sampla/', two = 'https://www.aquarium-glaser.example/en/fish/examplia-duo/'
  for (const d of [['content', 'species', 'a'], ['content', 'gallery'], ['sources', 'glaser']]) await mkdir(at(...d), { recursive: true })
  await writeFile(at('content', 'sources.json'), JSON.stringify({ glaser: { name: 'Aquarium Glaser' } }))
  await writeFile(at('sources', 'glaser', `${snapshotName(one)}.md`), ['---', `url: ${one}`, '---', 'Text & photos: Ann Example'].join('\n'))
  await writeFile(at('sources', 'glaser', `${snapshotName(two)}.md`), ['---', `url: ${two}`, '---', 'Text & photos: Ann Example & Bo Sample'].join('\n'))
  const g = (n: number, sourceUrl: string, caption?: string) => ({ url: `https://media.aquatome.com/glaser/${n}.webp`, width: 800, height: 600, licence: SOURCE_PHOTO_LICENCE, author: 'Aquarium Glaser', source: 'glaser', sourceUrl, ...(caption ? { caption } : {}) })
  // Photo 1: the page's copy prints another credit, the album's copy has no caption. Photo 2: one copy from a page whose
  // line names two people, one from a page whose line names one. Photo 3: no conflict anywhere, named.
  const original = g(4, one)
  const named = { ...original, author: 'Bo Sample / Aquarium Glaser' }
  const wrapper = { ...original, url: 'https://media.aquatome.com/glaser/alteration.webp', altered: [{ method: 'lanczos3-upscale' }],
    original: { url: original.url, width: original.width, height: original.height } }
  await writeFile(at('content', 'species', 'a', 'entity.json'), `${JSON.stringify({ photos: [g(1, one, 'Male, photo: Bo Sample'), g(2, two), g(3, one, 'Female'), named] }, null, 2)}\n`)
  await writeFile(at('content', 'gallery', 'a.json'), `${JSON.stringify({ photos: [g(1, one), g(2, one), g(3, one), wrapper] }, null, 2)}\n`)
  const r = await namePublisherCredits(root)
  expect(r.named).toEqual({ glaser: 2 })
  expect(JSON.parse(await readFile(at('content', 'species', 'a', 'entity.json'), 'utf8')).photos.map((p: { author: string }) => p.author)).toEqual(['Aquarium Glaser', 'Aquarium Glaser', 'Ann Example / Aquarium Glaser', named.author])
  expect(JSON.parse(await readFile(at('content', 'gallery', 'a.json'), 'utf8')).photos.map((p: { author: string }) => p.author)).toEqual(['Aquarium Glaser', 'Aquarium Glaser', 'Ann Example / Aquarium Glaser', 'Aquarium Glaser'])
  expect(r.untied).toEqual([
    { file: join('content', 'species', 'a', 'entity.json'), url: g(1, one).url, why: 'its own line differs' },
    { file: join('content', 'species', 'a', 'entity.json'), url: g(2, one).url, why: 'more than one person' },
    { file: join('content', 'gallery', 'a.json'), url: g(1, one).url, why: 'its own line differs' },
    { file: join('content', 'gallery', 'a.json'), url: g(2, one).url, why: 'more than one person' },
    { file: join('content', 'gallery', 'a.json'), url: wrapper.url, why: 'two lines across its copies' },
  ])
})

test("a read page's line doesn't name a photo whose copy is named already by another line: its copies credited to the publisher alone stay so", async () => {
  // Found in Codex's read, 20 Nov 2026.
  const root = await mkdtemp(join(tmpdir(), 'pc-'))
  const at = (...p: string[]) => join(root, ...p)
  for (const d of [['content', 'species', 'a'], ['content', 'gallery']]) await mkdir(at(...d), { recursive: true })
  const read = 'https://www.example.org/fish/examplia-sampla/'
  const urlFor = (k: string) => `https://media.aquatome.com/${k}`
  const { photoKey } = await import('../src/source-photos')
  const ours = (src: string, author = 'The Example Pets') => ({ url: urlFor(photoKey('sprucepets', `https://www.example.org/img/${src}`)), width: 800, height: 600, licence: SOURCE_PHOTO_LICENCE, author, source: 'sprucepets', sourceUrl: read })
  await writeFile(at('content', 'species', 'a', 'entity.json'), `${JSON.stringify({ photos: [ours('c.jpg', 'Cy Sample / The Example Pets'), ours('d.jpg', 'Ann Example / The Example Pets')] }, null, 2)}\n`)
  await writeFile(at('content', 'gallery', 'a.json'), `${JSON.stringify({ photos: [ours('c.jpg'), ours('d.jpg')] }, null, 2)}\n`)
  const images = [{ src: '/img/c.jpg', alt: 'c', credit: 'Ann Example' }, { src: '/img/d.jpg', alt: 'd', credit: 'Ann Example' }]
  expect(await namePictureLines(root, 'sprucepets', 'The Example Pets', images, read, urlFor)).toBe(1)
  expect(JSON.parse(await readFile(at('content', 'gallery', 'a.json'), 'utf8')).photos.map((p: { author: string }) => p.author)).toEqual(['The Example Pets', 'Ann Example / The Example Pets'])
  expect(JSON.parse(await readFile(at('content', 'species', 'a', 'entity.json'), 'utf8')).photos.map((p: { author: string }) => p.author)).toEqual(['Cy Sample / The Example Pets', 'Ann Example / The Example Pets'])
})
