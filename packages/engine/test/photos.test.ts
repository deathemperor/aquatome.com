import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { findPhotos, searchCommons, unfitCommons } from '../src/photos'
import { findVideos } from '../src/videos'

const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/commons/paracheirodon-axelrodi.json', import.meta.url), 'utf8'))

test('commons photos: open licences, ≥800px, plain-text author, 960px thumbs, max 4', async () => {
  const data = fixture()
  const first = Object.values(data.query.pages as Record<string, { index: number; imageinfo: { extmetadata: Record<string, { value: string }> }[] }>).sort((a, b) => a.index - b.index)[0]!
  first.imageinfo[0]!.extmetadata.LicenseShortName = { value: 'CC BY-NC-SA 4.0' }
  let url = ''
  const photos = await findPhotos('Paracheirodon axelrodi', async u => { url = u; return data })
  expect(url).toContain('Paracheirodon%20axelrodi')
  expect(photos).toHaveLength(4)
  for (const p of photos) {
    expect(p.width).toBeLessThanOrEqual(960)
    expect(p.author).not.toMatch(/[<>]/)
    expect(p.licence).not.toMatch(/NC/)
    expect(p.sourceUrl).toMatch(/^https:\/\/commons\.wikimedia\.org\/wiki\/File:/)
    expect(p.url).toMatch(/960px/)
  }
  expect(photos.map(p => p.sourceUrl)).not.toContain(expect.stringContaining('Cardinal_Tetra_2.jpg')) // 656px original
})

test('videos are skipped without an API key', async () => {
  let called = false
  expect(await findVideos(['Paracheirodon axelrodi'], async () => { called = true; return {} as never }, async () => { called = true; return {} })).toEqual([])
  expect(called).toBe(false)
})

test('videos: youtube search vetted by the llm', async () => {
  const http = async (u: string) => u.includes('/search')
    ? { items: [{ id: { videoId: 'aaaaaaaaaaa' } }, { id: { videoId: 'bbbbbbbbbbb' } }] }
    : { items: [
      { id: 'aaaaaaaaaaa', snippet: { title: 'Cardinal tetra care', description: 'x', defaultAudioLanguage: 'en' }, contentDetails: { duration: 'PT5M3S' } },
      { id: 'bbbbbbbbbbb', snippet: { title: 'Funny cats', description: 'y' }, contentDetails: { duration: 'PT1H' } },
    ] }
  const llm = async <T,>() => ({ keep: ['aaaaaaaaaaa'] }) as T
  expect(await findVideos(['Paracheirodon axelrodi', 'Cardinal tetra'], llm, http, { apiKey: 'KEY' })).toEqual([{ youtubeId: 'aaaaaaaaaaa', title: 'Cardinal tetra care', durationSec: 303, lang: 'en' }])
  // A rejected video (engine-state/_video-rejected.json) is never picked, even when the model would keep it.
  expect(await findVideos(['Paracheirodon axelrodi'], llm, http, { apiKey: 'KEY', skip: { aaaaaaaaaaa: 'dead: a fish on a ruler' } })).toEqual([])
})

/** The Java barb's Commons search (2026-11-07), in its order: what each file's own title, description and categories say. */
const JAVA_BARB: [string, string, string][] = [
  ['File:Barbonymus gonionotus Bleeker.jpg', 'Barbonymus gonionotus', "Barbonymus gonionotus|Cyprinidae illustrations|Illustrations of fish in Pieter Bleeker's publications"],
  ['File:Barbon gonion 120127-22830 tsm.JPG', 'Tawes (<i>Barbonymus gonionotus</i>), 178mm SL;  from Tasikmalaya, West <a href="//commons.wikimedia.org/wiki/Java">Java</a>, Indonesia.', 'Barbonymus gonionotus|Taken with Nikon D5000|Self-published work'],
  ['File:Barbonymus gonionotus-Pla som861.jpg', 'Deep fried chunk of pickled (Pla som) Barbonymus gonionotus (Pla Taphian)', 'Barbonymus gonionotus|Self-published work|Fried fish in Thailand|Pickled fish'],
  ['File:Barb gonio 080525 9625 ltn.jpg', '<i>Barbonymus gonionotus</i> (122mm SL). From Cisadane River. <b>errata</b>: Misidentified, it should be <i>Mystacoleucus marginatus</i>', 'Mystacoleucus marginatus|GFDL|Taken with Nikon D40'],
  ['File:Java Barb fish waghor aquarium.jpg', 'Barbonymus gonionotus', 'Indonesia|Self-published work'],
  ['File:Barbonymus gonionotus - Yung-Lun Lin - 586219398.jpeg', 'Barbonymus gonionotus, 741台灣臺南市善化區, 2025-10-29 (iNaturalist).', 'Barbonymus gonionotus|Media from iNaturalist|INaturalist images reviewed by iNaturalistReviewBot'],
]
const javaBarbSearch = () => ({ query: { pages: Object.fromEntries(JAVA_BARB.map(([title, description, categories], i) => [String(i), { index: i + 1, title, imageinfo: [{
  width: 2000, thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${title.slice(5).replaceAll(' ', '_')}/960px-${title.slice(5).replaceAll(' ', '_')}`, thumbwidth: 960, thumbheight: 640,
  descriptionurl: `https://commons.wikimedia.org/wiki/${title.replaceAll(' ', '_')}`,
  extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: 'A' }, ImageDescription: { value: description }, Categories: { value: categories } },
}] }])) } })

test("the Commons fallback skips a file whose own words say it is no living fish: a drawing, food, another species (the Java barb's page, 2026-11-07)", async () => {
  let url = ''
  const photos = await findPhotos('Barbonymus gonionotus', async u => { url = u; return javaBarbSearch() })
  expect(decodeURIComponent(url)).toContain('iiextmetadatafilter=LicenseShortName|Artist|ImageDescription|Categories')
  expect(photos.map(p => p.sourceUrl.split('File:')[1])).toEqual(['Barbon_gonion_120127-22830_tsm.JPG', 'Java_Barb_fish_waghor_aquarium.jpg', 'Barbonymus_gonionotus_-_Yung-Lun_Lin_-_586219398.jpeg'])
  // A photo rejected before (the fish out of water, which only a look tells), known by its copy in our bucket, is skipped too.
  const again = await findPhotos('Barbonymus gonionotus', async () => javaBarbSearch(), 4, { 'https://media.aquatome.com/commons/de8e68efd9c54797.webp': 'dead: a fish lying out of water on a bag' })
  expect(again.map(p => p.sourceUrl.split('File:')[1])).toEqual(['Java_Barb_fish_waghor_aquarium.jpg', 'Barbonymus_gonionotus_-_Yung-Lun_Lin_-_586219398.jpeg'])
  // A guide's picture search keeps them: a guide may show lettuce for the fish.
  expect(await searchCommons('"Barbonymus gonionotus"', async () => javaBarbSearch(), 6)).toHaveLength(6)
})

test('what a Commons file says it is: art, a chart, dead or food, another species; and words that are none of them', () => {
  expect(JAVA_BARB.map(([title, description, categories]) => unfitCommons({ title, description, categories }))).toEqual([
    'drawing: illustrations', undefined, 'dead: Fried', 'other: errata', undefined, undefined,
  ])
  expect(unfitCommons({ title: 'File:Polyacanthus hasselti - 1700-1880 - Print - Iconographia Zoologica - UBA01 IZ13800005.tif' })).toBe('drawing: Iconographia')
  expect(unfitCommons({ title: 'File:The fishes of the Nile (Pl. LVII) (6961618931).jpg' })).toBe('drawing: Pl. LVII')
  expect(unfitCommons({ title: 'File:Glyptosternon reticulatum 2021 stamp of Kyrgyzstan.jpg' })).toBe('drawing: stamp')
  expect(unfitCommons({ title: 'File:Bunocephalus coracoideus (Tajapuru, Brazil, 22 August 1865).jpg', categories: 'PD US|1865 in art|Artworks without Wikidata item' })).toBe('drawing: in art')
  expect(unfitCommons({ title: 'File:The American Characidae (1917) (17930836210).jpg', description: 'Click here to view book online to see this illustration in context' })).toBe('drawing: view book online')
  expect(unfitCommons({ title: 'File:Betta range map.png' })).toBe('not a photo: map')
  expect(unfitCommons({ title: 'File:Chalceus macrolepidotus holotype (MNHN 2634).png' })).toBe('dead: holotype')
  expect(unfitCommons({ title: 'File:Heterotis niloticus MHNT ICHT 1995 69.jpg', categories: 'Taxidermy at Muséum de Toulouse' })).toBe('dead: Taxidermy')
  expect(unfitCommons({ title: 'File:Phalacronotus apogon1058.JPG', categories: 'Phalacronotus apogon|Fish markets in Thailand' })).toBe('dead: markets')
  expect(unfitCommons({ title: 'File:X.jpg', description: 'Misidentified: this is Puntius' })).toBe('other: Misidentified')
  // Live fish and plants, as Commons files them (the first sweep, 2026-11-07): none of these is unfit.
  for (const f of [
    { title: 'File:Painted betta.jpg' },
    { title: 'File:X.jpg', description: 'A fine specimen in my aquarium' },
    { title: 'File:Rasbora in Java.jpg', categories: 'Fish of Java|Aquaria' },
    { title: 'File:Giant Gourami.jpg', categories: 'Osphronemus goramy|Fishing in India|Self-published work' },
    { title: 'File:Monosolenium tenerum kz01.jpg', categories: 'Monosolenium tenerum|Specimens in the Botanischer Garten, Berlin-Dahlem' },
    { title: 'File:Wetmors Barbe (Hypsibarbus wetmorei) 1.jpg', categories: 'Hypsibarbus wetmorei|2009 in Aquazoo - Löbbecke Museum' },
    { title: 'File:Betta03.jpg', categories: 'Fish fins (white)|Betta splendens anatomy' },
    { title: 'File:Bedotia madagascariensis.png', description: 'Two males of Bedotia madagascariensis, male top right. Not preserved.' },
    { title: 'File:Corydoras panda 01.jpg', description: 'From my own aquarium breeding stock. Scan of print originally shot on 35 mm print film.' },
    { title: 'File:Tiger Oscar Fish.jpg', description: 'Astronotus ocellatus is a species of fish; in South America it is sold in local markets as food.' },
    { title: 'File:Taxonomy-01-00025-g006.png', description: 'Figure 6. Live specimens of the Microcambeva, including the holotype' },
    { title: 'File:Lepidoch hasselt 150222-48842 tdp.JPG', description: 'Lepidocephalichthys hasselti, ca 30 mm SL. From Banyumas, Central Java.' },
    { title: 'File:Koi Fish (62977227).jpeg', description: 'Koi fish are a common symbol in Chinese culture, depicted on artwork, clothing, tattoos and even with live fish.' },
    { title: 'File:Kammbuntbarsch.jpg', description: 'Kammbuntbarsch. This image has been originally created as the illustration for Meere Quiz at globalquiz.org.' },
  ]) expect(unfitCommons(f), f.title).toBeUndefined()
})
