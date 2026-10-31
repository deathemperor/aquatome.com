import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { speciesDepth, STAPLE_SPECIES, slugify, type Depth, type Section, type SourceId } from '@aq/schema'
import type { SourceConfig } from './sources'
import { retryFirst, type UrlState } from './state'

/**
 * Thin species pages (below the depth bar with no in-depth source, @aq/schema depth.ts) pull their pages from the
 * in-depth sources first: a source's due pages run transient retries first, then thin species' profiles (most popular
 * first), then the rest. The site keeps thin pages out of search until they are deep (load.ts).
 */
export type Thin = { id: string; name: string; scientificName: string; genus: string; family: string; sources: SourceId[]; depth: Depth }

type Entity = { scientificName: string; genus: string; family: string; sections: Section[] }
const readJson = async <T>(path: string): Promise<T | undefined> => readFile(path, 'utf8').then(s => JSON.parse(s) as T, () => undefined)

/** Species page ids, most popular first: the staples, then what shops sell and the most-kept fish (shops.ts popularFirst). */
export const popularityOrder = (popular: string[]) => [...new Set([...STAPLE_SPECIES, ...popular.map(slugify)])]

/** Every thin species page, as a public build shows it (published sources only), most popular first (`order`: ids). */
export async function thinSpecies(contentRoot: string, order: string[]): Promise<{ pages: number; thin: Thin[]; families: Map<string, string> }> {
  const published = (await readJson<Partial<Record<SourceId, { publish?: boolean }>>>(join(contentRoot, 'sources.json'))) ?? {}
  const thin: Thin[] = []
  const families = new Map<string, string>()
  let pages = 0
  for (const id of (await readdir(join(contentRoot, 'species')).catch(() => [] as string[])).sort()) {
    const e = await readJson<Entity>(join(contentRoot, 'species', id, 'entity.json'))
    const vi = await readJson<{ name: string }>(join(contentRoot, 'species', id, 'vi.json'))
    if (!e || !vi) continue
    if (e.genus && e.family) families.set(e.genus.toLowerCase(), e.family)
    const shown = e.sections.filter(s => published[s.source]?.publish)
    if (!shown.length) continue
    pages++
    const depth = speciesDepth(shown)
    if (!depth.deep) thin.push({ id, name: vi.name, scientificName: e.scientificName, genus: e.genus, family: e.family, sources: [...new Set(shown.map(s => s.source))], depth })
  }
  const rank = (id: string) => { const i = order.indexOf(id); return i < 0 ? order.length : i }
  thin.sort((a, b) => rank(a.id) - rank(b.id) || a.id.localeCompare(b.id))
  return { pages, thin, families }
}

/** The same epithet in another gender (incisus, incisa; caudimaculatus, caudimaculatum; niger, nigra). */
const stem = (epithet: string) => epithet.replace(/(us|um|a|is|e|er|ra|rum)$/, '')
/** "genus-epithet" pairs an address names: each path segment's first two words (/species/betta-macrostoma, /callichthyidae/corydoras_panda.htm). */
export function namedPairs(url: string): [string, string][] {
  let path: string
  try { path = new URL(url).pathname.toLowerCase().replace(/_/g, '-').replace(/\.html?$/, '') } catch { return [] }
  return path.split('/').flatMap(seg => { const m = seg.match(/^([a-z]+)-([a-z]+)(?:-|$)/); return m ? [[m[1]!, m[2]!] as [string, string]] : [] })
}
const sameSpecies = (pair: [string, string], t: Thin, anyGenus = false) => {
  const [genus, epithet] = t.id.split('-')
  return !!genus && !!epithet && (anyGenus || pair[0] === genus) && stem(pair[1]) === stem(epithet)
}

/** Thin species' profiles among a source's pages, by the name in their address (same genus): url → index in `thin`. */
export function deeperPages(found: { url: string }[], thin: Thin[], src: Pick<SourceConfig, 'profiles'>): Map<string, number> {
  const out = new Map<string, number>()
  if (!src.profiles) return out
  for (const { url } of found) {
    if (!src.profiles.test(url)) continue
    const i = thin.findIndex(t => namedPairs(url).some(p => sameSpecies(p, t)))
    if (i >= 0) out.set(url, i)
  }
  return out
}

export type SearchCache = Record<string, { url: string | null; at: string }>
export const SEARCH_FILE = 'engine-state/_depth-search.json'
const SEARCH_DAYS = 30
export const SEARCH_BUDGET = 20

/**
 * A thin species the source lists under another name (a newer genus: Corydoras panda is Hoplisoma panda on Seriously Fish):
 * the source's own search by our name, cached per species for SEARCH_DAYS (at most `budget` searches a run). A result counts
 * when it names the same epithet, in our genus or in one we don't know under another family.
 */
export async function searchThin(
  src: Pick<SourceConfig, 'id' | 'profiles' | 'search' | 'include'>, thin: Thin[], have: Set<number>, families: Map<string, string>,
  links: (url: string) => Promise<string[]>, cache: SearchCache, now: Date, budget = SEARCH_BUDGET,
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!src.search || !src.profiles) return out
  const fresh = (at: string) => now.getTime() - new Date(at).getTime() < SEARCH_DAYS * 86_400_000
  for (const [i, t] of thin.entries()) {
    if (have.has(i)) continue
    const key = `${src.id}/${t.id}`
    const hit = cache[key]
    if (hit?.url) { out.set(hit.url, i); continue }
    if ((hit && fresh(hit.at)) || budget <= 0) continue
    budget--
    const results = (await links(src.search(t.scientificName))).map(u => u.split('#')[0]!).filter(u => src.include.test(u) && src.profiles!.test(u))
    const url = results.find(u => namedPairs(u).some(p => sameSpecies(p, t, true) && (p[0] === t.genus.toLowerCase() || !families.has(p[0]) || families.get(p[0]) === t.family))) ?? null
    cache[key] = { url, at: now.toISOString().slice(0, 10) }
    if (url) out.set(url, i)
  }
  return out
}
export const readSearchCache = async (root: string) => (await readJson<SearchCache>(join(root, SEARCH_FILE))) ?? {}
export async function saveSearchCache(root: string, cache: SearchCache) {
  await mkdir(join(root, 'engine-state'), { recursive: true })
  await writeFile(join(root, SEARCH_FILE), `${JSON.stringify(Object.fromEntries(Object.entries(cache).sort()), null, 2)}\n`)
}

/**
 * A source's due pages in run order: a transient failure's retry first (the browser or network gone, a usage limit:
 * state.ts), then thin species' profiles (`deeper`: url → popularity rank), each group most popular first; then the rest
 * as given (wanted and popular species first: wanted.ts).
 */
export function runOrder<T extends { url: string }>(due: T[], state: Record<string, UrlState>, deeper: Map<string, number>): T[] {
  const tier = (url: string) => (retryFirst(state[url]) ? 0 : deeper.has(url) ? 1 : 2)
  return due
    .map((f, i) => ({ f, i, tier: tier(f.url), rank: deeper.get(f.url) ?? Infinity }))
    .sort((a, b) => a.tier - b.tier || (a.tier < 2 && a.rank !== b.rank ? a.rank - b.rank : 0) || a.i - b.i)
    .map(x => x.f)
}

export type DepthReport = { pages: number; thin: number; bySource: Record<string, number>; top: { id: string; name: string; sources: string; chars: number }[] }
/** Thin pages by the sources they're made from ("glaser", "bwaquatics+glaser"), and the most popular ones. */
export function depthReport(pages: number, thin: Thin[], top = 20): DepthReport {
  const bySource: Record<string, number> = {}
  for (const t of thin) { const k = t.sources.slice().sort().join('+'); bySource[k] = (bySource[k] ?? 0) + 1 }
  return {
    pages, thin: thin.length,
    bySource: Object.fromEntries(Object.entries(bySource).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    top: thin.slice(0, top).map(t => ({ id: t.id, name: t.name, sources: t.sources.join('+'), chars: t.depth.chars })),
  }
}
