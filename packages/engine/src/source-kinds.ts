import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Llm } from './claude'
import { SOURCE_KINDS, type SourceKind, type TopicFacts } from './topics'

const KINDS = Object.keys(SOURCE_KINDS) as SourceKind[]
/** A farm's page or a forum post stays one: a dose from one needs a second source (topics.ts usableFact). */
const KEEP: readonly string[] = ['farm', 'forum']
/** Up to three of a source's facts: who a page is written for (a pond, a tank) shows in what it says. */
const gave = (r: TopicFacts, i: number) => r.facts.filter(f => f.source === i).slice(0, 3).map(f => JSON.stringify(f.fact)).join('; ') || 'nothing'

/**
 * Research tagged before the kinds a page names its sources by (topics.ts SOURCE_KINDS), tagged again from each source's
 * address, title and facts, one call a topic. A source tagged farm or forum keeps it; one newly found to be either becomes one.
 */
export async function retagSources(root: string, llm: Llm, o: { only?: string[]; dryRun?: boolean } = {}) {
  const dir = join(root, 'engine-state/topics')
  const ids = (await readdir(dir)).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)).filter(id => !o.only || o.only.includes(id)).sort()
  const count = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1)
  const report = { topics: 0, before: new Map<string, number>(), after: new Map<string, number>(), changed: [] as string[] }
  for (const id of ids) {
    const file = join(dir, `${id}.json`)
    const r = JSON.parse(await readFile(file, 'utf8')) as TopicFacts
    if (!r.sources?.length) continue
    const a = await llm<{ kinds: { source: number; kind: string }[] }>({
      system: "You sort a fishkeeping guide's sources by who wrote them. Reply only with JSON.",
      schema: { type: 'object', required: ['kinds'], properties: { kinds: { type: 'array', items: { type: 'object', required: ['source', 'kind'], properties: { source: { type: 'number' }, kind: { type: 'string', enum: KINDS } } } } } },
      prompt: `Each line below is a page a fishkeeping guide's facts came from: its number, address and title, and the kind it was tagged before, from an older, coarser list. Give each its kind, by who wrote it and for whom, from its address, its title and what it gave:\n${KINDS.map(k => `- ${k}: ${SOURCE_KINDS[k]}`).join('\n')}\nA page you can't place from these is other.\n\n${r.sources.map((s, i) => `${i}. ${s.url} | ${s.title} | before: ${s.kind} | gave: ${gave(r, i)}`).join('\n')}`,
    })
    const got = new Map((a.kinds ?? []).map(k => [k.source, k.kind]))
    report.topics++
    r.sources = r.sources.map((s, i) => {
      const said = got.get(i)
      const kind: SourceKind = KEEP.includes(s.kind) ? s.kind : KINDS.includes(said as SourceKind) ? said as SourceKind : KINDS.includes(s.kind) ? s.kind : 'other'
      count(report.before, s.kind); count(report.after, kind)
      if (kind !== s.kind) report.changed.push(`${id} ${i}: ${s.kind} → ${kind} (${s.url})`)
      return { ...s, kind }
    })
    if (!o.dryRun) await writeFile(file, `${JSON.stringify(r, null, 2)}\n`)
  }
  return report
}
