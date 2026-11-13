import { isAllowedLicence, type Photo } from '@aq/schema'
import { mirrorPlan } from './mirror-photos'
import { authorText } from './wiki-author'

type Info = { width: number; thumburl: string; thumbwidth: number; thumbheight: number; descriptionurl: string; extmetadata?: Record<string, { value: string }> }
type Result = { query?: { pages?: Record<string, { index: number; title: string; imageinfo?: Info[] }> } }

const text = (html = '') => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

/**
 * Words saying a picture is art, not a photo: a drawing, painting, engraving, plate or stamp. Not "painted" or "drawn",
 * which common names and fins use ("Painted betta", "drawn-out fins").
 */
import { ARTWORK } from './photo-artwork'
export { ARTWORK } from './photo-artwork'
const word = (w: string) => new RegExp(`(?<!\\p{L})(?:${w})(?!\\p{L})`, 'iu')
/**
 * A Commons file's words that say it is no photo of a living fish or plant, each where it says so: some words name one in
 * a title ("… holotype.png", "… Market …") and mean something else in a category or a description, written by
 * anyone ("Specimens in the Botanischer Garten" are live plants; "Fishing in India" files a gourami in a tank; an
 * oscar's description says it is sold in markets; a book scan is known by its library). Not "museum" (public aquaria: the Aquazoo Löbbecke Museum, Pisa's),
 * "anatomy" (a betta's fins), "diseases", or a standard length ("30 mm SL"): of ten files giving one, five were live fish
 * in a tank or a bag.
 */
const UNFIT: { why: string; re: RegExp; in: ('title' | 'categories' | 'description')[] }[] = [
  // Not a description's: "originally created as the illustration for a quiz", koi "depicted on artwork", "scan of print
  // film" are about photos.
  { why: 'drawing', re: ARTWORK, in: ['title', 'categories'] },
  { why: 'drawing', re: word('prints?|biodiversity heritage library|internet archive book images'), in: ['title', 'categories'] },
  { why: 'drawing', re: word('view book online'), in: ['description'] },
  // The old Britannica's figures are engravings ("EB9 - Angling - Fig 27", the tench's second photo until 2026-11-11).
  // Not "encyclopedia": the Encyclopedia of Life's files are photos. Not "britannica" alone: a species' name ("Inula britannica").
  { why: 'drawing', re: word('EB9|EB1911|encyclop(?:ae|æ|e)dia britannica'), in: ['title', 'categories'] },
  // Pictures through a microscope, and ear stones, are no photo of the fish (`paperPlate` below has the rest of a
  // paper's plates). "Microscopic" and "otolith" count in the file's name only. Of the 5,200 Commons files on pages
  // and in albums on 2026-11-11, a description said "microscopic" of one, a living acara's ("microscopic crystal-like
  // plates" in its skin), and a category said "Microscopy" of three living shrimp (a photo contest's "Microscopy
  // images"). A category "Microscopic images of …" held one microscope picture (a moss's leaf cells) and two close-ups
  // of a living floating fern's leaf hairs, so it refuses none either: the photo check looks.
  { why: 'not a photo', re: word('micrographs?|photomicrographs?|scanning electron'), in: ['title', 'categories', 'description'] },
  { why: 'not a photo', re: word('microscop\\p{L}*|otoliths?'), in: ['title'] },
  { why: 'not a photo', re: word('maps?|charts?|diagrams?|logos?|svg|skeletons?|skulls?|x-rays?|radiographs?'), in: ['title', 'categories'] },
  { why: 'not a photo', re: word('range|distribution'), in: ['title'] },
  { why: 'dead', re: word('(?<!not )preserved|taxiderm\\p{L}*|formalin|fried|pickled|cooked|grilled|smoked'), in: ['title', 'categories', 'description'] },
  { why: 'dead', re: word('specimens?|plates?|herbari(?:um|a)|holotypes?|paratypes?|lectotypes?|syntypes?|markets?'), in: ['title'] },
  { why: 'dead', re: word('markets?|fishmongers?|dried fish|dishes|cuisine|as food|seafood|fish collections?'), in: ['categories'] },
  { why: 'other', re: word('misidentif\\p{L}*|errata'), in: ['description'] }, // a word: not the "errata" in "serrata"
]

const FIGURE = /(?<![\p{L}\p{N}])fig(?:ure|\.)?s?\.? ?\d+(?! ?puffer)/iu // not the fish: "Figure 8 pufferfish"
/** A file's title as words: no "File:", no extension, "_" and "-" as spaces. */
const titleWords = (title: string) => title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/[_-]+/g, ' ')

/**
 * Whether a Commons file's own words name it as a figure of a paper or a book: "… (10.3897-BDJ.11.e100337) Figure 20"
 * in its title, or a description that starts "Figure 4 of paper …", "Figures 8–14; …", "Fig. 27.—". Most are plates
 * (`paperPlate`); some are one plain photo of the living fish, and the words can't tell which, so a figure is no
 * page's photo until something has looked at it (searchCommons).
 */
export const paperFigure = (f: { title: string; description?: string }) => FIGURE.test(titleWords(f.title)) || new RegExp(`^\\W*${FIGURE.source}`, 'iu').test(text(f.description))

/**
 * What a Commons file's description says when it is a paper's plate, several pictures in one with a letter or a number
 * on each: the words that list its panels. "(a–c) …" or "A–H, …" (a run of panels), "(A) … (B) … (C) …" or
 * "(73) … (74) … (75) …" (each in brackets; two are enough in a file named as a figure, `paperFigure`), and, in a
 * file named as a figure, "(a) …" alone or "a … b …", "A … B …", "a. …; b. …" with no brackets. Found 2026-11-11 by the owner on Hemichromis elongatus, whose only photo was a parasite paper's plate of
 * microscope pictures: the Commons search for a fish's name finds the papers about its parasites, bones and eggs. Of
 * the 28 photos on pages that were named as a figure, 20 were such plates and one an engraving, and each plate's
 * description listed its panels; the 7 plain photos of a fish or plant had none ("Figure 20 Clarias leiacanthus.").
 * Five more plates were named as no figure ("Examples of species collected only in …(A) …"): 25 plates on 16 pages.
 */
export function paperPlate(f: { title: string; description?: string }): string | undefined {
  const d = text(f.description)
  // A file named as a figure is a plate at two panels. Any other file at three: "male (a) and female (b)" is one photo
  // of a pair, and "(1)" and "(2)" number the files of a series (the independent reader, 2026-11-11). Each plate of
  // the first 25 that was named as no figure listed three in the 200 characters a page's photo keeps.
  const figure = paperFigure(f)
  const least = figure ? 2 : 3
  // A run of panels, in brackets or opening the description: "(a–c)", "A–H, …" (not "A–Z of aquarium fishes").
  const run = /\(([a-h])[–-]([b-z])\)|^([a-h])[–-]([b-z])(?=[,:;.])/iu.exec(d)
  if (run && (run[2] ?? run[4])!.toLowerCase().charCodeAt(0) - (run[1] ?? run[3])!.toLowerCase().charCodeAt(0) + 1 >= least) return run[0]
  // Each panel in brackets: "(A)", "(B)" and "(C)", or numbers in a row, "(8)", "(9)" and "(10)".
  const letters = ['a', 'b', 'c'].slice(0, least)
  if (letters.every(l => new RegExp(`\\(${l}\\)`, 'i').test(d))) return letters.map(l => `(${l})`).join(', ')
  const numbers = [...d.matchAll(/\((\d{1,2})\)/g)].map(m => Number(m[1]))
  const row = (n: number) => Array.from({ length: least }, (_, i) => n + i)
  const first = numbers.find(n => row(n).every(x => numbers.includes(x)))
  if (first !== undefined) return row(first).map(n => `(${n})`).join(', ')
  if (!figure) return undefined
  // In a file named as a figure, the first panel in brackets is enough: a page's photo keeps only the start of its
  // description, and "(b)" may be past the cut.
  if (/\(a\)/i.test(d)) return '(a)'
  // And panels with no brackets: "a Henicorhynchus lineatus b H. lobatus", "A …, newly laid eggs B newly hatched",
  // "a. …; b. P. boulengeri". Not "B. splendens" (a genus cut short); "A. B. Smith" names a person, hence figures only.
  return /(?<![\p{L}\p{N}])[aA]\.? (?=\p{Lu})/u.test(d) && /(?<![\p{L}\p{N}])[bB](?: (?=\p{L})|\. ?(?=\p{Lu}))/u.test(d) ? 'a, b' : undefined
}

/**
 * What a Commons file's own words (its title, description and categories) say it is, when it isn't a photo of a living
 * fish or plant: `drawing: …` (art), `not a photo: …` (a map, chart, X-ray, microscope picture or a paper's plate), `dead: …` (a preserved specimen, food,
 * a market) or `other: …` (marked as misidentified), with the words; undefined when they say none. Found 2026-11-07:
 * the Java barb's page photos, the Commons search's first four, were Bleeker's drawing ("Cyprinidae illustrations"), a
 * fried fish ("Fried fish in Thailand"), and a fish out of water and one in a hand, which only a look tells.
 */
export function unfitCommons(f: { title: string; description?: string; categories?: string }): string | undefined {
  const fields = { title: titleWords(f.title), categories: f.categories ?? '', description: text(f.description) }
  for (const u of UNFIT) {
    const hit = u.in.map(k => u.re.exec(fields[k])?.[0]).find(Boolean)
    if (hit) return `${u.why}: ${hit}`
  }
  const plate = paperPlate(f)
  return plate ? `not a photo: a paper's plate, ${plate}` : undefined
}

/**
 * Whether a photo is on engine-state/_photo-rejected.json (URL → why): by its address, or, for a Commons, iNaturalist,
 * Flickr or GBIF photo rejected after it moved to our bucket, by its key there (mirror-photos.ts).
 */
export function isRejected(rejected: Record<string, string>): (url: string) => boolean {
  const keys = new Set(Object.keys(rejected).map(u => u.replace(/^https?:\/\/[^/]+\//, '')))
  return url => !!rejected[url] || keys.has(mirrorPlan(url)?.key ?? '')
}

/**
 * Open-licence photos of a species or plant from Wikimedia Commons, in search-rank order: photos of it alive, by each
 * file's own words (unfitCommons), none named as a paper's figure (paperFigure: these go on a page with no look at
 * them, and a gallery's photos are looked at first), and none rejected before (`rejected`:
 * engine-state/_photo-rejected.json).
 */
export const findPhotos = (scientificName: string, http: (url: string) => Promise<unknown>, max = 4, rejected: Record<string, string> = {}) =>
  searchCommons(`"${scientificName}"`, http, max, { rejected, living: true })

/**
 * Commons bitmap search (≥ 800px, open licences only). `living`: only files whose own words don't say they are art, a
 * chart, a plate, a dead fish or food (unfitCommons), nor name it as a paper's figure (paperFigure), for a species' or
 * plant's picture; a guide's picture may be lettuce for the fish. `rejected`: engine-state/_photo-rejected.json, left out.
 */
export async function searchCommons(search: string, http: (url: string) => Promise<unknown>, max = 4, o: { rejected?: Record<string, string>; living?: boolean } = {}): Promise<Photo[]> {
  const q = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrsearch: `filetype:bitmap ${search}`, gsrnamespace: '6', gsrlimit: '20',
    prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '960', iiextmetadatafilter: 'LicenseShortName|Artist|ImageDescription|Categories',
  })
  const r = (await http(`https://commons.wikimedia.org/w/api.php?${q.toString().replace(/\+/g, '%20')}`)) as Result
  const blocked = isRejected(o.rejected ?? {})
  return Object.values(r.query?.pages ?? {})
    .sort((a, b) => a.index - b.index)
    .flatMap(p => (p.imageinfo?.[0] ? [{ p, i: p.imageinfo[0] }] : []))
    .filter(({ i }) => i.width >= 800 && isAllowedLicence(i.extmetadata?.LicenseShortName?.value ?? ''))
    .map(x => ({ ...x, words: { title: x.p.title, description: x.i.extmetadata?.ImageDescription?.value, categories: x.i.extmetadata?.Categories?.value } }))
    .filter(({ i, words }) => !(o.living && (unfitCommons(words) || paperFigure(words))) && !blocked(i.thumburl))
    .slice(0, max)
    .map(({ p, i }) => {
      const caption = text(i.extmetadata?.ImageDescription?.value).slice(0, 200)
      return {
        url: i.thumburl, width: i.thumbwidth, height: i.thumbheight, licence: i.extmetadata!.LicenseShortName!.value,
        author: authorText(i.extmetadata?.Artist?.value) || 'Wikimedia Commons', sourceUrl: i.descriptionurl, caption: caption || p.title.replace(/^File:/, ''),
      }
    })
}
