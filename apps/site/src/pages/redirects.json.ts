import { PLACE_ALIASES } from '@aq/schema'
import type { APIRoute } from 'astro'
import { getContent } from '../lib/content'
import { LANGS, localizePath, served } from '../lib/i18n'

/**
 * Old page addresses → current page (read by the Worker when a page is not found). Vietnamese ones by their root
 * address: an old /vi/… one is looked up without /vi, so it reaches the page in one 301 (worker/index.ts).
 */
export const GET: APIRoute = async () => {
  const c = await getContent('vi')
  const out: Record<string, string> = {}
  const kinds = [['ca', c.species], ['ca', c.breeds], ['cay', c.plants]] as const
  // An old slug another page has taken since is that page's: the Worker reads this table before the page for /vi/….
  const live = new Set(kinds.flatMap(([prefix, xs]) => xs.map(x => `${prefix}/${x.t.slug}`)))
  for (const [prefix, xs] of kinds)
    for (const x of xs) for (const r of x.t.redirectFrom ?? []) if (!live.has(`${prefix}/${r.slug}`)) out[localizePath('vi', `/vi/${prefix}/${r.slug}/`)] = localizePath('vi', `/vi/${prefix}/${x.t.slug}/?tu=${r.slug}`)
  // A country once kept under two ids ("usa", "united-states"): the other id's origin page, in each language that has it.
  for (const lang of LANGS) {
    if (!served(lang, '/vi/nguon-goc/x/')) continue
    for (const p of (await getContent(lang)).places) for (const [alias, id] of Object.entries(PLACE_ALIASES))
      if (id === p.id && p.kind === 'country' && p.parent) out[localizePath(lang, `/vi/nguon-goc/${p.parent}/${alias}/`)] = localizePath(lang, `/vi/nguon-goc/${p.parent}/${id}/`)
  }
  return Response.json(out)
}
