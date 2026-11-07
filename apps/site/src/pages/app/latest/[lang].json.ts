import type { APIRoute, GetStaticPaths } from 'astro'
import { appLatest } from '../../../lib/app-latest'
import { getContent } from '../../../lib/content'
import { LANGS, served, type Lang } from '../../../lib/i18n'

// What's new for the native app (lib/app-latest.ts), one file per language whose site has /vi/moi-cap-nhat/.
export const getStaticPaths: GetStaticPaths = () => LANGS.filter(lang => served(lang, '/vi/moi-cap-nhat/')).map(lang => ({ params: { lang } }))

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as Lang
  return Response.json(appLatest(lang, await getContent(lang)))
}
