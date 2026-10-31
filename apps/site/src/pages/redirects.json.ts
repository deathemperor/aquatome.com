import { PLACE_ALIASES } from '@aq/schema'
import type { APIRoute } from 'astro'
import { getContent } from '../lib/content'
import { LANGS, localizePath, served } from '../lib/i18n'

/** Old page addresses → current page (read by the Worker when a page is not found). */
export const GET: APIRoute = async () => {
  const c = await getContent('vi')
  const out: Record<string, string> = {}
  for (const [prefix, xs] of [['ca', c.species], ['ca', c.breeds], ['cay', c.plants]] as const)
    for (const x of xs) for (const r of x.t.redirectFrom ?? []) out[`/vi/${prefix}/${r.slug}/`] = `/vi/${prefix}/${x.t.slug}/?tu=${r.slug}`
  // A country once kept under two ids ("usa", "united-states"): the other id's origin page, in each language that has it.
  for (const lang of LANGS) {
    if (!served(lang, '/vi/nguon-goc/x/')) continue
    for (const p of (await getContent(lang)).places) for (const [alias, id] of Object.entries(PLACE_ALIASES))
      if (id === p.id && p.kind === 'country' && p.parent) out[localizePath(lang, `/vi/nguon-goc/${p.parent}/${alias}/`)] = localizePath(lang, `/vi/nguon-goc/${p.parent}/${id}/`)
  }
  return Response.json(out)
}
