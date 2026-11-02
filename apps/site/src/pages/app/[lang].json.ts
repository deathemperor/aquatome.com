import type { APIRoute, GetStaticPaths } from 'astro'
import { appIndex } from '../../lib/app-index'
import { appPages, indexedShards, shardsOf } from '../../lib/app-page'
import { getContent } from '../../lib/content'
import { LANGS, type Lang } from '../../lib/i18n'
import { getTraits } from '../../lib/traits'

// The native app's handbook index, one file per language (lib/app-index.ts), with each kind's shards of pages and the
// level an app must know to draw it (lib/app-page.ts PAGE_LEVELS).
export const getStaticPaths: GetStaticPaths = () => LANGS.map(lang => ({ params: { lang } }))

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as Lang
  const c = await getContent(lang)
  // Every species' group, for breeds whose species has no page in this language.
  return Response.json({ ...appIndex(lang, c, await getTraits(), (await getContent('vi')).species), ...indexedShards(shardsOf(await appPages(lang, c)).counts) })
}
