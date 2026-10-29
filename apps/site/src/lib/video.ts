import type { Content, GuideEntity, Localized, Photo, Series } from '@aq/schema'

type VideoGuide = Localized<GuideEntity> & { video: NonNullable<GuideEntity['video']> }
export const isVideo = (g: Localized<GuideEntity>): g is VideoGuide => !!g.video

/** 1:05 or 1:02:03. */
export function clock(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = String(Math.floor(sec % 60)).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}

/** ISO 8601 duration for schema.org (PT29M15S). */
export const isoDuration = (sec: number) => `PT${Math.floor(sec / 3600) ? `${Math.floor(sec / 3600)}H` : ''}${Math.floor((sec % 3600) / 60)}M${Math.floor(sec % 60)}S`

export const watchUrl = (id: string, start = 0) => `https://www.youtube.com/watch?v=${id}${start ? `&t=${start}s` : ''}`

/**
 * The video's thumbnail as the guide's picture (share preview), credited to the channel. Card thumb: hqdefault (480×360,
 * letterboxed 16:9), which a 16:9 box with object-fit: cover crops to exactly the picture.
 */
export function videoPhoto(v: NonNullable<GuideEntity['video']>): Photo {
  const t = v.thumb ?? { url: `https://i.ytimg.com/vi/${v.youtubeId}/mqdefault.jpg`, width: 320, height: 180 }
  return { url: t.url, thumb: `https://i.ytimg.com/vi/${v.youtubeId}/hqdefault.jpg`, width: t.width, height: t.height, licence: 'YouTube', author: v.channel, sourceUrl: watchUrl(v.youtubeId), source: 'youtube' }
}

/** Guides of a series in the creator's order. */
export const seriesGuides = (c: Content, s: Series): VideoGuide[] =>
  c.guides.filter(isVideo).filter(g => g.video.series?.id === s.id).sort((a, b) => a.video.series!.position - b.video.series!.position)

export const seriesOf = (c: Content, g: Localized<GuideEntity>) => (g.video?.series ? c.series.find(s => s.id === g.video!.series!.id) : undefined)

/** Total running time of a series' published guides. */
export const seriesSeconds = (c: Content, s: Series) => seriesGuides(c, s).reduce((n, g) => n + g.video.durationSec, 0)

/** Running time in words: "48 phút", "5 giờ 10 phút". */
export function hours(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h ? `${h} giờ${m ? ` ${m} phút` : ''}` : `${m} phút`
}

/** Video guides for the homepage: the first parts of each series (largest first), then their next parts. */
export function homeVideos(c: Content, n = 4): VideoGuide[] {
  const lists = c.series.map(s => seriesGuides(c, s).filter(g => g.t.quality.indexable)).filter(l => l.length).sort((a, b) => b.length - a.length)
  const out: VideoGuide[] = []
  for (let i = 0; out.length < n && lists.some(l => l[i]); i++) for (const l of lists) if (l[i] && out.length < n) out.push(l[i]!)
  return out
}
