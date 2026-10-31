import { createHash } from 'node:crypto'
import type { Candidate } from './gallery'

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

/** iNaturalist's research-grade observations as a GBIF dataset: read from iNaturalist itself instead. */
export const INAT_DATASET = '50c9509d-22c7-4a22-a47d-8c48425ef4a7'

/**
 * A GBIF media item's own licence (a URL or a code) as the site writes licences, for the open ones a commercial site may
 * use; undefined for anything else ("Usage Conditions Apply", NC, ND, none). The occurrence record's licence covers its
 * data, not the photo, so it is never used for one.
 */
export function gbifLicence(raw?: string | null): string | undefined {
  const l = (raw ?? '').toLowerCase().trim()
  if (/publicdomain\/zero|^cc0/.test(l)) return 'CC0 1.0'
  if (/publicdomain\/mark/.test(l)) return 'Public Domain Mark 1.0'
  const m = l.match(/licenses\/(by|by-sa)\/(\d\.\d)\/?/) ?? l.match(/^cc[_ -](by|by[_ -]sa)[_ -](\d)[_.](\d)$/)
  if (!m) return undefined
  const kind = m[1]!.replace(/[_ ]/g, '-').toUpperCase()
  return `CC ${kind} ${m[3] ? `${m[2]}.${m[3]}` : m[2]}`
}

/** GBIF's backbone key for a name (the accepted species for a synonym); null when GBIF can't place it at species level. */
export async function gbifUsageKey(name: string, http: (url: string) => Promise<unknown>): Promise<number | null> {
  const m = (await http(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(name)}`)) as Match & { usageKey?: number; acceptedUsageKey?: number }
  if (m.matchType === 'NONE' || m.matchType === 'HIGHERRANK') return null
  return m.acceptedUsageKey ?? m.usageKey ?? null
}

type Occurrence = { key: number; datasetKey: string; recordedBy?: string; media?: { type?: string; identifier?: string; license?: string; creator?: string; rightsHolder?: string }[] }
const GBIF_PAGE = 100
/** GBIF serves a copy of every occurrence photo at a fixed address and size (its image cache). */
export const gbifImage = (occurrence: number, identifier: string, size: string) =>
  `https://api.gbif.org/v1/image/cache/fit-in/${size}/occurrence/${occurrence}/media/${createHash('md5').update(identifier).digest('hex')}`

/**
 * One page of GBIF occurrence photos of a taxon: observations and living collections (zoos, aquaria, gardens), not
 * preserved specimens; not iNaturalist's (read directly); only photos whose own licence is open. GBIF gives no pixel
 * size, so each is measured (`size`, its 1200 px copy) and kept at ≥ 800 px. `next`: the following offset, null at the end.
 */
export async function gbifMediaPage(key: number, offset: number, http: (url: string) => Promise<unknown>, size: (url: string) => Promise<{ width: number; height: number } | null>): Promise<{ cands: Candidate[]; next: number | null }> {
  const basis = ['HUMAN_OBSERVATION', 'MACHINE_OBSERVATION', 'LIVING_SPECIMEN', 'OCCURRENCE'].map(b => `&basisOfRecord=${b}`).join('')
  const r = (await http(`https://api.gbif.org/v1/occurrence/search?taxonKey=${key}&mediaType=StillImage${basis}&limit=${GBIF_PAGE}&offset=${offset}`)) as { results: Occurrence[]; endOfRecords: boolean }
  const cands: Candidate[] = []
  for (const o of r.results) {
    if (o.datasetKey === INAT_DATASET) continue
    for (const m of o.media ?? []) {
      const licence = gbifLicence(m.license)
      if (m.type !== 'StillImage' || !m.identifier || !licence) continue
      const url = gbifImage(o.key, m.identifier, '1200x')
      const dim = await size(url).catch(() => null)
      if (!dim || Math.max(dim.width, dim.height) < 800) continue
      cands.push({
        key: `gbif:${o.key}:${url.slice(-16)}`, url, thumb: gbifImage(o.key, m.identifier, '500x'), ...dim, licence,
        author: m.creator?.trim() || m.rightsHolder?.trim() || o.recordedBy?.trim() || 'GBIF', sourceUrl: `https://www.gbif.org/occurrence/${o.key}`,
      })
    }
  }
  return { cands, next: r.endOfRecords || !r.results.length ? null : offset + GBIF_PAGE }
}
