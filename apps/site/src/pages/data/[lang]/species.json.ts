import type { APIRoute, GetStaticPaths } from 'astro'
import { getContent } from '../../../lib/content'
import { LANGS, type Lang } from '../../../lib/i18n'
import { speciesList } from '../../../lib/list-data'

// The fish list's species, filter figures and card photos, one file per language (lib/list-data.ts).
export const getStaticPaths: GetStaticPaths = () => LANGS.map(lang => ({ params: { lang } }))

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as Lang
  return Response.json(speciesList(lang, await getContent(lang)))
}
