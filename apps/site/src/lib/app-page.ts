import { resolveDataCard, type Content, type GlossaryEntity, type GuideEntity, type Localized, type Photo, type PlantEntity, type Range, type Series, type SourceId, type SourceInfo, type SpeciesEntity } from '@aq/schema'
import { PAGE_VERSION, pageShard, shardCount, type Block, type Image, type Inline, type PageDoc, type PageShard } from '@aq/schema/app-page'
import { appBreeds, appEquipment, appGlossary, appGuides, appIndex, appPlants, appSeries, appSpecies, headPhoto, photoBox, type AppIndex } from './app-index'
import { breedParts } from './breed-page'
import { BREED_KIND, type Breed } from './breeds'
import { photoCredit } from './cite'
import { dmy } from './products'
import { VN_WATER, vnClimate } from './climate'
import { avoidWhy } from './companions'
import type { CategoryUse } from './equipment'
import { equipmentParts } from './equipment-page'
import { figureHtml } from './figures'
import { cardRows } from './card-rows'
import { nameAndSci, sciBeside } from './sci'
import { FIELD_LABELS, fmt, GUIDE_KIND_LABELS } from './format'
import { galleryNote } from './gallery'
import { glossaryParts, USED_IN_SHOWN } from './glossary-page'
import { guideParts } from './guide-page'
import { cleanPhoto } from './home'
import { appLinks, appPath, isVietnamese, served, translator, type Lang, type T } from './i18n'
import { resizeOf, smallSrc } from './img'
import { guideImage } from './mentions'
import { htmlBlocks } from './page-blocks'
import { plantParts } from './plant-page'
import type { RangeParts } from './range'
import { OFF_LABELS, sectionParts, type SectionProps } from './section-parts'
import { QUESTION_LABELS } from './sections'
import { seriesParts } from './series-page'
import { speciesParts } from './species-page'
import { commentsKey, photosKey } from './talk'
import { clock, guideChapters, seriesGuides, watchUrl } from './video'

/**
 * The app's copy of each content page (packages/schema/src/app-page.ts): the page's own pieces, as the site's template
 * puts them together, turned into blocks. Guides, fish, plants, the glossary, video series and equipment; the comments,
 * reader photos and shop links of fish and plant pages are not in the copy yet.
 */

type Kind = PageDoc['kind']
const ORIGIN = 'https://aquatome.com'

/** Every path the app index lists in this language: the only pages a "pages" block names. */
export const listedPaths = (lang: Lang, c: Content) => new Set(appIndex(lang, c).items.map(i => i.path))

/** A photo with its credit, as the page credits it. `small`: its small copy, as a card or a thumbnail shows it. */
const image = (lang: Lang, p: Photo | null | undefined, alt?: string, small = false): Image | undefined =>
  p && !(small && p.generated) && p.width > 0 && p.height > 0
    ? { src: small ? smallSrc(p) : p.url, w: Math.round(p.width), h: Math.round(p.height), ...(alt ? { alt } : {}), credit: photoCredit(lang, p) }
    : undefined
/**
 * A page's head, the photo its card in the app index shows (headPhoto, the guide's and the series' card photo), with where
 * the fish is (`box`, photoBox): the whole area where the cards' frames refuse the photo, so a reader that knows the box
 * shows it whole by the frames rule, never nothing (the Design Lead, 13 Nov).
 */
const headImage = (lang: Lang, p: Photo | null | undefined, alt?: string) => {
  const img = image(lang, p, alt)
  const box = img && photoBox(p!)
  return img && box ? { ...img, box } : img
}
/** A link to a page as this language's page has it: to its own page, none (the text alone) when it has none. */
const linked = (lang: Lang, text: string, viPath: string): Inline => (served(lang, viPath) ? { text, href: appPath(lang, viPath) } : text)

/**
 * "Theo Aquarium Breeder", "AquaTome tổng hợp từ 4 nguồn rồi tự viết": the line under a guide's title (SourceCredit). A
 * video guide's names no channel: its sources (refs, the video first) say whose it is.
 */
function credit(t: ReturnType<typeof translator>, c: Content, g: Localized<GuideEntity>, refs: GuideEntity['refs']): Inline[] {
  if (g.source === 'aquatome' || g.video) return [`${t('AquaTome tổng hợp từ')} `, { text: t('{n} nguồn', { n: (g.video ? 1 : 0) + (refs?.length ?? 0) }), href: '#nguon' }, ` ${t('rồi tự viết')}`]
  return [`${t('Theo')} `, { text: c.sources[g.source]?.name ?? g.source, href: g.sourceUrl }]
}

/** A page's text as blocks, its links as this language's page has them: to its own pages, none to a page it lacks. */
export const proseBlocks = (lang: Lang, html: string) => htmlBlocks(appLinks(html, lang, ORIGIN))

/** "Other pages" (GuideLinks, VideoGuideGrid): those the page shows, the first `max`, that the app index lists. */
function pagesBlock(lang: Lang, listed: Set<string>, title: string, viPaths: string[], max: number): Block[] {
  const paths = viPaths.slice(0, max).map(p => appPath(lang, p)).filter(p => listed.has(p))
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
  const { groups, refs, note, figAfter, wild, wildAt } = sectionParts(lang, c, props)
  const fig = (field: string, v: Range | number) => (field === 'tempC' ? `${range(v)}°C` : field === 'sizeCm' || field === 'tankCm' ? `${range(v)} cm` : field === 'gh' ? `${range(v)} dGH` : range(v))
  const blocks: Block[] = []
  const unknown = new Set<string>()
  const prose = (html: string) => { const r = proseBlocks(lang, html); r.unknown.forEach(u => unknown.add(u)); blocks.push(...r.blocks) }
  // "Phân bố tự nhiên" (RangeBlock.astro): its words, its sources' sentences, its records in words, then the map as a picture.
  const wildBlocks = (w: RangeParts) => {
    blocks.push({ t: 'h', text: w.title, id: 'muc-range' })
    prose(w.words)
    if (w.said) { blocks.push({ t: 'p', c: [{ text: w.said.title, b: true }] }); prose(w.said.html) }
    if (w.records) prose(w.records)
    if (w.map && w.credit) {
      blocks.push({
        t: 'figure',
        img: { src: `${ORIGIN}${w.map.file}`, w: w.map.w, h: w.map.h, alt: w.map.alt, credit: { text: w.credit.text, licence: w.credit.licence, url: w.credit.url } },
        caption: [`${w.map.caption} ${w.credit.base}.`],
      })
    }
  }
  groups.forEach((sec, i) => {
    if (wild && i === wildAt) wildBlocks(wild)
    blocks.push({ t: 'h', text: t(QUESTION_LABELS[sec.key]), id: `muc-${sec.key}` })
    for (const b of sec.blocks) {
      prose(b.vi)
      if (b.off.length) {
        const figures = b.off.map(o => `${t(OFF_LABELS[o.field]!)} ${fig(o.field, o.card)}`).join(', ')
        blocks.push({ t: 'p', c: [`${t('Thông số ở đầu trang ghi khác đoạn này:')} ${figures}.`] })
      }
    }
    const f = figAfter.get(i)
    if (f) prose(figureHtml(lang, f))
  })
  if (wild && wildAt === groups.length) wildBlocks(wild)
  if (refs.length) {
    blocks.push({
      t: 'refs', title: t('Nguồn'), id: 'nguon', items: refs.map(r => ({ title: r.name, url: r.url })), note,
    })
  }
  return { blocks, unknown: [...unknown].sort() }
}

/**
 * A fish's, breed's or plant's gallery as its strip shows it (GalleryStrip.astro) and its gallery page lists it: none when
 * the page shows no strip; no link when it has no gallery page (`viPath`).
 */
function galleryBlock(lang: Lang, sources: Partial<Record<SourceId, SourceInfo>>, name: string, gallery: Photo[], strip: (Photo | null)[], viPath: string | undefined): Block[] {
  const t = translator(lang)
  // The installed app's full album grid does not draw credit labels. Keep AI pictures out until it does.
  gallery = gallery.filter(p => !p.generated)
  strip = strip.map(p => p?.generated ? null : p)
  if (!strip.some(Boolean)) return []
  // Each photo with where the fish is (`box`, photoBox), as a page's head has it, so the app frames the album's tiles by
  // the fish. Its small copy only where that is the photo resized (resizeOf): another framing would move the fish off
  // its box, so the row then loads the photo itself (the Design Lead, 13 Nov).
  const photos = gallery.flatMap(p => {
    const img = image(lang, p, p.caption ?? name)
    const thumb = smallSrc(p), box = img && photoBox(p)
    return img ? [{ ...img, ...(box ? { box } : {}), ...(thumb !== p.url && resizeOf(p, thumb) ? { thumb } : {}) }] : []
  })
  const at = new Map(photos.map((p, i) => [p.src, i]))
  return [{
    t: 'gallery', title: t('Ảnh {name}', { name }), note: galleryNote(t, gallery, sources), photos,
    strip: strip.flatMap(p => (p && at.has(p.url) ? [at.get(p.url)!] : [])),
    ...(viPath && served(lang, viPath) ? { href: appPath(lang, viPath) } : {}),
  }]
}

/** The data card's "Nguồn và độ tin cậy" (DataCard.astro): who gives each figure, and each one's own where they disagree. */
function trustBlock(t: T, lang: Lang, card: SpeciesEntity['dataCard'], sources: Partial<Record<string, { name: string }>>): Block[] {
  const { range } = fmt(lang)
  const rows = cardRows(card)
  if (!rows.length) return []
  const nameOf = (id: string) => sources[id]?.name ?? id
  const named = (id: string) => (lang !== 'vi' && isVietnamese(nameOf(id)) ? `${nameOf(id)} (${t('tiếng Việt')})` : nameOf(id))
  const unit = (field: string) => (field === 'tempC' ? '°C' : field === 'sizeCm' || field === 'tankCm' ? ' cm' : field === 'lifeYears' ? ` ${t('năm')}` : '')
  return [{
    t: 'trust', title: t('Nguồn và độ tin cậy'),
    ...(rows.some(r => r.conflict) ? { legend: t('Các nguồn ghi khác nhau') } : {}),
    rows: rows.map(r => ({
      field: r.field, label: t(FIELD_LABELS[r.field]),
      ...(r.conflict ? { conflict: true as const, note: t('Mỗi nguồn ghi một mức') } : {}),
      ...(r.marked ? { marked: true as const } : {}),
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
  const temp = resolveDataCard(card.tempC ?? [], 'tempC')
  if (!temp) return []
  const deg = (n: number) => `${`${n}`.replace('.', ',')}°C`
  const fill = (text: string, temps: number[]) => t(text).split('{t}').map((part, i) => `${part}${i < temps.length ? deg(temps[i]!) : ''}`).join('')
  return [{
    t: 'climate', title: t('Nuôi ở Việt Nam'),
    items: vnClimate(temp.value).map(n => ({ label: t(n.label), ok: n.ok, text: fill(n.text, n.temps) })),
    note: `${t('Giả định nước bể trong nhà, không sưởi hay làm lạnh: miền Bắc mùa đông khoảng')} ${VN_WATER.northWinter}°C${t(', miền Nam đêm mát tháng 12–1 khoảng')} ${VN_WATER.southCool}°C${t(', mùa hè tới')} ${VN_WATER.summer}°C${t('. Đo nhiệt độ bể của bạn để chắc chắn.')}`,
  }]
}

/** A species' copy (pages/ca/[slug].astro, from the same parts); `listed` is the app index's paths (listedPaths). */
export async function fishDoc(lang: Lang, c: Content, s: Localized<SpeciesEntity>, listed: Set<string>): Promise<PageDoc> {
  const t = translator(lang)
  const { num } = fmt(lang)
  const at = (viPath: string) => appPath(lang, viPath)
  const p = await speciesParts(lang, c, s)
  const lead = headImage(lang, headPhoto(s.photos), nameAndSci(s.t.name, s.scientificName))
  const sources = [...new Set(s.sections.map(x => c.sources[x.source]?.name ?? x.source))].join(', ')
  const { blocks: text } = sectionBlocks(lang, c, { sections: p.text.sections, t: p.text.t, self: `species:${s.id}`, selfNames: [s.scientificName, s.t.name, ...s.t.altNames], figures: p.figures.map(photo => ({ photo })), card: s.dataCard, range: { id: s.id, name: s.t.name, range: s.range }, refs: s.refs })
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
    sub: sciBeside(s.t.name, s.scientificName),
    where: p.country ? [`${s.family}, `, linked(lang, p.country.t.name, `/vi/nguon-goc/${p.country.parent}/${p.country.id}/`)] : [s.family],
    ...(s.t.altNames.length ? { aka: t('Tên khác: {names}', { names: s.t.altNames.join(', ') }) } : {}),
    ...(p.firstSource ? { credit: p.researched ? [`${t('AquaTome tổng hợp từ')} `, { text: t('{n} nguồn', { n: p.researched }), href: '#nguon' }, ` ${t('rồi tự viết')}.`] : [t('Dịch và tổng hợp từ {sources}. Cập nhật {date}.', { sources, date: s.updatedAt })] } : {}),
    ...(lead ? { lead } : {}),
    talk: { comments: commentsKey(lang, `species:${s.id}`), photos: photosKey(`species:${s.id}`) },
    blocks: [
      ...trustBlock(t, lang, p.card as SpeciesEntity['dataCard'], p.sources),
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
 * A breed's copy (pages/ca/[breed].astro, from the same parts), a fish's to the app: what it is (a form of its species,
 * linked), its other names, the line under its card, its photo; then a hybrid's parents, the card's sources, the gallery,
 * the summary, its text, its lines, the questions, the guides that name it and its sources. Its figures are the app
 * index's (`card`), as a species' are.
 */
export function breedDoc(lang: Lang, c: Content, b: Breed, listed: Set<string>): PageDoc {
  const t = translator(lang)
  const at = (viPath: string) => appPath(lang, viPath)
  const p = breedParts(lang, c, b)
  const lead = headImage(lang, headPhoto(b.photos), b.t.name)
  const kind = t(BREED_KIND[b.kind])
  const parents: Block[] = p.parents.length ? [{
    t: 'p', c: [`${t('Lai từ:')} `, ...p.parents.flatMap((x, i): Inline[] => [
      ...(i > 0 ? [', '] : []),
      x.path ? { text: x.sci ? `${x.name} (${x.sci})` : x.name, href: at(x.path) } : x.name,
      ...(x.certain ? [] : [` ${t('(chưa chắc chắn)')}`]),
    ])],
  }] : []
  const lines: Block[] = p.lines.length ? [{
    t: 'cards', title: t('Các dòng'),
    items: p.lines.map((x, i) => { const img = image(lang, p.linePhotos[i], undefined, true); return { path: at(`/vi/ca/${x.t.slug}/`), name: x.t.name, sub: t(BREED_KIND[x.kind]), ...(img ? { img } : {}) } }),
  }] : []
  return {
    v: PAGE_VERSION,
    kind: 'fish',
    path: at(`/vi/ca/${b.t.slug}/`),
    title: b.t.name,
    where: p.parent && b.kind === 'variety' ? [`${kind}${t(', dòng của')} `, { text: p.parent.name, href: at(p.parent.href) }] : [kind],
    ...(b.t.altNames.length ? { aka: t('Tên khác: {names}', { names: b.t.altNames.join(', ') }) } : {}),
    credit: [t('AquaTome tổng hợp từ {n} nguồn (người lai tạo, bài viết, diễn đàn) rồi tự viết. Cập nhật {date}.', { n: b.sources.length, date: dmy(b.updatedAt) })],
    ...(lead ? { lead } : {}),
    // Readers' photos on the Vietnamese page alone, as the page has them.
    talk: { comments: commentsKey(lang, p.key), ...(lang === 'vi' ? { photos: photosKey(p.key) } : {}) },
    blocks: [
      ...parents,
      ...trustBlock(t, lang, p.card as SpeciesEntity['dataCard'], p.sources),
      ...galleryBlock(lang, c.sources, b.t.name, p.gallery, p.strip, p.galleryPath),
      ...(b.t.summary?.length ? [{ t: 'summary' as const, title: t('Tóm tắt'), items: b.t.summary }] : []),
      ...(p.body ? proseBlocks(lang, p.body).blocks : []),
      ...lines,
      ...(b.t.faq?.length ? [{ t: 'faq' as const, title: t('Hỏi đáp'), items: b.t.faq.map(f => ({ q: f.q, a: f.a })) }] : []),
      ...pagesBlock(lang, listed, t('Bài viết nhắc đến'), p.guides.map(g => `/vi/huong-dan/${g.t.slug}/`), 8),
      ...pagesBlock(lang, listed, t('Có trong video hướng dẫn'), p.videoGuides.map(g => `/vi/huong-dan/${g.t.slug}/`), 6),
      ...(b.sources.length ? [{ t: 'refs' as const, title: t('Nguồn'), items: b.sources.map(r => ({ title: lang !== 'vi' && isVietnamese(r.title) ? `${r.title} (${t('tiếng Việt')})` : r.title, url: r.url })) }] : []),
    ],
  }
}

/**
 * A plant's copy (pages/cay/[slug].astro, from the same parts). Its care (difficulty, light, CO₂, growth, place) is
 * the app index's (`plant`), so it isn't repeated here.
 */
export function plantDoc(lang: Lang, c: Content, p: Localized<PlantEntity>, listed: Set<string>): PageDoc {
  const t = translator(lang)
  const parts = plantParts(lang, c, p)
  const lead = headImage(lang, headPhoto(p.photos), nameAndSci(p.t.name, p.scientificName))
  const { blocks: text } = sectionBlocks(lang, c, { sections: p.sections, t: p.t, self: `plant:${p.id}`, selfNames: [p.scientificName, p.t.name, ...p.t.altNames], figures: parts.figures.map(photo => ({ photo })), co2: p.co2, refs: p.refs })
  return {
    v: PAGE_VERSION,
    kind: 'plant',
    path: appPath(lang, `/vi/cay/${p.t.slug}/`),
    title: p.t.name,
    sub: sciBeside(p.t.name, p.scientificName),
    ...(p.t.altNames.length ? { aka: t('Tên khác: {names}', { names: p.t.altNames.join(', ') }) } : {}),
    ...(lead ? { lead } : {}),
    talk: { comments: commentsKey(lang, `plant:${p.id}`) },
    blocks: [
      ...galleryBlock(lang, c.sources, p.t.name, parts.gallery, parts.strip, parts.galleryPath),
      ...text,
      ...pagesBlock(lang, listed, t('Bài viết nhắc đến cây này'), parts.guides.map(g => `/vi/huong-dan/${g.t.slug}/`), 8),
      ...pagesBlock(lang, listed, t('Có trong video hướng dẫn'), parts.videoGuides.map(g => `/vi/huong-dan/${g.t.slug}/`), 6),
    ],
  }
}

/**
 * A glossary term's copy (pages/thuat-ngu/[slug].astro, from the same parts): its other names, its English (and Latin)
 * name, its definition with its links, then the pages that use it, each kind with its count. `listed`: the app index's
 * paths (listedPaths).
 */
export function glossaryDoc(lang: Lang, c: Content, g: Localized<GlossaryEntity>, listed: Set<string>): PageDoc {
  const t = translator(lang)
  const { num } = fmt(lang)
  const p = glossaryParts(lang, c, g)
  const used = [
    ...pagesBlock(lang, listed, `${t('Hướng dẫn')} (${num(p.guides.length)})`, p.guides.map(x => `/vi/huong-dan/${x.t.slug}/`), USED_IN_SHOWN.guides),
    ...pagesBlock(lang, listed, `${t('Loài cá')} (${num(p.fish.length)})`, p.fish.map(x => x.href), USED_IN_SHOWN.fish),
    ...pagesBlock(lang, listed, `${t('Cây thủy sinh')} (${num(p.plants.length)})`, p.plants.map(x => x.href), USED_IN_SHOWN.plants),
  ]
  return {
    v: PAGE_VERSION,
    kind: 'glossary',
    path: appPath(lang, `/vi/thuat-ngu/${g.t.slug}/`),
    title: g.t.name,
    blocks: [
      ...(p.otherNames.length ? [{ t: 'p' as const, c: [t('Tên khác: {names}', { names: p.otherNames.join(', ') })] }] : []),
      { t: 'p', c: g.latin ? [`${t('Tiếng Anh:')} ${g.en}, `, { text: g.latin, i: true }] : [`${t('Tiếng Anh:')} ${g.en}`] },
      ...(p.definition ? proseBlocks(lang, `<p>${p.definition}</p>`).blocks : []),
      ...(p.material ? [{ t: 'p' as const, c: [{ text: p.material.text, href: appPath(lang, p.material.href) }] }] : []),
      ...(p.photo && image(lang, p.photo, p.photo.caption) ? [{ t: 'figure' as const, img: image(lang, p.photo, p.photo.caption)!, ...(p.photo.caption ? { caption: [p.photo.caption] } : {}) }] : []),
      ...(p.body ? proseBlocks(lang, p.body).blocks : []),
      ...pagesBlock(lang, listed, t('Xem thêm'), p.related.map(r => `/vi/thuat-ngu/${r.t.slug}/`), p.related.length),
      ...(used.length ? [{ t: 'h' as const, text: t('Dùng trong {n} trang', { n: num(p.total) }) }, ...used] : []),
      // The rest are reached by the page's search link, which the web page shows: the app offers to open it there.
      ...(used.length && p.more ? [{ t: 'web' as const }] : []),
      ...(p.refs.length ? [{ t: 'refs' as const, title: t('Nguồn tham khảo'), id: 'nguon', items: p.refs.map(r => ({ title: r.title, url: r.url })) }] : []),
    ],
  }
}

/**
 * A video series' copy (pages/video/[slug].astro, from the same parts): the page's one line (its counts, the playlist
 * and channel it follows) as its credit, its intro, then every guide as the page lists them, in its order, as cards: each
 * one's subject, parts and length under its name, its picture credited. A card for a guide the index doesn't list opens
 * on the web. The page has no heading over its list: the cards' title is its crumb's word.
 */
export function videoDoc(lang: Lang, c: Content, s: Series): PageDoc {
  const t = translator(lang)
  const at = (viPath: string) => appPath(lang, viPath)
  const p = seriesParts(lang, c, s)
  // Its head is its card's photo in the app index: its first guide's (app-index.ts).
  const first = seriesGuides(c, s)[0], lead = first && headImage(lang, guideImage(c, first), s.vi.name)
  return {
    v: PAGE_VERSION,
    kind: 'video',
    path: at(`/vi/video/${s.vi.slug}/`),
    title: s.vi.name,
    credit: p.line,
    ...(lead ? { lead } : {}),
    blocks: [
      ...(s.vi.intro ? [{ t: 'p' as const, c: [s.vi.intro] }] : []),
      {
        t: 'cards', title: t('Video'),
        items: p.guides.map(({ g, photo, about, length }) => {
          const img = image(lang, photo, undefined, true)
          return { path: at(`/vi/huong-dan/${g.t.slug}/`), name: g.t.name, sub: `${about} · ${length}`, ...(img ? { img } : {}) }
        }),
      },
    ],
  }
}

/**
 * An equipment category's copy (pages/thiet-bi/[category].astro, from the same parts), in the page's order, with the
 * page's shop links as built (Shopee; `/go/<shop>/`, which the app opens outside it). The fish that need the kit are one
 * "pages" block, however many: the app draws its rows as they scroll into view.
 */
export function equipmentDoc(lang: Lang, c: Content, u: CategoryUse, listed: Set<string>): PageDoc {
  const t = translator(lang)
  const at = (viPath: string) => appPath(lang, viPath)
  const p = equipmentParts(lang, c, u)
  const lead = headImage(lang, p.g?.hero, p.label)
  const prose = (html: string) => proseBlocks(lang, html).blocks
  const card = (path: string, name: string, photo: Photo | null, sub?: string) => {
    const img = image(lang, photo, undefined, true)
    return { path: at(path), name, ...(sub ? { sub } : {}), ...(img ? { img } : {}) }
  }
  const between = (runs: Inline[], gap: string): Inline[] => runs.flatMap((r, i) => (i ? [gap, r] : [r]))
  return {
    v: PAGE_VERSION,
    kind: 'equipment',
    path: at(`/vi/thiet-bi/${u.category}/`),
    title: p.label,
    ...(p.chips.length ? { meta: p.chips.join(' · ') } : {}),
    ...(lead ? { lead } : {}),
    blocks: [
      ...(p.g ? [{ t: 'p' as const, c: [p.g.lead] }, ...prose(p.intro)] : []),
      ...(p.kinds.length ? [{ t: 'h' as const, text: p.kindsTitle }] : []),
      ...p.kinds.flatMap((k): Block[] => {
        const photo = image(lang, k.photo, k.name)
        return [
          { t: 'h', text: k.name, id: k.id },
          ...(photo ? [{ t: 'figure' as const, img: photo }] : []),
          ...prose(k.desc),
          { t: 'p', c: [{ text: t('Chọn thế nào:'), b: true }, ` ${k.pick}`] },
          ...(k.picks.length ? [{ t: 'p' as const, c: [`${t('Đã tìm hiểu kỹ:')} `, ...between(k.picks.map(x => linked(lang, x.name, x.href)), ', ')] }] : []),
          ...(k.buy ? [{ t: 'p' as const, c: [{ text: `${t('Mua')} ${k.buy.text} ${t('trên')} Shopee`, href: k.buy.href }] }] : []),
          ...(k.searches.length ? [{ t: 'p' as const, c: [`${t('Hay tìm:')} `, ...between(k.searches, ', ')] }] : []),
          ...(k.who.length ? [{ t: 'cards' as const, title: k.whoTitle, items: k.who.map(({ s, photo: ph }) => card(`/vi/ca/${s.t.slug}/`, s.t.name, ph)) }] : []),
          ...(k.whoMore ? [{ t: 'p' as const, c: [t('+{n} loài', { n: k.whoMore })] }] : []),
        ]
      }),
      ...(p.g ? [
        { t: 'h' as const, text: t('Cách chọn') },
        { t: 'list' as const, items: p.choose.map(prose) },
        { t: 'h' as const, text: t('Sai lầm thường gặp') },
        { t: 'list' as const, items: p.mistakes.map(prose) },
      ] : []),
      ...(p.creators.length ? [
        { t: 'h' as const, text: t('Dân chơi dùng gì trong video') },
        {
          t: 'list' as const,
          items: p.creators.map((x): Block[] => [{
            t: 'p',
            c: [
              { text: x.name, b: true as const, ...(x.product ? { href: at(x.product) } : {}) },
              ` · ${t('{n} video', { n: x.count })} · `,
              ...between(x.guides.map(v => ({ text: v.t.name, href: at(`/vi/huong-dan/${v.t.slug}/`) })), ' · '),
            ],
          }]),
        },
      ] : []),
      ...(p.plants.length ? [{ t: 'cards' as const, title: p.plantsTitle, items: p.plants.map(({ p: x, photo }) => card(`/vi/cay/${x.t.slug}/`, x.t.name, photo, sciBeside(x.t.name, x.scientificName))) }] : []),
      ...(p.plantsMore ? [{ t: 'p' as const, c: [linked(lang, p.plantsMore.text, p.plantsMore.href)] }] : []),
      ...pagesBlock(lang, listed, p.usersTitle, p.users.map(s => `/vi/ca/${s.t.slug}/`), p.users.length),
      ...(p.faq.length ? [{ t: 'faq' as const, title: t('Hỏi đáp'), items: p.faq.map(f => ({ q: f.q, a: f.a })) }] : []),
      ...pagesBlock(lang, listed, t('Bài viết liên quan'), p.guides.map(x => `/vi/huong-dan/${x.g.t.slug}/`), 6),
      ...(p.vn && p.keywordLinks.length ? [
        { t: 'h' as const, text: p.keywordsTitle },
        { t: 'list' as const, items: p.keywordLinks.map((x): Block[] => [{ t: 'p', c: [x] }]) },
        { t: 'p' as const, c: [t('Liên kết tiếp thị — trang có thể nhận hoa hồng khi bạn mua qua liên kết.')] },
      ] : []),
    ],
  }
}

/** A guide's copy; `listed` is the app index's paths (listedPaths). */
export function guideDoc(lang: Lang, c: Content, g: Localized<GuideEntity>, listed: Set<string>): PageDoc {
  const t = translator(lang)
  const at = (viPath: string) => appPath(lang, viPath)
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
  // The page also shows cards for pages the app index leaves out (a page not in this language): the app can't draw those.
  const pages = (title: string, viPaths: string[]) => {
    const paths = viPaths.map(at).filter(x => listed.has(x))
    return paths.length ? [{ t: 'pages' as const, title, paths }] : []
  }
  const lead = v ? undefined : headImage(lang, p.lead)
  // A video guide's head before it plays: its card's photo (app-index.ts), with its box where it has one.
  const poster = v ? headImage(lang, guideImage(c, g), g.t.name) : undefined
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
        ...(guideChapters(v, g.t.chapters).length > 1 ? { chapters: guideChapters(v, g.t.chapters).map(ch => ({ at: ch.start, title: ch.title })) } : {}),
        ...(poster ? { poster } : {}),
      },
    } : {}),
    talk: { comments: commentsKey(lang, `guide:${g.id}`) },
    blocks: [
      ...(g.t.summary?.length ? [{ t: 'summary' as const, title: t('Tóm tắt nhanh'), items: g.t.summary }] : []),
      // The poster's picture once a page: a section's still it shows isn't shown again further down (the Design Lead, 13 Nov).
      ...(poster ? blocks.filter(b => !(b.t === 'figure' && b.img.src === poster.src)) : blocks),
      ...(g.t.faq?.length ? [{ t: 'faq' as const, title: t('Câu hỏi thường gặp'), items: g.t.faq.map(f => ({ q: f.q, a: f.a })) }] : []),
      ...(v || p.refs?.length ? [{ t: 'refs' as const, title: t('Nguồn tham khảo'), id: 'nguon', items: [
        ...(v ? [{ title: `${t('Video gốc:')} ${v.title}${t(', kênh')} ${v.channel} · ${clock(v.durationSec)}`, url: watchUrl(v.youtubeId) }] : []),
        ...(p.refs ?? []).map(r => ({ title: lang !== 'vi' && isVietnamese(r.title) ? `${r.title} (${t('tiếng Việt')})` : r.title, url: r.url })),
      ] }] : []),
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
      fish: [...await Promise.all(appSpecies(lang, c).map(s => fishDoc(lang, c, s, listed))), ...appBreeds(lang, c).map(b => breedDoc(lang, c, b, listed))],
      plant: appPlants(lang, c).map(p => plantDoc(lang, c, p, listed)),
      glossary: appGlossary(lang, c).map(g => glossaryDoc(lang, c, g, listed)),
      video: appSeries(lang, c).map(({ s }) => videoDoc(lang, c, s)),
      equipment: appEquipment(lang, c).map(u => equipmentDoc(lang, c, u, listed)),
    }))())
  }
  return docs
}

/**
 * The level an app must know to draw each kind itself (packages/schema/src/app-page.ts, PageShard). Guides are the first
 * app's (level 1); fish, plant, glossary, video series and equipment pages use blocks it shows as "open on the web", so
 * they are level 2. Equipment needs no block a level-2 app lacks, and an app that predates it leaves out the index's items
 * of that kind, so it never opens these copies.
 */
export const PAGE_LEVELS: Record<Kind, number> = { guide: 1, fish: 2, plant: 2, glossary: 2, video: 2, equipment: 2 }

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
