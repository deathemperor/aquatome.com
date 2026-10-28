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
