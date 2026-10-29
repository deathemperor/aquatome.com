import type { APIRoute } from 'astro'
import { getContent } from '../lib/content'
import { categories } from '../lib/equipment'
import { GALLERY_MIN } from '../lib/gallery'
import { videoChannels } from '../lib/video'

export const GET: APIRoute = async ({ site }) => {
  const c = await getContent()
  const paths = [
    '/vi/', '/vi/ca/', '/vi/cay/', '/vi/huong-dan/', ...(c.series.length ? ['/vi/video/'] : []), '/vi/thuat-ngu/', '/vi/thiet-bi/', '/vi/kham-pha/', '/vi/moi-cap-nhat/', '/vi/phan-loai/', '/vi/nguon-goc/',
    '/vi/cong-cu/', '/vi/gioi-thieu/', '/vi/lien-he/', '/vi/chinh-sach-bao-mat/',
    ...c.species.filter(s => s.t.quality.indexable).map(s => `/vi/ca/${s.t.slug}/`),
    ...c.plants.filter(p => p.t.quality.indexable).map(p => `/vi/cay/${p.t.slug}/`),
    ...c.guides.filter(g => g.t.quality.indexable).map(g => `/vi/huong-dan/${g.t.slug}/`),
    ...c.glossary.filter(g => g.t.quality.indexable).map(g => `/vi/thuat-ngu/${g.t.slug}/`),
    ...c.series.filter(s => c.guides.some(g => g.video?.series?.id === s.id && g.t.quality.indexable)).map(s => `/vi/video/${s.vi.slug}/`),
    ...videoChannels(c).filter(ch => ch.guides.some(g => g.t.quality.indexable)).map(ch => `/vi/video/kenh/${ch.slug}/`),
    ...categories(c).map(u => `/vi/thiet-bi/${u.category}/`),
    ...c.species.filter(s => s.t.quality.indexable && (c.galleries[s.id]?.length ?? 0) >= GALLERY_MIN).map(s => `/vi/ca/${s.t.slug}/anh/`),
  ]
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map(p => `  <url><loc>${new URL(p, site).href}</loc></url>`).join('\n')}\n</urlset>\n`
  return new Response(body, { headers: { 'content-type': 'application/xml' } })
}
