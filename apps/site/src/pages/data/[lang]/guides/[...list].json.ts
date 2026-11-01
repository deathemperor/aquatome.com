import type { GuideEntity, Localized } from '@aq/schema'
import type { APIRoute, GetStaticPaths } from 'astro'
import { getContent } from '../../../../lib/content'
import { LANGS, served, translator, type Lang } from '../../../../lib/i18n'
import { guideItems, guideLists } from '../../../../lib/list-data'
import { PAGE } from '../../../../scripts/filter-list'

// The discovery notes and each video channel's guides (lib/list-data.ts guideLists), one file per list longer than a page
// in a language that has its page: the page's HTML has the first page, and "Xem thêm" builds the rest from this
// (/data/vi/guides/kham-pha.json).
export const getStaticPaths: GetStaticPaths = async () => (await Promise.all(LANGS.map(async lang =>
  [...guideLists(await getContent(lang))].filter(([list, guides]) => guides.length > PAGE && served(lang, `/vi/${list}/`)).map(([list, guides]) => ({ params: { lang, list }, props: { guides } })),
))).flat()

export const GET: APIRoute = async ({ params, props }) => {
  const lang = params.lang as Lang
  return Response.json(guideItems(translator(lang), await getContent(lang), (props as { guides: Localized<GuideEntity>[] }).guides))
}
