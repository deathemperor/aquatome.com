import { resolveDataCard, type Content, type GlossaryEntity, type GuideEntity, type Localized, type Photo, type PlantEntity, type Range, type SourceId, type SourceInfo, type SpeciesEntity } from '@aq/schema'
import { PAGE_VERSION, pageShard, shardCount, type Block, type Image, type Inline, type PageDoc, type PageShard } from '@aq/schema/app-page'
import { appGlossary, appGuides, appIndex, appPlants, appSpecies, type AppIndex } from './app-index'
import { BREED_KIND } from './breeds'
import { photoCredit } from './cite'
import { VN_WATER, vnClimate } from './climate'
import { avoidWhy } from './companions'
import { figureHtml } from './figures'
import { cardRows } from './card-rows'
import { FIELD_LABELS, fmt, GUIDE_KIND_LABELS } from './format'
import { galleryNote } from './gallery'
import { guideParts } from './guide-page'
import { cleanPhoto } from './home'
import { isVietnamese, localizeLinks, localizePath, served, translator, type Lang, type T } from './i18n'
import { smallSrc } from './img'
import { htmlBlocks } from './page-blocks'
import { plantParts } from './plant-page'
import { OFF_LABELS, sectionParts, type SectionProps } from './section-parts'
import { QUESTION_LABELS } from './sections'
import { speciesParts } from './species-page'
import { clock } from './video'

/**
 * The app's copy of each content page (packages/schema/src/app-page.ts): the page's own pieces, as the site's template
 * puts them together, turned into blocks. Guides, fish, plants and the glossary; the comments, reader photos and shop
 * links of fish and plant pages are not in the copy yet.
 */

type Kind = PageDoc['kind']
const ORIGIN = 'https://aquatome.com'

/** Every path the app index lists in this language: the only pages a "pages" block names. */
export const listedPaths = (lang: Lang, c: Content) => new Set(appIndex(lang, c).items.map(i => i.path))

/** A photo with its credit, as the page credits it. `small`: its small copy, as a card or a thumbnail shows it. */
const image = (lang: Lang, p: Photo | null | undefined, alt?: string, small = false): Image | undefined =>
  p && p.width > 0 && p.height > 0
    ? { src: small ? smallSrc(p) : p.url, w: Math.round(p.width), h: Math.round(p.height), ...(alt ? { alt } : {}), credit: photoCredit(lang, p) }
    : undefined
/** A link to a page as this language's page has it: to its own page, none (the text alone) when it has none. */
const linked = (lang: Lang, text: string, viPath: string): Inline => (served(lang, viPath) ? { text, href: localizePath(lang, viPath) } : text)

/** "Theo Aquarium Breeder", "AquaTome tổng hợp từ 4 nguồn rồi tự viết": the line under a guide's title (SourceCredit). */
function credit(t: ReturnType<typeof translator>, c: Content, g: Localized<GuideEntity>, refs: GuideEntity['refs']): Inline[] {
  if (g.source === 'aquatome') return [`${t('AquaTome tổng hợp từ')} `, { text: t('{n} nguồn', { n: refs?.length ?? 0 }), href: '#nguon' }, ` ${t('rồi tự viết')}`]
  if (g.video) return [`${t('Bài viết của AquaTome, dựa trên video của')} `, { text: g.video.channel, href: g.video.channelUrl }]
  return [`${t('Theo')} `, { text: c.sources[g.source]?.name ?? g.source, href: g.sourceUrl }]
}

/** A page's text as blocks, its links as this language's page has them: to its own pages, none to a page it lacks. */
export const proseBlocks = (lang: Lang, html: string) => htmlBlocks(localizeLinks(html, lang, ORIGIN))

/** "Other pages" (GuideLinks, VideoGuideGrid): those the page shows, the first `max`, that the app index lists. */
function pagesBlock(lang: Lang, listed: Set<string>, title: string, viPaths: string[], max: number): Block[] {
  const paths = viPaths.slice(0, max).map(p => localizePath(lang, p)).filter(p => listed.has(p))
  return paths.length ? [{ t: 'pages', title, paths }] : []
}

/**
 * A species' or plant's text (components/Sections.astro, from the same parts): each section under its question, with
 * the id the page's jump row links (`muc-<key>`); a block's note when it follows a source the data card didn't; the
 * photos between sections; the numbered sources its marks point to, and on what terms they are used.
 */
export function sectionBlocks(lang: Lang, c: Content, props: SectionProps): { blocks: Block[]; unknown: string[] } {
  const t = translator(lang)
  const { range } = fmt(lang)
  const { groups, refs, figAfter } = sectionParts(lang, c, props)
  const fig = (field: string, v: Range | number) => (field === 'tempC' ? `${range(v)}°C` : field === 'sizeCm' || field === 'tankCm' ? `${range(v)} cm` : field === 'gh' ? `${range(v)} dGH` : range(v))
  const blocks: Block[] = []
  const unknown = new Set<string>()
  const prose = (html: string) => { const r = proseBlocks(lang, html); r.unknown.forEach(u => unknown.add(u)); blocks.push(...r.blocks) }
  groups.forEach((sec, i) => {
    blocks.push({ t: 'h', text: t(QUESTION_LABELS[sec.key]), id: `muc-${sec.key}` })
    for (const b of sec.blocks) {
      if (b.off.length) {
        const figures = b.off.map(o => `${t(OFF_LABELS[o.field]!)} ${fig(o.field, o.own)} (${t('bảng:')} ${fig(o.field, o.card)})`).join(', ')
        blocks.push({ t: 'p', c: [`${t('{source} ghi khác bảng dữ liệu:', { source: b.name })} ${figures}.`] })
      }
      prose(b.vi)
    }
    const f = figAfter.get(i)
    if (f) prose(figureHtml(lang, f))
  })
  if (refs.length) {
    blocks.push({
      t: 'refs', title: t('Nguồn'), id: 'nguon', items: refs.map(r => ({ title: r.name, url: r.url })),
      note: t('Các phần trên dịch từ những nguồn này, với sự cho phép của họ. Mỗi đoạn ghi số nguồn của nó.'),
    })
  }
  return { blocks, unknown: [...unknown].sort() }
}

/**
 * A fish's or plant's gallery as its strip shows it (GalleryStrip.astro) and its gallery page lists it: none when the
 * page shows no strip.
 */
function galleryBlock(lang: Lang, sources: Partial<Record<SourceId, SourceInfo>>, name: string, gallery: Photo[], strip: (Photo | null)[], viPath: string): Block[] {
  const t = translator(lang)
  if (!strip.some(Boolean)) return []
  const photos = gallery.flatMap(p => {
    const img = image(lang, p, p.caption ?? name)
    const thumb = smallSrc(p)
    return img ? [{ ...img, ...(thumb !== p.url ? { thumb } : {}) }] : []
  })
  const at = new Map(photos.map((p, i) => [p.src, i]))
  return [{
    t: 'gallery', title: t('Ảnh {name}', { name }), note: galleryNote(t, gallery, sources), photos,
    strip: strip.flatMap(p => (p && at.has(p.url) ? [at.get(p.url)!] : [])),
    ...(served(lang, viPath) ? { href: localizePath(lang, viPath) } : {}),
  }]
}

/** The data card's "Nguồn và độ tin cậy" (DataCard.astro): who gives each figure, and each one's own where they disagree. */
function trustBlock(t: T, lang: Lang, card: SpeciesEntity['dataCard'], sources: Partial<Record<string, { name: string }>>): Block[] {
  const { range } = fmt(lang)
  const rows = cardRows(card)
  if (!rows.length) return []
  const nameOf = (id: string) => sources[id]?.name ?? id
  const named = (id: string) => (lang !== 'vi' && isVietnamese(nameOf(id)) ? `${nameOf(id)} (${t('tiếng Việt')})` : nameOf(id))
  const unit = (field: string) => (field === 'tempC' ? '°C' : field === 'sizeCm' || field === 'tankCm' ? ' cm' : '')
  return [{
    t: 'trust', title: t('Nguồn và độ tin cậy'),
    ...(rows.some(r => r.conflict) ? { legend: t('Các nguồn ghi khác nhau') } : {}),
    rows: rows.map(r => ({
      field: r.field, label: t(FIELD_LABELS[r.field]),
      ...(r.conflict ? { conflict: true as const, note: r.agreed ? t('Mức mọi nguồn cùng khuyên') : t('Mỗi nguồn ghi một mức') } : {}),
      items: (r.conflict ? r.vals : r.vals.slice(0, 1)).map(v => {
        const names = r.conflict ? [v.source] : r.sources
        const tail = r.conflict ? `: ${range(v.value)}${unit(r.field)}` : names.length > 1 ? ` · ${t('cùng một mức')}` : ''
        return `${names.map(named).join(', ')}${tail}`
      }),
    })),
  }]
}

/** "Nuôi ở Việt Nam" (VnClimate.astro): what the fish's temperature range means for a tank in Vietnam. */
function climateBlock(t: T, card: SpeciesEntity['dataCard']): Block[] {
  const temp = resolveDataCard(card.tempC ?? [])
  if (!temp) return []
  const deg = (n: number) => `${`${n}`.replace('.', ',')}°C`
  const fill = (text: string, temps: number[]) => t(text).split('{t}').map((part, i) => `${part}${i < temps.length ? deg(temps[i]!) : ''}`).join('')
  return [{
    t: 'climate', title: t('Nuôi ở Việt Nam'),
    items: vnClimate(temp.value).map(n => ({ label: t(n.label), ok: n.ok, text: fill(n.text, n.temps) })),
    note: `${t('Giả định nước bể trong nhà, không sưởi hay làm lạnh: miền Bắc mùa đông khoảng')} ${VN_WATER.northWinter}°C${t(', miền Nam đêm mát tháng 12–1 khoảng')} ${VN_WATER.southCool}°C${t(', mùa hè tới')} ${VN_WATER.summer}°C${t('. Đo nhiệt độ bể của bạn để chắc chắn.')}`,
  }]
}

/** A species' copy (pages/vi/ca/[slug].astro, from the same parts); `listed` is the app index's paths (listedPaths). */
export async function fishDoc(lang: Lang, c: Content, s: Localized<SpeciesEntity>, listed: Set<string>): Promise<PageDoc> {
  const t = translator(lang)
  const { num } = fmt(lang)
  const at = (viPath: string) => localizePath(lang, viPath)
  const p = await speciesParts(lang, c, s)
  const lead = image(lang, s.photos[0], `${s.t.name}, ${s.scientificName}`)
  const sources = [...new Set(s.sections.map(x => c.sources[x.source]?.name ?? x.source))].join(', ')
  const { blocks: text } = sectionBlocks(lang, c, { sections: p.text.sections, t: p.text.t, self: `species:${s.id}`, selfNames: [s.scientificName, s.t.name, ...s.t.altNames], figures: p.figures.map(photo => ({ photo })), card: s.dataCard })
  // "Nuôi chung" (Companions.astro): the fish to keep with it and away from it; with neither, the tool's link alone.
  const why = avoidWhy(t, p.mates.self.name)
  const mate = (x: Localized<SpeciesEntity>) => { const img = image(lang, cleanPhoto(x.photos), undefined, true); return { path: at(`/vi/ca/${x.t.slug}/`), name: x.t.name, ...(img ? { img } : {}) } }
  const tool = { text: t('Kiểm tra nuôi chung với loài khác →'), href: at(p.tool) }
  const { good, avoid } = p.mates
  const mates: Block = p.showMates
    ? {
      t: 'mates', title: t('Nuôi chung'),
      ...(good.length ? { good: { title: t('Hợp với'), items: good.map(({ s }) => mate(s)) } } : {}),
      ...(avoid.length ? { avoid: { title: t('Tránh'), items: avoid.map(({ s, item, reason }) => ({ ...mate(s), why: why[reason].split('{size}').join(`${num(item.sizeCm!)} cm`) })) } } : {}),
      ...(good.length || avoid.length ? { note: t('Gợi ý theo nhiệt độ, pH, kích thước và tính cách của từng loài.') } : {}),
      tool,
    }
    : { t: 'p', c: [tool] }
  const summary = p.vn && p.summary ? [{
    t: 'summary' as const, title: t('Tóm tắt nhanh'), text: p.summary.summary, items: [p.summary.summary],
    ...(p.summary.mistakes.length ? { mistakes: { title: t('Lỗi hay gặp'), items: p.summary.mistakes } } : {}),
    by: t('AquaTome tóm tắt từ các nguồn bên dưới.'),
  }] : []
  const breeds: Block[] = p.breeds.length ? [{
    t: 'cards', title: t('Các dòng và cá lai từ {name}', { name: s.t.name }),
    items: p.breeds.map((b, i) => { const img = image(lang, p.breedPhotos[i], undefined, true); return { path: at(`/vi/ca/${b.t.slug}/`), name: b.t.name, sub: t(BREED_KIND[b.kind]), ...(img ? { img } : {}) } }),
  }] : []
  const videos: Block[] = p.videos.length ? [{
    t: 'videos', title: 'Video',
    items: p.videos.map(v => ({ youtubeId: v.youtubeId, title: v.title, durationSec: Math.max(0, Math.round(v.durationSec)), lang: (v.lang ?? 'en') === 'vi' ? t('tiếng Việt') : (v.lang ?? 'en').toUpperCase() })),
  }] : []
  return {
    v: PAGE_VERSION,
    kind: 'fish',
    path: at(`/vi/ca/${s.t.slug}/`),
    title: s.t.name,
    sub: s.scientificName,
    where: p.country ? [`${s.family}, `, linked(lang, p.country.t.name, `/vi/nguon-goc/${p.country.parent}/${p.country.id}/`)] : [s.family],
    ...(s.t.altNames.length ? { aka: t('Tên khác: {names}', { names: s.t.altNames.join(', ') }) } : {}),
    ...(p.firstSource ? { credit: [t('Dịch và tổng hợp từ {sources}. Cập nhật {date}.', { sources, date: s.updatedAt })] } : {}),
    ...(lead ? { lead } : {}),
    blocks: [
      ...trustBlock(t, lang, s.dataCard, c.sources),
      mates,
      ...(p.vn ? climateBlock(t, s.dataCard) : []),
      ...galleryBlock(lang, c.sources, s.t.name, p.gallery, p.strip, p.galleryPath),
      ...summary,
      ...text,
      ...breeds,
      ...pagesBlock(lang, listed, t('Bài viết nhắc đến loài này'), p.guides.map(g => `/vi/huong-dan/${g.t.slug}/`), 8),
      ...pagesBlock(lang, listed, t('Có trong video hướng dẫn'), p.videoGuides.map(g => `/vi/huong-dan/${g.t.slug}/`), 6),
      ...videos,
    ],
  }
}

/**
 * A plant's copy (pages/vi/cay/[slug].astro, from the same parts). Its care (difficulty, light, CO₂, growth, place) is
 * the app index's (`plant`), so it isn't repeated here.
 */
export function plantDoc(lang: Lang, c: Content, p: Localized<PlantEntity>, listed: Set<string>): PageDoc {
  const t = translator(lang)
  const parts = plantParts(lang, c, p)
  const lead = image(lang, p.photos[0], `${p.t.name}, ${p.scientificName}`)
  const { blocks: text } = sectionBlocks(lang, c, { sections: p.sections, t: p.t, self: `plant:${p.id}`, selfNames: [p.scientificName, p.t.name, ...p.t.altNames], figures: parts.figures.map(photo => ({ photo })) })
  return {
    v: PAGE_VERSION,
    kind: 'plant',
    path: localizePath(lang, `/vi/cay/${p.t.slug}/`),
    title: p.t.name,
    sub: p.scientificName,
    ...(lead ? { lead } : {}),
    blocks: [
      ...galleryBlock(lang, c.sources, p.t.name, parts.gallery, parts.strip, parts.galleryPath),
      ...text,
      ...pagesBlock(lang, listed, t('Bài viết nhắc đến cây này'), parts.guides.map(g => `/vi/huong-dan/${g.t.slug}/`), 8),
      ...pagesBlock(lang, listed, t('Có trong video hướng dẫn'), parts.videoGuides.map(g => `/vi/huong-dan/${g.t.slug}/`), 6),
    ],
  }
}

/** A glossary term's copy (pages/vi/thuat-ngu/[slug].astro): its English (and Latin) name, then its definition. */
export function glossaryDoc(lang: Lang, g: Localized<GlossaryEntity>): PageDoc {
  const t = translator(lang)
  return {
    v: PAGE_VERSION,
    kind: 'glossary',
    path: localizePath(lang, `/vi/thuat-ngu/${g.t.slug}/`),
    title: g.t.name,
    blocks: [
      { t: 'p', c: g.latin ? [`${t('Tiếng Anh:')} ${g.en}, `, { text: g.latin, i: true }] : [`${t('Tiếng Anh:')} ${g.en}`] },
      ...(g.t.definition ? [{ t: 'p' as const, c: [g.t.definition] }] : []),
    ],
  }
}

/** A guide's copy; `listed` is the app index's paths (listedPaths). */
export function guideDoc(lang: Lang, c: Content, g: Localized<GuideEntity>, listed: Set<string>): PageDoc {
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
  // The page also shows cards for pages the app index leaves out (too thin, not in this language): the app can't draw those.
  const pages = (title: string, viPaths: string[]) => {
    const paths = viPaths.map(at).filter(x => listed.has(x))
    return paths.length ? [{ t: 'pages' as const, title, paths }] : []
  }
  const lead = v ? undefined : image(lang, p.lead)
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
        ...(v.transcribed ? {} : { subtitles: t('Phụ đề tiếng Việt') }),
        ...(v.chapters.length > 1 ? { chapters: v.chapters.map((ch, i) => ({ at: ch.start, title: g.t.chapters?.[i] ?? ch.title })) } : {}),
      },
    } : {}),
    blocks: [
      ...(g.t.summary?.length ? [{ t: 'summary' as const, title: t('Tóm tắt nhanh'), items: g.t.summary }] : []),
      ...blocks,
      ...(g.t.faq?.length ? [{ t: 'faq' as const, title: t('Câu hỏi thường gặp'), items: g.t.faq.map(f => ({ q: f.q, a: f.a })) }] : []),
      ...(p.refs?.length ? [{ t: 'refs' as const, title: t('Nguồn tham khảo'), id: 'nguon', items: p.refs.map(r => ({ title: lang !== 'vi' && isVietnamese(r.title) ? `${r.title} (${t('tiếng Việt')})` : r.title, url: r.url })) }] : []),
      ...pages(p.series && p.pos + 1 < p.inSeries.length ? t('Phần tiếp theo') : t('Bài tiếp theo'), p.next.map(x => `/vi/huong-dan/${x.t.slug}/`)),
      ...pages(t('Loài và cây trong bài'), [...p.species.map(s => `/vi/ca/${s.t.slug}/`), ...p.plants.map(x => `/vi/cay/${x.t.slug}/`)]),
    ],
  }
}

const built = new WeakMap<Content, Map<Lang, Promise<Record<Kind, PageDoc[]>>>>()

/** Every page the app gets in this language, by kind (built once a build: the index and the shards both need them). */
export function appPages(lang: Lang, c: Content): Promise<Record<Kind, PageDoc[]>> {
  const byLang = built.get(c) ?? built.set(c, new Map()).get(c)!
  let docs = byLang.get(lang)
  if (!docs) {
    const listed = listedPaths(lang, c)
    byLang.set(lang, docs = (async () => ({
      guide: appGuides(lang, c).map(g => guideDoc(lang, c, g, listed)),
      fish: await Promise.all(appSpecies(lang, c).map(s => fishDoc(lang, c, s, listed))),
      plant: appPlants(lang, c).map(p => plantDoc(lang, c, p, listed)),
      glossary: appGlossary(lang, c).map(g => glossaryDoc(lang, g)),
    }))())
  }
  return docs
}

/**
 * The level an app must know to draw each kind itself (packages/schema/src/app-page.ts, PageShard). Guides are the first
 * app's (level 1); fish, plant and glossary pages use blocks it shows as "open on the web", so they are level 2.
 */
export const PAGE_LEVELS: Record<Kind, number> = { guide: 1, fish: 2, plant: 2, glossary: 2 }

/**
 * What the app index says of the shards: every kind's count and level (`shards`), and the counts of the level-1 kinds
 * alone (`pages`, guides), as the first app reads them.
 */
export const indexedShards = (counts: Partial<Record<Kind, number>>): Pick<AppIndex, 'pages' | 'shards'> => {
  const kinds = Object.entries(counts) as [Kind, number][]
  return {
    pages: Object.fromEntries(kinds.filter(([k]) => PAGE_LEVELS[k] === 1)),
    shards: Object.fromEntries(kinds.map(([k, n]) => [k, { n, level: PAGE_LEVELS[k] }])),
  }
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
