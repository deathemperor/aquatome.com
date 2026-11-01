import { loadAll, SECTION_ORDER, type Content, type DataCardField, type Lang } from '@aq/schema'

/** The kinds of page that carry written text (places and taxa pages are lists). */
export const PAGE_KINDS = ['species', 'plants', 'guides', 'breeds', 'glossary', 'products', 'equipment'] as const
export type PageKind = (typeof PAGE_KINDS)[number]
export type CardValue = { field: DataCardField; source: string; value: number | { min: number; max: number } }

/** One published page as a reader gets it: its title, its text in reading order, its photo captions and data card. */
export type Page = {
  lang: Lang
  kind: PageKind
  id: string
  title: string
  /** The page's address on the site ("/id/ikan/<slug>/"). */
  path: string
  /** Each piece of HTML text and where it is kept in the page's file ("sections.diet:seriouslyfish", "body", "faq.2.a"). */
  fields: { field: string; html: string }[]
  /** Plain-text lines (the title aside): summary points, FAQ questions and answers, the equipment page's lead and picks. */
  lines: { field: string; text: string }[]
  /** Captions of the page's photos and, for species and plants, of its gallery. */
  captions: { url: string; caption: string }[]
  /** Species and plants: the Latin name, and the other Latin names the page goes by. */
  sci?: string
  latinNames: string[]
  card: CardValue[]
  /** Species and plants: the English each section was translated from, by field. */
  en?: Record<string, string>
  /** Guides: the source page they were written from. */
  origin?: { source: string; url: string }
}

/**
 * Each language's word for a site section. The site's own map is apps/site/src/lib/i18n.ts (SECTIONS); a page link in a
 * report only needs these.
 */
const SECTION: Record<Lang, Record<'ca' | 'cay' | 'huong-dan' | 'thuat-ngu' | 'san-pham' | 'thiet-bi', string>> = {
  vi: { ca: 'ca', cay: 'cay', 'huong-dan': 'huong-dan', 'thuat-ngu': 'thuat-ngu', 'san-pham': 'san-pham', 'thiet-bi': 'thiet-bi' },
  id: { ca: 'ikan', cay: 'tanaman', 'huong-dan': 'panduan', 'thuat-ngu': 'istilah', 'san-pham': 'produk', 'thiet-bi': 'peralatan' },
  th: { ca: 'fish', cay: 'plants', 'huong-dan': 'guides', 'thuat-ngu': 'glossary', 'san-pham': 'products', 'thiet-bi': 'equipment' },
}
const SECTION_OF: Record<PageKind, keyof (typeof SECTION)['vi']> = {
  species: 'ca', breeds: 'ca', plants: 'cay', guides: 'huong-dan', glossary: 'thuat-ngu', products: 'san-pham', equipment: 'thiet-bi',
}
export const pagePath = (lang: Lang, kind: PageKind, slug: string) => `/${lang}/${SECTION[lang][SECTION_OF[kind]]}/${slug}/`

const ORDER = new Map<string, number>(SECTION_ORDER.map((k, i) => [k, i]))
/** A species or plant page's sections in the schema's order (`key:source`); the sources' references last. */
const sectionFields = (sections: Record<string, string>) => Object.entries(sections)
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
const captionsOf = (photos: { url: string; caption?: string }[]) => photos.flatMap(p => (p.caption ? [{ url: p.url, caption: p.caption }] : []))

/** Every published page in a language, from the content a public build reads (loadAll), in a stable order. */
export function pagesOf(lang: Lang, c: Content): Page[] {
  const base = (kind: PageKind, id: string, slug: string, title: string) => ({ lang, kind, id, title, path: pagePath(lang, kind, slug) })
  const card = (dc: Content['species'][number]['dataCard']): CardValue[] =>
    Object.entries(dc).flatMap(([field, vs]) => (vs ?? []).map(v => ({ field: field as DataCardField, source: v.source, value: v.value })))
  return [
    ...c.species.map(s => ({
      ...base('species', s.id, s.t.slug, s.t.name), ...textOf(s.t, s.t.sections),
      captions: captionsOf([...s.photos, ...(c.galleries[s.id] ?? [])]), sci: s.scientificName, latinNames: latin(s.t.altNames), card: card(s.dataCard),
      en: Object.fromEntries(s.sections.map(x => [`sections.${x.key}:${x.source}`, x.html])),
    })),
    ...c.plants.map(p => ({
      ...base('plants', p.id, p.t.slug, p.t.name), ...textOf(p.t, p.t.sections),
      captions: captionsOf([...p.photos, ...(c.galleries[p.id] ?? [])]), sci: p.scientificName, latinNames: latin(p.t.altNames), card: [],
      en: Object.fromEntries(p.sections.map(x => [`sections.${x.key}:${x.source}`, x.html])),
    })),
    ...c.guides.map(g => ({ ...base('guides', g.id, g.t.slug, g.t.name), ...textOf(g.t), captions: captionsOf(g.photos), latinNames: [], card: [], origin: { source: g.source, url: g.sourceUrl } })),
    ...c.breeds.map(b => ({
      ...base('breeds', b.id, b.t.slug, b.t.name), ...textOf(b.t), captions: captionsOf(b.photos), latinNames: [],
      card: Object.entries(b.care).flatMap(([field, vs]) => (vs ?? []).map(v => ({ field: field as DataCardField, source: `source ${v.source + 1}`, value: v.value }))),
    })),
    ...c.glossary.map(g => ({ ...base('glossary', g.id, g.t.slug, g.t.name), ...textOf(g.t), captions: [], latinNames: [], card: [] })),
    ...c.products.map(p => ({ ...base('products', p.id, p.t.slug, p.t.name), ...textOf(p.t), captions: [], latinNames: [], card: [] })),
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

/** Every published page in Vietnamese, Indonesian and Thai. */
export async function loadPages(contentRoot: string, langs: readonly Lang[] = ['vi', 'id', 'th']): Promise<Page[]> {
  const out: Page[] = []
  for (const lang of langs) out.push(...pagesOf(lang, await loadAll({ root: contentRoot, lang, publicBuild: true })))
  return out
}
