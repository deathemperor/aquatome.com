import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

/** The built site's folder the local checks read (the same one serve.mjs serves). */
export const DIST = resolve(process.env.E2E_DIST ?? 'dist')

/** Every page in the build, as paths ("/vi/ca/x/"). Redirect stubs (/go/…) are not pages. */
export const allPages = (dist = DIST) =>
  (readdirSync(dist, { recursive: true }) as string[])
    .filter(f => f.endsWith('index.html'))
    .map(f => `/${f.replace(/\\/g, '/').replace(/index\.html$/, '')}`)
    .filter(p => !p.startsWith('/go/'))
    .sort()

/** Checking a live site (E2E_BASE_URL) rather than a local build. */
export const LIVE = !!process.env.E2E_BASE_URL
const readList = (file?: string): string[] => (file && existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as string[]) : [])
/** The pages to choose from: a live site's sitemap (E2E_PAGES, written by scripts/site-watch.mjs), else the local build. */
export const sourcePages = () => (LIVE ? readList(process.env.E2E_PAGES) : allPages())
/** Pages to check whatever the sample: those with an open problem (E2E_RECHECK), until they pass. */
export const recheckPages = () => readList(process.env.E2E_RECHECK)

/** A page's template: language, section and depth ("/vi/ca/x/anh/" → "vi/ca/4"). */
export const templateOf = (path: string) => { const s = path.split('/').filter(Boolean); return `${s[0] ?? ''}/${s[1] ?? ''}/${s.length}` }

/**
 * Pages to check: every page of a small group (a section's index, the fixed tool pages), and `per` pages of each large
 * group, picked by `seed` (0: the first ones; a date rotates through the rest). A new kind of page is covered the day it
 * is built, with no list to update.
 */
export function samplePages(paths: string[], per = 2, seed = Number(process.env.E2E_SEED ?? 0)): string[] {
  const groups = new Map<string, string[]>()
  for (const p of paths) groups.set(templateOf(p), [...(groups.get(templateOf(p)) ?? []), p])
  return [...groups.values()].flatMap(g => (g.length <= 3 ? g : Array.from({ length: per }, (_, i) => g[(seed * per + i) % g.length]!)))
}

/**
 * The first page of each kind in `kinds`, then `extra`: pages measured by name. A kind's first page that is also an extra
 * gives way to the next page of that kind, so no page is listed twice (a test title must be unique).
 */
export const onePerKind = (paths: string[], kinds: string[], extra: string[] = []) =>
  [...kinds.flatMap(k => paths.find(p => templateOf(p) === k && !extra.includes(p)) ?? []), ...extra]

