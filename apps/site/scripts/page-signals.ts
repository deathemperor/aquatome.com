import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { langOf } from '../src/lib/i18n.ts'
import type { ContentStats, PageKind } from '../worker/admin/content-shape.ts'
import type { PageSignals } from '../worker/admin/quality.ts'
import { lastReview, reviewTraces, SCORED } from './content-stats.ts'

/**
 * dist/_ab/page-signals.json: what the engine knows of each built item page, by its path, for the content page's quality
 * lists (worker/admin/quality.ts): the page's own quality score (content/<dir>/<id>/<lang>.json), the reader-fit checks
 * it fails (engine-state/_fit.json, "words" aside: a wording fault the gate lets through), the reader review's findings
 * (engine-state/_reader.json), its last review's score (engine-state/reviews), whether a person fixed its text by hand
 * (bodyFixed: the engine won't rewrite it), and when the writers last rewrote it (engine-state/rewritten.json). Each is
 * null where the page has none. The state files key a page "<lang>/<dir>/<id>". A page the gate holds back isn't built,
 * so it isn't here.
 */
const read = (f: string): Record<string, any> | undefined => {
  try { return JSON.parse(readFileSync(f, 'utf8')) } catch { return undefined }
}
const findings = (state: Record<string, any> | undefined, key: string): any[] | null => {
  const f = state?.[key]?.findings
  return Array.isArray(f) ? f : null
}
const failed = (f: any[] | null) => (f ? [...new Set(f.map(x => String(x?.check ?? '')).filter(c => c && c !== 'words'))].sort() : null)

export function pageSignals(o: { contentRoot: string; engineState?: string; pages: ContentStats['pages'] }): PageSignals {
  const fit = o.engineState ? read(join(o.engineState, '_fit.json')) : undefined
  const reader = o.engineState ? read(join(o.engineState, '_reader.json')) : undefined
  const rewritten = o.engineState ? read(join(o.engineState, 'rewritten.json')) : undefined
  const traces = reviewTraces(o.engineState)
  const pages: PageSignals['pages'] = {}
  for (const [kind, dir] of Object.entries(SCORED) as [PageKind, string][]) {
    for (const [path, , id] of o.pages?.[kind] ?? []) {
      if (!id) continue
      const lang = langOf(path)
      const key = `${lang}/${dir}/${id}`
      // An equipment guide's other languages are content/equipment/<lang>/<category>.json; the Vietnamese one has no score.
      const t = kind === 'equipment' ? (lang === 'vi' ? undefined : read(join(o.contentRoot, dir, lang, `${id}.json`))) : read(join(o.contentRoot, dir, id, `${lang}.json`))
      const q = Number(t?.quality?.score)
      const ed = lastReview(traces.get(key) ?? [])
      const at = rewritten?.[key]?.at
      pages[path] = [key, Number.isFinite(q) ? q : null, failed(findings(fit, key)), findings(reader, key)?.length ?? null, ed ? ed.score : null, t?.bodyFixed === true, typeof at === 'string' ? at : null]
    }
  }
  return { v: 1, pages }
}
