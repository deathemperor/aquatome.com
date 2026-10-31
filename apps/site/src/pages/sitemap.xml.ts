import type { APIRoute } from 'astro'
import { getContent } from '../lib/content'
import { localizePath, PAGES, routeIn, served } from '../lib/i18n'
import { categories, categoriesIn } from '../lib/equipment'
import { GALLERY_MIN } from '../lib/gallery'
import { videoChannels } from '../lib/video'

export const GET: APIRoute = async ({ site }) => {
  const c = await getContent('vi')
  const paths = [
    '/vi/', '/vi/ca/', '/vi/cay/', '/vi/huong-dan/', ...(c.series.length ? ['/vi/video/'] : []), '/vi/thuat-ngu/', '/vi/thiet-bi/', '/vi/kham-pha/', '/vi/moi-cap-nhat/', '/vi/phan-loai/', '/vi/nguon-goc/',
    '/vi/cong-cu/', '/vi/cong-cu/nuoi-chung/', '/vi/cong-cu/the-tich-be/', '/vi/cong-cu/den-chihiros/', '/vi/cong-cu/be-cua-toi/', '/vi/gioi-thieu/', '/vi/lien-he/', '/vi/chinh-sach-bao-mat/',
    ...c.species.filter(s => s.t.quality.indexable).map(s => `/vi/ca/${s.t.slug}/`),
    ...c.breeds.filter(b => b.t.quality.indexable).map(b => `/vi/ca/${b.t.slug}/`),
    ...c.plants.filter(p => p.t.quality.indexable).map(p => `/vi/cay/${p.t.slug}/`),
    ...c.guides.filter(g => g.t.quality.indexable).map(g => `/vi/huong-dan/${g.t.slug}/`),
    ...c.glossary.filter(g => g.t.quality.indexable).map(g => `/vi/thuat-ngu/${g.t.slug}/`),
    ...c.series.filter(s => c.guides.some(g => g.video?.series?.id === s.id && g.t.quality.indexable)).map(s => `/vi/video/${s.vi.slug}/`),
    ...videoChannels(c).filter(ch => ch.guides.some(g => g.t.quality.indexable)).map(ch => `/vi/video/kenh/${ch.slug}/`),
    ...categories(c).map(u => `/vi/thiet-bi/${u.category}/`),
    ...[...c.species, ...c.breeds].filter(s => s.t.quality.indexable && (c.galleries[s.id]?.length ?? 0) >= GALLERY_MIN).map(s => `/vi/ca/${s.t.slug}/anh/`),
    ...c.products.filter(p => p.t.quality.indexable).map(p => `/vi/san-pham/${p.t.slug}/`),
  ]
  // Other languages: their fixed pages and their indexable species, breed, photo, guide, plant and glossary pages.
  for (const lang of ['id', 'th'] as const) {
    const t = await getContent(lang)
    paths.push(...PAGES[lang].filter(f => !f.includes('[')).map(f => `${routeIn(lang, f)}/`))
    if (served(lang, '/vi/ca/x/')) paths.push(...[...t.species, ...t.breeds].filter(s => s.t.quality.indexable).map(s => localizePath(lang, `/vi/ca/${s.t.slug}/`)))
    if (served(lang, '/vi/ca/x/anh/')) paths.push(...[...t.species, ...t.breeds].filter(s => s.t.quality.indexable && (t.galleries[s.id]?.length ?? 0) >= GALLERY_MIN).map(s => localizePath(lang, `/vi/ca/${s.t.slug}/anh/`)))
    if (served(lang, '/vi/thiet-bi/x/')) paths.push(...categoriesIn(lang, t).filter(u => t.equipment.find(e => e.category === u.category)?.quality?.indexable).map(u => localizePath(lang, `/vi/thiet-bi/${u.category}/`)))
    if (served(lang, '/vi/huong-dan/x/')) paths.push(...t.guides.filter(g => g.t.quality.indexable).map(g => localizePath(lang, `/vi/huong-dan/${g.t.slug}/`)))
    if (served(lang, '/vi/cay/x/')) paths.push(...t.plants.filter(p => p.t.quality.indexable).map(p => localizePath(lang, `/vi/cay/${p.t.slug}/`)))
    for (const index of ['/vi/phan-loai/', '/vi/nguon-goc/']) if (served(lang, index)) paths.push(localizePath(lang, index))
    if (served(lang, '/vi/thuat-ngu/x/')) paths.push(...t.glossary.filter(g => g.t.quality.indexable).map(g => localizePath(lang, `/vi/thuat-ngu/${g.t.slug}/`)))
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map(p => `  <url><loc>${new URL(p, site).href}</loc></url>`).join('\n')}\n</urlset>\n`
  return new Response(body, { headers: { 'content-type': 'application/xml' } })
}
