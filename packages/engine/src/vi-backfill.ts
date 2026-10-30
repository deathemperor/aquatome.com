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
type Vi = { sections?: Record<string, string>; body?: string; definition?: string; summary?: string[]; faq?: { q: string; a: string }[]; quality?: { score: number; indexable: boolean; bySource?: Record<string, number> } }
export type RewriteState = Record<string, { at: string; rewritten: number; of: number; scores: number[]; error?: string; v?: number }>
/** Bump when the rewrite or its checks change: pages not fully rewritten under an older version get another try. */
export const REWRITE_V = 2

const CHUNK = 12_000 // English characters per model call
const json = async <T>(f: string): Promise<T> => JSON.parse(await readFile(f, 'utf8'))

/**
 * Each page's text in groups that are reviewed together: one source's sections (chunked), or one Vietnamese-only field.
 * `match`: only pages whose Vietnamese matches, video guides included, and for guides also the summary and FAQ lines that match.
 */
async function jobs(contentRoot: string, kinds: readonly Kind[], match?: RegExp): Promise<Job[]> {
  const out: Job[] = []
  for (const kind of kinds) {
    for (const slug of (await readdir(join(contentRoot, kind)).catch(() => [] as string[])).sort()) {
      const dir = join(contentRoot, kind, slug)
      const vi = await json<Vi>(join(dir, 'vi.json')).catch(() => null)
      if (!vi || (match && !match.test(JSON.stringify([vi.body, vi.sections, vi.definition, vi.summary, vi.faq])))) continue
      const e = await json<{ source?: string; sections?: { key: string; source: string; html: string }[] }>(join(dir, 'entity.json')).catch(() => ({}) as { source?: string; sections?: undefined })
      const groups: Group[] = []
      if (kind === 'guides') {
        if ((match || e.source !== 'youtube') && vi.body && (!match || match.test(vi.body))) groups.push({ ...(e.source !== 'youtube' ? { source: e.source } : {}), parts: [{ id: 'body', vi: vi.body }] })
        const lines = !match ? [] : [
          ...(vi.summary ?? []).map((s, i) => ({ id: `summary:${i}`, vi: s })),
          ...(vi.faq ?? []).flatMap((f, i) => [{ id: `faq:${i}:q`, vi: f.q }, { id: `faq:${i}:a`, vi: f.a }]),
        ].filter(p => match.test(p.vi))
        if (lines.length) groups.push({ parts: lines })
      }
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
export async function rewriteExisting(contentRoot: string, stateFile: string, d: { llm: Llm; opts: RewriteOpts; now: () => Date }, o: { limit: number; kinds?: readonly Kind[]; match?: RegExp }) {
  const state = await json<RewriteState>(stateFile).catch(() => ({}) as RewriteState)
  const report = { done: [] as string[], kept: [] as string[], failed: [] as string[], stopped: '' }
  const names = await json<Record<string, { name: string }>>(join(contentRoot, 'sources.json')).catch(() => ({}) as Record<string, { name: string }>)
  const due = (s: RewriteState[string] | undefined) => !s || (s.rewritten < s.of && (s.v ?? 1) < REWRITE_V)
  // `match` re-edits the pages that contain it (after a style rule changes), whether or not they were rewritten before.
  for (const job of (await jobs(contentRoot, o.kinds ?? REWRITE_KINDS, o.match)).filter(j => o.match || due(state[j.id]))) {
    if (report.done.length + report.kept.length + report.failed.length >= o.limit) break
    const file = join(contentRoot, job.kind, job.slug, 'vi.json')
    const vi = await json<Vi>(file)
    const scores: number[] = []
    let rewritten = 0
    // Per source: its score before this run, and the scores of the chunks kept (a long source is several chunks).
    const orig = (src?: string) => (src ? vi.quality?.bySource?.[src] : undefined) ?? vi.quality?.score ?? 0
    const kept = new Map<string, { scores: number[]; all: boolean }>()
    try {
      for (const g of job.groups) {
        const opts = { ...d.opts, ...(g.source && names[g.source] ? { source: names[g.source]!.name } : {}) }
        const hasEn = g.parts.every(p => p.en)
        const review = (m: Map<string, string>) => hasEn
          ? reviewTranslation(d.llm, g.parts.map(p => ({ en: p.en!, vi: m.get(p.id)! })))
          : reviewRewrite(d.llm, g.parts.map(p => ({ before: p.vi, after: m.get(p.id)! })))
        let next = await rewriteVi(d.llm, g.parts, opts)
        const first = await review(next)
        let score = first.score
        // Below the bar: one more try with the reviewer's notes (as for video guides); the better of the two counts.
        if (score < QUALITY_THRESHOLD) {
          const again = await rewriteVi(d.llm, g.parts, { ...opts, notes: first.notes })
          const r = await review(again)
          if (r.score > score) { next = again; score = r.score }
        }
        scores.push(score)
        const k = kept.get(g.source ?? '') ?? { scores: [], all: true }
        kept.set(g.source ?? '', k)
        if (!(score >= QUALITY_THRESHOLD || (hasEn && score > orig(g.source)))) { k.all = false; continue }
        if (hasEn) k.scores.push(score)
        rewritten++
        for (const p of g.parts) {
          const [field, i, qa] = p.id.split(':') as [string, string?, string?]
          if (p.id === 'body') vi.body = next.get(p.id)!
          else if (p.id === 'definition') vi.definition = next.get(p.id)!
          else if (field === 'summary') vi.summary![Number(i)] = next.get(p.id)!
          else if (field === 'faq') vi.faq![Number(i)]![qa as 'q' | 'a'] = next.get(p.id)!
          else vi.sections![p.id] = next.get(p.id)!
        }
      }
      // A translation's score is per source: the weakest of its chunks, counting the old text where a chunk wasn't kept.
      // A Vietnamese-only rewrite (no English) leaves the page's score as it was.
      if (vi.quality) {
        const bySource = { ...vi.quality.bySource }
        for (const [src, k] of kept) if (src && k.scores.length) bySource[src] = Math.min(...k.scores, ...(k.all ? [] : [orig(src)]))
        if (Object.keys(bySource).length) {
          const min = Math.min(...Object.values(bySource))
          vi.quality = { score: min, indexable: min >= QUALITY_THRESHOLD, bySource }
        }
      }
    } catch (e) {
      if (e instanceof LlmError) { report.stopped = `${job.id}: ${e.message}`; break }
      state[job.id] = { at: d.now().toISOString().slice(0, 10), rewritten: 0, of: job.groups.length, scores, error: (e as Error).message.slice(0, 200), v: REWRITE_V }
      report.failed.push(`${job.id}: ${(e as Error).message}`)
      continue
    }
    if (rewritten) await writeFile(file, `${JSON.stringify(vi, null, 2)}\n`)
    state[job.id] = { at: d.now().toISOString().slice(0, 10), rewritten, of: job.groups.length, scores, v: REWRITE_V }
    ;(rewritten ? report.done : report.kept).push(`${job.id} (${rewritten}/${job.groups.length}, ${scores.map(s => s.toFixed(2)).join(' ')})`)
    await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`)
  }
  await writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`)
  return report
}
