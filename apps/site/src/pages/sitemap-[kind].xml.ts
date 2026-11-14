import type { APIRoute, GetStaticPaths } from 'astro'
import { SITEMAP_KINDS, sitemapEntries, urlset, type SitemapEntry } from '../lib/sitemap'

export const getStaticPaths = (async () => {
  const entries = await sitemapEntries()
  return SITEMAP_KINDS.flatMap(kind => {
    const own = entries.filter(e => e.kind === kind)
    return own.length ? [{ params: { kind }, props: { own } }] : []
  })
}) satisfies GetStaticPaths

export const GET: APIRoute = ({ props, site }) => urlset(props.own as SitemapEntry[], site)
