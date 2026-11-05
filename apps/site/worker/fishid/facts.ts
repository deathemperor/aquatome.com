import { pageShard, shardCount } from '@aq/schema/app-page'
import type { Catalog, CatalogEntry } from './catalog'

/**
 * What the fish-ID agent's get_entry tool tells Claude about a page (agent-tools.ts): short facts and a few reference
 * photos, built with the site (src/pages/app/fish-id/[shard].json.ts → /app/fish-id/facts-<n>.json) from the pages
 * the catalog lists, so every catalog id is in exactly one shard. The accuracy script builds the same from content/.
 * The app's page shards don't fit: they hold rendered blocks in the reader's language.
 *
 * Plain shapes only (no Cloudflare types): the Worker, the build and the script all import this.
 */
export type Facts = {
  id: string
  kind: CatalogEntry['kind']
  sci?: string
  family?: string
  /** Adult length, from the page's data card (a range as "min–max"). */
  sizeCm?: string
  /** Where it comes from: the page's place ids ("south-america", "amazon"). */
  from?: string[]
  /** A breed: the species (or breed) it is a form of, and its other names. */
  basedOn?: string
  names?: string[]
  /** What the sources say about how it looks and how the sexes differ (English, as they give it); a breed's own summary. */
  text?: string
  /** Reference photos, about 480 px: the catalog's thumb first, then the page's next photos. */
  photos: string[]
}
export type FactsShard = { version: 1; entries: Facts[] }

type Range = { min: number; max: number }
type Sourced = { value: Range | number; hidden?: string }
type Section = { key: string; html: string }
/** The parts of a page the facts read: the loaded content's species, breeds and plants fit. */
export type FactPage<P> = { id: string; scientificName?: string; family?: string; places?: string[]; dataCard?: { sizeCm?: Sourced[] }; care?: { sizeCm?: Sourced[] }; sections?: Section[]; basedOn?: string; photos: P[]; t: { name: string; altNames: string[]; summary?: string[] } }
export type FactPages<P> = { species: FactPage<P>[]; breeds: FactPage<P>[]; plants: FactPage<P>[] }

/** About how much of the sources' text Claude gets per page. */
export const TEXT_MAX = 600
/** Reference photos per page: in the built shards, and the most get_entry shows of one (agent-tools.ts). */
export const PHOTOS_PER_PAGE = 2

const plainText = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim()
/** At most `max` characters, cut at a word. */
export function cut(s: string, max: number): string {
  if (s.length <= max) return s
  const head = s.slice(0, max - 1)
  return `${head.slice(0, Math.max(head.lastIndexOf(' '), max / 2))}…`
}
const size = (xs: Sourced[] | undefined) => {
  const v = xs?.find(x => !x.hidden)?.value
  return v === undefined ? undefined : typeof v === 'number' ? String(v) : v.min === v.max ? String(v.min) : `${v.min}–${v.max}`
}

/** How many shards the facts have for a catalog: as many as the app's pages would (about 8 pages each). */
export const factShards = (c: Pick<Catalog, 'entries'>) => shardCount(c.entries.length)
export const factShardOf = (id: string, shards: number) => pageShard(id, shards)

/**
 * Each catalog page's facts. `photos`: the page's photos then its gallery's (`gallery`), as `thumb` makes them, `count`
 * at most. A species' and a plant's text is its sources' dimorphism, then their notes (first source first); a breed
 * has no sections, so its text is its own summary (Vietnamese, as the page writes it).
 */
export function buildFacts<P>(catalog: Catalog, pages: FactPages<P>, thumb: (p: P) => string, opts: { gallery?: (id: string) => P[]; count?: number } = {}): Facts[] {
  const byId = new Map([...pages.species, ...pages.breeds, ...pages.plants].map(p => [p.id, p]))
  const count = opts.count ?? PHOTOS_PER_PAGE
  return catalog.entries.map(e => {
    const p = byId.get(e.id)
    const f: Facts = { id: e.id, kind: e.kind, photos: [] }
    if (e.sci) f.sci = e.sci
    if (!p) return f
    if (p.family) f.family = p.family
    const s = size(p.dataCard?.sizeCm ?? p.care?.sizeCm)
    if (s) f.sizeCm = s
    if (p.places?.length) f.from = p.places
    if (p.basedOn) f.basedOn = p.basedOn
    if (e.kind === 'breed' && p.t.altNames.length) f.names = p.t.altNames
    const sections = p.sections ?? []
    const text = e.kind === 'breed'
      ? (p.t.summary ?? []).join(' ')
      : [...sections.filter(x => x.key === 'dimorphism'), ...sections.filter(x => x.key === 'notes')].map(x => plainText(x.html)).filter(Boolean).join(' ')
    if (text) f.text = cut(text, TEXT_MAX)
    f.photos = [...new Set([...p.photos, ...(opts.gallery?.(e.id) ?? [])].map(thumb))].slice(0, count)
    return f
  })
}

/** The facts in their shards, by `factShardOf`. */
export function shardFacts(facts: Facts[], shards: number): FactsShard[] {
  const out = Array.from({ length: shards }, (): FactsShard => ({ version: 1, entries: [] }))
  for (const f of facts) out[factShardOf(f.id, shards)]!.entries.push(f)
  return out
}
