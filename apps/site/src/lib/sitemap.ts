import type { Content } from '@aq/schema'
import { APP_PAGE, APP_STATE } from './app'
import type { Breed } from './breeds'
import { getContent } from './content'
import { categoriesIn } from './equipment'
import { localizePath, OTHER_LANGS, PAGES, routeIn, served } from './i18n'
import { albumOf, hasPhotoPage } from './photo-page'
import { videoChannels } from './video'

/** One sitemap per kind, so Search Console counts what's indexed for each. `/sitemap.xml` is their index. */
export const SITEMAP_KINDS = ['fish', 'fish-photos', 'plants', 'plant-photos', 'guides', 'videos', 'glossary', 'equipment', 'products', 'other'] as const
export type SitemapKind = (typeof SITEMAP_KINDS)[number]
export type SitemapEntry = { kind: SitemapKind; path: string; lastmod?: string }

/** The last day any of a page's own files changed (content/page-dates.json), or none: never the build's date. */
const lastChanged = (dates: Content['pageDates'], files: string[]) => files.map(f => dates[f]?.slice(0, 10)).filter(Boolean).sort().at(-1)

/** Every page offered to search engines, each with its kind and, for a page made from its own files, its date. */
export async function sitemapEntries(): Promise<SitemapEntry[]> {
  const out: SitemapEntry[] = []
  for (const lang of ['vi', ...OTHER_LANGS] as const) {
    const c = await getContent(lang)
    const add = (kind: SitemapKind, viPath: string, files: string[] = []) => out.push({ kind, path: localizePath(lang, viPath), lastmod: lastChanged(c.pageDates, files) })
    const text = (folder: string, id: string) => [`${folder}/${id}/entity.json`, `${folder}/${id}/${lang}.json`]
    const photos = (folder: string, id: string) => [`${folder}/${id}/${lang}.json`, `gallery/${id}.json`]

    const fish = [...c.species.map(s => ({ s, folder: 'species' })), ...c.breeds.map(s => ({ s, folder: 'breeds' }))].filter(x => x.s.t.quality.indexable)
    if (served(lang, '/vi/ca/x/')) for (const { s, folder } of fish) add('fish', `/vi/ca/${s.t.slug}/`, [...text(folder, s.id), ...(folder === 'species' && lang === 'vi' ? [`summaries/${s.id}.json`] : [])])
    if (served(lang, '/vi/ca/x/anh/')) for (const { s, folder } of fish) if (hasPhotoPage(folder === 'breeds' ? albumOf(c, 'breeds', s as Breed) : albumOf(c, 'species', s))) add('fish-photos', `/vi/ca/${s.t.slug}/anh/`, photos(folder, s.id))
    const plants = c.plants.filter(p => p.t.quality.indexable)
    if (served(lang, '/vi/cay/x/')) for (const p of plants) add('plants', `/vi/cay/${p.t.slug}/`, text('plants', p.id))
    if (served(lang, '/vi/cay/x/anh/')) for (const p of plants) if (hasPhotoPage(albumOf(c, 'plants', p))) add('plant-photos', `/vi/cay/${p.t.slug}/anh/`, photos('plants', p.id))
    if (served(lang, '/vi/huong-dan/x/')) for (const g of c.guides) if (g.t.quality.indexable) add(g.video ? 'videos' : 'guides', `/vi/huong-dan/${g.t.slug}/`, text('guides', g.id))
    if (served(lang, '/vi/thuat-ngu/x/')) for (const g of c.glossary) if (g.t.quality.indexable) add('glossary', `/vi/thuat-ngu/${g.t.slug}/`, text('glossary', g.id))
    if (served(lang, '/vi/thiet-bi/x/')) {
      for (const u of categoriesIn(lang, c)) {
        if (lang === 'vi' || c.equipment.find(e => e.category === u.category)?.quality?.indexable) add('equipment', `/vi/thiet-bi/${u.category}/`, [`equipment/${lang === 'vi' ? '' : `${lang}/`}${u.category}.json`])
      }
    }

    if (lang === 'vi') {
      for (const s of c.series) if (c.guides.some(g => g.video?.series?.id === s.id && g.t.quality.indexable)) add('videos', `/vi/video/${s.vi.slug}/`)
      for (const ch of videoChannels(c)) if (ch.guides.some(g => g.t.quality.indexable)) add('videos', `/vi/video/kenh/${ch.slug}/`)
      for (const p of c.products) if (p.t.quality.indexable) add('products', `/vi/san-pham/${p.t.slug}/`, text('products', p.id))
      for (const p of [
        '/vi/', '/vi/ca/', '/vi/cay/', '/vi/huong-dan/', ...(c.series.length ? ['/vi/video/'] : []), '/vi/thuat-ngu/', '/vi/thiet-bi/', '/vi/kham-pha/', '/vi/moi-cap-nhat/', '/vi/phan-loai/', '/vi/nguon-goc/',
        '/vi/cong-cu/', '/vi/cong-cu/nuoi-chung/', '/vi/cong-cu/the-tich-be/', '/vi/cong-cu/du-toan-be/', '/vi/cong-cu/den-chihiros/', '/vi/cong-cu/be-cua-toi/', '/vi/gioi-thieu/', '/vi/gioi-thieu/bang-du-lieu/', '/vi/lien-he/', '/vi/chinh-sach-bao-mat/',
      ]) add('other', p)
    } else {
      for (const f of PAGES[lang]) if (!f.includes('[') && f !== 'tim-kiem/index.astro') out.push({ kind: 'other', path: `${routeIn(lang, f)}/` })
      for (const index of ['/vi/phan-loai/', '/vi/nguon-goc/']) if (served(lang, index)) add('other', index)
    }
    if (APP_STATE === 'on' && served(lang, APP_PAGE)) add('other', APP_PAGE)
  }
  return out
}

const NS = 'xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
const xml = (body: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}\n`, { headers: { 'content-type': 'application/xml' } })

export const sitemapIndex = (kinds: SitemapKind[], site?: URL) =>
  xml(`<sitemapindex ${NS}>\n${kinds.map(k => `  <sitemap><loc>${new URL(`/sitemap-${k}.xml`, site).href}</loc></sitemap>`).join('\n')}\n</sitemapindex>`)

export const urlset = (entries: SitemapEntry[], site?: URL) =>
  xml(`<urlset ${NS}>\n${entries.map(e => `  <url><loc>${new URL(e.path, site).href}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>`)
