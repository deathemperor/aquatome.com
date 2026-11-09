import type { APIRoute, GetStaticPaths } from 'astro'
import { getContent } from '../../../lib/content'
import { LANGS, type Lang } from '../../../lib/i18n'
import { mateList } from '../../../lib/list-data'
import { getTraits } from '../../../lib/traits'

// The tank-mates checker's species, one file per language (lib/list-data.ts).
export const getStaticPaths: GetStaticPaths = () => LANGS.map(lang => ({ params: { lang } }))

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as Lang
  return Response.json(mateList(lang, await getContent(lang), await getTraits()))
}
