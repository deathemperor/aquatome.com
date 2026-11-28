import { APP_PAGE, APP_STATE } from './app'
import { getContent } from './content'
import { categoriesIn } from './equipment'
import { categoryLabel, groupLabel, OFF_LIST_GROUPS } from './format'
import { localizePath, OTHER_LANGS, PAGES, routeIn, served, toVi, translator } from './i18n'
import { ORIGINS, RANKS } from './taxa-places'
import { videoChannels } from './video'
import { lastChanged, pageDateFiles } from './page-dates'

/**
 * One sitemap per kind, so Search Console counts what's indexed for each. `/sitemap.xml` is their index. The photo pages'
 * two (fish-photos, plant-photos) went with the pages on 18 Nov: an album opens over its fish's or plant's page.
 */
export const SITEMAP_KINDS = ['fish', 'plants', 'guides', 'videos', 'glossary', 'equipment', 'products', 'other'] as const
export type SitemapKind = (typeof SITEMAP_KINDS)[number]
export type SitemapEntry = { kind: SitemapKind; path: string; lastmod?: string; label: string }

// The headings the hub and tool templates already give these addresses, before translation.
const PAGE_HEADINGS: Record<string, string> = {
  '/vi/': 'Hiểu cá trước khi thả cá.',
  '/vi/ca/': 'Tất cả loài',
  '/vi/cay/': 'Cây thủy sinh',
  '/vi/huong-dan/': 'Hướng dẫn',
  '/vi/video/': 'Video hướng dẫn',
  '/vi/thuat-ngu/': 'Thuật ngữ',
  '/vi/thiet-bi/': 'Thiết bị',
  '/vi/kham-pha/': 'Khám phá',
  '/vi/moi-cap-nhat/': 'Mới cập nhật',
  '/vi/phan-loai/': RANKS[0],
  '/vi/nguon-goc/': ORIGINS,
  '/vi/cong-cu/': 'Công cụ',
  '/vi/cong-cu/nuoi-chung/': 'Nuôi chung được không? Thả bao nhiêu con?',
  '/vi/cong-cu/the-tich-be/': 'Bể bao nhiêu lít?',
  '/vi/cong-cu/du-toan-be/': 'Set một bể hết bao nhiêu tiền?',
  '/vi/cong-cu/den-chihiros/': 'Đèn Chihiros',
  '/vi/cong-cu/nhan-dien-ca/': 'Đây là cá gì?',
  '/vi/cong-cu/be-cua-toi/': 'Bể của tôi',
  '/vi/gioi-thieu/': 'Giới thiệu',
  '/vi/gioi-thieu/bang-du-lieu/': 'Cách đọc bảng dữ liệu',
  '/vi/lien-he/': 'Liên hệ',
  '/vi/chinh-sach-bao-mat/': 'Chính sách bảo mật',
  '/vi/ung-dung/': 'Ứng dụng AquaTome',
}

/** Every page offered to search engines, each with its kind and, for a page made from its own files, its date. */
export async function sitemapEntries(): Promise<SitemapEntry[]> {
  const out: SitemapEntry[] = []
  for (const lang of ['vi', ...OTHER_LANGS] as const) {
    const c = await getContent(lang)
    const t = translator(lang)
    const titleFor = (viPath: string) => {
      const heading = PAGE_HEADINGS[viPath]
      if (!heading) throw new Error(`The catalogue needs the heading for ${viPath}`)
      return t(heading)
    }
    const add = (kind: SitemapKind, viPath: string, files: string[] = [], label = titleFor(viPath)) =>
      out.push({ kind, path: localizePath(lang, viPath), lastmod: lastChanged(c.pageDates, files), label })

    const fish = [...c.species.map(s => ({ s, folder: 'species' })), ...c.breeds.map(s => ({ s, folder: 'breeds' }))].filter(x => x.s.t.quality.indexable)
    if (served(lang, '/vi/ca/x/')) for (const { s, folder } of fish) add('fish', `/vi/ca/${s.t.slug}/`, pageDateFiles(folder, s.id, lang), s.t.name)
    if (served(lang, '/vi/nhom/x/')) for (const group of new Set(c.species.map(s => s.group))) {
      if (!OFF_LIST_GROUPS.includes(group)) add('other', `/vi/nhom/${group}/`, [], t(groupLabel(group)))
    }
    const plants = c.plants.filter(p => p.t.quality.indexable)
    if (served(lang, '/vi/cay/x/')) for (const p of plants) add('plants', `/vi/cay/${p.t.slug}/`, pageDateFiles('plants', p.id, lang), p.t.name)
    if (served(lang, '/vi/huong-dan/x/')) for (const g of c.guides) if (g.t.quality.indexable) add(g.video ? 'videos' : 'guides', `/vi/huong-dan/${g.t.slug}/`, pageDateFiles('guides', g.id, lang), g.t.name)
    if (served(lang, '/vi/thuat-ngu/x/')) for (const g of c.glossary) if (g.t.quality.indexable) add('glossary', `/vi/thuat-ngu/${g.t.slug}/`, pageDateFiles('glossary', g.id, lang), g.t.name)
    if (served(lang, '/vi/thiet-bi/x/')) {
      for (const u of categoriesIn(lang, c)) {
        const guide = c.equipment.find(e => e.category === u.category)
        if (lang === 'vi' || guide?.quality?.indexable) {
          const file = `equipment/${lang === 'vi' ? '' : `${lang}/`}${u.category}.json`
          add('equipment', `/vi/thiet-bi/${u.category}/`, [file], guide?.name ?? t(categoryLabel(u.category)))
        }
      }
    }

    if (lang === 'vi') {
      for (const s of c.series) if (c.guides.some(g => g.video?.series?.id === s.id && g.t.quality.indexable)) add('videos', `/vi/video/${s.vi.slug}/`, [], s.vi.name)
      for (const ch of videoChannels(c)) if (ch.guides.some(g => g.t.quality.indexable)) add('videos', `/vi/video/kenh/${ch.slug}/`, [], ch.name)
      for (const p of c.products) if (p.t.quality.indexable) add('products', `/vi/san-pham/${p.t.slug}/`, pageDateFiles('products', p.id, lang), p.t.name)
      for (const p of [
        '/vi/', '/vi/ca/', '/vi/cay/', '/vi/huong-dan/', ...(c.series.length ? ['/vi/video/'] : []), '/vi/thuat-ngu/', '/vi/thiet-bi/', '/vi/kham-pha/', '/vi/moi-cap-nhat/', '/vi/phan-loai/', '/vi/nguon-goc/',
        '/vi/cong-cu/', '/vi/cong-cu/nuoi-chung/', '/vi/cong-cu/the-tich-be/', '/vi/cong-cu/du-toan-be/', '/vi/cong-cu/den-chihiros/', '/vi/cong-cu/be-cua-toi/', '/vi/gioi-thieu/', '/vi/gioi-thieu/bang-du-lieu/', '/vi/lien-he/', '/vi/chinh-sach-bao-mat/',
      ]) add('other', p)
    } else {
      for (const f of PAGES[lang]) if (!f.includes('[') && f !== 'tim-kiem/index.astro') {
        const path = `${routeIn(lang, f)}/`
        out.push({ kind: 'other', path, label: titleFor(toVi(path)) })
      }
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
