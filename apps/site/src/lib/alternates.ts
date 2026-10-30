import { getContent } from './content'
import { LANGS, localizePath, served, type Lang } from './i18n'

/** A species page in each language that has it and lets search engines index it, for hreflang. */
export async function speciesAlternates(id: string): Promise<Partial<Record<Lang, string>>> {
  const out: Partial<Record<Lang, string>> = {}
  for (const l of LANGS) {
    if (!served(l, '/vi/ca/x/')) continue
    const s = (await getContent(l)).species.find(x => x.id === id)
    if (s?.t.quality.indexable) out[l] = localizePath(l, `/vi/ca/${s.t.slug}/`)
  }
  return out
}
