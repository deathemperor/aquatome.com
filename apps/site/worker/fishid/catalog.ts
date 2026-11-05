/**
 * The handbook's pages the fish-ID tool can link a guess to: every species, breed and plant page, built with the site
 * (src/pages/app/fish-id.json.ts → /app/fish-id.json) and read by the Worker from its assets, so it is always the pages
 * that are live. The accuracy script builds the same from content/. Plain shapes only: no @aq/schema or Cloudflare types.
 */
export type Lang = 'vi' | 'id' | 'th'
export type CatalogEntry = {
  id: string
  kind: 'species' | 'breed' | 'plant'
  /** Species and plants: the scientific name ("Alternanthera reineckii 'Mini'" for a cultivar). */
  sci?: string
  /** A plant's former names, as its page gives them. */
  syn?: string[]
  /** A breed: what it is a form of (a species id, or another breed's). */
  basedOn?: string
  /** The page's name in each language it has a page in. */
  name: Partial<Record<Lang, string>> & { vi: string }
  /** A breed's other names (Vietnamese and the trade names), what its variety is matched against. */
  alt?: string[]
  url: Partial<Record<Lang, string>> & { vi: string }
  /** One photo from the page (about 480 px wide). */
  img?: string
}
/** `shards`: how many facts shards the build wrote for the agent (facts.ts); the script's own catalog has none. */
export type Catalog = { version: 1; entries: CatalogEntry[]; shards?: number }

type Page<P> = { id: string; scientificName?: string; synonyms?: string[]; basedOn?: string; photos: P[]; t: { name: string; altNames: string[]; slug: string } }
type Pages<P> = { species: Page<P>[]; breeds: Page<P>[]; plants: Page<P>[] }
/** One language's pages; `at` gives this language's address of a Vietnamese path, or undefined where it has none. */
export type LangPages<P = { url: string }> = { lang: Lang; pages: Pages<P>; at: (viPath: string) => string | undefined }

/** Vietnamese first: it has every page; the others add their names and addresses. */
export function buildCatalog<P>(langs: LangPages<P>[], thumb: (photo: P) => string): Catalog {
  const vi = langs.find(l => l.lang === 'vi')
  if (!vi) throw new Error('buildCatalog needs the Vietnamese pages')
  const kinds = [['species', 'ca'], ['breeds', 'ca'], ['plants', 'cay']] as const
  const entries: CatalogEntry[] = []
  for (const [key, section] of kinds) {
    const byId = langs.map(l => ({ ...l, ids: new Map(l.pages[key].map(x => [x.id, x])) }))
    for (const p of vi.pages[key]) {
      const url = vi.at(`/vi/${section}/${p.t.slug}/`)
      if (!url) continue
      const e: CatalogEntry = { id: p.id, kind: key === 'species' ? 'species' : key === 'breeds' ? 'breed' : 'plant', name: { vi: p.t.name }, url: { vi: url } }
      if (p.scientificName) e.sci = p.scientificName
      if (p.synonyms?.length) e.syn = p.synonyms
      if (p.basedOn) e.basedOn = p.basedOn
      if (key === 'breeds' && p.t.altNames.length) e.alt = p.t.altNames
      if (p.photos[0]) e.img = thumb(p.photos[0])
      for (const other of byId) {
        if (other.lang === 'vi') continue
        const o = other.ids.get(p.id)
        const at = o && other.at(`/vi/${section}/${o.t.slug}/`)
        if (o && at) { e.name[other.lang] = o.t.name; e.url[other.lang] = at }
      }
      entries.push(e)
    }
  }
  return { version: 1, entries }
}
