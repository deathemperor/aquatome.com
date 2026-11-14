import { pageShard, type PageDoc, type PageShard } from '@aq/schema/app-page'
import type { Lang } from '@aq/schema/langs'
import type { Topics } from './topics'

/**
 * What the chat reads of the handbook: the app's index (/app/<lang>.json: every page's kind, name, path and a fish's
 * facts) and the app's copy of each page (/app/pages/<lang>/<kind>-<n>.json, protocols/page.schema.json), the files the
 * site builds for the app. Claude reads them through the tools (tools.ts), and the Worker fills the blocks from them
 * (answer.ts), so a block shows what the app and the site show.
 *
 * Plain shapes only, no Cloudflare types: the Worker reads its assets, the tests and the eval script read files.
 */
export type { Lang }
export type Range = { min: number; max: number }
/** A page in the app's index: only what the chat reads of `AppItem` (apps/site/src/lib/app-index.ts). */
export type Item = {
  kind: 'fish' | 'plant' | 'guide' | 'glossary' | 'video' | 'equipment' | 'tool'
  /** Species, breeds and plants: their content id, as fish ID links them. */
  id?: string
  name: string
  /** A species' or plant's scientific name; a video's channel. */
  sub?: string
  aka?: string[]
  path: string
  img?: string
  /** A breed: the species it is a form of, when the index lists it. */
  of?: string
  /** A breed's own figures, as its page's data card shows them (the app index's `card`): only breeds have them. */
  card?: Partial<Pick<Item, (typeof FIGURES)[number]>>
  /** A plant's figures, on the plants' scale (difficulty 1–3, not a fish's 1–8). */
  plant?: PlantFacts
  /** A guide written from one video: the video's length in seconds. One keeper's teaching, kept faithful to the video. */
  video?: number
  /** A tool's name on its card (the tools page). */
  short?: string
  tempC?: Range
  ph?: Range
  gh?: Range
  sizeCm?: number
  tankCm?: number
  temperament?: string
  finNipper?: boolean
  schoolMin?: number
  difficulty?: number
  lifeYears?: Range
}
export type Index = { lang: Lang; items: Item[]; shards?: Partial<Record<PageDoc['kind'], { n: number }>> }

/** Where the chat's handbook comes from: the index, one shard, and the guides' topics (topics.ts), each null when it can't be read. */
export type Source = {
  index: (lang: Lang) => Promise<Index | null>
  shard: (lang: Lang, kind: PageDoc['kind'], n: number) => Promise<PageShard | null>
  topics?: (lang: Lang) => Promise<Topics | null>
}

/** The figures a fish's card shows, the app index's facts (protocols/chat.openapi.json `Facts`): measures, then behaviour. */
const FIGURES = ['tempC', 'ph', 'gh', 'sizeCm', 'tankCm', 'difficulty', 'lifeYears'] as const
const BEHAVIOUR = ['temperament', 'finNipper', 'schoolMin'] as const
export const FACT_KEYS = [...FIGURES, ...BEHAVIOUR] as const
export type Facts = Partial<Pick<Item, (typeof FACT_KEYS)[number]>>
/** A plant's figures (protocols/chat.openapi.json `PlantFacts`), as the app index's `plant` has them. */
export type PlantFacts = { difficulty?: number; light?: string; co2?: string; growth?: string; placement?: string[] }
const pick = (o: Partial<Record<string, unknown>> | undefined, keys: readonly string[]) => Object.fromEntries(keys.filter(k => o?.[k] !== undefined).map(k => [k, o![k]]))
export const factsOf = (i: Item): Facts => pick(i, FACT_KEYS)
/** A breed: one with figures of its own, or a form of a species. */
export const isBreed = (i: Item) => i.kind === 'fish' && (i.card !== undefined || i.of !== undefined)

/**
 * What a card shows of a fish or plant (protocols/chat.openapi.json `Species`): a plant its `plant` figures; a species
 * its facts; a breed its own figures (its page's data card; its species' when it has none) with its species'
 * behaviour, which tank-mates checks it by.
 */
export function figuresOf(i: Item, byId: (id: string) => Item | undefined): { facts: Facts } | { plant: PlantFacts } {
  if (i.kind === 'plant') return { plant: i.plant ?? {} }
  if (!isBreed(i)) return { facts: factsOf(i) }
  const species = i.of ? byId(i.of) : undefined
  const own = pick(i.card, FIGURES)
  return { facts: { ...(Object.keys(own).length ? own : pick(species, FIGURES)), ...pick(species ?? i, BEHAVIOUR) } }
}

/** One language's handbook, looked up: pages by path and by id, and a page's app copy. */
export type Handbook = {
  lang: Lang
  items: Item[]
  byPath: (path: string) => Item | undefined
  byId: (id: string) => Item | undefined
  page: (path: string) => Promise<PageDoc | undefined>
  /** The guides' section headings and FAQ questions, read with the index; null when they can't be. */
  topics: () => Promise<Topics | null>
}

/** A topics file the search can read (topics.ts, v 1), else null: the search then finds pages by their names only. */
const topicsIn = (t: Topics | null): Topics | null =>
  t?.v === 1 && t.pages && typeof t.pages === 'object' &&
  Object.values(t.pages).every(list => Array.isArray(list) && list.every(e => Array.isArray(e) && (e[0] === null || typeof e[0] === 'string') && typeof e[1] === 'string'))
    && (t.held === undefined || (Array.isArray(t.held) && t.held.every(p => typeof p === 'string')))
    ? t : null

/** The index's pages kinds each have their own shards; a tool's page has no app copy. */
const PAGE_KINDS = new Set<string>(['guide', 'fish', 'plant', 'glossary', 'video', 'equipment'])
/** The kinds the chat knows. Another kind in the index (a Vietnamese material page, which the app opens on the web) has no
 * copy to read, so the chat never finds or names it. */
const CHAT_KINDS = new Set<string>([...PAGE_KINDS, 'tool'])

export async function handbookOf(source: Source, lang: Lang): Promise<Handbook | null> {
  const [index, read] = await Promise.all([source.index(lang), source.topics ? source.topics(lang).catch(() => null) : null])
  if (!index) return null
  const topics = topicsIn(read)
  // A guide held out of the chat while it is checked again (topics.ts `held`) isn't in its handbook at all: never found,
  // read, shown or named in a step. A topics file with no list holds none; with no topics file to say which, every video
  // guide is held.
  const held = topics ? new Set(topics.held ?? []) : null
  const items = index.items.filter(i => CHAT_KINDS.has(i.kind) && (held ? !held.has(i.path) : !(i.kind === 'guide' && i.video !== undefined)))
  const paths = new Map(items.map(i => [i.path, i]))
  const ids = new Map(items.flatMap(i => (i.id ? [[i.id, i] as const] : [])))
  return {
    lang,
    items,
    byPath: p => paths.get(p),
    byId: id => ids.get(id),
    page: async path => {
      const item = paths.get(path)
      const n = item && PAGE_KINDS.has(item.kind) ? index.shards?.[item.kind as PageDoc['kind']]?.n : undefined
      if (!item || !n) return undefined
      const shard = await source.shard(lang, item.kind as PageDoc['kind'], pageShard(path, n))
      return shard?.pages[path]
    },
    topics: async () => topics,
  }
}

/**
 * The page's sections, by their headings: the opening (the blocks before the first heading, no `heading`) first when
 * there are any, then one per heading, up to the next. Only a heading with an id can be opened at (and picked).
 */
export type Section = { heading?: { text: string; id?: string }; blocks: PageDoc['blocks'] }
export function sectionsOf(doc: PageDoc): Section[] {
  const out: Section[] = [{ blocks: [] }]
  for (const b of doc.blocks) {
    if (b.t === 'h') out.push({ heading: { text: b.text, ...(b.id ? { id: b.id } : {}) }, blocks: [] })
    else out.at(-1)!.blocks.push(b)
  }
  return out.filter((s, i) => i > 0 || s.blocks.length)
}
