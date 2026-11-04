import type { Content, Series } from '@aq/schema'
import type { Inline } from '@aq/schema/app-page'
import { GUIDE_KIND_LABELS } from './format'
import { translator, type Lang } from './i18n'
import { guideImage } from './mentions'
import { clock, hours, seriesGuides, seriesSeconds } from './video'

/**
 * What a video series' page shows, put together once for the page (pages/video/[slug].astro) and for the app's copy
 * of it (lib/app-page.ts), so the two can't differ: its one line (its counts, then the playlist and channel it follows,
 * linked), and its guides in the playlist's order, each with its picture, its subject and parts (`about`), and its length.
 */
export function seriesParts(lang: Lang, c: Content, s: Series) {
  const t = translator(lang)
  const guides = seriesGuides(c, s)
  const counts = `${t('{n} bài', { n: guides.length })} · ${t('{time} video', { time: hours(lang, seriesSeconds(c, s)) })}`
  const line: Inline[] = [`${counts} · ${t('theo playlist “')}`, { text: s.title, href: `https://www.youtube.com/playlist?list=${s.playlistId}` }, `${t('” của kênh')} `, { text: s.channel, href: s.channelUrl }]
  return {
    line,
    guides: guides.map(g => ({
      g,
      photo: guideImage(c, g),
      about: `${t(GUIDE_KIND_LABELS[g.kind]!)}${g.video.chapters.length > 1 ? ` · ${t('{n} đoạn', { n: g.video.chapters.length })}` : ''}`,
      length: clock(g.video.durationSec),
    })),
  }
}
