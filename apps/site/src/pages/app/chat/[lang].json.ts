import type { APIRoute, GetStaticPaths } from 'astro'
import { topicsOf } from '../../../../worker/chat/topics'
import { appPages } from '../../../lib/app-page'
import { getContent } from '../../../lib/content'
import { LANGS, type Lang } from '../../../lib/i18n'

// What each guide is about beyond its title, its section headings and FAQ questions (worker/chat/topics.ts), for the
// chat's search: /app/chat/<lang>.json. The Worker reads it from the deploy's assets; the app doesn't.
export const getStaticPaths: GetStaticPaths = () => LANGS.map(lang => ({ params: { lang } }))

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as Lang
  return Response.json(topicsOf((await appPages(lang, await getContent(lang))).guide))
}
