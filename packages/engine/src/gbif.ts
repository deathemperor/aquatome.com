export type Taxon = { canonicalName: string; order?: string; family?: string; genus?: string; matchType: string }
type Match = { canonicalName?: string; species?: string; rank?: string; status?: string; matchType: string; order?: string; family?: string; genus?: string }

/** GBIF backbone match; null when GBIF can't resolve the name to a species-level taxon. Synonyms resolve to the accepted species. */
export async function gbifMatch(name: string, http: (url: string) => Promise<unknown>, cache: Record<string, Taxon | null>): Promise<Taxon | null> {
  if (name in cache) return cache[name] ?? null
  const m = (await http(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(name)}`)) as Match
  const ok = m.matchType !== 'NONE' && m.matchType !== 'HIGHERRANK' && m.canonicalName
  const accepted = m.status === 'SYNONYM' && m.rank === 'SPECIES' && m.species ? m.species : m.canonicalName
  const t: Taxon | null = ok ? { canonicalName: accepted!, order: m.order, family: m.family, genus: m.genus, matchType: m.matchType } : null
  cache[name] = t
  return t
}
