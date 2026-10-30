import type { Content } from '@aq/schema'
import { getContent } from './content'
import { LANGS, localizePath, served, toVi, type Lang } from './i18n'

const SECTION = { species: 'ca', plants: 'cay', glossary: 'thuat-ngu', guides: 'huong-dan' } as const
type Page = { id: string; t: { slug: string; quality: { indexable: boolean } } }

/** A species, plant, glossary or guide page in each language that has it and lets search engines index it, for hreflang. */
export async function alternatesOf(kind: keyof typeof SECTION, id: string): Promise<Partial<Record<Lang, string>>> {
  const out: Partial<Record<Lang, string>> = {}
  for (const l of LANGS) {
    if (!served(l, `/vi/${SECTION[kind]}/x/`)) continue
    const e = ((await getContent(l))[kind] as Page[]).find(x => x.id === id)
    if (e?.t.quality.indexable) out[l] = localizePath(l, `/vi/${SECTION[kind]}/${e.t.slug}/`)
  }
  return out
}

/** A listing page (group, taxon, place) in each language whose content has it: `has` says whether that language's would exist. */
export async function alternatesWhere(path: string, has: (c: Content) => boolean): Promise<Partial<Record<Lang, string>>> {
  const vi = toVi(path)
  const out: Partial<Record<Lang, string>> = {}
  for (const l of LANGS) if (served(l, vi) && has(await getContent(l))) out[l] = localizePath(l, vi)
  return out
}
