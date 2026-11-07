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
export const ARTWORK = /(?<!\p{L})(?:in art|artworks?|drawings?|illustrations?|illustrated|engravings?|engraved|lithographs?|lithography|paintings?|watercolou?rs?|sketch(?:es)?|line art|clip ?art|cartoons?|iconographia|stamps?|postage|plates? [ivxlc\d]+|pl\. ?[ivxlc\d]+)(?!\p{L})/iu
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
  { why: 'not a photo', re: word('maps?|charts?|diagrams?|logos?|svg|skeletons?|skulls?|x-rays?|radiographs?'), in: ['title', 'categories'] },
  { why: 'not a photo', re: word('range|distribution'), in: ['title'] },
  { why: 'dead', re: word('(?<!not )preserved|taxiderm\\p{L}*|formalin|fried|pickled|cooked|grilled|smoked'), in: ['title', 'categories', 'description'] },
  { why: 'dead', re: word('specimens?|plates?|herbari(?:um|a)|holotypes?|paratypes?|lectotypes?|syntypes?|markets?'), in: ['title'] },
  { why: 'dead', re: word('markets?|fishmongers?|dried fish|dishes|cuisine|as food|seafood|fish collections?'), in: ['categories'] },
  { why: 'other', re: /misidentif\p{L}*|errata/iu, in: ['description'] },
]

/**
 * What a Commons file's own words (its title, description and categories) say it is, when it isn't a photo of a living
 * fish or plant: `drawing: …` (art), `not a photo: …` (a map, chart or X-ray), `dead: …` (a preserved specimen, food,
 * a market) or `other: …` (marked as misidentified), with the words; undefined when they say none. Found 2026-11-07:
 * the Java barb's page photos, the Commons search's first four, were Bleeker's drawing ("Cyprinidae illustrations"), a
 * fried fish ("Fried fish in Thailand"), and a fish out of water and one in a hand, which only a look tells.
 */
export function unfitCommons(f: { title: string; description?: string; categories?: string }): string | undefined {
  const fields = { title: f.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '').replace(/[_-]+/g, ' '), categories: f.categories ?? '', description: text(f.description) }
  for (const u of UNFIT) {
    const hit = u.in.map(k => u.re.exec(fields[k])?.[0]).find(Boolean)
    if (hit) return `${u.why}: ${hit}`
  }
  return undefined
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
 * file's own words (unfitCommons), and none rejected before (`rejected`: engine-state/_photo-rejected.json).
 */
export const findPhotos = (scientificName: string, http: (url: string) => Promise<unknown>, max = 4, rejected: Record<string, string> = {}) =>
  searchCommons(`"${scientificName}"`, http, max, { rejected, living: true })

/**
 * Commons bitmap search (≥ 800px, open licences only). `living`: only files whose own words don't say they are art, a
 * chart, a dead fish or food (unfitCommons), for a species' or plant's picture; a guide's picture may be lettuce for
 * the fish. `rejected`: engine-state/_photo-rejected.json, left out.
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
    .filter(({ p, i }) => !(o.living && unfitCommons({ title: p.title, description: i.extmetadata?.ImageDescription?.value, categories: i.extmetadata?.Categories?.value })) && !blocked(i.thumburl))
    .slice(0, max)
    .map(({ p, i }) => {
      const caption = text(i.extmetadata?.ImageDescription?.value).slice(0, 200)
      return {
        url: i.thumburl, width: i.thumbwidth, height: i.thumbheight, licence: i.extmetadata!.LicenseShortName!.value,
        author: authorText(i.extmetadata?.Artist?.value) || 'Wikimedia Commons', sourceUrl: i.descriptionurl, caption: caption || p.title.replace(/^File:/, ''),
      }
    })
}
