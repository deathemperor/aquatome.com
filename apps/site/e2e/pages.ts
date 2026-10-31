import { readdirSync } from 'node:fs'
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
