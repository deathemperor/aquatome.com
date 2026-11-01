import type { APIRoute, GetStaticPaths } from 'astro'
import { getContent } from '../../../lib/content'
import { LANGS, translator, type Lang } from '../../../lib/i18n'
import { plantList } from '../../../lib/list-data'

// The plant list's plants, filter figures and card lines and photos, one file per language (lib/list-data.ts).
export const getStaticPaths: GetStaticPaths = () => LANGS.map(lang => ({ params: { lang } }))

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as Lang
  return Response.json(plantList(translator(lang), await getContent(lang)))
}
