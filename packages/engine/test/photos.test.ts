import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { findPhotos, paperFigure, searchCommons, unfitCommons } from '../src/photos'
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

// The files' own titles and the start of their descriptions, as Commons has them (authors' names left out).
const PLATES: [title: string, description: string, why: string][] = [
  // The owner's report, 2026-11-11: the only photo of Hemichromis elongatus.
  ['File:Parasite180080-Figure4 Compound micrographs of Cychlidogyrus spp. (Monogenea, Dactylogyridae).png', 'Figure 4 of paper Compound micrographs of (a–c) Cichlidogyrus bixlerzavalai n. sp. from Tylochromis praecox: haptor of holotype (a), MCO of holotype (b)', 'not a photo: micrographs'],
  ['File:Odontobutid otoliths.jpg', 'A–H, otoliths from the Chapelcorner Fish Beds, photos and interpretative drawings of right (A–B) and left (C–H) otoliths (sagittae) in medial view.', 'not a photo: otoliths'],
  ['File:Fossil ear stones.jpg', 'A–H, from the fish beds, photos and interpretative drawings of right (A–B) and left (C–H) ones in medial view.', "not a photo: a paper's plate, A–H"],
  ['File:Cosmetocleithrum leandroi (10.3897-zoologia.35.e23917) Figures 8–14.jpg', 'Figures 8–14; Cosmetocleithrum leandroi sp. nov.: (8) holotype whole-mount, ventral; (9) copulatory complex; (10) hook; (11) ventral bar', "not a photo: a paper's plate, (8), (9)"],
  ['File:Fish fauna from Río Pilcomayo National Park (7 of 7).png', 'Fish fauna from the Rio Pilcomayo National Park. Per the source, they are listed as:(73) Cichlasoma dimerus;(74) Crenicichla lepidota;(75) Crenicichla semifasciata', "not a photo: a paper's plate, (73), (74)"],
  ['File:Aquatic Biodiversity in the Amazon (1020205-f7).png', 'Examples of species collected only in the Alto Purús.(A) Cichlasoma boliviense, 79 mm.(B) Dianema longibarbis, 73 mm.(C) Pimelodus sp. 2, 112 mm.', "not a photo: a paper's plate, (a), (b)"],
  ['File:Actinopterygii in the Guareí River basin 04 (1676-0611-BN-2020-1031).jpg', '(a) Pimelodella gracilis 60.1 mm SL; (b) Rhamdia quelen, 47.6 mm SL; (c) Iheringichthys labrosus, 101.8 mm SL', "not a photo: a paper's plate, (a), (b)"],
  ['File:Trichomycterus (10.3390-taxonomy2040032) Figure 9.png', 'Figure 9. Head, dorsal view: (A) Trichomycterus goeldii, UFRJ 7938, 57.9 mm SL; (B) Trichomycterus auroguttatus, UFRJ 11675, 59.2 mm SL.', "not a photo: a paper's plate, (a), (b)"],
  // A page's photo keeps the first 200 characters of its description: "(b)" is past the cut.
  ['File:Notopterus notopterus (10.3897-zse.93.13341) Figure 12.jpg', 'Figure 12; Hatching process and the free embryonic stages in Notopterus notopterus. (a) Stage 24: just hatched-embryo after breaking the weak egg envelope, caudal part is relieved, anterior part still', "not a photo: a paper's plate, (a)"],
  ['File:Henicorhynchus (10.3897-zookeys.965.52751) Figure 5.jpg', 'Figure 5; Species most closely related to ‘Henicorhynchus’ thaitui sp. nov.: a Henicorhynchus lineatus b H. lobatus c H. ornatipinnis d H. siamensis e Cirrhinus jullieni', "not a photo: a paper's plate, a, b"],
  ['File:Ituglanis passensis (10.3897-subtbiol.31.60691) Figure 2.jpg', 'Figure 2; A Ituglanis passensis, newly laid eggs B newly hatched free-swimming larva, with visible eyes and melanophores C same, in zoom.', "not a photo: a paper's plate, a, b"],
  ['File:Aphaniidae (10.3897-zse.96.55837) Figure 8.jpg', 'Figure 8; Aphaniidae species of the northeastern Mediterranean Sea Basin of Turkey and Syria. a. Paraphanius alexandri, spring Çöçelli; b. P. boulengeri, Lake Gölbaşı; c. P. mento', "not a photo: a paper's plate, a, b"],
  ['File:Trematocranus (10.3897-zookeys.743.22814) Figure 6.jpg', 'Figure 6; Lower pharyngeal bones, dorsal view (left) and lateral view (right):A. Trematocranus pachychilus, paratype, 151.9 mm SL, Lake Malawi, Jafua Bay;B. T. microstoma', "not a photo: a paper's plate, a, b"],
  ['File:EB9 - Angling - Fig 27.png', 'Fig. 27.—The Tench.', 'drawing: EB9'],
]
// One plain photo of the living fish or plant each, on pages on 2026-11-11: four named as a figure, three that only look like it.
const FIGURES_OF_ONE: [title: string, description: string, figure: boolean][] = [
  ['File:Clarias leiacanthus (10.3897-BDJ.11.e100337) Figure 20.jpg', 'Figure 20 Clarias leiacanthus.', true],
  ['File:Pimelodella kronei (10.3897-subtbiol.19.8207) Figure 2 (cropped).jpg', 'Figure 2; Pimelodella kronei', true],
  ['File:Pseudohomaloptera leonardi (10.3897-BDJ.11.e100337) Figure 8.jpg', 'Figure 8 Pseudohomaloptera leonardi.', true],
  ['File:Fig. 06 Cryptocoryne spiralis.jpg', '(2013d) Aquatic plant surveys in southwestern India. Bulletin of Water Plant Society, Japan 100: 64-68.', true],
  ['File:Dwarf-Pufferfish.jpeg', 'Figure 8 Pufferfish Tetraodon biocellatus', false], // the fish's name
  ['File:Betta pair.jpg', 'A Betta splendens male (above) and a female, B. splendens too, at pH 6–7 in tank A-2', false],
  ['File:Corydoras aeneus 2.jpg', 'Corydoras aeneus, photographed by A. B. Collector (1) in 2019', false],
]

test("a paper's plate is no photo of the fish: microscope pictures, or several pictures in one with a letter or a number on each, by the file's own words (the owner's report, 2026-11-11)", () => {
  expect(PLATES.map(([title, description]) => unfitCommons({ title, description }))).toEqual(PLATES.map(p => p[2]))
  // One plain photo is none, whatever it is named.
  for (const [title, description, figure] of FIGURES_OF_ONE) {
    expect(unfitCommons({ title, description }), title).toBeUndefined()
    expect(paperFigure({ title, description }), title).toBe(figure)
  }
})

test("a word about microscopes outside a file's name refuses no photo of the living animal: its skin described, or a photo contest's category (found on pages, 2026-11-11)", () => {
  for (const f of [
    // A page's lead, which the photo check had passed.
    { title: 'File:The Electric Blue Acara (Andinoacara pulcher, electric blue morph).jpg', description: 'Iridophores (specialized reflective cells) in the fish’s skin contain microscopic crystal-like plates made of guanine.' },
    { title: 'File:Креветка Амано.jpg', description: 'Amano Shrimp', categories: 'Caridina multidentata|Self-published work|Images from Wiki Science Competition 2018 in Russia|Microscopy images from Russian Science Photo Competition 2018' },
  ]) expect(unfitCommons(f), f.title).toBeUndefined()
  // A moss's leaf cells through a microscope, by its category, and any file named as one.
  expect(unfitCommons({ title: 'File:Leptodictyum riparium (a, 144821-480959) 9489.JPG', description: 'Leptodictyum riparium', categories: 'Leptodictyum riparium|CC-Zero|Self-published work|Microscopic images of Hypnales - cells of the leaf base' })).toBe('not a photo: Microscopic images of')
  expect(unfitCommons({ title: 'File:Gill fluke, microscope view.jpg' })).toBe('not a photo: microscope')
  expect(unfitCommons({ title: 'File:IMG 2041.jpg', description: 'Scanning electron micrograph of a scale.' })).toBe('not a photo: Scanning electron')
})

test("a file named as a paper's figure is no page's photo straight from the search, plate or not: nothing has looked at it; a guide's search and a gallery's screen still see it", async () => {
  const [plain, named] = [FIGURES_OF_ONE[5]!, FIGURES_OF_ONE[0]!]
  const search = () => ({ query: { pages: Object.fromEntries([named, plain, PLATES[3]!].map(([title, description], i) => [String(i), { index: i + 1, title, imageinfo: [{
    width: 2000, thumburl: `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${title.slice(5).replaceAll(' ', '_')}/960px-${title.slice(5).replaceAll(' ', '_')}`, thumbwidth: 960, thumbheight: 640,
    descriptionurl: `https://commons.wikimedia.org/wiki/${title.replaceAll(' ', '_')}`,
    extmetadata: { LicenseShortName: { value: 'CC BY 4.0' }, Artist: { value: 'A' }, ImageDescription: { value: description }, Categories: { value: '' } },
  }] }])) } })
  expect((await findPhotos('Clarias leiacanthus', async () => search())).map(p => p.sourceUrl.split('File:')[1])).toEqual(['Betta_pair.jpg'])
  expect(await searchCommons('"Clarias leiacanthus"', async () => search(), 6)).toHaveLength(3)
})
