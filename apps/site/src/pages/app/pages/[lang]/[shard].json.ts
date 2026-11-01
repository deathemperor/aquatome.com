import type { APIRoute, GetStaticPaths } from 'astro'
import type { PageShard } from '@aq/schema/app-page'
import { appPages, shardsOf } from '../../../../lib/app-page'
import { getContent } from '../../../../lib/content'
import { LANGS } from '../../../../lib/i18n'

// The app's copy of each content page, in shards (lib/app-page.ts): /app/pages/<lang>/<kind>-<n>.json. The app index
// says how many shards each kind has.
export const getStaticPaths: GetStaticPaths = async () =>
  (await Promise.all(LANGS.map(async lang =>
    shardsOf(appPages(lang, await getContent(lang))).shards.map(s => ({ params: { lang, shard: `${s.kind}-${s.n}` }, props: { shard: s.shard } })),
  ))).flat()

export const GET: APIRoute = ({ props }) => Response.json((props as { shard: PageShard }).shard)
