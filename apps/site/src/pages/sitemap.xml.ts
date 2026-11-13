import type { APIRoute } from 'astro'
import { SITEMAP_KINDS, sitemapEntries, sitemapIndex } from '../lib/sitemap'

export const GET: APIRoute = async ({ site }) => {
  const entries = await sitemapEntries()
  return sitemapIndex(SITEMAP_KINDS.filter(k => entries.some(e => e.kind === k)), site)
}
