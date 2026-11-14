import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IDEA_SOURCES, ideaHost, NEVER_RESEARCHED } from './idea-sources'
import { isMarketplace } from './marketplaces'
import { SOURCES, type SourceConfig } from './sources'

/**
 * Hosts that hold other copies of any page, each a way round the cycle's pace (the Writing Lead, 14 Nov 2026): the Internet
 * Archive's, archive.today's names, Google's cache, Google Translate's proxy (a host for every site) and a reader proxy. A
 * WebFetch domain rule matches its host only and "*.host" every host under it, never the host itself, so both are given.
 */
const COPY_HOSTS = [
  'archive.org', '*.archive.org',
  ...['archive.ph', 'archive.is', 'archive.today', 'archive.li', 'archive.md', 'archive.vn'].flatMap(h => [h, `*.${h}`]),
  'webcache.googleusercontent.com',
  '*.translate.goog',
  'r.jina.ai',
]

/** Every host a source's pages stand on: its discovery addresses' and those its address pattern names, bare. */
function hostsOf(s: SourceConfig): string[] {
  const d = s.discover
  const urls = d.kind === 'sitemap' ? d.urls : d.kind === 'crawl' ? d.start : [`https://${d.prefix}`]
  // A host starts the pattern or follows "//": "species.php" further on is a path.
  const named = [...s.include.source.matchAll(/(?:^\^?|\\\/\\\/)((?:[a-z0-9-]+\\\.)+[a-z]{2,})/gi)].map(m => m[1]!.replace(/\\\./g, '.'))
  return [...new Set([...urls.map(u => new URL(u).hostname), ...named].map(h => h.toLowerCase().replace(/^www\./, '')))]
}

type Entry = { blockedAt?: string; blocks?: string[]; archive?: string }
const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x)
const isEntry = (e: unknown): e is Entry => isObject(e) && ['blockedAt', 'archive'].every(k => e[k] === undefined || typeof e[k] === 'string')
  && (e.blocks === undefined || (Array.isArray(e.blocks) && e.blocks.every(b => typeof b === 'string')))
/**
 * The engine's record of its sources (`engine-state/_sources.json`, state.ts), read strictly: missing, unreadable or not the
 * record's shape, research has no list to keep to, so it doesn't run (the cycle itself reads a missing record as empty).
 */
async function sourceRecord(root: string): Promise<Record<string, Entry>> {
  const file = join(root, 'engine-state', '_sources.json')
  const d: unknown = JSON.parse(await readFile(file, 'utf8'))
  if (!isObject(d) || !Object.values(d).every(isEntry)) throw new Error(`${file} is not the engine's record of its sources: research keeps to it, so it doesn't run`)
  return d as Record<string, Entry>
}

/**
 * The hosts web research never reads (the chief of staff, 14 Nov 2026, on the owner's rule: a source that challenges us is
 * read only the way the engine's cycle reads it, at its pace, and nothing goes round that). These are the sources the engine
 * reads only through the Internet Archive, by their config or moved there by the engine itself, and those with a browser
 * check's block on record (`blockedAt`, cleared by the next good run, so a source the owner has cleared comes back), all
 * from the engine's own list, so a new one is covered; and the sites read for ideas whose listing refused us (ideas.ts),
 * and the magazine read for ideas, always (idea-sources.ts NEVER_RESEARCHED). Each host is given bare and as "*.host" (its
 * "www.", its forum and any other host under it), plus the hosts that hold other copies of any page.
 */
export async function cycleOnlyHosts(root: string): Promise<string[]> {
  const record = await sourceRecord(root)
  const out = new Set<string>([...COPY_HOSTS, ...NEVER_RESEARCHED])
  for (const s of SOURCES) {
    if (s.via !== 'archive' && !record[s.id]?.archive && !record[s.id]?.blockedAt) continue
    for (const h of hostsOf(s)) { out.add(h); out.add(`*.${h}`) }
  }
  for (const s of IDEA_SOURCES) if (record[s.id]?.blockedAt) { out.add(ideaHost(s)); out.add(`*.${ideaHost(s)}`) }
  return [...out].sort()
}

/** Whether a URL's host is one of `hosts`, or under a "*.host" of them ("forum.x.com" under "*.x.com"), as WebFetch's rules match. */
export function refused(hosts: readonly string[], url: string): boolean {
  let h: string
  try { h = new URL(url).hostname.toLowerCase().replace(/\.$/, '') } catch { return true }
  return hosts.some(r => (r.startsWith('*.') ? h.endsWith(r.slice(1)) : h === r))
}

/**
 * A page a step's research named (a shop's page with a price), fetched by the engine itself, which no WebFetch rule sees:
 * never a marketplace's nor one `cycleOnlyHosts` names, at every redirect, each followed by hand.
 */
export const researchedPage = (root: string, get: typeof fetch = fetch) => async (u: string): Promise<string> => {
  const off = await cycleOnlyHosts(root)
  for (let hop = 0, url = u; hop < 4; hop++) {
    if (isMarketplace(url)) throw new Error(`marketplace: ${url}`)
    if (refused(off, url)) throw new Error(`read only at the engine's own pace: ${url}`)
    const res = await get(url, { redirect: 'manual', headers: { 'user-agent': 'Mozilla/5.0 (compatible; AquaTome/1.0; +https://aquatome.com)' }, signal: AbortSignal.timeout(20_000) })
    const next = res.headers.get('location')
    if (res.status >= 300 && res.status < 400 && next) { url = new URL(next, url).href; continue }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res.text()
  }
  throw new Error('too many redirects')
}
