import type { APIRoute, GetStaticPaths } from 'astro'
import { appIndex } from '../../lib/app-index'
import { getContent } from '../../lib/content'
import { LANGS, type Lang } from '../../lib/i18n'
import { getTraits } from '../../lib/traits'

// The native app's handbook index, one file per language (lib/app-index.ts).
export const getStaticPaths: GetStaticPaths = () => LANGS.map(lang => ({ params: { lang } }))

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as Lang
  return Response.json(appIndex(lang, await getContent(lang), await getTraits()))
}
