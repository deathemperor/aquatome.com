import { createHash } from 'node:crypto'
import type { Candidate } from './gallery'

export type Taxon = { canonicalName: string; phylum?: string; class?: string; order?: string; family?: string; genus?: string; matchType: string }
type Match = { canonicalName?: string; species?: string; rank?: string; status?: string; matchType: string; phylum?: string; class?: string; order?: string; family?: string; genus?: string }

/**
 * Names GBIF's backbone matches, fuzzily, to another animal, each checked by a person against the pages that use them
 * (2026-11-13): the name the backbone is asked instead, or null where it lacks the species and the checklists GBIF indexes
 * are read (gbifSearchTaxon). The group check (pageTaxon) refuses a worm for a catfish; a fish matched to another fish
 * only a person sees. Kept out of _gbif-names.json, which the sweep clears of them (page-folds.ts).
 */
export const MISMATCHED: Readonly<Record<string, string | null>> = {
  // The skunk cory, moved to Brochis in 2024: the backbone's nearest "Brochis arcuata" is a tube worm's synonym.
  'Brochis arcuata': 'Corydoras arcuatus',
  'Brochis arcuatus': 'Corydoras arcuatus',
  // A torrent catfish from the Minjiang the backbone lacks: it took another species, L. chenghaiensis.
  'Liobagrus chengduensis': null,
  // The rosy tetra: the backbone took Megalamphodus roseus, another tetra (Hyphessobrycon roseus).
  'Megalamphodus rosaceus': 'Hyphessobrycon rosaceus',
}

/** GBIF backbone match; null when GBIF can't resolve the name to a species-level taxon. Synonyms resolve to the accepted species. */
export async function gbifMatch(name: string, http: (url: string) => Promise<unknown>, cache: Record<string, Taxon | null>): Promise<Taxon | null> {
  if (name in MISMATCHED) {
    const instead = MISMATCHED[name]
    return instead ? gbifMatch(instead, http, cache) : gbifSearchTaxon(name, http)
  }
  if (name in cache) return cache[name] ?? null
  const m = (await http(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(name)}`)) as Match
  const ok = m.matchType !== 'NONE' && m.matchType !== 'HIGHERRANK' && m.canonicalName
  const accepted = m.status === 'SYNONYM' && m.rank === 'SPECIES' && m.species ? m.species : m.canonicalName
  const t: Taxon | null = ok ? { canonicalName: accepted!, ...(m.phylum ? { phylum: m.phylum } : {}), ...(m.class ? { class: m.class } : {}), order: m.order, family: m.family, genus: m.genus, matchType: m.matchType } : null
  cache[name] = t
  return t
}

// GBIF's backbone gives a ray-finned fish no class (2026-11-12: Hyphessobrycon, Corydoras, Polypterus, Acipenser), only
// its phylum and order, so a chordate with none is a fish. The other fish classes it does give.
const FISH = ['Coelacanthi', 'Dipneusti', 'Elasmobranchii', 'Holocephali', 'Petromyzonti']
/** The classes a page's group (prompts/process.md) can be; a fish group by default. */
const GROUP_CLASSES: Record<string, { fish: boolean; classes: string[] }> = {
  shrimp: { fish: false, classes: ['Malacostraca'] },
  snails: { fish: false, classes: ['Gastropoda', 'Bivalvia'] },
  other: { fish: true, classes: [...FISH, 'Malacostraca', 'Branchiopoda', 'Gastropoda', 'Bivalvia', 'Amphibia', 'Anthozoa', 'Echinoidea', 'Clitellata'] },
}

/**
 * The species a page is about, from its scientific name and the synonyms it gives: an exact match on any of them (a
 * synonym resolving to its accepted name included) first, else a fuzzy one that is an animal the page's group can be,
 * else none. An exact match of a class the group can't be is none too. A fuzzy match can be another animal: "Brochis
 * arcuata" matched a tube worm's synonym and made a catfish page "Ditrupa arietina"; the genus Mollienisia, exactly, is a
 * moth's.
 */
export async function pageTaxon(names: string[], group: string | undefined, match: (name: string) => Promise<Taxon | null>): Promise<Taxon | null> {
  const can = GROUP_CLASSES[group ?? 'other'] ?? { fish: true, classes: FISH }
  const wrong = (t: Taxon) => t.class !== undefined && !can.classes.includes(t.class)
  const fits = (t: Taxon) => (t.class !== undefined ? can.classes.includes(t.class) : can.fish && t.phylum === 'Chordata')
  const fuzzy: Taxon[] = []
  for (const name of names) {
    const t = await match(name)
    // An exact name in GBIF's checklists (MISMATCHED) is as good as the backbone's.
    if ((t?.matchType === 'EXACT' || t?.matchType === 'SEARCH') && !wrong(t)) return t
    if (t && t.matchType !== 'EXACT' && t.matchType !== 'SEARCH') fuzzy.push(t)
  }
  return fuzzy.find(fits) ?? null
}

type Usage = { canonicalName?: string; rank?: string; taxonomicStatus?: string; order?: string; family?: string; genus?: string; parentKey?: number }
/**
 * A species too new for GBIF's backbone (Nanosphronemus gemma, described in 2026: the match is NONE) from the checklists
 * GBIF indexes (ZooBank, WoRMS…): its ACCEPTED SPECIES records whose canonical name is exactly this name, as one species.
 * Family and order from a record that gives both, else from its genus's record. Null when there is none, when no record
 * places it, or when records place it in different families. Never a fuzzy or partial name, a synonym or another rank.
 * Not kept in _gbif-names.json, whose readers take its answers as the backbone's.
 */
export async function gbifSearchTaxon(name: string, http: (url: string) => Promise<unknown>): Promise<Taxon | null> {
  const r = (await http(`https://api.gbif.org/v1/species/search?q=${encodeURIComponent(name)}&rank=SPECIES&status=ACCEPTED&limit=50`)) as { results?: Usage[] }
  const same = (r.results ?? []).filter(u => u.canonicalName === name && u.rank === 'SPECIES' && u.taxonomicStatus === 'ACCEPTED')
  if (!same.length) return null
  const placed = same.filter(u => u.order && u.family)
  if (new Set(placed.map(u => u.family)).size > 1) return null
  let at = placed[0]
  for (const u of same) {
    if (at || !u.parentKey) break
    const g = (await http(`https://api.gbif.org/v1/species/${u.parentKey}`)) as Usage
    if (g.order && g.family) at = g
  }
  if (!at) return null
  return { canonicalName: name, order: at.order, family: at.family, genus: same.find(u => u.genus)?.genus ?? name.split(' ')[0], matchType: 'SEARCH' }
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

/**
 * The other scientific names GBIF gives a species: its accepted name, when this one is a synonym (Taxiphyllum barbieri →
 * Ectropothecium barbieri), and the accepted name's synonyms at species rank (no varieties or forms). [] unless GBIF
 * matches the name exactly, at species rank: a fuzzy match can be another plant.
 */
export async function gbifSynonyms(name: string, http: (url: string) => Promise<unknown>): Promise<string[]> {
  const m = (await http(`https://api.gbif.org/v1/species/match?name=${encodeURIComponent(name)}`)) as Match & { usageKey?: number; acceptedUsageKey?: number }
  if (m.matchType !== 'EXACT' || m.rank !== 'SPECIES' || !m.usageKey) return []
  const out = m.acceptedUsageKey && m.species ? [m.species] : []
  for (let offset = 0; offset < 1000; offset += 100) {
    const r = (await http(`https://api.gbif.org/v1/species/${m.acceptedUsageKey ?? m.usageKey}/synonyms?limit=100&offset=${offset}`)) as { results: { canonicalName?: string; rank?: string }[]; endOfRecords: boolean }
    for (const u of r.results) if (u.rank === 'SPECIES' && u.canonicalName) out.push(u.canonicalName)
    if (r.endOfRecords || !r.results.length) break
  }
  return [...new Set(out)].filter(n => n !== name)
}

type Occurrence ={ key: number; datasetKey: string; recordedBy?: string; media?: { type?: string; identifier?: string; license?: string; creator?: string; rightsHolder?: string }[] }
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
