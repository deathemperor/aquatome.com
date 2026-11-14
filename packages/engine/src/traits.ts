import { LlmError } from './claude'
import { errorKind } from './state'
import { piece } from './pieces'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { loadAll, mayPublish, TraitsSchema, type Traits } from '@aq/schema'
import type { Llm } from './claude'
import { profile } from './summaries'

const TEMPLATE = readFileSync(new URL('./prompts/traits.md', import.meta.url), 'utf8')
const FIELDS = ['temperament', 'finNipper', 'schoolMin'] as const
type Field = (typeof FIELDS)[number]
/**
 * Each field's rule, its line in the prompt, hashed: each file records the rules it was read with (`rules`). A field
 * read with another rule is read again, after the pages that changed, and only that field takes the new answer: a
 * temperament the model reads one way or the other from the same text doesn't move because the school rule did. The
 * school rule once let an angelfish's "start with six juveniles to get a pair" read as a school of six (2026-11-07).
 */
export const RULES = Object.fromEntries(FIELDS.map(f => [f, createHash('sha256').update(TEMPLATE.split('\n').find(l => l.startsWith(`- \`${f}\``)) ?? '').digest('hex').slice(0, 12)])) as Record<Field, string>
/**
 * The fields a trait has from a rule other than today's. Read before rules were recorded: its school size, when it has
 * one (that day's rule only takes school sizes away; the other rules are as they were).
 */
export const dueFields = (t: Traits): Field[] => (t.rules ? FIELDS.filter(f => t.rules![f] !== RULES[f]) : t.schoolMin !== null ? ['schoolMin'] : [])
const Output = TraitsSchema.pick({ temperament: true, finNipper: true, schoolMin: true })
const SCHEMA = (() => {
  const s = z.toJSONSchema(Output, { target: 'draft-07' }) as Record<string, unknown>
  delete s.$schema
  return s
})()
const dir = (contentRoot: string) => join(contentRoot, 'traits')

export async function readTraits(contentRoot: string): Promise<Traits[]> {
  const files = await readdir(dir(contentRoot)).catch(() => [] as string[])
  return Promise.all(files.filter(f => f.endsWith('.json')).map(async f => TraitsSchema.parse(JSON.parse(await readFile(join(dir(contentRoot), f), 'utf8')))))
}

/**
 * Extract traits for published species that have none or whose page changed, then the fields read with an older rule
 * (dueFields); at most `limit` per call. `only`: just these species, their fields due, or all when none is.
 */
export async function extractTraits(contentRoot: string, llm: Llm, opts: { limit: number; now: () => Date; publicBuild?: boolean; only?: string[] }): Promise<{ done: string[]; failed: string[]; stopped?: string }> {
  const c = await loadAll({ root: contentRoot, lang: 'vi', publicBuild: opts.publicBuild ?? true })
  const have = new Map((await readTraits(contentRoot)).map(t => [t.id, t]))
  // The fields each species is read for: all of them when it has no traits or its page changed.
  const due = (id: string, updatedAt: string): readonly Field[] => {
    const t = have.get(id)
    return !t || t.speciesUpdatedAt !== updatedAt ? FIELDS : dueFields(t)
  }
  const changed = c.species.filter(s => due(s.id, s.updatedAt) === FIELDS)
  const stale = c.species.filter(s => due(s.id, s.updatedAt) !== FIELDS && due(s.id, s.updatedAt).length)
  const todo = (opts.only ? c.species.filter(s => opts.only!.includes(s.id)) : [...changed, ...stale]).slice(0, opts.limit)
  await mkdir(dir(contentRoot), { recursive: true })
  const done: string[] = []
  const failed: string[] = []
  for (const s of todo) {
    try {
      const out = Output.safeParse(await piece(s.id, () => llm({ system: 'Reply only with JSON.', prompt: `${TEMPLATE}\n\n---\n\n${profile(s)}`, schema: SCHEMA })).catch(err => { if (err instanceof LlmError && errorKind(err.message) === 'usage') throw err; return null }))
      if (!out.success) { failed.push(s.id); continue }
      const fields = due(s.id, s.updatedAt)
      const old = have.get(s.id)
      const read = fields.length ? fields : FIELDS
      const values = Object.fromEntries(FIELDS.map(f => [f, read.includes(f) || !old ? out.data[f] : old[f]])) as Pick<Traits, Field>
      const t: Traits = { id: s.id, ...values, speciesUpdatedAt: s.updatedAt, rules: RULES, generatedAt: opts.now().toISOString() }
      await writeFile(join(dir(contentRoot), `${s.id}.json`), `${JSON.stringify(t, null, 2)}\n`)
      done.push(s.id)
    } catch (err) {
      if (err instanceof LlmError && errorKind(err.message) === 'usage') return { done, failed, stopped: err.message }
      throw err
    }
  }
  return { done, failed }
}

const COUNT: Record<string, number> = { 'half a dozen': 6, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20 }
const N = String.raw`(\d+|${Object.keys(COUNT).join('|')})`
/** Seriously Fish's way of giving the group to keep: "a group of at least 8-10 specimens", "a minimum of 6 individuals". */
const SF_GROUP = new RegExp(String.raw`\b(?:(?:group|shoal|school|colony)s?\s+of\s+|(?=at least|a minimum|a group))(?:at least\s+|a minimum of\s+|no fewer than\s+)?${N}(?:\s*(?:-|–|to|or)\s*${N})?\s*\+?\s*(?:or more\s+)?(?:specimens|individuals)\b`, 'gi')
/** A sentence about breeding, a pair or a harem, fish in the wild, or what a fish only can be kept in: no group it needs. */
const NOT_A_GROUP = /\bpairs?\b|harem|juvenile|spawn|fry|trio|alone|singly|breeding|in nature|in the wild|observed|were found|occurr?(?:s|ing)? in|can be kept|can sometimes/i

/** Sections that say nothing of the group to keep: papers, breeding, the sexes, and the wild ("schools of 30 in the river"). */
const NOT_SCHOOL = ['references', 'reproduction', 'dimorphism', 'habitat', 'distribution']
/**
 * The smallest group Seriously Fish says to keep the fish in, in its own words, or null where it gives none. The card's
 * school size takes it first, as the card's other figures take Seriously Fish's (the chief of staff, 2026-11-11: the
 * cardinal tetra's card said 6, from another source's "at least six", where Seriously Fish says 8-10).
 */
export function sfSchool(sections: { key: string; source: string; html: string }[]): number | null {
  const found: number[] = []
  for (const s of sections) {
    if (s.source !== 'seriouslyfish' || NOT_SCHOOL.includes(s.key)) continue
    for (const sentence of s.html.replace(/<[^>]+>/g, ' ').split(/(?<=[.!?])\s+/)) {
      if (NOT_A_GROUP.test(sentence)) continue
      for (const m of sentence.matchAll(SF_GROUP)) {
        const w = m[1]!.toLowerCase()
        const n = COUNT[w] ?? Number(w)
        if (n >= 2 && n <= 50) found.push(n)
      }
    }
  }
  return found.length ? Math.min(...found) : null
}

/** Another source's minimum in the words such pages use: "groups of 10 specimens or more", "never in groups of fewer than 10–12 individuals", "a school of at least six". */
const OTHER_GROUP = new RegExp(String.raw`\b(?:(?:group|shoal|school|colony)s?\s+of\s+(?:(?:at least|a minimum of|no fewer than|not fewer than|fewer than)\s+${N}(?:\s*(?:-|–|to|or)\s*${N})?(?!\s*(?:cm|mm|in|l|litres?|liters?|gallons?)\b)|${N}(?:\s*(?:-|–|to|or)\s*${N})?\s*\+?\s*(?:or more\s+)?(?:specimens|individuals|fish|or more)\b)|(?:at least|a minimum of|no fewer than)\s+${N}(?:\s*(?:-|–|to)\s*${N})?\s+(?:specimens|individuals|fish)\b)`, 'gi')
type Sec = { key: string; source: string; html: string }
const groups = (sections: Sec[], take: (s: Sec) => boolean, re: RegExp) => sections.filter(s => take(s) && !NOT_SCHOOL.includes(s.key))
  .flatMap(s => s.html.replace(/<[^>]+>/g, ' ').split(/(?<=[.!?])\s+/)).filter(x => !NOT_A_GROUP.test(x))
  .flatMap(x => [...x.matchAll(re)].map(m => { const w = m.slice(1).find(Boolean)!.toLowerCase(); return COUNT[w] ?? Number(w) })).filter(n => n >= 2 && n <= 50)

/**
 * The card's school size: Seriously Fish's (sfSchool), never below the minimum another source the page shows tells the
 * reader (the chief of staff, 2026-11-11: Glaser's "groups of 10 or more" keeps a card at 10 where Seriously Fish says
 * 8-10). Null where Seriously Fish gives none: the card keeps the reading of the page's text.
 */
export function cardSchool(sections: Sec[], shows: (source: string) => boolean): number | null {
  const sf = sfSchool(sections)
  if (sf === null) return null
  // Each source's own minimum ("at least 6, ideally 12 or more" is 6), then the highest of them.
  const others = [...new Set(sections.filter(s => s.source !== 'seriouslyfish' && shows(s.source)).map(s => s.source))]
  const floors = others.map(src => groups(sections, s => s.source === src, OTHER_GROUP)).filter(ns => ns.length).map(ns => Math.min(...ns))
  return Math.max(sf, ...floors)
}

/**
 * Every card whose school size isn't cardSchool's, where Seriously Fish gives one, takes it; no model is asked. A source
 * counts if a public build shows its text. The ids changed.
 */
export async function schoolFromSeriouslyFish(contentRoot: string): Promise<string[]> {
  const sources = JSON.parse(await readFile(join(contentRoot, 'sources.json'), 'utf8')) as Record<string, Parameters<typeof mayPublish>[0]>
  const shows = (s: string) => mayPublish(sources[s], 'text')
  const changed: string[] = []
  for (const t of await readTraits(contentRoot)) {
    const e = JSON.parse(await readFile(join(contentRoot, 'species', t.id, 'entity.json'), 'utf8').catch(() => '{"sections":[]}')) as { sections: Sec[] }
    const n = cardSchool(e.sections, shows)
    if (n === null || n === t.schoolMin) continue
    await writeFile(join(dir(contentRoot), `${t.id}.json`), `${JSON.stringify({ ...t, schoolMin: n }, null, 2)}\n`)
    changed.push(t.id)
  }
  return changed
}
