import { PLACE_ALIASES } from '@aq/schema'
import { resolve } from 'node:path'
import type { APIRoute } from 'astro'
import { getContent } from '../lib/content'
import { LANGS, localizePath, served } from '../lib/i18n'
import { renamedPages } from '../lib/renamed'
import { retiredForwards } from '../lib/retired'

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
  // The guides off the site for good, each address to its fish's page or the guides list (lib/retired.ts).
  Object.assign(out, await retiredForwards(process.env.CONTENT_ROOT ?? resolve(process.cwd(), '../../content'), getContent))
  return Response.json(out)
}
