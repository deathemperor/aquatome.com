import type { APIRoute, GetStaticPaths } from 'astro'
import { buildCatalog } from '../../../../worker/fishid/catalog'
import { buildFacts, factShards, shardFacts, type FactsShard } from '../../../../worker/fishid/facts'
import { getContent } from '../../../lib/content'
import { appPath, LANGS, served } from '../../../lib/i18n'
import { smallSrc } from '../../../lib/img'

// What the fish-ID agent's get_entry tool reads about a page (worker/fishid/facts.ts): /app/fish-id/facts-<n>.json,
// the catalog's pages sharded by id as the app's pages are, so the Worker reads one small file per page it opens.
export const getStaticPaths: GetStaticPaths = async () => {
  const langs = await Promise.all(LANGS.map(async lang => ({ lang, pages: await getContent(lang), at: (vi: string) => (served(lang, vi) ? appPath(lang, vi) : undefined) })))
  const catalog = buildCatalog(langs, smallSrc)
  const vi = langs.find(l => l.lang === 'vi')!.pages
  const facts = buildFacts(catalog, vi, smallSrc, { gallery: id => vi.galleries[id] ?? [] })
  return shardFacts(facts, factShards(catalog)).map((shard, n) => ({ params: { shard: `facts-${n}` }, props: { shard } }))
}

export const GET: APIRoute = ({ props }) => Response.json((props as { shard: FactsShard }).shard)
