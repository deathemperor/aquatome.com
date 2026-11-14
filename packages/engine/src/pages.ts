import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CardTextSchema, controlOf, LANGS, loadAll, SECTION_ORDER, type Content, type DataCardField, type Lang, type Translation, type WrittenLang } from '@aq/schema'
import { LANG } from '@aq/schema/langs'

/** The kinds of page that carry written text (places and taxa pages are lists). */
export const PAGE_KINDS = ['species', 'plants', 'guides', 'breeds', 'glossary', 'products', 'equipment'] as const
type SitePageKind = (typeof PAGE_KINDS)[number]
/** A site page's kind, or the app's short cards (`loadCards`), which have no page on the site and are read like one. */
export type PageKind = SitePageKind | 'cards'
export type CardValue = { field: DataCardField; source: string; value: number | { min: number; max: number } }

/** One published page as a reader gets it: its title, its text in reading order, its photo captions and data card. */
export type Page = {
  lang: Lang
  kind: PageKind
  id: string
  title: string
  /**
   * The page's path in the form site links are written in ("/vi/ca/<slug>/", "/id/ikan/<slug>/"): the reader's text and
   * its hash carry it, so it stays put. Its address on the site is pageUrl's.
   */
  path: string
  /** Each piece of HTML text and where it is kept in the page's file ("sections.diet:seriouslyfish", "body", "faq.2.a"). */
  fields: { field: string; html: string }[]
  /** Plain-text lines (the title aside): summary points, FAQ questions and answers, the equipment page's lead and picks. */
  lines: { field: string; text: string }[]
  /** Captions of the page's photos and, for species and plants, of its gallery; `file`: a Wikimedia Commons photo's file there ("File:….jpg"). */
  captions: { url: string; caption: string; file?: string }[]
  /** Species and breeds: the addresses of the page's own photos, first to last, its gallery's aside. */
  own?: string[]
  /** Species and breeds: the addresses of its gallery's photos, which the page shows where it has none of its own. */
  gallery?: string[]
  /** Breeds: its gallery's captions. Kept apart from `captions`, which the other caption rules read: only the unwell rule asks a breed's gallery. */
  album?: { url: string; caption: string }[]
  /** The head a person picked for the page, if one (engine-state/_photo-head-picks.json, beside the content root). */
  picked?: string
  /** Species, plants and breeds: a person chose the name (`nameFixed`), and the engine leaves it as it is. */
  nameFixed?: boolean
  /** Species and plants: the Latin name, and the other Latin names the page goes by. */
  sci?: string
  latinNames: string[]
  /** Species: the family, and the L numbers on record (a pleco's name shows one: l-numbers.ts). */
  family?: string
  lNumber?: string
  card: CardValue[]
  /** Species and plants: the English each section was translated from, by field. */
  en?: Record<string, string>
  /** Guides: the source page they were written from. */
  origin?: { source: string; url: string }
  /** The channels whose videos the page is written from: a video guide's, a product's reviews'. */
  credited?: string[]
  /** Products: whether AquaTome controls it (@aq/schema controlOf). */
  control?: boolean
}

/** Each language's English name, in reports and prompts. */
export const LANG_NAME: Record<WrittenLang, string> = { vi: 'Vietnamese', id: 'Indonesian', th: 'Thai', ms: 'Malay' }

/**
 * Each language's word for a site section. The site's own map is apps/site/src/lib/i18n.ts (SECTIONS); a page link in a
 * report only needs these.
 */
const SECTION: Record<Lang, Record<'ca' | 'cay' | 'huong-dan' | 'thuat-ngu' | 'san-pham' | 'thiet-bi', string>> = {
  vi: { ca: 'ca', cay: 'cay', 'huong-dan': 'huong-dan', 'thuat-ngu': 'thuat-ngu', 'san-pham': 'san-pham', 'thiet-bi': 'thiet-bi' },
  id: { ca: 'ikan', cay: 'tanaman', 'huong-dan': 'panduan', 'thuat-ngu': 'istilah', 'san-pham': 'produk', 'thiet-bi': 'peralatan' },
  th: { ca: 'fish', cay: 'plants', 'huong-dan': 'guides', 'thuat-ngu': 'glossary', 'san-pham': 'products', 'thiet-bi': 'equipment' },
  ms: { ca: 'ikan', cay: 'tumbuhan', 'huong-dan': 'panduan', 'thuat-ngu': 'istilah', 'san-pham': 'produk', 'thiet-bi': 'peralatan' },
}
const SECTION_OF: Record<SitePageKind, keyof (typeof SECTION)['vi']> = {
  species: 'ca', breeds: 'ca', plants: 'cay', guides: 'huong-dan', glossary: 'thuat-ngu', products: 'san-pham', equipment: 'thiet-bi',
}
export const pagePath = (lang: Lang, kind: SitePageKind, slug: string) => `${lang === 'vi' ? '/vi' : LANG[lang].prefix}/${SECTION[lang][SECTION_OF[kind]]}/${slug}/`
/** A page's address on the site: Vietnamese pages are at the root ("/vi/ca/x/" → https://aquatome.com/ca/x/). */
export const pageUrl = (p: Pick<Page, 'path'>) => `https://aquatome.com${p.path.replace(/^\/vi\//, '/')}`

const ORDER = new Map<string, number>(SECTION_ORDER.map((k, i) => [k, i]))
/** A species or plant page's sections in the schema's order (`key:source`); the sources' references last. */
export const sectionFields = (sections: Record<string, string>) => Object.entries(sections)
  .sort(([a], [b]) => (ORDER.get(a.split(':')[0]!) ?? 99) - (ORDER.get(b.split(':')[0]!) ?? 99) || a.localeCompare(b))
  .map(([k, html]) => ({ field: `sections.${k}`, html }))

type Extra = { body?: string; definition?: string; summary?: string[]; faq?: { q: string; a: string }[] }
const textOf = (t: Extra, sections: Record<string, string> = {}) => ({
  fields: [
    ...sectionFields(sections),
    ...(t.body ? [{ field: 'body', html: t.body }] : []),
    ...(t.definition ? [{ field: 'definition', html: t.definition }] : []),
  ],
  // A guide's, breed's or product's summary and FAQ are plain text on the page.
  lines: [...(t.summary ?? []).map((s, i) => ({ field: `summary.${i}`, text: s })), ...(t.faq ?? []).flatMap((f, i) => [{ field: `faq.${i}.q`, text: f.q }, { field: `faq.${i}.a`, text: f.a }])],
})
/** The Latin names among a page's other names: "Corydoras paleatus", a cultivar's "Echinodorus 'Vesuvius'". */
const latin = (names: string[]) => names.filter(n => /^[A-Z][a-z]+ (?:[a-z]{3,}|['‘’"][A-Z])/.test(n))
const commonsFile = (sourceUrl = '') => {
  const file = /^https?:\/\/commons\.wikimedia\.org\/wiki\/(File:[^?#]+)/.exec(sourceUrl)?.[1]
  try { return file && decodeURIComponent(file) } catch { return file }
}
const captionsOf = (photos: { url: string; caption?: string; sourceUrl?: string }[]) => photos.flatMap(p => {
  const file = commonsFile(p.sourceUrl)
  return p.caption ? [{ url: p.url, caption: p.caption, ...(file ? { file } : {}) }] : []
})
/** A product's review summary and test notes, as lines of plain text. */
export const reviewLines = (t: Pick<Translation, 'reviews' | 'tested'>) => [
  ...(t.reviews?.agree ?? []).map((x, i) => ({ field: `reviews.agree.${i}`, text: x.text })),
  ...(t.reviews?.differ ?? []).flatMap((d, i) => [{ field: `reviews.differ.${i}.topic`, text: d.topic }, ...d.sides.map((x, j) => ({ field: `reviews.differ.${i}.sides.${j}`, text: x.text }))]),
  ...(t.reviews?.single ?? []).map((x, i) => ({ field: `reviews.single.${i}`, text: x.text })),
  ...(t.reviews?.measured ?? []).flatMap((m, i) => [{ field: `reviews.measured.${i}.what`, text: m.what }, { field: `reviews.measured.${i}.how`, text: m.how }]),
  ...(t.tested ?? []).map((x, i) => ({ field: `tested.${i}`, text: x.text })),
]

/** Every published page in a language, from the content a public build reads (loadAll), in a stable order. */
export function pagesOf(lang: Lang, c: Content): Page[] {
  const base = (kind: SitePageKind, id: string, slug: string, title: string) => ({ lang, kind, id, title, path: pagePath(lang, kind, slug) })
  const card = (dc: Content['species'][number]['dataCard']): CardValue[] =>
    Object.entries(dc).flatMap(([field, vs]) => (vs ?? []).map(v => ({ field: field as DataCardField, source: v.source, value: v.value })))
  return [
    ...c.species.map(s => ({
      ...base('species', s.id, s.t.slug, s.t.name), ...textOf(s.t, s.t.sections), ...(s.t.nameFixed ? { nameFixed: true } : {}),
      captions: captionsOf([...s.photos, ...(c.galleries[s.id] ?? [])]), own: s.photos.map(x => x.url), gallery: (c.galleries[s.id] ?? []).map(x => x.url), sci: s.scientificName, latinNames: latin(s.t.altNames), card: card(s.dataCard),
      family: s.family, ...(s.lNumber ? { lNumber: s.lNumber } : {}),
      en: Object.fromEntries(s.sections.map(x => [`sections.${x.key}:${x.source}`, x.html])),
    })),
    ...c.plants.map(p => ({
      ...base('plants', p.id, p.t.slug, p.t.name), ...textOf(p.t, p.t.sections), ...(p.t.nameFixed ? { nameFixed: true } : {}),
      captions: captionsOf([...p.photos, ...(c.galleries[p.id] ?? [])]), sci: p.scientificName, latinNames: latin(p.t.altNames), card: [],
      en: Object.fromEntries(p.sections.map(x => [`sections.${x.key}:${x.source}`, x.html])),
    })),
    ...c.guides.map(g => ({ ...base('guides', g.id, g.t.slug, g.t.name), ...textOf(g.t), captions: captionsOf(g.photos), latinNames: [], card: [], origin: { source: g.source, url: g.sourceUrl }, ...(g.video ? { credited: [g.video.channel] } : {}) })),
    ...c.breeds.map(b => ({
      ...base('breeds', b.id, b.t.slug, b.t.name), ...textOf(b.t), ...(b.t.nameFixed ? { nameFixed: true } : {}), captions: captionsOf(b.photos), album: captionsOf(c.galleries[b.id] ?? []).map(({ url, caption }) => ({ url, caption })), own: b.photos.map(x => x.url), gallery: (c.galleries[b.id] ?? []).map(x => x.url), latinNames: [],
      card: Object.entries(b.care).flatMap(([field, vs]) => (vs ?? []).map(v => ({ field: field as DataCardField, source: `source ${v.source + 1}`, value: v.value }))),
    })),
    ...c.glossary.map(g => ({ ...base('glossary', g.id, g.t.slug, g.t.name), ...textOf(g.t), captions: [], latinNames: [], card: [] })),
    ...c.products.map(p => {
      const text = textOf(p.t)
      return {
        ...base('products', p.id, p.t.slug, p.t.name), ...text, lines: [...text.lines, ...reviewLines(p.t)], captions: [], latinNames: [], card: [], control: !!controlOf(p.brand, p.model),
        // A maker's own channel carries the name the page is about.
        ...(p.reviews ? { credited: p.reviews.videos.map(v => v.channel).filter(c => c.trim().toLowerCase() !== p.brand.trim().toLowerCase()) } : {}),
      }
    }),
    ...c.equipment.map(e => ({
      ...base('equipment', e.category, e.category, e.name), latinNames: [], card: [],
      fields: [
        { field: 'intro', html: e.intro },
        ...e.types.map((t, i) => ({ field: `types.${i}.desc`, html: t.desc })),
        ...e.choose.map((x, i) => ({ field: `choose.${i}`, html: x })),
        ...e.mistakes.map((x, i) => ({ field: `mistakes.${i}`, html: x })),
        ...e.faq.map((f, i) => ({ field: `faq.${i}.a`, html: f.a })),
      ],
      lines: [{ field: 'lead', text: e.lead }, ...e.types.map((t, i) => ({ field: `types.${i}.pick`, text: t.pick })), ...e.faq.map((f, i) => ({ field: `faq.${i}.q`, text: f.q }))],
      captions: captionsOf([e.hero, ...e.types.flatMap(t => (t.photo ? [t.photo] : []))]),
    })),
  ]
}

/**
 * Every published page in the languages the site serves: what the reader's eye reads and the audit lists. A language the
 * site doesn't serve yet has no pages to check against, and joins with its `served: true`.
 */
/**
 * The parts of a page a person fixed (schemas.ts Section.fixed), by field ("sections.reproduction:seriouslyfish"), from the
 * page's folder: no writer rewrites them, as none rewrites a body marked bodyFixed.
 */
export async function fixedParts(dir: string): Promise<Set<string>> {
  const e = JSON.parse(await readFile(join(dir, 'entity.json'), 'utf8').catch(() => '{}')) as { sections?: { key: string; source: string; fixed?: boolean }[] }
  return new Set((e.sections ?? []).filter(s => s.fixed).map(s => `sections.${s.key}:${s.source}`))
}

export async function loadPages(contentRoot: string, langs: readonly Lang[] = LANGS): Promise<Page[]> {
  const picks = JSON.parse(await readFile(join(contentRoot, '..', 'engine-state', '_photo-head-picks.json'), 'utf8').catch(() => '{}')) as Record<string, string>
  const out: Page[] = []
  for (const lang of langs) for (const p of pagesOf(lang, await loadAll({ root: contentRoot, lang, publicBuild: true }))) {
    const picked = picks[`${p.kind}/${p.id}`]
    out.push(picked ? { ...p, picked } : p)
  }
  return out
}

/**
 * The app's short cards (content/cards/<id>/<lang>.json, @aq/schema cards.ts) as pages the checker and the gate read:
 * the title, the body and the eyebrow. Held ones too, which `loadAll` leaves out, so the gate can let one out once it
 * passes. No page on the site: `path` (`/vi/cards/<id>/`) only names a card in a report.
 */
export async function loadCards(contentRoot: string, langs: readonly Lang[] = LANGS): Promise<Page[]> {
  const out: Page[] = []
  const dir = join(contentRoot, 'cards')
  for (const id of (await readdir(dir).catch(() => [] as string[])).sort()) {
    if ((await readFile(join(dir, id, 'entity.json'), 'utf8').catch(() => null)) === null) continue
    for (const lang of langs) {
      const raw = await readFile(join(dir, id, `${lang}.json`), 'utf8').catch(() => null)
      if (raw === null) continue
      const t = CardTextSchema.parse(JSON.parse(raw))
      out.push({
        lang, kind: 'cards', id, title: t.title, path: `${lang === 'vi' ? '/vi' : LANG[lang].prefix}/cards/${id}/`,
        fields: [{ field: 'body', html: t.body }], lines: [{ field: 'eyebrow', text: t.eyebrow }], captions: [], latinNames: [], card: [],
      })
    }
  }
  return out
}
