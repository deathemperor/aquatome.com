import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { REFUSED_SITES, refusedSite } from './cycle-only'

/**
 * A web page on a refused site, or a copy of one: an address another address carries whole, as the Internet Archive's
 * (web.archive.org/web/<time>/https://…) and archive.today's do. Matched by host, as research's deny list matches (the site
 * and any host under it, never a near name). A source that isn't a web address (a book) isn't one: refusedSite refuses what
 * it can't read as an address, for a fetch, so neither is an address that doesn't parse. Nothing is fetched: a page elsewhere that redirects to the site isn't seen.
 */
export const onRefused = (url: string) => (url.match(/https?:\/\/(?:(?!https?:\/\/)[^\s"'<>])+/gi) ?? []).some(u => URL.canParse(u) && refusedSite(u))

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
  const gone = new Set((r.sources ?? []).flatMap((s, i) => (onRefused(s.url) ? [i] : [])))
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
export const refsWithoutRefused = <R extends { url: string }>(refs: R[]): R[] => refs.filter(x => !onRefused(x.url))

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
 * withoutRefused, and every page's reference list (`refs`, in content/<kind>/<id>/<lang>.json and entity.json) through
 * refsWithoutRefused. A list whose page cites by number (a material's or a breed's `sources`) isn't one of these: see WAITING.
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
      const raw = await readFile(join(root, file), 'utf8')
      if (!REFUSED_SITES.some(h => raw.toLowerCase().includes(h))) continue
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
  // Every page's files, about 29,000: read 64 at a time, and parsed only when one names a refused site.
  const pages = (await readdir(join(root, 'content'), { recursive: true, withFileTypes: true }).catch(() => []))
    .filter(d => d.isFile() && d.name.endsWith('.json')).map(d => relative(root, join(d.parentPath, d.name))).sort()
  for (let i = 0; i < pages.length; i += 64) {
    for (const [file, raw] of await Promise.all(pages.slice(i, i + 64).map(async f => [f, await readFile(join(root, f), 'utf8')] as const))) {
      if (!REFUSED_SITES.some(h => raw.toLowerCase().includes(h)) || !raw.includes('"refs"')) continue
      let page: { refs?: { url: string }[] }
      try { page = JSON.parse(raw) as typeof page } catch (err) { failed.push(`${file}: ${(err as Error).message}`); continue }
      if (!Array.isArray(page.refs)) continue
      const kept = refsWithoutRefused(page.refs)
      if (kept.length === page.refs.length) continue
      await writeFile(join(root, file), `${JSON.stringify({ ...page, refs: kept }, null, indentOf(raw))}\n`)
      refs.push({ file, urls: page.refs.filter(x => !kept.includes(x)).map(x => x.url) })
    }
  }
  return { facts, refs, failed }
}
