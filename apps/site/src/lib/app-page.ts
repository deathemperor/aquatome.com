import type { Content, GuideEntity, Localized, Photo } from '@aq/schema'
import { PAGE_VERSION, pageShard, shardCount, type Image, type Inline, type PageDoc, type PageShard } from '@aq/schema/app-page'
import { GUIDE_KIND_LABELS } from './format'
import { guideParts } from './guide-page'
import { localizeLinks, localizePath, served, translator, type Lang } from './i18n'
import { htmlBlocks } from './page-blocks'
import { clock } from './video'

/**
 * The app's copy of each content page (packages/schema/src/app-page.ts): the page's own pieces, as the site's template
 * puts them together, turned into blocks. Guides so far; fish, plants and the glossary follow.
 */

type Kind = PageDoc['kind']
const ORIGIN = 'https://aquatome.com'

/** The guides the app index lists, in that language. */
export function appGuides(lang: Lang, c: Content): Localized<GuideEntity>[] {
  return served(lang, '/vi/huong-dan/x/') ? c.guides.filter(g => g.t.quality.indexable) : []
}

const image = (p: Photo | undefined): Image | undefined =>
  p && p.width > 0 && p.height > 0 ? { src: p.url, w: Math.round(p.width), h: Math.round(p.height) } : undefined

/** "Theo Aquarium Breeder", "AquaTome tổng hợp từ 4 nguồn rồi tự viết": the line under a guide's title (SourceCredit). */
function credit(t: ReturnType<typeof translator>, c: Content, g: Localized<GuideEntity>, refs: GuideEntity['refs']): Inline[] {
  if (g.source === 'aquatome') return [`${t('AquaTome tổng hợp từ')} `, { text: t('{n} nguồn', { n: refs?.length ?? 0 }), href: '#nguon' }, ` ${t('rồi tự viết')}`]
  if (g.video) return [`${t('Bài viết của AquaTome, dựa trên video của')} `, { text: g.video.channel, href: g.video.channelUrl }]
  return [`${t('Theo')} `, { text: c.sources[g.source]?.name ?? g.source, href: g.sourceUrl }]
}

/** A page's text as blocks, its links as this language's page has them: to its own pages, none to a page it lacks. */
export const proseBlocks = (lang: Lang, html: string) => htmlBlocks(localizeLinks(html, lang, ORIGIN))

export function guideDoc(lang: Lang, c: Content, g: Localized<GuideEntity>): PageDoc {
  const t = translator(lang)
  const at = (viPath: string) => localizePath(lang, viPath)
  const p = guideParts(lang, c, g)
  const v = g.video
  // As the page's header: its subject, the video's length, the reading time, the part of a series.
  const meta = [
    t(GUIDE_KIND_LABELS[g.kind] ?? g.kind),
    v && t('video {time}', { time: clock(v.durationSec) }),
    t('đọc khoảng {n} phút', { n: p.minutes }),
    p.series && p.pos >= 0 && t('phần {i}/{n}', { i: p.pos + 1, n: p.inSeries.length }),
  ].filter(Boolean).join(' · ')
  const { blocks } = proseBlocks(lang, p.prose)
  const pages = (title: string, viPaths: string[]) => {
    const paths = viPaths.filter(x => served(lang, x)).map(at)
    return paths.length ? [{ t: 'pages' as const, title, paths }] : []
  }
  const lead = v ? undefined : image(p.ph)
  return {
    v: PAGE_VERSION,
    kind: 'guide',
    path: at(`/vi/huong-dan/${g.t.slug}/`),
    title: g.t.name,
    meta,
    credit: credit(t, c, g, p.refs),
    ...(lead ? { lead } : {}),
    ...(v ? {
      video: {
        youtubeId: v.youtubeId, title: v.title, channel: v.channel, durationSec: v.durationSec,
        ...(v.chapters.length > 1 ? { chapters: v.chapters.map((ch, i) => ({ at: ch.start, title: g.t.chapters?.[i] ?? ch.title })) } : {}),
      },
    } : {}),
    blocks: [
      ...(g.t.summary?.length ? [{ t: 'summary' as const, title: t('Tóm tắt nhanh'), items: g.t.summary }] : []),
      ...blocks,
      ...(g.t.faq?.length ? [{ t: 'faq' as const, title: t('Câu hỏi thường gặp'), items: g.t.faq.map(f => ({ q: f.q, a: f.a })) }] : []),
      ...(p.refs?.length ? [{ t: 'refs' as const, title: t('Nguồn tham khảo'), id: 'nguon', items: p.refs.map(r => ({ title: r.title, url: r.url })) }] : []),
      ...pages(p.series && p.pos + 1 < p.inSeries.length ? t('Phần tiếp theo') : t('Bài tiếp theo'), p.next.map(x => `/vi/huong-dan/${x.t.slug}/`)),
      ...pages(t('Loài và cây trong bài'), [...p.species.map(s => `/vi/ca/${s.t.slug}/`), ...p.plants.map(x => `/vi/cay/${x.t.slug}/`)]),
    ],
  }
}

const built = new WeakMap<Content, Record<Kind, PageDoc[]>>()

/** Every page the app gets in this language, by kind (built once a build: the index and the shards both need them). */
export function appPages(lang: Lang, c: Content): Record<Kind, PageDoc[]> {
  let docs = built.get(c)
  if (!docs) built.set(c, docs = { guide: appGuides(lang, c).map(g => guideDoc(lang, c, g)), fish: [], plant: [], glossary: [] })
  return docs
}

/** How many shards each kind has (for the app index), and the shards themselves. */
export function shardsOf(docs: Record<Kind, PageDoc[]>): { counts: Partial<Record<Kind, number>>; shards: { kind: Kind; n: number; shard: PageShard }[] } {
  const counts: Partial<Record<Kind, number>> = {}
  const shards: { kind: Kind; n: number; shard: PageShard }[] = []
  for (const [kind, list] of Object.entries(docs) as [Kind, PageDoc[]][]) {
    if (!list.length) continue
    const count = shardCount(list.length)
    counts[kind] = count
    const by = Array.from({ length: count }, () => ({ v: PAGE_VERSION, pages: {} }) as PageShard)
    for (const d of list) by[pageShard(d.path, count)]!.pages[d.path] = d
    by.forEach((shard, n) => shards.push({ kind, n, shard }))
  }
  return { counts, shards }
}
