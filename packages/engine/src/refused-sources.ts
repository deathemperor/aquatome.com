import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { refusedSite } from './cycle-only'

/**
 * The archives that keep a copy of a page under the page's own address, and where in their path it sits: the Internet
 * Archive's after /web/<time>[flags]/ (web.archive.org/web/2024id_/https://…, the only archive on any page or in any research
 * on 17 Nov 2026), archive.today's after /<time>/, /newest/ or /oldest/. An archive.today short id (/AbCdE) carries no
 * address, and nothing is fetched to learn it.
 */
const COPY_ROUTES: [hosts: string[], route: RegExp][] = [
  [['web.archive.org', 'wayback.archive.org'], /^\/web\/[0-9*]+[a-z_]*\/(.+)$/i],
  [['archive.today', 'archive.ph', 'archive.is', 'archive.li', 'archive.md', 'archive.vn', 'archive.fo'], /^\/(?:\d[\d.-]*|newest|oldest)\/(.+)$/i],
]
export const ARCHIVES = COPY_ROUTES.flatMap(([hosts]) => hosts)

/**
 * One web address on a refused site, or an archive's copy of a page on one. Matched by the address's own host, as
 * research's deny list matches (the site and any host under it, never a near name), after the address is parsed, so a host
 * written another way (percent-encoded, full-width, an ideographic full stop, a trailing dot) is the site. Another site's
 * address that carries the site's in its query, path or fragment (a share link) is that other site's: only an archive's
 * carries a copy, at its own place in the archive's path, with or without its scheme, and judged by that copy's own host
 * (Codex, 17 Nov 2026). A source that isn't a web address (a book) isn't one: refusedSite refuses what it can't read as an
 * address, for a fetch, so neither is an address that doesn't parse. Nothing is fetched: a page elsewhere that redirects to
 * the site isn't seen.
 */
export function onRefused(url: string): boolean {
  if (typeof url !== 'string' || !URL.canParse(url)) return false
  const u = new URL(url)
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
  if (refusedSite(url)) return true
  const host = u.hostname.toLowerCase().replace(/\.$/, '')
  const copy = COPY_ROUTES.find(([hosts]) => hosts.some(h => host === h || host.endsWith(`.${h}`)))?.[1].exec(u.pathname)?.[1]
  if (!copy) return false
  // The path holds the copy's address percent-encoded where it isn't plain ASCII.
  let original = copy
  try { original = decodeURIComponent(copy) } catch { /* left as written */ }
  return onRefused(/^https?:\/\//i.test(original) ? original : `https://${original}`)
}

/** An address as written in a text or a field, without the sentence's punctuation after it. */
const address = (s: string) => s.trim().replace(/[.,;:!?)\]}'"»”’。]+$/u, '')

/**
 * A source's or a reference's own address (`url`) on a refused site: one address, never split. One written without its
 * scheme (`www.cabaymau.vn/x`, `cabaymau.vn:443/x`) is read as a web address (the second reader, 17 Nov 2026; none on
 * 17 Nov), while a source that isn't one ("a book") still doesn't parse as one.
 */
const urlRefused = (x: unknown) => {
  const url = !!x && typeof x === 'object' ? (x as { url?: unknown }).url : undefined
  if (typeof url !== 'string') return false
  const a = address(url)
  return onRefused(a.includes('://') ? a : `https://${a}`)
}

/**
 * Whether a text names a refused site's page: any address in it (an address alone, or a link in a page's HTML), each up to a
 * space, a quote, a bracket, a comma or a semicolon, without the sentence's punctuation after it (Codex, 17 Nov 2026).
 */
export const namesRefused = (text: string) => (text.match(/https?:\/\/[^\s"'<>()[\]{},;`]+/gi) ?? []).some(u => onRefused(address(u)))

/**
 * A refused site's facts leave research, whatever the kind (the chief of staff, 17 Nov 2026, for Thursday 19 Nov): a guide's,
 * a glossary term's, a material's, a breed's, a product's or a species' facts file, each a top-level `sources` list and,
 * anywhere under it, items that cite a source by its index there (`source`, and a term's or a guide's `also`). An item whose
 * `source` is on a refused site (cycle-only.ts REFUSED_SITES) goes from its list, whatever else its `also` lists: research's
 * "another page gives the same" is a match on wording, not a read of that page (the chief of staff, 17 Nov 2026). A refused
 * page leaves every `also`, and `sources`, and every index after it moves up. Every item citing a source sits in a list in
 * every kind's facts, so nothing else is dropped. Out-of-range indexes are left as they are: they stay out of range.
 * Research is denied the site (claude.ts researchDeny), so what this drops is a page research found through search alone,
 * or research kept from before the site was refused. Each kind's step runs it on its research before anything reads it,
 * and refusedSweep over what is kept.
 */
export function withoutRefused<T extends { sources: { url: string }[] }>(r: T): { kept: T; refused: { url: string; items: number }[]; dropped: { list: string; at: number }[] } {
  // Research that found nothing may give no sources.
  const gone = new Set((r.sources ?? []).flatMap((s, i) => (urlRefused(s) ? [i] : [])))
  if (!gone.size) return { kept: r, refused: [], dropped: [] }
  const to = new Map<number, number>()
  r.sources.forEach((_, i) => { if (!gone.has(i)) to.set(i, to.size) })
  const at = (i: number) => (gone.has(i) ? undefined : to.get(i) ?? i)
  const count = new Map<number, number>([...gone].map(i => [i, 0]))
  const dropped: { list: string; at: number }[] = []
  const cites = (x: unknown): x is { source: number; also?: number[] } => !!x && typeof x === 'object' && typeof (x as { source?: unknown }).source === 'number'
  const walk = (x: unknown, path: string): unknown => {
    if (Array.isArray(x)) {
      return x.flatMap((y, i) => {
        if (cites(y) && gone.has(y.source)) { count.set(y.source, count.get(y.source)! + 1); dropped.push({ list: path, at: i }); return [] }
        return [walk(y, `${path}[${i}]`)]
      })
    }
    if (!x || typeof x !== 'object') return x
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(x)) {
      // An item citing a refused page outside a list has nowhere to leave from: said, never renumbered to another page.
      if (k === 'source' && typeof v === 'number') { if (gone.has(v)) throw new Error(`${path || 'the research'} cites a refused page (source ${v}) outside a list`); out[k] = at(v) }
      else if (k === 'also' && Array.isArray(v) && v.every(i => typeof i === 'number')) {
        const also = v.flatMap(i => { const j = at(i); return j === undefined ? [] : [j] })
        // An `also` the refused page alone made goes; one that was empty stays as it was.
        if (also.length || !v.length) out[k] = also
      } else out[k] = walk(v, path ? `${path}.${k}` : k)
    }
    return out
  }
  const { sources, ...rest } = r
  const kept = { ...(walk(rest, '') as object), sources: sources.filter((_, i) => !gone.has(i)) } as T
  // Keys in the order the file had them, so a file written again differs only where something left.
  const ordered = Object.fromEntries(Object.keys(r).map(k => [k, (kept as Record<string, unknown>)[k]])) as T
  return { kept: ordered, refused: [...gone].map(i => ({ url: r.sources[i]!.url, items: count.get(i)! })), dropped }
}

/** A page's reference list (`refs`, as a guide's and a glossary term's give them, in every language) without a refused site's pages. */
export const refsWithoutRefused = <R extends { url: string }>(refs: R[]): R[] => refs.filter(x => !urlRefused(x))

/** The kinds whose research is kept in engine-state/<kind>, each file one research with its `sources`. */
export const FACTS_DIRS = ['topics', 'glossary', 'materials', 'breeds', 'products', 'species-research'] as const

/**
 * Pages whose text cites its sources by number, so a refused page can leave its list only with its text: each with why,
 * who takes it out and the day they said (cycle-only.ts REFUSED_SITES: a site is added only with these). The real-content
 * check holds every other page to no refused page anywhere in it, and these to still having one, so each leaves this list
 * the day its text is fixed.
 */
export const WAITING: Record<string, { why: string; owner: string; day: string }> = {
  'content/materials/lua/entity.json': { why: 'the driftwood page\'s text cites the refused page as [1] in 21 sentences, and a person fixed that text (bodyFixed): it is re-cited by hand (the chief of staff, 17 Nov 2026)', owner: 'the Writing Lead', day: '2026-11-18' },
}

const indentOf = (raw: string) => raw.match(/^\{\n( +)/)?.[1]?.length ?? 2

/**
 * A pass over what is kept, with no model: once by hand (`pnpm engine refused-sweep`), and in every sweep (sweep.ts), which
 * each cycle runs before its build and again on the merge at its push, with main's code: a run that started before a
 * refused site's facts left, on older code, and writes them again, has them taken out at its push, before its tests. It is: every facts file in engine-state/<FACTS_DIRS> through
 * withoutRefused, and every page's top-level reference list (`refs`, in content/<kind>/<id>/<lang>.json and entity.json)
 * through refsWithoutRefused. A list a page's text may cite by number isn't one of these (a section's `refs`, half of whose
 * sections cite by number on 17 Nov 2026; a material's or a breed's `sources`): the real-content check fails on one that
 * names a refused page, so it stops the run's push until a person takes it out, and a page left so is in WAITING.
 * Only a file something left is written, at its own indent. For each facts file, where each of its top-level facts moved
 * (`moved`: old index to new, null for one that left), for the notes that name a fact by its number.
 */
export async function refusedSweep(root: string) {
  const facts: { file: string; refused: { url: string; items: number }[]; dropped: number; moved: Record<number, number | null> }[] = []
  const refs: { file: string; urls: string[] }[] = []
  // A file that names a refused site but can't be read or cleaned: named, and the pass goes on (a sweep runs it every cycle).
  const failed: string[] = []
  const files = async (dir: string) => (await readdir(join(root, dir)).catch(() => [] as string[])).filter(f => f.endsWith('.json')).sort()
  for (const kind of FACTS_DIRS) {
    for (const name of await files(`engine-state/${kind}`)) {
      const file = `engine-state/${kind}/${name}`
      // Every file parsed: a host written another way doesn't spell the site's name (Codex, 17 Nov 2026).
      const raw = await readFile(join(root, file), 'utf8')
      let data: { sources?: { url: string }[] }
      let r: ReturnType<typeof withoutRefused<{ sources: { url: string }[] }>>
      try {
        data = JSON.parse(raw) as typeof data
        if (!Array.isArray(data.sources)) continue
        r = withoutRefused(data as { sources: { url: string }[] })
      } catch (err) { failed.push(`${file}: ${(err as Error).message}`); continue }
      if (!r.refused.length) continue
      await writeFile(join(root, file), `${JSON.stringify(r.kept, null, indentOf(raw))}\n`)
      const gone = r.dropped.filter(d => d.list === 'facts').map(d => d.at)
      const n = Array.isArray((data as { facts?: unknown[] }).facts) ? (data as { facts: unknown[] }).facts.length : 0
      const moved = Object.fromEntries(Array.from({ length: n }, (_, i) => [i, gone.includes(i) ? null : i - gone.filter(g => g < i).length]).filter(([i, j]) => i !== j))
      facts.push({ file, refused: r.refused, dropped: r.dropped.length, moved })
    }
  }
  // Every page's files, about 30,000: read 64 at a time, and parsed when one has a reference list (about 240).
  const pages = (await readdir(join(root, 'content'), { recursive: true, withFileTypes: true }).catch(() => []))
    .filter(d => d.isFile() && d.name.endsWith('.json')).map(d => relative(root, join(d.parentPath, d.name))).sort()
  for (let i = 0; i < pages.length; i += 64) {
    for (const [file, raw] of await Promise.all(pages.slice(i, i + 64).map(async f => [f, await readFile(join(root, f), 'utf8')] as const))) {
      if (!raw.includes('"refs"')) continue
      // A file that doesn't parse, or a reference list that can't be read, is named and the pass goes on (Codex, 17 Nov 2026).
      let page: { refs?: { url: string }[] }
      let kept: { url: string }[]
      try {
        page = JSON.parse(raw) as typeof page
        if (!Array.isArray(page.refs)) continue
        kept = refsWithoutRefused(page.refs)
      } catch (err) { failed.push(`${file}: ${(err as Error).message}`); continue }
      if (kept.length === page.refs.length) continue
      await writeFile(join(root, file), `${JSON.stringify({ ...page, refs: kept }, null, indentOf(raw))}\n`)
      refs.push({ file, urls: page.refs.filter(x => !kept.includes(x)).map(x => x.url) })
    }
  }
  return { facts, refs, failed }
}

/**
 * Every file under content/ and the kinds' kept research that names a refused site's page anywhere (namesRefused on each
 * string: references, sources, photos' pages, links in a text), each file parsed, for the real-content check. What
 * refusedSweep leaves of it is WAITING's pages, and a refused page a person must take out of a text by hand.
 */
export async function filesNamingRefused(root: string): Promise<string[]> {
  // Every string as a text, and every `url` also as one address, with or without its scheme.
  const walk = (x: unknown): boolean => typeof x === 'string' ? namesRefused(x) : Array.isArray(x) ? x.some(walk) : !!x && typeof x === 'object' && (urlRefused(x) || Object.values(x).some(walk))
  const naming: string[] = []
  for (const dir of ['content', ...FACTS_DIRS.map(k => `engine-state/${k}`)]) {
    const files = (await readdir(join(root, dir), { recursive: true, withFileTypes: true }).catch(() => []))
      .filter(d => d.isFile() && d.name.endsWith('.json')).map(d => relative(root, join(d.parentPath, d.name))).sort()
    for (let i = 0; i < files.length; i += 64) {
      for (const [file, raw] of await Promise.all(files.slice(i, i + 64).map(async f => [f, await readFile(join(root, f), 'utf8')] as const))) {
        let data: unknown
        // A file that doesn't parse stops the check, named.
        try { data = JSON.parse(raw) } catch (err) { throw new Error(`${file}: ${(err as Error).message}`) }
        if (walk(data)) naming.push(file)
      }
    }
  }
  return naming.sort()
}
