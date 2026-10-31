import { parse } from 'node-html-parser'
import { slugify } from '@aq/schema/slug'
import type { Content, GuideEntity, Localized, Photo, Series } from '@aq/schema'
import { translator, type Lang } from './i18n'
import { photoMark } from './cite'

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
export function hours(lang: Lang, sec: number): string {
  const t = translator(lang)
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h ? (m ? t('{h} giờ {m} phút', { h, m }) : t('{h} giờ', { h })) : t('{m} phút', { m })
}

/** Video guides for the homepage: the first parts of each series (largest first), then their next parts. */
export function homeVideos(c: Content, n = 4): VideoGuide[] {
  const lists = c.series.map(s => seriesGuides(c, s).filter(g => g.t.quality.indexable)).filter(l => l.length).sort((a, b) => b.length - a.length)
  const out: VideoGuide[] = []
  for (let i = 0; out.length < n && lists.some(l => l[i]); i++) for (const l of lists) if (l[i] && out.length < n) out.push(l[i]!)
  return out
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Each section's pictures after its first paragraph (or list): the open-licence photo, then stills from the video
 * whose buttons play the video from that moment (VideoPlayer's click handler).
 */
export function illustrate(lang: Lang, html: string, v: NonNullable<GuideEntity['video']>): string {
  if (!v.figures?.length) return html
  const t = translator(lang)
  const root = parse(html)
  const byHeading = new Map(v.figures.map(f => [f.heading, f]))
  for (const h of root.querySelectorAll('h3')) {
    const f = byHeading.get(h.textContent.replace(/\s+/g, ' ').trim())
    if (!f) continue
    const photo = f.photo
      ? `<figure class="vphoto"><img src="${esc(f.photo.url)}" width="${f.photo.width}" height="${f.photo.height}" alt="${esc(f.photo.caption ?? '')}" loading="lazy"><figcaption>${esc(f.photo.caption ?? '')}${photoMark(lang, f.photo)}</figcaption></figure>`
      : ''
    const moments = f.moments.length
      ? `<div class="moments"><p class="mh">${t('Trong video')}</p><ul>${f.moments.map(m => `<li><button type="button" class="moment" data-t="${m.t}" data-vp-for="${esc(v.youtubeId)}"><span class="visually-hidden">${t('Xem video từ')}</span> <img src="${esc(m.url)}" width="${m.width}" height="${m.height}" alt="" loading="lazy"> <span class="mt"><span aria-hidden="true">▶</span> ${clock(m.t)}</span> <span class="mc">${esc(m.caption)}</span></button></li>`).join('')}</ul></div>`
      : ''
    const after = h.nextElementSibling && ['P', 'UL', 'OL'].includes(h.nextElementSibling.tagName) ? h.nextElementSibling : h
    after.insertAdjacentHTML('afterend', `<div class="vfigs">${photo}${moments}</div>`)
  }
  return root.toString()
}

export type Channel = { slug: string; name: string; url: string; guides: VideoGuide[]; singles: VideoGuide[]; series: Series[] }

/** Video guides by YouTube channel (newest first), with the channel's series and its single videos. */
export function videoChannels(c: Content): Channel[] {
  const by = new Map<string, Channel>()
  for (const g of c.guides.filter(isVideo)) {
    const slug = slugify(g.video.channel) || 'kenh'
    const ch = by.get(slug) ?? by.set(slug, { slug, name: g.video.channel, url: g.video.channelUrl, guides: [], singles: [], series: [] }).get(slug)!
    ch.guides.push(g)
    const s = seriesOf(c, g)
    if (!s) ch.singles.push(g)
    else if (!ch.series.includes(s)) ch.series.push(s)
  }
  const newest = (a: VideoGuide, b: VideoGuide) => (b.video.publishedAt ?? '').localeCompare(a.video.publishedAt ?? '')
  for (const ch of by.values()) { ch.guides.sort(newest); ch.singles.sort(newest) }
  return [...by.values()].sort((a, b) => b.guides.length - a.guides.length || a.name.localeCompare(b.name))
}
