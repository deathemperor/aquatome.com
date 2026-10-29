import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { QUALITY_THRESHOLD } from '@aq/schema'
import { LlmError, type Llm } from './claude'
import { reviewRewrite, reviewTranslation } from './quality'
import { rewriteVi, type Part, type RewriteOpts } from './vi-rewrite'

/** Kinds in the order they are rewritten: guides are read most, glossary least. */
export const REWRITE_KINDS = ['guides', 'species', 'plants', 'glossary'] as const
type Kind = (typeof REWRITE_KINDS)[number]
type Group = { source?: string; parts: Part[] }
type Job = { id: string; kind: Kind; slug: string; groups: Group[] }
type Vi = { sections?: Record<string, string>; body?: string; definition?: string; quality?: { score: number; indexable: boolean; bySource?: Record<string, number> } }
export type RewriteState = Record<string, { at: string; rewritten: number; of: number; scores: number[]; error?: string }>

const CHUNK = 12_000 // English characters per model call
const json = async <T>(f: string): Promise<T> => JSON.parse(await readFile(f, 'utf8'))

/** Each page's text in groups that are reviewed together: one source's sections (chunked), or one Vietnamese-only field. */
async function jobs(contentRoot: string, kinds: readonly Kind[]): Promise<Job[]> {
  const out: Job[] = []
  for (const kind of kinds) {
    for (const slug of (await readdir(join(contentRoot, kind)).catch(() => [] as string[])).sort()) {
      const dir = join(contentRoot, kind, slug)
      const vi = await json<Vi>(join(dir, 'vi.json')).catch(() => null)
      if (!vi) continue
      const e = await json<{ source?: string; sections?: { key: string; source: string; html: string }[] }>(join(dir, 'entity.json')).catch(() => ({}) as { source?: string; sections?: undefined })
      const groups: Group[] = []
      if (kind === 'guides') { if (e.source !== 'youtube' && vi.body) groups.push({ source: e.source, parts: [{ id: 'body', vi: vi.body }] }) }
      else if (kind === 'glossary') { if (vi.definition) groups.push({ parts: [{ id: 'definition', vi: vi.definition }] }) }
      else {
        for (const source of [...new Set((e.sections ?? []).map(s => s.source))]) {
          let g: Group = { source, parts: [] }
          for (const s of (e.sections ?? []).filter(x => x.source === source && x.key !== 'references')) {
            const id = `${s.key}:${s.source}`
            if (!vi.sections?.[id]) continue
            if (g.parts.length && g.parts.reduce((n, p) => n + (p.en?.length ?? 0), 0) + s.html.length > CHUNK) { groups.push(g); g = { source, parts: [] } }
            g.parts.push({ id, en: s.html, vi: vi.sections[id]! })
          }
          if (g.parts.length) groups.push(g)
        }
      }
      if (groups.length) out.push({ id: `${kind}/${slug}`, kind, slug, groups })
    }
  }
  return out
}

/**
 * Rewrites existing Vietnamese in the site's style, a few pages per run, never twice. Each group is kept only when the
 * reviewer passes it: against the English (≥ threshold, or better than before), or, with no English, as keeping the
 * old Vietnamese's meaning (≥ threshold). Names, slugs and data never change. Stops on a model failure (usage limit).
 */
export async function rewriteExisting(contentRoot: string, stateFile: string, d: { llm: Llm; opts: RewriteOpts; now: () => Date }, o: { limit: number; kinds?: readonly Kind[] }) {
  const state = await json<RewriteState>(stateFile).catch(() => ({}) as RewriteState)
  const report = { done: [] as string[], kept: [] as string[], failed: [] as string[], stopped: '' }
  for (const job of (await jobs(contentRoot, o.kinds ?? REWRITE_KINDS)).filter(j => !state[j.id])) {
    if (report.done.length + report.kept.length >= o.limit) break
    const file = join(contentRoot, job.kind, job.slug, 'vi.json')
    const vi = await json<Vi>(file)
    const scores: number[] = []
    let rewritten = 0
    try {
      for (const g of job.groups) {
        const next = await rewriteVi(d.llm, g.parts, d.opts)
        const hasEn = g.parts.every(p => p.en)
        const { score } = hasEn
          ? await reviewTranslation(d.llm, g.parts.map(p => ({ en: p.en!, vi: next.get(p.id)! })))
          : await reviewRewrite(d.llm, g.parts.map(p => ({ before: p.vi, after: next.get(p.id)! })))
        scores.push(score)
        const before = (g.source ? vi.quality?.bySource?.[g.source] : undefined) ?? vi.quality?.score ?? 0
        if (!(score >= QUALITY_THRESHOLD || (hasEn && score > before))) continue
        rewritten++
        for (const p of g.parts) {
          if (p.id === 'body') vi.body = next.get(p.id)!
          else if (p.id === 'definition') vi.definition = next.get(p.id)!
          else vi.sections![p.id] = next.get(p.id)!
        }
        // A translation's score is per source; a Vietnamese-only rewrite leaves the page's score as it was.
        if (hasEn && g.source && vi.quality) {
          const bySource = { ...vi.quality.bySource, [g.source]: score }
          const min = Math.min(...Object.values(bySource))
          vi.quality = { score: min, indexable: min >= QUALITY_THRESHOLD, bySource }
        }
      }
    } catch (e) {
      if (e instanceof LlmError) { report.stopped = `${job.id}: ${e.message}`; break }
      state[job.id] = { at: d.now().toISOString().slice(0, 10), rewritten: 0, of: job.groups.length, scores, error: (e as Error).message.slice(0, 200) }
      report.failed.push(`${job.id}: ${(e as Error).message}`)
      continue
    }
    if (rewritten) await writeFile(file, `${JSON.stringify(vi, null, 2)}\n`)
    state[job.id] = { at: d.now().toISOString().slice(0, 10), rewritten, of: job.groups.length, scores }
    ;(rewritten ? report.done : report.kept).push(`${job.id} (${rewritten}/${job.groups.length}, ${scores.map(s => s.toFixed(2)).join(' ')})`)
    await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`)
  }
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`)
  return report
}
