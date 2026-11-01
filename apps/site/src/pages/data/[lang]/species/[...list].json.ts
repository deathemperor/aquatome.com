import type { Localized, SpeciesEntity } from '@aq/schema'
import type { APIRoute, GetStaticPaths } from 'astro'
import { getContent } from '../../../../lib/content'
import { LANGS, type Lang } from '../../../../lib/i18n'
import { speciesItems, speciesListPhotos, speciesLists } from '../../../../lib/list-data'
import { PAGE } from '../../../../scripts/filter-list'

// A group's, taxon's or origin's species (lib/list-data.ts speciesLists), one file per list longer than a page: the
// page's HTML has the first page, and "Xem thêm" builds the rest from this (/data/vi/species/nhom/catfish.json).
export const getStaticPaths: GetStaticPaths = async () => (await Promise.all(LANGS.map(async lang =>
  [...speciesLists(lang, await getContent(lang))].filter(([, species]) => species.length > PAGE).map(([list, species]) => ({ params: { lang, list }, props: { species } })),
))).flat()

export const GET: APIRoute = async ({ params, props }) => {
  const { species } = props as { species: Localized<SpeciesEntity>[] }
  const lang = params.lang as Lang
  return Response.json(speciesItems(species, speciesListPhotos(lang, await getContent(lang), params.list!, species)))
}
