import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

/**
 * Fields a reader never sees: scores, stamps, and notes to the engine itself. The engine rewrites them on runs that
 * change nothing on the page (a merge moves `updatedAt`, a re-score moves `quality`), so they can't date a page.
 * A change to this list changes every file's hash, and the next sweep then dates every page that day.
 */
const BOOKKEEPING = new Set(['updatedAt', 'quality', 'held', 'nameFixed', 'bodyFixed', 'redirectFrom', 'generatedAt', 'builtAt', 'seen', 'speciesUpdatedAt', 'fetched', 'at'])

const canonical = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canonical) // the order of a list is content: the first photo is the page's head
  if (!v || typeof v !== 'object') return v
  return Object.fromEntries(Object.entries(v).filter(([k]) => !BOOKKEEPING.has(k)).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, canonical(x)]))
}

/** What a reader sees in a content file, as a short hash: field order and bookkeeping don't change it. */
export const visibleHash = (json: unknown) => createHash('sha256').update(JSON.stringify(canonical(json))).digest('hex').slice(0, 12)

/** The files pages are made from, by their path in content/. */
export const isPageFile = (rel: string) => /^(?:(?:species|breeds|plants|guides|glossary|products)\/[^/]+\/[^/]+|gallery\/[^/]+|summaries\/[^/]+|equipment\/(?:[^/]+\/)?[^/]+)\.json$/.test(rel)

/**
 * The day each page's content last changed (content/page-dates.json, file → "day hash"), for the sitemap's last-changed
 * dates. A file's day moves only when what a reader sees in it does, so a run that only re-scores or re-stamps leaves it,
 * and a build never dates a page. Days are UTC, so none is in the future for a search engine. It compares the files as
 * they are, so anything a merge brought in is dated by the next sweep.
 */
export async function updatePageDates(contentRoot: string, day = new Date().toISOString().slice(0, 10)) {
  const file = join(contentRoot, 'page-dates.json')
  const old = JSON.parse(await readFile(file, 'utf8').catch(() => '{}')) as Record<string, string>
  const dates: Record<string, string> = {}
  let changed = 0
  for (const rel of (await readdir(contentRoot, { recursive: true })).filter(isPageFile).sort()) {
    const hash = visibleHash(JSON.parse(await readFile(join(contentRoot, rel), 'utf8')))
    dates[rel] = old[rel]?.endsWith(` ${hash}`) ? old[rel] : `${day} ${hash}`
    if (dates[rel] !== old[rel]) changed++
  }
  changed += Object.keys(old).filter(rel => !(rel in dates)).length
  if (changed) await writeFile(file, `${JSON.stringify(dates, null, 2)}\n`)
  return { files: Object.keys(dates).length, changed }
}
