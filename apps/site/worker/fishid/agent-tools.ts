import type Anthropic from '@anthropic-ai/sdk'
import type { Tool, ToolOutput } from '../agent/tools'
import type { Catalog, CatalogEntry, Lang } from './catalog'
import type { Facts } from './facts'
import { compact, link, sciKey, words, type Linked } from './match'

/**
 * The fish-ID agent's tools (fishid/agent.ts), over the handbook's public pages only: search_handbook over the catalog
 * (/app/fish-id.json, which the Worker has loaded already) and get_entry over the facts shards (facts.ts). Neither
 * writes anything. No Cloudflare types: the accuracy script runs them in Node over content/.
 */
export type Step = { kind: 'search'; query: string } | { kind: 'look'; page: Linked }

/** Entries a search returns at most. */
export const SEARCH_MAX = 12
/** Reference photos a page gives at most. */
export const PHOTOS_PER_ENTRY = 2

type Hit = { e: CatalogEntry; score: number }
/** A page as a search lists it: text only, Vietnamese name (every page has one), what a breed is a form of. */
const listed = (e: CatalogEntry) => ({ id: e.id, kind: e.kind, ...(e.sci ? { sci: e.sci } : {}), name: e.name.vi, ...(e.basedOn ? { basedOn: e.basedOn } : {}) })

/** A page's names to search: every language's, a breed's other names, and the parts of "Cá betta Halfmoon (Halfmoon betta)". */
const namesOf = (e: CatalogEntry) => [...new Set([...Object.values(e.name), ...(e.alt ?? [])].flatMap(n => [n, ...n.split(/[()]/)]).map(n => n.trim()).filter(Boolean))]

/**
 * The catalog's pages for a name or a genus, best first: the scientific name or a synonym itself, then a common name
 * itself, then names holding every word of the query; `genus` lists the genus's pages, and the breeds of its species.
 */
export function searchCatalog(c: Catalog, q: { query?: string | null; genus?: string | null }): { hits: CatalogEntry[]; more: number } {
  const byId = new Map(c.entries.map(e => [e.id, e]))
  const genusOf = (e: CatalogEntry): string => {
    for (let x: CatalogEntry | undefined = e, i = 0; x && i < 6; x = x.basedOn ? byId.get(x.basedOn) : undefined, i++) if (x.sci) return sciKey(x.sci).genus
    return ''
  }
  const scored = new Map<string, Hit>()
  const offer = (e: CatalogEntry, score: number) => { const h = scored.get(e.id); if (!h || h.score < score) scored.set(e.id, { e, score }) }
  const g = q.genus ? sciKey(q.genus).genus : ''
  if (g) for (const e of c.entries) if (genusOf(e) === g) offer(e, e.kind === 'breed' ? 40 : 50)
  const text = q.query?.trim() ?? ''
  if (text) {
    const k = sciKey(text)
    const qc = compact(text)
    const qw = words(text)
    for (const e of c.entries) {
      const scis = [e.sci, ...(e.syn ?? [])].filter((s): s is string => Boolean(s)).map(sciKey)
      if (scis.some(s => s.full === k.full)) offer(e, 100)
      else if (qw.length >= 2 && scis.some(s => s.binomial === k.binomial)) offer(e, 90)
      const names = namesOf(e)
      if (qc && names.some(n => compact(n) === qc)) offer(e, 85)
      if (qw.length === 1 && genusOf(e) === k.genus) offer(e, e.kind === 'breed' ? 30 : 45)
      const all = new Set([...names, ...(e.sci ? [e.sci] : []), ...(e.syn ?? [])].flatMap(words))
      if (qw.length && qw.every(w => all.has(w))) offer(e, 60)
      else if (qc.length >= 4 && names.some(n => compact(n).includes(qc))) offer(e, 55)
    }
  }
  const ranked = [...scored.values()].sort((a, b) => b.score - a.score || (a.e.sci ?? a.e.name.vi).localeCompare(b.e.sci ?? b.e.name.vi))
  return { hits: ranked.slice(0, SEARCH_MAX).map(h => h.e), more: Math.max(0, ranked.length - SEARCH_MAX) }
}

/** A page's facts as Claude reads them: short lines, then its reference photos; `available`: the photos it could have shown. */
export function entryContent(e: CatalogEntry, f: Facts | undefined, refs: string[], available: number): Exclude<ToolOutput, string> {
  const lines = [`${e.id} (${e.kind}): ${e.name.vi}${e.sci ? `, ${e.sci}` : ''}`]
  if (f?.family) lines.push(`Family: ${f.family}`)
  if (f?.basedOn) lines.push(`A form of: ${f.basedOn}`)
  if (f?.names?.length) lines.push(`Also called: ${f.names.join('; ')}`)
  if (f?.sizeCm) lines.push(`Adult size: ${f.sizeCm} cm`)
  if (f?.from?.length) lines.push(`From: ${f.from.join(', ')}`)
  if (f?.text) lines.push(`Sources: ${f.text}`)
  lines.push(refs.length ? `Reference photos: ${refs.length}, below.` : available ? 'Reference photos: none, the limit for this identification is reached.' : 'Reference photos: none on this page.')
  return [{ type: 'text', text: lines.join('\n') }, ...refs.map((url): Anthropic.ImageBlockParam => ({ type: 'image', source: { type: 'url', url } }))]
}

export type ToolDeps = {
  catalog: Catalog
  lang: Lang
  /** A page's facts (the shard it is in, through the Worker's assets; a map in the script). */
  facts: (id: string) => Promise<Facts | undefined>
  /** A reference photo never to show (the accuracy script's: the test photo itself). */
  exclude?: (src: string) => boolean
}

/**
 * The page get_entry opens: by its id, else by a scientific name or synonym that is a species' or plant's own (the
 * whole name, else its binomial), so Claude can open its candidates in its first turn without searching for their ids.
 */
export function pageOf(c: Catalog, key: string): CatalogEntry | undefined {
  const byId = new Map(c.entries.map(e => [e.id, e]))
  const hit = byId.get(key.trim())
  if (hit) return hit
  const k = sciKey(key)
  if (!k.binomial.includes(' ')) return undefined
  const named = c.entries.filter(e => e.kind !== 'breed' && [e.sci, ...(e.syn ?? [])].some(n => n && sciKey(n).full === k.full))
  if (named.length) return named[0]
  return c.entries.find(e => e.kind !== 'breed' && [e.sci, ...(e.syn ?? [])].some(n => n && sciKey(n).binomial === k.binomial && sciKey(n).full === sciKey(n).binomial))
}

export function fishIdTools(d: ToolDeps): Tool<Step>[] {
  const nullable = (description: string) => ({ type: ['string', 'null'], description })
  const search: Tool<Step> = {
    name: 'search_handbook',
    description: 'Search the handbook\'s fish, shrimp, snail and plant pages by name, or list a genus\'s pages. Give a query (a scientific name, synonym or common name in any language) or a genus, and null for the other. Returns up to 12 pages as JSON: id, kind (species, breed, plant), sci, name (Vietnamese), basedOn (for a breed: what it is a form of). Text only: open a page with get_entry to see it.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['query', 'genus'],
      properties: { query: nullable('A scientific name, synonym or common name, or null.'), genus: nullable('A genus to list the pages of, or null.') },
    },
    step: input => {
      const q = String(input.query ?? input.genus ?? '').trim()
      return q ? { kind: 'search', query: q.slice(0, 100) } : undefined
    },
    run: async input => {
      const { hits, more } = searchCatalog(d.catalog, { query: input.query as string | null, genus: input.genus as string | null })
      if (!hits.length) return 'No page matches. Try the genus, a synonym or another name; the handbook may not have this one.'
      return `${JSON.stringify(hits.map(listed))}${more ? `\n${more} more: narrow the search.` : ''}`
    },
  }
  const entry: Tool<Step> = {
    name: 'get_entry',
    description: 'Open one handbook page by its scientific name (a species or plant) or by its id (from search_handbook, needed for a breed): its facts (family, adult size, where it comes from, what its sources say about its look and the sexes) and up to two reference photos of it, while the identification has photos left.',
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['id'],
      properties: { id: { type: 'string', description: 'A scientific name ("Paracheirodon simulans") or a page id as search_handbook gives it.' } },
    },
    step: input => {
      const e = pageOf(d.catalog, String(input.id))
      return e ? { kind: 'look', page: link(e, d.lang) } : undefined
    },
    run: async (input, ctx) => {
      const key = String(input.id)
      const e = pageOf(d.catalog, key)
      if (!e) throw new Error(`No page for ${JSON.stringify(key.slice(0, 80))}: the handbook may not have it, or uses another name; search_handbook finds it by genus or common name.`)
      const f = await d.facts(e.id)
      const photos = (f?.photos ?? []).filter(src => !d.exclude?.(src))
      return entryContent(e, f, photos.slice(0, Math.min(PHOTOS_PER_ENTRY, Math.max(0, ctx.photosLeft))), photos.length)
    },
  }
  return [search, entry]
}
