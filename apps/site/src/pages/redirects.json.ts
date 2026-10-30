import type { APIRoute } from 'astro'
import { getContent } from '../lib/content'

/** Old page addresses → current page (read by the Worker when a /vi/ path is not found). */
export const GET: APIRoute = async () => {
  const c = await getContent('vi')
  const out: Record<string, string> = {}
  for (const [prefix, xs] of [['ca', c.species], ['ca', c.breeds], ['cay', c.plants]] as const)
    for (const x of xs) for (const r of x.t.redirectFrom ?? []) out[`/vi/${prefix}/${r.slug}/`] = `/vi/${prefix}/${x.t.slug}/?tu=${r.slug}`
  return Response.json(out)
}
