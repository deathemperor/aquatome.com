import { PLACE_ALIASES } from '@aq/schema'
import type { APIRoute } from 'astro'
import { getContent } from '../lib/content'
import { LANGS, localizePath, served } from '../lib/i18n'
import { renamedPages } from '../lib/renamed'

/**
 * Old page addresses → current page (read by the Worker when a page is not found). Vietnamese ones by their root
 * address: an old /vi/… one is looked up without /vi, so it reaches the page in one 301 (worker/index.ts).
 */
export const GET: APIRoute = async () => {
  const out = renamedPages(await getContent('vi'))
  // A country once kept under two ids ("usa", "united-states"): the other id's origin page, in each language that has it.
  for (const lang of LANGS) {
    if (!served(lang, '/vi/nguon-goc/x/')) continue
    for (const p of (await getContent(lang)).places) for (const [alias, id] of Object.entries(PLACE_ALIASES))
      if (id === p.id && p.kind === 'country' && p.parent) out[localizePath(lang, `/vi/nguon-goc/${p.parent}/${alias}/`)] = localizePath(lang, `/vi/nguon-goc/${p.parent}/${id}/`)
  }
  return Response.json(out)
}
