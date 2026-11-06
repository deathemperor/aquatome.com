import type Anthropic from '@anthropic-ai/sdk'
import type { Tool, ToolOutput } from '../agent/tools'
import type { Catalog, CatalogEntry, Lang } from './catalog'
import { PHOTOS_PER_PAGE, type Facts } from './facts'
import { compact, link, sciKey, words, type Linked } from './match'

/**
 * The fish-ID agent's tools (fishid/agent.ts), over the handbook's public pages only: search_handbook over the catalog
 * (/app/fish-id.json, which the Worker has loaded already) and get_entry over the facts shards (facts.ts). Neither
 * writes anything. No Cloudflare types: the accuracy script runs them in Node over content/.
 */
export type Step = { kind: 'search'; query: string } | { kind: 'look'; page: Linked }

/** Entries a search returns at most; a genus's listing, which gives each page's marks to read against the photo, more. */
export const SEARCH_MAX = 12
export const GENUS_MAX = 80

type Hit = { e: CatalogEntry; score: number }
/** A page as a search lists it: text only, Vietnamese name (every page has one), what a breed is a form of. */
const listed = (e: CatalogEntry, marks = false) => ({ id: e.id, kind: e.kind, ...(e.sci ? { sci: e.sci } : {}), name: e.name.vi, ...(e.basedOn ? { basedOn: e.basedOn } : {}), ...(marks && e.look ? { look: e.look } : {}) })

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
  const max = g ? GENUS_MAX : SEARCH_MAX
  return { hits: ranked.slice(0, max).map(h => h.e), more: Math.max(0, ranked.length - max) }
}

/** A page's facts as Claude reads them: short lines, then its reference photos; `available`: the photos it could have shown. */
export function entryContent(e: CatalogEntry, f: Facts | undefined, refs: string[], available: number): Exclude<ToolOutput, string> {
  const lines = [`${e.id} (${e.kind}): ${e.name.vi}${e.sci ? `, ${e.sci}` : ''}`]
  if (f?.family) lines.push(`Family: ${f.family}`)
  if (f?.basedOn) lines.push(`A form of: ${f.basedOn}`)
  if (f?.names?.length) lines.push(`Also called: ${f.names.join('; ')}`)
  if (f?.sizeCm) lines.push(`Adult size: ${f.sizeCm} cm`)
  if (f?.from?.length) lines.push(`From: ${f.from.join(', ')}`)
  if (f?.look) lines.push(`Marks: ${f.look}`)
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
  /** A page's facts couldn't be read (`facts` threw): the Worker counts it. */
  onFactsMissing?: () => void
  /** The genera already listed in this run, shared with the agent's second look (agent.ts recheckOf); a new set if none. */
  listed?: Set<string>
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

/** A genus's species or plants in the handbook (never its breeds), each with its marks, as JSON; '' when the handbook has none of it. */
export function genusMarks(c: Catalog, genus: string, without?: string): string {
  const hits = searchCatalog(c, { genus }).hits.filter(e => e.kind !== 'breed' && e.id !== without)
  return hits.length ? JSON.stringify(hits.map(e => listed(e, true))) : ''
}

export function fishIdTools(d: ToolDeps): Tool<Step>[] {
  /** The genera already listed in this run (search_handbook's genus, or a page get_entry opened): each once. */
  const listedGenera = d.listed ?? new Set<string>()
  const nullable = (description: string) => ({ type: ['string', 'null'], description })
  const search: Tool<Step> = {
    name: 'search_handbook',
    description: 'Search the handbook\'s fish, shrimp, snail and plant pages by name, or list a genus\'s pages. Give a query (a scientific name, synonym or common name in any language) or a genus, and null for the other. Returns pages as JSON: id, kind (species, breed, plant), sci, name (Vietnamese), basedOn (for a breed: what it is a form of); up to 12 for a query. A genus lists all its pages (up to 80), each species with look: what its sources say tells it from the others (colours, marks, English). Text only: open a page with get_entry to see its photos.',
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
      const genus = input.genus as string | null
      if (genus) listedGenera.add(sciKey(genus).genus)
      const { hits, more } = searchCatalog(d.catalog, { query: input.query as string | null, genus })
      if (!hits.length) return 'No page matches. Try the genus, a synonym or another name; the handbook may not have this one.'
      return `${JSON.stringify(hits.map(e => listed(e, Boolean(genus))))}${more ? `\n${more} more: narrow the search.` : ''}`
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
      const f = await d.facts(e.id).catch(() => null)
      if (f === null) {
        d.onFactsMissing?.()
        return [{ type: 'text', text: `${e.id} (${e.kind}): ${e.name.vi}${e.sci ? `, ${e.sci}` : ''}\nThis page's facts and reference photos can't be read just now: judge by its name.` }]
      }
      const photos = (f?.photos ?? []).filter(src => !d.exclude?.(src))
      const content = entryContent(e, f, photos.slice(0, Math.min(PHOTOS_PER_PAGE, Math.max(0, ctx.photosLeft))), photos.length)
      // The rest of a species' genus with their marks, once a run: the species the agent didn't think of, to read against the photo.
      const genus = e.kind === 'species' && e.sci ? sciKey(e.sci).genus : ''
      if (!genus || listedGenera.has(genus)) return content
      listedGenera.add(genus)
      const others = genusMarks(d.catalog, genus, e.id)
      if (!others) return content
      const name = genus[0]!.toUpperCase() + genus.slice(1)
      return [...content, { type: 'text', text: `The other ${(JSON.parse(others) as unknown[]).length} species of ${name} in the handbook, each with what its sources say tells it apart:\n${others}` }]
    },
  }
  return [search, entry]
}
