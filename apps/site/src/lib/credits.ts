import type { Photo } from '@aq/schema'

export type Credit = { author: string; licence: string; sourceUrl: string; what: string }

/** One footer credit per distinct photo shown on a page (CC BY / BY-SA require attribution). */
export function creditsFor(photos: (Photo | undefined)[], what = 'Ảnh'): Credit[] {
  const seen = new Set<string>()
  return photos.flatMap(p => {
    if (!p || seen.has(p.url)) return []
    seen.add(p.url)
    return [{ author: p.author, licence: p.licence, sourceUrl: p.sourceUrl, what }]
  })
}

export type CreditGroup = { author: string; licence: string; urls: string[] }

/** Same author + licence → one row, keeping every photo's source link (first-seen order). */
export function groupCredits(credits: Credit[]): CreditGroup[] {
  const groups = new Map<string, CreditGroup>()
  for (const c of credits) {
    const key = `${c.author}\u0000${c.licence}`
    const g = groups.get(key) ?? groups.set(key, { author: c.author, licence: c.licence, urls: [] }).get(key)!
    g.urls.push(c.sourceUrl)
  }
  return [...groups.values()]
}
