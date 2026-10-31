import type { Candidate } from './gallery'

/** Openverse's API: its JSON and the requests left today (x-ratelimit-available-*-sustained). */
export type OpenverseApi = (url: string) => Promise<{ json: unknown; remaining: number }>
type Result = { id: string; url: string; creator?: string | null; license: string; license_version?: string | null; foreign_landing_url: string; width?: number | null; height?: number | null; source: string; mature?: boolean }

/**
 * Openverse's licence (`license` + `license_version`) as the site writes licences, for the open ones a commercial site
 * may use; undefined for any other (NC, ND, sampling).
 */
export function openverseLicence(license: string, version?: string | null): string | undefined {
  const v = version ? ` ${version}` : ''
  if (license === 'cc0') return `CC0${v}`
  if (license === 'pdm') return `Public Domain Mark${v}`
  if (license === 'by') return `CC BY${v}`
  if (license === 'by-sa') return `CC BY-SA${v}`
  return undefined
}

/** Anonymous clients get pages of at most 20. */
export const OPENVERSE_PAGE = 20
/** A Flickr photo address: /<server>/<id>_<secret>[_size].jpg; `_z` is its 640 px size, enough for a contact sheet. */
const FLICKR = /^https:\/\/(?:live|farm\d+)\.staticflickr\.com\/\d+\/(\d+)_[0-9a-f]+(?:_[a-z0-9])?\.jpg$/

/**
 * One page of Openverse's open-licence photos matching the name; Flickr's are kept: Commons and iNaturalist are read
 * directly, and its other sources are museum objects, scanned book plates and stock photos, rarely a living fish or
 * plant. (Filtered here: Openverse's own source filter makes the query slow enough to time out.) ≥ 800 px; credited to
 * the photographer, linking the photo's Flickr page. `next`: the following page, null at the end.
 */
export async function openversePage(name: string, page: number, api: OpenverseApi): Promise<{ cands: Candidate[]; next: number | null; remaining: number }> {
  const q = new URLSearchParams({ q: `"${name}"`, license: 'by,by-sa,cc0,pdm', mature: 'false', page_size: String(OPENVERSE_PAGE), page: String(page) })
  const r = await api(`https://api.openverse.org/v1/images/?${q}`)
  const body = r.json as { results?: Result[]; page_count?: number }
  const cands: Candidate[] = []
  for (const x of body.results ?? []) {
    const licence = openverseLicence(x.license, x.license_version)
    const m = x.url.match(FLICKR)
    if (x.source !== 'flickr' || !licence || !m || x.mature || Math.max(x.width ?? 0, x.height ?? 0) < 800) continue
    cands.push({
      key: `flickr:${m[1]}`, url: x.url, thumb: x.url.replace(/(?:_[a-z0-9])?\.jpg$/, '_z.jpg'), width: x.width!, height: x.height!, licence,
      author: x.creator?.trim() || 'Flickr', sourceUrl: x.foreign_landing_url,
    })
  }
  return { cands, next: page < (body.page_count ?? 0) ? page + 1 : null, remaining: r.remaining }
}
