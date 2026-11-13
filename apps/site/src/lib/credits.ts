import type { Photo } from '@aq/schema'
import { alterationNotice } from './gallery'
import { licenceLabel } from './i18n'

/** `authorUrl`: the photographer's own page, an Unsplash photo's (lib/unsplash.ts). */
export type Credit = { author: string; authorUrl?: string; licence: string; sourceUrl: string; what: string; generated?: true; altered?: true }

/** One footer credit per distinct photo shown on a page (CC BY / BY-SA require attribution), with its licence as shown. */
export function creditsFor(photos: (Photo | undefined)[], what = 'Ảnh'): Credit[] {
  const seen = new Set<string>()
  return photos.flatMap(p => {
    if (!p || seen.has(p.url)) return []
    seen.add(p.url)
    return [{ author: p.author, ...(p.authorUrl ? { authorUrl: p.authorUrl } : {}), licence: p.generated ? '' : licenceLabel(p.licence), sourceUrl: p.sourceUrl, what, ...(p.generated ? { generated: true as const } : {}), ...(alterationNotice(p) ? { altered: true as const } : {}) }]
  })
}

export type CreditGroup = { author: string; authorUrl?: string; licence: string; urls: string[]; generated?: true; altered?: true }

/** Same author + licence (+ photographer's page: two of Unsplash's can share a name) → one row, keeping every photo's source link (first-seen order). */
export function groupCredits(credits: Credit[]): CreditGroup[] {
  const groups = new Map<string, CreditGroup>()
  for (const c of credits) {
    const key = `${c.author}\u0000${c.licence}\u0000${c.authorUrl ?? ''}\u0000${!!c.generated}\u0000${!!c.altered}`
    const g = groups.get(key) ?? groups.set(key, { author: c.author, ...(c.authorUrl ? { authorUrl: c.authorUrl } : {}), licence: c.licence, urls: [], ...(c.generated ? { generated: true as const } : {}), ...(c.altered ? { altered: true as const } : {}) }).get(key)!
    g.urls.push(c.sourceUrl)
  }
  return [...groups.values()]
}
