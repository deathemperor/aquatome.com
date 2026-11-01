import type { APIRoute, GetStaticPaths } from 'astro'
import { getContent } from '../../../lib/content'
import { LANGS, translator, type Lang } from '../../../lib/i18n'
import { guideList } from '../../../lib/list-data'

// The guide list's guides, their card words and photos, one file per language (lib/list-data.ts).
export const getStaticPaths: GetStaticPaths = () => LANGS.map(lang => ({ params: { lang } }))

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as Lang
  return Response.json(guideList(translator(lang), await getContent(lang)))
}
