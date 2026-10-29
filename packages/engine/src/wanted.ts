import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { slugify } from '@aq/schema'
import type { Taxon } from './gbif'

/**
 * Species our pages name by scientific name but that have no page yet, keyed by the accepted name's slug.
 * `names`: every slug the pages used for it (synonyms too), so a source address under an old name still counts.
 */
export type Wanted = Map<string, { name: string; names: string[]; mentionedIn: string[] }>

const BINOMIAL = /\b([A-Z][a-z]{2,})\s+([a-z]{3,})\b/g
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')

/**
 * "Genus epithet" pairs in a text that could be scientific names: neither word is English (`isWord`, also with -s/-es/-ed/-ing
 * removed), and the first is not a family or subfamily (-idae, -inae, -ini). GBIF has the final say (resolveWanted).
 */
export function binomials(html: string, isWord: (w: string) => boolean): string[] {
  const english = (w: string) => [w, w.replace(/(es|s|ed|d|ing)$/, '')].some(x => x.length > 2 && isWord(x))
  const out = new Set<string>()
  for (const [, genus, epithet] of text(html).matchAll(BINOMIAL)) {
    if (/(idae|inae|ini)$/.test(genus!) || english(genus!.toLowerCase()) || english(epithet!) || ['spp', 'aff'].includes(epithet!)) continue
    out.add(`${genus} ${epithet}`)
  }
  return [...out]
}

/** Candidate names → pages naming them, from guide bodies and species profiles. */
export async function candidates(contentRoot: string, isWord: (w: string) => boolean): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  const add = (html: string, page: string) => { for (const n of binomials(html, isWord)) out.set(n, [...(out.get(n) ?? []), page]) }
  for (const id of (await readdir(join(contentRoot, 'guides')).catch(() => [] as string[])).sort()) {
    const vi = JSON.parse(await readFile(join(contentRoot, 'guides', id, 'vi.json'), 'utf8').catch(() => '{}')) as { body?: string }
    add(vi.body ?? '', `guides/${id}`)
    // Species a video shows, named by the extraction step (already scientific names, no dictionary filter needed).
    const e = JSON.parse(await readFile(join(contentRoot, 'guides', id, 'entity.json'), 'utf8').catch(() => '{}')) as { video?: { taxa?: string[] } }
    for (const n of e.video?.taxa ?? []) if (!n.endsWith(' sp.') && !(out.get(n) ?? []).includes(`guides/${id}`)) out.set(n, [...(out.get(n) ?? []), `guides/${id}`])
  }
  for (const id of (await readdir(join(contentRoot, 'species')).catch(() => [] as string[])).sort()) {
    const e = JSON.parse(await readFile(join(contentRoot, 'species', id, 'entity.json'), 'utf8').catch(() => '{}')) as { sections?: { html: string }[] }
    add((e.sections ?? []).map(s => s.html).join(' '), `species/${id}`)
  }
  return out
}

/**
 * Keeps names GBIF knows exactly as a species we don't have (synonyms resolve to the accepted name).
 * `gbif` is cached by the caller; `budget` caps lookups of names not seen before, so a run never stalls on them.
 */
export async function resolveWanted(cands: Map<string, string[]>, have: Set<string>, gbif: (name: string) => Promise<Taxon | null>, known: (name: string) => boolean, budget = 300): Promise<Wanted> {
  const wanted: Wanted = new Map()
  for (const [name, pages] of [...cands].sort((a, b) => b[1].length - a[1].length)) {
    if (!known(name) && budget-- <= 0) continue
    const t = await gbif(name).catch(() => null)
    if (!t || t.matchType !== 'EXACT' || t.canonicalName.split(' ').length !== 2) continue
    const slug = slugify(t.canonicalName)
    if (have.has(slug) || have.has(slugify(name))) continue
    const w = wanted.get(slug) ?? { name: t.canonicalName, names: [slug], mentionedIn: [] }
    if (!w.names.includes(slugify(name))) w.names.push(slugify(name))
    for (const p of pages) if (!w.mentionedIn.includes(p)) w.mentionedIn.push(p)
    wanted.set(slug, w)
  }
  return wanted
}

/** The wanted species a source page is about, from its address (".../species/synodontis-lucipinnis/", ".../potamotrygon_leopoldi_black_diamond_en/"). */
export function wantedIn(url: string, wanted: Wanted): string | undefined {
  let path: string
  try { path = new URL(url).pathname.toLowerCase().replace(/_/g, '-') } catch { return undefined }
  for (const seg of path.split('/')) {
    const head = seg.match(/^([a-z]+-[a-z]+)(?:-|$)/)?.[1]
    if (!head) continue
    for (const [slug, w] of wanted) if (w.names.includes(head)) return slug
  }
  return undefined
}

/** Wanted pages first (in discovery order), then everything else. */
export function wantedFirst<T extends { url: string }>(found: T[], wanted: Wanted): T[] {
  if (!wanted.size) return found
  const hit = found.filter(f => wantedIn(f.url, wanted))
  return hit.length ? [...hit, ...found.filter(f => !hit.includes(f))] : found
}
