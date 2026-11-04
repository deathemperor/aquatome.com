import type { APIRoute } from 'astro'
import { buildCatalog } from '../../../worker/fishid/catalog'
import { getContent } from '../../lib/content'
import { appPath, LANGS, served } from '../../lib/i18n'
import { smallSrc } from '../../lib/img'

// The pages the fish-ID tool links a guess to (worker/fishid/catalog.ts): built with the pages, so the Worker, which
// reads it from the deploy's assets, never links to a page that isn't live. The app can read it too.
export const GET: APIRoute = async () => {
  const langs = await Promise.all(LANGS.map(async lang => ({ lang, pages: await getContent(lang), at: (vi: string) => (served(lang, vi) ? appPath(lang, vi) : undefined) })))
  return Response.json(buildCatalog(langs, smallSrc))
}
