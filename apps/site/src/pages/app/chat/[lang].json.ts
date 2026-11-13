import type { APIRoute, GetStaticPaths } from 'astro'
import { heldOf, topicsOf } from '../../../../worker/chat/topics'
import { appPages } from '../../../lib/app-page'
import { getContent } from '../../../lib/content'
import { appPath, LANGS, type Lang } from '../../../lib/i18n'

// What each guide is about beyond its title, its section headings and FAQ questions (worker/chat/topics.ts), for the
// chat's search, and the guides held out of the chat: /app/chat/<lang>.json. The Worker reads it from the deploy's
// assets; the app doesn't, so a held guide stays in the app and on the site.
export const getStaticPaths: GetStaticPaths = () => LANGS.map(lang => ({ params: { lang } }))

export const GET: APIRoute = async ({ params }) => {
  const lang = params.lang as Lang
  const content = await getContent(lang)
  return Response.json(topicsOf((await appPages(lang, content)).guide, heldOf(content.guides, p => appPath(lang, p))))
}
