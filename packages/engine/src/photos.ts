import { isAllowedLicence, type Photo } from '@aq/schema'
import { authorText } from './wiki-author'

type Info = { width: number; thumburl: string; thumbwidth: number; thumbheight: number; descriptionurl: string; extmetadata?: Record<string, { value: string }> }
type Result = { query?: { pages?: Record<string, { index: number; title: string; imageinfo?: Info[] }> } }

const text = (html = '') => html.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()

/** Open-licence photos from Wikimedia Commons, in search-rank order. */
export const findPhotos = (scientificName: string, http: (url: string) => Promise<unknown>, max = 4) => searchCommons(`"${scientificName}"`, http, max)

/** Commons bitmap search (≥ 800px, open licences only). */
export async function searchCommons(search: string, http: (url: string) => Promise<unknown>, max = 4): Promise<Photo[]> {
  const q = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrsearch: `filetype:bitmap ${search}`, gsrnamespace: '6', gsrlimit: '20',
    prop: 'imageinfo', iiprop: 'url|size|extmetadata', iiurlwidth: '960', iiextmetadatafilter: 'LicenseShortName|Artist|ImageDescription',
  })
  const r = (await http(`https://commons.wikimedia.org/w/api.php?${q.toString().replace(/\+/g, '%20')}`)) as Result
  return Object.values(r.query?.pages ?? {})
    .sort((a, b) => a.index - b.index)
    .flatMap(p => (p.imageinfo?.[0] ? [{ p, i: p.imageinfo[0] }] : []))
    .filter(({ i }) => i.width >= 800 && isAllowedLicence(i.extmetadata?.LicenseShortName?.value ?? ''))
    .slice(0, max)
    .map(({ p, i }) => {
      const caption = text(i.extmetadata?.ImageDescription?.value).slice(0, 200)
      return {
        url: i.thumburl, width: i.thumbwidth, height: i.thumbheight, licence: i.extmetadata!.LicenseShortName!.value,
        author: authorText(i.extmetadata?.Artist?.value) || 'Wikimedia Commons', sourceUrl: i.descriptionurl, caption: caption || p.title.replace(/^File:/, ''),
      }
    })
}
