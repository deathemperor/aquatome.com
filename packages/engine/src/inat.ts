import type { Candidate } from './gallery'

type Http = (url: string) => Promise<unknown>
const API = 'https://api.inaturalist.org/v1'

/**
 * iNaturalist's photo licence codes that a commercial site may use (it shows ads and affiliate links), as the site writes
 * them. Anything else (CC BY-NC, the default most observers keep, ND, all rights reserved, none) is left out.
 */
export const INAT_LICENCE: Record<string, string> = { cc0: 'CC0', 'cc-by': 'CC BY', 'cc-by-sa': 'CC BY-SA' }
export const inatLicence = (code: string | null | undefined): string | undefined => INAT_LICENCE[code ?? '']

type Taxa = { results: { id: number; name: string; rank: string; matched_term?: string }[] }
/** Ranks that can be a page's taxon (not a genus or family that merely contains the name). */
const RANKS = new Set(['species', 'subspecies', 'variety', 'form', 'hybrid'])

/**
 * The taxon iNaturalist files a species under: the first name that matches it exactly, or as a synonym iNaturalist
 * knows (its `matched_term`: "Puntius tetrazona" finds Puntigrus tetrazona). `names`: the page's scientific name, then
 * other names for it (GBIF's accepted name). Null when none matches.
 */
export async function inatTaxon(names: string[], http: Http): Promise<number | null> {
  for (const name of [...new Set(names.filter(Boolean))]) {
    const lc = name.toLowerCase()
    const t = (await http(`${API}/taxa?q=${encodeURIComponent(name)}&per_page=10`)) as Taxa
    const ok = t.results.filter(x => RANKS.has(x.rank))
    const hit = ok.find(x => x.name.toLowerCase() === lc) ?? ok.find(x => x.matched_term?.toLowerCase() === lc)
    if (hit) return hit.id
  }
  return null
}

/**
 * Where a taxon's observations were read up to: research-grade ones first, then those whose community ID agrees; each
 * pass oldest first, from the last observation id it read (`after`), so the next engine run continues there and new
 * observations (higher ids) are found later.
 */
export type InatCursor = { taxon: number | null; pass: 'research' | 'agree' | 'done'; after: { research: number; agree: number } }
export const newInatCursor = (taxon: number | null): InatCursor => ({ taxon, pass: taxon ? 'research' : 'done', after: { research: 0, agree: 0 } })

type Obs = {
  id: number; quality_grade?: string; community_taxon_id?: number | null; num_identification_agreements?: number; taxon?: { id: number }
  user?: { login: string; name?: string | null }
  photos?: { id: number; url: string; license_code: string | null; original_dimensions?: { width: number; height: number } }[]
}
const PAGE = 200
/** Photos taken from one observation: its first few (later ones are often the same fish from another angle). */
const PER_OBS = 3

/**
 * Does the community agree on the species? Research grade says so; otherwise (an aquarium or garden photo is "casual",
 * a new one "needs ID") the community taxon must be the observation's taxon, with at least one identification agreeing.
 */
export const agreed = (o: Obs) => o.quality_grade === 'research' || (!!o.community_taxon_id && o.community_taxon_id === o.taxon?.id && (o.num_identification_agreements ?? 0) >= 1)

/**
 * One page (200 observations) of the taxon's observations that have an open-licence photo, captive and cultivated ones
 * included (aquarium photos are what readers want): its photos ≥ 800 px as candidates, and the cursor moved on. One
 * request: the caller keeps to iNaturalist's pace (about one a second) and a daily cap.
 */
export async function inatPage(c: InatCursor, http: Http): Promise<{ cands: Candidate[]; cursor: InatCursor }> {
  if (c.pass === 'done' || !c.taxon) return { cands: [], cursor: { ...c, pass: 'done' } }
  const pass = c.pass
  const grade = pass === 'research' ? 'research' : 'needs_id,casual'
  const r = (await http(`${API}/observations?taxon_id=${c.taxon}&photo_license=cc-by,cc-by-sa,cc0&quality_grade=${grade}&order_by=id&order=asc&id_above=${c.after[pass]}&per_page=${PAGE}`)) as { results: Obs[] }
  const cands: Candidate[] = []
  for (const o of r.results) {
    if (!agreed(o)) continue
    for (const ph of (o.photos ?? []).slice(0, PER_OBS)) {
      const licence = inatLicence(ph.license_code)
      const dim = ph.original_dimensions
      if (!licence || !dim || Math.max(dim.width, dim.height) < 800) continue
      const k = Math.min(1, 1024 / Math.max(dim.width, dim.height)) // the "large" size
      cands.push({
        key: `inat:${ph.id}`, url: ph.url.replace('/square.', '/large.'), thumb: ph.url.replace('/square.', '/medium.'),
        width: Math.round(dim.width * k), height: Math.round(dim.height * k), licence,
        author: o.user?.name || o.user?.login || 'iNaturalist', sourceUrl: `https://www.inaturalist.org/photos/${ph.id}`,
      })
    }
  }
  const last = r.results.at(-1)?.id ?? c.after[pass]
  const after = { ...c.after, [pass]: last }
  const next = r.results.length < PAGE ? (pass === 'research' ? 'agree' : 'done') : pass
  return { cands, cursor: { ...c, pass: next, after } }
}
