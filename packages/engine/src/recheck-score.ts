import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { QUALITY_THRESHOLD, judgeQuality, speciesDepth, type Section } from '@aq/schema'
import { readReviews, type Trace } from './review-log'

/**
 * A translation recheck scores one source's text and, until now, left that score in the review log. Topic guides are
 * the exception that already copy a recheck onto the page, because a guide's score is that one check (review-backfill.ts).
 * A species or plant page is out of search when its lowest source is under the bar, so a passing recheck of a source
 * belongs on that source too. Only when the recheck read the text the page still has: a hash stored with the review,
 * or, for a review logged before hashes, the same text in the commit from before the review. A miss, or a recheck
 * under the bar, leaves the page alone. Applying never lowers a source, and running it again changes nothing.
 */

export type SourcePair = { id: string; en: string; vi: string }

/**
 * The pairs a translation recheck sends the reviewer (review-backfill.ts): one source, references aside, both languages,
 * each with text. The listing, the check and the score's update all read these, so the text a check hashed is the text
 * its score is applied to.
 */
export function sourcePairs(sections: Pick<Section, 'key' | 'source' | 'html'>[], translated: Record<string, string>, source: string): SourcePair[] {
  const out: SourcePair[] = []
  for (const s of sections) {
    if (s.source !== source || s.key === 'references' || !s.html.trim()) continue
    const id = `${s.key}:${s.source}`
    const vi = translated[id]
    if (!vi?.trim()) continue
    out.push({ id, en: s.html, vi })
  }
  return out
}

/** Stable hash of those pairs, so a later run can tell the recheck read this text. */
export function sourceTextHash(pairs: SourcePair[]): string {
  const body = pairs.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map(p => `${p.id}\n${p.en}\n${p.vi}`).join('\n---\n')
  return createHash('sha256').update(body).digest('hex')
}

const git = (root: string, args: string[]): string | null => {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

/** Hash of that source's pairs in the last commit before the review. Null when git can't show it. */
function hashBefore(root: string, kind: string, id: string, source: string, at: string): string | null {
  const rev = git(root, ['rev-list', '-1', `--before=${at}`, 'HEAD'])?.trim()
  if (!rev) return null
  const ent = git(root, ['show', `${rev}:content/${kind}/${id}/entity.json`])
  const vi = git(root, ['show', `${rev}:content/${kind}/${id}/vi.json`])
  if (!ent || !vi) return null
  try {
    const sections = (JSON.parse(ent) as { sections?: Pick<Section, 'key' | 'source' | 'html'>[] }).sections ?? []
    const translated = (JSON.parse(vi) as { sections?: Record<string, string> }).sections ?? {}
    return sourceTextHash(sourcePairs(sections, translated, source))
  } catch {
    return null
  }
}

type Hit = { kind: string; id: string; source: string; score: number; at: string; textHash?: string }

/**
 * Copy each kept translation recheck that clears the bar onto that source, when the page still has the text it read.
 * The page's score becomes the minimum across its sources. A thin species page stays thin. Returns the pages written.
 */
export async function applySourceRechecks(root: string): Promise<string[]> {
  const store = await readReviews(root, 'translation').catch(() => ({} as Record<string, Trace[]>))
  const byPage = new Map<string, Hit[]>()
  for (const [key, ts] of Object.entries(store)) {
    const kept = ts.find(t => t.kept)
    if (!kept || kept.attempt !== 'recheck' || kept.score < QUALITY_THRESHOLD) continue
    const m = /^vi\/(species|plants)\/([^#]+)#([^#]+)$/.exec(key)
    if (!m) continue
    const hit: Hit = { kind: m[1]!, id: m[2]!, source: m[3]!, score: kept.score, at: kept.at, ...(kept.textHash ? { textHash: kept.textHash } : {}) }
    const page = `${hit.kind}/${hit.id}`
    byPage.set(page, [...(byPage.get(page) ?? []), hit])
  }
  const written: string[] = []
  for (const [page, hits] of byPage) {
    const [kind, id] = page.split('/') as [string, string]
    try {
      const viPath = join(root, 'content', kind, id, 'vi.json')
      const ent = JSON.parse(await readFile(join(root, 'content', kind, id, 'entity.json'), 'utf8')) as { sections?: Section[] }
      const vi = JSON.parse(await readFile(viPath, 'utf8')) as { sections?: Record<string, string>; quality?: { score: number; indexable: boolean; bySource?: Record<string, number>; reason?: 'thin' | 'score' } }
      const by = { ...(vi.quality?.bySource ?? {}) }
      let moved = false
      for (const hit of hits) {
        const cur = by[hit.source]
        if (typeof cur !== 'number' || cur >= hit.score) continue
        const pairs = sourcePairs(ent.sections ?? [], vi.sections ?? {}, hit.source)
        if (!pairs.length) continue
        const now = sourceTextHash(pairs)
        const then = hit.textHash ?? hashBefore(root, kind, id, hit.source, hit.at)
        if (!then || then !== now) continue
        by[hit.source] = hit.score
        moved = true
      }
      if (!moved || !vi.quality) continue
      const min = Math.min(...Object.values(by))
      const deep = kind === 'species' ? speciesDepth(ent.sections ?? []).deep : true
      vi.quality = judgeQuality({ ...vi.quality, score: min, indexable: min >= QUALITY_THRESHOLD, bySource: by }, min >= QUALITY_THRESHOLD, deep)
      await writeFile(viPath, `${JSON.stringify(vi, null, 2)}\n`)
      written.push(page)
    } catch { /* a page this run can't read stays as it is */ }
  }
  return written.sort()
}
