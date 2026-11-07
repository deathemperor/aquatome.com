import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { loadAll, TraitsSchema, type Traits } from '@aq/schema'
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
export async function extractTraits(contentRoot: string, llm: Llm, opts: { limit: number; now: () => Date; publicBuild?: boolean; only?: string[] }): Promise<{ done: string[]; failed: string[] }> {
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
    const out = Output.safeParse(await llm({ system: 'Reply only with JSON.', prompt: `${TEMPLATE}\n\n---\n\n${profile(s)}`, schema: SCHEMA }).catch(() => null))
    if (!out.success) { failed.push(s.id); continue }
    const fields = due(s.id, s.updatedAt)
    const old = have.get(s.id)
    const read = fields.length ? fields : FIELDS
    const values = Object.fromEntries(FIELDS.map(f => [f, read.includes(f) || !old ? out.data[f] : old[f]])) as Pick<Traits, Field>
    const t: Traits = { id: s.id, ...values, speciesUpdatedAt: s.updatedAt, rules: RULES, generatedAt: opts.now().toISOString() }
    await writeFile(join(dir(contentRoot), `${s.id}.json`), `${JSON.stringify(t, null, 2)}\n`)
    done.push(s.id)
  }
  return { done, failed }
}
